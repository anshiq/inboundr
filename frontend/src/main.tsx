import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { PostHogProvider } from "@posthog/react"
import posthog from "posthog-js"

import "./index.css"
import { router } from "./router"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { AppVersionCheck } from "@/components/app-version-check"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { OrganizationBrandingProvider } from "@/lib/organization-branding"
import { EntitlementProvider } from "@/lib/entitlements"
import { NotificationProvider } from "@/lib/notifications-context"
import { API_ORIGIN, POSTHOG_ENABLED, POSTHOG_HOST, POSTHOG_PROJECT_TOKEN } from "@/lib/env"
import { installOrganizationFetchContext } from "@/lib/organization-context"
import { installQueryCacheListeners } from "@/lib/queries"
import { queryClient } from "@/lib/query-client"
import { renderASCIILogo } from "@/lib/branding"

if (POSTHOG_ENABLED) {
  posthog.init(POSTHOG_PROJECT_TOKEN, {
    api_host: POSTHOG_HOST,
    defaults: "2026-01-30",
  })
}

installOrganizationFetchContext(API_ORIGIN)
installQueryCacheListeners()
renderASCIILogo()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <OrganizationBrandingProvider>
            <EntitlementProvider>
              <TooltipProvider>
                <NotificationProvider>
                  <RouterProvider router={router} />
                  <AppVersionCheck />
                  <Toaster richColors position="top-right" />
                </NotificationProvider>
              </TooltipProvider>
            </EntitlementProvider>
          </OrganizationBrandingProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </PostHogProvider>
  </StrictMode>
)
