import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { User as UserIcon, Star, Package, Send, LogOut, CheckCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";

export default function Profile() {
  const { user, isLoading, isAuthenticated } = useAuth();
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

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen pb-20 md:pb-8">
        <div className="text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="pb-20 md:pb-8">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <h1 className="text-3xl md:text-4xl font-semibold mb-8">Profile</h1>

        {/* User Info Card */}
        <Card className="p-6 md:p-8 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={user.profileImageUrl || undefined} />
              <AvatarFallback className="text-2xl">
                {user.firstName?.[0] || user.email?.[0] || "U"}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-semibold">
                  {user.firstName && user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : "User"}
                </h2>
                {user.isVerified && (
                  <Badge variant="outline" className="text-chart-3 border-chart-3">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                )}
              </div>

              <p className="text-muted-foreground mb-4">{user.email}</p>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  <span className="font-semibold">
                    {Number(user.rating || 0).toFixed(1)}
                  </span>
                  <span className="text-sm text-muted-foreground">rating</span>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => (window.location.href = "/api/logout")}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Log out
            </Button>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="text-2xl font-bold mb-1">
              {user.totalTripsAsTravel || 0}
            </div>
            <div className="text-sm text-muted-foreground">
              Trips as traveler
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-chart-2/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-chart-2" />
              </div>
            </div>
            <div className="text-2xl font-bold mb-1">
              {user.totalTripsAsSender || 0}
            </div>
            <div className="text-sm text-muted-foreground">
              Parcels sent
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-chart-3/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-chart-3" />
              </div>
            </div>
            <div className="text-2xl font-bold mb-1">
              {(user.totalTripsAsTravel || 0) + (user.totalTripsAsSender || 0)}
            </div>
            <div className="text-sm text-muted-foreground">
              Total transactions
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-amber-400/10 flex items-center justify-center">
                <Star className="h-5 w-5 text-amber-400" />
              </div>
            </div>
            <div className="text-2xl font-bold mb-1">
              {Number(user.rating || 0).toFixed(1)}
            </div>
            <div className="text-sm text-muted-foreground">
              Average rating
            </div>
          </Card>
        </div>

        {/* Account Details */}
        <Card className="p-6 md:p-8">
          <h3 className="text-xl font-semibold mb-6">Account Details</h3>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  First Name
                </label>
                <div className="text-base">{user.firstName || "Not set"}</div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Last Name
                </label>
                <div className="text-base">{user.lastName || "Not set"}</div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Email
                </label>
                <div className="text-base">{user.email || "Not set"}</div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Phone Number
                </label>
                <div className="text-base">{user.phoneNumber || "Not set"}</div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Verification Status
                </label>
                <div className="text-base">
                  {user.isVerified ? (
                    <Badge variant="outline" className="text-chart-3 border-chart-3">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not verified</Badge>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Member Since
                </label>
                <div className="text-base">
                  {new Date(user.createdAt!).toLocaleDateString("fr-FR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
