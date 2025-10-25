import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Package,
  MapPin,
  Weight,
  Calendar,
  DollarSign,
  Shield,
  CheckCircle2,
  Clock,
  Truck,
  Copy,
  Check,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { Booking } from "@shared/schema";

interface BookingWithTrip extends Booking {
  trip?: {
    id: string;
    departureCity: string;
    destinationCity: string;
    departureDate: string;
    travelerId: string;
  };
}

const statusConfig = {
  pending: {
    label: "En attente",
    color: "bg-gray-500 text-white",
    icon: Clock,
  },
  confirmed: {
    label: "Confirmé",
    color: "bg-blue-500 text-white",
    icon: CheckCircle2,
  },
  picked_up: {
    label: "En transit",
    color: "bg-orange-500 text-white",
    icon: Truck,
  },
  in_transit: {
    label: "En transit",
    color: "bg-orange-500 text-white",
    icon: Truck,
  },
  arrived: {
    label: "Arrivé",
    color: "bg-purple-500 text-white",
    icon: MapPin,
  },
  delivered: {
    label: "Livré",
    color: "bg-chart-3 text-white",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "Annulé",
    color: "bg-destructive text-white",
    icon: Clock,
  },
};

function PinDisplay({ label, pin }: { label: string; pin: string | null }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    if (!pin) return;
    await navigator.clipboard.writeText(pin);
    setCopied(true);
    toast({
      title: "Code copié",
      description: `Le code ${label} a été copié dans le presse-papiers`,
    });
    setTimeout(() => setCopied(false), 2000);
  };

  if (!pin) return null;

  return (
    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
      <div className="flex-1">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="text-2xl font-bold tracking-widest font-mono text-primary">
          {pin}
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={handleCopy}
        data-testid={`button-copy-${label.toLowerCase().replace(" ", "-")}`}
        className="flex-shrink-0"
      >
        {copied ? (
          <Check className="h-4 w-4 text-chart-3" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

export default function MyBookings() {
  const { user } = useAuth();

  const { data: bookings, isLoading } = useQuery<BookingWithTrip[]>({
    queryKey: ["/api/bookings/my-bookings"],
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-lg text-muted-foreground">Chargement...</div>
        </div>
      </div>
    );
  }

  if (!bookings || bookings.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <h1 className="text-3xl md:text-4xl font-semibold mb-2">
          Mes Réservations
        </h1>
        <p className="text-muted-foreground mb-8">
          Suivez l'état de vos colis
        </p>

        <Card className="p-12 text-center">
          <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Aucune réservation</h2>
          <p className="text-muted-foreground mb-6">
            Vous n'avez pas encore réservé de trajet pour envoyer un colis.
          </p>
          <Button data-testid="button-search-trips">
            Rechercher des trajets
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="pb-20 md:pb-8">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <h1 className="text-3xl md:text-4xl font-semibold mb-2">
          Mes Réservations
        </h1>
        <p className="text-muted-foreground mb-8">
          Suivez l'état de vos colis et vos codes de confirmation
        </p>

        <div className="space-y-4 md:space-y-6">
          {bookings.map((booking) => {
            const statusInfo = statusConfig[booking.status as keyof typeof statusConfig];
            const StatusIcon = statusInfo?.icon || Package;

            return (
              <Card
                key={booking.id}
                className="p-4 md:p-6"
                data-testid={`card-booking-${booking.id}`}
              >
                <div className="space-y-4">
                  {/* Header with Status Badge */}
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg mb-1 leading-snug">
                        {booking.trip?.departureCity || "Ville de départ"} →{" "}
                        {booking.trip?.destinationCity || "Ville d'arrivée"}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {booking.description || "Colis à livrer"}
                      </p>
                    </div>
                    <Badge
                      className={`${statusInfo?.color || "bg-gray-500 text-white"} flex items-center gap-1.5 flex-shrink-0`}
                      data-testid={`badge-status-${booking.status}`}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {statusInfo?.label || booking.status}
                    </Badge>
                  </div>

                  {/* Booking Details Grid */}
                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Weight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground truncate">
                        {Number(booking.weight).toFixed(1)}kg
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium text-primary">
                        {Number(booking.price).toFixed(2)}€
                      </span>
                    </div>
                    {booking.trip?.departureDate && (
                      <div className="flex items-center gap-2 text-sm col-span-2">
                        <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground truncate">
                          {new Date(
                            booking.trip.departureDate
                          ).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* PIN Codes Section */}
                  {(booking.pickupPIN || booking.deliveryPIN) && (
                    <div className="pt-4 border-t space-y-3">
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">
                          Codes de confirmation
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {booking.pickupPIN && booking.status === "pending" && (
                          <PinDisplay
                            label="Code remise"
                            pin={booking.pickupPIN}
                          />
                        )}
                        {booking.deliveryPIN &&
                          ["picked_up", "in_transit", "arrived"].includes(
                            booking.status
                          ) && (
                            <PinDisplay
                              label="Code livraison"
                              pin={booking.deliveryPIN}
                            />
                          )}
                      </div>

                      {booking.status === "delivered" && (
                        <div className="flex items-center gap-2 p-3 bg-chart-3/10 border border-chart-3/20 rounded-lg">
                          <CheckCircle2 className="h-5 w-5 text-chart-3 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-chart-3">
                              Livraison confirmée
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Votre colis a été remis au destinataire
                            </div>
                          </div>
                        </div>
                      )}

                      {booking.status === "pending" && (
                        <p className="text-xs text-muted-foreground">
                          💡 Communiquez le code de remise au voyageur lors de
                          la récupération de votre colis
                        </p>
                      )}
                      {["picked_up", "in_transit", "arrived"].includes(
                        booking.status
                      ) && (
                        <p className="text-xs text-muted-foreground">
                          💡 Le voyageur aura besoin du code de livraison pour
                          confirmer la remise
                        </p>
                      )}
                    </div>
                  )}

                  {/* Escrow Status */}
                  {booking.escrowStatus === "held" &&
                    booking.status !== "delivered" && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                        <Shield className="h-3 w-3" />
                        Paiement sécurisé - Sera libéré à la livraison
                      </div>
                    )}
                  {booking.escrowStatus === "released" && (
                    <div className="flex items-center gap-2 text-xs text-chart-3 pt-2">
                      <CheckCircle2 className="h-3 w-3" />
                      Paiement libéré au voyageur
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
