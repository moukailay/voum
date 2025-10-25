import { createEvents, EventAttributes } from "ics";

export interface CalendarEventData {
  title: string;
  description: string;
  location: string;
  startDateTime: Date;
  duration: number; // in minutes
  organizer?: {
    name: string;
    email?: string;
  };
  attendees?: Array<{
    name: string;
    email?: string;
  }>;
}

/**
 * Generate .ics calendar file for an appointment
 */
export function generateICSFile(eventData: CalendarEventData): { error?: Error; value?: string } {
  try {
    const start = eventData.startDateTime;
    
    const event: EventAttributes = {
      start: [
        start.getFullYear(),
        start.getMonth() + 1,
        start.getDate(),
        start.getHours(),
        start.getMinutes(),
      ],
      duration: { minutes: eventData.duration },
      title: eventData.title,
      description: eventData.description,
      location: eventData.location,
      status: "CONFIRMED",
      busyStatus: "BUSY",
      organizer: eventData.organizer
        ? { name: eventData.organizer.name, email: eventData.organizer.email }
        : undefined,
      attendees: eventData.attendees?.map((a) => ({
        name: a.name,
        email: a.email,
        rsvp: true,
      })),
      alarms: [
        {
          action: "display",
          description: "Rappel: " + eventData.title,
          trigger: { hours: 24, minutes: 0, before: true },
        },
        {
          action: "display",
          description: "Rappel: " + eventData.title,
          trigger: { hours: 2, minutes: 0, before: true },
        },
      ],
    };

    const { error, value } = createEvents([event]);
    
    if (error) {
      console.error("[Calendar Service] Error creating .ics file:", error);
      return { error };
    }

    return { value };
  } catch (error) {
    console.error("[Calendar Service] Error generating .ics file:", error);
    return { error: error as Error };
  }
}

/**
 * Generate .ics for pickup appointment
 */
export function generatePickupICS(
  pickupLocation: string,
  pickupDateTime: Date,
  senderName: string,
  travelerName: string,
  bookingId: string
): { error?: Error; value?: string } {
  return generateICSFile({
    title: `📦 Remise de colis - ParcelLink`,
    description: `Rendez-vous pour la remise du colis.\n\nExpéditeur: ${senderName}\nVoyageur: ${travelerName}\n\nRéservation: ${bookingId}\n\nN'oubliez pas de confirmer votre présence sur ParcelLink.`,
    location: pickupLocation,
    startDateTime: pickupDateTime,
    duration: 30, // 30 minutes par défaut
    organizer: { name: senderName },
    attendees: [{ name: travelerName }],
  });
}

/**
 * Generate .ics for delivery appointment
 */
export function generateDeliveryICS(
  deliveryLocation: string,
  deliveryDateTime: Date,
  senderName: string,
  travelerName: string,
  bookingId: string
): { error?: Error; value?: string } {
  return generateICSFile({
    title: `📦 Livraison de colis - ParcelLink`,
    description: `Rendez-vous pour la livraison du colis.\n\nExpéditeur: ${senderName}\nVoyageur: ${travelerName}\n\nRéservation: ${bookingId}\n\nN'oubliez pas de confirmer votre présence sur ParcelLink.`,
    location: deliveryLocation,
    startDateTime: deliveryDateTime,
    duration: 30,
    organizer: { name: travelerName },
    attendees: [{ name: senderName }],
  });
}
