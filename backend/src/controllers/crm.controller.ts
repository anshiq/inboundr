import type { Request, Response } from "express";
import mongoose from "mongoose";
import { Customer } from "../models/customer.model";
import { GmailAccount } from "../models/gmail-account.model";
import { Lead, LEAD_SOURCES, type ILead } from "../models/lead.model";
import {
  LeadActivity,
  LEAD_ACTIVITY_TYPES,
  type LeadActivityType,
} from "../models/lead-activity.model";
import { LeadStage } from "../models/lead-stage.model";
import { LeadTimelineEntry } from "../models/lead-timeline.model";
import type { OrganizationRequest } from "../middleware/auth.middleware";
import type { ILeadNoteAttachment } from "../models/lead-timeline.model";
import { getOrCreateLeadStages, recordLeadTimeline, sanitizeNoteHtml } from "../services/crm.service";
import {
  filterMentionableUserIds,
  notifyLeadNoteMentions,
} from "../services/crm-mention-notification.service";
import { htmlToPlainText, sendStandaloneEmail } from "../services/gmail-send.service";
import { keyBelongsToPrefix } from "../services/storage.service";

const LEAD_SEARCH_FIELDS = ["title", "contactName", "company", "email", "phone"] as const;

function isValidId(value: string): boolean {
  return mongoose.Types.ObjectId.isValid(value);
}

function optionalTrimmed(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function optionalNumber(value: unknown, min: number, max?: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const clamped = Math.max(min, parsed);
  return max !== undefined ? Math.min(max, clamped) : clamped;
}

function normalizeTags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((tag) => String(tag ?? "").trim()).filter(Boolean))].slice(0, 25);
}

function normalizeLeadInput(body: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  if ("title" in body) input.title = String(body.title ?? "").trim();
  if ("contactName" in body) input.contactName = optionalTrimmed(body.contactName);
  if ("company" in body) input.company = optionalTrimmed(body.company);
  if ("email" in body) input.email = optionalTrimmed(body.email);
  if ("phone" in body) input.phone = optionalTrimmed(body.phone);
  if ("expectedRevenue" in body) input.expectedRevenue = optionalNumber(body.expectedRevenue, 0);
  if ("probability" in body) input.probability = optionalNumber(body.probability, 0, 100);
  if ("assignedToUserId" in body) input.assignedToUserId = optionalTrimmed(body.assignedToUserId);
  const tags = normalizeTags(body.tags);
  if (tags !== undefined) input.tags = tags;
  return input;
}

async function findLead(req: Request, res: Response): Promise<ILead | null> {
  const id = String(req.params.id ?? "");
  if (!isValidId(id)) {
    res.status(400).json({ error: "Invalid lead id" });
    return null;
  }
  const organization = (req as OrganizationRequest).organization;
  const lead = await Lead.findOne({ _id: id, organizationId: organization._id });
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return null;
  }
  return lead;
}

// ---------------------------------------------------------------------------
// Board and leads
// ---------------------------------------------------------------------------

export const getBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const organization = (req as OrganizationRequest).organization;
    const search = String(req.query.search ?? "").trim();

    const stages = await getOrCreateLeadStages(organization._id);
    const filter: Record<string, unknown> = {
      organizationId: organization._id,
      isArchived: { $ne: true },
      ...(search
        ? {
            $or: LEAD_SEARCH_FIELDS.map((field) => ({
              [field]: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
            })),
          }
        : {}),
    };

    const leads = await Lead.find(filter).sort({ boardOrder: 1, updatedAt: -1 }).lean();

    const activities = await LeadActivity.find({
      organizationId: organization._id,
      leadId: { $in: leads.map((lead) => lead._id) },
      status: "planned",
    })
      .sort({ dueDate: 1 })
      .select("leadId type summary dueDate")
      .lean();

    const nextActivityByLead = new Map<string, (typeof activities)[number]>();
    for (const activity of activities) {
      const key = String(activity.leadId);
      if (!nextActivityByLead.has(key)) nextActivityByLead.set(key, activity);
    }

    res.json({
      stages,
      leads: leads.map((lead) => ({
        ...lead,
        nextActivity: nextActivityByLead.get(String(lead._id)) ?? null,
      })),
    });
  } catch (err) {
    console.error("Error fetching CRM board:", err);
    res.status(500).json({ error: "Failed to fetch CRM board" });
  }
};

