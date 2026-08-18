import { useEffect, useState } from "react"

import { API_ORIGIN } from "@/lib/env"

export type AssignedPhoneNumber = {
  id: string
  phoneNumber: string
  label: string
  status: string
}

export function useAssignedPhoneNumbers() {
  const [numbers, setNumbers] = useState<AssignedPhoneNumber[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${API_ORIGIN}/api/v1/support/call/settings`, {
          credentials: "include",
        })
        const data = await res.json().catch(() => null)
        if (!res.ok || cancelled) return
        const active = (data?.phoneNumbers ?? []).filter(
          (number: AssignedPhoneNumber) => number.status === "active"
        )
        setNumbers(active)
      } catch {
        // Voice support is optional; quietly skip the button.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return numbers
}
