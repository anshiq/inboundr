import JSZip from "jszip"
import MiniSearch from "minisearch"

export interface ZipTreeFile {
  kind: "file"
  path: string
  name: string
  size: number
  compressedSize: number
  date: string | null
  ext: string
}

export interface ZipTreeFolder {
  kind: "folder"
  path: string
  name: string
  children: Record<string, ZipTreeNode>
  fileCount: number
  folderCount: number
  totalSize: number
  lastModified: string | null
}

export type ZipTreeNode = ZipTreeFile | ZipTreeFolder

export interface ArchiveSummary {
  totalFiles: number
  totalFolders: number
  totalUncompressedSize: number
  totalCompressedSize: number
}

export type WorkerRequest =
  | { type: "parse"; buffer: ArrayBuffer }
  | { type: "extract"; path: string; requestId: string }
  | { type: "search"; query: string; requestId: string }

export type WorkerResponse =
  | { type: "progress"; processed: number; total: number }
  | { type: "parsed"; tree: ZipTreeFolder; summary: ArchiveSummary }
  | { type: "parse-error"; message: string }
  | { type: "extracted"; requestId: string; path: string; buffer: ArrayBuffer; mime: string }
  | { type: "extract-error"; requestId: string; path: string; message: string }
  | { type: "search-results"; requestId: string; paths: string[] }


let zipInstance: JSZip | null = null
let searchIndex: MiniSearch<{ id: string; path: string; name: string; ext: string }> | null = null

const ctx = self as any

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".")
  if (dot === -1 || dot === name.length - 1) return ""
  return name.slice(dot + 1).toLowerCase()
}

function guessMime(name: string): string {
  const ext = extensionOf(name)
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
    pdf: "application/pdf",
    json: "application/json",
    md: "text/markdown", markdown: "text/markdown",
    txt: "text/plain", csv: "text/csv",
    html: "text/html", htm: "text/html", css: "text/css",
    js: "text/javascript", mjs: "text/javascript", jsx: "text/javascript",
    ts: "text/typescript", tsx: "text/typescript",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  }
  return map[ext] ?? "application/octet-stream"
}

/**
 * Inserts a single zip entry into the nested tree, creating intermediate
 * folder nodes as needed. Runs once per entry during parse; the resulting
 * tree is what gets flattened for virtualization on the main thread, so
 * lazy expansion later requires no re-walking of the archive.
 */
