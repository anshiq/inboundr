import { useCallback, useEffect } from "react"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  ListIcon,
  ListOrderedIcon,
  LinkIcon,
  Link2OffIcon,
  QuoteIcon,
  RemoveFormattingIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface ToolbarAction {
  id: string
  label: string
  icon: typeof BoldIcon
  isActive?: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

const INLINE_ACTIONS: ToolbarAction[] = [
  {
    id: "bold",
    label: "Bold",
    icon: BoldIcon,
    isActive: (editor) => editor.isActive("bold"),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    id: "italic",
    label: "Italic",
    icon: ItalicIcon,
    isActive: (editor) => editor.isActive("italic"),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    id: "underline",
    label: "Underline",
    icon: UnderlineIcon,
    isActive: (editor) => editor.isActive("underline"),
    run: (editor) => editor.chain().focus().toggleUnderline().run(),
  },
  {
    id: "strike",
    label: "Strikethrough",
    icon: StrikethroughIcon,
    isActive: (editor) => editor.isActive("strike"),
    run: (editor) => editor.chain().focus().toggleStrike().run(),
  },
]

const BLOCK_ACTIONS: ToolbarAction[] = [
  {
    id: "bulletList",
    label: "Bulleted list",
    icon: ListIcon,
    isActive: (editor) => editor.isActive("bulletList"),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: "orderedList",
    label: "Numbered list",
    icon: ListOrderedIcon,
    isActive: (editor) => editor.isActive("orderedList"),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "blockquote",
    label: "Quote",
    icon: QuoteIcon,
    isActive: (editor) => editor.isActive("blockquote"),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
]

function ToolbarButton({
  action,
  editor,
  disabled,
}: {
  action: ToolbarAction
  editor: Editor
  disabled?: boolean
}) {
  const Icon = action.icon
  const active = action.isActive?.(editor) ?? false

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          // Keep focus in the document so the command applies to the selection.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => action.run(editor)}
          className={cn(
            "size-7 text-muted-foreground/70 hover:text-foreground",
            active && "bg-muted text-foreground"
          )}
        >
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{action.label}</TooltipContent>
    </Tooltip>
  )
}

export interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  autoFocus?: boolean
  onSubmitShortcut?: () => void
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your reply...",
  disabled = false,
  className,
  autoFocus = false,
  onSubmitShortcut,
}: RichTextEditorProps) {
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
    ],
    content: value,
    autofocus: autoFocus ? "end" : false,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "email-editor-content focus:outline-none",
        "aria-label": "Reply body",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && onSubmitShortcut) {
          event.preventDefault()
          onSubmitShortcut()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
  })

  // Only push external values in when they actually diverge, otherwise every
  // keystroke would reset the selection.
  useEffect(() => {
    if (!editor) return
    if (value === editor.getHTML()) return
    editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

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
    if (!trimmed) {
      editor.chain().focus().unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run()
  }, [editor])

  if (!editor) {
    return <div className={cn("min-h-24 animate-pulse rounded-md bg-muted/40", className)} />
  }

  const isEmpty = editor.isEmpty

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/40 px-1.5 py-1">
        {INLINE_ACTIONS.map((action) => (
          <ToolbarButton key={action.id} action={action} editor={editor} disabled={disabled} />
        ))}
        <span className="mx-1 h-4 w-px bg-border/60" />
        {BLOCK_ACTIONS.map((action) => (
          <ToolbarButton key={action.id} action={action} editor={editor} disabled={disabled} />
        ))}
        <span className="mx-1 h-4 w-px bg-border/60" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={toggleLink}
              className={cn(
                "size-7 text-muted-foreground/70 hover:text-foreground",
                editor.isActive("link") && "bg-muted text-foreground"
              )}
            >
              {editor.isActive("link") ? (
                <Link2OffIcon className="size-3.5" />
              ) : (
                <LinkIcon className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {editor.isActive("link") ? "Remove link" : "Insert link"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                editor.chain().focus().unsetAllMarks().clearNodes().run()
              }
              className="size-7 text-muted-foreground/70 hover:text-foreground"
            >
              <RemoveFormattingIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Clear formatting</TooltipContent>
        </Tooltip>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {isEmpty && (
          <p className="pointer-events-none absolute left-3.5 top-2.5 text-[13px] text-muted-foreground/50">
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} className="px-3.5 py-2.5 text-[13px]" />
      </div>
    </div>
  )
}

export default RichTextEditor
