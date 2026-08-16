import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArrowLeftIcon,
  CalendarClockIcon,
  CheckIcon,
  CheckSquareIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  HandshakeIcon,
  HistoryIcon,
  ListChecksIcon,
  MailIcon,
  Maximize2Icon,
  MessageSquareTextIcon,
  PenLineIcon,
  PlusIcon,
  RotateCcwIcon,
  SendIcon,
  TrophyIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { AppLayout } from "@/components/app-layout"
import { NoteContent } from "@/components/crm/note-content"
import type { NoteEditorApi } from "@/components/crm/note-editor"
import { DatePicker } from "@/components/date-picker"
import { ErrorState } from "@/components/list-states"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  archiveLead,
  convertLead,
  createActivity,
  deleteActivity,
  getBoard,
  getLead,
  listActivities,
  listGmailAccountOptions,
  listTimeline,
  markActivityDone,
  markLeadLost,
  moveLead,
  restoreLead,
  sendLeadEmail,
  updateActivity,
  updateLead,
  addNote,
  type GmailAccountOption,
  type Lead,
  type LeadActivity,
  type LeadActivityType,
  type LeadStage,
  type LeadTimelineEntry,
  type NoteAttachment,
} from "@/lib/crm"
import { formatDateTime, formatRelativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"

// TipTap only loads when someone actually opens a lead page.
const NoteEditor = lazy(() => import("@/components/crm/note-editor"))

const TEXTAREA_CLASS =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

const ACTIVITY_TYPE_OPTIONS: Array<{ value: LeadActivityType; label: string }> = [
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "todo", label: "To-do" },
  { value: "email", label: "Email" },
]

interface LeadFieldsForm {
  title: string
  contactName: string
  company: string
  email: string
  phone: string
  expectedRevenue: string
  probability: string
}

function leadToForm(lead: Lead): LeadFieldsForm {
  return {
    title: lead.title,
    contactName: lead.contactName ?? "",
    company: lead.company ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    expectedRevenue: lead.expectedRevenue != null ? String(lead.expectedRevenue) : "",
    probability: lead.probability != null ? String(lead.probability) : "",
  }
}

