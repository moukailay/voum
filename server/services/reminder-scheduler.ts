import { db } from "../db";
import { reminders, bookings, users, notifications, InsertReminder } from "@shared/schema";
import { eq, and, lte } from "drizzle-orm";
import { sendReminderEmail } from "./email";

interface AppointmentReminders {
  pickupReminders: Array<{ type: "pickup_24h" | "pickup_2h"; scheduledFor: Date }>;
  deliveryReminders: Array<{ type: "delivery_24h" | "delivery_2h"; scheduledFor: Date }>;
}

/**
 * Calculate reminder times for a given appointment
 */
export function calculateReminderTimes(appointmentDateTime: Date): Array<{ scheduledFor: Date }> {
  const reminderTimes: Array<{ scheduledFor: Date }> = [];
  
  // T-24h reminder
  const reminder24h = new Date(appointmentDateTime);
  reminder24h.setHours(reminder24h.getHours() - 24);
  
  // T-2h reminder
  const reminder2h = new Date(appointmentDateTime);
  reminder2h.setHours(reminder2h.getHours() - 2);
  
  // Only schedule future reminders
  const now = new Date();
  if (reminder24h > now) {
    reminderTimes.push({ scheduledFor: reminder24h });
  }
  if (reminder2h > now) {
    reminderTimes.push({ scheduledFor: reminder2h });
  }
  
  return reminderTimes;
}

/**
 * Schedule reminders for a booking's appointments
 */
export async function scheduleAppointmentReminders(
  bookingId: string,
  senderId: string,
  travelerId: string,
  pickupDateTime: Date | null,
  deliveryDateTime: Date | null
): Promise<void> {
  try {
    const remindersToCreate: Array<Omit<InsertReminder, "status" | "notificationMethod"> & { status: "pending"; notificationMethod: "both" }> = [];

    // Schedule pickup reminders (sender)
    if (pickupDateTime) {
      const pickupTimes = calculateReminderTimes(pickupDateTime);
      pickupTimes.forEach((reminder, index) => {
        const type = index === 0 ? "pickup_24h" : "pickup_2h";
        remindersToCreate.push({
          bookingId,
          userId: senderId,
          type: type as "pickup_24h" | "pickup_2h",
          scheduledFor: reminder.scheduledFor,
          status: "pending" as const,
          notificationMethod: "both" as const,
        });
      });
    }

    // Schedule delivery reminders (traveler)
    if (deliveryDateTime) {
      const deliveryTimes = calculateReminderTimes(deliveryDateTime);
      deliveryTimes.forEach((reminder, index) => {
        const type = index === 0 ? "delivery_24h" : "delivery_2h";
        remindersToCreate.push({
          bookingId,
          userId: travelerId,
          type: type as "delivery_24h" | "delivery_2h",
          scheduledFor: reminder.scheduledFor,
          status: "pending" as const,
          notificationMethod: "both" as const,
        });
      });
    }

    if (remindersToCreate.length > 0) {
      await db.insert(reminders).values(remindersToCreate);
      console.log(`[Reminder Scheduler] Scheduled ${remindersToCreate.length} reminders for booking ${bookingId}`);
    }
  } catch (error) {
    console.error("[Reminder Scheduler] Error scheduling reminders:", error);
    throw error;
  }
}

/**
 * Cancel all pending reminders for a booking
 */
export async function cancelBookingReminders(bookingId: string): Promise<void> {
  try {
    await db
      .update(reminders)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(reminders.bookingId, bookingId),
          eq(reminders.status, "pending")
        )
      );
    
    console.log(`[Reminder Scheduler] Cancelled reminders for booking ${bookingId}`);
  } catch (error) {
    console.error("[Reminder Scheduler] Error cancelling reminders:", error);
  }
}

/**
 * Process and send due reminders
 * This function is called periodically by the cron job
 */
