import {
  users,
  trips,
  bookings,
  messages,
  messageAttachments,
  notifications,
  blockedUsers,
  messageReports,
  type User,
  type UpsertUser,
  type Trip,
  type InsertTrip,
  type Booking,
  type InsertBooking,
  type Message,
  type InsertMessage,
  type MessageAttachment,
  type InsertMessageAttachment,
  type Notification,
  type InsertNotification,
  type BlockedUser,
  type InsertBlockedUser,
  type MessageReport,
  type InsertMessageReport,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc, sql, gte, lte } from "drizzle-orm";

export interface IStorage {
  // User operations (Required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Trip operations
  createTrip(trip: InsertTrip): Promise<Trip>;
  getTrip(id: string): Promise<Trip | undefined>;
  getUserTrips(userId: string): Promise<Trip[]>;
  searchTrips(filters: {
    departure?: string;
    destination?: string;
    maxPrice?: number;
    minWeight?: number;
  }): Promise<Trip[]>;
  getRecentTrips(limit?: number): Promise<Trip[]>;
  updateTripStatus(id: string, status: string): Promise<Trip | undefined>;

  // Booking operations
  createBooking(booking: InsertBooking): Promise<Booking>;
  getBooking(id: string): Promise<Booking | undefined>;
  getUserBookings(userId: string): Promise<Booking[]>;
  getTripBookings(tripId: string): Promise<Booking[]>;
  updateBookingStatus(
    id: string,
    status: string
  ): Promise<Booking | undefined>;
  updateBookingEscrowStatus(
    id: string,
    escrowStatus: string
  ): Promise<Booking | undefined>;
  confirmPickupAppointment(
    bookingId: string,
    userId: string
  ): Promise<Booking | undefined>;
  confirmDeliveryAppointment(
    bookingId: string,
    userId: string
  ): Promise<Booking | undefined>;
  updateBookingAppointment(
    bookingId: string,
    updates: {
      pickupLocation?: string;
      pickupDateTime?: Date;
      deliveryLocation?: string | null;
      deliveryDateTime?: Date | null;
    },
    userId: string
  ): Promise<Booking | undefined>;

  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getBookingMessages(bookingId: string): Promise<Message[]>;
  getUserConversations(userId: string): Promise<any[]>;
  getConversationMessages(
    userId: string,
    otherUserId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Message[]>;
  markMessagesAsRead(userId: string, senderId: string): Promise<void>;

  // Message attachment operations
  createMessageAttachment(
    attachment: InsertMessageAttachment
  ): Promise<MessageAttachment>;
  getMessageAttachments(messageId: string): Promise<MessageAttachment[]>;

  // User blocking operations
  blockUser(blockerId: string, blockedId: string, reason?: string): Promise<BlockedUser>;
  unblockUser(blockerId: string, blockedId: string): Promise<void>;
  isUserBlocked(userId1: string, userId2: string): Promise<boolean>;
  getBlockedUsers(userId: string): Promise<BlockedUser[]>;

  // Message reporting operations
  reportMessage(report: InsertMessageReport): Promise<MessageReport>;
  getMessageReports(messageId: string): Promise<MessageReport[]>;
  getUserReports(userId: string): Promise<MessageReport[]>;

  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string): Promise<Notification[]>;
  markNotificationAsRead(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // ========== User Operations ==========
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // ========== Trip Operations ==========
  async createTrip(tripData: InsertTrip): Promise<Trip> {
    const [trip] = await db.insert(trips).values(tripData).returning();
    return trip;
  }

  async getTrip(id: string): Promise<Trip | undefined> {
    const [trip] = await db.select().from(trips).where(eq(trips.id, id));
    return trip;
  }

  async getUserTrips(userId: string): Promise<Trip[]> {
    return await db
      .select()
      .from(trips)
      .where(eq(trips.travelerId, userId))
      .orderBy(desc(trips.createdAt));
  }

  async searchTrips(filters: {
    departure?: string;
    destination?: string;
    maxPrice?: number;
    minWeight?: number;
  }): Promise<Trip[]> {
    const conditions = [eq(trips.status, "active")];

    if (filters.departure) {
      conditions.push(
        sql`LOWER(${trips.departureCity}) LIKE ${`%${filters.departure.toLowerCase()}%`}`
      );
    }
    if (filters.destination) {
      conditions.push(
        sql`LOWER(${trips.destinationCity}) LIKE ${`%${filters.destination.toLowerCase()}%`}`
      );
    }
    if (filters.maxPrice) {
      conditions.push(lte(trips.pricePerKg, filters.maxPrice.toString()));
    }
    if (filters.minWeight) {
      conditions.push(gte(trips.availableWeight, filters.minWeight.toString()));
    }

    return await db
      .select()
      .from(trips)
      .where(and(...conditions))
      .orderBy(desc(trips.departureDate));
  }

  async getRecentTrips(limit: number = 10): Promise<Trip[]> {
    return await db
      .select()
      .from(trips)
      .where(eq(trips.status, "active"))
      .orderBy(desc(trips.createdAt))
      .limit(limit);
  }

  async updateTripStatus(
    id: string,
    status: string
  ): Promise<Trip | undefined> {
    const [trip] = await db
      .update(trips)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(trips.id, id))
      .returning();
    return trip;
  }

