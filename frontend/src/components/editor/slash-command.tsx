import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { Extension, ReactRenderer, type Editor } from "@tiptap/react"
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from "@tiptap/suggestion"
import {
  CodeIcon,
  FileTextIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  HardDriveIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  TextIcon,
  UploadIcon,
  type LucideIcon,
} from "lucide-react"

import { createSuggestionPopup, type SuggestionPopup } from "@/components/editor/suggestion-popup"
import { cn } from "@/lib/utils"

/**
 * Module inserts open UI owned by the editor component (pickers, file
 * inputs), so the slash extension reaches them through this contract.
 */
export interface SlashCommandActions {
  openDriveFilePicker: () => void
  openFormPicker: () => void
  openFileUpload: () => void
}

export interface SlashCommandOptions {
  actions: SlashCommandActions | null
}

interface SlashMenuItem {
  id: string
  label: string
  description: string
  keywords: string
  section: "Blocks" | "Insert"
  icon: LucideIcon
  run: (editor: Editor, actions: SlashCommandActions | null) => void
}

const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  {
    id: "text",
    label: "Text",
    description: "Plain paragraph",
    keywords: "text paragraph plain",
    section: "Blocks",
    icon: TextIcon,
    run: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    id: "h1",
    label: "Heading 1",
    description: "Large section heading",
    keywords: "heading h1 title large",
    section: "Blocks",
    icon: Heading1Icon,
    run: (editor) => editor.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "Heading 2",
    description: "Medium section heading",
    keywords: "heading h2 subtitle medium",
    section: "Blocks",
    icon: Heading2Icon,
    run: (editor) => editor.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "Heading 3",
    description: "Small section heading",
    keywords: "heading h3 small",
    section: "Blocks",
    icon: Heading3Icon,
    run: (editor) => editor.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    id: "bullet-list",
    label: "Bulleted List",
    description: "Simple bulleted list",
    keywords: "bullet list unordered ul",
    section: "Blocks",
    icon: ListIcon,
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: "ordered-list",
    label: "Numbered List",
    description: "List with numbering",
    keywords: "numbered ordered list ol",
    section: "Blocks",
    icon: ListOrderedIcon,
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "quote",
    label: "Quote",
    description: "Capture a quote",
    keywords: "quote blockquote citation",
    section: "Blocks",
    icon: QuoteIcon,
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code-block",
    label: "Code Block",
    description: "Preformatted code",
    keywords: "code block pre snippet",
    section: "Blocks",
    icon: CodeIcon,
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "divider",
    label: "Divider",
    description: "Horizontal rule",
    keywords: "divider rule separator hr line",
    section: "Blocks",
    icon: MinusIcon,
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    id: "drive-file",
    label: "Drive File",
    description: "Link a file from Drive",
    keywords: "drive file attach document existing",
    section: "Insert",
    icon: HardDriveIcon,
    run: (_editor, actions) => actions?.openDriveFilePicker(),
  },
  {
    id: "upload",
    label: "Upload File",
    description: "Upload from this device",
    keywords: "upload file attach image photo",
    section: "Insert",
    icon: UploadIcon,
    run: (_editor, actions) => actions?.openFileUpload(),
  },
  {
    id: "form",
    label: "Form",
    description: "Reference a form",
    keywords: "form survey questionnaire",
    section: "Insert",
    icon: FileTextIcon,
    run: (_editor, actions) => actions?.openFormPicker(),
  },
  {
    id: "link",
    label: "Link",
    description: "Insert a web link",
    keywords: "link url website href",
    section: "Insert",
    icon: LinkIcon,
    // A collapsed cursor needs visible text, not just a mark toggle, so the
    // URL itself is inserted as a link.
    run: (editor) => {
      const href = window.prompt("Link URL", "https://")
      if (href === null) return
      const trimmed = href.trim()
      if (!trimmed) return
      if (editor.state.selection.empty) {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: trimmed,
            marks: [{ type: "link", attrs: { href: trimmed } }],
          })
          .insertContent(" ")
          .run()
      } else {
        editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run()
      }
    },
  },
]

function filterSlashItems(query: string): SlashMenuItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return SLASH_MENU_ITEMS
  return SLASH_MENU_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(needle) || item.keywords.includes(needle)
  )
}

interface SlashMenuListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

// Rendered imperatively by TipTap's suggestion plugin, so fast refresh does
// not apply to this file.
// eslint-disable-next-line react-refresh/only-export-components
const SlashMenuList = forwardRef<SlashMenuListRef, SuggestionProps<SlashMenuItem, SlashMenuItem>>(
  function SlashMenuList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      setSelectedIndex(0)
    }, [items])

    useEffect(() => {
      listRef.current
        ?.querySelector(`[data-index="${selectedIndex}"]`)
        ?.scrollIntoView({ block: "nearest" })
    }, [selectedIndex])

    const selectItem = (index: number) => {
      const item = items[index]
      if (item) command(item)
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((index) => (index + items.length - 1) % Math.max(items.length, 1))
          return true
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((index) => (index + 1) % Math.max(items.length, 1))
          return true
        }
        if (event.key === "Enter" || event.key === "Tab") {
          if (items.length === 0) return false
          selectItem(selectedIndex)
          return true
        }
        return false
      },
    }))

    const sections: Array<{ name: string; items: Array<{ item: SlashMenuItem; index: number }> }> = []
    items.forEach((item, index) => {
      const section = sections.find((entry) => entry.name === item.section)
      if (section) section.items.push({ item, index })
      else sections.push({ name: item.section, items: [{ item, index }] })
    })

    return (
      <div
        ref={listRef}
        className="max-h-80 w-64 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
      >
        {items.length === 0 ? (
          <p className="px-2 py-1.5 text-[13px] text-muted-foreground">No matches</p>
        ) : (
          sections.map((section) => (
            <div key={section.name}>
              <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground">
                {section.name}
              </p>
              {section.items.map(({ item, index }) => (
                <button
                  key={item.id}
                  type="button"
                  data-index={index}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
                    index === selectedIndex && "bg-muted"
                  )}
                  // Selecting from the menu must not blur the editor.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => selectItem(index)}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
                    <item.icon className="size-3.5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{item.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    )
  }
)

/**
 * Notion-style "/" command menu. Module-insert actions are provided by the
 * owning editor component via `SlashCommand.configure({ actions })`.
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return { actions: null }
  },

  addProseMirrorPlugins() {
    const getActions = () => this.options.actions
    return [
      Suggestion<SlashMenuItem, SlashMenuItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run()
          props.run(editor, getActions())
        },
        render: () => {
          let component: ReactRenderer<
            SlashMenuListRef,
            SuggestionProps<SlashMenuItem, SlashMenuItem>
          >
          let popup: SuggestionPopup | null = null

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenuList, { props, editor: props.editor })
              popup = createSuggestionPopup(component.element as HTMLElement)
              popup.updatePosition(props.clientRect)
            },
            onUpdate: (props) => {
              component.updateProps(props)
              popup?.show()
              popup?.updatePosition(props.clientRect)
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                popup?.hide()
                return true
              }
              return component.ref?.onKeyDown(props) ?? false
            },
            onExit: () => {
              popup?.destroy()
              popup = null
              component.destroy()
            },
          }
        },
      }),
    ]
  },
})