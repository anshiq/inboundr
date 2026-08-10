import { API_ORIGIN } from "@/lib/env"

const API_BASE = `${API_ORIGIN}/api/v1/crm`

export type LeadSource = "manual" | "form" | "contact" | "import"
export type LeadStatus = "active" | "won" | "lost"
export type LeadActivityType = "call" | "meeting" | "todo" | "email"
export type LeadActivityStatus = "planned" | "done" | "canceled"
export type LeadTimelineKind = "note" | "email_sent" | "system"

export interface LeadStage {
  _id: string
  name: string
  order: number
  isWonStage: boolean
  createdAt: string
  updatedAt: string
}

export interface Lead {
  _id: string
  title: string
  contactName: string | null
  company: string | null
  email: string | null
  phone: string | null
  stageId: string
  expectedRevenue: number | null
  probability: number | null
  tags: string[]
  source: LeadSource
  assignedToUserId: string | null
  status: LeadStatus
  lostReason: string | null
  customerId: string | null
  boardOrder: number
  isArchived: boolean
  wonAt: string | null
  lostAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LeadActivity {
  _id: string
  leadId: string
  type: LeadActivityType
  summary: string
  dueDate: string | null
  assignedToUserId: string | null
  status: LeadActivityStatus
  doneAt: string | null
  createdAt: string
  updatedAt: string
}

export interface BoardLead extends Lead {
  nextActivity: Pick<LeadActivity, "_id" | "type" | "summary" | "dueDate"> | null
}

export interface LeadTimelineEntry {
  _id: string
  leadId: string
  kind: LeadTimelineKind
  authorUserId: string | null
  authorName: string | null
  body: string
  emailMeta: {
    to: string
    subject: string
    gmailMessageId: string | null
    fromAddress: string | null
  } | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface LeadPayload {
  title?: string
  contactName?: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
  expectedRevenue?: number | string | null
  probability?: number | string | null
  tags?: string[]
  assignedToUserId?: string | null
  stageId?: string
}

export interface GmailAccountOption {
  _id: string
  emailAddress: string
  status: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`)
  }
  return data as T
}

export function getBoard(search?: string) {
  const params = new URLSearchParams()
  if (search?.trim()) params.set("search", search.trim())
  const query = params.toString()
  return api<{ stages: LeadStage[]; leads: BoardLead[] }>(`/board${query ? `?${query}` : ""}`)
}

export function getLead(id: string) {
  return api<Lead>(`/leads/${id}`)
}

export function createLead(payload: LeadPayload) {
  return api<Lead>("/leads", { method: "POST", body: JSON.stringify(payload) })
}

export function updateLead(id: string, payload: LeadPayload) {
  return api<Lead>(`/leads/${id}`, { method: "PUT", body: JSON.stringify(payload) })
}

export function archiveLead(id: string) {
  return api<{ message: string; lead: Lead }>(`/leads/${id}/archive`, { method: "PATCH" })
}

export function moveLead(id: string, stageId: string, boardOrder: number) {
  return api<Lead>(`/leads/${id}/move`, {
    method: "PATCH",
    body: JSON.stringify({ stageId, boardOrder }),
  })
}

export function convertLead(id: string, payload?: { name?: string; company?: string; email?: string }) {
  return api<{ lead: Lead; customer: { _id: string; name: string }; customerCreated: boolean }>(
    `/leads/${id}/convert`,
    { method: "POST", body: JSON.stringify(payload ?? {}) }
  )
}

export function markLeadLost(id: string, lostReason?: string) {
  return api<Lead>(`/leads/${id}/mark-lost`, {
    method: "POST",
    body: JSON.stringify({ lostReason: lostReason ?? null }),
  })
}

export function restoreLead(id: string) {
  return api<Lead>(`/leads/${id}/restore`, { method: "POST", body: JSON.stringify({}) })
}

export function createStage(payload: { name: string; isWonStage?: boolean }) {
  return api<LeadStage>("/stages", { method: "POST", body: JSON.stringify(payload) })
}

export function updateStage(stageId: string, payload: { name?: string; isWonStage?: boolean }) {
  return api<LeadStage>(`/stages/${stageId}`, { method: "PUT", body: JSON.stringify(payload) })
}

export function reorderStages(stageIds: string[]) {
  return api<{ stages: LeadStage[] }>("/stages/reorder", {
    method: "PUT",
    body: JSON.stringify({ stageIds }),
  })
}

export function deleteStage(stageId: string) {
  return api<{ message: string; reassignedToStageId: string }>(`/stages/${stageId}`, {
    method: "DELETE",
  })
}

export interface AgendaActivity extends LeadActivity {
  lead: Pick<Lead, "_id" | "title" | "contactName" | "company" | "status">
}

export function listAllPlannedActivities() {
  return api<{ activities: AgendaActivity[] }>("/activities")
}

export function listActivities(leadId: string) {
  return api<{ activities: LeadActivity[] }>(`/leads/${leadId}/activities`)
}

export function createActivity(
  leadId: string,
  payload: { type: LeadActivityType; summary: string; dueDate?: string | null; assignedToUserId?: string | null }
) {
  return api<LeadActivity>(`/leads/${leadId}/activities`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function updateActivity(
  activityId: string,
  payload: Partial<{ type: LeadActivityType; summary: string; dueDate: string | null; assignedToUserId: string | null; status: LeadActivityStatus }>
) {
  return api<LeadActivity>(`/activities/${activityId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  })
}

export function markActivityDone(activityId: string) {
  return api<LeadActivity>(`/activities/${activityId}/done`, { method: "PATCH" })
}

export function deleteActivity(activityId: string) {
  return api<{ message: string }>(`/activities/${activityId}`, { method: "DELETE" })
}

export function listTimeline(leadId: string) {
  return api<{ entries: LeadTimelineEntry[] }>(`/leads/${leadId}/timeline`)
}

export function addNote(leadId: string, body: string) {
  return api<LeadTimelineEntry>(`/leads/${leadId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  })
}

export function sendLeadEmail(
  leadId: string,
  payload: { to?: string; subject: string; body: string; accountId?: string }
) {
  return api<{ entry: LeadTimelineEntry; gmailMessageId: string | null }>(
    `/leads/${leadId}/send-email`,
    { method: "POST", body: JSON.stringify(payload) }
  )
}

export async function listGmailAccountOptions(): Promise<GmailAccountOption[]> {
  try {
    const response = await fetch(`${API_ORIGIN}/api/v1/gmail/accounts`, {
      credentials: "include",
    })
    if (!response.ok) return []
    const data = await response.json()
    const accounts = Array.isArray(data.accounts) ? data.accounts : []
    return accounts.filter((account: GmailAccountOption) => account.status === "connected")
  } catch {
    return []
  }
}
