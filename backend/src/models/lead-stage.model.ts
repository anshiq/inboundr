import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface ILeadStage extends Document<Types.ObjectId> {
  organizationId: Types.ObjectId;
  name: string;
  order: number;
  isWonStage: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const leadStageSchema = new Schema<ILeadStage>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    order: { type: Number, required: true, default: 0 },
    isWonStage: { type: Boolean, default: false },
  },
  { timestamps: true }
);

leadStageSchema.index({ organizationId: 1, order: 1 });
leadStageSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export const LeadStage = mongoose.model<ILeadStage>("LeadStage", leadStageSchema);
