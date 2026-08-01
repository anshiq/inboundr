import { createElement, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  Download, ExternalLink, Search, ArrowLeft, AlertTriangle, ChevronRight,
  ChevronsDown, ChevronsUp, ArrowUpDown, X,
} from "lucide-react"
import { ToolbarButton, ToolbarLink, ViewerErrorState } from "./viewer-toolbar"
import { cn } from "@/lib/utils"
import { downloadFile, getComponentForMimeType } from "./viewer-utils"
import { useZipWorker } from "./use-zip-worker"
import { flattenTree, ancestorsOf, ancestorPathsOf, findNode, formatBytes, type SortConfig, type SortKey } from "./tree-utils"
import { TreeNodeRow } from "./tree-node"
import { ArchiveInfoStrip, ParsingProgress } from "./archive-info"
import { iconForFile } from "./file-icons"
import type { ZipTreeFile, ZipTreeFolder } from "./zip-worker"

interface ZipViewerProps {
  url: string
  name: string
}

// Files above this size are still downloadable, but preview is skipped —
// decoding a huge binary into a blob URL just to render it (or fail to)
// is the one operation in this component that can still hang a tab, so
// it gets a hard guard rather than a "best effort" attempt.
const PREVIEW_SIZE_LIMIT = 25 * 1024 * 1024 // 25 MB

const ROW_HEIGHT = 30

