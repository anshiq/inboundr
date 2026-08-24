import { queryOptions } from "@tanstack/react-query"

import { getAdminMe } from "@/lib/admin"
import { API_ORIGIN } from "@/lib/env"

export const adminMeQueryOptions = queryOptions({
  queryKey: ["admin", "me"],
  queryFn: getAdminMe,
  staleTime: 5 * 60_000,
})

export const adminPlansQueryOptions = queryOptions({
  queryKey: ["admin", "plans"],
  queryFn: async () => {
    const response = await fetch(`${API_ORIGIN}/api/v1/admin/plans`, {
      credentials: "include",
    })
    const data = await response.json().catch(() => null)
    // data is null when the body isn't valid JSON, even on a 2xx response;
    // consumers read data.plans/data.features directly, so treat it as an error.
    if (!response.ok || data == null)
      throw new Error(data?.error || "Failed to load plans")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data as { plans?: any[]; features?: any[] }
  },
  staleTime: 5 * 60_000,
})
