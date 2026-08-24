import { queryOptions } from "@tanstack/react-query"

import { API_ORIGIN } from "@/lib/env"
import { queryClient } from "@/lib/query-client"

export const GMAIL_ACCOUNTS_QUERY_KEY = ["gmail", "accounts"] as const

export const gmailAccountsQueryOptions = queryOptions({
  queryKey: GMAIL_ACCOUNTS_QUERY_KEY,
  queryFn: async () => {
    const response = await fetch(`${API_ORIGIN}/api/v1/gmail/accounts`, {
      credentials: "include",
    })
    const data = await response.json().catch(() => null)
    // data is null when the body isn't valid JSON, even on a 2xx response.
    if (!response.ok || data == null)
      throw new Error(data?.error || `HTTP ${response.status}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data as { accounts?: any[] }
  },
  staleTime: 5 * 60_000,
})

export function invalidateGmailAccounts() {
  return queryClient.invalidateQueries({ queryKey: GMAIL_ACCOUNTS_QUERY_KEY })
}
