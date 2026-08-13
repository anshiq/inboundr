import mongoose, { Schema, type Document, type Types } from "mongoose";

export const LEAD_TIMELINE_KINDS = ["note", "email_sent", "system"] as const;

export type LeadTimelineKind = (typeof LEAD_TIMELINE_KINDS)[number];

export interface ILeadTimelineEmailMeta {
  to: string;
  subject: string;
  gmailMessageId: string | null;
  fromAddress: string | null;
}

export interface ILeadNoteAttachment {
  key: string;
  name: string;
  contentType: string;
  size: number;
}

export interface ILeadTimelineEntry extends Document<Types.ObjectId> {
  organizationId: Types.ObjectId;
  leadId: Types.ObjectId;
  kind: LeadTimelineKind;
  authorUserId: string | null;
  authorName: string | null;
  body: string;
  /** Sanitized rich-text HTML; null for plain-text and system entries. */
  bodyHtml: string | null;
  attachments: ILeadNoteAttachment[];
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
    bodyHtml: { type: String, default: null },
    attachments: {
      type: [
        new Schema<ILeadNoteAttachment>(
          {
            key: { type: String, required: true },
            name: { type: String, required: true, trim: true },
            contentType: { type: String, required: true },
            size: { type: Number, required: true },
          },
          { _id: false }
        ),
      ],
      default: () => [],
    },
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
