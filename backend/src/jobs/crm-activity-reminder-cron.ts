import { sendDueLeadActivityReminders } from "../services/crm-activity-reminder.service";

export function startCrmActivityReminderCron(): void {
  Bun.cron("0 * * * *", async () => {
    try {
      await sendDueLeadActivityReminders();
    } catch (err) {
      console.error("CRM activity reminder cron failed:", err);
    }
  });

  console.log("CRM activity reminder cron scheduled (runs at the top of every hour)");
}
