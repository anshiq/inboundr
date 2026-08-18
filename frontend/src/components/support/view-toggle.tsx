import { Columns2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { setSupportView, useSupportView } from "./use-support-view"

/** Single icon button that toggles between the panes (inbox) and table views,
 * mirroring the details-panel toggle in the conversation header. */
export function SupportViewToggle() {
  const view = useSupportView()
  const tableActive = view === "table"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={tableActive ? "secondary" : "outline"}
          size="icon-sm"
          onClick={() => setSupportView(tableActive ? "panes" : "table")}
          aria-label="Toggle table view"
          aria-pressed={tableActive}
        >
          <Columns2Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tableActive ? "Switch to inbox view" : "Switch to table view"}</TooltipContent>
    </Tooltip>
  )
}
