import { createFileRoute } from "@tanstack/react-router"

import { requireFeatureAndModuleAccess } from "@/lib/auth-guards"
import StatsPage from "@/pages/stats-page"

export const Route = createFileRoute("/rfq_/stats")({
  beforeLoad: () => requireFeatureAndModuleAccess("rfq", "rfq"),
  component: StatsPage,
})
