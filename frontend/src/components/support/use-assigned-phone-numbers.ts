import { useEffect, useState } from "react"

import { supportCallSettingsQueryOptions } from "@/lib/queries"
import { queryClient } from "@/lib/query-client"

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
        const data = await queryClient.fetchQuery(supportCallSettingsQueryOptions)
        if (cancelled) return
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
