import { queryOptions } from "@tanstack/react-query"

import { API_ORIGIN } from "@/lib/env"
import { queryClient } from "@/lib/query-client"

export const INVOICE_STATS_QUERY_KEY = ["invoices", "stats"] as const

// Shared between the invoices page stat cards and the home overdue widget.
export const invoiceStatsQueryOptions = queryOptions({
  queryKey: INVOICE_STATS_QUERY_KEY,
  queryFn: async () => {
    const response = await fetch(`${API_ORIGIN}/api/v1/invoices/stats`, {
      credentials: "include",
    })
    const data = await response.json().catch(() => null)
    // data is null when the body isn't valid JSON, even on a 2xx response.
    if (!response.ok || data == null)
      throw new Error(data?.error || "Failed to load invoice stats")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data as Record<string, any>
  },
  staleTime: 60_000,
})

export function invalidateInvoiceStats() {
  return queryClient.invalidateQueries({ queryKey: INVOICE_STATS_QUERY_KEY })
}
