import type { Request, Response } from "express";
import { createElement } from "react";
import { z } from "zod";
import { frontendOrigin } from "../config/origins.config";
import { WaitlistConfirmationEmail } from "../emails/waitlist-confirmation";
import { WaitlistNotificationEmail } from "../emails/waitlist-notification";
import { sendEmail } from "../lib/email";
import {
  WAITLIST_REFERRAL_SOURCES,
  WAITLIST_REFERRAL_SOURCE_LABELS,
  WaitlistEntry,
  type WaitlistReferralSource,
} from "../models/waitlist.model";

const joinWaitlistSchema = z.object({
  email: z
    .string()
    .trim()
    .email("A valid email is required")
    .max(254)
    .toLowerCase(),
  name: z.string().trim().min(1, "Name is required").max(120),
  companyName: z.string().trim().min(1, "Company name is required").max(160),
  referralSource: z.enum(WAITLIST_REFERRAL_SOURCES),
});

function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

async function sendWaitlistEmails(entry: {
  email: string;
  name: string;
  companyName: string;
  referralSource: WaitlistReferralSource;
}): Promise<void> {
  const admins = superAdminEmails();
  if (admins.length === 0) {
    console.warn(
      "SUPER_ADMIN_EMAILS is empty; skipping waitlist admin notification"
    );
  }

  const sends: Promise<unknown>[] = [
    sendEmail({
      to: entry.email,
      subject: "You're on the Inboundr waitlist",
      react: createElement(WaitlistConfirmationEmail, { name: entry.name }),
    }),
  ];

  if (admins.length > 0) {
    sends.push(
      sendEmail({
        to: admins,
        subject: `New waitlist signup: ${entry.name} (${entry.companyName})`,
        react: createElement(WaitlistNotificationEmail, {
          name: entry.name,
          email: entry.email,
          waitlistCompany: entry.companyName,
          referralSourceLabel:
            WAITLIST_REFERRAL_SOURCE_LABELS[entry.referralSource],
          adminWaitlistUrl: `${frontendOrigin}/admin/waitlist`,
        }),
        replyTo: [entry.email],
      })
    );
  }

  const results = await Promise.allSettled(sends);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Failed to send waitlist email:", result.reason);
    }
  }
}

export async function joinWaitlist(req: Request, res: Response): Promise<void> {
  const parsed = joinWaitlistSchema.safeParse(req.body);

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message;
    res.status(400).json({
      error: firstError ?? "Invalid waitlist submission",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { email, name, companyName, referralSource } = parsed.data;

  try {
    // Idempotent: joining twice with the same email is treated as success so
    // the endpoint doesn't leak which emails are already on the list. Emails
    // only go out for genuinely new entries.
    const result = await WaitlistEntry.updateOne(
      { email },
      { $setOnInsert: { email, name, companyName, referralSource } },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      // The entry is already saved; email delivery problems shouldn't turn
      // the signup into an error for the user.
      void sendWaitlistEmails({ email, name, companyName, referralSource });
    }

    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("Failed to join waitlist:", error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

export async function listAdminWaitlist(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const [entries, total] = await Promise.all([
      WaitlistEntry.find().sort({ createdAt: -1 }).limit(1000).lean(),
      WaitlistEntry.countDocuments(),
    ]);

    res.json({
      entries: entries.map((entry) => ({
        _id: String(entry._id),
        email: entry.email,
        name: entry.name ?? "",
        companyName: entry.companyName ?? "",
        referralSource: entry.referralSource ?? "",
        referralSourceLabel: entry.referralSource
          ? WAITLIST_REFERRAL_SOURCE_LABELS[
              entry.referralSource as WaitlistReferralSource
            ] ?? entry.referralSource
          : "",
        createdAt: entry.createdAt,
      })),
      total,
    });
  } catch (error) {
    console.error("Failed to list waitlist:", error);
    res.status(500).json({ error: "Failed to load the waitlist." });
  }
}