function insertIntoTree(root: ZipTreeFolder, relativePath: string, file: JSZip.JSZipObject) {
  const parts = relativePath.split("/").filter(Boolean)
  let cursor = root
  const isDir = file.dir

  parts.forEach((part, i) => {
    const isLastPart = i === parts.length - 1
    const pathSoFar = parts.slice(0, i + 1).join("/")

    if (isLastPart && !isDir) {
      const size = (file as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data
      cursor.children[part] = {
        kind: "file",
        path: pathSoFar,
        name: part,
        size: size?.uncompressedSize ?? 0,
        compressedSize: size?.compressedSize ?? 0,
        date: file.date ? file.date.toISOString() : null,
        ext: extensionOf(part),
      }
      return
    }

    const existing = cursor.children[part]
    if (existing && existing.kind === "folder") {
      cursor = existing
      return
    }
    const created: ZipTreeFolder = {
      kind: "folder",
      path: pathSoFar,
      name: part,
      children: {},
      fileCount: 0,
      folderCount: 0,
      totalSize: 0,
      lastModified: null,
    }
    cursor.children[part] = created
    cursor = created
  })
}

/** Post-order pass to fill in folder aggregate stats from their now-complete subtrees. */
function computeFolderStats(node: ZipTreeFolder): { files: number; folders: number; size: number; latest: string | null } {
  let files = 0
  let folders = 0
  let size = 0
  let latest: string | null = null

  for (const child of Object.values(node.children)) {
    if (child.kind === "file") {
      files += 1
      size += child.size
      if (child.date && (!latest || child.date > latest)) latest = child.date
    } else {
      const sub = computeFolderStats(child)
      files += sub.files
      folders += 1 + sub.folders
      size += sub.size
      if (sub.latest && (!latest || sub.latest > latest)) latest = sub.latest
    }
  }

  node.fileCount = files
  node.folderCount = folders
  node.totalSize = size
  node.lastModified = latest
  return { files, folders, size, latest }
}

/** Flattens the tree into search documents (files only — folders aren't preview targets). */
function collectSearchDocs(
  node: ZipTreeFolder,
  out: { id: string; path: string; name: string; ext: string }[]
) {
  for (const child of Object.values(node.children)) {
    if (child.kind === "file") {
      out.push({ id: child.path, path: child.path, name: child.name, ext: child.ext })
    } else {
      collectSearchDocs(child, out)
    }
  }
}

async function handleParse(buffer: ArrayBuffer) {
  try {
    zipInstance = await JSZip.loadAsync(buffer)

    const root: ZipTreeFolder = {
      kind: "folder", path: "", name: "", children: {},
      fileCount: 0, folderCount: 0, totalSize: 0, lastModified: null,
    }

    const allFiles = Object.keys(zipInstance.files)
    const total = allFiles.length
    const BATCH_SIZE = 500


    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, i + BATCH_SIZE)
      for (const relativePath of batch) {
        const file = zipInstance.files[relativePath]
        insertIntoTree(root, relativePath, file)
      }
      const processed = Math.min(i + BATCH_SIZE, total)
      ;(ctx.postMessage as (msg: WorkerResponse) => void)({ type: "progress", processed, total })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    computeFolderStats(root)

    const docs: { id: string; path: string; name: string; ext: string }[] = []
    collectSearchDocs(root, docs)
    searchIndex = new MiniSearch({
      fields: ["path", "name"],
      storeFields: ["path"],
      searchOptions: { prefix: true, fuzzy: 0.2, boost: { name: 2 } },
    })
    searchIndex.addAll(docs)

    let totalCompressed = 0
    for (const relativePath of allFiles) {
      const f = zipInstance.files[relativePath]
      const size = (f as unknown as { _data?: { compressedSize?: number } })._data
      totalCompressed += size?.compressedSize ?? 0
    }

    const summary: ArchiveSummary = {
      totalFiles: root.fileCount,
      totalFolders: root.folderCount,
      totalUncompressedSize: root.totalSize,
      totalCompressedSize: totalCompressed,
    }

    ;(ctx.postMessage as (msg: WorkerResponse) => void)({ type: "parsed", tree: root, summary })
  } catch (err) {
    ;(ctx.postMessage as (msg: WorkerResponse) => void)({
      type: "parse-error",
      message: err instanceof Error ? err.message : "Invalid or corrupted zip archive",
    })
  }
}

async function handleExtract(path: string, requestId: string) {
  if (!zipInstance) {
    ;(ctx.postMessage as (msg: WorkerResponse) => void)({
      type: "extract-error", requestId, path, message: "Archive is not loaded",
    })
    return
  }
  try {
    const file = zipInstance.file(path)
    if (!file) throw new Error("File not found in archive")
    const arrayBuffer = await file.async("arraybuffer")
    const mime = guessMime(path)
    ;(ctx.postMessage as (msg: WorkerResponse, transfer: Transferable[]) => void)(
      { type: "extracted", requestId, path, buffer: arrayBuffer, mime },
      [arrayBuffer]
    )
  } catch (err) {
    ;(ctx.postMessage as (msg: WorkerResponse) => void)({
      type: "extract-error", requestId, path,
      message: err instanceof Error ? err.message : "Failed to extract file",
    })
  }
}

function handleSearch(query: string, requestId: string) {
  if (!searchIndex || !query.trim()) {
    ;(ctx.postMessage as (msg: WorkerResponse) => void)({ type: "search-results", requestId, paths: [] })
    return
  }
  const results = searchIndex.search(query)
  const paths = results.slice(0, 500).map((r) => r.id as string)
  ;(ctx.postMessage as (msg: WorkerResponse) => void)({ type: "search-results", requestId, paths })
}

ctx.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  if (msg.type === "parse") void handleParse(msg.buffer)
  else if (msg.type === "extract") void handleExtract(msg.path, msg.requestId)
  else if (msg.type === "search") handleSearch(msg.query, msg.requestId)
})
