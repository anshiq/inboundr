import mongoose, { Schema, type Document } from "mongoose";

export interface IWaitlistEntry extends Document {
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

const waitlistEntrySchema = new Schema<IWaitlistEntry>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
  },
  { timestamps: true }
);

export const WaitlistEntry = mongoose.model<IWaitlistEntry>(
  "WaitlistEntry",
  waitlistEntrySchema
);
