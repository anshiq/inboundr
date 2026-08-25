import { QueryClient } from "@tanstack/react-query"

// Module-level singleton so plain functions (route guards in beforeLoad,
// event listeners) can share the same cache as React components.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
})
