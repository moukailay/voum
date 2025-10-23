import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TripCard } from "@/components/TripCard";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { Trip } from "@shared/schema";

export default function MyTrips() {
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips/my-trips"],
  });

  return (
    <div className="pb-20 md:pb-8">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl md:text-4xl font-semibold">My Trips</h1>
          <Link href="/create-trip">
            <Button data-testid="button-create-trip">
              <Plus className="h-4 w-4 mr-2" />
              Post a trip
            </Button>
          </Link>
        </div>

        {tripsLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading your trips...
          </div>
        ) : !trips || trips.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">
              No trips posted yet
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Share your travel plans and start earning by helping people send
              parcels
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
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
