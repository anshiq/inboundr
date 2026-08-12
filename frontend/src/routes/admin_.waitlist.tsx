import { createFileRoute } from "@tanstack/react-router"

import { requireSuperAdmin } from "@/lib/auth-guards"
import AdminWaitlistPage from "@/pages/admin-waitlist-page"

export const Route = createFileRoute("/admin_/waitlist")({
  beforeLoad: requireSuperAdmin,
  component: AdminWaitlistPage,
})
