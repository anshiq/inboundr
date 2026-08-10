import { createFileRoute, redirect } from "@tanstack/react-router"

// Stats moved into the RFQ module; keep old bookmarks working.
export const Route = createFileRoute("/stats")({
  beforeLoad: () => {
    throw redirect({ to: "/rfq/stats" })
  },
})
