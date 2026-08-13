import { useCallback, useEffect, useRef, useState } from "react"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import {
  BoldIcon,
  ChevronDownIcon,
  CodeIcon,
  HeadingIcon,
  ImageIcon,
  ItalicIcon,
  Link2OffIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  PaperclipIcon,
  QuoteIcon,
  StrikethroughIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { NoteAttachment } from "@/lib/crm"
import {
  CRM_NOTE_FILE_ACCEPT,
  CRM_NOTE_IMAGE_TYPES,
  resolveCrmFileUrl,
  uploadCrmNoteFile,
} from "@/lib/crm-note-files"
import { formatFileSize } from "@/lib/email-reply"
import { cn } from "@/lib/utils"

/**
 * Uploaded images keep their storage key on the node so the saved HTML can
 * reference the file forever, while `src` (a signed URL that expires) is
 * re-resolved at render time.
 */
const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-key": {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-key"),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes["data-key"] ? { "data-key": attributes["data-key"] } : {},
      },
    }
  },
})

export interface NoteEditorPayload {
  body: string
  bodyHtml: string
  attachments: NoteAttachment[]
  isEmpty: boolean
}

export interface NoteEditorApi {
  getPayload: () => NoteEditorPayload
  reset: () => void
  isUploading: () => boolean
}

interface HeadingOption {
  label: string
  level: 0 | 1 | 2 | 3
}

const HEADING_OPTIONS: HeadingOption[] = [
  { label: "Text", level: 0 },
  { label: "Heading 1", level: 1 },
  { label: "Heading 2", level: 2 },
  { label: "Heading 3", level: 3 },
]

/** Toolbar commands must not steal the editor selection. */
function keepSelection(event: React.MouseEvent) {
  event.preventDefault()
}

function ToolbarButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string
  icon: typeof BoldIcon
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onMouseDown={keepSelection}
          onClick={onClick}
          className={cn(
            "size-7 text-muted-foreground/70 hover:text-foreground",
            active && "bg-muted text-foreground"
          )}
        >
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-border/60" />
}

