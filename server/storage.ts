import {
  users,
  trips,
  bookings,
  messages,
  messageAttachments,
  notifications,
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

  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getBookingMessages(bookingId: string): Promise<Message[]>;
  getUserConversations(userId: string): Promise<any[]>;
  getConversationMessages(
    userId: string,
    otherUserId: string
  ): Promise<Message[]>;
  markMessagesAsRead(userId: string, senderId: string): Promise<void>;

  // Message attachment operations
  createMessageAttachment(
    attachment: InsertMessageAttachment
  ): Promise<MessageAttachment>;
  getMessageAttachments(messageId: string): Promise<MessageAttachment[]>;

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
    const [booking] = await db
      .insert(bookings)
      .values({
        ...bookingData,
        pickupPIN: Math.floor(100000 + Math.random() * 900000).toString(),
        deliveryPIN: Math.floor(100000 + Math.random() * 900000).toString(),
        status: "confirmed",
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
    otherUserId: string
  ): Promise<Message[]> {
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
      .orderBy(messages.createdAt);
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