export const getLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const lead = await findLead(req, res);
    if (!lead) return;
    res.json(lead);
  } catch (err) {
    console.error("Error fetching lead:", err);
    res.status(500).json({ error: "Failed to fetch lead" });
  }
};

export const createLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const orgReq = req as OrganizationRequest;
    const organization = orgReq.organization;
    const input = normalizeLeadInput(req.body ?? {});

    if (!input.title) {
      res.status(400).json({ error: "Lead title is required" });
      return;
    }

    const stages = await getOrCreateLeadStages(organization._id);
    let stageId = optionalTrimmed(req.body?.stageId);
    if (stageId && !stages.some((stage) => String(stage._id) === stageId)) {
      res.status(400).json({ error: "Invalid stage" });
      return;
    }
    if (!stageId) stageId = String(stages[0]._id);

    const source = LEAD_SOURCES.includes(req.body?.source) ? req.body.source : "manual";
    const last = await Lead.findOne({ organizationId: organization._id, stageId })
      .sort({ boardOrder: -1 })
      .select("boardOrder")
      .lean();

    const lead = await Lead.create({
      ...input,
      organizationId: organization._id,
      stageId,
      source,
      boardOrder: (last?.boardOrder ?? 0) + 1,
    });

    await recordLeadTimeline({
      organizationId: organization._id,
      leadId: lead._id,
      kind: "system",
      body: "Lead created",
      authorUserId: orgReq.user.id,
      authorName: orgReq.user.name ?? null,
      metadata: { event: "lead_created", source },
    });

    res.status(201).json(lead);
  } catch (err) {
    console.error("Error creating lead:", err);
    res.status(500).json({ error: "Failed to create lead" });
  }
};

export const updateLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const lead = await findLead(req, res);
    if (!lead) return;

    const input = normalizeLeadInput(req.body ?? {});
    if ("title" in input && !input.title) {
      res.status(400).json({ error: "Lead title is required" });
      return;
    }

    Object.assign(lead, input);
    await lead.save();
    res.json(lead);
  } catch (err) {
    console.error("Error updating lead:", err);
    res.status(500).json({ error: "Failed to update lead" });
  }
};

export const archiveLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const lead = await findLead(req, res);
    if (!lead) return;
    lead.isArchived = true;
    await lead.save();
    res.json({ message: "Lead archived", lead });
  } catch (err) {
    console.error("Error archiving lead:", err);
    res.status(500).json({ error: "Failed to archive lead" });
  }
};

export const moveLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const orgReq = req as OrganizationRequest;
    const lead = await findLead(req, res);
    if (!lead) return;

    const stageId = String(req.body?.stageId ?? "");
    if (!isValidId(stageId)) {
      res.status(400).json({ error: "Invalid stage id" });
      return;
    }

    const stage = await LeadStage.findOne({
      _id: stageId,
      organizationId: orgReq.organization._id,
    });
    if (!stage) {
      res.status(404).json({ error: "Stage not found" });
      return;
    }

    const previousStageId = String(lead.stageId);
    const boardOrder = optionalNumber(req.body?.boardOrder, 0);
    lead.stageId = stage._id;
    lead.boardOrder =
      boardOrder ??
      (((await Lead.findOne({ organizationId: orgReq.organization._id, stageId: stage._id })
        .sort({ boardOrder: -1 })
        .select("boardOrder")
        .lean())?.boardOrder ?? 0) + 1);
    await lead.save();

    if (previousStageId !== String(stage._id)) {
      await recordLeadTimeline({
        organizationId: orgReq.organization._id,
        leadId: lead._id,
        kind: "system",
        body: `Stage changed to ${stage.name}`,
        authorUserId: orgReq.user.id,
        authorName: orgReq.user.name ?? null,
        metadata: { event: "stage_moved", fromStageId: previousStageId, toStageId: String(stage._id) },
      });
    }

    res.json(lead);
  } catch (err) {
    console.error("Error moving lead:", err);
    res.status(500).json({ error: "Failed to move lead" });
  }
};

