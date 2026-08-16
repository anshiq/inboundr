import type { Types } from "mongoose";
import sanitizeHtml from "sanitize-html";
import { Lead, type ILead, type LeadSource } from "../models/lead.model";
import { LeadStage, type ILeadStage } from "../models/lead-stage.model";
import {
  LeadTimelineEntry,
  type ILeadNoteAttachment,
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

function isNonEmpty<T>(items: T[]): items is [T, ...T[]] {
  return items.length > 0;
}

export async function getOrCreateLeadStages(
  organizationId: Types.ObjectId
): Promise<[ILeadStage, ...ILeadStage[]]> {
  const existing = await LeadStage.find({ organizationId }).sort({ order: 1 });
  if (isNonEmpty(existing)) return existing;

  try {
    await LeadStage.insertMany(
      DEFAULT_STAGES.map((stage) => ({ ...stage, organizationId })),
      { ordered: false }
    );
  } catch (err: any) {
    // A concurrent request may have seeded already; unique index makes this safe.
    if (err?.code !== 11000) throw err;
  }

  const stages = await LeadStage.find({ organizationId }).sort({ order: 1 });
  if (!isNonEmpty(stages)) {
    throw new Error(
      `Lead stages could not be initialized for organization ${organizationId}`
    );
  }
  return stages;
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
  const firstStage = stages[0];
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
  bodyHtml?: string | null;
  attachments?: ILeadNoteAttachment[];
  authorUserId?: string | null;
  authorName?: string | null;
  emailMeta?: ILeadTimelineEmailMeta | null;
  mentions?: string[];
  metadata?: Record<string, unknown>;
}): Promise<ILeadTimelineEntry> {
  return LeadTimelineEntry.create({
    organizationId: input.organizationId,
    leadId: input.leadId,
    kind: input.kind,
    body: input.body,
    bodyHtml: input.bodyHtml ?? null,
    attachments: input.attachments ?? [],
    authorUserId: input.authorUserId ?? null,
    authorName: input.authorName ?? null,
    emailMeta: input.emailMeta ?? null,
    mentions: input.mentions ?? [],
    metadata: input.metadata ?? {},
  });
}

/**
 * The note editor's schema is not a security boundary — the HTML arrives over
 * HTTP and is later rendered for every teammate viewing the lead. Restrict it
 * to what the TipTap note toolbar can actually emit. Uploaded images carry a
 * `data-key` storage reference that the client resolves to a short-lived
 * signed URL at render time, so keys must survive sanitization.
 */
export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "a", "span",
      "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2", "h3", "hr", "img",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height", "data-key"],
      // Team @-mention chips emitted by the TipTap Mention extension.
      span: ["data-type", "data-user-id", "data-label"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  });
}
