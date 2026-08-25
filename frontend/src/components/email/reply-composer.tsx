import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircleIcon,
  ChevronDownIcon,
  FileTextIcon,
  LoaderIcon,
  MaximizeIcon,
  MinimizeIcon,
  PaperclipIcon,
  QuoteIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmojiPicker } from "@/components/support/emoji-picker"
import { RecipientChips } from "./recipient-chips"
import { cn } from "@/lib/utils"
import {
  EMAIL_ATTACHMENT_ACCEPT,
  EMAIL_ATTACHMENT_MAX_TOTAL_SIZE,
  deleteDraft as deleteDraftRequest,
  formatFileSize,
  generateReply,
  replyKindLabel,
  sendDraft,
  updateDraft,
  uploadEmailAttachment,
  type DraftInput,
  type PendingAttachment,
  type ReplyKind,
  type ThreadMessage,
} from "@/lib/email-reply"
import type { RichTextEditorApi } from "./rich-text-editor"

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

function htmlToPlainText(html: string): string {
  const container = document.createElement("div")
  container.innerHTML = html
  return (container.textContent ?? "").trim()
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

function HeaderButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-label={label}
          className={cn("size-7 text-muted-foreground/60 hover:text-foreground", className)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

export function ReplyComposer({
  draft,
  parent,
  fromAddress,
  signatureHtml,
  onSent,
  onDiscarded,
  onDraftSaved,
  onClose,
}: {
  draft: ThreadMessage
  parent: ThreadMessage
  fromAddress: string | null
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
  const [showCc, setShowCc] = useState(Boolean(draft.cc))
  const [showBcc, setShowBcc] = useState(Boolean(draft.bcc))
  const [showQuote, setShowQuote] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [sendError, setSendError] = useState<string | null>(draft.sendError ?? null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestState = useRef(state)
  const dirty = useRef(false)
  const editorApi = useRef<RichTextEditorApi | null>(null)

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

  const handleSend = useCallback(
    async (archive = false) => {
      if (sending) return

      if (!latestState.current.to.trim()) {
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
        const sent = await sendDraft(draft._id, toDraftInput(latestState.current), { archive })
        toast.success(isForward ? "Message forwarded" : "Reply sent")
        // The send succeeded even if archiving did not, so this is a warning
        // rather than a failure.
        if (sent.archiveError) {
          toast.warning(`Sent, but the conversation stayed in the inbox: ${sent.archiveError}`)
        }
        onSent(sent)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send"
        setSendError(message)
        toast.error(message)
      } finally {
        setSending(false)
      }
    },
    [draft._id, isForward, onSent, overSizeLimit, sending]
  )

  const handleGenerate = useCallback(async () => {
    if (generating) return

    // Anything the user already typed becomes guidance for the AI rather than
    // being silently discarded, and the signature block always survives.
    const body = latestState.current.bodyHtml
    let userContent = body
    let signature = ""
    if (signatureHtml) {
      const index = body.indexOf(signatureHtml)
      if (index >= 0) {
        userContent = body.slice(0, index)
        signature = body.slice(index)
      } else {
        // The editor may have re-serialized the signature markup; fall back to
        // re-appending the canonical signature after the generated reply.
        signature = signatureHtml
      }
    }

    setGenerating(true)
    try {
      const guidance = htmlToPlainText(userContent)
      const { bodyHtml } = await generateReply(draft._id, guidance || undefined)
      patch({ bodyHtml: `${bodyHtml}${signature}` })
      // Defer until after the editor re-enables so focus lands in the new text.
      requestAnimationFrame(() => editorApi.current?.focus())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate a reply")
    } finally {
      setGenerating(false)
    }
  }, [draft._id, generating, patch, signatureHtml])

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

  // The page's shortcut handler ignores events from inputs, so Escape from a
  // focused recipient field or the editor needs handling here.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const quotedPreview = useMemo(() => {
    if (!showQuote) return null
    const body =
      parent.bodyHtml ??
      `<pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${(parent.bodyText ?? "").replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char] ?? char)}</pre>`
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;font-family:Arial,sans-serif;font-size:12px;color:#444;background:#fff}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${body}</body></html>`
  }, [showQuote, parent.bodyHtml, parent.bodyText])

  const attachmentTray =
    state.pendingAttachments.length > 0 || originalAttachments.length > 0 ? (
      <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-border/40 px-4 py-2">
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
            className="surface-inset inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground"
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
    ) : null

  const editorFooter = (
    <>
      {quotedPreview && (
        <div className="shrink-0 border-t border-border/40">
          <iframe
            title="Quoted message"
            className="h-36 w-full border-0 bg-white"
            sandbox="allow-same-origin"
            srcDoc={quotedPreview}
          />
        </div>
      )}
      {attachmentTray}
    </>
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${replyKindLabel(kind)} composer`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm animate-in fade-in-0 duration-150"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={cn(
          "flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl animate-in zoom-in-95 duration-150",
          expanded ? "h-full max-w-4xl" : "max-w-[600px]"
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-surface px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <FileTextIcon className="size-4 shrink-0 text-muted-foreground/70" />
            <span className="text-[13px] font-medium">{replyKindLabel(kind)}</span>
            <span className="truncate text-[11px] text-muted-foreground/60">
              {saving ? "Saving..." : "Only visible to you"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {!isForward && (
              <HeaderButton
                label={showQuote ? "Hide quoted text" : "Show quoted text"}
                onClick={() => setShowQuote((current) => !current)}
                className={showQuote ? "text-foreground" : undefined}
              >
                <QuoteIcon className="size-3.5" />
              </HeaderButton>
            )}
            <HeaderButton
              label={expanded ? "Collapse" : "Expand"}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? (
                <MinimizeIcon className="size-3.5" />
              ) : (
                <MaximizeIcon className="size-3.5" />
              )}
            </HeaderButton>
            <HeaderButton label="Close, keeping the draft" onClick={onClose}>
              <XIcon className="size-3.5" />
            </HeaderButton>
          </div>
        </div>

        <div className="shrink-0">
          {fromAddress && (
            <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
              <span className="w-10 shrink-0 text-[11px] font-medium text-muted-foreground/70">
                From
              </span>
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[12px]">
                {fromAddress}
              </span>
            </div>
          )}

          <RecipientChips
            label="To"
            value={state.to}
            onChange={(value) => patch({ to: value })}
            placeholder="name@example.com"
            autoFocus={isForward}
            disabled={sending}
            actions={
              <>
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="text-[11px] text-muted-foreground/60 hover:text-foreground"
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setShowBcc(true)}
                    className="text-[11px] text-muted-foreground/60 hover:text-foreground"
                  >
                    Bcc
                  </button>
                )}
              </>
            }
          />

          {showCc && (
            <RecipientChips
              label="Cc"
              value={state.cc}
              onChange={(value) => patch({ cc: value })}
              disabled={sending}
            />
          )}
          {showBcc && (
            <RecipientChips
              label="Bcc"
              value={state.bcc}
              onChange={(value) => patch({ bcc: value })}
              disabled={sending}
            />
          )}

          <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
            <span className="w-10 shrink-0 text-[11px] font-medium text-muted-foreground/70">
              Subject
            </span>
            <input
              type="text"
              value={state.subject}
              disabled={sending}
              onChange={(event) => patch({ subject: event.target.value })}
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/50 disabled:opacity-60"
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Suspense fallback={<div className="m-4 h-32 animate-pulse rounded-md bg-muted/40" />}>
            <RichTextEditor
              value={state.bodyHtml}
              onChange={(html) => patch({ bodyHtml: html })}
              disabled={sending || generating}
              autoFocus={!isForward}
              onSubmitShortcut={() => void handleSend()}
              toolbarPosition="bottom"
              footerSlot={editorFooter}
              apiRef={editorApi}
              className={cn("flex-1", expanded ? "min-h-0" : "min-h-48")}
            />
          </Suspense>
        </div>

        {(sendError || overSizeLimit) && (
          <div className="flex shrink-0 items-start gap-2 border-t border-border/40 bg-destructive/5 px-4 py-2 text-[11px] text-destructive">
            <AlertCircleIcon className="mt-px size-3.5 shrink-0" />
            <span>
              {overSizeLimit
                ? `Attachments total ${formatFileSize(totalBytes)}, over the ${Math.round(EMAIL_ATTACHMENT_MAX_TOTAL_SIZE / 1024 / 1024)}MB limit.`
                : sendError}
            </span>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/40 px-4 py-2.5">
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
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground/60 hover:text-foreground"
                  disabled={sending || uploading}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach files"
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

            <EmojiPicker
              disabled={sending}
              onSelect={(emoji) => editorApi.current?.insertText(emoji)}
            />

            {!isForward && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground/60 hover:text-foreground"
                    disabled={sending || generating}
                    onClick={() => void handleGenerate()}
                    aria-label="Write with AI"
                  >
                    {generating ? (
                      <LoaderIcon className="size-3.5 animate-spin" />
                    ) : (
                      <SparklesIcon className="size-3.5" />
                    )}
                    {generating ? "Writing..." : "Write with AI"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {generating
                    ? "Generating a draft reply"
                    : "Generate a draft reply from this conversation"}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground/60 hover:text-destructive"
                  disabled={sending}
                  onClick={handleDiscard}
                  aria-label="Discard draft"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Discard draft</TooltipContent>
            </Tooltip>

            {totalBytes > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground/60">
                {formatFileSize(totalBytes)}
              </span>
            )}
          </div>

          <div className="flex items-center">
            <Button
              size="sm"
              onClick={() => void handleSend()}
              disabled={sending || overSizeLimit}
              className="rounded-r-none"
            >
              {sending ? (
                <LoaderIcon className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <SendIcon className="mr-1.5 size-3.5" />
              )}
              {sending ? "Sending" : "Send"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  disabled={sending || overSizeLimit}
                  aria-label="More send options"
                  className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
                >
                  <ChevronDownIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void handleSend(false)}>
                  Send
                  <span className="ml-auto pl-4 text-[10px] text-muted-foreground">
                    Ctrl+Enter
                  </span>
                </DropdownMenuItem>
                {!isForward && (
                  <DropdownMenuItem onSelect={() => void handleSend(true)}>
                    Send and archive
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  )
}