export const convertLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const orgReq = req as OrganizationRequest;
    const organization = orgReq.organization;
    const lead = await findLead(req, res);
    if (!lead) return;

    if (lead.status === "won" && lead.customerId) {
      res.status(400).json({ error: "Lead has already been converted" });
      return;
    }

    const email = optionalTrimmed(req.body?.email) ?? lead.email;
    if (!email) {
      res.status(400).json({ error: "An email address is required to convert this lead into a customer" });
      return;
    }

    const name = optionalTrimmed(req.body?.name) ?? lead.contactName ?? lead.title;
    const company = optionalTrimmed(req.body?.company) ?? lead.company ?? name;

    let customer = await Customer.findOne({
      organizationId: organization._id,
      email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    let customerCreated = false;

    if (!customer) {
      customer = await Customer.create({
        organizationId: organization._id,
        name,
        company,
        email,
        contactNumber: lead.phone,
        notes: null,
      });
      customerCreated = true;
    }

    const wonStage = await LeadStage.findOne({
      organizationId: organization._id,
      isWonStage: true,
    }).sort({ order: -1 });

    lead.status = "won";
    lead.wonAt = new Date();
    lead.lostAt = null;
    lead.lostReason = null;
    lead.customerId = customer._id as mongoose.Types.ObjectId;
    if (wonStage) lead.stageId = wonStage._id;
    await lead.save();

    await recordLeadTimeline({
      organizationId: organization._id,
      leadId: lead._id,
      kind: "system",
      body: customerCreated
        ? `Lead won and converted to new customer ${customer.name}`
        : `Lead won and linked to existing customer ${customer.name}`,
      authorUserId: orgReq.user.id,
      authorName: orgReq.user.name ?? null,
      metadata: { event: "converted", customerId: String(customer._id), customerCreated },
    });

    res.json({ lead, customer, customerCreated });
  } catch (err) {
    console.error("Error converting lead:", err);
    res.status(500).json({ error: "Failed to convert lead" });
  }
};

export const markLeadLost = async (req: Request, res: Response): Promise<void> => {
  try {
    const orgReq = req as OrganizationRequest;
    const lead = await findLead(req, res);
    if (!lead) return;

    lead.status = "lost";
    lead.lostAt = new Date();
    lead.lostReason = optionalTrimmed(req.body?.lostReason);
    await lead.save();

    await recordLeadTimeline({
      organizationId: orgReq.organization._id,
      leadId: lead._id,
      kind: "system",
      body: lead.lostReason ? `Lead marked lost: ${lead.lostReason}` : "Lead marked lost",
      authorUserId: orgReq.user.id,
      authorName: orgReq.user.name ?? null,
      metadata: { event: "marked_lost", lostReason: lead.lostReason },
    });

    res.json(lead);
  } catch (err) {
    console.error("Error marking lead lost:", err);
    res.status(500).json({ error: "Failed to mark lead lost" });
  }
};

export const restoreLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const orgReq = req as OrganizationRequest;
    const lead = await findLead(req, res);
    if (!lead) return;

    lead.status = "active";
    lead.lostAt = null;
    lead.lostReason = null;
    lead.wonAt = null;
    await lead.save();

    await recordLeadTimeline({
      organizationId: orgReq.organization._id,
      leadId: lead._id,
      kind: "system",
      body: "Lead restored to active",
      authorUserId: orgReq.user.id,
      authorName: orgReq.user.name ?? null,
      metadata: { event: "restored" },
    });

    res.json(lead);
  } catch (err) {
    console.error("Error restoring lead:", err);
    res.status(500).json({ error: "Failed to restore lead" });
  }
};

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export const listStages = async (req: Request, res: Response): Promise<void> => {
  try {
    const organization = (req as OrganizationRequest).organization;
    const stages = await getOrCreateLeadStages(organization._id);
    res.json({ stages });
  } catch (err) {
    console.error("Error listing lead stages:", err);
    res.status(500).json({ error: "Failed to fetch stages" });
  }
};

export const createStage = async (req: Request, res: Response): Promise<void> => {
  try {
    const organization = (req as OrganizationRequest).organization;
    const name = optionalTrimmed(req.body?.name);
    if (!name) {
      res.status(400).json({ error: "Stage name is required" });
      return;
    }

    const stages = await getOrCreateLeadStages(organization._id);
    if (stages.some((stage) => stage.name.toLowerCase() === name.toLowerCase())) {
      res.status(400).json({ error: "A stage with this name already exists" });
      return;
    }

    const stage = await LeadStage.create({
      organizationId: organization._id,
      name,
      order: (stages.at(-1)?.order ?? -1) + 1,
      isWonStage: Boolean(req.body?.isWonStage),
    });
    res.status(201).json(stage);
  } catch (err) {
    console.error("Error creating lead stage:", err);
    res.status(500).json({ error: "Failed to create stage" });
  }
};

