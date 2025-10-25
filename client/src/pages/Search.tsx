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
      <section className="py-6 md:py-12 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <h1 className="text-2xl md:text-4xl font-semibold mb-4 md:mb-8">
            Find a trip
          </h1>

          <Card className="p-4 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label htmlFor="departure-city" className="text-sm font-medium block">
                  From
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <Input
                    id="departure-city"
                    placeholder="e.g., Paris"
                    value={departureCity}
                    onChange={(e) => setDepartureCity(e.target.value)}
                    className="pl-10"
                    data-testid="input-departure-city"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="destination-city" className="text-sm font-medium block">
                  To
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <Input
                    id="destination-city"
                    placeholder="e.g., Lyon"
                    value={destinationCity}
                    onChange={(e) => setDestinationCity(e.target.value)}
                    className="pl-10"
                    data-testid="input-destination-city"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="max-price" className="text-sm font-medium block">
                  Max Price (€/kg)
                </label>
                <Input
                  id="max-price"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  placeholder="Any price"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  data-testid="input-max-price"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="min-weight" className="text-sm font-medium block">
                  Min Weight (kg)
                </label>
                <Input
                  id="min-weight"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  placeholder="Any weight"
                  value={minWeight}
                  onChange={(e) => setMinWeight(e.target.value)}
                  data-testid="input-min-weight"
                />
              </div>
            </div>

            {/* Clear filters button - Full width on mobile for better accessibility */}
            <div className="mt-4">
              <Button
                onClick={() => {
                  setDepartureCity("");
                  setDestinationCity("");
                  setMaxPrice("");
                  setMinWeight("");
                }}
                variant="outline"
                className="w-full md:w-auto md:ml-auto md:flex"
                data-testid="button-clear-filters"
              >
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Clear all filters
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* Results */}
      <section className="py-6 md:py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          {isLoading ? (
            <div className="space-y-4">
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="p-4 md:p-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="h-5 w-24 bg-muted animate-pulse rounded" />
                          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                        </div>
                        <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                      </div>
                      <div className="h-4 w-full bg-muted animate-pulse rounded" />
                      <div className="flex items-center gap-3 pt-2 border-t">
                        <div className="h-10 w-10 bg-muted animate-pulse rounded-full" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                          <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ) : !trips || trips.length === 0 ? (
            <Card className="p-8 md:p-12 text-center">
              <SearchIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                No trips found
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto leading-relaxed">
                Try adjusting your search filters or check back later for new trips
              </p>
              <Button
                onClick={() => {
                  setDepartureCity("");
                  setDestinationCity("");
                  setMaxPrice("");
                  setMinWeight("");
                }}
                variant="outline"
                data-testid="button-clear-filters-empty"
              >
                Clear all filters
              </Button>
            </Card>
          ) : (
            <>
              <div className="mb-4 md:mb-6">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{trips.length}</span> {trips.length === 1 ? "trip" : "trips"} found
                </p>
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
