import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, getSessionStore } from "./replitAuth";
import {
  insertTripSchema,
  insertBookingSchema,
  insertMessageSchema,
  insertMessageAttachmentSchema,
  trips,
  bookings as bookingsTable,
  reminders as remindersTable,
} from "@shared/schema";
import { z } from "zod";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage";
import { ObjectAccessGroupType, ObjectPermission } from "./objectAcl";
import { validateUploadedFile, validateFileMetadata } from "./fileValidator";
import { filterContent, shouldBlockContent } from "./contentFilter";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { scheduleAppointmentReminders, cancelBookingReminders } from "./services/reminder-scheduler";
import { generateICSFile } from "./services/calendar";

// Create API schemas that accept date strings and coerce numbers
const createTripSchema = insertTripSchema
  .omit({
    departureDate: true,
    arrivalDate: true,
    availableWeight: true, // Will be set equal to maxWeight automatically
    maxWeight: true,
    pricePerKg: true,
  })
  .extend({
    departureDate: z.string().transform((val) => new Date(val)),
    arrivalDate: z.string().transform((val) => new Date(val)),
    maxWeight: z.coerce.number().positive("Maximum weight must be positive"),
    pricePerKg: z.coerce.number().positive("Price per kg must be positive"),
  });

// WebSocket client tracking
interface WSClient {
  ws: WebSocket;
  userId: string;
  onlineStatus: "online" | "offline";
  lastSeen: Date;
  typingTo?: string; // userId of the person they're typing to
  typingTimeout?: NodeJS.Timeout;
  authenticated: boolean;
  messageCount: number;
  lastMessageTime: number;
  connectedAt: Date;
}

const clients = new Map<string, WSClient>();

