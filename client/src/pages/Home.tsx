import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, PackagePlus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TripCard } from "@/components/TripCard";
import { Link } from "wouter";
import type { Trip, User, Booking } from "@shared/schema";

interface TripWithTraveler extends Trip {
  traveler?: User;
}

interface BookingWithDetails extends Booking {
  trip?: Trip & { traveler?: User };
}

export default function Home() {
  // Fetch recent/active trips
  const { data: recentTrips, isLoading: tripsLoading } = useQuery<TripWithTraveler[]>({
    queryKey: ["/api/trips/recent"],
  });

  // Fetch user's trips as traveler
  const { data: myTrips, isLoading: myTripsLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips/my-trips"],
  });

  // Fetch user's bookings as sender
  const { data: myBookings, isLoading: bookingsLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ["/api/bookings/my-bookings"],
  });

  return (
    <div className="pb-20 md:pb-8">
      {/* Quick Actions */}
      <section className="py-8 md:py-12 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <h1 className="text-3xl md:text-4xl font-semibold mb-8">
            Welcome back!
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link href="/create-trip">
              <Card className="p-6 hover-elevate cursor-pointer transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <PackagePlus className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Post a Trip</h3>
                    <p className="text-sm text-muted-foreground">
                      Share your travel route and earn money
                    </p>
                  </div>
                </div>
              </Card>
            </Link>

            <Link href="/search">
              <Card className="p-6 hover-elevate cursor-pointer transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-chart-2/10 flex items-center justify-center flex-shrink-0">
                    <Send className="h-6 w-6 text-chart-2" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Send a Parcel</h3>
                    <p className="text-sm text-muted-foreground">
                      Find travelers going your way
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          </div>
        </div>
      </section>

      {/* My Activity */}
      <section className="py-8 md:py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <Tabs defaultValue="my-trips">
            <TabsList className="mb-6">
              <TabsTrigger value="my-trips" data-testid="tab-my-trips">
                My Trips
              </TabsTrigger>
              <TabsTrigger value="my-bookings" data-testid="tab-my-bookings">
                My Parcels
              </TabsTrigger>
            </TabsList>

            <TabsContent value="my-trips" className="space-y-4">
              {myTripsLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  Loading...
                </div>
              ) : !myTrips || myTrips.length === 0 ? (
                <Card className="p-12 text-center">
                  <PackagePlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No trips yet
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Share your travel plans and start earning
                  </p>
                  <Link href="/create-trip">
                    <Button data-testid="button-create-first-trip">
                      <Plus className="h-4 w-4 mr-2" />
                      Post your first trip
                    </Button>
                  </Link>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myTrips.map((trip) => (
                    <TripCard key={trip.id} trip={trip} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="my-bookings" className="space-y-4">
              {bookingsLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  Loading...
                </div>
              ) : !myBookings || myBookings.length === 0 ? (
                <Card className="p-12 text-center">
                  <Send className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No parcels sent yet
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Search for trips and send your first parcel
                  </p>
                  <Link href="/search">
                    <Button data-testid="button-search-first-trip">
                      <Plus className="h-4 w-4 mr-2" />
                      Search trips
                    </Button>
                  </Link>
                </Card>
              ) : (
                <div className="space-y-4">
                  {myBookings.map((booking) => (
                    <Card
                      key={booking.id}
                      className="p-4 md:p-6"
                      data-testid={`card-booking-${booking.id}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-medium">
                          {booking.trip?.departureCity} →{" "}
                          {booking.trip?.destinationCity}
                        </div>
                        <div className="text-sm font-semibold text-primary">
                          {Number(booking.price).toFixed(2)}€
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {booking.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          {Number(booking.weight).toFixed(1)}kg
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                              booking.status === "delivered"
                                ? "bg-chart-3/10 text-chart-3"
                                : booking.status === "in_transit"
                                ? "bg-chart-4/10 text-chart-4"
                                : "bg-chart-5/10 text-chart-5"
                            }`}
                          >
                            {booking.status.replace("_", " ")}
                          </span>
                          <Link href={`/bookings/${booking.id}`}>
                            <Button size="sm" variant="outline">
                              View
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Recent Trips */}
      <section className="py-8 md:py-12 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl md:text-3xl font-semibold">
              Available Trips
            </h2>
            <Link href="/search">
              <Button variant="outline" data-testid="button-view-all-trips">
                View all
              </Button>
            </Link>
          </div>

          {tripsLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading...
            </div>
          ) : !recentTrips || recentTrips.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">No trips available</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentTrips.slice(0, 6).map((trip) => (
                <TripCard key={trip.id} trip={trip} traveler={trip.traveler} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
