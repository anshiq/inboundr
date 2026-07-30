import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircleIcon,
  LoaderIcon,
  MaximizeIcon,
  MinimizeIcon,
  PaperclipIcon,
  QuoteIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  EMAIL_ATTACHMENT_ACCEPT,
  EMAIL_ATTACHMENT_MAX_TOTAL_SIZE,
  deleteDraft as deleteDraftRequest,
  formatFileSize,
  replyKindLabel,
  sendDraft,
  updateDraft,
  uploadEmailAttachment,
  type DraftInput,
  type PendingAttachment,
  type ReplyKind,
  type ThreadMessage,
} from "@/lib/email-reply"

const RichTextEditor = lazy(() =>
  import("./rich-text-editor").then((module) => ({ default: module.RichTextEditor }))
)

const AUTOSAVE_DELAY_MS = 1200

interface DraftState {
  to: string
  cc: string
  bcc: string
  subject: string
  bodyHtml: string
  pendingAttachments: PendingAttachment[]
}

function toDraftState(draft: ThreadMessage): DraftState {
  return {
    to: draft.to ?? "",
    cc: draft.cc ?? "",
    bcc: draft.bcc ?? "",
    subject: draft.subject ?? "",
    bodyHtml: draft.bodyHtml ?? "",
    pendingAttachments: draft.pendingAttachments ?? [],
  }
}

function toDraftInput(state: DraftState): DraftInput {
  return {
    to: state.to,
    cc: state.cc,
    bcc: state.bcc,
    subject: state.subject,
    bodyHtml: state.bodyHtml,
    pendingAttachments: state.pendingAttachments,
  }
}

function RecipientField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-3.5 py-1.5">
      <span className="w-9 shrink-0 font-heading text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/50 disabled:opacity-60"
      />
    </div>
  )
}

