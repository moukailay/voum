import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, MapPin, Calendar, Weight, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TripCard } from "@/components/TripCard";
import type { Trip, User } from "@shared/schema";

interface TripWithTraveler extends Trip {
  traveler?: User;
}

export default function Search() {
  const [departureCity, setDepartureCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minWeight, setMinWeight] = useState("");

  // Build query params
  const params = new URLSearchParams();
  if (departureCity) params.append("departure", departureCity);
  if (destinationCity) params.append("destination", destinationCity);
  if (maxPrice) params.append("maxPrice", maxPrice);
  if (minWeight) params.append("minWeight", minWeight);

  const { data: trips, isLoading } = useQuery<TripWithTraveler[]>({
    queryKey: ["/api/trips/search", params.toString()],
  });

  return (
    <div className="pb-20 md:pb-8">
      {/* Search Header */}
      <section className="py-8 md:py-12 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <h1 className="text-3xl md:text-4xl font-semibold mb-8">
            Find a trip
          </h1>

          <Card className="p-4 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium block">
                  From
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Departure city"
                    value={departureCity}
                    onChange={(e) => setDepartureCity(e.target.value)}
                    className="pl-10"
                    data-testid="input-departure-city"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium block">
                  To
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Destination city"
                    value={destinationCity}
                    onChange={(e) => setDestinationCity(e.target.value)}
                    className="pl-10"
                    data-testid="input-destination-city"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium block">
                  Max Price (€/kg)
                </label>
                <Input
                  type="number"
                  placeholder="Any"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  data-testid="input-max-price"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium block">
                  Min Weight (kg)
                </label>
                <Input
                  type="number"
                  placeholder="Any"
                  value={minWeight}
                  onChange={(e) => setMinWeight(e.target.value)}
                  data-testid="input-min-weight"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => {
                  setDepartureCity("");
                  setDestinationCity("");
                  setMaxPrice("");
                  setMinWeight("");
                }}
                variant="outline"
                size="sm"
                data-testid="button-clear-filters"
              >
                Clear filters
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* Results */}
      <section className="py-8 md:py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading trips...
            </div>
          ) : !trips || trips.length === 0 ? (
            <Card className="p-12 text-center">
              <SearchIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                No trips found
              </h3>
              <p className="text-sm text-muted-foreground">
                Try adjusting your search filters or check back later
              </p>
            </Card>
          ) : (
            <>
              <div className="mb-6 text-sm text-muted-foreground">
                {trips.length} {trips.length === 1 ? "trip" : "trips"} found
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {trips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} traveler={trip.traveler} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
