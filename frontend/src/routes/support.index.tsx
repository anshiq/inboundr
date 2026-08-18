import { createFileRoute } from "@tanstack/react-router"

import SupportListPage from "@/pages/support-list-page"

// Search params (status, q, tags, reason, page) are validated on the parent
// /support layout route. In panes mode the layout renders the inbox shell
// itself, so this component only appears in table mode.
export const Route = createFileRoute("/support/")({
  component: SupportListPage,
})