export const updateStage = async (req: Request, res: Response): Promise<void> => {
  try {
    const organization = (req as OrganizationRequest).organization;
    const id = String(req.params.stageId ?? "");
    if (!isValidId(id)) {
      res.status(400).json({ error: "Invalid stage id" });
      return;
    }

    const update: Record<string, unknown> = {};
    const name = optionalTrimmed(req.body?.name);
    if (name) update.name = name;
    if ("isWonStage" in (req.body ?? {})) update.isWonStage = Boolean(req.body.isWonStage);

    const stage = await LeadStage.findOneAndUpdate(
      { _id: id, organizationId: organization._id },
      update,
      { returnDocument: "after", runValidators: true }
    );
    if (!stage) {
      res.status(404).json({ error: "Stage not found" });
      return;
    }
    res.json(stage);
  } catch (err) {
    console.error("Error updating lead stage:", err);
    res.status(500).json({ error: "Failed to update stage" });
  }
};

export const reorderStages = async (req: Request, res: Response): Promise<void> => {
  try {
    const organization = (req as OrganizationRequest).organization;
    const stageIds: string[] = Array.isArray(req.body?.stageIds)
      ? req.body.stageIds.map(String)
      : [];

    if (stageIds.length === 0 || !stageIds.every(isValidId)) {
      res.status(400).json({ error: "stageIds must be a list of stage ids" });
      return;
    }

    await Promise.all(
      stageIds.map((stageId, index) =>
        LeadStage.updateOne(
          { _id: stageId, organizationId: organization._id },
          { order: index }
        )
      )
    );

    const stages = await LeadStage.find({ organizationId: organization._id }).sort({ order: 1 });
    res.json({ stages });
  } catch (err) {
    console.error("Error reordering lead stages:", err);
    res.status(500).json({ error: "Failed to reorder stages" });
  }
};

export const deleteStage = async (req: Request, res: Response): Promise<void> => {
  try {
    const organization = (req as OrganizationRequest).organization;
    const id = String(req.params.stageId ?? "");
    if (!isValidId(id)) {
      res.status(400).json({ error: "Invalid stage id" });
      return;
    }

    const stages = await LeadStage.find({ organizationId: organization._id }).sort({ order: 1 });
    if (stages.length <= 1) {
      res.status(400).json({ error: "Cannot delete the last remaining stage" });
      return;
    }

    const stage = stages.find((candidate) => String(candidate._id) === id);
    if (!stage) {
      res.status(404).json({ error: "Stage not found" });
      return;
    }

    const fallback = stages.find((candidate) => String(candidate._id) !== id)!;
    await Lead.updateMany(
      { organizationId: organization._id, stageId: stage._id },
      { stageId: fallback._id }
    );
    await stage.deleteOne();

    res.json({ message: "Stage deleted", reassignedToStageId: String(fallback._id) });
  } catch (err) {
    console.error("Error deleting lead stage:", err);
    res.status(500).json({ error: "Failed to delete stage" });
  }
};

// ---------------------------------------------------------------------------
// Planned activities
// ---------------------------------------------------------------------------

/** All planned activities across leads, joined with lead context for the agenda view. */
export const listAllActivities = async (req: Request, res: Response): Promise<void> => {
  try {
    const organization = (req as OrganizationRequest).organization;

    const activities = await LeadActivity.find({
      organizationId: organization._id,
      status: "planned",
    })
      .sort({ dueDate: 1, createdAt: 1 })
      .limit(500)
      .lean();

    const leads = await Lead.find({
      _id: { $in: activities.map((activity) => activity.leadId) },
      isArchived: { $ne: true },
    })
      .select("title contactName company status")
      .lean();
    const leadById = new Map(leads.map((lead) => [String(lead._id), lead]));

    res.json({
      activities: activities
        .filter((activity) => leadById.has(String(activity.leadId)))
        .map((activity) => ({
          ...activity,
          lead: leadById.get(String(activity.leadId)),
        })),
    });
  } catch (err) {
    console.error("Error listing CRM activities:", err);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
};

export const listActivities = async (req: Request, res: Response): Promise<void> => {
  try {
    const lead = await findLead(req, res);
    if (!lead) return;
    const activities = await LeadActivity.find({ leadId: lead._id })
      .sort({ status: 1, dueDate: 1, createdAt: -1 })
      .lean();
    res.json({ activities });
  } catch (err) {
    console.error("Error listing lead activities:", err);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
};

export const createActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const orgReq = req as OrganizationRequest;
    const lead = await findLead(req, res);
    if (!lead) return;

    const type = String(req.body?.type ?? "") as LeadActivityType;
    const summary = optionalTrimmed(req.body?.summary);
    if (!LEAD_ACTIVITY_TYPES.includes(type)) {
      res.status(400).json({ error: "Invalid activity type" });
      return;
    }
    if (!summary) {
      res.status(400).json({ error: "Activity summary is required" });
      return;
    }

    const dueDateRaw = req.body?.dueDate ? new Date(req.body.dueDate) : null;
    const activity = await LeadActivity.create({
      organizationId: orgReq.organization._id,
      leadId: lead._id,
      type,
      summary,
      dueDate: dueDateRaw && !Number.isNaN(dueDateRaw.getTime()) ? dueDateRaw : null,
      assignedToUserId: optionalTrimmed(req.body?.assignedToUserId) ?? orgReq.user.id,
      createdByUserId: orgReq.user.id,
    });

    res.status(201).json(activity);
  } catch (err) {
    console.error("Error creating lead activity:", err);
    res.status(500).json({ error: "Failed to create activity" });
  }
};