function StageStepper({
  stages,
  currentStageId,
  disabled,
  onSelect,
}: {
  stages: LeadStage[]
  currentStageId: string
  disabled: boolean
  onSelect: (stageId: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {stages.map((stage, index) => {
        const isCurrent = stage._id === currentStageId
        return (
          <div key={stage._id} className="flex items-center gap-1">
            {index > 0 && <ChevronRightIcon className="size-3.5 text-muted-foreground" />}
            <button
              type="button"
              disabled={disabled || isCurrent}
              onClick={() => onSelect(stage._id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                isCurrent
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                disabled && !isCurrent && "opacity-60"
              )}
            >
              {stage.name}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function ActivityRow({
  activity,
  onDone,
  onCancel,
  onDelete,
}: {
  activity: LeadActivity
  onDone: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const typeLabel =
    ACTIVITY_TYPE_OPTIONS.find((option) => option.value === activity.type)?.label ?? activity.type
  const overdue =
    activity.status === "planned" &&
    activity.dueDate &&
    new Date(activity.dueDate).getTime() < Date.now()

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-2 rounded-xl border p-3",
        activity.status === "done" && "opacity-60",
        activity.status === "canceled" && "opacity-40"
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">
          <span className="mr-1.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {typeLabel}
          </span>
          <span className={cn(activity.status !== "planned" && "line-through")}>
            {activity.summary}
          </span>
        </p>
        <p className={cn("mt-1 flex items-center gap-1 text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
          <CalendarClockIcon className="size-3.5" />
          {activity.status === "done"
            ? `Done ${formatRelativeTime(activity.doneAt)}`
            : activity.status === "canceled"
              ? "Canceled"
              : activity.dueDate
                ? `Due ${formatRelativeTime(activity.dueDate)}`
                : "No due date"}
        </p>
      </div>
      {activity.status === "planned" && (
        <div className="flex shrink-0 items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={onDone} aria-label="Mark done">
            <CheckIcon className="size-4 text-emerald-600" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onCancel} aria-label="Cancel activity">
            <XIcon className="size-4 text-muted-foreground" />
          </Button>
        </div>
      )}
      {activity.status !== "planned" && (
        <Button size="icon-sm" variant="ghost" onClick={onDelete} aria-label="Delete activity">
          <XIcon className="size-4 text-muted-foreground" />
        </Button>
      )}
    </div>
  )
}

// Collapsed feed rows clip at this height; anything taller gets a Show More toggle.
const COLLAPSED_BODY_PX = 224

function CollapsibleEntryBody({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    // Note images swap in their signed URLs async, so keep watching for
    // height changes instead of measuring once. The slack avoids a toggle
    // that would reveal only a few pixels.
    const check = () => setOverflows(el.offsetHeight > COLLAPSED_BODY_PX + 48)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const clipped = overflows && !expanded

  return (
    <div>
      <div className={cn("relative", clipped && "overflow-hidden")} style={clipped ? { maxHeight: COLLAPSED_BODY_PX } : undefined}>
        <div ref={innerRef}>{children}</div>
        {clipped && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
        )}
      </div>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUpIcon className="size-3.5" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDownIcon className="size-3.5" />
              Show More
            </>
          )}
        </button>
      )}
    </div>
  )
}

function TimelineEntryRow({
  entry,
  collapsible = false,
  onMaximize,
}: {
  entry: LeadTimelineEntry
  collapsible?: boolean
  onMaximize?: (entry: LeadTimelineEntry) => void
}) {
  if (entry.kind === "system") {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-border" />
        <span className="min-w-0 flex-1 whitespace-pre-wrap">{entry.body}</span>
        <span className="shrink-0">{formatRelativeTime(entry.createdAt)}</span>
      </div>
    )
  }

  const body = entry.bodyHtml ? (
    <NoteContent
      html={entry.bodyHtml}
      attachments={entry.attachments}
      className="mt-1.5"
      imageSize={collapsible ? "compact" : "full"}
    />
  ) : (
    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{entry.body}</p>
  )

  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        entry.kind === "email_sent" ? "bg-blue-500/5" : "bg-amber-500/5"
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          {entry.kind === "email_sent" ? (
            <MailIcon className="size-3.5 shrink-0" />
          ) : (
            <MessageSquareTextIcon className="size-3.5 shrink-0" />
          )}
          {entry.authorName || "Unknown"}
          {entry.kind === "email_sent" && entry.emailMeta && (
            <span className="truncate font-normal text-muted-foreground">
              emailed {entry.emailMeta.to}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span title={formatDateTime(entry.createdAt)}>{formatRelativeTime(entry.createdAt)}</span>
          {onMaximize && (
            <button
              type="button"
              onClick={() => onMaximize(entry)}
              className="-my-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Maximize note"
              title="Maximize"
            >
              <Maximize2Icon className="size-3.5" />
            </button>
          )}
        </span>
      </div>
      {entry.kind === "email_sent" && entry.emailMeta && (
        <p className="mt-1.5 text-xs font-semibold">Subject: {entry.emailMeta.subject}</p>
      )}
      {collapsible ? <CollapsibleEntryBody>{body}</CollapsibleEntryBody> : body}
    </div>
  )
}

export default function CrmLeadDetailPage() {
  const { id } = useParams({ from: "/crm_/$id" })
  const navigate = useNavigate()

  const [lead, setLead] = useState<Lead | null>(null)
  const [stages, setStages] = useState<LeadStage[]>([])
  const [activities, setActivities] = useState<LeadActivity[]>([])
  const [timeline, setTimeline] = useState<LeadTimelineEntry[]>([])
  const [accounts, setAccounts] = useState<GmailAccountOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<LeadFieldsForm | null>(null)
  const [saving, setSaving] = useState(false)

  const [composerTab, setComposerTab] = useState<"note" | "email">("note")
  const noteEditorRef = useRef<NoteEditorApi | null>(null)
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [submittingNote, setSubmittingNote] = useState(false)
  // Survives the modal closing, so an abandoned note is waiting on reopen.
  const [noteDraft, setNoteDraft] = useState<{
    html: string
    attachments: NoteAttachment[]
  } | null>(null)
  const [emailDraft, setEmailDraft] = useState({ to: "", subject: "", body: "", accountId: "" })
  const [submittingComposer, setSubmittingComposer] = useState(false)

  const [activityFormOpen, setActivityFormOpen] = useState(false)
  const [activityDraft, setActivityDraft] = useState<{
    type: LeadActivityType
    summary: string
    dueDate: string
  }>({ type: "call", summary: "", dueDate: "" })

  const [maximizedEntry, setMaximizedEntry] = useState<LeadTimelineEntry | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const [lostDialogOpen, setLostDialogOpen] = useState(false)
  const [lostReason, setLostReason] = useState("")
  const [actionPending, setActionPending] = useState(false)

  const plannedActivities = useMemo(
    () => activities.filter((activity) => activity.status === "planned"),
    [activities]
  )
  const pastActivities = useMemo(
    () => activities.filter((activity) => activity.status !== "planned"),
    [activities]
  )

  const load = useCallback(async () => {
    setError(null)
    try {
      const [leadData, boardData, activitiesData, timelineData] = await Promise.all([
        getLead(id),
        getBoard(),
        listActivities(id),
        listTimeline(id),
      ])
      setLead(leadData)
      setForm(leadToForm(leadData))
      setStages(boardData.stages)
      setActivities(activitiesData.activities)
      setTimeline(timelineData.entries)
      setEmailDraft((current) => ({ ...current, to: current.to || leadData.email || "" }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the lead")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
    void listGmailAccountOptions().then(setAccounts)
  }, [load])

  // Keep the composer's To field in sync with the lead's email whenever the
  // user has not typed a recipient themselves.
  const leadEmail = lead?.email ?? ""
  useEffect(() => {
    if (!leadEmail) return
    setEmailDraft((current) => (current.to ? current : { ...current, to: leadEmail }))
  }, [leadEmail, composerTab])

  async function refreshTimeline() {
    const data = await listTimeline(id).catch(() => null)
    if (data) setTimeline(data.entries)
  }

  async function saveFields() {
    if (!form || !lead) return
    if (!form.title.trim()) {
      toast.error("Lead title is required")
      return
    }
    setSaving(true)
    try {
      const updated = await updateLead(lead._id, {
        title: form.title.trim(),
        contactName: form.contactName.trim() || null,
        company: form.company.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        expectedRevenue: form.expectedRevenue.trim() || null,
        probability: form.probability.trim() || null,
      })
      setLead(updated)
      setForm(leadToForm(updated))
      toast.success("Lead saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the lead")
    } finally {
      setSaving(false)
    }
  }

  async function handleStageSelect(stageId: string) {
    if (!lead) return
    try {
      const updated = await moveLead(lead._id, stageId, lead.boardOrder)
      setLead(updated)
      void refreshTimeline()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change stage")
    }
  }

  async function handleConvert() {
    if (!lead) return
    setActionPending(true)
    try {
      const result = await convertLead(lead._id)
      setLead(result.lead)
      toast.success(
        result.customerCreated
          ? "Lead won — customer created"
          : "Lead won — linked to existing customer"
      )
      void refreshTimeline()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to convert the lead")
    } finally {
      setActionPending(false)
    }
  }

  async function handleMarkLost() {
    if (!lead) return
    setActionPending(true)
    try {
      const updated = await markLeadLost(lead._id, lostReason.trim() || undefined)
      setLead(updated)
      setLostDialogOpen(false)
      setLostReason("")
      void refreshTimeline()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark the lead lost")
    } finally {
      setActionPending(false)
    }
  }

  async function handleRestore() {
    if (!lead) return
    setActionPending(true)
    try {
      const updated = await restoreLead(lead._id)
      setLead(updated)
      void refreshTimeline()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore the lead")
    } finally {
      setActionPending(false)
    }
  }

  async function handleArchive() {
    if (!lead) return
    try {
      await archiveLead(lead._id)
      toast.success("Lead archived")
      void navigate({ to: "/crm" })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive the lead")
    }
  }

  async function handleAddActivity() {
    if (!activityDraft.summary.trim()) {
      toast.error("Activity summary is required")
      return
    }
    try {
      const activity = await createActivity(id, {
        type: activityDraft.type,
        summary: activityDraft.summary.trim(),
        dueDate: activityDraft.dueDate || null,
      })
      setActivities((prev) => [activity, ...prev])
      setActivityDraft({ type: "call", summary: "", dueDate: "" })
      setActivityFormOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add the activity")
    }
  }

  async function handleActivityDone(activity: LeadActivity) {
    try {
      const updated = await markActivityDone(activity._id)
      setActivities((prev) => prev.map((item) => (item._id === updated._id ? updated : item)))
      void refreshTimeline()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete the activity")
    }
  }

  async function handleActivityCancel(activity: LeadActivity) {
    try {
      const updated = await updateActivity(activity._id, { status: "canceled" })
      setActivities((prev) => prev.map((item) => (item._id === updated._id ? updated : item)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel the activity")
    }
  }

  async function handleActivityDelete(activity: LeadActivity) {
    try {
      await deleteActivity(activity._id)
      setActivities((prev) => prev.filter((item) => item._id !== activity._id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete the activity")
    }
  }

  function handleNoteModalOpenChange(open: boolean) {
    if (!open) {
      // Closing without logging keeps the draft for the next open.
      const payload = noteEditorRef.current?.getPayload()
      setNoteDraft(
        payload && !payload.isEmpty
          ? { html: payload.bodyHtml, attachments: payload.attachments }
          : null
      )
    }
    setNoteModalOpen(open)
  }

  async function handleNoteSubmit() {
    const noteEditor = noteEditorRef.current
    const payload = noteEditor?.getPayload()
    if (!payload || payload.isEmpty) {
      toast.error("Write a note first")
      return
    }
    if (noteEditor?.isUploading()) {
      toast.error("Wait for uploads to finish")
      return
    }
    setSubmittingNote(true)
    try {
      const entry = await addNote(id, {
        body: payload.body,
        bodyHtml: payload.bodyHtml,
        attachments: payload.attachments,
        mentionedUserIds: payload.mentionedUserIds,
      })
      setTimeline((prev) => [entry, ...prev])
      setNoteDraft(null)
      setNoteModalOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to log the note")
    } finally {
      setSubmittingNote(false)
    }
  }

  async function handleComposerSubmit() {
    setSubmittingComposer(true)
    try {
      if (!emailDraft.subject.trim() || !emailDraft.body.trim()) {
        toast.error("Subject and body are required")
        return
      }
      const result = await sendLeadEmail(id, {
        to: emailDraft.to.trim() || undefined,
        subject: emailDraft.subject.trim(),
        body: emailDraft.body,
        accountId: emailDraft.accountId || undefined,
      })
      setTimeline((prev) => [result.entry, ...prev])
      setEmailDraft((current) => ({ ...current, subject: "", body: "" }))
      toast.success("Email sent")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post to the timeline")
    } finally {
      setSubmittingComposer(false)
    }
  }

  return (
    <>
      <AppLayout>
        <SiteHeader />
        <div className="flex flex-1 flex-col overflow-y-auto">
          {loading ? (
            <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : error || !lead || !form ? (
            <ErrorState message={error ?? "Lead not found"} onRetry={() => void load()} />
          ) : (
            <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon-sm" asChild aria-label="Back to pipeline">
                    <Link to="/crm">
                      <ArrowLeftIcon className="size-4" />
                    </Link>
                  </Button>
                  <div>
                    <p className="text-xs text-muted-foreground">Pipeline</p>
                    <h1 className="text-xl font-semibold tracking-tight">{lead.title}</h1>
                  </div>
                  {lead.status === "won" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600">
                      <TrophyIcon className="size-3.5" />
                      Won
                    </span>
                  )}
                  {lead.status === "lost" && (
                    <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                      Lost
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {lead.status === "active" ? (
                    <>
                      <Button size="sm" onClick={() => void handleConvert()} disabled={actionPending}>
                        <TrophyIcon className="size-4" />
                        Mark Won
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLostDialogOpen(true)}
                        disabled={actionPending}
                      >
                        Mark Lost
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void handleRestore()} disabled={actionPending}>
                      <RotateCcwIcon className="size-4" />
                      Restore
                    </Button>
                  )}
                  {lead.customerId && (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/customers/$id" params={{ id: lead.customerId }}>
                        <UsersIcon className="size-4" />
                        View Customer
                      </Link>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => void handleArchive()}
                  >
                    <ArchiveIcon className="size-4" />
                    Archive
                  </Button>
                </div>
              </div>

              <div className="mb-5">
                <StageStepper
                  stages={stages}
                  currentStageId={lead.stageId}
                  disabled={lead.status !== "active"}
                  onSelect={(stageId) => void handleStageSelect(stageId)}
                />
              </div>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
                {/* Left: lead fields */}
                <div className="space-y-4 rounded-2xl border p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <HandshakeIcon className="size-4 text-muted-foreground" />
                      Lead Details
                    </h2>
                    <Button size="sm" onClick={() => void saveFields()} disabled={saving}>
                      {saving && <Spinner data-icon="inline-start" />}
                      Save Changes
                    </Button>
                  </div>
                  <Separator />
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="detail-title">Title</Label>
                      <Input
                        id="detail-title"
                        value={form.title}
                        onChange={(event) => setForm({ ...form, title: event.target.value })}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="detail-contact">Contact Name</Label>
                        <Input
                          id="detail-contact"
                          value={form.contactName}
                          onChange={(event) => setForm({ ...form, contactName: event.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="detail-company">Company</Label>
                        <Input
                          id="detail-company"
                          value={form.company}
                          onChange={(event) => setForm({ ...form, company: event.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="detail-email">Email</Label>
                        <Input
                          id="detail-email"
                          type="email"
                          value={form.email}
                          onChange={(event) => setForm({ ...form, email: event.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="detail-phone">Phone</Label>
                        <Input
                          id="detail-phone"
                          value={form.phone}
                          onChange={(event) => setForm({ ...form, phone: event.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="detail-revenue">Expected Revenue</Label>
                        <Input
                          id="detail-revenue"
                          inputMode="decimal"
                          value={form.expectedRevenue}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              expectedRevenue: event.target.value.replace(/[^0-9.]/g, ""),
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="detail-probability">Probability (%)</Label>
                        <Input
                          id="detail-probability"
                          inputMode="numeric"
                          value={form.probability}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              probability: event.target.value.replace(/[^0-9]/g, ""),
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 border-t pt-3 text-[11px] text-muted-foreground">
                      <span className="capitalize">Source: {lead.source}</span>
                      <span>Created {formatRelativeTime(lead.createdAt)}</span>
                      <span>Updated {formatRelativeTime(lead.updatedAt)}</span>
                      {lead.lostReason && <span>Lost reason: {lead.lostReason}</span>}
                    </div>
                  </div>
                </div>

                {/* Right: activities + chatter */}
                <div className="space-y-5">
                  <div className="rounded-2xl border p-4">
                    <div className="flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <ListChecksIcon className="size-4 text-muted-foreground" />
                        Planned Activities
                        {plannedActivities.length > 0 && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                            {plannedActivities.length}
                          </span>
                        )}
                      </h2>
                      <Button size="sm" variant="outline" onClick={() => setActivityFormOpen((open) => !open)}>
                        <PlusIcon className="size-4" />
                        Schedule
                      </Button>
                    </div>

                    {activityFormOpen && (
                      <div className="mt-3 space-y-3 rounded-xl border bg-muted/30 p-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-1.5">
                            <Label>Type</Label>
                            <Select
                              value={activityDraft.type}
                              onValueChange={(value) =>
                                setActivityDraft((current) => ({
                                  ...current,
                                  type: value as LeadActivityType,
                                }))
                              }
                            >
                              <SelectTrigger className="bg-background">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ACTIVITY_TYPE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-1.5">
                            <Label>Due date</Label>
                            <DatePicker
                              value={activityDraft.dueDate}
                              onChange={(value) =>
                                setActivityDraft((current) => ({ ...current, dueDate: value }))
                              }
                              placeholder="Pick a due date"
                            />
                          </div>
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="activity-summary">Summary</Label>
                          <Input
                            id="activity-summary"
                            className="bg-background"
                            placeholder='e.g. "Call to get system requirements"'
                            value={activityDraft.summary}
                            onChange={(event) =>
                              setActivityDraft((current) => ({
                                ...current,
                                summary: event.target.value,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void handleAddActivity()
                            }}
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setActivityFormOpen(false)}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={() => void handleAddActivity()}>
                            <CheckSquareIcon className="size-4" />
                            Schedule Activity
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 space-y-2">
                      {plannedActivities.length === 0 && !activityFormOpen && (
                        <p className="py-2 text-sm text-muted-foreground">
                          No planned activities. Schedule a call, meeting, or to-do.
                        </p>
                      )}
                      {plannedActivities.map((activity) => (
                        <ActivityRow
                          key={activity._id}
                          activity={activity}
                          onDone={() => void handleActivityDone(activity)}
                          onCancel={() => void handleActivityCancel(activity)}
                          onDelete={() => void handleActivityDelete(activity)}
                        />
                      ))}
                      {pastActivities.length > 0 && (
                        <details className="pt-1">
                          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                            {pastActivities.length} completed or canceled
                          </summary>
                          <div className="mt-2 space-y-2">
                            {pastActivities.map((activity) => (
                              <ActivityRow
                                key={activity._id}
                                activity={activity}
                                onDone={() => void handleActivityDone(activity)}
                                onCancel={() => void handleActivityCancel(activity)}
                                onDelete={() => void handleActivityDelete(activity)}
                              />
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border p-4">
                    <div className="flex items-center gap-1 border-b pb-3">
                      <Button
                        size="sm"
                        variant={composerTab === "note" ? "secondary" : "ghost"}
                        onClick={() => setComposerTab("note")}
                      >
                        <MessageSquareTextIcon className="size-4" />
                        Log Note
                      </Button>
                      <Button
                        size="sm"
                        variant={composerTab === "email" ? "secondary" : "ghost"}
                        onClick={() => setComposerTab("email")}
                      >
                        <MailIcon className="size-4" />
                        Send Email
                      </Button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {composerTab === "note" && (
                        <button
                          type="button"
                          onClick={() => setNoteModalOpen(true)}
                          className="flex min-h-20 w-full items-start gap-2 rounded-md border border-input bg-transparent px-3 py-2.5 text-left text-sm text-muted-foreground/60 shadow-xs transition-colors hover:border-ring/40 hover:text-muted-foreground"
                        >
                          <PenLineIcon className="mt-0.5 size-4 shrink-0" />
                          <span>
                            {noteDraft
                              ? "Continue your draft note..."
                              : "Log an internal note — headings, images, files..."}
                          </span>
                        </button>
                      )}
                      {composerTab === "email" && (
                        <div className="space-y-2">
                          {accounts.length > 1 && (
                            <Select
                              value={emailDraft.accountId || accounts[0]?._id || ""}
                              onValueChange={(value) =>
                                setEmailDraft((current) => ({ ...current, accountId: value }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Send from..." />
                              </SelectTrigger>
                              <SelectContent>
                                {accounts.map((account) => (
                                  <SelectItem key={account._id} value={account._id}>
                                    {account.emailAddress}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <Input
                            value={emailDraft.to}
                            onChange={(event) =>
                              setEmailDraft((current) => ({ ...current, to: event.target.value }))
                            }
                            placeholder="To"
                          />
                          <Input
                            value={emailDraft.subject}
                            onChange={(event) =>
                              setEmailDraft((current) => ({ ...current, subject: event.target.value }))
                            }
                            placeholder="Subject"
                          />
                          <textarea
                            value={emailDraft.body}
                            onChange={(event) =>
                              setEmailDraft((current) => ({ ...current, body: event.target.value }))
                            }
                            placeholder="Write your email..."
                            rows={4}
                            className={TEXTAREA_CLASS}
                          />
                          {accounts.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              No connected Gmail account was found; sending will fail until one is
                              connected in the inbox settings.
                            </p>
                          )}
                        </div>
                      )}
                      {composerTab === "email" && (
                        <div className="flex justify-end">
                          <Button size="sm" onClick={() => void handleComposerSubmit()} disabled={submittingComposer}>
                            {submittingComposer ? (
                              <Spinner data-icon="inline-start" />
                            ) : (
                              <SendIcon className="size-4" />
                            )}
                            Send Email
                          </Button>
                        </div>
                      )}
                    </div>

                    <Separator className="my-4" />

                    <div className="mb-2.5 flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <HistoryIcon className="size-3.5" />
                        History
                        {timeline.length > 0 && (
                          <span className="font-normal tabular-nums">({timeline.length})</span>
                        )}
                      </h3>
                      {timeline.length > 0 && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setHistoryOpen(true)}
                          aria-label="Maximize history"
                          title="Maximize history"
                        >
                          <Maximize2Icon className="size-4" />
                        </Button>
                      )}
                    </div>

                    <div className="-mr-1 max-h-[34rem] space-y-2.5 overflow-y-auto pr-1">
                      {timeline.length === 0 && (
                        <p className="py-2 text-sm text-muted-foreground">No activity yet.</p>
                      )}
                      {timeline.map((entry) => (
                        <TimelineEntryRow
                          key={entry._id}
                          entry={entry}
                          collapsible
                          onMaximize={setMaximizedEntry}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </AppLayout>

      <Dialog open={lostDialogOpen} onOpenChange={setLostDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Mark Lead Lost</DialogTitle>
            <DialogDescription>
              Optionally record why this lead was lost. You can restore it later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="lost-reason">Lost reason</Label>
            <Input
              id="lost-reason"
              value={lostReason}
              onChange={(event) => setLostReason(event.target.value)}
              placeholder="e.g. Went with a competitor"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostDialogOpen(false)} disabled={actionPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleMarkLost()} disabled={actionPending}>
              {actionPending && <Spinner data-icon="inline-start" />}
              Mark Lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={noteModalOpen} onOpenChange={handleNoteModalOpenChange}>
        <DialogContent
          className="flex h-[min(85vh,52rem)] flex-col gap-0 p-0 sm:max-w-3xl"
          // Escape while the "@" mention menu is open should only dismiss the
          // menu (handled by the editor), not throw away the whole note.
          onEscapeKeyDown={(event) => {
            if (document.querySelector("[data-mention-popup]")) event.preventDefault()
          }}
        >
          <DialogHeader className="border-b px-5 py-4 text-left">
            <DialogTitle>Log Note</DialogTitle>
            <DialogDescription>
              {lead ? `Internal note on "${lead.title}" — ` : "Internal note — "}
              only your team can see it.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 p-4">
            <Suspense fallback={<Skeleton className="h-full w-full rounded-md" />}>
              <NoteEditor
                size="large"
                autoFocus
                apiRef={noteEditorRef}
                disabled={submittingNote}
                onSubmitShortcut={() => void handleNoteSubmit()}
                initialHtml={noteDraft?.html}
                initialAttachments={noteDraft?.attachments}
                className="h-full"
              />
            </Suspense>
          </div>
          <DialogFooter className="border-t px-4 py-3">
            <p className="mr-auto hidden self-center text-[11px] text-muted-foreground sm:block">
              Paste or drop images and files straight into the note. ⌘⏎ to log.
            </p>
            <Button
              variant="outline"
              onClick={() => handleNoteModalOpenChange(false)}
              disabled={submittingNote}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleNoteSubmit()} disabled={submittingNote}>
              {submittingNote ? <Spinner data-icon="inline-start" /> : <PlusIcon className="size-4" />}
              Log Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Maximized view of a single note or email */}
      <Dialog
        open={maximizedEntry !== null}
        onOpenChange={(open) => {
          if (!open) setMaximizedEntry(null)
        }}
      >
        <DialogContent className="flex h-[min(85vh,52rem)] flex-col gap-0 p-0 sm:max-w-3xl">
          {maximizedEntry && (
            <>
              <DialogHeader className="border-b px-5 py-4 text-left">
                <DialogTitle className="flex items-center gap-2">
                  {maximizedEntry.kind === "email_sent" ? (
                    <MailIcon className="size-4 text-muted-foreground" />
                  ) : (
                    <MessageSquareTextIcon className="size-4 text-muted-foreground" />
                  )}
                  {maximizedEntry.kind === "email_sent" ? "Email" : "Note"} by{" "}
                  {maximizedEntry.authorName || "Unknown"}
                </DialogTitle>
                <DialogDescription>
                  {formatDateTime(maximizedEntry.createdAt)}
                  {maximizedEntry.kind === "email_sent" &&
                    maximizedEntry.emailMeta &&
                    ` — to ${maximizedEntry.emailMeta.to}`}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {maximizedEntry.kind === "email_sent" && maximizedEntry.emailMeta && (
                  <p className="mb-3 text-sm font-semibold">
                    Subject: {maximizedEntry.emailMeta.subject}
                  </p>
                )}
                {maximizedEntry.bodyHtml ? (
                  <NoteContent
                    html={maximizedEntry.bodyHtml}
                    attachments={maximizedEntry.attachments}
                    imageSize="full"
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {maximizedEntry.body}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Maximized full history */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="flex h-[min(85vh,56rem)] flex-col gap-0 p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2">
              <HistoryIcon className="size-4 text-muted-foreground" />
              Full History
            </DialogTitle>
            <DialogDescription>
              {lead
                ? `Every note, email, and event on "${lead.title}".`
                : "Every note, email, and event on this lead."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-5">
            {timeline.map((entry) => (
              <TimelineEntryRow key={entry._id} entry={entry} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
