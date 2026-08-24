import { queryOptions, useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { CheckCircle2Icon, ReceiptTextIcon } from "lucide-react"

import { API_ORIGIN } from "@/lib/env"
import { formatMoney, formatRelativeTime } from "@/lib/format"
import { invoiceStatsQueryOptions } from "@/lib/queries"

import {
  DashboardCard,
  RowChevron,
  WidgetAvatar,
  WidgetEmpty,
  WidgetError,
  WidgetRowsSkeleton,
  widgetRowClass,
} from "./dashboard-card"

interface InvoiceRow {
  _id: string
  invoiceNumber: string
  status: string
  dueDate: string | null
  customerSnapshot: { name: string; company: string }
  totals: { balanceDue: number }
}

interface InvoiceStats {
  outstanding: number
  overdue: number
}

function InvoiceRowItem({ invoice }: { invoice: InvoiceRow }) {
  const customer = invoice.customerSnapshot?.company || invoice.customerSnapshot?.name || "—"
  return (
    <Link to="/invoices/$id" params={{ id: invoice._id }} className={widgetRowClass}>
      <WidgetAvatar name={customer} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{customer}</p>
        <p className="truncate text-xs text-muted-foreground">
          {invoice.invoiceNumber}
          {invoice.dueDate ? (
            <span className="text-destructive"> · due {formatRelativeTime(invoice.dueDate)}</span>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-sm font-medium tabular-nums">
          {formatMoney(invoice.totals?.balanceDue ?? 0)}
        </span>
        <RowChevron />
      </div>
    </Link>
  )
}

const overdueInvoicesQueryOptions = queryOptions({
  queryKey: ["invoices", "overdue-widget"],
  queryFn: async () => {
    const res = await fetch(`${API_ORIGIN}/api/v1/invoices?status=overdue&limit=5`, {
      credentials: "include",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as { invoices: InvoiceRow[] }
  },
  staleTime: 60_000,
})

export function InvoicesActiveCard() {
  const { data: list, error: listError } = useQuery(overdueInvoicesQueryOptions)
  const { data: statsData } = useQuery(invoiceStatsQueryOptions)

  const invoices = list?.invoices ?? null
  const stats = (statsData as InvoiceStats | undefined) ?? null
  const error = listError ? listError.message || "Failed to load invoices" : null

  return (
    <DashboardCard
      title="Overdue Invoices"
      icon={ReceiptTextIcon}
      to="/invoices"
      headerAction={
        stats && stats.overdue > 0 ? (
          <span className="shrink-0 text-xs font-medium text-destructive tabular-nums">
            {formatMoney(stats.overdue)}
          </span>
        ) : stats ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatMoney(stats.outstanding)} outstanding
          </span>
        ) : undefined
      }
    >
      {error ? (
        <WidgetError message={error} />
      ) : invoices === null ? (
        <WidgetRowsSkeleton rows={4} />
      ) : invoices.length === 0 ? (
        <WidgetEmpty
          icon={CheckCircle2Icon}
          title="Nothing overdue"
          description="Invoices past their due date will show up here."
        />
      ) : (
        <div className="flex flex-col">
          {invoices.map((invoice) => (
            <InvoiceRowItem key={invoice._id} invoice={invoice} />
          ))}
        </div>
      )}
    </DashboardCard>
  )
}
