import mongoose, { Schema, type Document } from "mongoose";

export const WAITLIST_REFERRAL_SOURCES = [
  "search",
  "social_media",
  "linkedin",
  "friend_colleague",
  "newsletter_blog",
  "event",
  "other",
] as const;

export type WaitlistReferralSource = (typeof WAITLIST_REFERRAL_SOURCES)[number];

export const WAITLIST_REFERRAL_SOURCE_LABELS: Record<
  WaitlistReferralSource,
  string
> = {
  search: "Search engine",
  social_media: "Social media",
  linkedin: "LinkedIn",
  friend_colleague: "Friend or colleague",
  newsletter_blog: "Newsletter or blog",
  event: "Event or conference",
  other: "Other",
};

export interface IWaitlistEntry extends Document {
  email: string;
  name: string;
  companyName: string;
  referralSource: WaitlistReferralSource | "";
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
    name: { type: String, default: "", trim: true },
    companyName: { type: String, default: "", trim: true },
    referralSource: {
      type: String,
      enum: [...WAITLIST_REFERRAL_SOURCES, ""],
      default: "",
    },
  },
  { timestamps: true }
);

export const WaitlistEntry = mongoose.model<IWaitlistEntry>(
  "WaitlistEntry",
  waitlistEntrySchema
);
