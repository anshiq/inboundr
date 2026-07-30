import { useCallback, useEffect } from "react"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { TextStyleKit } from "@tiptap/extension-text-style"
import Image from "@tiptap/extension-image"
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
  ChevronDownIcon,
  BaselineIcon,
  HighlighterIcon,
  ImageIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// Restricted to families with reliable fallbacks in desktop and webmail clients;
// anything more adventurous renders unpredictably once the mail is delivered.
const FONT_FAMILIES = [
  { label: "Sans Serif", value: "Arial, Helvetica, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Fixed Width", value: "'Courier New', Courier, monospace" },
  { label: "Wide", value: "'Arial Black', Gadget, sans-serif" },
  { label: "Narrow", value: "'Arial Narrow', Arial, sans-serif" },
]

const FONT_SIZES = [
  { label: "Small", value: "12px" },
  { label: "Normal", value: "14px" },
  { label: "Large", value: "18px" },
  { label: "Huge", value: "24px" },
]

const TEXT_COLORS = [
  "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#ffffff",
  "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff",
  "#4a86e8", "#0000ff", "#9900ff", "#ff00ff", "#e6b8af", "#d9d2e9",
]

const HIGHLIGHT_COLORS = [
  "#fff2cc", "#fce5cd", "#f4cccc", "#d9ead3", "#d0e0e3", "#cfe2f3",
  "#d9d2e9", "#ead1dc", "#ffff00", "#00ffff", "#ff00ff", "#ffffff",
]

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

/**
 * Toolbar commands must not steal the selection, otherwise they would apply to
 * an empty range once the editor loses focus.
 */
function keepSelection(event: React.MouseEvent) {
  event.preventDefault()
}

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
          onMouseDown={keepSelection}
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

function Divider() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-border/60" />
}

