import { LeadActivity } from "../models/lead-activity.model";
import { Lead } from "../models/lead.model";
import { createNotificationForRecipient } from "./notification.service";

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  call: "Call",
  meeting: "Meeting",
  todo: "To-do",
  email: "Email",
};

export async function sendDueLeadActivityReminders(): Promise<void> {
  const now = new Date();
  const dueActivities = await LeadActivity.find({
    status: "planned",
    dueDate: { $ne: null, $lte: now },
    reminderSentAt: null,
    assignedToUserId: { $ne: null },
  })
    .limit(500)
    .lean();

  if (dueActivities.length === 0) return;

  const leads = await Lead.find({
    _id: { $in: dueActivities.map((activity) => activity.leadId) },
  })
    .select("title")
    .lean();
  const leadTitleById = new Map(leads.map((lead) => [String(lead._id), lead.title]));

  for (const activity of dueActivities) {
    const leadTitle = leadTitleById.get(String(activity.leadId)) ?? "a lead";
    const typeLabel = ACTIVITY_TYPE_LABELS[activity.type] ?? "Activity";

    try {
      await createNotificationForRecipient({
        organizationId: activity.organizationId,
        recipientUserId: activity.assignedToUserId!,
        type: "crm.activity_due",
        title: `${typeLabel} due: ${activity.summary}`,
        body: `Planned activity on lead "${leadTitle}" is due.`,
        actionUrl: `/crm/${activity.leadId}`,
        entityType: "lead",
        entityId: String(activity.leadId),
        dedupeKey: `crm-activity-due-${activity._id}`,
      });
    } catch (err) {
      // Recipient may have left the organization; still mark as reminded so
      // the cron does not retry forever.
      console.error(`Failed to send CRM activity reminder ${activity._id}:`, err);
    }

    await LeadActivity.updateOne({ _id: activity._id }, { reminderSentAt: now });
  }
}
