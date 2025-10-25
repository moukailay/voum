import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
  integer,
  decimal,
  index,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// Session storage table (Required for Replit Auth)
// ============================================================================
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// ============================================================================
// Users table (Extended from Replit Auth)
// ============================================================================
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  phoneNumber: varchar("phone_number"),
  isVerified: boolean("is_verified").default(false),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
  totalTripsAsTravel: integer("total_trips_as_traveler").default(0),
  totalTripsAsSender: integer("total_trips_as_sender").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// ============================================================================
// Trips table
// ============================================================================
export const trips = pgTable("trips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  travelerId: varchar("traveler_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  departureCity: varchar("departure_city").notNull(),
  destinationCity: varchar("destination_city").notNull(),
  departureDate: timestamp("departure_date").notNull(),
  arrivalDate: timestamp("arrival_date").notNull(),
  maxWeight: decimal("max_weight", { precision: 6, scale: 2 }).notNull(),
  availableWeight: decimal("available_weight", { precision: 6, scale: 2 }).notNull(),
  pricePerKg: decimal("price_per_kg", { precision: 8, scale: 2 }).notNull(),
  maxDimensions: varchar("max_dimensions"), // e.g., "50x40x30 cm"
  acceptedItems: text("accepted_items"), // Optional description
  restrictedItems: text("restricted_items"), // Optional description
  status: varchar("status", { enum: ["active", "completed", "cancelled"] })
    .notNull()
    .default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTripSchema = createInsertSchema(trips).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
});

export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof trips.$inferSelect;

// ============================================================================
// Bookings table
// ============================================================================
export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tripId: varchar("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weight: decimal("weight", { precision: 6, scale: 2 }).notNull(),
  description: text("description"),
  senderName: varchar("sender_name"),
  senderPhone: varchar("sender_phone"),
  pickupAddress: text("pickup_address"),
  deliveryAddress: text("delivery_address"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", {
    enum: ["pending", "confirmed", "picked_up", "in_transit", "arrived", "delivered", "cancelled"],
  })
    .notNull()
    .default("pending"),
  pickupPIN: varchar("pickup_pin", { length: 6 }),
  deliveryPIN: varchar("delivery_pin", { length: 6 }),
  escrowStatus: varchar("escrow_status", {
    enum: ["held", "released", "refunded"],
  })
    .notNull()
    .default("held"),
  pickupLocation: text("pickup_location"),
  pickupDateTime: timestamp("pickup_datetime"),
  deliveryLocation: text("delivery_location"),
  deliveryDateTime: timestamp("delivery_datetime"),
  pickupConfirmedAt: timestamp("pickup_confirmed_at"),
  deliveryConfirmedAt: timestamp("delivery_confirmed_at"),
  appointmentHistory: jsonb("appointment_history").$type<Array<{
    timestamp: string;
    actor: string;
    action: string;
    changes: Record<string, any>;
  }>>().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  pickupPIN: true,
  deliveryPIN: true,
  escrowStatus: true,
  status: true,
  pickupConfirmedAt: true,
  deliveryConfirmedAt: true,
  appointmentHistory: true,
});

export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;

// ============================================================================
// Messages table (Enhanced with read receipts and status)
// ============================================================================
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id, {
    onDelete: "cascade",
  }),
  senderId: varchar("sender_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  receiverId: varchar("receiver_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  status: varchar("status", {
    enum: ["sending", "sent", "delivered", "seen", "failed"],
  })
    .notNull()
    .default("sending"),
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // For message expiration
},
(table) => [
  index("IDX_message_expires").on(table.expiresAt),
  index("IDX_message_sender").on(table.senderId),
  index("IDX_message_receiver").on(table.receiverId),
]);

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  isRead: true,
  status: true,
  readAt: true,
  deliveredAt: true,
  expiresAt: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// ============================================================================
// Message Attachments table
// ============================================================================
export const messageAttachments = pgTable("message_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  fileUrl: varchar("file_url").notNull(),
  fileName: varchar("file_name").notNull(),
  fileType: varchar("file_type").notNull(), // image/jpeg, application/pdf, etc.
  fileSize: integer("file_size").notNull(), // in bytes
  thumbnailUrl: varchar("thumbnail_url"), // For images
  expiresAt: timestamp("expires_at"), // URL expiration
  createdAt: timestamp("created_at").defaultNow(),
},
(table) => [index("IDX_attachment_expires").on(table.expiresAt)]);

export const insertMessageAttachmentSchema = createInsertSchema(messageAttachments).omit({
  id: true,
  createdAt: true,
});

export type InsertMessageAttachment = z.infer<typeof insertMessageAttachmentSchema>;
export type MessageAttachment = typeof messageAttachments.$inferSelect;

// ============================================================================
// Blocked Users table
// ============================================================================
export const blockedUsers = pgTable("blocked_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blockerId: varchar("blocker_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  blockedId: varchar("blocked_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBlockedUserSchema = createInsertSchema(blockedUsers).omit({
  id: true,
  createdAt: true,
});

export type InsertBlockedUser = z.infer<typeof insertBlockedUserSchema>;
export type BlockedUser = typeof blockedUsers.$inferSelect;

