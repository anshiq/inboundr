import { Link } from "@tanstack/react-router"
import {
  AlertTriangleIcon,
  BriefcaseBusinessIcon,
  CalendarClockIcon,
  CircleCheckBigIcon,
  Clock3Icon,
  InboxIcon,
  MegaphoneIcon,
  SparklesIcon,
} from "lucide-react"

import {
  DashboardCard,
  RowChevron,
  WidgetAvatar,
  WidgetEmpty,
  WidgetStageChip,
  widgetRowClass,
} from "@/components/home/dashboard-card"
import { cn } from "@/lib/utils"

import {
  chartColor,
  RANKING_CELLS,
  rankingNeedsAttention,
  relativeDate,
  useSourceRows,
  useStageTotals,
  useSummaryStats,
  type OverviewProps,
} from "./shared"

/**
 * Widgets — composes the homepage's DashboardCard primitives into a
 * recruitment widget board: compact stat tiles plus scannable widget rows.
 */
export function OverviewWidgets({ data }: OverviewProps) {
  const stats = useSummaryStats(data)
  const stageTotals = useStageTotals(data, 6)
  const sourceRows = useSourceRows(data, 6)
  const attention = rankingNeedsAttention(data)
  const maxStage = Math.max(...stageTotals.map((row) => row.count), 1)

  return (
    <div className="space-y-4 animate-in fade-in-0 duration-500">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ key, label, value, note, icon: Icon }) => (
          <div key={key} className="rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="size-4 text-primary" />
              </span>
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DashboardCard title="Applications by Role" icon={BriefcaseBusinessIcon} to="/recruitment/jobs">
          {data.applicationsByJob.length ? (
            <div className="flex flex-col">
              {data.applicationsByJob.slice(0, 5).map((row, index) => (
                <Link
                  key={row.jobId}
                  to="/recruitment/jobs/$jobId"
                  params={{ jobId: row.jobId }}
                  className={widgetRowClass}
                >
                  <WidgetStageChip color={chartColor(index)} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.jobTitle}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{row.count}</span>
                  <RowChevron />
                </Link>
              ))}
            </div>
          ) : (
            <WidgetEmpty icon={InboxIcon} title="No Applications Yet" description="Roles will list here once candidates apply." />
          )}
        </DashboardCard>

        <DashboardCard title="Pipeline Stages" icon={SparklesIcon} to="/recruitment/applicants" viewAllLabel="Applicants">
          {stageTotals.length ? (
            <div className="flex flex-col gap-1 px-2.5 py-1.5">
              {stageTotals.map((row, index) => (
                <div key={row.name} className="py-1.5">
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{row.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{row.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(row.count / maxStage) * 100}%`, backgroundColor: chartColor(index) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <WidgetEmpty icon={InboxIcon} title="No Pipeline Data" description="Stage distribution appears after applications arrive." />
          )}
        </DashboardCard>

        <DashboardCard title="Application Sources" icon={MegaphoneIcon}>
          {sourceRows.length ? (
            <div className="flex flex-col">
              {sourceRows.map((row, index) => (
                <div key={row.name} className="flex items-center gap-3 px-2.5 py-2.5">
                  <WidgetStageChip color={chartColor(index)} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{row.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <WidgetEmpty icon={MegaphoneIcon} title="No Source Data" description="Sources appear once candidates start applying." />
          )}
        </DashboardCard>

        <DashboardCard title="Pipeline Aging" icon={Clock3Icon} bodyClassName="p-4 pt-2">
          <dl className="grid grid-cols-2 gap-3">
            {[
              { label: "Avg application", value: data.aging.averageApplicationAgeDays },
              { label: "Avg in stage", value: data.aging.averageCurrentStageAgeDays },
              { label: "Oldest application", value: data.aging.oldestApplicationAgeDays },
              { label: "Longest in stage", value: data.aging.oldestCurrentStageAgeDays },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-muted/40 p-3">
                <dt className="truncate text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {value ?? "—"}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">days</span>
                </dd>
              </div>
            ))}
          </dl>
        </DashboardCard>

        <DashboardCard
          title="Ranking Queue"
          icon={attention ? AlertTriangleIcon : CircleCheckBigIcon}
          bodyClassName="p-4 pt-2"
          className={cn(attention && "border-warning/40")}
        >
          <div className="grid grid-cols-5 gap-2 text-center">
            {RANKING_CELLS.map(({ key, label }) => (
              <div key={key} className="rounded-lg bg-muted/40 px-1 py-2.5">
                <p className="text-lg font-semibold tabular-nums">{data.ranking[key]}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            {attention ? (
              <>
                <AlertTriangleIcon className="size-3.5 text-warning" />
                Some rankings need attention.
              </>
            ) : (
              <>
                <CircleCheckBigIcon className="size-3.5 text-success" />
                Ranking pipeline is healthy.
              </>
            )}
          </p>
        </DashboardCard>

        <DashboardCard title="Recent Activity" icon={CalendarClockIcon} to="/recruitment/applicants" viewAllLabel="Applicants">
          {data.recentActivity.length ? (
            <div className="flex flex-col">
              {data.recentActivity.slice(0, 5).map((item) => (
                <div key={item._id} className="flex items-center gap-3 px-2.5 py-2">
                  <WidgetAvatar name={item.actorName || "Workspace"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{item.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.actorName || "Workspace"} · {relativeDate(item.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <WidgetEmpty icon={CalendarClockIcon} title="No Activity Yet" description="Hiring activity will collect here as your team starts working." />
          )}
        </DashboardCard>
      </div>
    </div>
  )
}
