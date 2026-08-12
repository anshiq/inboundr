import { API_ORIGIN } from "@/lib/env"

export async function getAdminMe(): Promise<{ isSuperAdmin: boolean }> {
  const response = await fetch(`${API_ORIGIN}/api/v1/admin/me`, {
    credentials: "include",
  })

  if (!response.ok) {
    return { isSuperAdmin: false }
  }

  return response.json()
}

export interface WaitlistEntry {
  _id: string
  email: string
  name: string
  companyName: string
  referralSource: string
  referralSourceLabel: string
  createdAt: string
}

export async function listAdminWaitlist(): Promise<{
  entries: WaitlistEntry[]
  total: number
}> {
  const response = await fetch(`${API_ORIGIN}/api/v1/admin/waitlist`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to load the waitlist")
  }

  return response.json()
}