export function ReplyComposer({
  draft,
  parent,
  signatureHtml,
  onSent,
  onDiscarded,
  onDraftSaved,
  onClose,
}: {
  draft: ThreadMessage
  parent: ThreadMessage
  signatureHtml: string | null
  onSent: (message: ThreadMessage) => void
  onDiscarded: (draftId: string) => void
  onDraftSaved: (message: ThreadMessage) => void
  onClose: () => void
}) {
  const kind: ReplyKind = draft.kind ?? "reply"
  const isForward = kind === "forward"

  const [state, setState] = useState<DraftState>(() => {
    const initial = toDraftState(draft)
    // Seed the signature only into a brand new draft so an edited body is never
    // clobbered when the composer reopens.
    if (!initial.bodyHtml && signatureHtml) {
      initial.bodyHtml = `<p></p>${signatureHtml}`
    }
    return initial
  })
  const [showCc, setShowCc] = useState(Boolean(draft.cc || draft.bcc))
  const [showQuote, setShowQuote] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [sendError, setSendError] = useState<string | null>(draft.sendError ?? null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestState = useRef(state)
  const dirty = useRef(false)

  // Callbacks read the newest values through this ref so they do not have to be
  // recreated on every keystroke.
  useEffect(() => {
    latestState.current = state
  }, [state])

  const originalAttachments = useMemo(
    () => (isForward ? parent.attachments ?? [] : []),
    [isForward, parent.attachments]
  )

  const totalBytes = useMemo(
    () =>
      state.pendingAttachments.reduce((sum, item) => sum + item.size, 0) +
      originalAttachments.reduce((sum, item) => sum + item.size, 0),
    [state.pendingAttachments, originalAttachments]
  )
  const overSizeLimit = totalBytes > EMAIL_ATTACHMENT_MAX_TOTAL_SIZE

  const patch = useCallback((changes: Partial<DraftState>) => {
    dirty.current = true
    setState((current) => ({ ...current, ...changes }))
  }, [])

  const flush = useCallback(async () => {
    if (!dirty.current) return
    dirty.current = false
    setSaving(true)
    try {
      const saved = await updateDraft(draft._id, toDraftInput(latestState.current))
      onDraftSaved(saved)
    } catch (err) {
      dirty.current = true
      console.error("Failed to save draft:", err)
    } finally {
      setSaving(false)
    }
  }, [draft._id, onDraftSaved])

  useEffect(() => {
    if (!dirty.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [state, flush])

  // Persist whatever is pending when the composer unmounts.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (dirty.current) void flush()
    }
  }, [flush])

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return

      setUploading(true)
      try {
        const uploaded: PendingAttachment[] = []
        for (const file of Array.from(files)) {
          try {
            uploaded.push(await uploadEmailAttachment(file))
          } catch (err) {
            toast.error(err instanceof Error ? err.message : `Failed to attach ${file.name}`)
          }
        }
        if (uploaded.length > 0) {
          patch({
            pendingAttachments: [...latestState.current.pendingAttachments, ...uploaded],
          })
        }
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    },
    [patch]
  )

  const removeAttachment = useCallback(
    (key: string) => {
      patch({
        pendingAttachments: latestState.current.pendingAttachments.filter(
          (item) => item.key !== key
        ),
      })
    },
    [patch]
  )

  const handleSend = useCallback(async () => {
    if (sending) return

    if (!state.to.trim()) {
      toast.error("Add at least one recipient before sending")
      return
    }
    if (overSizeLimit) {
      const limitMb = Math.round(EMAIL_ATTACHMENT_MAX_TOTAL_SIZE / 1024 / 1024)
      toast.error(`Attachments must total ${limitMb}MB or less`)
      return
    }

    if (saveTimer.current) clearTimeout(saveTimer.current)
    dirty.current = false
    setSending(true)
    setSendError(null)

    try {
      const sent = await sendDraft(draft._id, toDraftInput(latestState.current))
      toast.success(isForward ? "Message forwarded" : "Reply sent")
      onSent(sent)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send"
      setSendError(message)
      toast.error(message)
    } finally {
      setSending(false)
    }
  }, [draft._id, isForward, onSent, overSizeLimit, sending, state.to])

  const handleDiscard = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    dirty.current = false
    try {
      await deleteDraftRequest(draft._id)
      onDiscarded(draft._id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to discard draft")
    }
  }, [draft._id, onDiscarded])

  const quotedPreview = useMemo(() => {
    if (!showQuote) return null
    const body =
      parent.bodyHtml ??
      `<pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${(parent.bodyText ?? "").replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char] ?? char)}</pre>`
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;font-family:Arial,sans-serif;font-size:12px;color:#444;background:#fff}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${body}</body></html>`
  }, [showQuote, parent.bodyHtml, parent.bodyText])

  const composer = (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-background",
        expanded
          ? "size-full rounded-2xl border border-border/60 shadow-2xl"
          : "border-t border-border/60"
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-surface px-3.5 py-2">
        <div className="flex items-center gap-2">
          <span className="font-heading text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {replyKindLabel(kind)}
          </span>
          {saving && (
            <span className="text-[10px] text-muted-foreground/60">Saving...</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {!isForward && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-7 text-muted-foreground/60 hover:text-foreground",
                    showQuote && "text-foreground"
                  )}
                  onClick={() => setShowQuote((current) => !current)}
                >
                  <QuoteIcon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {showQuote ? "Hide quoted text" : "Show quoted text"}
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground/60 hover:text-foreground"
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? (
                  <MinimizeIcon className="size-3.5" />
                ) : (
                  <MaximizeIcon className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{expanded ? "Collapse" : "Expand"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground/60 hover:text-destructive"
                onClick={handleDiscard}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Discard draft</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground/60 hover:text-foreground"
                onClick={onClose}
              >
                <XIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Close, keeping the draft</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="shrink-0">
        <div className="relative">
          <RecipientField
            label="To"
            value={state.to}
            onChange={(value) => patch({ to: value })}
            placeholder="name@example.com"
            autoFocus={isForward}
            disabled={sending}
          />
          {!showCc && (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              className="absolute right-3 top-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/60 hover:text-foreground"
            >
              Cc / Bcc
            </button>
          )}
        </div>

        {showCc && (
          <>
            <RecipientField
              label="Cc"
              value={state.cc}
              onChange={(value) => patch({ cc: value })}
              disabled={sending}
            />
            <RecipientField
              label="Bcc"
              value={state.bcc}
              onChange={(value) => patch({ bcc: value })}
              disabled={sending}
            />
          </>
        )}

        <RecipientField
          label="Subj"
          value={state.subject}
          onChange={(value) => patch({ subject: value })}
          disabled={sending}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense
          fallback={<div className="m-3 h-24 animate-pulse rounded-md bg-muted/40" />}
        >
          <RichTextEditor
            value={state.bodyHtml}
            onChange={(html) => patch({ bodyHtml: html })}
            disabled={sending}
            autoFocus={!isForward}
            onSubmitShortcut={handleSend}
            className={expanded ? "h-full" : "max-h-64"}
          />
        </Suspense>
      </div>

      {quotedPreview && (
        <div className="shrink-0 border-t border-border/40">
          <iframe
            title="Quoted message"
            className="h-40 w-full border-0 bg-white"
            sandbox="allow-same-origin"
            srcDoc={quotedPreview}
          />
        </div>
      )}

      {(state.pendingAttachments.length > 0 || originalAttachments.length > 0) && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-border/40 px-3.5 py-2">
          {originalAttachments.map((attachment) => (
            <Tooltip key={attachment.attachmentId}>
              <TooltipTrigger asChild>
                <span className="surface-inset inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground">
                  <PaperclipIcon className="size-3" />
                  {attachment.filename}
                  <span className="text-[10px] opacity-50">
                    {formatFileSize(attachment.size)}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">Forwarded from the original message</TooltipContent>
            </Tooltip>
          ))}
          {state.pendingAttachments.map((attachment) => (
            <span
              key={attachment.key}
              className="surface-inset group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground"
            >
              <PaperclipIcon className="size-3" />
              {attachment.filename}
              <span className="text-[10px] opacity-50">{formatFileSize(attachment.size)}</span>
              <button
                type="button"
                onClick={() => removeAttachment(attachment.key)}
                disabled={sending}
                className="ml-0.5 text-muted-foreground/50 hover:text-destructive"
                aria-label={`Remove ${attachment.filename}`}
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {(sendError || overSizeLimit) && (
        <div className="flex shrink-0 items-start gap-2 border-t border-border/40 bg-destructive/5 px-3.5 py-2 text-[11px] text-destructive">
          <AlertCircleIcon className="mt-px size-3.5 shrink-0" />
          <span>
            {overSizeLimit
              ? `Attachments total ${formatFileSize(totalBytes)}, over the ${Math.round(EMAIL_ATTACHMENT_MAX_TOTAL_SIZE / 1024 / 1024)}MB limit.`
              : sendError}
          </span>
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/40 px-3.5 py-2">
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={EMAIL_ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground/60 hover:text-foreground"
                disabled={sending || uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <LoaderIcon className="size-3.5 animate-spin" />
                ) : (
                  <PaperclipIcon className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Attach files</TooltipContent>
          </Tooltip>
          {totalBytes > 0 && (
            <span className="text-[10px] text-muted-foreground/60">
              {formatFileSize(totalBytes)}
            </span>
          )}
        </div>

        <Button size="sm" onClick={handleSend} disabled={sending || overSizeLimit}>
          {sending ? (
            <LoaderIcon className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <SendIcon className="mr-1.5 size-3.5" />
          )}
          {sending ? "Sending" : "Send"}
        </Button>
      </div>
    </div>
  )

  if (!expanded) return composer

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm animate-in fade-in-0 duration-200">
      <div className="flex h-full max-h-[860px] w-full max-w-4xl animate-in zoom-in-95 duration-200">
        {composer}
      </div>
    </div>
  )
}