// ============================================================================
// Message Reports table
// ============================================================================
export const messageReports = pgTable("message_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  reporterId: varchar("reporter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  category: varchar("category", {
    enum: ["spam", "fraud", "abuse", "inappropriate", "other"],
  }).notNull(),
  description: text("description"),
  status: varchar("status", {
    enum: ["pending", "reviewed", "resolved", "dismissed"],
  })
    .notNull()
    .default("pending"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageReportSchema = createInsertSchema(messageReports).omit({
  id: true,
  createdAt: true,
  status: true,
  reviewedBy: true,
  reviewedAt: true,
});

export type InsertMessageReport = z.infer<typeof insertMessageReportSchema>;
export type MessageReport = typeof messageReports.$inferSelect;

// ============================================================================
// User Status table (for online/offline and typing indicators)
// ============================================================================
export const userStatus = pgTable("user_status", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  isOnline: boolean("is_online").default(false),
  lastSeen: timestamp("last_seen").defaultNow(),
  typingTo: varchar("typing_to").references(() => users.id, {
    onDelete: "set null",
  }),
  typingAt: timestamp("typing_at"), // When they started typing
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UserStatus = typeof userStatus.$inferSelect;

// ============================================================================
// User Preferences table
// ============================================================================
export const userPreferences = pgTable("user_preferences", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  quietHoursStart: integer("quiet_hours_start"), // Hour 0-23
  quietHoursEnd: integer("quiet_hours_end"), // Hour 0-23
  emailNotifications: boolean("email_notifications").default(true),
  smsNotifications: boolean("sms_notifications").default(false),
  pushNotifications: boolean("push_notifications").default(true),
  messageRetentionDays: integer("message_retention_days").default(90),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UserPreferences = typeof userPreferences.$inferSelect;

// ============================================================================
// Message Events table (comprehensive logging)
// ============================================================================
export const messageEvents = pgTable("message_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id")
    .notNull()
    .references(() => messages.id, {
      onDelete: "cascade",
    }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", {
    enum: [
      "created",
      "sent",
      "delivered",
      "read",
      "edited",
      "deleted",
      "reported",
      "blocked",
      "archived",
    ],
  }).notNull(),
  metadata: jsonb("metadata"), // Additional event data
  createdAt: timestamp("created_at").defaultNow(),
},
(table) => [
  index("IDX_event_message").on(table.messageId),
  index("IDX_event_created").on(table.createdAt),
]);

export const insertMessageEventSchema = createInsertSchema(messageEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertMessageEvent = z.infer<typeof insertMessageEventSchema>;
export type MessageEvent = typeof messageEvents.$inferSelect;

// ============================================================================
// Notifications table
// ============================================================================
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", {
    enum: ["booking", "message", "status_update", "payment", "system"],
  }).notNull(),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  relatedId: varchar("related_id"), // tripId or bookingId
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  isRead: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// ============================================================================
// Relations
// ============================================================================
export const usersRelations = relations(users, ({ one, many }) => ({
  tripsAsTraveler: many(trips),
  bookingsAsSender: many(bookings),
  sentMessages: many(messages, { relationName: "sentMessages" }),
  receivedMessages: many(messages, { relationName: "receivedMessages" }),
  notifications: many(notifications),
  blockedByMe: many(blockedUsers, { relationName: "blockedByMe" }),
  blockingMe: many(blockedUsers, { relationName: "blockingMe" }),
  messageReports: many(messageReports),
  messageEvents: many(messageEvents),
  status: one(userStatus),
  preferences: one(userPreferences),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  traveler: one(users, {
    fields: [trips.travelerId],
    references: [users.id],
  }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  trip: one(trips, {
    fields: [bookings.tripId],
    references: [trips.id],
  }),
  sender: one(users, {
    fields: [bookings.senderId],
    references: [users.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  booking: one(bookings, {
    fields: [messages.bookingId],
    references: [bookings.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
    relationName: "sentMessages",
  }),
  receiver: one(users, {
    fields: [messages.receiverId],
    references: [users.id],
    relationName: "receivedMessages",
  }),
  attachments: many(messageAttachments),
  reports: many(messageReports),
  events: many(messageEvents),
}));

export const messageAttachmentsRelations = relations(messageAttachments, ({ one }) => ({
  message: one(messages, {
    fields: [messageAttachments.messageId],
    references: [messages.id],
  }),
}));

export const blockedUsersRelations = relations(blockedUsers, ({ one }) => ({
  blocker: one(users, {
    fields: [blockedUsers.blockerId],
    references: [users.id],
    relationName: "blockedByMe",
  }),
  blocked: one(users, {
    fields: [blockedUsers.blockedId],
    references: [users.id],
    relationName: "blockingMe",
  }),
}));

export const messageReportsRelations = relations(messageReports, ({ one }) => ({
  message: one(messages, {
    fields: [messageReports.messageId],
    references: [messages.id],
  }),
  reporter: one(users, {
    fields: [messageReports.reporterId],
    references: [users.id],
  }),
  reviewer: one(users, {
    fields: [messageReports.reviewedBy],
    references: [users.id],
  }),
}));

export const userStatusRelations = relations(userStatus, ({ one }) => ({
  user: one(users, {
    fields: [userStatus.userId],
    references: [users.id],
  }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

export const messageEventsRelations = relations(messageEvents, ({ one }) => ({
  message: one(messages, {
    fields: [messageEvents.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageEvents.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
