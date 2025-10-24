import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import {
  insertTripSchema,
  insertBookingSchema,
  insertMessageSchema,
  insertMessageAttachmentSchema,
} from "@shared/schema";
import { z } from "zod";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage";
import { ObjectAccessGroupType, ObjectPermission } from "./objectAcl";
import { validateUploadedFile, validateFileMetadata } from "./fileValidator";
import { filterContent, shouldBlockContent } from "./contentFilter";

// Create API schemas that accept date strings
const createTripSchema = insertTripSchema
  .omit({
    departureDate: true,
    arrivalDate: true,
  })
  .extend({
    departureDate: z.string().transform((val) => new Date(val)),
    arrivalDate: z.string().transform((val) => new Date(val)),
  });

// WebSocket client tracking
interface WSClient {
  ws: WebSocket;
  userId: string;
  onlineStatus: "online" | "offline";
  lastSeen: Date;
  typingTo?: string; // userId of the person they're typing to
  typingTimeout?: NodeJS.Timeout;
}

const clients = new Map<string, WSClient>();

// Helper function to broadcast user status to relevant clients
function broadcastUserStatus(userId: string, status: "online" | "offline") {
  const statusMessage = {
    type: "user_status",
    userId,
    status,
    timestamp: new Date().toISOString(),
  };

  // Broadcast to all connected clients
  for (const [, client] of Array.from(clients.entries())) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(statusMessage));
    }
  }
}

