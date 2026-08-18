import { createFileRoute } from "@tanstack/react-router"

import { SupportLayout } from "@/components/support/support-layout"
import type { TicketFilter } from "@/components/support/types"
import { requireFeatureAndModuleAccess } from "@/lib/auth-guards"

const VALID_STATUSES: TicketFilter[] = ["open", "resolved", "all", "archived"]

export type SupportListSort = "recent" | "newest" | "oldest" | "most_messages"
export type SupportDateField = "created" | "activity"

const VALID_SORTS: SupportListSort[] = ["recent", "newest", "oldest", "most_messages"]

export type SupportListSearch = {
  status: TicketFilter
  q: string
  tags: string[]
  reason: string
  sort: SupportListSort
  dateField: SupportDateField
  /** Inclusive date range bounds as YYYY-MM-DD in the user's local timezone. */
  from: string
  to: string
  page: number
}

function parseDay(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""
}

function parseTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map((entry) => String(entry))
    : typeof value === "string"
      ? value.split(",")
      : []
  return [...new Set(raw.map((entry) => entry.trim()).filter(Boolean))]
}

export const Route = createFileRoute("/support")({
  // Validated on the layout so list filters survive navigating between the
  // list and a conversation.
  validateSearch: (search: Record<string, unknown>): SupportListSearch => {
    const status = String(search.status ?? "open") as TicketFilter
    const sort = String(search.sort ?? "recent") as SupportListSort
    const page = Number(search.page)
    return {
      status: VALID_STATUSES.includes(status) ? status : "open",
      q: typeof search.q === "string" ? search.q : "",
      tags: parseTags(search.tags),
      reason: typeof search.reason === "string" ? search.reason : "",
      sort: VALID_SORTS.includes(sort) ? sort : "recent",
      dateField: search.dateField === "activity" ? "activity" : "created",
      from: parseDay(search.from),
      to: parseDay(search.to),
      page: Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1,
    }
  },
  beforeLoad: () => requireFeatureAndModuleAccess("support", "support"),
  component: SupportLayout,
})
