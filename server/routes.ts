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
}

const clients = new Map<string, WSClient>();

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
      const messages = await storage.getConversationMessages(
        userId,
        req.params.otherUserId
      );

      // Mark messages as read
      await storage.markMessagesAsRead(userId, req.params.otherUserId);

      // Fetch sender and receiver details
      const messagesWithUsers = await Promise.all(
        messages.map(async (msg) => {
          const sender = await storage.getUser(msg.senderId);
          const receiver = await storage.getUser(msg.receiverId);
          return { ...msg, sender, receiver };
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
          clients.set(message.userId, { ws, userId: message.userId });
          console.log(`User ${message.userId} authenticated via WebSocket`);
          return;
        }

        // Handle sending messages
        if (message.type === "send_message") {
          const senderId = Array.from(clients.entries()).find(
            ([_, client]) => client.ws === ws
          )?.[0];

          if (!senderId) {
            ws.send(JSON.stringify({ type: "error", message: "Not authenticated" }));
            return;
          }

          // Create message in database
          const newMessage = await storage.createMessage({
            senderId,
            receiverId: message.receiverId,
            content: message.content,
            bookingId: message.bookingId || null,
          });

          // Send to receiver if online
          const receiverClient = clients.get(message.receiverId);
          if (receiverClient && receiverClient.ws.readyState === WebSocket.OPEN) {
            receiverClient.ws.send(
              JSON.stringify({
                type: "message",
                message: newMessage,
              })
            );
          }

          // Send confirmation to sender
          ws.send(
            JSON.stringify({
              type: "message",
              message: newMessage,
            })
          );

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
      // Remove client from map
      for (const [userId, client] of Array.from(clients.entries())) {
        if (client.ws === ws) {
          clients.delete(userId);
          console.log(`User ${userId} disconnected`);
          break;
        }
      }
    });
  });

  return httpServer;
}