// Security constants
const MAX_MESSAGE_SIZE = 100 * 1024; // 100 KB
const MAX_MESSAGES_PER_MINUTE = 60;
const MAX_CONNECTIONS_PER_USER = 3;
const AUTH_TIMEOUT = 10000; // 10 seconds to authenticate
const MAX_CONTENT_LENGTH = 2000; // characters
const MAX_ATTACHMENTS = 3;

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

      // Initialize availableWeight to maxWeight when creating a new trip
      const tripData = {
        ...validatedData,
        maxWeight: validatedData.maxWeight.toString(),
        availableWeight: validatedData.maxWeight.toString(),
        pricePerKg: validatedData.pricePerKg.toString(),
      };

      const trip = await storage.createTrip(tripData);
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

      // Add booking count to each trip
      const tripsWithBookingCount = await Promise.all(
        trips.map(async (trip) => {
          const bookings = await storage.getTripBookings(trip.id);
          return { ...trip, bookingCount: bookings.length };
        })
      );

      res.json(tripsWithBookingCount);
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

  app.get("/api/trips/:id/bookings", isAuthenticated, async (req: any, res) => {
    try {
      const tripId = req.params.id;
      const userId = req.user.claims.sub;

      // Get trip to verify ownership
      const trip = await storage.getTrip(tripId);
      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }

      // Only the traveler can view bookings for their trip
      if (trip.travelerId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const bookings = await storage.getTripBookings(tripId);

      // Fetch sender details for each booking
      const bookingsWithDetails = await Promise.all(
        bookings.map(async (booking) => {
          const sender = await storage.getUser(booking.senderId);
          return { ...booking, sender };
        })
      );

      res.json(bookingsWithDetails);
    } catch (error) {
      console.error("Error fetching trip bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
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

      // Get trip to validate weight and get traveler info
      const trip = await storage.getTrip(validatedData.tripId);
      if (!trip) {
        res.status(404).json({ message: "Trip not found" });
        return;
      }

      // Validate appointment dates if provided (allow times on same day as trip)
      if (validatedData.pickupDateTime) {
        const pickupDate = new Date(validatedData.pickupDateTime);
        const departureDate = new Date(trip.departureDate);
        const arrivalDate = new Date(trip.arrivalDate);

        // For pickup: must be on or after departure, but before or at arrival
        if (pickupDate < departureDate || pickupDate > arrivalDate) {
          res.status(400).json({
            message: "La date de remise doit être entre la date de départ et d'arrivée du voyage"
          });
          return;
        }
      }

      if (validatedData.deliveryDateTime) {
        const deliveryDate = new Date(validatedData.deliveryDateTime);
        const departureDate = new Date(trip.departureDate);
        const arrivalDate = new Date(trip.arrivalDate);

        // For delivery: must be after departure, but on or before arrival
        if (deliveryDate < departureDate || deliveryDate > arrivalDate) {
          res.status(400).json({
            message: "La date de livraison doit être entre la date de départ et d'arrivée du voyage"
          });
          return;
        }
      }

      // Validate available weight
      const requestedWeight = Number(validatedData.weight);
      const availableWeight = Number(trip.availableWeight);
      
      if (requestedWeight <= 0) {
        res.status(400).json({ 
          message: "Le poids doit être supérieur à zéro" 
        });
        return;
      }
      
      if (requestedWeight > availableWeight) {
        res.status(400).json({ 
          message: `Le poids demandé (${requestedWeight}kg) dépasse le poids disponible (${availableWeight}kg)` 
        });
        return;
      }

      // SECURITY: Calculate price on server (never trust client-provided price)
      const serverCalculatedPrice = (requestedWeight * Number(trip.pricePerKg)).toFixed(2);

      // Create the booking with server-calculated price
      const booking = await storage.createBooking({
        ...validatedData,
        price: serverCalculatedPrice,
      });

      // Update trip available weight
      const newAvailableWeight = availableWeight - requestedWeight;
      await db
        .update(trips)
        .set({ 
          availableWeight: newAvailableWeight.toString(),
          updatedAt: new Date() 
        })
        .where(eq(trips.id, trip.id));

      // Create system message to start conversation
      const systemMessage = await storage.createMessage({
        bookingId: booking.id,
        senderId: userId,
        receiverId: trip.travelerId,
        content: `Nouvelle réservation confirmée\n\nColis : ${validatedData.description || "Colis à livrer"}\nPoids : ${requestedWeight}kg\nPrix total : ${serverCalculatedPrice}€\n\nExpéditeur : ${validatedData.senderName}\nTéléphone : ${validatedData.senderPhone}\n\nVous pouvez maintenant discuter pour coordonner la livraison.`,
      });

      // Create notification for traveler
      await storage.createNotification({
        userId: trip.travelerId,
        type: "booking",
        title: "Nouvelle réservation !",
        message: `Vous avez une nouvelle réservation pour ${trip.departureCity} → ${trip.destinationCity}`,
        relatedId: booking.id,
      });

      // Schedule appointment reminders (T-24h and T-2h)
      if (booking.pickupDateTime || booking.deliveryDateTime) {
        try {
          await scheduleAppointmentReminders(
            booking.id,
            userId,
            trip.travelerId,
            booking.pickupDateTime,
            booking.deliveryDateTime
          );
          console.log(`[Reminders] Scheduled appointment reminders for booking ${booking.id}`);
        } catch (error) {
          console.error(`[Reminders] Error scheduling reminders for booking ${booking.id}:`, error);
          // Don't fail the booking if reminder scheduling fails
        }
      }

      res.json({ 
        ...booking, 
        conversationUserId: trip.travelerId 
      });
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

        // Check if appointment confirmation is required
        if (action === "pickup") {
          if (booking.pickupDateTime && !booking.pickupConfirmedAt) {
            return res.status(400).json({ 
              message: "Vous devez confirmer votre présence au rendez-vous de remise avant de valider le code PIN" 
            });
          }
        } else if (action === "delivery") {
          if (booking.deliveryDateTime && !booking.deliveryConfirmedAt) {
            return res.status(400).json({ 
              message: "Vous devez confirmer votre présence au rendez-vous de livraison avant de valider le code PIN" 
            });
          }
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

  // Update appointment (location and/or datetime)
  app.patch(
    "/api/bookings/:id/appointment",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const booking = await storage.getBooking(req.params.id);

        if (!booking) {
          return res.status(404).json({ message: "Booking not found" });
        }

        // Only sender can update appointment
        if (booking.senderId !== userId) {
          return res.status(403).json({ message: "Unauthorized" });
        }

        const { pickupLocation, pickupDateTime, deliveryLocation, deliveryDateTime } = req.body;

        // Validate appointment dates against trip dates if provided (allow times on same day as trip)
        if (pickupDateTime || deliveryDateTime) {
          const trip = await storage.getTrip(booking.tripId);
          if (!trip) {
            return res.status(404).json({ message: "Trip not found" });
          }

          if (pickupDateTime) {
            const pickupDate = new Date(pickupDateTime);
            const departureDate = new Date(trip.departureDate);
            const arrivalDate = new Date(trip.arrivalDate);

            // For pickup: must be on or after departure, but before or at arrival
            if (pickupDate < departureDate || pickupDate > arrivalDate) {
              return res.status(400).json({
                message: "La date de remise doit être entre la date de départ et d'arrivée du voyage"
              });
            }
          }

          if (deliveryDateTime) {
            const deliveryDate = new Date(deliveryDateTime);
            const departureDate = new Date(trip.departureDate);
            const arrivalDate = new Date(trip.arrivalDate);

            // For delivery: must be after departure, but on or before arrival
            if (deliveryDate < departureDate || deliveryDate > arrivalDate) {
              return res.status(400).json({
                message: "La date de livraison doit être entre la date de départ et d'arrivée du voyage"
              });
            }
          }
        }

        const updates: any = {};
        if (pickupLocation !== undefined) updates.pickupLocation = pickupLocation;
        if (pickupDateTime !== undefined) updates.pickupDateTime = new Date(pickupDateTime);
        if (deliveryLocation !== undefined) updates.deliveryLocation = deliveryLocation;
        if (deliveryDateTime !== undefined) updates.deliveryDateTime = deliveryDateTime ? new Date(deliveryDateTime) : null;

        const updatedBooking = await storage.updateBookingAppointment(
          booking.id,
          updates,
          userId
        );

        res.json(updatedBooking);
      } catch (error) {
        console.error("Error updating appointment:", error);
        res.status(500).json({ message: "Failed to update appointment" });
      }
    }
  );

  // Confirm pickup appointment presence
  app.post(
    "/api/bookings/:id/confirm-pickup",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const booking = await storage.getBooking(req.params.id);

        if (!booking) {
          return res.status(404).json({ message: "Booking not found" });
        }

        const trip = await storage.getTrip(booking.tripId);
        if (!trip) {
          return res.status(404).json({ message: "Trip not found" });
        }

        // Both sender and traveler can confirm pickup
        if (booking.senderId !== userId && trip.travelerId !== userId) {
          return res.status(403).json({ message: "Unauthorized" });
        }

        const updatedBooking = await storage.confirmPickupAppointment(
          booking.id,
          userId
        );

        res.json(updatedBooking);
      } catch (error) {
        console.error("Error confirming pickup:", error);
        res.status(500).json({ message: "Failed to confirm pickup" });
      }
    }
  );

  // Confirm delivery appointment presence
  app.post(
    "/api/bookings/:id/confirm-delivery",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const booking = await storage.getBooking(req.params.id);

        if (!booking) {
          return res.status(404).json({ message: "Booking not found" });
        }

        const trip = await storage.getTrip(booking.tripId);
        if (!trip) {
          return res.status(404).json({ message: "Trip not found" });
        }

        // Both sender and traveler can confirm delivery
        if (booking.senderId !== userId && trip.travelerId !== userId) {
          return res.status(403).json({ message: "Unauthorized" });
        }

        const updatedBooking = await storage.confirmDeliveryAppointment(
          booking.id,
          userId
        );

        res.json(updatedBooking);
      } catch (error) {
        console.error("Error confirming delivery:", error);
        res.status(500).json({ message: "Failed to confirm delivery" });
      }
    }
  );

  // Get reminders for a booking
  app.get(
    "/api/bookings/:id/reminders",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const booking = await storage.getBooking(req.params.id);

        if (!booking) {
          return res.status(404).json({ message: "Booking not found" });
        }

        const trip = await storage.getTrip(booking.tripId);
        if (!trip) {
          return res.status(404).json({ message: "Trip not found" });
        }

        // Only sender and traveler can view reminders
        if (booking.senderId !== userId && trip.travelerId !== userId) {
          return res.status(403).json({ message: "Unauthorized" });
        }

        const reminders = await db
          .select()
          .from(remindersTable)
          .where(eq(remindersTable.bookingId, req.params.id))
          .orderBy(remindersTable.scheduledFor);

        res.json(reminders);
      } catch (error) {
        console.error("Error fetching reminders:", error);
        res.status(500).json({ message: "Failed to fetch reminders" });
      }
    }
  );

  // Generate .ics file for pickup appointment
  app.get(
    "/api/bookings/:id/calendar/pickup",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const booking = await storage.getBooking(req.params.id);

        if (!booking) {
          return res.status(404).json({ message: "Booking not found" });
        }

        if (!booking.pickupDateTime || !booking.pickupLocation) {
          return res.status(400).json({ message: "No pickup appointment scheduled" });
        }

        const trip = await storage.getTrip(booking.tripId);
        if (!trip) {
          return res.status(404).json({ message: "Trip not found" });
        }

        // Only sender and traveler can download calendar file
        if (booking.senderId !== userId && trip.travelerId !== userId) {
          return res.status(403).json({ message: "Unauthorized" });
        }

        const sender = await storage.getUser(booking.senderId);
        const traveler = await storage.getUser(trip.travelerId);

        const senderName = sender.firstName && sender.lastName 
          ? `${sender.firstName} ${sender.lastName}` 
          : sender.email;
        const travelerName = traveler.firstName && traveler.lastName 
          ? `${traveler.firstName} ${traveler.lastName}` 
          : traveler.email;

        const result = generateICSFile({
          title: `📦 Remise de colis - ${trip.departureCity} → ${trip.destinationCity}`,
          description: `Remise de colis pour ParcelLink\n\nColis : ${booking.description || "Colis à livrer"}\nPoids : ${booking.weight}kg\n\nExpéditeur : ${senderName}\nVoyageur : ${travelerName}\n\nDétails : ${process.env.REPL_HOME || 'https://parcellink.replit.app'}/bookings/${booking.id}`,
          location: booking.pickupLocation,
          startDateTime: new Date(booking.pickupDateTime),
          duration: 30, // 30 minutes par défaut
          organizer: {
            name: senderName,
            email: sender.email,
          },
          attendees: [
            {
              name: travelerName,
              email: traveler.email,
            },
          ],
        });

        if (result.error) {
          return res.status(500).json({ message: "Failed to generate calendar file" });
        }

        res.setHeader("Content-Type", "text/calendar; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="parcellink-pickup-${booking.id}.ics"`
        );
        res.send(result.value);
      } catch (error) {
        console.error("Error generating pickup calendar:", error);
        res.status(500).json({ message: "Failed to generate calendar file" });
      }
    }
  );

  // Generate .ics file for delivery appointment
  app.get(
    "/api/bookings/:id/calendar/delivery",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const booking = await storage.getBooking(req.params.id);

        if (!booking) {
          return res.status(404).json({ message: "Booking not found" });
        }

        if (!booking.deliveryDateTime || !booking.deliveryLocation) {
          return res.status(400).json({ message: "No delivery appointment scheduled" });
        }

        const trip = await storage.getTrip(booking.tripId);
        if (!trip) {
          return res.status(404).json({ message: "Trip not found" });
        }

        // Only sender and traveler can download calendar file
        if (booking.senderId !== userId && trip.travelerId !== userId) {
          return res.status(403).json({ message: "Unauthorized" });
        }

        const sender = await storage.getUser(booking.senderId);
        const traveler = await storage.getUser(trip.travelerId);

        const senderName = sender.firstName && sender.lastName 
          ? `${sender.firstName} ${sender.lastName}` 
          : sender.email;
        const travelerName = traveler.firstName && traveler.lastName 
          ? `${traveler.firstName} ${traveler.lastName}` 
          : traveler.email;

        const result = generateICSFile({
          title: `📦 Livraison de colis - ${trip.departureCity} → ${trip.destinationCity}`,
          description: `Livraison de colis pour ParcelLink\n\nColis : ${booking.description || "Colis à livrer"}\nPoids : ${booking.weight}kg\n\nExpéditeur : ${senderName}\nVoyageur : ${travelerName}\n\nDétails : ${process.env.REPL_HOME || 'https://parcellink.replit.app'}/bookings/${booking.id}`,
          location: booking.deliveryLocation,
          startDateTime: new Date(booking.deliveryDateTime),
          duration: 30, // 30 minutes par défaut
          organizer: {
            name: travelerName,
            email: traveler.email,
          },
          attendees: [
            {
              name: senderName,
              email: sender.email,
            },
          ],
        });

        if (result.error) {
          return res.status(500).json({ message: "Failed to generate calendar file" });
        }

        res.setHeader("Content-Type", "text/calendar; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="parcellink-delivery-${booking.id}.ics"`
        );
        res.send(result.value);
      } catch (error) {
        console.error("Error generating delivery calendar:", error);
        res.status(500).json({ message: "Failed to generate calendar file" });
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

  // Get user by ID
  app.get("/api/users/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
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

  // ==================== Object Storage Routes ====================
  app.post("/api/object-storage/presigned-url", isAuthenticated, async (req: any, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const url = await objectStorageService.getObjectEntityUploadURL();
      res.json({ url });
    } catch (error) {
      console.error("Error generating presigned URL:", error);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  // ==================== WebSocket Server ====================
  const httpServer = createServer(app);
  
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: "/ws",
    verifyClient: (info, callback) => {
      // Extract session cookie from request headers
      const cookies = info.req.headers.cookie || '';
      const sessionCookie = cookies.split(';').find((c: string) => 
        c.trim().startsWith('connect.sid=')
      );
      
      if (!sessionCookie) {
        callback(false, 401, 'Unauthorized: No session cookie');
        return;
      }
      
      callback(true);
    }
  });

  // Helper function to verify WebSocket session
  async function verifyWebSocketSession(req: any): Promise<{ userId: string } | null> {
    return new Promise((resolve) => {
      // Parse session cookie
      const cookies = req.headers.cookie || '';
      const sessionCookie = cookies.split(';').find((c: string) => 
        c.trim().startsWith('connect.sid=')
      );
      
      if (!sessionCookie) {
        resolve(null);
        return;
      }
      
      // Extract session ID (handle signed cookies)
      const sessionIdMatch = sessionCookie.match(/connect\.sid=(?:s%3A)?(.+)/);
      if (!sessionIdMatch) {
        resolve(null);
        return;
      }
      
      let sessionId = sessionIdMatch[1];
      // Decode URL encoding if present
      try {
        sessionId = decodeURIComponent(sessionId);
      } catch (e) {
        // If decoding fails, use original
      }
      
      // Remove 's:' prefix if present (signed cookie format)
      if (sessionId.startsWith('s:')) {
        sessionId = sessionId.substring(2);
      }
      
      // Get session store
      const sessionStore = getSessionStore();
      if (!sessionStore) {
        resolve(null);
        return;
      }
      
      sessionStore.get(sessionId, (err: any, session: any) => {
        if (err || !session || !session.passport || !session.passport.user) {
          resolve(null);
          return;
        }
        
        const user = session.passport.user;
        if (!user || !user.claims || !user.claims.sub) {
          resolve(null);
          return;
        }
        
        // Check if session is expired
        const now = Math.floor(Date.now() / 1000);
        if (user.expires_at && now > user.expires_at) {
          resolve(null);
          return;
        }
        
        resolve({ userId: user.claims.sub });
      });
    });
  }

  // Rate limiting helper
  function checkRateLimit(client: WSClient): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Reset counter if last message was more than a minute ago
    if (client.lastMessageTime < oneMinuteAgo) {
      client.messageCount = 0;
      client.lastMessageTime = now;
      return true;
    }
    
    if (client.messageCount >= MAX_MESSAGES_PER_MINUTE) {
      return false;
    }
    
    client.messageCount++;
    client.lastMessageTime = now;
    return true;
  }

  // Message validation schemas
  const authMessageSchema = z.object({
    type: z.literal("auth"),
    userId: z.string().min(1),
  });

  const typingMessageSchema = z.object({
    type: z.literal("typing"),
    receiverId: z.string().min(1),
  });

  const stopTypingMessageSchema = z.object({
    type: z.literal("stop_typing"),
    receiverId: z.string().min(1),
  });

  const readReceiptMessageSchema = z.object({
    type: z.literal("read_receipt"),
    messageId: z.string().min(1),
    originalSenderId: z.string().min(1),
  });

  const uploadProgressMessageSchema = z.object({
    type: z.literal("upload_progress"),
    receiverId: z.string().min(1),
    uploadId: z.string().min(1),
    progress: z.number().min(0).max(100),
    fileName: z.string().optional(),
  });

  const sendMessageSchema = z.object({
    type: z.literal("send_message"),
    receiverId: z.string().min(1),
    content: z.string().max(MAX_CONTENT_LENGTH),
    bookingId: z.string().optional().nullable(),
    clientMessageId: z.string().optional(),
    attachments: z.array(z.object({
      url: z.string().url(),
      name: z.string().optional(),
      fileName: z.string().optional(),
      type: z.string().optional(),
      fileType: z.string().optional(),
      size: z.number().optional(),
      fileSize: z.number().optional(),
      thumbnailUrl: z.string().url().optional().nullable(),
    })).max(MAX_ATTACHMENTS).optional(),
  });

  wss.on("connection", async (ws: WebSocket, req: any) => {
    console.log("WebSocket client connected");
    
    // Create unauthenticated client entry
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const client: WSClient = {
      ws,
      userId: tempId,
      onlineStatus: "offline",
      lastSeen: new Date(),
      authenticated: false,
      messageCount: 0,
      lastMessageTime: Date.now(),
      connectedAt: new Date(),
    };
    
    // Set authentication timeout
    const authTimeout = setTimeout(() => {
      if (!client.authenticated) {
        ws.close(1008, "Authentication timeout");
        clients.delete(tempId);
      }
    }, AUTH_TIMEOUT);

    ws.on("message", async (data: Buffer) => {
      try {
        // Check message size
        if (data.length > MAX_MESSAGE_SIZE) {
          ws.send(JSON.stringify({ 
            type: "error", 
            message: "Message too large" 
          }));
          ws.close(1009, "Message too large");
          return;
        }

        let message: any;
        try {
          message = JSON.parse(data.toString());
        } catch (parseError) {
          ws.send(JSON.stringify({ 
            type: "error", 
            message: "Invalid JSON format" 
          }));
          return;
        }

        // Handle authentication
        if (message.type === "auth") {
          clearTimeout(authTimeout);
          
          // Validate auth message structure
          const authValidation = authMessageSchema.safeParse(message);
          if (!authValidation.success) {
            ws.send(JSON.stringify({ 
              type: "error", 
              message: "Invalid authentication message format" 
            }));
            ws.close(1008, "Invalid authentication");
            return;
          }

          // Verify session
          const sessionData = await verifyWebSocketSession(req);
          if (!sessionData) {
            ws.send(JSON.stringify({ 
              type: "error", 
              message: "Invalid or expired session" 
            }));
            ws.close(1008, "Unauthorized");
            return;
          }

          // Verify userId matches session
          if (sessionData.userId !== message.userId) {
            ws.send(JSON.stringify({ 
              type: "error", 
              message: "User ID mismatch" 
            }));
            ws.close(1008, "Unauthorized");
            return;
          }

          // Check for existing connections from same user
          const existingConnections = Array.from(clients.values())
            .filter(c => c.userId === message.userId && c.authenticated).length;
          
          if (existingConnections >= MAX_CONNECTIONS_PER_USER) {
            ws.send(JSON.stringify({ 
              type: "error", 
              message: "Maximum connections reached" 
            }));
            ws.close(1008, "Too many connections");
            return;
          }

          // Remove temp entry and add authenticated client
          clients.delete(tempId);
          client.userId = message.userId;
          client.authenticated = true;
          client.onlineStatus = "online";
          clients.set(message.userId, client);
          
          console.log(`User ${message.userId} authenticated via WebSocket`);
          
          // Broadcast user online status
          broadcastUserStatus(message.userId, "online");
          
          // Send current online users to the newly connected user
          const onlineUsers = Array.from(clients.entries())
            .filter(([_, c]) => c.onlineStatus === "online" && c.authenticated)
            .map(([userId, _]) => userId);
          
          ws.send(JSON.stringify({
            type: "online_users",
            users: onlineUsers,
          }));
          
          return;
        }

        // All other messages require authentication
        if (!client.authenticated) {
          ws.send(JSON.stringify({ 
            type: "error", 
            message: "Not authenticated" 
          }));
          return;
        }

        // Rate limiting
        if (!checkRateLimit(client)) {
          ws.send(JSON.stringify({ 
            type: "error", 
            message: "Rate limit exceeded" 
          }));
          return;
        }

        const senderId = client.userId;

        // Handle typing indicator
        if (message.type === "typing") {
          const typingValidation = typingMessageSchema.safeParse(message);
          if (!typingValidation.success) {
            ws.send(JSON.stringify({ 
              type: "error", 
              message: "Invalid typing message format" 
            }));
            return;
          }

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
          const stopTypingValidation = stopTypingMessageSchema.safeParse(message);
          if (!stopTypingValidation.success) {
            ws.send(JSON.stringify({ 
              type: "error", 
              message: "Invalid stop typing message format" 
            }));
            return;
          }

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
          const readReceiptValidation = readReceiptMessageSchema.safeParse(message);
          if (!readReceiptValidation.success) {
            ws.send(JSON.stringify({ 
              type: "error", 
              message: "Invalid read receipt message format" 
            }));
            return;
          }

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
          const uploadProgressValidation = uploadProgressMessageSchema.safeParse(message);
          if (!uploadProgressValidation.success) {
            ws.send(JSON.stringify({ 
              type: "error", 
              message: "Invalid upload progress message format" 
            }));
            return;
          }

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
          // Validate message structure
          const sendMessageValidation = sendMessageSchema.safeParse(message);
          if (!sendMessageValidation.success) {
            ws.send(JSON.stringify({ 
              type: "error", 
              message: "Invalid message format",
              clientMessageId: message.clientMessageId,
            }));
            return;
          }
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
                fileUrl: attachment.url,
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
        // Don't expose internal error details to client
        ws.send(
          JSON.stringify({ type: "error", message: "Failed to process message" })
        );
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket connection error:", error);
    });

    ws.on("close", () => {
      clearTimeout(authTimeout);
      
      // Remove client from map and broadcast offline status
      for (const [userId, c] of Array.from(clients.entries())) {
        if (c.ws === ws) {
          // Clear any typing timeouts
          if (c.typingTimeout) {
            clearTimeout(c.typingTimeout);
          }
          
          // Update status to offline only if authenticated
          if (c.authenticated) {
            c.onlineStatus = "offline";
            c.lastSeen = new Date();
            
            // Broadcast offline status
            broadcastUserStatus(userId, "offline");
            
            console.log(`User ${userId} disconnected`);
          }
          
          // Remove client from map
          clients.delete(userId);
          break;
        }
      }
    });
  });

  return httpServer;
}
