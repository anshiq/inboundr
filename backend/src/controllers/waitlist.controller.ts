import type { Request, Response } from "express";
import { WaitlistEntry } from "../models/waitlist.model";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function joinWaitlist(req: Request, res: Response): Promise<void> {
  try {
    const email = String(req.body?.email ?? "")
      .toLowerCase()
      .trim();

    if (!EMAIL_PATTERN.test(email)) {
      res.status(400).json({ error: "Please provide a valid email address." });
      return;
    }

    // Idempotent: joining twice with the same email is treated as success so
    // the endpoint doesn't leak which emails are already on the list.
    await WaitlistEntry.updateOne(
      { email },
      { $setOnInsert: { email } },
      { upsert: true }
    );

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
        createdAt: entry.createdAt,
      })),
      total,
    });
  } catch (error) {
    console.error("Failed to list waitlist:", error);
    res.status(500).json({ error: "Failed to load the waitlist." });
  }
}
