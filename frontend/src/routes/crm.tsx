import { createFileRoute } from "@tanstack/react-router"

import { requireFeatureAndModuleAccess } from "@/lib/auth-guards"
import CrmPipelinePage from "@/pages/crm-pipeline-page"

export const Route = createFileRoute("/crm")({
  beforeLoad: () => requireFeatureAndModuleAccess("crm", "crm"),
  component: CrmPipelinePage,
})
