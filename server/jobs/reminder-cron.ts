import cron from "node-cron";
import { processDueReminders } from "../services/reminder-scheduler";

/**
 * Start the reminder cron job
 * Runs every 5 minutes to check for due reminders
 */
export function startReminderCron() {
  // Run every 5 minutes
  const task = cron.schedule("*/5 * * * *", async () => {
    console.log("[Reminder Cron] Checking for due reminders...");
    try {
      await processDueReminders();
    } catch (error) {
      console.error("[Reminder Cron] Error processing reminders:", error);
    }
  });

  // Also run immediately on startup
  console.log("[Reminder Cron] Starting reminder scheduler...");
  processDueReminders().catch((error) => {
    console.error("[Reminder Cron] Error in initial reminder check:", error);
  });

  return task;
}
