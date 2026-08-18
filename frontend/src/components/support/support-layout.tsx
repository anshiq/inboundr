import { Outlet } from "@tanstack/react-router"

import SupportInboxPage from "@/pages/support-inbox-page"
import { SupportProvider } from "./support-provider"
import { useSupportView } from "./use-support-view"

export function SupportLayout() {
  const view = useSupportView()
  return (
    <SupportProvider>
      {/* Panes mode renders one persistent split-inbox shell driven by the URL
          (so the list pane survives selection changes); table mode falls
          through to the classic per-route pages. */}
      {view === "panes" ? <SupportInboxPage /> : <Outlet />}
    </SupportProvider>
  )
}
