import { queryOptions } from "@tanstack/react-query"

import { fetchCustomerSettings } from "@/lib/customer-fields"
import { queryClient } from "@/lib/query-client"

export const CUSTOMER_FIELD_SETTINGS_QUERY_KEY = ["customers", "field-settings"] as const

export const customerFieldSettingsQueryOptions = queryOptions({
  queryKey: CUSTOMER_FIELD_SETTINGS_QUERY_KEY,
  queryFn: ({ signal }) => fetchCustomerSettings(signal),
  staleTime: 5 * 60_000,
})

export function invalidateCustomerFieldSettings() {
  return queryClient.invalidateQueries({ queryKey: CUSTOMER_FIELD_SETTINGS_QUERY_KEY })
}

/** Cached drop-in replacement for fetchCustomerSettings in plain functions. */
export function getCustomerFieldSettings() {
  return queryClient.fetchQuery(customerFieldSettingsQueryOptions)
}
