import { USER_COLOR_THEME_STORAGE_KEY } from "@/components/theme-provider"
import { clearCachedBranding } from "@/lib/organization-branding"
import { ACTIVE_ORGANIZATION_ID_KEY } from "@/lib/organization-context"
import { queryClient } from "@/lib/query-client"

const SESSION_SCOPED_STORAGE_KEYS = [
  ACTIVE_ORGANIZATION_ID_KEY,
  USER_COLOR_THEME_STORAGE_KEY,
] as const

function removeLocalStorageItem(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

export function clearOrganizationSessionStorage() {
  if (typeof window === "undefined") return

  SESSION_SCOPED_STORAGE_KEYS.forEach(removeLocalStorageItem)
  clearCachedBranding()
  // Drop cached session/organization queries so data never leaks across
  // account boundaries (sign-in, sign-up, sign-out all pass through here).
  queryClient.clear()
}