function HeadingDropdown({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const current =
    HEADING_OPTIONS.find(
      (option) => option.level > 0 && editor.isActive("heading", { level: option.level })
    ) ?? HEADING_OPTIONS[0]

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onMouseDown={keepSelection}
              className="h-7 gap-1 px-2 text-[12px] font-normal text-muted-foreground/80 hover:text-foreground"
            >
              <HeadingIcon className="size-3.5" />
              <span className="max-w-20 truncate">{current.label}</span>
              <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Text style</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-36">
        {HEADING_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.level}
            onMouseDown={keepSelection}
            onSelect={() => {
              const chain = editor.chain().focus()
              if (option.level === 0) chain.setParagraph().run()
              else chain.toggleHeading({ level: option.level }).run()
            }}
          >
            <span
              className={cn(
                option.level === 1 && "text-base font-semibold",
                option.level === 2 && "text-sm font-semibold",
                option.level === 3 && "text-[13px] font-semibold"
              )}
            >
              {option.label}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export interface NoteEditorProps {
  disabled?: boolean
  placeholder?: string
  onSubmitShortcut?: () => void
  /** Lets the composer read/clear the note without owning the editor instance. */
  apiRef: React.RefObject<NoteEditorApi | null>
  className?: string
}

export function NoteEditor({
  disabled = false,
  placeholder = "Log an internal note... (type '#' for a heading, '-' for a list)",
  onSubmitShortcut,
  apiRef,
  className,
}: NoteEditorProps) {
  const [attachments, setAttachments] = useState<NoteAttachment[]>([])
  const [uploadingCount, setUploadingCount] = useState(0)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // editorProps handlers are captured once by TipTap, so they reach the
  // current upload logic through a ref instead of stale closures.
  const handleIncomingFilesRef = useRef<(files: File[], insertAt?: number) => void>(() => {})
  const onSubmitShortcutRef = useRef(onSubmitShortcut)
  useEffect(() => {
    onSubmitShortcutRef.current = onSubmitShortcut
  }, [onSubmitShortcut])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      NoteImage.configure({ inline: false, allowBase64: false }),
    ],
    content: "",
    editable: !disabled,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "rich-note-content min-h-20 focus:outline-none",
        "aria-label": "Note body",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && onSubmitShortcutRef.current) {
          event.preventDefault()
          onSubmitShortcutRef.current()
          return true
        }
        return false
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (files.length === 0) return false
        event.preventDefault()
        handleIncomingFilesRef.current(files)
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (files.length === 0) return false
        event.preventDefault()
        const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        handleIncomingFilesRef.current(files, dropPos)
        return true
      },
    },
  })

  const insertUploadedImage = useCallback(
    (instance: Editor, file: File, key: string, url: string, insertAt?: number) => {
      const content = {
        type: "image",
        attrs: { src: url, alt: file.name, "data-key": key },
      }
      const chain = instance.chain().focus()
      if (insertAt !== undefined) chain.insertContentAt(insertAt, content).run()
      else chain.insertContent(content).run()
    },
    []
  )

  const handleIncomingFiles = useCallback(
    (files: File[], insertAt?: number) => {
      if (disabled) return
      for (const file of files) {
        setUploadingCount((count) => count + 1)
        void uploadCrmNoteFile(file)
          .then(async (attachment) => {
            if (CRM_NOTE_IMAGE_TYPES.includes(attachment.contentType)) {
              const url = await resolveCrmFileUrl(attachment.key)
              if (editor && !editor.isDestroyed) {
                insertUploadedImage(editor, file, attachment.key, url, insertAt)
              }
            } else {
              setAttachments((prev) => [...prev, attachment])
            }
          })
          .catch((err) => {
            toast.error(err instanceof Error ? err.message : `Failed to upload ${file.name}`)
          })
          .finally(() => setUploadingCount((count) => count - 1))
      }
    },
    [disabled, editor, insertUploadedImage]
  )
  useEffect(() => {
    handleIncomingFilesRef.current = handleIncomingFiles
  }, [handleIncomingFiles])

  const toggleLink = useCallback(() => {
    if (!editor) return
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const previous = (editor.getAttributes("link").href as string | undefined) ?? ""
    const href = window.prompt("Link URL", previous || "https://")
    if (href === null) return
    const trimmed = href.trim()
    if (!trimmed) return
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run()
  }, [editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    apiRef.current = editor
      ? {
          getPayload: () => ({
            body: editor.getText().trim(),
            bodyHtml: editor.getHTML(),
            attachments,
            isEmpty: editor.isEmpty && attachments.length === 0,
          }),
          reset: () => {
            editor.commands.clearContent()
            setAttachments([])
          },
          isUploading: () => uploadingCount > 0,
        }
      : null
  }, [apiRef, editor, attachments, uploadingCount])

  if (!editor) {
    return <div className={cn("min-h-28 animate-pulse rounded-md bg-muted/40", className)} />
  }

  return (
    <div className={cn("rounded-md border border-input shadow-xs", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/40 px-1.5 py-1">
        <HeadingDropdown editor={editor} disabled={disabled} />

        <ToolbarDivider />

        <ToolbarButton
          label="Bold"
          icon={BoldIcon}
          active={editor.isActive("bold")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="Italic"
          icon={ItalicIcon}
          active={editor.isActive("italic")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="Strikethrough"
          icon={StrikethroughIcon}
          active={editor.isActive("strike")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          label="Code"
          icon={CodeIcon}
          active={editor.isActive("code")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          label="Bulleted list"
          icon={ListIcon}
          active={editor.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="Numbered list"
          icon={ListOrderedIcon}
          active={editor.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="Quote"
          icon={QuoteIcon}
          active={editor.isActive("blockquote")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          label={editor.isActive("link") ? "Remove link" : "Insert link"}
          icon={editor.isActive("link") ? Link2OffIcon : LinkIcon}
          active={editor.isActive("link")}
          disabled={disabled}
          onClick={toggleLink}
        />
        <ToolbarButton
          label="Insert image"
          icon={ImageIcon}
          disabled={disabled}
          onClick={() => imageInputRef.current?.click()}
        />
        <ToolbarButton
          label="Attach file"
          icon={PaperclipIcon}
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        />

        {uploadingCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 pr-1 text-[11px] text-muted-foreground">
            <Spinner className="size-3" />
            Uploading...
          </span>
        )}
      </div>

      <div className="relative max-h-80 overflow-y-auto">
        {editor.isEmpty && (
          <p className="pointer-events-none absolute left-3 top-2.5 pr-3 text-[13px] text-muted-foreground/50">
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} className="px-3 py-2.5 text-[13px]" />
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border/40 px-2 py-1.5">
          {attachments.map((attachment) => (
            <span
              key={attachment.key}
              className="inline-flex max-w-56 items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-2 pr-1 text-xs"
            >
              <PaperclipIcon className="size-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{attachment.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatFileSize(attachment.size)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${attachment.name}`}
                disabled={disabled}
                onClick={() =>
                  setAttachments((prev) => prev.filter((item) => item.key !== attachment.key))
                }
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept={CRM_NOTE_IMAGE_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={(event) => {
          handleIncomingFiles(Array.from(event.target.files ?? []))
          event.target.value = ""
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={CRM_NOTE_FILE_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          handleIncomingFiles(Array.from(event.target.files ?? []))
          event.target.value = ""
        }}
      />
    </div>
  )
}

export default NoteEditor
