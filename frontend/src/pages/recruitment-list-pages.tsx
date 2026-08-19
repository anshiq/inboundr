import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import {
  BriefcaseBusinessIcon,
  SearchIcon,
  UserRoundPlusIcon,
  UsersRoundIcon,
} from "lucide-react"

import { EmptyState, ErrorState, ListSkeleton } from "@/components/list-states"
import { DataTable, DataTableColumnHeader } from "@/components/recruitment/data-table"
import { OverviewWidgets } from "@/components/recruitment/overview/overview-widgets"
import { relativeDate } from "@/components/recruitment/overview/shared"
import { RecruitmentPageTitle, RecruitmentShell } from "@/components/recruitment/recruitment-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  entity,
  recruitmentApi,
  type Application,
  type JobStatus,
  type RecruitmentJob,
} from "@/lib/recruitment"
import { useEntitlements } from "@/lib/entitlements"

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    open: "border-success/30 bg-success/10 text-success",
    active: "border-info/30 bg-info/10 text-info",
    hired: "border-success/30 bg-success/10 text-success",
    rejected: "border-destructive/30 bg-destructive/10 text-destructive",
    paused: "border-warning/30 bg-warning/10 text-warning",
  }
  return <Badge variant="outline" className={`capitalize ${classes[status] ?? ""}`}>{status}</Badge>
}

export function RecruitmentOverviewPage() {
  const { canManageOrganization } = useEntitlements()
  const [data, setData] = useState<Awaited<ReturnType<typeof recruitmentApi.dashboard>> | null>(null)
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    setError("")
    try { setData(await recruitmentApi.dashboard()) } catch (e) { setError(e instanceof Error ? e.message : "Unable to load recruitment") }
  }, [])
  useEffect(() => {
    // Initial remote hydration is intentionally effect-driven.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const today = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date())

  return (
    <RecruitmentShell>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{today}</p>
        {canManageOrganization ? (
          <Button asChild>
            <Link to="/recruitment/jobs/new"><UserRoundPlusIcon /> Create Job</Link>
          </Button>
        ) : null}
      </div>
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !data ? (
        <ListSkeleton rows={5} columns={4} />
      ) : (
        <OverviewWidgets data={data} />
      )}
    </RecruitmentShell>
  )
}

const JOB_COLUMNS: ColumnDef<RecruitmentJob, unknown>[] = [
  {
    id: "role",
    accessorFn: (job) => job.title,
    header: ({ column }) => <DataTableColumnHeader title="Role" sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
    cell: ({ row }) => (
      <>
        <span className="font-medium">{row.original.title}</span>
        <span className="block text-xs text-muted-foreground">{row.original.department || "No department"} · {row.original.location || "Flexible location"}</span>
      </>
    ),
  },
  {
    id: "status",
    accessorFn: (job) => job.status,
    header: ({ column }) => <DataTableColumnHeader title="Status" sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: "workplace",
    accessorFn: (job) => job.workplaceType ?? "",
    header: "Workplace",
    cell: ({ row }) => <span className="capitalize text-muted-foreground">{row.original.workplaceType ?? "—"}</span>,
  },
  {
    id: "openings",
    accessorFn: (job) => job.openings,
    header: ({ column }) => <DataTableColumnHeader title="Openings" sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
    cell: ({ row }) => row.original.openings,
  },
  {
    id: "updated",
    accessorFn: (job) => job.updatedAt,
    header: ({ column }) => <DataTableColumnHeader title="Updated" sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
    cell: ({ row }) => <span className="text-muted-foreground">{relativeDate(row.original.updatedAt)}</span>,
  },
]

export function RecruitmentJobsPage() {
  const { canManageOrganization } = useEntitlements()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<RecruitmentJob[]>([])
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    setLoading(true); setError("")
    try { setJobs((await recruitmentApi.jobs({ search, status: status === "all" ? "" : status })).items) }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load jobs") }
    finally { setLoading(false) }
  }, [search, status])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer) }, [load])

  return (
    <RecruitmentShell breadcrumbs={[{ label: "Recruitment", href: "/recruitment" }, { label: "Jobs" }]}>
      <RecruitmentPageTitle title="Jobs" description="Every role and its current status." action={canManageOrganization ? <Button asChild><Link to="/recruitment/jobs/new">Create Job</Link></Button> : undefined} />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-9 border-transparent bg-muted/60 pl-9 shadow-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted focus-visible:border-input focus-visible:bg-background" placeholder="Search jobs…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger size="sm" className="w-full capitalize sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Statuses</SelectItem>{(["draft","open","paused","closed","archived"] as JobStatus[]).map((item) => <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        {loading ? <ListSkeleton rows={7} columns={5} /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : !jobs.length ? <EmptyState icon={BriefcaseBusinessIcon} title="No Matching Jobs" description="Create your first role or broaden the current filters." action={canManageOrganization ? <Button asChild size="sm"><Link to="/recruitment/jobs/new">Create Job</Link></Button> : undefined} /> : (
          <DataTable columns={JOB_COLUMNS} data={jobs} onRowClick={(row) => void navigate({ to: "/recruitment/jobs/$jobId", params: { jobId: row.original._id } })} />
        )}
      </div>
    </RecruitmentShell>
  )
}