// Helper function to broadcast typing indicator
function broadcastTypingIndicator(senderId: string, receiverId: string, isTyping: boolean) {
  const receiverClient = clients.get(receiverId);
  if (receiverClient && receiverClient.ws.readyState === WebSocket.OPEN) {
    receiverClient.ws.send(
      JSON.stringify({
        type: "typing_indicator",
        userId: senderId,
        isTyping,
        timestamp: new Date().toISOString(),
      })
    );
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  await setupAuth(app);

  // ==================== Auth Routes ====================
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ==================== Trip Routes ====================
  app.post("/api/trips", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = createTripSchema.parse({
        ...req.body,
        travelerId: userId,
      });

      const trip = await storage.createTrip(validatedData);
      res.json(trip);
    } catch (error: any) {
      console.error("Error creating trip:", error);
      res.status(400).json({
        message: error.message || "Failed to create trip",
      });
    }
  });

  app.get("/api/trips/my-trips", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const trips = await storage.getUserTrips(userId);
      res.json(trips);
    } catch (error) {
      console.error("Error fetching user trips:", error);
      res.status(500).json({ message: "Failed to fetch trips" });
    }
  });

  app.get("/api/trips/recent", async (req, res) => {
    try {
      const trips = await storage.getRecentTrips(10);
      
      // Fetch travelers for each trip
      const tripsWithTravelers = await Promise.all(
        trips.map(async (trip) => {
          const traveler = await storage.getUser(trip.travelerId);
          return { ...trip, traveler };
        })
      );

      res.json(tripsWithTravelers);
    } catch (error) {
      console.error("Error fetching recent trips:", error);
      res.status(500).json({ message: "Failed to fetch trips" });
    }
  });

  app.get("/api/trips/search", async (req, res) => {
    try {
      const filters = {
        departure: req.query.departure as string,
        destination: req.query.destination as string,
        maxPrice: req.query.maxPrice
          ? parseFloat(req.query.maxPrice as string)
          : undefined,
        minWeight: req.query.minWeight
          ? parseFloat(req.query.minWeight as string)
          : undefined,
      };

      const trips = await storage.searchTrips(filters);

      // Fetch travelers for each trip
      const tripsWithTravelers = await Promise.all(
        trips.map(async (trip) => {
          const traveler = await storage.getUser(trip.travelerId);
          return { ...trip, traveler };
        })
      );

      res.json(tripsWithTravelers);
    } catch (error) {
      console.error("Error searching trips:", error);
      res.status(500).json({ message: "Failed to search trips" });
    }
  });

  app.get("/api/trips/:id", async (req, res) => {
    try {
      const trip = await storage.getTrip(req.params.id);
      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }

      const traveler = await storage.getUser(trip.travelerId);
      res.json({ ...trip, traveler });
    } catch (error) {
      console.error("Error fetching trip:", error);
      res.status(500).json({ message: "Failed to fetch trip" });
    }
  });

  // ==================== Booking Routes ====================
  app.post("/api/bookings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertBookingSchema.parse({
        ...req.body,
        senderId: userId,
      });

      const booking = await storage.createBooking(validatedData);

      // Create notification for traveler
      const trip = await storage.getTrip(booking.tripId);
      if (trip) {
        await storage.createNotification({
          userId: trip.travelerId,
          type: "booking",
          title: "New Booking!",
          message: `You have a new booking for ${trip.departureCity} → ${trip.destinationCity}`,
          relatedId: booking.id,
        });
      }

      res.json(booking);
    } catch (error: any) {
      console.error("Error creating booking:", error);
      res.status(400).json({
        message: error.message || "Failed to create booking",
      });
    }
  });

  app.get("/api/bookings/my-bookings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bookings = await storage.getUserBookings(userId);

      // Fetch trip and traveler details for each booking
      const bookingsWithDetails = await Promise.all(
        bookings.map(async (booking) => {
          const trip = await storage.getTrip(booking.tripId);
          if (trip) {
            const traveler = await storage.getUser(trip.travelerId);
            return { ...booking, trip: { ...trip, traveler } };
          }
          return booking;
        })
      );

      res.json(bookingsWithDetails);
    } catch (error) {
      console.error("Error fetching user bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.get("/api/bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const booking = await storage.getBooking(req.params.id);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const trip = await storage.getTrip(booking.tripId);
      const sender = await storage.getUser(booking.senderId);
      let traveler;
      if (trip) {
        traveler = await storage.getUser(trip.travelerId);
      }

      res.json({
        ...booking,
        trip: trip ? { ...trip, traveler } : undefined,
        sender,
      });
    } catch (error) {
      console.error("Error fetching booking:", error);
      res.status(500).json({ message: "Failed to fetch booking" });
    }
  });

  app.post(
    "/api/bookings/:id/verify-pin",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { pin, action } = req.body;
        const booking = await storage.getBooking(req.params.id);

        if (!booking) {
          return res.status(404).json({ message: "Booking not found" });
        }

        // Verify PIN
        const isValid =
          (action === "pickup" && booking.pickupPIN === pin) ||
          (action === "delivery" && booking.deliveryPIN === pin);

        if (!isValid) {
          return res.status(400).json({ message: "Invalid PIN" });
        }

        // Update booking status
        let newStatus = booking.status;
        if (action === "pickup") {
          newStatus = "picked_up";
        } else if (action === "delivery") {
          newStatus = "delivered";
          // Release escrow
          await storage.updateBookingEscrowStatus(booking.id, "released");
        }

        const updatedBooking = await storage.updateBookingStatus(
          booking.id,
          newStatus
        );

        // Create notification for sender
        await storage.createNotification({
          userId: booking.senderId,
          type: "status_update",
          title: "Booking Updated",
          message: `Your parcel status has been updated to: ${newStatus.replace("_", " ")}`,
          relatedId: booking.id,
        });

        res.json(updatedBooking);
      } catch (error) {
        console.error("Error verifying PIN:", error);
        res.status(500).json({ message: "Failed to verify PIN" });
      }
    }
  );

  // ==================== Message Routes ====================
  app.get("/api/messages/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversations = await storage.getUserConversations(userId);

      // Fetch user details for each conversation
      const conversationsWithUsers = await Promise.all(
        conversations.map(async (conv) => {
          const user = await storage.getUser(conv.userId);
          return { ...conv, user };
        })
      );

      res.json(conversationsWithUsers);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.get("/api/messages/:otherUserId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check if users have blocked each other
      const isBlocked = await storage.isUserBlocked(userId, req.params.otherUserId);
      if (isBlocked) {
        return res.status(403).json({ message: "Cannot access messages with blocked user" });
      }
      
      // Parse pagination parameters
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const messages = await storage.getConversationMessages(
        userId,
        req.params.otherUserId,
        { limit, offset }
      );

      // Mark messages as read
      await storage.markMessagesAsRead(userId, req.params.otherUserId);

      // Fetch sender, receiver details, and attachments for each message
      const messagesWithUsers = await Promise.all(
        messages.map(async (msg) => {
          const sender = await storage.getUser(msg.senderId);
          const receiver = await storage.getUser(msg.receiverId);
          const attachments = await storage.getMessageAttachments(msg.id);
          return { ...msg, sender, receiver, attachments };
        })
      );

      res.json(messagesWithUsers);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // ==================== File Upload Routes ====================
  // Get presigned upload URL for file attachments
  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  // Create message attachment record and set ACL policy
  app.post("/api/message-attachments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { fileUrl, fileName, fileType, fileSize, thumbnailUrl, messageId, bookingId } = req.body;

      if (!fileUrl || !fileName || !fileType || !fileSize) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Step 1: Basic metadata validation (fast checks)
      const metadataValidation = validateFileMetadata({
        fileName,
        fileType,
        fileSize,
      });

      if (!metadataValidation.valid) {
        return res.status(400).json({ message: metadataValidation.error });
      }

      const normalizedMimeType = fileType.toLowerCase();

      // Step 2: Validate insertMessageAttachmentSchema
      try {
        insertMessageAttachmentSchema.parse({
          messageId: messageId || null,
          fileUrl,
          fileName,
          fileType: normalizedMimeType,
          fileSize,
          thumbnailUrl: thumbnailUrl || null,
          expiresAt: null,
        });
      } catch (validationError) {
        return res.status(400).json({ 
          message: "Validation failed",
          errors: validationError 
        });
      }

      // Step 3: Comprehensive file validation including malware/signature checks
      // This includes magic byte validation to detect file type mismatches
      const fileValidation = await validateUploadedFile({
        fileUrl,
        fileName,
        fileType,
        fileSize,
      });

      if (!fileValidation.valid) {
        return res.status(400).json({ message: fileValidation.error });
      }

      // Set ACL policy for the uploaded file
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        fileUrl,
        {
          owner: userId,
          visibility: "private",
          aclRules: bookingId ? [
            {
              group: {
                type: ObjectAccessGroupType.CONVERSATION_PARTICIPANT,
                id: bookingId,
              },
              permission: ObjectPermission.READ,
            },
          ] : [],
        }
      );

      // Create attachment record with normalized MIME type
      const attachment = await storage.createMessageAttachment({
        messageId: messageId || null,
        fileUrl: objectPath,
        fileName,
        fileType: normalizedMimeType,
        fileSize,
        thumbnailUrl: thumbnailUrl || null,
        expiresAt: null, // No expiration for now
      });

      res.json({ attachment, objectPath });
    } catch (error) {
      console.error("Error creating message attachment:", error);
      res.status(500).json({ message: "Failed to create message attachment" });
    }
  });

  // Serve uploaded files with ACL check
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(
        req.path,
      );
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // ==================== Notification Routes ====================
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const notifications = await storage.getUserNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      await storage.markNotificationAsRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // ==================== User Blocking Routes ====================
  app.post("/api/users/block", isAuthenticated, async (req: any, res) => {
    try {
      const blockerId = req.user.claims.sub;
      const { blockedId, reason } = req.body;

      if (!blockedId) {
        return res.status(400).json({ message: "Missing blockedId" });
      }

      if (blockerId === blockedId) {
        return res.status(400).json({ message: "Cannot block yourself" });
      }

      const blocked = await storage.blockUser(blockerId, blockedId, reason);
      
      // Create notification for system log (optional)
      await storage.createNotification({
        userId: blockerId,
        type: "system",
        title: "User Blocked",
        message: `You have blocked a user`,
        relatedId: blocked.id,
      });

      res.json(blocked);
    } catch (error) {
      console.error("Error blocking user:", error);
      res.status(500).json({ message: "Failed to block user" });
    }
  });

  app.delete("/api/users/block/:blockedId", isAuthenticated, async (req: any, res) => {
    try {
      const blockerId = req.user.claims.sub;
      const { blockedId } = req.params;

      await storage.unblockUser(blockerId, blockedId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unblocking user:", error);
      res.status(500).json({ message: "Failed to unblock user" });
    }
  });

  app.get("/api/users/blocked", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const blockedUsers = await storage.getBlockedUsers(userId);
      
      // Fetch user details for each blocked user
      const blockedWithUsers = await Promise.all(
        blockedUsers.map(async (block) => {
          const user = await storage.getUser(block.blockedId);
          return { ...block, user };
        })
      );

      res.json(blockedWithUsers);
    } catch (error) {
      console.error("Error fetching blocked users:", error);
      res.status(500).json({ message: "Failed to fetch blocked users" });
    }
  });

  // ==================== Message Reporting Routes ====================
  app.post("/api/messages/:messageId/report", isAuthenticated, async (req: any, res) => {
    try {
      const reporterId = req.user.claims.sub;
      const { messageId } = req.params;
      const { category, details } = req.body;

      if (!category) {
        return res.status(400).json({ message: "Missing category" });
      }

      // Validate category
      const validCategories = ["spam", "fraud", "abuse", "inappropriate", "other"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ message: "Invalid category" });
      }

      const report = await storage.reportMessage({
        messageId,
        reporterId,
        category: category as any,
        description: details || null,
      });

      // Create notification for admins (in a real app, this would notify moderators)
      await storage.createNotification({
        userId: reporterId,
        type: "system",
        title: "Message Reported",
        message: `Your report has been submitted for review`,
        relatedId: report.id,
      });

      res.json(report);
    } catch (error) {
      console.error("Error reporting message:", error);
      res.status(500).json({ message: "Failed to report message" });
    }
  });

  app.get("/api/messages/:messageId/reports", isAuthenticated, async (req: any, res) => {
    try {
      const { messageId } = req.params;
      const reports = await storage.getMessageReports(messageId);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching message reports:", error);
      res.status(500).json({ message: "Failed to fetch message reports" });
    }
  });

  app.get("/api/users/reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reports = await storage.getUserReports(userId);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching user reports:", error);
      res.status(500).json({ message: "Failed to fetch user reports" });
    }
  });

  // ==================== WebSocket Server ====================
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    console.log("WebSocket client connected");

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle authentication
        if (message.type === "auth") {
          clients.set(message.userId, { 
            ws, 
            userId: message.userId,
            onlineStatus: "online",
            lastSeen: new Date(),
          });
          console.log(`User ${message.userId} authenticated via WebSocket`);
          
          // Broadcast user online status
          broadcastUserStatus(message.userId, "online");
          
          // Send current online users to the newly connected user
          const onlineUsers = Array.from(clients.entries())
            .filter(([_, client]) => client.onlineStatus === "online")
            .map(([userId, _]) => userId);
          
          ws.send(JSON.stringify({
            type: "online_users",
            users: onlineUsers,
          }));
          
          return;
        }

        // Get authenticated user
        const senderId = Array.from(clients.entries()).find(
          ([_, client]) => client.ws === ws
        )?.[0];

        if (!senderId) {
          ws.send(JSON.stringify({ type: "error", message: "Not authenticated" }));
          return;
        }

        // Handle typing indicator
        if (message.type === "typing") {
          const client = clients.get(senderId);
          if (client) {
            // Clear existing typing timeout
            if (client.typingTimeout) {
              clearTimeout(client.typingTimeout);
            }

            // Update typing state
            client.typingTo = message.receiverId;
            
            // Broadcast typing indicator
            broadcastTypingIndicator(senderId, message.receiverId, true);

            // Auto-stop typing after 3 seconds of inactivity
            client.typingTimeout = setTimeout(() => {
              if (client.typingTo === message.receiverId) {
                client.typingTo = undefined;
                broadcastTypingIndicator(senderId, message.receiverId, false);
              }
            }, 3000);
          }
          return;
        }

        // Handle stop typing
        if (message.type === "stop_typing") {
          const client = clients.get(senderId);
          if (client) {
            if (client.typingTimeout) {
              clearTimeout(client.typingTimeout);
            }
            client.typingTo = undefined;
            broadcastTypingIndicator(senderId, message.receiverId, false);
          }
          return;
        }

        // Handle read receipt
        if (message.type === "read_receipt") {
          // Update message as read in database
          // Note: This would need a storage method to update read status
          const receiverClient = clients.get(message.originalSenderId);
          if (receiverClient && receiverClient.ws.readyState === WebSocket.OPEN) {
            receiverClient.ws.send(
              JSON.stringify({
                type: "message_read",
                messageId: message.messageId,
                readBy: senderId,
                readAt: new Date().toISOString(),
              })
            );
          }
          return;
        }

        // Handle file upload progress
        if (message.type === "upload_progress") {
          const receiverClient = clients.get(message.receiverId);
          if (receiverClient && receiverClient.ws.readyState === WebSocket.OPEN) {
            receiverClient.ws.send(
              JSON.stringify({
                type: "upload_progress",
                uploadId: message.uploadId,
                progress: message.progress,
                fileName: message.fileName,
              })
            );
          }
          return;
        }

        // Handle sending messages
        if (message.type === "send_message") {
          // Check if users have blocked each other
          const isBlocked = await storage.isUserBlocked(senderId, message.receiverId);
          if (isBlocked) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Cannot send message to blocked user",
                clientMessageId: message.clientMessageId,
              })
            );
            return;
          }

          // Content filtering
          const filterResult = filterContent(message.content);
          if (shouldBlockContent(message.content)) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Message blocked due to inappropriate content",
                clientMessageId: message.clientMessageId,
              })
            );
            return;
          }

          // Log content filter warning if flagged (but not blocked)
          if (!filterResult.isClean) {
            console.warn(
              `Message from ${senderId} flagged with severity ${filterResult.severity}:`,
              filterResult.flaggedWords
            );
          }

          // Stop typing indicator if active
          const client = clients.get(senderId);
          if (client && client.typingTo === message.receiverId) {
            if (client.typingTimeout) {
              clearTimeout(client.typingTimeout);
            }
            client.typingTo = undefined;
            broadcastTypingIndicator(senderId, message.receiverId, false);
          }

          // Create message in database
          const newMessage = await storage.createMessage({
            senderId,
            receiverId: message.receiverId,
            content: message.content,
            bookingId: message.bookingId || null,
          });

          // Create message attachments if any
          let messageAttachments: any[] = [];
          if (message.attachments && Array.isArray(message.attachments) && message.attachments.length > 0) {
            for (const attachment of message.attachments) {
              const createdAttachment = await storage.createMessageAttachment({
                messageId: newMessage.id,
                url: attachment.url,
                fileName: attachment.name || attachment.fileName,
                fileType: attachment.type || attachment.fileType,
                fileSize: attachment.size || attachment.fileSize,
                thumbnailUrl: attachment.thumbnailUrl || null,
              });
              messageAttachments.push(createdAttachment);
            }
          }

          // Include attachments in message response
          const messageWithAttachments = {
            ...newMessage,
            attachments: messageAttachments,
          };

          // Send delivery confirmation to sender (echo back clientMessageId)
          ws.send(
            JSON.stringify({
              type: "message_sent",
              message: messageWithAttachments,
              status: "sent",
              clientMessageId: message.clientMessageId,
            })
          );

          // Send to receiver if online (with delivered status)
          const receiverClient = clients.get(message.receiverId);
          if (receiverClient && receiverClient.ws.readyState === WebSocket.OPEN) {
            receiverClient.ws.send(
              JSON.stringify({
                type: "message",
                message: messageWithAttachments,
              })
            );

            // Send delivery confirmation back to sender
            ws.send(
              JSON.stringify({
                type: "message_delivered",
                messageId: newMessage.id,
                deliveredAt: new Date().toISOString(),
              })
            );
          }

          // Create notification
          await storage.createNotification({
            userId: message.receiverId,
            type: "message",
            title: "New Message",
            message: `You have a new message`,
            relatedId: newMessage.id,
          });
        }
      } catch (error) {
        console.error("WebSocket error:", error);
        ws.send(
          JSON.stringify({ type: "error", message: "Failed to process message" })
        );
      }
    });

    ws.on("close", () => {
      // Remove client from map and broadcast offline status
      for (const [userId, client] of Array.from(clients.entries())) {
        if (client.ws === ws) {
          // Clear any typing timeouts
          if (client.typingTimeout) {
            clearTimeout(client.typingTimeout);
          }
          
          // Update status to offline
          client.onlineStatus = "offline";
          client.lastSeen = new Date();
          
          // Broadcast offline status
          broadcastUserStatus(userId, "offline");
          
          // Remove client from map
          clients.delete(userId);
          console.log(`User ${userId} disconnected`);
          break;
        }
      }
    });
  });

  return httpServer;
}
