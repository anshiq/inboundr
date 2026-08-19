import { useMemo } from "react"
import {
  BriefcaseBusinessIcon,
  CircleCheckBigIcon,
  UserRoundPlusIcon,
  UsersRoundIcon,
} from "lucide-react"

import type { RecruitmentDashboard } from "@/lib/recruitment"

export interface OverviewProps {
  data: RecruitmentDashboard
}

export function relativeDate(value: string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value))
}

/** "careers_site" → "Careers site" — raw enum values read like slop. */
export function formatSourceLabel(source: string) {
  const cleaned = source.replace(/[_-]+/g, " ").trim()
  if (!cleaned) return "Unknown"
  return cleaned[0].toUpperCase() + cleaned.slice(1)
}

/** Cycle through the theme's warm chart scale for categorical fills. */
export function chartColor(index: number) {
  return `var(--chart-${(index % 5) + 1})`
}

export interface SummaryStat {
  key: string
  label: string
  value: number
  note: string
  icon: typeof UsersRoundIcon
}

/** One shared definition of the four headline KPIs so every variant agrees on semantics. */
export function useSummaryStats(data: RecruitmentDashboard): SummaryStat[] {
  return useMemo(
    () => [
      {
        key: "openRoles",
        label: "Open Roles",
        value: data.summary.openJobs,
        note: "Currently recruiting",
        icon: BriefcaseBusinessIcon,
      },
      {
        key: "activeApplicants",
        label: "Active Applicants",
        value: data.summary.activeApplications,
        note: `${data.summary.totalApplications} all time`,
        icon: UsersRoundIcon,
      },
      {
        key: "newApplications",
        label: "New Applications",
        value: data.summary.newApplications,
        note: `${data.summary.newCandidates} new candidates · last ${data.periodDays} days`,
        icon: UserRoundPlusIcon,
      },
      {
        key: "hires",
        label: "Hires",
        value: data.summary.hires,
        note: `Last ${data.periodDays} days`,
        icon: CircleCheckBigIcon,
      },
    ],
    [data]
  )
}

/** Aggregated application counts per stage name, largest first. */
export function useStageTotals(data: RecruitmentDashboard, limit = 8) {
  return useMemo(() => {
    const totals = new Map<string, number>()
    data.applicationsByStage.forEach((row) =>
      totals.set(row.stageName, (totals.get(row.stageName) ?? 0) + row.count)
    )
    return [...totals]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }, [data, limit])
}

/** Source rows with human-readable labels, largest first. */
export function useSourceRows(data: RecruitmentDashboard, limit = 8) {
  return useMemo(
    () =>
      [...data.applicationsBySource]
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
        .map((row) => ({ name: formatSourceLabel(row.source), count: row.count })),
    [data, limit]
  )
}

export function rankingNeedsAttention(data: RecruitmentDashboard) {
  return data.ranking.failures > 0 || data.ranking.manualReview > 0
}

export const RANKING_CELLS = [
  { key: "queued", label: "Queued" },
  { key: "processing", label: "Processing" },
  { key: "backlog", label: "Backlog" },
  { key: "failures", label: "Failed" },
  { key: "manualReview", label: "Review" },
] as const
