import type { ZipTreeFolder, ZipTreeNode } from "./zip-worker"

export interface FlatRow {
  node: ZipTreeNode
  depth: number
  isExpanded: boolean
}

/**
 * Flattens the tree into the rows that should actually render, given which
 * folder paths are expanded. This is what the virtualizer's row count is
 * based on — a collapsed folder's subtree contributes exactly one row
 * (itself) regardless of how many thousand files it contains.
 */
export function flattenTree(
  root: ZipTreeFolder,
  expandedPaths: ReadonlySet<string>,
  sort: SortConfig
): FlatRow[] {
  const rows: FlatRow[] = []

  function walk(folder: ZipTreeFolder, depth: number) {
    const children = sortChildren(Object.values(folder.children), sort)
    for (const child of children) {
      const isExpanded = child.kind === "folder" && expandedPaths.has(child.path)
      rows.push({ node: child, depth, isExpanded })
      if (child.kind === "folder" && isExpanded) {
        walk(child, depth + 1)
      }
    }
  }

  walk(root, 0)
  return rows
}

export type SortKey = "name" | "size" | "modified" | "extension"
export interface SortConfig {
  key: SortKey
  direction: "asc" | "desc"
  foldersFirst: boolean
}

export function sortChildren(nodes: ZipTreeNode[], sort: SortConfig): ZipTreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    if (sort.foldersFirst && a.kind !== b.kind) {
      return a.kind === "folder" ? -1 : 1
    }
    let cmp = 0
    switch (sort.key) {
      case "name":
        cmp = a.name.localeCompare(b.name)
        break
      case "size": {
        const aSize = a.kind === "file" ? a.size : a.totalSize
        const bSize = b.kind === "file" ? b.size : b.totalSize
        cmp = aSize - bSize
        break
      }
      case "modified": {
        const aDate = a.kind === "file" ? a.date : a.lastModified
        const bDate = b.kind === "file" ? b.date : b.lastModified
        cmp = (aDate ?? "").localeCompare(bDate ?? "")
        break
      }
      case "extension": {
        const aExt = a.kind === "file" ? a.ext : ""
        const bExt = b.kind === "file" ? b.ext : ""
        cmp = aExt.localeCompare(bExt)
        break
      }
    }
    return sort.direction === "asc" ? cmp : -cmp
  })
  return sorted
}

/** Walks the tree from root following a path's segments, returning each ancestor folder for breadcrumbs. */
export function ancestorsOf(root: ZipTreeFolder, path: string): ZipTreeFolder[] {
  const parts = path.split("/").filter(Boolean)
  const chain: ZipTreeFolder[] = [root]
  let cursor = root
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cursor.children[parts[i]]
    if (!next || next.kind !== "folder") break
    chain.push(next)
    cursor = next
  }
  return chain
}

/** Finds a node by its full path — used to resolve search results back into tree nodes. */
export function findNode(root: ZipTreeFolder, path: string): ZipTreeNode | null {
  const parts = path.split("/").filter(Boolean)
  return findNodeByParts(root, parts)
}

function findNodeByParts(node: ZipTreeFolder, parts: string[]): ZipTreeNode | null {
  if (parts.length === 0) return node
  const [head, ...rest] = parts
  const child: ZipTreeNode | undefined = node.children[head]
  if (!child) return null
  if (rest.length === 0) return child
  if (child.kind !== "folder") return null
  return findNodeByParts(child, rest)
}

/** Returns the set of all ancestor folder paths for a given path — used to auto-expand to a search result. */
export function ancestorPathsOf(path: string): string[] {
  const parts = path.split("/").filter(Boolean)
  const paths: string[] = []
  for (let i = 0; i < parts.length - 1; i++) {
    paths.push(parts.slice(0, i + 1).join("/"))
  }
  return paths
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString()
}
