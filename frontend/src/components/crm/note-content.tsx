import { useEffect, useMemo, useState } from "react"
import { DownloadIcon, PaperclipIcon } from "lucide-react"
import { toast } from "sonner"

import type { NoteAttachment } from "@/lib/crm"
import { downloadCrmFile, resolveCrmFileUrl } from "@/lib/crm-note-files"
import { formatFileSize } from "@/lib/email-reply"
import { cn } from "@/lib/utils"

/**
 * Stored note HTML references uploaded images by storage key (`data-key`)
 * because signed URLs expire. Rewrite each such image to a freshly resolved
 * URL before rendering. The HTML itself is sanitized server-side on write, so
 * it is safe to inject here.
 */
function useResolvedNoteHtml(html: string): string {
  // Strip stale signed URLs synchronously so expired images never flash broken.
  const initialHtml = useMemo(() => {
    if (!html.includes("data-key")) return html
    const doc = new DOMParser().parseFromString(html, "text/html")
    for (const img of doc.querySelectorAll("img[data-key]")) {
      img.removeAttribute("src")
    }
    return doc.body.innerHTML
  }, [html])

  // Keyed by source html so a changed entry falls back to the stripped
  // version until its own resolution lands, without a synchronous setState.
  const [resolved, setResolved] = useState<{ source: string; html: string } | null>(null)

  useEffect(() => {
    if (!html.includes("data-key")) return

    let cancelled = false
    void (async () => {
      const doc = new DOMParser().parseFromString(html, "text/html")
      const images = Array.from(doc.querySelectorAll("img[data-key]"))
      await Promise.all(
        images.map(async (img) => {
          const key = img.getAttribute("data-key")
          if (!key) return
          try {
            img.setAttribute("src", await resolveCrmFileUrl(key))
          } catch {
            img.removeAttribute("src")
            img.setAttribute("alt", "Image unavailable")
          }
        })
      )
      if (!cancelled) setResolved({ source: html, html: doc.body.innerHTML })
    })()

    return () => {
      cancelled = true
    }
  }, [html])

  return resolved?.source === html ? resolved.html : initialHtml
}

function AttachmentChip({ attachment }: { attachment: NoteAttachment }) {
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      await downloadCrmFile(attachment)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download the file")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      type="button"
      disabled={downloading}
      onClick={() => void handleDownload()}
      className="group inline-flex max-w-64 items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-muted/50 disabled:opacity-60"
      title={`Download ${attachment.name}`}
    >
      <PaperclipIcon className="size-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{attachment.name}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {formatFileSize(attachment.size)}
      </span>
      <DownloadIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

export function NoteContent({
  html,
  attachments = [],
  className,
  imageSize = "default",
}: {
  html: string
  attachments?: NoteAttachment[]
  className?: string
  imageSize?: "default" | "compact" | "full"
}) {
  const resolvedHtml = useResolvedNoteHtml(html)

  return (
    <div className={className}>
      <div
        className={cn(
          "rich-note-content text-sm leading-relaxed",
          imageSize === "compact" && "rich-note-images-compact",
          imageSize === "full" && "rich-note-images-full"
        )}
        // Safe to inject: note HTML is sanitized server-side on write.
        dangerouslySetInnerHTML={{ __html: resolvedHtml }}
      />
      {attachments.length > 0 && (
        <div className={cn("flex flex-wrap gap-1.5", resolvedHtml && "mt-2")}>
          {attachments.map((attachment) => (
            <AttachmentChip key={attachment.key} attachment={attachment} />
          ))}
        </div>
      )}
    </div>
  )
}

export default NoteContent
