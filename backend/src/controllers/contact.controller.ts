import type { Request, Response } from "express";
import { createElement } from "react";
import mongoose from "mongoose";
import { z } from "zod";
import { ContactAutoReplyEmail } from "../emails/contact-autoreply";
import { ContactInquiryEmail } from "../emails/contact-inquiry";
import { sendEmail } from "../lib/email";
import { createCapturedLead } from "../services/crm.service";

const CONTACT_RECIPIENT = "tushar.g@orangewood.co";

/**
 * The landing contact form is platform-level (not org-scoped), so captured
 * leads are routed into the single organization configured via env.
 */
async function captureContactLead(input: {
  name: string;
  email: string;
  message: string;
}): Promise<void> {
  const organizationId = (process.env.CONTACT_LEAD_ORGANIZATION_ID ?? "").trim();
  if (!organizationId || !mongoose.Types.ObjectId.isValid(organizationId)) return;

  try {
    await createCapturedLead({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      title: `Website inquiry: ${input.name}`,
      contactName: input.name,
      email: input.email,
      source: "contact",
      captureNote: `Lead captured from the landing contact form.\n\nMessage:\n${input.message.slice(0, 2000)}`,
    });
  } catch (err) {
    console.error("Failed to capture contact form lead:", err);
  }
}

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("A valid email is required").max(254),
  message: z.string().trim().min(1, "Message is required").max(5000),
});

export async function submitContactForm(req: Request, res: Response) {
  const parsed = contactSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid contact form submission",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { name, email, message } = parsed.data;

  try {
    await Promise.all([
      sendEmail({
        to: email,
        subject: "We received your message",
        react: createElement(ContactAutoReplyEmail, { name }),
      }),
      sendEmail({
        to: CONTACT_RECIPIENT,
        subject: "New inquiry received",
        react: createElement(ContactInquiryEmail, { name, email, message }),
        replyTo: [email],
      }),
    ]);

    void captureContactLead({ name, email, message });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Failed to send contact form emails:", err);
    res.status(500).json({
      error: "Unable to send your message right now. Please try again later.",
    });
  }
}