async function findActivity(req: Request, res: Response) {
  const id = String(req.params.activityId ?? "");
  if (!isValidId(id)) {
    res.status(400).json({ error: "Invalid activity id" });
    return null;
  }
  const organization = (req as OrganizationRequest).organization;
  const activity = await LeadActivity.findOne({
    _id: id,
    organizationId: organization._id,
  });
  if (!activity) {
    res.status(404).json({ error: "Activity not found" });
    return null;
  }
  return activity;
}

export const updateActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const activity = await findActivity(req, res);
    if (!activity) return;

    const summary = optionalTrimmed(req.body?.summary);
    if (summary) activity.summary = summary;
    if ("type" in (req.body ?? {}) && LEAD_ACTIVITY_TYPES.includes(req.body.type)) {
      activity.type = req.body.type;
    }
    if ("dueDate" in (req.body ?? {})) {
      const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
      activity.dueDate = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null;
      activity.reminderSentAt = null;
    }
    if ("assignedToUserId" in (req.body ?? {})) {
      activity.assignedToUserId = optionalTrimmed(req.body.assignedToUserId);
    }
    if (req.body?.status === "canceled") {
      activity.status = "canceled";
    } else if (req.body?.status === "planned") {
      activity.status = "planned";
      activity.doneAt = null;
    }

    await activity.save();
    res.json(activity);
  } catch (err) {
    console.error("Error updating lead activity:", err);
    res.status(500).json({ error: "Failed to update activity" });
  }
};

export const markActivityDone = async (req: Request, res: Response): Promise<void> => {
  try {
    const orgReq = req as OrganizationRequest;
    const activity = await findActivity(req, res);
    if (!activity) return;

    activity.status = "done";
    activity.doneAt = new Date();
    await activity.save();

    await recordLeadTimeline({
      organizationId: orgReq.organization._id,
      leadId: activity.leadId,
      kind: "system",
      body: `Activity done: ${activity.summary}`,
      authorUserId: orgReq.user.id,
      authorName: orgReq.user.name ?? null,
      metadata: { event: "activity_done", activityId: String(activity._id), activityType: activity.type },
    });

    res.json(activity);
  } catch (err) {
    console.error("Error completing lead activity:", err);
    res.status(500).json({ error: "Failed to complete activity" });
  }
};

export const deleteActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const activity = await findActivity(req, res);
    if (!activity) return;
    await activity.deleteOne();
    res.json({ message: "Activity deleted" });
  } catch (err) {
    console.error("Error deleting lead activity:", err);
    res.status(500).json({ error: "Failed to delete activity" });
  }
};

// ---------------------------------------------------------------------------
// Timeline (chatter)
// ---------------------------------------------------------------------------

export const listTimeline = async (req: Request, res: Response): Promise<void> => {
  try {
    const lead = await findLead(req, res);
    if (!lead) return;
    const entries = await LeadTimelineEntry.find({ leadId: lead._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ entries });
  } catch (err) {
    console.error("Error listing lead timeline:", err);
    res.status(500).json({ error: "Failed to fetch timeline" });
  }
};

