import { redirect } from "@tanstack/react-router"

import { clearOrganizationSessionStorage } from "@/lib/auth-storage"
import { adminMeQueryOptions } from "@/lib/queries/admin"
import {
  organizationMeQueryOptions,
  sessionQueryOptions,
  type OrganizationMeResponse,
} from "@/lib/queries"
import { queryClient } from "@/lib/query-client"
import type { EmployeeAccessModule, FeatureKey } from "@/lib/entitlements"

export async function requireSession() {
  let session = await queryClient.ensureQueryData(sessionQueryOptions)

  if (!session) {
    // The cache may hold a stale signed-out result from before the user
    // logged in, so confirm with a fresh request before redirecting.
    session = await queryClient.fetchQuery({ ...sessionQueryOptions, staleTime: 0 })
  }

  if (!session) {
    throw redirect({ to: "/login" })
  }

  return session
}

export async function redirectIfAuthenticated() {
  const session = await queryClient.fetchQuery({ ...sessionQueryOptions, staleTime: 0 })

  if (session) {
    throw redirect({ to: "/" })
  }

  clearOrganizationSessionStorage()
}

export async function requireSuperAdmin() {
  await requireSession()
  const { isSuperAdmin } = await queryClient.ensureQueryData(adminMeQueryOptions)

  if (!isSuperAdmin) {
    throw redirect({ to: "/" })
  }
}

async function getOrganizationAccess(): Promise<OrganizationMeResponse> {
  try {
    return await queryClient.ensureQueryData(organizationMeQueryOptions)
  } catch {
    throw redirect({ to: "/" })
  }
}

function assertFeatureAccess(data: OrganizationMeResponse, feature: FeatureKey) {
  if (!data.entitlements?.effectiveFeatures?.includes(feature)) {
    throw redirect({ to: "/" })
  }
}

function assertModuleAccess(data: OrganizationMeResponse, module: EmployeeAccessModule) {
  const access = data.employeeAccess
  if (access && (!access.enabled || (access.restricted && !access.allowedModules?.includes(module)))) {
    throw redirect({ to: "/" })
  }
}

export async function requireFeatureAccess(feature: FeatureKey) {
  await requireSession()
  assertFeatureAccess(await getOrganizationAccess(), feature)
}

export async function requireModuleAccess(module: EmployeeAccessModule) {
  await requireSession()
  assertModuleAccess(await getOrganizationAccess(), module)
}

export async function requireFeatureAndModuleAccess(feature: FeatureKey, module: EmployeeAccessModule) {
  await requireSession()
  const data = await getOrganizationAccess()
  assertFeatureAccess(data, feature)
  assertModuleAccess(data, module)
}
