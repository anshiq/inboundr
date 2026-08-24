import { queryOptions } from "@tanstack/react-query"

import { API_ORIGIN } from "@/lib/env"

/**
 * Small, rarely changing picklists shared by the asset and service pages.
 * Consumers cast the loose record arrays to their local option types.
 */

export const employeesCatalogQueryOptions = queryOptions({
  queryKey: ["catalog", "employees"],
  queryFn: async () => {
    const response = await fetch(`${API_ORIGIN}/api/v1/employees?limit=100`, {
      credentials: "include",
    })
    const data = await response.json().catch(() => null)
    // data is null when the body isn't valid JSON, even on a 2xx response;
    // consumers read data.employees directly, so surface it as an error.
    if (!response.ok || data == null)
      throw new Error(data?.error || "Failed to load employees")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data as { employees?: any[] }
  },
  staleTime: 5 * 60_000,
})

export const customersCatalogQueryOptions = queryOptions({
  queryKey: ["catalog", "customers"],
  queryFn: async () => {
    const response = await fetch(`${API_ORIGIN}/api/v1/customers?limit=100`, {
      credentials: "include",
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || data == null)
      throw new Error(data?.error || "Failed to load customers")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data as { customers?: any[] }
  },
  staleTime: 5 * 60_000,
})
