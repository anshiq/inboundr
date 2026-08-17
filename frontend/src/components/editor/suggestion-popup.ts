/**
 * Fixed-position popup rendered next to the caret, outside the editor DOM so
 * it can overflow dialogs. Shared by the "@" mention picker and the "/"
 * command menu.
 */
export interface SuggestionPopup {
  element: HTMLDivElement
  updatePosition: (clientRect: (() => DOMRect | null) | null | undefined) => void
  hide: () => void
  show: () => void
  destroy: () => void
}

export function createSuggestionPopup(content: HTMLElement): SuggestionPopup {
  const popup = document.createElement("div")
  popup.dataset.mentionPopup = ""
  popup.style.position = "fixed"
  // Above dialogs (Radix overlays sit at z-50).
  popup.style.zIndex = "100"
  // Modal dialogs set pointer-events: none on <body>; re-enable them here so
  // the popup can be clicked.
  popup.style.pointerEvents = "auto"
  popup.appendChild(content)
  document.body.appendChild(popup)

  return {
    element: popup,
    updatePosition: (clientRect) => {
      const rect = clientRect?.()
      if (!rect) return
      const { offsetWidth, offsetHeight } = popup
      const gap = 6
      const left = Math.min(rect.left, window.innerWidth - offsetWidth - 8)
      const fitsBelow = rect.bottom + gap + offsetHeight <= window.innerHeight
      const top = fitsBelow ? rect.bottom + gap : Math.max(rect.top - gap - offsetHeight, 8)
      popup.style.left = `${Math.max(left, 8)}px`
      popup.style.top = `${top}px`
    },
    hide: () => {
      // Hide and unmark so the next Escape reaches the dialog again.
      popup.style.display = "none"
      delete popup.dataset.mentionPopup
    },
    show: () => {
      popup.style.display = ""
      popup.dataset.mentionPopup = ""
    },
    destroy: () => {
      popup.remove()
    },
  }
}
