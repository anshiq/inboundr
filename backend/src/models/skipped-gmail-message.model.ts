import mongoose, { Schema, type Document } from "mongoose";

export type SkippedGmailMessageReason = "not_found" | "self_sent" | "failed";

/**
 * Marker for Gmail messages we fetched (or tried to fetch) and decided never
 * to ingest — deleted messages, self-sent mail, and messages that exhausted
 * their ingestion retries. Lets repeat sync passes (boot catch-up, backfill,
 * reconciliation cron) skip them with a single indexed lookup instead of a
 * Gmail API round-trip. TTL-expired markers are harmless: the message is
 * simply re-checked once against Gmail.
 *
 * `attempts` only applies to the "failed" reason: it counts consecutive
 * ingestion failures so the sync cursor can advance once a message has proven
 * permanently broken, instead of replaying the whole history range forever.
 */
export interface ISkippedGmailMessage extends Document {
  gmailAccountId: mongoose.Types.ObjectId;
  messageId: string;
  reason: SkippedGmailMessageReason;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

const skippedGmailMessageSchema = new Schema<ISkippedGmailMessage>(
  {
    gmailAccountId: {
      type: Schema.Types.ObjectId,
      ref: "GmailAccount",
      required: true,
    },
    messageId: { type: String, required: true },
    reason: {
      type: String,
      enum: ["not_found", "self_sent", "failed"],
      required: true,
    },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

skippedGmailMessageSchema.index(
  { gmailAccountId: 1, messageId: 1 },
  { unique: true }
);
skippedGmailMessageSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: THIRTY_DAYS_SECONDS }
);

export const SkippedGmailMessage = mongoose.model<ISkippedGmailMessage>(
  "SkippedGmailMessage",
  skippedGmailMessageSchema
);
