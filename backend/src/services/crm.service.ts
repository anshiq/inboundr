import type { Types } from "mongoose";
import { Lead, type ILead, type LeadSource } from "../models/lead.model";
import { LeadStage, type ILeadStage } from "../models/lead-stage.model";
import {
  LeadTimelineEntry,
  type ILeadTimelineEntry,
  type ILeadTimelineEmailMeta,
  type LeadTimelineKind,
} from "../models/lead-timeline.model";

const DEFAULT_STAGES: Array<{ name: string; order: number; isWonStage: boolean }> = [
  { name: "New", order: 0, isWonStage: false },
  { name: "Qualified", order: 1, isWonStage: false },
  { name: "Proposition", order: 2, isWonStage: false },
  { name: "Won", order: 3, isWonStage: true },
];

export async function getOrCreateLeadStages(
  organizationId: Types.ObjectId
): Promise<ILeadStage[]> {
  const existing = await LeadStage.find({ organizationId }).sort({ order: 1 });
  if (existing.length > 0) return existing;

  try {
    await LeadStage.insertMany(
      DEFAULT_STAGES.map((stage) => ({ ...stage, organizationId })),
      { ordered: false }
    );
  } catch (err: any) {
    // A concurrent request may have seeded already; unique index makes this safe.
    if (err?.code !== 11000) throw err;
  }

  return LeadStage.find({ organizationId }).sort({ order: 1 });
}

/** Creates a lead in the first pipeline stage from an automated source. */
export async function createCapturedLead(input: {
  organizationId: Types.ObjectId;
  title: string;
  contactName?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source: LeadSource;
  captureNote: string;
  metadata?: Record<string, unknown>;
}): Promise<ILead> {
  const stages = await getOrCreateLeadStages(input.organizationId);
  const firstStage = stages[0]!;
  const last = await Lead.findOne({
    organizationId: input.organizationId,
    stageId: firstStage._id,
  })
    .sort({ boardOrder: -1 })
    .select("boardOrder")
    .lean();

  const lead = await Lead.create({
    organizationId: input.organizationId,
    title: input.title,
    contactName: input.contactName ?? null,
    company: input.company ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    stageId: firstStage._id,
    source: input.source,
    boardOrder: (last?.boardOrder ?? 0) + 1,
  });

  await recordLeadTimeline({
    organizationId: input.organizationId,
    leadId: lead._id,
    kind: "system",
    body: input.captureNote,
    metadata: { event: "lead_captured", source: input.source, ...(input.metadata ?? {}) },
  });

  return lead;
}

export async function recordLeadTimeline(input: {
  organizationId: Types.ObjectId;
  leadId: Types.ObjectId;
  kind: LeadTimelineKind;
  body: string;
  authorUserId?: string | null;
  authorName?: string | null;
  emailMeta?: ILeadTimelineEmailMeta | null;
  metadata?: Record<string, unknown>;
}): Promise<ILeadTimelineEntry> {
  return LeadTimelineEntry.create({
    organizationId: input.organizationId,
    leadId: input.leadId,
    kind: input.kind,
    body: input.body,
    authorUserId: input.authorUserId ?? null,
    authorName: input.authorName ?? null,
    emailMeta: input.emailMeta ?? null,
    metadata: input.metadata ?? {},
  });
}
