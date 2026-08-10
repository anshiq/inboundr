import { createFileRoute } from "@tanstack/react-router"

import { requireFeatureAndModuleAccess } from "@/lib/auth-guards"
import CrmLeadDetailPage from "@/pages/crm-lead-detail-page"

export const Route = createFileRoute("/crm_/$id")({
  beforeLoad: () => requireFeatureAndModuleAccess("crm", "crm"),
  component: CrmLeadDetailPage,
})
