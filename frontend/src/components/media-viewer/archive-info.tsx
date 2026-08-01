import { formatBytes } from "./tree-utils"
import type { ArchiveSummary } from "./zip-worker"

export function ArchiveInfoStrip({ summary, archiveName }: { summary: ArchiveSummary; archiveName: string }) {
  const ratio =
    summary.totalUncompressedSize > 0
      ? Math.round((1 - summary.totalCompressedSize / summary.totalUncompressedSize) * 100)
      : 0

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground">
      <span className="font-medium text-foreground/80 truncate max-w-[40%]" title={archiveName}>
        {archiveName}
      </span>
      <span>{summary.totalFiles.toLocaleString()} files</span>
      <span>{summary.totalFolders.toLocaleString()} folders</span>
      <span>{formatBytes(summary.totalUncompressedSize)} uncompressed</span>
      <span className="hidden sm:inline">{ratio}% compression</span>
    </div>
  )
}

export function ParsingProgress({ processed, total }: { processed: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6" role="status" aria-live="polite">
      <p className="text-sm font-medium text-foreground">Reading archive…</p>
      <div className="w-full max-w-xs h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {total > 0 ? `${processed.toLocaleString()} / ${total.toLocaleString()} files` : "Starting…"}
      </p>
    </div>
  )
}
