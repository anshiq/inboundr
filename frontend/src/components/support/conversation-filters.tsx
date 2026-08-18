import { useState } from "react"
import { CalendarIcon, FilterIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { SupportDateField, SupportListSort } from "./support-provider"
import { TAG_DOT_STYLES } from "./tag-chip"
import type {
  ResolutionReason,
  SupportTicketTag,
  SupportTicketTagColor,
  TicketFilter,
} from "./types"

export type ConversationFilterValue = {
  sort: SupportListSort
  tags: string[]
  reason: string
  dateField: SupportDateField
  /** Inclusive range bounds as YYYY-MM-DD in the user's local timezone. */
  from: string
  to: string
}

export const SORT_LABELS: Record<SupportListSort, string> = {
  recent: "Recent Activity",
  newest: "Newest First",
  oldest: "Oldest First",
  most_messages: "Most Messages",
}

function toDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function fromDay(day: string): Date | undefined {
  if (!day) return undefined
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}

export function formatDayRange(from: string, to: string): string {
  const format = (day: string) =>
    fromDay(day)?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) ?? ""
  if (from && to) return from === to ? format(from) : `${format(from)} – ${format(to)}`
  if (from) return `From ${format(from)}`
  return `Until ${format(to)}`
}

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return toDay(date)
}

const DATE_PRESETS: { label: string; from: () => string }[] = [
  { label: "Today", from: () => daysAgo(0) },
  { label: "Last 7 Days", from: () => daysAgo(6) },
  { label: "Last 30 Days", from: () => daysAgo(29) },
]

export function activeFilterCount(value: ConversationFilterValue): number {
  let count = 0
  if (value.sort !== "recent") count += 1
  if (value.tags.length > 0) count += 1
  if (value.reason) count += 1
  if (value.from || value.to) count += 1
  return count
}

export function ConversationFilters({
  value,
  status,
  ticketTags,
  resolutionReasons,
  onChange,
  onClear,
}: {
  value: ConversationFilterValue
  status: TicketFilter
  ticketTags: SupportTicketTag[]
  resolutionReasons: ResolutionReason[]
  onChange: (patch: Partial<ConversationFilterValue>) => void
  onClear: () => void
}) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const count = activeFilterCount(value)
  const range: DateRange | undefined =
    value.from || value.to
      ? { from: fromDay(value.from), to: fromDay(value.to) }
      : undefined

  const activePreset = DATE_PRESETS.find(
    (preset) => value.from === preset.from() && value.to === daysAgo(0)
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative size-9 shrink-0"
          aria-label="Filters"
        >
          <FilterIcon />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Filters</p>
          {count > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Sort by</p>
            <Select
              value={value.sort}
              onValueChange={(sort) => onChange({ sort: sort as SupportListSort })}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SupportListSort[]).map((sort) => (
                  <SelectItem key={sort} value={sort}>
                    {SORT_LABELS[sort]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Date</p>
            <div className="flex items-center gap-1.5">
              <Select
                value={value.dateField}
                onValueChange={(dateField) =>
                  onChange({ dateField: dateField as SupportDateField })
                }
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="activity">Last Activity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DATE_PRESETS.map((preset) => {
                const active = activePreset?.label === preset.label
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      active
                        ? onChange({ from: "", to: "" })
                        : onChange({ from: preset.from(), to: daysAgo(0) })
                    }
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2 font-normal">
                  <CalendarIcon className="text-muted-foreground" />
                  {value.from || value.to ? (
                    <span>{formatDayRange(value.from, value.to)}</span>
                  ) : (
                    <span className="text-muted-foreground">Custom range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="range"
                  numberOfMonths={1}
                  selected={range}
                  defaultMonth={range?.from}
                  disabled={{ after: new Date() }}
                  onSelect={(next) => {
                    onChange({
                      from: next?.from ? toDay(next.from) : "",
                      to: next?.to ? toDay(next.to) : next?.from ? toDay(next.from) : "",
                    })
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {status === "resolved" && resolutionReasons.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Resolution Reason</p>
              <Select
                value={value.reason || "all"}
                onValueChange={(reason) => onChange({ reason: reason === "all" ? "" : reason })}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="All Reasons" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reasons</SelectItem>
                  {resolutionReasons.map((reason) => (
                    <SelectItem key={reason.id} value={reason.id}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {ticketTags.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Tags</p>
              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                {ticketTags.map((tag) => {
                  const isSelected = value.tags.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() =>
                        onChange({
                          tags: isSelected
                            ? value.tags.filter((id) => id !== tag.id)
                            : [...value.tags, tag.id],
                        })
                      }
                      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                    >
                      <Checkbox checked={isSelected} className="pointer-events-none" tabIndex={-1} />
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          TAG_DOT_STYLES[tag.color as SupportTicketTagColor] ?? TAG_DOT_STYLES.slate
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