export async function processDueReminders(): Promise<void> {
  try {
    const now = new Date();
    
    // Find all pending reminders that are due
    const dueReminders = await db
      .select({
        reminder: reminders,
        booking: bookings,
        user: users,
      })
      .from(reminders)
      .innerJoin(bookings, eq(reminders.bookingId, bookings.id))
      .innerJoin(users, eq(reminders.userId, users.id))
      .where(
        and(
          eq(reminders.status, "pending"),
          lte(reminders.scheduledFor, now)
        )
      )
      .limit(50); // Process in batches

    console.log(`[Reminder Processor] Found ${dueReminders.length} due reminders`);

    for (const { reminder, booking, user } of dueReminders) {
      await processSingleReminder(reminder, booking, user);
    }
  } catch (error) {
    console.error("[Reminder Processor] Error processing reminders:", error);
  }
}

/**
 * Process a single reminder
 */
async function processSingleReminder(
  reminder: typeof reminders.$inferSelect,
  booking: typeof bookings.$inferSelect,
  user: typeof users.$inferSelect
): Promise<void> {
  try {
    let emailSent = false;
    let inAppSent = false;
    let errorMessage = null;

    // Get trip and other user info
    const [tripData] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, booking.id))
      .limit(1);

    if (!tripData) {
      throw new Error("Booking not found");
    }

    // Determine appointment details based on reminder type
    const isPickup = reminder.type.includes("pickup");
    const appointmentDateTime = isPickup ? booking.pickupDateTime : booking.deliveryDateTime;
    const appointmentLocation = isPickup ? booking.pickupLocation : booking.deliveryLocation;

    if (!appointmentDateTime || !appointmentLocation) {
      throw new Error("Appointment details missing");
    }

    // Get other party's name
    const otherUserId = isPickup ? booking.senderId : booking.senderId; // For now, simplified
    const [otherUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, otherUserId))
      .limit(1);

    const otherPartyName = otherUser 
      ? `${otherUser.firstName} ${otherUser.lastName}`.trim() || "Utilisateur"
      : "Utilisateur";

    // Send email if enabled
    if (reminder.notificationMethod === "email" || reminder.notificationMethod === "both") {
      if (user.email) {
        emailSent = await sendReminderEmail({
          to: user.email,
          userName: `${user.firstName} ${user.lastName}`.trim() || "Utilisateur",
          type: reminder.type as any,
          appointmentDetails: {
            location: appointmentLocation,
            dateTime: appointmentDateTime,
            bookingId: booking.id,
            otherPartyName,
          },
        });
      }
    }

    // Send in-app notification
    if (reminder.notificationMethod === "in_app" || reminder.notificationMethod === "both") {
      const timeLabel = reminder.type.includes("24h") ? "24 heures" : "2 heures";
      const actionLabel = isPickup ? "remise" : "livraison";
      
      const notificationMessage = `⏰ Rappel : ${actionLabel} de colis dans ${timeLabel} à ${appointmentLocation}`;
      
      const [notification] = await db
        .insert(notifications)
        .values({
          userId: user.id,
          type: "system",
          title: `Rappel de ${actionLabel}`,
          message: notificationMessage,
          relatedId: booking.id,
        })
        .returning();

      if (notification) {
        inAppSent = true;
        // TODO: Broadcast via WebSocket when user is online
        // broadcastToUser(user.id, { type: "notification", data: notification });
      }
    }

    // Update reminder status
    await db
      .update(reminders)
      .set({
        status: (emailSent || inAppSent) ? "sent" : "failed",
        sentAt: new Date(),
        emailSent,
        inAppSent,
        errorMessage,
      })
      .where(eq(reminders.id, reminder.id));

    console.log(`[Reminder Processor] Processed reminder ${reminder.id}: email=${emailSent}, inApp=${inAppSent}`);
  } catch (error) {
    console.error(`[Reminder Processor] Error processing reminder ${reminder.id}:`, error);
    
    // Mark as failed
    await db
      .update(reminders)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(reminders.id, reminder.id));
  }
}
