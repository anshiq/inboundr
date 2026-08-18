import { createFileRoute } from "@tanstack/react-router"

import { SupportLayout } from "@/components/support/support-layout"
import type { TicketFilter } from "@/components/support/types"
import { requireFeatureAndModuleAccess } from "@/lib/auth-guards"

const VALID_STATUSES: TicketFilter[] = ["open", "resolved", "all", "archived"]

export type SupportListSearch = {
  status: TicketFilter
  q: string
  tags: string[]
  reason: string
  page: number
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
    const page = Number(search.page)
    return {
      status: VALID_STATUSES.includes(status) ? status : "open",
      q: typeof search.q === "string" ? search.q : "",
      tags: parseTags(search.tags),
      reason: typeof search.reason === "string" ? search.reason : "",
      page: Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1,
    }
  },
  beforeLoad: () => requireFeatureAndModuleAccess("support", "support"),
  component: SupportLayout,
})
