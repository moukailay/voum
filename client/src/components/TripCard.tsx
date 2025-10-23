import { MapPin, Calendar, Weight, DollarSign, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import type { Trip, User } from "@shared/schema";

interface TripCardProps {
  trip: Trip;
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
        className="p-4 md:p-6 hover-elevate cursor-pointer transition-all"
        data-testid={`card-trip-${trip.id}`}
      >
        <div className="space-y-4">
          {/* Route */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-base font-semibold">
                <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="truncate">{trip.departureCity}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <MapPin className="h-4 w-4 flex-shrink-0 opacity-0" />
                <span className="truncate">{trip.destinationCity}</span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <div className="text-xl font-bold text-primary">
                {Number(trip.pricePerKg).toFixed(2)}€/kg
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Weight className="h-3 w-3" />
                <span>{Number(trip.availableWeight).toFixed(1)}kg</span>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              {departureDate} - {arrivalDate}
            </span>
          </div>

          {/* Status Badge */}
          {trip.status === "active" && (
            <Badge variant="default" className="bg-chart-3 text-white">
              Available
            </Badge>
          )}

          {/* Traveler Info */}
          {traveler && (
            <div className="flex items-center gap-3 pt-2 border-t border-card-border">
              <Avatar className="h-10 w-10">
                <AvatarImage src={traveler.profileImageUrl || undefined} />
                <AvatarFallback>
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
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  <span>{Number(traveler.rating || 0).toFixed(1)}</span>
                  <span className="ml-1">
                    ({traveler.totalTripsAsTravel || 0} trips)
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
