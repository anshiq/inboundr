import { useSyncExternalStore } from "react"

export type SupportView = "panes" | "table"

const STORAGE_KEY = "support:view"
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): SupportView {
  try {
    return localStorage.getItem(STORAGE_KEY) === "table" ? "table" : "panes"
  } catch {
    return "panes"
  }
}

export function setSupportView(view: SupportView) {
  try {
    localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // Private mode etc. — the preference just won't persist.
  }
  listeners.forEach((listener) => listener())
}

export function useSupportView(): SupportView {
  return useSyncExternalStore(subscribe, getSnapshot)
}
