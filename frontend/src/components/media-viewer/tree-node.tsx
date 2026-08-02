import { memo } from "react"
import { Download, Eye, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatBytes, formatDate, type FlatRow } from "@/lib/drive"
import { iconForFile, iconForFolder } from "./file-icons"

interface TreeNodeRowProps {
  row: FlatRow
  isSelected: boolean
  isDownloading: boolean
  onToggleFolder: (path: string) => void
  onOpenFile: (path: string) => void
  onDownloadFile: (path: string) => void
  onSelect: (path: string) => void
  style: React.CSSProperties
}

function TreeNodeRowImpl({
  row,
  isSelected,
  isDownloading,
  onToggleFolder,
  onOpenFile,
  onDownloadFile,
  onSelect,
  style,
}: TreeNodeRowProps) {
  const { node, depth, isExpanded } = row
  const indent = 12 + depth * 16

  if (node.kind === "folder") {
    const { Icon, className } = iconForFolder(isExpanded)
    return (
      <div
        style={style}
        role="treeitem"
        aria-expanded={isExpanded}
        aria-selected={isSelected}
        tabIndex={-1}
        data-row-path={node.path}
        className={cn(
          "group flex items-center gap-1.5 pr-3 text-sm cursor-pointer select-none",
          "hover:bg-muted/60 transition-colors",
          isSelected && "bg-accent/70"
        )}
        onClick={() => {
          onSelect(node.path)
          onToggleFolder(node.path)
        }}
      >
        <span style={{ paddingLeft: indent }} className="flex items-center gap-1.5 min-w-0 flex-1 py-1.5">
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
              isExpanded && "rotate-90"
            )}
          />
          <Icon className={cn("h-4 w-4 shrink-0", className)} />
          <span className="truncate font-medium text-foreground">{node.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground/70 tabular-nums">
            {node.fileCount} {node.fileCount === 1 ? "file" : "files"}
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums w-16 text-right hidden sm:inline">
          {formatBytes(node.totalSize)}
        </span>
      </div>
    )
  }

  const { Icon, className } = iconForFile(node.ext, node.name)
  return (
    <div
      style={style}
      role="treeitem"
      aria-selected={isSelected}
      tabIndex={-1}
      data-row-path={node.path}
      className={cn(
        "group flex items-center gap-1.5 pr-1.5 text-sm cursor-pointer select-none",
        "hover:bg-muted/60 transition-colors",
        isSelected && "bg-accent/70"
      )}
      onClick={() => onSelect(node.path)}
      onDoubleClick={() => onOpenFile(node.path)}
    >
      <span style={{ paddingLeft: indent + 18 }} className="flex items-center gap-1.5 min-w-0 flex-1 py-1.5">
        <Icon className={cn("h-4 w-4 shrink-0", className)} />
        <span className="truncate text-foreground/90">{node.name}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums w-14 text-right hidden sm:inline">
        {formatBytes(node.size)}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums w-20 text-right hidden md:inline">
        {formatDate(node.date)}
      </span>
      <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenFile(node.path) }}
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground"
          title="Preview"
          aria-label={`Preview ${node.name}`}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDownloadFile(node.path) }}
          disabled={isDownloading}
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground disabled:opacity-40"
          title="Download"
          aria-label={`Download ${node.name}`}
        >
          <Download className={cn("h-3.5 w-3.5", isDownloading && "animate-bounce")} />
        </button>
      </span>
    </div>
  )
}

// Custom comparator: `style` is a new object every render from the
// virtualizer, but only its actual position values matter for re-render
// decisions — comparing the rest of the props by reference is sufficient
// since row/selection/downloading state are the only things that change
// row-to-row.
function propsAreEqual(prev: TreeNodeRowProps, next: TreeNodeRowProps) {
  return (
    prev.row.node.path === next.row.node.path &&
    prev.row.isExpanded === next.row.isExpanded &&
    prev.row.depth === next.row.depth &&
    prev.isSelected === next.isSelected &&
    prev.isDownloading === next.isDownloading &&
    prev.onToggleFolder === next.onToggleFolder &&
    prev.onOpenFile === next.onOpenFile &&
    prev.onDownloadFile === next.onDownloadFile &&
    prev.onSelect === next.onSelect &&
    prev.style.transform === next.style.transform &&
    prev.style.height === next.style.height
  )
}

export const TreeNodeRow = memo(TreeNodeRowImpl, propsAreEqual)
