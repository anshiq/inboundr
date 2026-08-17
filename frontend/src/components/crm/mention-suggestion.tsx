import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import type { MentionNodeAttrs } from "@tiptap/extension-mention"
import { ReactRenderer } from "@tiptap/react"
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { API_ORIGIN } from "@/lib/env"
import { cn, getAvatarColor } from "@/lib/utils"

export interface MentionMember {
  userId: string
  name: string
  email: string | null
  image: string | null
}

// One fetch per session: the member list is small and stable, and the picker
// must respond instantly once the user types "@".
let membersPromise: Promise<MentionMember[]> | null = null

async function fetchMentionMembers(): Promise<MentionMember[]> {
  const response = await fetch(`${API_ORIGIN}/api/v1/organization/members`, {
    credentials: "include",
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = await response.json()
  const members = Array.isArray(data.members) ? data.members : []
  return members
    .filter((member: Record<string, unknown>) => typeof member.userId === "string" && member.userId)
    .map((member: Record<string, unknown>) => ({
      userId: String(member.userId),
      name: String(member.userName ?? member.userEmail ?? "Unknown"),
      email: member.userEmail ? String(member.userEmail) : null,
      image: member.userImage ? String(member.userImage) : null,
    }))
}

function loadMentionMembers(): Promise<MentionMember[]> {
  if (!membersPromise) {
    membersPromise = fetchMentionMembers().catch((err) => {
      membersPromise = null
      throw err
    })
  }
  return membersPromise
}

interface MentionListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

// Internal list rendered imperatively by TipTap's suggestion plugin, so fast
// refresh does not apply to this file.
// eslint-disable-next-line react-refresh/only-export-components
const MentionList = forwardRef<MentionListRef, SuggestionProps<MentionMember, MentionNodeAttrs>>(
  function MentionList({ items, command }, ref) {
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
      if (item) command({ id: item.userId, label: item.name })
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

    return (
      <div
        ref={listRef}
        className="max-h-72 w-64 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground">People</p>
        {items.length === 0 ? (
          <p className="px-2 pb-1.5 text-[13px] text-muted-foreground">No members found</p>
        ) : (
          items.map((item, index) => {
            const color = getAvatarColor(item.name)
            return (
              <button
                key={item.userId}
                type="button"
                data-index={index}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
                  index === selectedIndex && "bg-muted"
                )}
                // Selecting from the menu must not blur the editor.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => selectItem(index)}
              >
                <Avatar size="sm">
                  {item.image && <AvatarImage src={item.image} alt={item.name} />}
                  <AvatarFallback className={cn(color.bg, color.text)}>
                    {item.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{item.name}</span>
                  {item.email && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {item.email}
                    </span>
                  )}
                </span>
              </button>
            )
          })
        )}
      </div>
    )
  }
)

function filterMembers(members: MentionMember[], query: string): MentionMember[] {
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? members.filter(
        (member) =>
          member.name.toLowerCase().includes(needle) ||
          (member.email ?? "").toLowerCase().includes(needle)
      )
    : members
  return matches.slice(0, 8)
}

/**
 * Notion-style "@" picker: a fixed-position menu rendered next to the caret,
 * outside the editor DOM so it can overflow the note modal.
 */
export const mentionSuggestionOptions: Omit<
  SuggestionOptions<MentionMember, MentionNodeAttrs>,
  "editor"
> = {
  char: "@",
  items: async ({ query }) => {
    try {
      return filterMembers(await loadMentionMembers(), query)
    } catch {
      return []
    }
  },
  render: () => {
    let component: ReactRenderer<MentionListRef, SuggestionProps<MentionMember, MentionNodeAttrs>>
    let popup: HTMLDivElement | null = null

    const updatePosition = (clientRect: (() => DOMRect | null) | null | undefined) => {
      const rect = clientRect?.()
      if (!popup || !rect) return
      const { offsetWidth, offsetHeight } = popup
      const gap = 6
      const left = Math.min(rect.left, window.innerWidth - offsetWidth - 8)
      const fitsBelow = rect.bottom + gap + offsetHeight <= window.innerHeight
      const top = fitsBelow ? rect.bottom + gap : Math.max(rect.top - gap - offsetHeight, 8)
      popup.style.left = `${Math.max(left, 8)}px`
      popup.style.top = `${top}px`
    }

    return {
      onStart: (props) => {
        component = new ReactRenderer(MentionList, { props, editor: props.editor })
        popup = document.createElement("div")
        popup.dataset.mentionPopup = ""
        popup.style.position = "fixed"
        // Above the note dialog (Radix overlays sit at z-50).
        popup.style.zIndex = "100"
        // The modal dialog sets pointer-events: none on <body>; re-enable
        // them here so the popup can be clicked.
        popup.style.pointerEvents = "auto"
        popup.appendChild(component.element)
        document.body.appendChild(popup)
        updatePosition(props.clientRect)
      },
      onUpdate: (props) => {
        component.updateProps(props)
        if (popup) {
          popup.style.display = ""
          popup.dataset.mentionPopup = ""
        }
        updatePosition(props.clientRect)
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          // Hide and unmark so the next Escape reaches the dialog again.
          if (popup) {
            popup.style.display = "none"
            delete popup.dataset.mentionPopup
          }
          return true
        }
        return component.ref?.onKeyDown(props) ?? false
      },
      onExit: () => {
        popup?.remove()
        popup = null
        component.destroy()
      },
    }
  },
}
