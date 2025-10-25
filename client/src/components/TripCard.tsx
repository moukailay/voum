import { MapPin, Calendar, Weight, DollarSign, Star, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import type { Trip, User } from "@shared/schema";

interface TripCardProps {
  trip: Trip & { bookingCount?: number };
  traveler?: User;
}

export function TripCard({ trip, traveler }: TripCardProps) {
  const departureDate = new Date(trip.departureDate).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
  const arrivalDate = new Date(trip.arrivalDate).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });

  return (
    <Link href={`/trips/${trip.id}`}>
      <Card
        className="p-4 md:p-6 hover-elevate cursor-pointer transition-all min-h-[200px]"
        data-testid={`card-trip-${trip.id}`}
      >
        <div className="space-y-3 md:space-y-4">
          {/* Route and Price */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="font-semibold text-base md:text-lg truncate">
                  {trip.departureCity}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="h-5 w-5 flex items-center justify-center flex-shrink-0">→</span>
                <span className="text-sm md:text-base truncate">
                  {trip.destinationCity}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
              <div className="text-xl md:text-2xl font-bold text-primary whitespace-nowrap">
                {Number(trip.pricePerKg).toFixed(2)}€
              </div>
              <div className="text-xs text-muted-foreground">per kg</div>
            </div>
          </div>

          {/* Dates and Weight */}
          <div className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground flex-1 min-w-0">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                {departureDate} - {arrivalDate}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Weight className="h-4 w-4 text-muted-foreground" />
              {Number(trip.availableWeight) === 0 ? (
                <span className="font-semibold text-destructive">
                  <span className="hidden sm:inline">Complet</span>
                  <span className="sm:hidden">Plus de place</span>
                </span>
              ) : (
                <span className="font-medium text-muted-foreground">{Number(trip.availableWeight).toFixed(1)}kg</span>
              )}
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {trip.status === "active" && (
              <Badge variant="default" className="bg-chart-3 text-white">
                Available
              </Badge>
            )}
            {trip.bookingCount !== undefined && trip.bookingCount > 0 && (
              <Badge variant="secondary" data-testid={`badge-booking-count-${trip.id}`}>
                <Package className="h-3 w-3 mr-1" />
                {trip.bookingCount} {trip.bookingCount === 1 ? 'réservation' : 'réservations'}
              </Badge>
            )}
          </div>

          {/* Traveler Info */}
          {traveler && (
            <div className="flex items-center gap-3 pt-3 border-t border-card-border">
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarImage src={traveler.profileImageUrl || undefined} />
                <AvatarFallback className="text-sm">
                  {traveler.firstName?.[0] || traveler.email?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {traveler.firstName && traveler.lastName
                    ? `${traveler.firstName} ${traveler.lastName}`
                    : traveler.email}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 flex-shrink-0" />
                  <span>{Number(traveler.rating || 0).toFixed(1)}</span>
                  <span className="mx-0.5">·</span>
                  <span className="truncate">
                    {traveler.totalTripsAsTravel || 0} {(traveler.totalTripsAsTravel || 0) === 1 ? 'trip' : 'trips'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
