import mongoose, { Schema, type Document, type Types } from "mongoose";

export const LEAD_SOURCES = ["manual", "form", "contact", "import"] as const;
export const LEAD_STATUSES = ["active", "won", "lost"] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface ILead extends Document<Types.ObjectId> {
  organizationId: Types.ObjectId;
  title: string;
  contactName: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  stageId: Types.ObjectId;
  expectedRevenue: number | null;
  probability: number | null;
  tags: string[];
  source: LeadSource;
  assignedToUserId: string | null;
  status: LeadStatus;
  lostReason: string | null;
  customerId: Types.ObjectId | null;
  boardOrder: number;
  isArchived: boolean;
  wonAt: Date | null;
  lostAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const leadSchema = new Schema<ILead>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    contactName: { type: String, default: null, trim: true },
    company: { type: String, default: null, trim: true },
    email: { type: String, default: null, trim: true },
    phone: { type: String, default: null, trim: true },
    stageId: {
      type: Schema.Types.ObjectId,
      ref: "LeadStage",
      required: true,
      index: true,
    },
    expectedRevenue: { type: Number, default: null, min: 0 },
    probability: { type: Number, default: null, min: 0, max: 100 },
    tags: { type: [String], default: [] },
    source: {
      type: String,
      enum: LEAD_SOURCES,
      default: "manual",
      index: true,
    },
    assignedToUserId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: LEAD_STATUSES,
      default: "active",
      index: true,
    },
    lostReason: { type: String, default: null, trim: true },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    boardOrder: { type: Number, required: true, default: 0 },
    isArchived: { type: Boolean, default: false, index: true },
    wonAt: { type: Date, default: null },
    lostAt: { type: Date, default: null },
  },
  { timestamps: true }
);

leadSchema.index({ organizationId: 1, stageId: 1, boardOrder: 1 });
leadSchema.index({ organizationId: 1, status: 1, updatedAt: -1 });
leadSchema.index({ organizationId: 1, email: 1 });

export const Lead = mongoose.model<ILead>("Lead", leadSchema);
