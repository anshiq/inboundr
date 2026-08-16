import { createElement } from "react";
import type { Types } from "mongoose";
import { frontendOrigin } from "../config/origins.config";
import { CrmMentionEmail } from "../emails/crm-mention";
import { sendEmail } from "../lib/email";
import { Organization } from "../models/organization.model";
import { OrganizationMember } from "../models/organization-member.model";
import { createNotificationForRecipient } from "./notification.service";
import { resolveUsersByIds } from "./user-lookup.service";

const MENTION_LIMIT = 25;
const EXCERPT_LENGTH = 240;

/**
 * The client-sent mention list is only a hint: keep the ids that are actual
 * members of the organization so a forged request can neither store nor
 * notify arbitrary users.
 */
export async function filterMentionableUserIds(
  organizationId: Types.ObjectId,
  value: unknown
): Promise<string[]> {
  if (!Array.isArray(value)) return [];
  const candidates = [
    ...new Set(value.map((id) => String(id ?? "").trim()).filter(Boolean)),
  ].slice(0, MENTION_LIMIT);
  if (candidates.length === 0) return [];

  const members = await OrganizationMember.find({
    organizationId,
    userId: { $in: candidates },
  })
    .select("userId")
    .lean();
  const memberIds = new Set(members.map((member) => member.userId));
  return candidates.filter((id) => memberIds.has(id));
}

/**
 * Notifies every mentioned member (in-app + email) about a new lead note.
 * Fire-and-forget: failures are logged and never fail note creation.
 */
export async function notifyLeadNoteMentions(input: {
  organizationId: Types.ObjectId;
  lead: { _id: unknown; title: string };
  entryId: unknown;
  /** Plain-text note body, used for the notification/email excerpt. */
  noteText: string;
  mentionedUserIds: string[];
  actor: { userId: string; name: string | null };
}): Promise<void> {
  try {
    const recipients = input.mentionedUserIds.filter(
      (userId) => userId !== input.actor.userId
    );
    if (recipients.length === 0) return;

    const [organization, users] = await Promise.all([
      Organization.findById(input.organizationId).select("name").lean(),
      resolveUsersByIds([...recipients, input.actor.userId]),
    ]);
    const organizationName = organization?.name ?? "your organization";
    const actorName =
      input.actor.name?.trim() ||
      users.get(input.actor.userId)?.name ||
      "A teammate";

    const leadId = String(input.lead._id);
    const excerpt = input.noteText.trim().slice(0, EXCERPT_LENGTH);
    const title = `${actorName} mentioned you in a note`;
    const body = `On lead "${input.lead.title}"${excerpt ? `: ${excerpt}` : ""}`;

    await Promise.allSettled(
      recipients.map(async (recipientUserId) => {
        await createNotificationForRecipient({
          organizationId: input.organizationId,
          recipientUserId,
          type: "crm.note.mention",
          title,
          body,
          actionUrl: `/crm/${leadId}`,
          actorUserId: input.actor.userId,
          entityType: "lead",
          entityId: leadId,
          dedupeKey: `crm-note-mention-${input.entryId}-${recipientUserId}`,
        }).catch((err) => {
          console.error(
            `Failed to create mention notification for ${recipientUserId}:`,
            err
          );
        });

        const recipient = users.get(recipientUserId);
        if (!recipient?.email) return;
        await sendEmail({
          to: recipient.email,
          subject: `${actorName} mentioned you in a note on "${input.lead.title}"`,
          react: createElement(CrmMentionEmail, {
            recipientName: recipient.name ?? "there",
            actorName,
            organizationName,
            leadTitle: input.lead.title,
            noteExcerpt: excerpt,
            leadUrl: `${frontendOrigin}/crm/${leadId}`,
          }),
        }).catch((err) => {
          console.error(`Failed to send mention email to ${recipientUserId}:`, err);
        });
      })
    );
  } catch (err) {
    console.error("Failed to notify lead note mentions:", err);
  }
}
