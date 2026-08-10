import { useMemo, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, CalendarClockIcon, HandshakeIcon, TrophyIcon } from "lucide-react"

import { EmptyState } from "@/components/list-states"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { BoardLead, LeadStage } from "@/lib/crm"
import { formatMoney, formatRelativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"

type SortKey = "title" | "stage" | "expectedRevenue" | "nextActivity" | "updatedAt"

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  form: "Form",
  contact: "Contact Form",
  import: "Import",
}

function StatusBadge({ status }: { status: BoardLead["status"] }) {
  if (status === "won") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
        <TrophyIcon className="size-3" />
        Won
      </span>
    )
  }
  if (status === "lost") {
    return (
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
        Lost
      </span>
    )
  }
  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
      Active
    </span>
  )
}

export function LeadListView({
  leads,
  stages,
  onOpenLead,
}: {
  leads: BoardLead[]
  stages: LeadStage[]
  onOpenLead: (id: string) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt")
  const [sortAsc, setSortAsc] = useState(false)

  const stageById = useMemo(() => new Map(stages.map((stage) => [stage._id, stage])), [stages])

  const sorted = useMemo(() => {
    const list = [...leads]
    const direction = sortAsc ? 1 : -1
    list.sort((a, b) => {
      switch (sortKey) {
        case "title":
          return a.title.localeCompare(b.title) * direction
        case "stage": {
          const orderA = stageById.get(a.stageId)?.order ?? Number.MAX_SAFE_INTEGER
          const orderB = stageById.get(b.stageId)?.order ?? Number.MAX_SAFE_INTEGER
          return (orderA - orderB) * direction
        }
        case "expectedRevenue":
          return ((a.expectedRevenue ?? -1) - (b.expectedRevenue ?? -1)) * direction
        case "nextActivity": {
          // Leads without a planned activity sink to the bottom regardless of direction.
          const timeA = a.nextActivity?.dueDate ? new Date(a.nextActivity.dueDate).getTime() : null
          const timeB = b.nextActivity?.dueDate ? new Date(b.nextActivity.dueDate).getTime() : null
          if (timeA == null && timeB == null) return 0
          if (timeA == null) return 1
          if (timeB == null) return -1
          return (timeA - timeB) * direction
        }
        case "updatedAt":
        default:
          return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * direction
      }
    })
    return list
  }, [leads, sortKey, sortAsc, stageById])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((current) => !current)
    } else {
      setSortKey(key)
      setSortAsc(key === "title" || key === "stage" || key === "nextActivity")
    }
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={HandshakeIcon}
        title="No Leads Found"
        description="Create a lead or adjust your search to see results here."
      />
    )
  }

  const SortableHead = ({ label, columnKey, className }: { label: string; columnKey: SortKey; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(columnKey)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
      >
        {label}
        {sortKey === columnKey &&
          (sortAsc ? <ArrowUpIcon className="size-3.5" /> : <ArrowDownIcon className="size-3.5" />)}
      </button>
    </TableHead>
  )

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <SortableHead label="Lead" columnKey="title" />
              <TableHead>Contact</TableHead>
              <SortableHead label="Stage" columnKey="stage" />
              <SortableHead label="Expected Revenue" columnKey="expectedRevenue" className="text-right" />
              <SortableHead label="Next Activity" columnKey="nextActivity" />
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <SortableHead label="Updated" columnKey="updatedAt" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((lead) => {
              const stage = stageById.get(lead.stageId)
              const overdue =
                lead.nextActivity?.dueDate != null &&
                new Date(lead.nextActivity.dueDate).getTime() < Date.now()
              return (
                <TableRow
                  key={lead._id}
                  className="cursor-pointer"
                  onClick={() => onOpenLead(lead._id)}
                >
                  <TableCell className="max-w-64">
                    <span className="block truncate font-medium">{lead.title}</span>
                  </TableCell>
                  <TableCell className="max-w-52 text-muted-foreground">
                    <span className="block truncate">
                      {[lead.contactName, lead.company].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                      {stage?.name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {lead.expectedRevenue != null ? formatMoney(lead.expectedRevenue) : "—"}
                  </TableCell>
                  <TableCell>
                    {lead.nextActivity ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs font-medium",
                          overdue ? "text-destructive" : "text-emerald-600"
                        )}
                      >
                        <CalendarClockIcon className="size-3.5" />
                        {lead.nextActivity.dueDate
                          ? formatRelativeTime(lead.nextActivity.dueDate)
                          : "Planned"}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {SOURCE_LABELS[lead.source] ?? lead.source}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelativeTime(lead.updatedAt)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