  // ========== Booking Operations ==========
  async createBooking(bookingData: InsertBooking): Promise<Booking> {
    const initialHistory: Array<{
      timestamp: string;
      actor: string;
      action: string;
      changes: Record<string, any>;
    }> = [];

    if (bookingData.pickupLocation || bookingData.pickupDateTime) {
      initialHistory.push({
        timestamp: new Date().toISOString(),
        actor: bookingData.senderId,
        action: "created",
        changes: {
          pickupLocation: bookingData.pickupLocation,
          pickupDateTime: bookingData.pickupDateTime?.toISOString(),
          deliveryLocation: bookingData.deliveryLocation,
          deliveryDateTime: bookingData.deliveryDateTime?.toISOString(),
        },
      });
    }

    const [booking] = await db
      .insert(bookings)
      .values({
        ...bookingData,
        pickupPIN: Math.floor(100000 + Math.random() * 900000).toString(),
        deliveryPIN: Math.floor(100000 + Math.random() * 900000).toString(),
        appointmentHistory: initialHistory as any,
        // status defaults to "pending" per schema
      })
      .returning();
    return booking;
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id));
    return booking;
  }

  async getUserBookings(userId: string): Promise<Booking[]> {
    return await db
      .select()
      .from(bookings)
      .where(eq(bookings.senderId, userId))
      .orderBy(desc(bookings.createdAt));
  }

  async getTripBookings(tripId: string): Promise<Booking[]> {
    return await db
      .select()
      .from(bookings)
      .where(eq(bookings.tripId, tripId))
      .orderBy(desc(bookings.createdAt));
  }

  async updateBookingStatus(
    id: string,
    status: string
  ): Promise<Booking | undefined> {
    const [booking] = await db
      .update(bookings)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    return booking;
  }

  async updateBookingEscrowStatus(
    id: string,
    escrowStatus: string
  ): Promise<Booking | undefined> {
    const [booking] = await db
      .update(bookings)
      .set({ escrowStatus: escrowStatus as any, updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    return booking;
  }

  async confirmPickupAppointment(
    bookingId: string,
    userId: string
  ): Promise<Booking | undefined> {
    const existing = await this.getBooking(bookingId);
    if (!existing) return undefined;

    const history = (existing.appointmentHistory as any[]) || [];
    history.push({
      timestamp: new Date().toISOString(),
      actor: userId,
      action: "confirm_pickup",
      changes: { pickupConfirmedAt: new Date().toISOString() },
    });

    const [booking] = await db
      .update(bookings)
      .set({
        pickupConfirmedAt: new Date(),
        appointmentHistory: history as any,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId))
      .returning();
    return booking;
  }

  async confirmDeliveryAppointment(
    bookingId: string,
    userId: string
  ): Promise<Booking | undefined> {
    const existing = await this.getBooking(bookingId);
    if (!existing) return undefined;

    const history = (existing.appointmentHistory as any[]) || [];
    history.push({
      timestamp: new Date().toISOString(),
      actor: userId,
      action: "confirm_delivery",
      changes: { deliveryConfirmedAt: new Date().toISOString() },
    });

    const [booking] = await db
      .update(bookings)
      .set({
        deliveryConfirmedAt: new Date(),
        appointmentHistory: history as any,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId))
      .returning();
    return booking;
  }

  async updateBookingAppointment(
    bookingId: string,
    updates: {
      pickupLocation?: string;
      pickupDateTime?: Date;
      deliveryLocation?: string | null;
      deliveryDateTime?: Date | null;
    },
    userId: string
  ): Promise<Booking | undefined> {
    const existing = await this.getBooking(bookingId);
    if (!existing) return undefined;

    const history = (existing.appointmentHistory as any[]) || [];
    history.push({
      timestamp: new Date().toISOString(),
      actor: userId,
      action: "update_appointment",
      changes: {
        pickupLocation: updates.pickupLocation,
        pickupDateTime: updates.pickupDateTime?.toISOString(),
        deliveryLocation: updates.deliveryLocation,
        deliveryDateTime: updates.deliveryDateTime?.toISOString(),
      },
    });

    const updateData: any = {
      appointmentHistory: history,
      updatedAt: new Date(),
    };

    if (updates.pickupLocation !== undefined) {
      updateData.pickupLocation = updates.pickupLocation;
    }
    if (updates.pickupDateTime !== undefined) {
      updateData.pickupDateTime = updates.pickupDateTime;
    }
    if (updates.deliveryLocation !== undefined) {
      updateData.deliveryLocation = updates.deliveryLocation;
    }
    if (updates.deliveryDateTime !== undefined) {
      updateData.deliveryDateTime = updates.deliveryDateTime;
    }

    const [booking] = await db
      .update(bookings)
      .set(updateData)
      .where(eq(bookings.id, bookingId))
      .returning();
    return booking;
  }

  // ========== Message Operations ==========
  async createMessage(messageData: InsertMessage): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values(messageData)
      .returning();
    return message;
  }

  async getBookingMessages(bookingId: string): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.bookingId, bookingId))
      .orderBy(messages.createdAt);
  }

  async getUserConversations(userId: string): Promise<any[]> {
    // Get unique users this user has messaged with
    const sentMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.senderId, userId))
      .orderBy(desc(messages.createdAt));

    const receivedMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.receiverId, userId))
      .orderBy(desc(messages.createdAt));

    const allMessages = [...sentMessages, ...receivedMessages];
    const userIds = new Set<string>();
    const conversations = new Map();

    for (const msg of allMessages) {
      const otherId =
        msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!userIds.has(otherId)) {
        userIds.add(otherId);
        conversations.set(otherId, {
          userId: otherId,
          lastMessage: msg.content,
          unreadCount: 0,
          bookingId: msg.bookingId,
        });
      }
    }

    // Count unread messages
    for (const [userId, conv] of Array.from(conversations.entries())) {
      const unreadCount = receivedMessages.filter(
        (m) => m.senderId === userId && !m.isRead
      ).length;
      conv.unreadCount = unreadCount;
    }

    return Array.from(conversations.values());
  }

  async getConversationMessages(
    userId: string,
    otherUserId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Message[]> {
    const { limit = 50, offset = 0 } = options || {};
    
    return await db
      .select()
      .from(messages)
      .where(
        or(
          and(
            eq(messages.senderId, userId),
            eq(messages.receiverId, otherUserId)
          ),
          and(
            eq(messages.senderId, otherUserId),
            eq(messages.receiverId, userId)
          )
        )
      )
      .orderBy(messages.createdAt)
      .limit(limit)
      .offset(offset);
  }

  async markMessagesAsRead(userId: string, senderId: string): Promise<void> {
    await db
      .update(messages)
      .set({ isRead: true })
      .where(
        and(
          eq(messages.receiverId, userId),
          eq(messages.senderId, senderId)
        )
      );
  }

  // ========== Message Attachment Operations ==========
  async createMessageAttachment(
    attachmentData: InsertMessageAttachment
  ): Promise<MessageAttachment> {
    const [attachment] = await db
      .insert(messageAttachments)
      .values(attachmentData)
      .returning();
    return attachment;
  }

  async getMessageAttachments(messageId: string): Promise<MessageAttachment[]> {
    return await db
      .select()
      .from(messageAttachments)
      .where(eq(messageAttachments.messageId, messageId));
  }

  // ========== User Blocking Operations ==========
  async blockUser(
    blockerId: string,
    blockedId: string,
    reason?: string
  ): Promise<BlockedUser> {
    const [blocked] = await db
      .insert(blockedUsers)
      .values({
        blockerId,
        blockedId,
        reason: reason || null,
      })
      .returning();
    return blocked;
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await db
      .delete(blockedUsers)
      .where(
        and(
          eq(blockedUsers.blockerId, blockerId),
          eq(blockedUsers.blockedId, blockedId)
        )
      );
  }

  async isUserBlocked(userId1: string, userId2: string): Promise<boolean> {
    const blocks = await db
      .select()
      .from(blockedUsers)
      .where(
        or(
          and(
            eq(blockedUsers.blockerId, userId1),
            eq(blockedUsers.blockedId, userId2)
          ),
          and(
            eq(blockedUsers.blockerId, userId2),
            eq(blockedUsers.blockedId, userId1)
          )
        )
      );
    return blocks.length > 0;
  }

  async getBlockedUsers(userId: string): Promise<BlockedUser[]> {
    return await db
      .select()
      .from(blockedUsers)
      .where(eq(blockedUsers.blockerId, userId))
      .orderBy(desc(blockedUsers.createdAt));
  }

  // ========== Message Reporting Operations ==========
  async reportMessage(reportData: InsertMessageReport): Promise<MessageReport> {
    const [report] = await db
      .insert(messageReports)
      .values(reportData)
      .returning();
    return report;
  }

  async getMessageReports(messageId: string): Promise<MessageReport[]> {
    return await db
      .select()
      .from(messageReports)
      .where(eq(messageReports.messageId, messageId))
      .orderBy(desc(messageReports.createdAt));
  }

  async getUserReports(userId: string): Promise<MessageReport[]> {
    return await db
      .select()
      .from(messageReports)
      .where(eq(messageReports.reporterId, userId))
      .orderBy(desc(messageReports.createdAt));
  }

  // ========== Notification Operations ==========
  async createNotification(
    notificationData: InsertNotification
  ): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(notificationData)
      .returning();
    return notification;
  }

  async getUserNotifications(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }
}

export const storage = new DatabaseStorage();