const NOTE_TEXT_MAX_LENGTH = 10000;
const NOTE_HTML_MAX_LENGTH = 200_000;
const NOTE_MAX_ATTACHMENTS = 10;

function normalizeNoteAttachments(
  value: unknown,
  organizationId: string
): ILeadNoteAttachment[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > NOTE_MAX_ATTACHMENTS) return null;

  const attachments: ILeadNoteAttachment[] = [];
  for (const item of value) {
    const key = optionalTrimmed((item as Record<string, unknown>)?.key);
    const name = optionalTrimmed((item as Record<string, unknown>)?.name);
    const contentType = optionalTrimmed((item as Record<string, unknown>)?.contentType);
    const size = Number((item as Record<string, unknown>)?.size ?? 0);
    if (!key || !name || !contentType || !Number.isFinite(size) || size <= 0) return null;
    // Only files the caller's own organization uploaded through the crm scope
    // can be referenced, otherwise a note could expose another tenant's files.
    if (!keyBelongsToPrefix(key, ["crm", organizationId])) return null;
    attachments.push({
      key,
      name: name.slice(0, 200),
      contentType: contentType.slice(0, 120),
      size,
    });
  }
  return attachments;
}

interface ParsedNoteInput {
  body: string;
  bodyHtml: string | null;
  attachments: ILeadNoteAttachment[];
  mentionedUserIds: string[];
  /** Plain text used for mention notification previews. */
  noteText: string;
}

/**
 * Validates and normalizes a note payload (shared by create and edit).
 * Writes the error response and returns null when the payload is invalid.
 */
async function parseNoteInput(req: Request, res: Response): Promise<ParsedNoteInput | null> {
  const orgReq = req as OrganizationRequest;

  const rawHtml = optionalTrimmed(req.body?.bodyHtml);
  if (rawHtml && rawHtml.length > NOTE_HTML_MAX_LENGTH) {
    res.status(400).json({ error: "Note is too long" });
    return null;
  }

  const attachments = normalizeNoteAttachments(
    req.body?.attachments,
    String(orgReq.organization._id)
  );
  if (attachments === null) {
    res.status(400).json({ error: "Invalid note attachments" });
    return null;
  }

  const bodyHtml = rawHtml ? sanitizeNoteHtml(rawHtml) : null;
  // The plain-text body is derived server-side (not trusted from the client)
  // because it doubles as the fallback rendering for older app versions.
  const bodyText = bodyHtml
    ? htmlToPlainText(bodyHtml)
    : (optionalTrimmed(req.body?.body) ?? "");
  const hasInlineImage = bodyHtml ? /<img\s/i.test(bodyHtml) : false;

  if (!bodyText && !hasInlineImage && attachments.length === 0) {
    res.status(400).json({ error: "Note body is required" });
    return null;
  }

  const fallbackBody = hasInlineImage
    ? "(image)"
    : `(${attachments.length} attachment${attachments.length === 1 ? "" : "s"})`;

  const mentionedUserIds = await filterMentionableUserIds(
    orgReq.organization._id,
    req.body?.mentionedUserIds
  );

  return {
    body: (bodyText || fallbackBody).slice(0, NOTE_TEXT_MAX_LENGTH),
    bodyHtml,
    attachments,
    mentionedUserIds,
    noteText: bodyText,
  };
}

/**
 * Loads a note timeline entry scoped to the lead + organization and enforces
 * that only the note's author can modify it.
 */
async function findOwnNoteEntry(req: Request, res: Response, leadId: mongoose.Types.ObjectId) {
  const orgReq = req as OrganizationRequest;
  const entryId = String(req.params.entryId ?? "");
  if (!isValidId(entryId)) {
    res.status(400).json({ error: "Invalid note id" });
    return null;
  }
  const entry = await LeadTimelineEntry.findOne({
    _id: entryId,
    organizationId: orgReq.organization._id,
    leadId,
    kind: "note",
  });
  if (!entry) {
    res.status(404).json({ error: "Note not found" });
    return null;
  }
  if (entry.authorUserId !== orgReq.user.id) {
    res.status(403).json({ error: "Only the note's author can modify it" });
    return null;
  }
  return entry;
}