const APPLICANT_COLUMNS: ColumnDef<Application, unknown>[] = [
  {
    id: "candidate",
    accessorFn: (item) => entity(item.candidateId)?.fullName ?? "",
    header: ({ column }) => <DataTableColumnHeader title="Candidate" sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
    cell: ({ row }) => {
      const candidate = entity(row.original.candidateId)
      return (
        <>
          <span className="font-medium">{candidate?.fullName ?? "Candidate"}</span>
          <span className="block text-xs text-muted-foreground">{candidate?.email}</span>
        </>
      )
    },
  },
  {
    id: "role",
    accessorFn: (item) => entity(item.jobId)?.title ?? "",
    header: ({ column }) => <DataTableColumnHeader title="Role" sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
    cell: ({ row }) => entity(row.original.jobId)?.title ?? "Job",
  },
  {
    id: "stage",
    accessorFn: (item) => entity(item.jobId)?.stages.find((stage) => stage.id === item.stageId)?.name ?? item.stageId,
    header: "Stage",
    cell: ({ row }) => entity(row.original.jobId)?.stages.find((stage) => stage.id === row.original.stageId)?.name ?? row.original.stageId,
  },
  {
    id: "status",
    accessorFn: (item) => item.status,
    header: ({ column }) => <DataTableColumnHeader title="Status" sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: "applied",
    accessorFn: (item) => item.appliedAt,
    header: ({ column }) => <DataTableColumnHeader title="Applied" sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
    cell: ({ row }) => <span className="text-muted-foreground">{relativeDate(row.original.appliedAt)}</span>,
  },
]

export function RecruitmentApplicantsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Application[]>([])
  const [jobs, setJobs] = useState<RecruitmentJob[]>([])
  const [jobId, setJobId] = useState("all")
  const [status, setStatus] = useState("all")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const [apps, jobsResult] = await Promise.all([recruitmentApi.applications({ jobId: jobId === "all" ? "" : jobId, status: status === "all" ? "" : status }), recruitmentApi.jobs()])
      setItems(apps.items); setJobs(jobsResult.items)
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load applicants") } finally { setLoading(false) }
  }, [jobId, status])
  useEffect(() => {
    // Filter changes require a fresh server-side application page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])
  const visible = useMemo(() => items.filter((item) => {
    const candidate = entity(item.candidateId)
    return !search || `${candidate?.fullName} ${candidate?.email} ${candidate?.headline}`.toLowerCase().includes(search.toLowerCase())
  }), [items, search])

  return (
    <RecruitmentShell breadcrumbs={[{ label: "Recruitment", href: "/recruitment" }, { label: "Applicants" }]}>
      <RecruitmentPageTitle title="Applicants" description="All applications across jobs." />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-9 border-transparent bg-muted/60 pl-9 shadow-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted focus-visible:border-input focus-visible:bg-background" placeholder="Search applicants…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={jobId} onValueChange={setJobId}><SelectTrigger size="sm" className="w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Jobs</SelectItem>{jobs.map((job) => <SelectItem key={job._id} value={job._id}>{job.title}</SelectItem>)}</SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger size="sm" className="w-full capitalize sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Statuses</SelectItem>{["active","hired","rejected","withdrawn","archived"].map((item) => <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        {loading ? <ListSkeleton rows={8} columns={5} /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : !visible.length ? <EmptyState icon={UsersRoundIcon} title="No Matching Applicants" description="Applications will appear here when candidates enter a job pipeline." /> : (
          <DataTable columns={APPLICANT_COLUMNS} data={visible} onRowClick={(row) => void navigate({ to: "/recruitment/applications/$applicationId", params: { applicationId: row.original._id } })} />
        )}
      </div>
    </RecruitmentShell>
  )
}
