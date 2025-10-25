import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import {
  MapPin,
  Calendar,
  Weight,
  Package,
  Star,
  MessageCircle,
  ArrowRight,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import type { Trip, User } from "@shared/schema";

interface TripWithTraveler extends Trip {
  traveler?: User;
}

export default function TripDetails() {
  const [, params] = useRoute("/trips/:id");
  const tripId = params?.id;
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [weight, setWeight] = useState("");
  const [description, setDescription] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [errors, setErrors] = useState<{
    weight?: string;
    senderName?: string;
    senderPhone?: string;
  }>({});

  const { data: trip, isLoading } = useQuery<TripWithTraveler>({
    queryKey: ["/api/trips", tripId],
    enabled: !!tripId,
  });

  // Pre-fill sender info when dialog opens
  useEffect(() => {
    if (showBookingDialog && user) {
      if (!senderName && user.firstName && user.lastName) {
        setSenderName(`${user.firstName} ${user.lastName}`);
      }
      if (!senderPhone && user.phoneNumber) {
        setSenderPhone(user.phoneNumber);
      }
    }
  }, [showBookingDialog, user, senderName, senderPhone]);

  const bookingMutation = useMutation({
    mutationFn: async () => {
      if (!trip) return;
      const price = Number(weight) * Number(trip.pricePerKg);
      return await apiRequest("POST", "/api/bookings", {
        tripId: trip.id,
        weight,
        description: description || "Colis à livrer",
        senderName,
        senderPhone,
        price: price.toFixed(2),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      toast({
        title: "Réservation confirmée !",
        description: "Votre colis a été réservé. Vous pouvez maintenant discuter avec le voyageur.",
      });
      setShowBookingDialog(false);
      // Redirect to messages with the traveler's conversation
      setLocation(`/messages?userId=${data.conversationUserId}`);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Booking failed",
        description: error.message || "Failed to book this trip",
        variant: "destructive",
      });
    },
  });

  const validateForm = () => {
    const newErrors: typeof errors = {};
    
    if (!weight || Number(weight) <= 0) {
      newErrors.weight = "Veuillez saisir un poids valide";
    } else if (Number(weight) > Number(trip?.availableWeight || 0)) {
      newErrors.weight = `Le poids maximum disponible est ${trip?.availableWeight}kg`;
    }
    
    if (!senderName.trim()) {
      newErrors.senderName = "Le nom est requis";
    }
    
    if (!senderPhone.trim()) {
      newErrors.senderPhone = "Le téléphone est requis";
    } else if (!/^[0-9+\s\-()]{8,}$/.test(senderPhone)) {
      newErrors.senderPhone = "Veuillez saisir un numéro de téléphone valide";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBooking = () => {
    if (!validateForm()) {
      return;
    }
    bookingMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen pb-20 md:pb-8">
        <div className="text-muted-foreground">Loading trip details...</div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex items-center justify-center min-h-screen pb-20 md:pb-8">
        <Card className="p-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Trip not found</h3>
          <p className="text-sm text-muted-foreground mb-6">
            This trip doesn't exist or has been removed
          </p>
          <Button onClick={() => setLocation("/search")}>
            Back to search
          </Button>
        </Card>
      </div>
    );
  }

  const departureDate = new Date(trip.departureDate).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const arrivalDate = new Date(trip.arrivalDate).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const isOwnTrip = user?.id === trip.travelerId;
  const totalPrice = weight ? (Number(weight) * Number(trip.pricePerKg)).toFixed(2) : "0.00";

  return (
    <div className="pb-20 md:pb-8">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
        {/* Route Header */}
        <Card className="p-6 md:p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <MapPin className="h-5 w-5 text-primary flex-shrink-0" />
                <h1 className="text-2xl md:text-3xl font-bold">
                  {trip.departureCity}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <ArrowRight className="h-5 w-5 text-muted-foreground ml-5 flex-shrink-0" />
                <h2 className="text-xl md:text-2xl font-semibold text-muted-foreground">
                  {trip.destinationCity}
                </h2>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-primary">
                {Number(trip.pricePerKg).toFixed(2)}€
              </div>
              <div className="text-sm text-muted-foreground">per kg</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Departure</div>
                <div className="text-sm font-medium">{departureDate}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Arrival</div>
                <div className="text-sm font-medium">{arrivalDate}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Weight className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Available</div>
                <div className="text-sm font-medium">
                  {Number(trip.availableWeight).toFixed(1)}kg
                </div>
              </div>
            </div>
          </div>

          {trip.status === "active" && (
            <Badge className="mt-4 bg-chart-3 text-white">
              <CheckCircle className="h-3 w-3 mr-1" />
              Available
            </Badge>
          )}
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Traveler Info */}
          <div className="md:col-span-1">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Traveler</h3>
              {trip.traveler && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={trip.traveler.profileImageUrl || undefined} />
                      <AvatarFallback>
                        {trip.traveler.firstName?.[0] || trip.traveler.email?.[0] || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold">
                        {trip.traveler.firstName && trip.traveler.lastName
                          ? `${trip.traveler.firstName} ${trip.traveler.lastName}`
                          : trip.traveler.email}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span>{Number(trip.traveler.rating || 0).toFixed(1)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Trips as traveler:</span>
                      <span className="ml-2 font-medium">
                        {trip.traveler.totalTripsAsTravel || 0}
                      </span>
                    </div>
                    {trip.traveler.isVerified && (
                      <Badge variant="outline" className="text-chart-3 border-chart-3">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                  </div>

                  {!isOwnTrip && (
                    <Button className="w-full" variant="outline">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Message
                    </Button>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Trip Details */}
          <div className="md:col-span-2 space-y-6">
            {trip.maxDimensions && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-3">
                  Maximum Dimensions
                </h3>
                <p className="text-muted-foreground">{trip.maxDimensions}</p>
              </Card>
            )}

            {trip.acceptedItems && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-3">Accepted Items</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {trip.acceptedItems}
                </p>
              </Card>
            )}

            {trip.restrictedItems && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-3">
                  Restricted Items
                </h3>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {trip.restrictedItems}
                </p>
              </Card>
            )}
          </div>
        </div>

        {/* CTA */}
        {!isOwnTrip && trip.status === "active" && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-card-border md:relative md:border-0 md:mt-8 md:p-0">
            <Button
              size="lg"
              className="w-full"
              onClick={() => setShowBookingDialog(true)}
              data-testid="button-book-trip"
            >
              Book this trip
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        )}

        {/* Booking Dialog */}
        <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Book this trip</DialogTitle>
              <DialogDescription>
                Provide details about your parcel
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="weight">Poids (kg) *</Label>
                <Input
                  id="weight"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  placeholder="Ex: 5"
                  value={weight}
                  onChange={(e) => {
                    const newWeight = e.target.value;
                    setWeight(newWeight);
                    
                    // Real-time validation for weight
                    const weightNum = Number(newWeight);
                    const availableNum = Number(trip.availableWeight);
                    
                    if (!newWeight || weightNum <= 0) {
                      setErrors({ ...errors, weight: undefined });
                    } else if (weightNum > availableNum) {
                      setErrors({ 
                        ...errors, 
                        weight: `Le poids maximum disponible est ${availableNum.toFixed(0)}kg` 
                      });
                    } else {
                      setErrors({ ...errors, weight: undefined });
                    }
                  }}
                  data-testid="input-booking-weight"
                  className={errors.weight ? "border-destructive" : ""}
                />
                {errors.weight ? (
                  <p className="text-xs text-destructive mt-1">{errors.weight}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Maximum : {Number(trip.availableWeight).toFixed(1)}kg
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="senderName">Votre nom *</Label>
                <Input
                  id="senderName"
                  type="text"
                  placeholder="Ex: Jean Dupont"
                  value={senderName}
                  onChange={(e) => {
                    setSenderName(e.target.value);
                    if (errors.senderName) setErrors({ ...errors, senderName: undefined });
                  }}
                  data-testid="input-booking-sender-name"
                  className={errors.senderName ? "border-destructive" : ""}
                />
                {errors.senderName && (
                  <p className="text-xs text-destructive mt-1">{errors.senderName}</p>
                )}
              </div>

              <div>
                <Label htmlFor="senderPhone">Votre téléphone *</Label>
                <Input
                  id="senderPhone"
                  type="tel"
                  inputMode="tel"
                  placeholder="Ex: +33 6 12 34 56 78"
                  value={senderPhone}
                  onChange={(e) => {
                    setSenderPhone(e.target.value);
                    if (errors.senderPhone) setErrors({ ...errors, senderPhone: undefined });
                  }}
                  data-testid="input-booking-sender-phone"
                  className={errors.senderPhone ? "border-destructive" : ""}
                />
                {errors.senderPhone && (
                  <p className="text-xs text-destructive mt-1">{errors.senderPhone}</p>
                )}
              </div>

              <div>
                <Label htmlFor="description">Description du colis (optionnel)</Label>
                <Textarea
                  id="description"
                  rows={3}
                  placeholder="Décrivez ce que vous envoyez..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  data-testid="input-booking-description"
                />
              </div>

              {weight && Number(weight) > 0 && (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Prix total :</span>
                    <span className="text-2xl font-bold text-primary">
                      {totalPrice}€
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {weight}kg × {Number(trip.pricePerKg).toFixed(2)}€/kg
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowBookingDialog(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBooking}
                  disabled={
                    bookingMutation.isPending || 
                    !weight || 
                    !senderName || 
                    !senderPhone || 
                    !!errors.weight || 
                    !!errors.senderName || 
                    !!errors.senderPhone
                  }
                  className="flex-1"
                  data-testid="button-confirm-booking"
                >
                  {bookingMutation.isPending ? (
                    <>
                      <span className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                      Réservation...
                    </>
                  ) : (
                    "Confirmer la réservation"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
