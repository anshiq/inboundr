import { queryOptions } from "@tanstack/react-query"

import { API_ORIGIN } from "@/lib/env"
import { queryClient } from "@/lib/query-client"

export const ORGANIZATION_MEMBERS_QUERY_KEY = ["organization", "members"] as const

export const organizationMembersQueryOptions = queryOptions({
  queryKey: ORGANIZATION_MEMBERS_QUERY_KEY,
  queryFn: async () => {
    const response = await fetch(`${API_ORIGIN}/api/v1/organization/members`, {
      credentials: "include",
    })
    const data = await response.json().catch(() => null)
    // data is null when the body isn't valid JSON, even on a 2xx response.
    if (!response.ok || data == null)
      throw new Error(data?.error || "Failed to load members")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data as { members?: any[] }
  },
  staleTime: 5 * 60_000,
})

export function invalidateOrganizationMembers() {
  return queryClient.invalidateQueries({ queryKey: ORGANIZATION_MEMBERS_QUERY_KEY })
}