export const addNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const orgReq = req as OrganizationRequest;
    const lead = await findLead(req, res);
    if (!lead) return;

    const input = await parseNoteInput(req, res);
    if (!input) return;
    const { bodyHtml, attachments, mentionedUserIds, noteText: bodyText } = input;

    const entry = await recordLeadTimeline({
      organizationId: orgReq.organization._id,
      leadId: lead._id,
      kind: "note",
      body: input.body,
      bodyHtml,
      attachments,
      authorUserId: orgReq.user.id,
      authorName: orgReq.user.name ?? null,
      mentions: mentionedUserIds,
    });

    if (mentionedUserIds.length > 0) {
      // Fire-and-forget: notification delivery must never fail the note.
      void notifyLeadNoteMentions({
        organizationId: orgReq.organization._id,
        lead: { _id: lead._id, title: lead.title },
        entryId: entry._id,
        noteText: bodyText,
        mentionedUserIds,
        actor: { userId: orgReq.user.id, name: orgReq.user.name ?? null },
      });
    }

    res.status(201).json(entry);
  } catch (err) {
    console.error("Error adding lead note:", err);
    res.status(500).json({ error: "Failed to add note" });
  }
};

export const updateNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const orgReq = req as OrganizationRequest;
    const lead = await findLead(req, res);
    if (!lead) return;

    const entry = await findOwnNoteEntry(req, res, lead._id);
    if (!entry) return;

    const input = await parseNoteInput(req, res);
    if (!input) return;

    const previousMentions = new Set(entry.mentions ?? []);

    entry.body = input.body;
    entry.bodyHtml = input.bodyHtml;
    entry.attachments = input.attachments;
    entry.mentions = input.mentionedUserIds;
    await entry.save();

    // Only users mentioned for the first time get notified; the per-entry
    // dedupe key in the notification service guards against repeats anyway.
    const addedMentions = input.mentionedUserIds.filter((id) => !previousMentions.has(id));
    if (addedMentions.length > 0) {
      // Fire-and-forget: notification delivery must never fail the edit.
      void notifyLeadNoteMentions({
        organizationId: orgReq.organization._id,
        lead: { _id: lead._id, title: lead.title },
        entryId: entry._id,
        noteText: input.noteText,
        mentionedUserIds: addedMentions,
        actor: { userId: orgReq.user.id, name: orgReq.user.name ?? null },
      });
    }

    res.json(entry);
  } catch (err) {
    console.error("Error updating lead note:", err);
    res.status(500).json({ error: "Failed to update note" });
  }
};

export const deleteNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const lead = await findLead(req, res);
    if (!lead) return;

    const entry = await findOwnNoteEntry(req, res, lead._id);
    if (!entry) return;

    await entry.deleteOne();
    res.json({ message: "Note deleted" });
  } catch (err) {
    console.error("Error deleting lead note:", err);
    res.status(500).json({ error: "Failed to delete note" });
  }
};

// ---------------------------------------------------------------------------
// Email compose
// ---------------------------------------------------------------------------

export const sendLeadEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const orgReq = req as OrganizationRequest;
    const lead = await findLead(req, res);
    if (!lead) return;

    const to = optionalTrimmed(req.body?.to) ?? lead.email;
    const subject = optionalTrimmed(req.body?.subject);
    const body = optionalTrimmed(req.body?.body);

    if (!to) {
      res.status(400).json({ error: "The lead has no email address; provide a recipient" });
      return;
    }
    if (!subject || !body) {
      res.status(400).json({ error: "Subject and body are required" });
      return;
    }

    const accountId = optionalTrimmed(req.body?.accountId);
    const accountFilter: Record<string, unknown> = {
      userId: orgReq.user.id,
      organizationId: orgReq.organization._id,
      status: "connected",
      ...(accountId && isValidId(accountId) ? { _id: accountId } : {}),
    };
    const account = await GmailAccount.findOne(accountFilter).sort({ updatedAt: -1 });
    if (!account) {
      res.status(400).json({
        error: "No connected Gmail account found. Connect a Gmail account to send emails.",
      });
      return;
    }

    const gmailMessageId = await sendStandaloneEmail({ account, to, subject, body });

    const entry = await recordLeadTimeline({
      organizationId: orgReq.organization._id,
      leadId: lead._id,
      kind: "email_sent",
      body,
      authorUserId: orgReq.user.id,
      authorName: orgReq.user.name ?? null,
      emailMeta: {
        to,
        subject,
        gmailMessageId,
        fromAddress: account.emailAddress,
      },
    });

    res.status(201).json({ entry, gmailMessageId });
  } catch (err) {
    console.error("Error sending lead email:", err);
    res.status(500).json({ error: "Failed to send email" });
  }
};
