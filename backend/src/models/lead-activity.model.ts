import mongoose, { Schema, type Document, type Types } from "mongoose";

export const LEAD_ACTIVITY_TYPES = ["call", "meeting", "todo", "email"] as const;
export const LEAD_ACTIVITY_STATUSES = ["planned", "done", "canceled"] as const;

export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];
export type LeadActivityStatus = (typeof LEAD_ACTIVITY_STATUSES)[number];

export interface ILeadActivity extends Document<Types.ObjectId> {
  organizationId: Types.ObjectId;
  leadId: Types.ObjectId;
  type: LeadActivityType;
  summary: string;
  dueDate: Date | null;
  assignedToUserId: string | null;
  status: LeadActivityStatus;
  doneAt: Date | null;
  reminderSentAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const leadActivitySchema = new Schema<ILeadActivity>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: LEAD_ACTIVITY_TYPES,
      required: true,
    },
    summary: { type: String, required: true, trim: true },
    dueDate: { type: Date, default: null },
    assignedToUserId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: LEAD_ACTIVITY_STATUSES,
      default: "planned",
      index: true,
    },
    doneAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    createdByUserId: { type: String, default: null },
  },
  { timestamps: true }
);

leadActivitySchema.index({ organizationId: 1, leadId: 1, status: 1, dueDate: 1 });
// Reminder cron scans for due, planned, un-reminded activities.
leadActivitySchema.index({ status: 1, dueDate: 1, reminderSentAt: 1 });

export const LeadActivity = mongoose.model<ILeadActivity>(
  "LeadActivity",
  leadActivitySchema
);
