import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { EditorContent, useEditor, type AnyExtension, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import Mention from "@tiptap/extension-mention"
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
import { handleChipElementClick } from "@/components/editor/chip-actions"
import { DriveFilePickerDialog } from "@/components/editor/drive-file-picker-dialog"
import { FormPickerDialog } from "@/components/editor/form-picker-dialog"
import { mentionSuggestionOptions } from "@/components/editor/mention-suggestion"
import { DriveFileChip, FormLinkChip } from "@/components/editor/module-nodes"
import { SlashCommand } from "@/components/editor/slash-command"
import {
  EDITOR_FILE_ACCEPT,
  EDITOR_IMAGE_TYPES,
  resolveEditorFileUrl,
  uploadEditorFile,
  type EditorAttachment,
  type EditorUploadScope,
} from "@/lib/editor-files"
import { formatFileSize } from "@/lib/email-reply"
import { cn } from "@/lib/utils"

/**
 * Uploaded images keep their storage key on the node so the saved HTML can
 * reference the file forever, while `src` (a signed URL that expires) is
 * re-resolved at render time.
 */
const EditorImage = Image.extend({
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

/**
 * Team mentions serialize as `<span data-type="mention" data-user-id="...">`
 * so the server can whitelist exactly that shape, while `data-type` lets
 * TipTap re-parse drafts back into mention nodes.
 */
const MemberMention = Mention.extend({
  addAttributes() {
    const parent = this.parent?.() ?? {}
    return {
      ...parent,
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-user-id"),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.id ? { "data-user-id": attributes.id } : {},
      },
      label: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-label"),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.label ? { "data-label": attributes.label } : {},
      },
      // Single-trigger setup: the "@" char adds nothing to the stored HTML.
      mentionSuggestionChar: {
        ...(parent as Record<string, { default?: unknown }>).mentionSuggestionChar,
        renderHTML: () => ({}),
      },
    }
  },
})

function collectMentionedUserIds(editor: Editor): string[] {
  const ids = new Set<string>()
  editor.state.doc.descendants((node) => {
    if (node.type.name === "mention" && typeof node.attrs.id === "string" && node.attrs.id) {
      ids.add(node.attrs.id)
    }
  })
  return [...ids]
}

export interface RichEditorPayload {
  body: string
  bodyHtml: string
  attachments: EditorAttachment[]
  mentionedUserIds: string[]
  isEmpty: boolean
}

export interface RichEditorApi {
  getPayload: () => RichEditorPayload
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

export interface RichEditorProps {
  /** Presign scope for pasted/attached uploads; also namespaces stored keys. */
  uploadScope: EditorUploadScope
  disabled?: boolean
  placeholder?: string
  onSubmitShortcut?: () => void
  /** Lets the owner read/clear the editor without owning the instance. */
  apiRef: React.RefObject<RichEditorApi | null>
  /** "large" fills the parent's height for a modal / full-page writing surface. */
  size?: "compact" | "large"
  autoFocus?: boolean
  /** Restores previously saved content when the editor mounts. */
  initialHtml?: string
  initialAttachments?: EditorAttachment[]
  /** Enables the "@" team-member mention picker. */
  enableMentions?: boolean
  /** Enables the Notion-style "/" command menu (blocks + module inserts). */
  enableSlashMenu?: boolean
  className?: string
}

export function RichEditor({
  uploadScope,
  disabled = false,
  placeholder,
  onSubmitShortcut,
  apiRef,
  size = "compact",
  autoFocus = false,
  initialHtml,
  initialAttachments,
  enableMentions = true,
  enableSlashMenu = false,
  className,
}: RichEditorProps) {
  const [attachments, setAttachments] = useState<EditorAttachment[]>(initialAttachments ?? [])
  const [uploadingCount, setUploadingCount] = useState(0)
  const [drivePickerOpen, setDrivePickerOpen] = useState(false)
  const [formPickerOpen, setFormPickerOpen] = useState(false)
  // Bumped by the "/upload" command; an effect clicks the hidden input (the
  // slash extension's render-time closures must not read refs).
  const [uploadRequestCount, setUploadRequestCount] = useState(0)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // editorProps handlers are captured once by TipTap, so they reach the
  // current upload logic through a ref instead of stale closures.
  const handleIncomingFilesRef = useRef<(files: File[], insertAt?: number) => void>(() => {})
  const onSubmitShortcutRef = useRef(onSubmitShortcut)
  useEffect(() => {
    onSubmitShortcutRef.current = onSubmitShortcut
  }, [onSubmitShortcut])

  const extensions = useMemo(() => {
    const list: AnyExtension[] = [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      EditorImage.configure({ inline: false, allowBase64: false }),
      DriveFileChip,
      FormLinkChip,
    ]
    if (enableMentions) {
      list.push(MemberMention.configure({ suggestion: mentionSuggestionOptions }))
    }
    if (enableSlashMenu) {
      list.push(
        SlashCommand.configure({
          actions: {
            openDriveFilePicker: () => setDrivePickerOpen(true),
            openFormPicker: () => setFormPickerOpen(true),
            openFileUpload: () => setUploadRequestCount((count) => count + 1),
          },
        })
      )
    }
    return list
    // Feature flags are fixed for the lifetime of a mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const editor = useEditor({
    extensions,
    content: initialHtml ?? "",
    editable: !disabled,
    autofocus: autoFocus ? "end" : false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: cn(
          "rich-note-content focus:outline-none",
          size === "large" ? "min-h-48" : "min-h-20"
        ),
        "aria-label": "Rich text body",
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
      // Chips open their target on click (like Notion); the node stays
      // selectable via keyboard for deletion.
      handleClickOn: (_view, _pos, node, _nodePos, event) => {
        if (node.type.name !== "driveFile" && node.type.name !== "formLink") return false
        const chip = (event.target as HTMLElement).closest("span[data-type]")
        if (!chip) return false
        return handleChipElementClick(chip as HTMLElement)
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
      // Uploads run in parallel, but image insertion is serialized below so a
      // multi-file drop lands in the user's file order (not completion order)
      // and each image advances the insert position instead of stacking at
      // the original drop point.
      const uploads = files.map((file) => {
        setUploadingCount((count) => count + 1)
        return uploadEditorFile(file, uploadScope)
          .then(async (attachment) => {
            if (!EDITOR_IMAGE_TYPES.includes(attachment.contentType)) {
              setAttachments((prev) => [...prev, attachment])
              return null
            }
            return { file, attachment, url: await resolveEditorFileUrl(attachment.key) }
          })
          .catch((err) => {
            toast.error(err instanceof Error ? err.message : `Failed to upload ${file.name}`)
            return null
          })
          .finally(() => setUploadingCount((count) => count - 1))
      })

      void (async () => {
        let position = insertAt
        for (const upload of uploads) {
          const image = await upload
          if (!image || !editor || editor.isDestroyed) continue
          insertUploadedImage(editor, image.file, image.attachment.key, image.url, position)
          // insertContent(At) leaves the selection after the inserted node,
          // so the next image goes right after the one that just landed.
          if (position !== undefined) position = editor.state.selection.to
        }
      })()
    },
    [disabled, editor, insertUploadedImage, uploadScope]
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
    if (uploadRequestCount === 0) return
    fileInputRef.current?.click()
  }, [uploadRequestCount])

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
            mentionedUserIds: collectMentionedUserIds(editor),
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

  const resolvedPlaceholder =
    placeholder ??
    (enableSlashMenu
      ? "Write something... (type '/' for commands, '@' to mention)"
      : "Write something... (type '#' for a heading, '-' for a list)")

  if (!editor) {
    return <div className={cn("min-h-28 animate-pulse rounded-md bg-muted/40", className)} />
  }

  return (
    <div
      className={cn(
        "rounded-md border border-input shadow-xs",
        size === "large" && "flex min-h-0 flex-col",
        className
      )}
    >
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

      <div
        className={cn(
          "relative overflow-y-auto",
          size === "large" ? "min-h-0 flex-1 cursor-text" : "max-h-80"
        )}
        onClick={(event) => {
          // In the large layout the document is usually shorter than the pane;
          // clicking the empty space below it should land the cursor at the end.
          if (!(event.target as HTMLElement).closest(".ProseMirror")) {
            editor.chain().focus("end").run()
          }
        }}
      >
        {editor.isEmpty && (
          <p
            className={cn(
              "pointer-events-none absolute left-3 top-2.5 pr-3 text-muted-foreground/50",
              size === "large" ? "left-4 top-3.5 text-sm" : "text-[13px]"
            )}
          >
            {resolvedPlaceholder}
          </p>
        )}
        <EditorContent
          editor={editor}
          className={cn(size === "large" ? "px-4 py-3.5 text-sm" : "px-3 py-2.5 text-[13px]")}
        />
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
        accept={EDITOR_IMAGE_TYPES.join(",")}
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
        accept={EDITOR_FILE_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          handleIncomingFiles(Array.from(event.target.files ?? []))
          event.target.value = ""
        }}
      />

      {enableSlashMenu && (
        <>
          <DriveFilePickerDialog
            open={drivePickerOpen}
            onOpenChange={setDrivePickerOpen}
            onSelectFile={(file) => {
              setDrivePickerOpen(false)
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "driveFile",
                  attrs: { nodeId: file.id, label: file.name },
                })
                .insertContent(" ")
                .run()
            }}
          />
          <FormPickerDialog
            open={formPickerOpen}
            onOpenChange={setFormPickerOpen}
            onSelectForm={(form) => {
              setFormPickerOpen(false)
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "formLink",
                  attrs: { formId: form.id, slug: form.slug, label: form.title },
                })
                .insertContent(" ")
                .run()
            }}
          />
        </>
      )}
    </div>
  )
}

export default RichEditor