export default function ZipViewer({ url, name }: ZipViewerProps) {
  const [reloadKey, setReloadKey] = useState(0)
  const { status, errorMessage, progress, tree, summary, extractFile, search } = useZipWorker(url, reloadKey)

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [sort, setSort] = useState<SortConfig>({ key: "name", direction: "asc", foldersFirst: true })

  const [searchInput, setSearchInput] = useState("")
  const deferredSearch = useDeferredValue(searchInput)
  const [searchMatches, setSearchMatches] = useState<Set<string> | null>(null)

  const [downloadingPath, setDownloadingPath] = useState<string | null>(null)

  const [previewFile, setPreviewFile] = useState<ZipTreeFile | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewStatus, setPreviewStatus] = useState<"loading" | "ready" | "error" | "too-large">("loading")
  const [previewErrorMsg, setPreviewErrorMsg] = useState<string | null>(null)

  const scrollParentRef = useRef<HTMLDivElement>(null)

  // Reset transient view state whenever a new archive loads.
  useEffect(() => {
    if (status === "ready") {
      setExpandedPaths(new Set())
      setSelectedPath(null)
      setSearchInput("")
      setSearchMatches(null)
      setPreviewFile(null)
      setPreviewUrl(null)
    }
  }, [status])

  // Debounced search against the worker's MiniSearch index. useDeferredValue
  // already smooths typing; the worker round-trip is the remaining async
  // step, guarded against races by only accepting the response matching the
  // latest input.
  useEffect(() => {
    if (!deferredSearch.trim()) {
      setSearchMatches(null)
      return
    }
    let cancelled = false
    search(deferredSearch).then((paths) => {
      if (cancelled) return
      setSearchMatches(new Set(paths))
      // Auto-expand ancestors of matches so results are actually visible in the tree.
      setExpandedPaths((prev) => {
        const next = new Set(prev)
        for (const p of paths) {
          for (const ancestor of ancestorPathsOf(p)) next.add(ancestor)
        }
        return next
      })
    })
    return () => { cancelled = true }
  }, [deferredSearch, search])

  const visibleTree = useMemo(() => {
    if (!tree) return null
    if (!searchMatches) return tree
    // Filtering view: prune the tree to only branches containing a match,
    // rather than re-flattening the whole archive — keeps this cheap even
    // on 100k-entry trees since most subtrees short-circuit immediately.
    return pruneToMatches(tree, searchMatches)
  }, [tree, searchMatches])

  const flatRows = useMemo(() => {
    if (!visibleTree) return []
    return flattenTree(visibleTree, expandedPaths, sort)
  }, [visibleTree, expandedPaths, sort])

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const toggleFolder = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    if (!tree) return
    const all = new Set<string>()
    function walk(node: ZipTreeFolder) {
      for (const child of Object.values(node.children)) {
        if (child.kind === "folder") {
          all.add(child.path)
          walk(child)
        }
      }
    }
    walk(tree)
    setExpandedPaths(all)
  }, [tree])

  const collapseAll = useCallback(() => setExpandedPaths(new Set()), [])

  const openPreview = useCallback(async (path: string) => {
    if (!tree) return
    const node = findNode(tree, path)
    if (!node || node.kind !== "file") return

    setPreviewFile(node)
    setPreviewUrl(null)
    setPreviewErrorMsg(null)

    if (node.size > PREVIEW_SIZE_LIMIT) {
      setPreviewStatus("too-large")
      return
    }

    setPreviewStatus("loading")
    const result = await extractFile(path)
    if ("error" in result) {
      setPreviewErrorMsg(result.error)
      setPreviewStatus("error")
      return
    }
    setPreviewUrl(result.url)
    setPreviewStatus("ready")
  }, [tree, extractFile])

  const closePreview = useCallback(() => {
    setPreviewFile(null)
    setPreviewUrl(null)
  }, [])

  const downloadEntry = useCallback(async (path: string) => {
    if (downloadingPath) return
    const node = tree ? findNode(tree, path) : null
    if (!node || node.kind !== "file") return
    setDownloadingPath(path)
    try {
      const result = await extractFile(path)
      if ("error" in result) {
        console.error("Error extracting file from ZIP:", result.error)
        return
      }
      downloadFile(result.url, node.name)
    } finally {
      setDownloadingPath(null)
    }
  }, [tree, extractFile, downloadingPath])

  // Keyboard navigation across the flattened, virtualized rows.
  const handleTreeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!flatRows.length) return
    const currentIndex = selectedPath ? flatRows.findIndex((r) => r.node.path === selectedPath) : -1

    const moveTo = (index: number) => {
      const clamped = Math.max(0, Math.min(flatRows.length - 1, index))
      const row = flatRows[clamped]
      setSelectedPath(row.node.path)
      rowVirtualizer.scrollToIndex(clamped, { align: "auto" })
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        moveTo(currentIndex + 1)
        break
      case "ArrowUp":
        e.preventDefault()
        moveTo(currentIndex - 1)
        break
      case "ArrowRight": {
        if (currentIndex < 0) break
        const row = flatRows[currentIndex]
        if (row.node.kind === "folder" && !expandedPaths.has(row.node.path)) {
          e.preventDefault()
          toggleFolder(row.node.path)
        }
        break
      }
      case "ArrowLeft": {
        if (currentIndex < 0) break
        const row = flatRows[currentIndex]
        if (row.node.kind === "folder" && expandedPaths.has(row.node.path)) {
          e.preventDefault()
          toggleFolder(row.node.path)
        }
        break
      }
      case "Enter":
      case " ": {
        if (currentIndex < 0) break
        e.preventDefault()
        const row = flatRows[currentIndex]
        if (row.node.kind === "folder") toggleFolder(row.node.path)
        else openPreview(row.node.path)
        break
      }
    }
  }, [flatRows, selectedPath, expandedPaths, toggleFolder, openPreview, rowVirtualizer])

  const breadcrumbs = useMemo(() => {
    if (!tree || !selectedPath) return []
    return ancestorsOf(tree, selectedPath)
  }, [tree, selectedPath])

  const cycleSortKey = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { ...prev, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { ...prev, key, direction: "asc" }
    )
  }, [])

  // ── Preview pane ────────────────────────────────────────────────────────
  if (previewFile) {
    const previewComponent = previewUrl ? getComponentForMimeType("", previewFile.name) : null
    return (
      <div className="flex h-[70svh] flex-col overflow-hidden rounded-lg border bg-background">
        <div className="flex items-center justify-between gap-2 border-b bg-background px-3 py-1.5">
          <button
            type="button"
            onClick={closePreview}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Archive
          </button>
          <span className="truncate text-sm font-medium text-foreground/90 max-w-xs" title={previewFile.path}>
            {previewFile.path}
          </span>
          <ToolbarButton onClick={() => downloadEntry(previewFile.path)} label="Download this file">
            <Download className="h-4 w-4" />
          </ToolbarButton>
        </div>

        <div className="relative flex-1 overflow-hidden bg-muted/40">
          {previewStatus === "loading" && (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            </div>
          )}
          {previewStatus === "too-large" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-6">
              <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">File too large to preview</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {formatBytes(previewFile.size)} exceeds the {formatBytes(PREVIEW_SIZE_LIMIT)} preview limit. You can still download it directly.
              </p>
              <button
                type="button"
                onClick={() => downloadEntry(previewFile.path)}
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Download className="h-4 w-4" />
                Download {previewFile.name}
              </button>
            </div>
          )}
          {previewStatus === "error" && (
            <ViewerErrorState message={previewErrorMsg ?? "Couldn't extract this file"} onRetry={() => openPreview(previewFile.path)} />
          )}
          {previewStatus === "ready" && previewUrl && (
            previewComponent ? (
              <div className="absolute inset-0">
                {createElement(previewComponent, { url: previewUrl, name: previewFile.name })}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">No Preview Available for This File Type</p>
                <button
                  type="button"
                  onClick={() => downloadEntry(previewFile.path)}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <Download className="h-4 w-4" />
                  Download {previewFile.name}
                </button>
              </div>
            )
          )}
        </div>
      </div>
    )
  }

  // ── Explorer ────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[70svh] flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center justify-between gap-2 border-b bg-background px-3 py-1.5">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {status === "ready" && (
            <>
              <div className="relative flex items-center flex-1 max-w-sm">
                <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search files in archive…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="h-7 w-full rounded-md border bg-background pl-8 pr-7 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Search files in archive"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    className="absolute right-1.5 inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="hidden sm:flex items-center gap-0.5 pl-1">
                <ToolbarButton onClick={expandAll} label="Expand all">
                  <ChevronsDown className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton onClick={collapseAll} label="Collapse all">
                  <ChevronsUp className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => cycleSortKey(sort.key === "name" ? "size" : "name")} label={`Sort by ${sort.key} (${sort.direction})`}>
                  <ArrowUpDown className="h-4 w-4" />
                </ToolbarButton>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={() => downloadFile(url, name)} label="Download full zip">
            <Download className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarLink href={url} label="Open in new tab">
            <ExternalLink className="h-4 w-4" />
          </ToolbarLink>
        </div>
      </div>

      {status === "ready" && summary && <ArchiveInfoStrip summary={summary} archiveName={name} />}

      {status === "ready" && breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1 border-b bg-background px-3 py-1 text-xs overflow-x-auto">
          <button type="button" onClick={() => setSelectedPath(null)} className="text-muted-foreground hover:text-foreground shrink-0">
            Home
          </button>
          {breadcrumbs.slice(1).map((folder) => (
            <span key={folder.path} className="flex items-center gap-1 shrink-0">
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              <button
                type="button"
                onClick={() => setSelectedPath(folder.path)}
                className="text-muted-foreground hover:text-foreground truncate max-w-[10rem]"
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative flex-1 overflow-hidden bg-background">
        {status === "loading" && (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          </div>
        )}
        {status === "parsing" && <ParsingProgress processed={progress.processed} total={progress.total} />}
        {status === "error" && <ViewerErrorState message={errorMessage} onRetry={() => setReloadKey((k) => k + 1)} />}

        {status === "ready" && (
          flatRows.length > 0 ? (
            <div
              ref={scrollParentRef}
              className="h-full overflow-auto"
              role="tree"
              aria-label="Archive file explorer"
              tabIndex={0}
              onKeyDown={handleTreeKeyDown}
            >
              <div style={{ height: rowVirtualizer.getTotalSize(), width: "100%", position: "relative" }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = flatRows[virtualRow.index]
                  return (
                    <TreeNodeRow
                      key={row.node.path}
                      row={row}
                      isSelected={selectedPath === row.node.path}
                      isDownloading={downloadingPath === row.node.path}
                      onToggleFolder={toggleFolder}
                      onOpenFile={openPreview}
                      onDownloadFile={downloadEntry}
                      onSelect={setSelectedPath}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
              {iconForEmptyState(!!searchMatches)}
              <div>
                <p className="font-semibold text-sm">
                  {searchMatches ? "No Files Matched Your Search" : "This Archive Is Empty"}
                </p>
                {searchMatches && <p className="text-xs text-muted-foreground/80">Try adjusting your filter or query</p>}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}

function iconForEmptyState(isSearch: boolean) {
  const { Icon, className } = iconForFile(isSearch ? "" : "", "")
  return <Icon className={cn("h-8 w-8", className, "opacity-40")} />
}

/**
 * Returns a new tree containing only folders/files whose path is in
 * `matches`, or that are an ancestor of a match. Runs once per debounced
 * search input, not per keystroke, and only walks branches that could
 * possibly contain a match rather than the whole tree unconditionally.
 */
function pruneToMatches<T extends { kind: "folder"; path: string; children: Record<string, any> }>(
  node: T,
  matches: ReadonlySet<string>
): T {
  const prunedChildren: Record<string, any> = {}
  for (const [key, child] of Object.entries(node.children)) {
    if (child.kind === "file") {
      if (matches.has(child.path)) prunedChildren[key] = child
    } else {
      const prunedChild = pruneToMatches(child, matches)
      if (Object.keys(prunedChild.children).length > 0) prunedChildren[key] = prunedChild
    }
  }
  return { ...node, children: prunedChildren }
}