function ValueDropdown({
  label,
  title,
  options,
  disabled,
  onSelect,
  onClear,
  className,
}: {
  label: string
  title: string
  options: { label: string; value: string }[]
  disabled?: boolean
  onSelect: (value: string) => void
  onClear: () => void
  className?: string
}) {
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
              className={cn(
                "h-7 gap-1 px-2 text-[12px] font-normal text-muted-foreground/80 hover:text-foreground",
                className
              )}
            >
              <span className="truncate">{label}</span>
              <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{title}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-40">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onMouseDown={keepSelection}
            onSelect={() => onSelect(option.value)}
            style={{ fontFamily: option.value.includes(",") ? option.value : undefined }}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onMouseDown={keepSelection} onSelect={onClear}>
          Default
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ColorPicker({
  icon: Icon,
  title,
  colors,
  current,
  disabled,
  onSelect,
  onClear,
}: {
  icon: typeof BaselineIcon
  title: string
  colors: string[]
  current?: string
  disabled?: boolean
  onSelect: (color: string) => void
  onClear: () => void
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              onMouseDown={keepSelection}
              className="relative size-7 text-muted-foreground/70 hover:text-foreground"
            >
              <Icon className="size-3.5" />
              <span
                className="absolute bottom-1 left-1/2 h-[2px] w-3.5 -translate-x-1/2 rounded-full border border-border/40"
                style={{ backgroundColor: current ?? "transparent" }}
              />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{title}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="grid grid-cols-6 gap-1">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              onMouseDown={keepSelection}
              onClick={() => onSelect(color)}
              className="size-5 rounded border border-border/60 transition-transform hover:scale-110"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={keepSelection}
          onClick={onClear}
          className="mt-2 h-7 w-full text-[12px]"
        >
          Remove
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function EditorToolbar({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const style = editor.getAttributes("textStyle") as {
    fontFamily?: string
    fontSize?: string
    color?: string
    backgroundColor?: string
  }

  const familyLabel =
    FONT_FAMILIES.find((font) => font.value === style.fontFamily)?.label ?? "Sans Serif"
  const sizeLabel = FONT_SIZES.find((size) => size.value === style.fontSize)?.label ?? "Normal"

  const toggleLink = useCallback(() => {
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

  const insertImage = useCallback(() => {
    const src = window.prompt("Image URL", "https://")
    if (src === null) return

    const trimmed = src.trim()
    if (!trimmed) return

    editor.chain().focus().setImage({ src: trimmed }).run()
  }, [editor])

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
      <ValueDropdown
        label={familyLabel}
        title="Font"
        options={FONT_FAMILIES}
        disabled={disabled}
        className="max-w-28"
        onSelect={(value) => editor.chain().focus().setFontFamily(value).run()}
        onClear={() => editor.chain().focus().unsetFontFamily().run()}
      />
      <ValueDropdown
        label={sizeLabel}
        title="Size"
        options={FONT_SIZES}
        disabled={disabled}
        onSelect={(value) => editor.chain().focus().setFontSize(value).run()}
        onClear={() => editor.chain().focus().unsetFontSize().run()}
      />

      <Divider />

      <ColorPicker
        icon={BaselineIcon}
        title="Text colour"
        colors={TEXT_COLORS}
        current={style.color}
        disabled={disabled}
        onSelect={(color) => editor.chain().focus().setColor(color).run()}
        onClear={() => editor.chain().focus().unsetColor().run()}
      />
      <ColorPicker
        icon={HighlighterIcon}
        title="Highlight"
        colors={HIGHLIGHT_COLORS}
        current={style.backgroundColor}
        disabled={disabled}
        onSelect={(color) => editor.chain().focus().setBackgroundColor(color).run()}
        onClear={() => editor.chain().focus().unsetBackgroundColor().run()}
      />

      <Divider />

      {INLINE_ACTIONS.map((action) => (
        <ToolbarButton key={action.id} action={action} editor={editor} disabled={disabled} />
      ))}

      <Divider />

      {BLOCK_ACTIONS.map((action) => (
        <ToolbarButton key={action.id} action={action} editor={editor} disabled={disabled} />
      ))}

      <Divider />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            onMouseDown={keepSelection}
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
            onMouseDown={keepSelection}
            onClick={insertImage}
            className="size-7 text-muted-foreground/70 hover:text-foreground"
          >
            <ImageIcon className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Insert image by URL</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            onMouseDown={keepSelection}
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            className="size-7 text-muted-foreground/70 hover:text-foreground"
          >
            <RemoveFormattingIcon className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Clear formatting</TooltipContent>
      </Tooltip>
    </div>
  )
}

export interface RichTextEditorApi {
  insertText: (text: string) => void
  focus: () => void
}

export interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  autoFocus?: boolean
  onSubmitShortcut?: () => void
  /** The composer puts its toolbar at the bottom of the modal, Front-style. */
  toolbarPosition?: "top" | "bottom"
  /**
   * Rendered between the body and a bottom toolbar, so the composer can sit its
   * attachment tray directly above the formatting controls.
   */
  footerSlot?: React.ReactNode
  /** Lets the composer insert at the cursor without owning the editor instance. */
  apiRef?: React.RefObject<RichTextEditorApi | null>
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your reply...",
  disabled = false,
  className,
  autoFocus = false,
  onSubmitShortcut,
  toolbarPosition = "top",
  footerSlot,
  apiRef,
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
      TextStyleKit.configure({ lineHeight: false }),
      Image.configure({ inline: false, allowBase64: false }),
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
    if (!editor || editor.isDestroyed) return
    if (value === editor.getHTML()) return
    editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = editor
      ? {
          insertText: (text) => editor.chain().focus().insertContent(text).run(),
          focus: () => editor.commands.focus(),
        }
      : null
  }, [apiRef, editor])

  if (!editor) {
    return <div className={cn("min-h-24 animate-pulse rounded-md bg-muted/40", className)} />
  }

  const atBottom = toolbarPosition === "bottom"

  const toolbar = (
    <div className={cn("shrink-0 border-border/40", atBottom ? "border-t" : "border-b")}>
      <EditorToolbar editor={editor} disabled={disabled} />
    </div>
  )

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {!atBottom && toolbar}

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {editor.isEmpty && (
          <p className="pointer-events-none absolute left-3.5 top-2.5 text-[13px] text-muted-foreground/50">
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} className="px-3.5 py-2.5 text-[13px]" />
      </div>

      {footerSlot}
      {atBottom && toolbar}
    </div>
  )
}

export default RichTextEditor
