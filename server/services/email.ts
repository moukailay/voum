import { Resend } from "resend";

const resend = new Resend(process.env.parcelink);

export interface ReminderEmailData {
  to: string;
  userName: string;
  type: "pickup_24h" | "pickup_2h" | "delivery_24h" | "delivery_2h";
  appointmentDetails: {
    location: string;
    dateTime: Date;
    bookingId: string;
    otherPartyName: string;
  };
}

export async function sendReminderEmail(data: ReminderEmailData): Promise<boolean> {
  try {
    const { to, userName, type, appointmentDetails } = data;
    
    const timeLabels = {
      pickup_24h: "24 heures",
      pickup_2h: "2 heures",
      delivery_24h: "24 heures",
      delivery_2h: "2 heures",
    };
    
    const actionLabels = {
      pickup_24h: "remise du colis",
      pickup_2h: "remise du colis",
      delivery_24h: "livraison du colis",
      delivery_2h: "livraison du colis",
    };

    const subject = type.includes("pickup")
      ? `⏰ Rappel : Remise de colis dans ${timeLabels[type]}`
      : `⏰ Rappel : Livraison de colis dans ${timeLabels[type]}`;

    const formattedDate = appointmentDetails.dateTime.toLocaleDateString("fr-FR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    
    const formattedTime = appointmentDetails.dateTime.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
              color: white;
              padding: 30px 20px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .content {
              background: white;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .appointment-card {
              background: #f9fafb;
              border-left: 4px solid #3b82f6;
              padding: 20px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .detail-row {
              margin: 12px 0;
              display: flex;
              align-items: start;
            }
            .detail-label {
              font-weight: 600;
              color: #6b7280;
              min-width: 120px;
            }
            .detail-value {
              color: #111827;
            }
            .cta-button {
              display: inline-block;
              background: #3b82f6;
              color: white;
              padding: 14px 28px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              color: #6b7280;
              font-size: 14px;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
            }
            @media (max-width: 600px) {
              body {
                padding: 10px;
              }
              .header, .content {
                padding: 20px 15px;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0; font-size: 24px;">📦 ParcelLink</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Rappel de rendez-vous</p>
          </div>
          
          <div class="content">
            <h2 style="color: #111827; margin-top: 0;">Bonjour ${userName},</h2>
            
            <p style="font-size: 16px; color: #374151;">
              Votre ${actionLabels[type]} est prévu dans <strong>${timeLabels[type]}</strong>.
            </p>
            
            <div class="appointment-card">
              <h3 style="margin-top: 0; color: #111827;">📍 Détails du rendez-vous</h3>
              
              <div class="detail-row">
                <span class="detail-label">📅 Date :</span>
                <span class="detail-value">${formattedDate}</span>
              </div>
              
              <div class="detail-row">
                <span class="detail-label">🕐 Heure :</span>
                <span class="detail-value">${formattedTime}</span>
              </div>
              
              <div class="detail-row">
                <span class="detail-label">📍 Lieu :</span>
                <span class="detail-value">${appointmentDetails.location}</span>
              </div>
              
              <div class="detail-row">
                <span class="detail-label">👤 Avec :</span>
                <span class="detail-value">${appointmentDetails.otherPartyName}</span>
              </div>
            </div>
            
            <p style="font-size: 15px; color: #6b7280; margin: 20px 0;">
              💡 N'oubliez pas de confirmer votre présence sur ParcelLink.
            </p>
            
            <center>
              <a href="${process.env.REPL_HOME || 'https://parcellink.replit.app'}/bookings/${appointmentDetails.bookingId}" 
                 class="cta-button">
                Voir la réservation
              </a>
            </center>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} ParcelLink - Livraison collaborative entre particuliers</p>
            <p style="font-size: 12px; margin-top: 10px;">
              Cet email a été envoyé automatiquement. Pour toute question, 
              contactez-nous via la messagerie de l'application.
            </p>
          </div>
        </body>
      </html>
    `;

    const { error } = await resend.emails.send({
      from: "ParcelLink <notifications@parcellink.app>",
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[Email Service] Failed to send reminder:", error);
      return false;
    }

    console.log(`[Email Service] Reminder sent successfully to ${to}`);
    return true;
  } catch (error) {
    console.error("[Email Service] Error sending reminder:", error);
    return false;
  }
}
