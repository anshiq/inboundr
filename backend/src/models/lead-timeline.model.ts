import mongoose, { Schema, type Document, type Types } from "mongoose";

export const LEAD_TIMELINE_KINDS = ["note", "email_sent", "system"] as const;

export type LeadTimelineKind = (typeof LEAD_TIMELINE_KINDS)[number];

export interface ILeadTimelineEmailMeta {
  to: string;
  subject: string;
  gmailMessageId: string | null;
  fromAddress: string | null;
}

export interface ILeadTimelineEntry extends Document<Types.ObjectId> {
  organizationId: Types.ObjectId;
  leadId: Types.ObjectId;
  kind: LeadTimelineKind;
  authorUserId: string | null;
  authorName: string | null;
  body: string;
  emailMeta: ILeadTimelineEmailMeta | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const leadTimelineSchema = new Schema<ILeadTimelineEntry>(
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
    kind: {
      type: String,
      enum: LEAD_TIMELINE_KINDS,
      required: true,
      index: true,
    },
    authorUserId: { type: String, default: null },
    authorName: { type: String, default: null, trim: true },
    body: { type: String, required: true },
    emailMeta: {
      type: new Schema<ILeadTimelineEmailMeta>(
        {
          to: { type: String, required: true },
          subject: { type: String, required: true },
          gmailMessageId: { type: String, default: null },
          fromAddress: { type: String, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

leadTimelineSchema.index({ organizationId: 1, leadId: 1, createdAt: -1 });

export const LeadTimelineEntry = mongoose.model<ILeadTimelineEntry>(
  "LeadTimelineEntry",
  leadTimelineSchema
);
