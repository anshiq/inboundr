import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BuildingIcon,
  CalendarClockIcon,
  CheckIcon,
  ListTodoIcon,
  MailIcon,
  PhoneCallIcon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import { EmptyState, ErrorState, ListSkeleton } from "@/components/list-states"
import { Button } from "@/components/ui/button"
import {
  listAllPlannedActivities,
  markActivityDone,
  type AgendaActivity,
  type LeadActivityType,
} from "@/lib/crm"
import { formatRelativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"

const TYPE_META: Record<LeadActivityType, { label: string; icon: typeof PhoneCallIcon }> = {
  call: { label: "Call", icon: PhoneCallIcon },
  meeting: { label: "Meeting", icon: UsersIcon },
  todo: { label: "To-do", icon: ListTodoIcon },
  email: { label: "Email", icon: MailIcon },
}

type GroupKey = "overdue" | "today" | "week" | "later" | "unscheduled"

const GROUP_ORDER: GroupKey[] = ["overdue", "today", "week", "later", "unscheduled"]

const GROUP_LABELS: Record<GroupKey, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This Week",
  later: "Later",
  unscheduled: "No Due Date",
}

function groupFor(dueDate: string | null): GroupKey {
  if (!dueDate) return "unscheduled"
  const due = new Date(dueDate)
  const now = new Date()
  if (due.getTime() < now.getTime()) return "overdue"

  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)
  if (due <= endOfToday) return "today"

  const endOfWeek = new Date(endOfToday)
  endOfWeek.setDate(endOfWeek.getDate() + 6)
  if (due <= endOfWeek) return "week"

  return "later"
}

function ActivityRow({
  activity,
  onOpenLead,
  onDone,
  completing,
}: {
  activity: AgendaActivity
  onOpenLead: (id: string) => void
  onDone: (id: string) => void
  completing: boolean
}) {
  const meta = TYPE_META[activity.type]
  const Icon = meta.icon
  const overdue = activity.dueDate != null && new Date(activity.dueDate).getTime() < Date.now()

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition hover:border-border hover:shadow-md">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          overdue ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
        )}
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{activity.summary}</p>
        <button
          type="button"
          onClick={() => onOpenLead(activity.lead._id)}
          className="mt-0.5 flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          <BuildingIcon className="size-3 shrink-0" />
          <span className="truncate">
            {activity.lead.title}
            {activity.lead.company ? ` · ${activity.lead.company}` : ""}
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {activity.dueDate && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              overdue ? "text-destructive" : "text-muted-foreground"
            )}
          >
            <CalendarClockIcon className="size-3.5" />
            {formatRelativeTime(activity.dueDate)}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={completing}
          onClick={() => onDone(activity._id)}
        >
          <CheckIcon className="size-4" />
          Done
        </Button>
      </div>
    </div>
  )
}

export function LeadActivitiesView({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const [activities, setActivities] = useState<AgendaActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await listAllPlannedActivities()
      setActivities(data.activities)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activities")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleDone(activityId: string) {
    setCompletingId(activityId)
    try {
      await markActivityDone(activityId)
      setActivities((prev) => prev.filter((activity) => activity._id !== activityId))
      toast.success("Activity completed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete activity")
    } finally {
      setCompletingId(null)
    }
  }

  const groups = useMemo(() => {
    const map = new Map<GroupKey, AgendaActivity[]>()
    for (const activity of activities) {
      const key = groupFor(activity.dueDate)
      const list = map.get(key) ?? []
      list.push(activity)
      map.set(key, list)
    }
    return map
  }, [activities])

  if (loading) return <ListSkeleton rows={5} columns={1} />
  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (activities.length === 0) {
    return (
      <EmptyState
        icon={CalendarClockIcon}
        title="No Planned Activities"
        description="Schedule calls, meetings, and to-dos from any lead's detail page."
      />
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {GROUP_ORDER.map((key) => {
          const list = groups.get(key)
          if (!list || list.length === 0) return null
          return (
            <section key={key}>
              <h3
                className={cn(
                  "mb-2 text-xs font-semibold tracking-wide uppercase",
                  key === "overdue" ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {GROUP_LABELS[key]}
                <span className="ml-1.5 font-normal">({list.length})</span>
              </h3>
              <div className="flex flex-col gap-2">
                {list.map((activity) => (
                  <ActivityRow
                    key={activity._id}
                    activity={activity}
                    onOpenLead={onOpenLead}
                    onDone={(id) => void handleDone(id)}
                    completing={completingId === activity._id}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
