import { Columns2Icon, TableIcon } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { setSupportView, useSupportView, type SupportView } from "./use-support-view"

const VIEWS: { value: SupportView; label: string; icon: typeof Columns2Icon }[] = [
  { value: "panes", label: "Inbox view", icon: Columns2Icon },
  { value: "table", label: "Table view", icon: TableIcon },
]

export function SupportViewToggle() {
  const view = useSupportView()

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted p-[3px]">
      {VIEWS.map((item) => {
        const active = view === item.value
        const Icon = item.icon
        return (
          <Tooltip key={item.value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={item.label}
                aria-pressed={active}
                onClick={() => setSupportView(item.value)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{item.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
