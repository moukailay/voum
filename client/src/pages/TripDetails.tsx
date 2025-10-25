import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  MapPin,
  Calendar,
  Weight,
  Package,
  Star,
  MessageCircle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  Clock,
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { DateTimePicker } from "@/components/DateTimePicker";
import { insertBookingSchema } from "@shared/schema";
import type { Trip, User, Booking } from "@shared/schema";

interface TripWithTraveler extends Trip {
  traveler?: User;
}

interface BookingWithSender extends Booking {
  sender?: User;
}

// Frontend-only booking schema for the form (uses Date objects)
const bookingFormSchema = z.object({
  tripId: z.string(),
  weight: z.string().min(1, "Le poids est requis"),
  description: z.string().optional(),
  senderName: z.string().min(1, "Votre nom est requis"),
  senderPhone: z.string().min(1, "Votre téléphone est requis"),
  price: z.string(),
  pickupLocation: z.string().min(1, "Le lieu de remise est requis"),
  pickupDateTime: z.date({
    required_error: "La date de remise est requise",
  }),
  deliveryLocation: z.string().optional(),
  deliveryDateTime: z.date().optional().nullable(),
}).refine(
  (data) => {
    // If delivery datetime is provided, delivery location must be provided
    if (data.deliveryDateTime && !data.deliveryLocation) {
      return false;
    }
    return true;
  },
  {
    message: "Le lieu de livraison est requis si vous spécifiez une date de livraison",
    path: ["deliveryLocation"],
  }
);

type BookingFormData = z.infer<typeof bookingFormSchema>;

export default function TripDetails() {
  const [, params] = useRoute("/trips/:id");
  const tripId = params?.id;
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [showBookingDialog, setShowBookingDialog] = useState(false);

  const { data: trip, isLoading } = useQuery<TripWithTraveler>({
    queryKey: ["/api/trips", tripId],
    enabled: !!tripId,
  });

  const isOwnTrip = user?.id === trip?.travelerId;

  // Fetch bookings if this is the traveler's own trip
  const { data: tripBookings } = useQuery<BookingWithSender[]>({
    queryKey: ["/api/trips", tripId, "bookings"],
    enabled: !!tripId && isOwnTrip,
  });

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      tripId: tripId || "",
      weight: "",
      description: "",
      senderName: "",
      senderPhone: "",
      price: "0",
      pickupLocation: "",
      pickupDateTime: undefined,
      deliveryLocation: "",
      deliveryDateTime: undefined,
    },
  });

  // Pre-fill sender info when dialog opens
  useEffect(() => {
    if (showBookingDialog && user) {
      if (!form.getValues("senderName") && user.firstName && user.lastName) {
        form.setValue("senderName", `${user.firstName} ${user.lastName}`);
      }
      if (!form.getValues("senderPhone") && user.phoneNumber) {
        form.setValue("senderPhone", user.phoneNumber);
      }
    }
  }, [showBookingDialog, user, form]);

  // Watch weight for price calculation
  const weight = form.watch("weight");
  const totalPrice = weight && trip ? (Number(weight) * Number(trip.pricePerKg)).toFixed(2) : "0.00";

  const bookingMutation = useMutation({
    mutationFn: async (data: BookingFormData) => {
      if (!trip) return;
      
      // Server will calculate price, but we send it for validation
      const price = Number(data.weight) * Number(trip.pricePerKg);
      
      return await apiRequest("POST", "/api/bookings", {
        tripId: data.tripId,
        weight: data.weight,
        description: data.description || "Colis à livrer",
        senderName: data.senderName,
        senderPhone: data.senderPhone,
        price: price.toFixed(2),
        pickupLocation: data.pickupLocation,
        pickupDateTime: data.pickupDateTime?.toISOString(),
        deliveryLocation: data.deliveryLocation || null,
        deliveryDateTime: data.deliveryDateTime?.toISOString() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      toast({
        title: "Réservation confirmée !",
        description: "Consultez vos codes PIN dans 'Mes Réservations'",
      });
      setShowBookingDialog(false);
      form.reset();
      // Redirect to my bookings to see PINs
      setLocation("/my-bookings");
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

  const onSubmit = (data: BookingFormData) => {
    console.log("onSubmit called with data:", data);
    console.log("Form errors:", form.formState.errors);
    
    // Additional validation: dates must be between trip dates
    if (trip) {
      const departureDate = new Date(trip.departureDate);
      const arrivalDate = new Date(trip.arrivalDate);

      if (data.pickupDateTime < departureDate || data.pickupDateTime > arrivalDate) {
        form.setError("pickupDateTime", {
          message: "La date de remise doit être entre la date de départ et d'arrivée du voyage",
        });
        return;
      }

      if (data.deliveryDateTime) {
        if (data.deliveryDateTime < departureDate || data.deliveryDateTime > arrivalDate) {
          form.setError("deliveryDateTime", {
            message: "La date de livraison doit être entre la date de départ et d'arrivée du voyage",
          });
          return;
        }

        if (data.deliveryDateTime < data.pickupDateTime) {
          form.setError("deliveryDateTime", {
            message: "La date de livraison doit être après la date de remise",
          });
          return;
        }
      }
    }

    console.log("Calling mutation with data");
    bookingMutation.mutate(data);
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

  return (
    <div className="pb-24 md:pb-8">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12">
        {/* Route Header */}
        <Card className="p-4 md:p-6 mb-4 md:mb-6">
          <div className="space-y-4 md:space-y-6">
            {/* Route with price */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-5 w-5 text-primary flex-shrink-0" />
                  <h1 className="text-xl md:text-3xl font-bold truncate">
                    {trip.departureCity}
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <h2 className="text-lg md:text-2xl font-semibold text-muted-foreground truncate">
                    {trip.destinationCity}
                  </h2>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-2xl md:text-3xl font-bold text-primary whitespace-nowrap">
                  {Number(trip.pricePerKg).toFixed(2)}€
                </div>
                <div className="text-sm text-muted-foreground">per kg</div>
              </div>
            </div>

            {/* Status badge */}
            {trip.status === "active" && (
              <Badge className="bg-chart-3 text-white" data-testid="badge-trip-status">
                <CheckCircle className="h-3 w-3 mr-1" />
                Available
              </Badge>
            )}

            {/* Trip info grid - Mobile optimized */}
            <div className="grid grid-cols-1 gap-3 md:gap-4">
              <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                <Calendar className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-muted-foreground mb-1">Departure</div>
                  <div className="font-medium leading-snug">{departureDate}</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                <Calendar className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-muted-foreground mb-1">Arrival</div>
                  <div className="font-medium leading-snug">{arrivalDate}</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                <Weight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-muted-foreground mb-1">Available Weight</div>
                  {Number(trip.availableWeight) === 0 ? (
                    <div className="text-lg font-bold text-destructive">
                      <span className="hidden sm:inline">Complet</span>
                      <span className="sm:hidden">Plus de place</span>
                    </div>
                  ) : (
                    <div className="text-lg font-bold text-primary">
                      {Number(trip.availableWeight).toFixed(1)}kg
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {/* Traveler Info */}
          <div className="md:col-span-1">
            <Card className="p-4 md:p-6">
              <h3 className="text-lg font-semibold mb-4">Traveler</h3>
              {trip.traveler && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-16 w-16 flex-shrink-0">
                      <AvatarImage src={trip.traveler.profileImageUrl || undefined} />
                      <AvatarFallback className="text-lg">
                        {trip.traveler.firstName?.[0] || trip.traveler.email?.[0] || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">
                        {trip.traveler.firstName && trip.traveler.lastName
                          ? `${trip.traveler.firstName} ${trip.traveler.lastName}`
                          : trip.traveler.email}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400 flex-shrink-0" />
                        <span>{Number(trip.traveler.rating || 0).toFixed(1)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Trips completed:</span>
                      <span className="font-semibold">
                        {trip.traveler.totalTripsAsTravel || 0}
                      </span>
                    </div>
                    {trip.traveler.isVerified && (
                      <Badge variant="outline" className="text-chart-3 border-chart-3 w-full justify-center">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                  </div>

                  {!isOwnTrip && (
                    <Button 
                      className="w-full" 
                      variant="outline" 
                      data-testid="button-message-traveler"
                      onClick={() => setLocation(`/messages?userId=${trip.travelerId}`)}
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Message
                    </Button>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Trip Details */}
          <div className="md:col-span-2 space-y-4">
            {trip.maxDimensions && (
              <Card className="p-4 md:p-6">
                <h3 className="text-lg font-semibold mb-3">
                  Maximum Dimensions
                </h3>
                <p className="leading-relaxed">{trip.maxDimensions}</p>
              </Card>
            )}

            {trip.acceptedItems && (
              <Card className="p-4 md:p-6">
                <h3 className="text-lg font-semibold mb-3">Accepted Items</h3>
                <p className="leading-relaxed whitespace-pre-wrap">
                  {trip.acceptedItems}
                </p>
              </Card>
            )}

            {trip.restrictedItems && (
              <Card className="p-4 md:p-6">
                <h3 className="text-lg font-semibold mb-3">
                  Restricted Items
                </h3>
                <p className="leading-relaxed whitespace-pre-wrap">
                  {trip.restrictedItems}
                </p>
              </Card>
            )}
          </div>
        </div>

        {/* Bookings Section - Only visible to trip owner */}
        {isOwnTrip && tripBookings && tripBookings.length > 0 && (
          <Card className="p-4 md:p-6 mt-6">
            <h3 className="text-lg font-semibold mb-4">
              Réservations ({tripBookings.length})
            </h3>
            <div className="space-y-3">
              {tripBookings.map((booking) => {
                const statusConfig = {
                  pending: { label: "En attente", variant: "secondary" as const },
                  confirmed: { label: "Confirmé", variant: "default" as const },
                  picked_up: { label: "Récupéré", variant: "default" as const },
                  in_transit: { label: "En transit", variant: "default" as const },
                  arrived: { label: "Arrivé", variant: "default" as const },
                  delivered: { label: "Livré", variant: "default" as const },
                  cancelled: { label: "Annulé", variant: "destructive" as const },
                };
                const config = statusConfig[booking.status as keyof typeof statusConfig];

                return (
                  <Link
                    key={booking.id}
                    href={`/bookings/${booking.id}`}
                  >
                    <Card className="p-4 hover-elevate active-elevate-2 transition-all cursor-pointer" data-testid={`card-booking-${booking.id}`}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-10 w-10 flex-shrink-0">
                            <AvatarImage src={booking.sender?.profileImageUrl || undefined} />
                            <AvatarFallback>
                              {booking.sender?.firstName?.[0] || booking.sender?.email?.[0] || "S"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {booking.sender?.firstName && booking.sender?.lastName
                                ? `${booking.sender.firstName} ${booking.sender.lastName}`
                                : booking.senderName}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {Number(booking.weight).toFixed(1)}kg • {Number(booking.price).toFixed(2)}€
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant={config.variant} data-testid={`badge-status-${booking.id}`}>
                            {config.label}
                          </Badge>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </Card>
        )}

        {/* CTA - Sticky on mobile, inline on desktop */}
        {!isOwnTrip && trip.status === "active" && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-sm border-t border-border shadow-lg md:relative md:bg-transparent md:backdrop-blur-none md:border-0 md:shadow-none md:mt-8 md:p-0 z-10">
            <div className="max-w-4xl mx-auto">
              {Number(trip.availableWeight) === 0 ? (
                <Button
                  size="lg"
                  className="w-full min-h-12"
                  disabled
                  data-testid="button-book-trip"
                >
                  <span className="hidden sm:inline">Complet - Plus de place disponible</span>
                  <span className="sm:hidden">Complet</span>
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="w-full min-h-12"
                  onClick={() => setShowBookingDialog(true)}
                  data-testid="button-book-trip"
                >
                  Book this trip
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Booking Dialog */}
        <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Réserver ce voyage</DialogTitle>
              <DialogDescription>
                Fournissez les détails de votre colis et les rendez-vous
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Parcel Information Section */}
                <div className="space-y-4">
                  <h4 className="text-base font-semibold">Informations colis</h4>
                  
                  <FormField
                    control={form.control}
                    name="weight"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Poids (kg) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            placeholder="Ex: 5"
                            className="h-11"
                            data-testid="input-booking-weight"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum : {Number(trip.availableWeight).toFixed(1)}kg
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="senderName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Votre nom *</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Ex: Jean Dupont"
                            className="h-11"
                            data-testid="input-booking-sender-name"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="senderPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Votre téléphone *</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            inputMode="tel"
                            placeholder="Ex: +33 6 12 34 56 78"
                            className="h-11"
                            data-testid="input-booking-sender-phone"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description du colis (optionnel)</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={3}
                            placeholder="Décrivez ce que vous envoyez..."
                            data-testid="input-booking-description"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Pickup Appointment Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <h4 className="text-base font-semibold">Rendez-vous remise *</h4>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="pickupLocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lieu de remise *</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Ex: Gare Montparnasse, Paris"
                            className="h-11 capitalize"
                            data-testid="input-pickup-location"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Indiquez un lieu précis de rencontre
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="pickupDateTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date et heure de remise *</FormLabel>
                        <FormControl>
                          <DateTimePicker
                            value={field.value}
                            onChange={field.onChange}
                            minDate={new Date(trip.departureDate)}
                            maxDate={new Date(trip.arrivalDate)}
                            placeholder="Sélectionner date et heure"
                            data-testid="input-pickup-datetime"
                          />
                        </FormControl>
                        <FormDescription>
                          Entre le {new Date(trip.departureDate).toLocaleDateString("fr-FR")} et le {new Date(trip.arrivalDate).toLocaleDateString("fr-FR")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Delivery Appointment Section (Optional) */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <h4 className="text-base font-semibold text-muted-foreground">
                      Rendez-vous livraison (optionnel)
                    </h4>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="deliveryLocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lieu de livraison</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Ex: Gare de Lyon, Lyon"
                            className="h-11 capitalize"
                            data-testid="input-delivery-location"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Optionnel : lieu de rencontre à destination
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deliveryDateTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date et heure de livraison</FormLabel>
                        <FormControl>
                          <DateTimePicker
                            value={field.value || undefined}
                            onChange={field.onChange}
                            minDate={new Date(trip.departureDate)}
                            maxDate={new Date(trip.arrivalDate)}
                            placeholder="Sélectionner date et heure"
                            data-testid="input-delivery-datetime"
                          />
                        </FormControl>
                        <FormDescription>
                          Optionnel : rendez-vous à l'arrivée
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Price Summary */}
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

                {/* Debug: Form Errors */}
                {Object.keys(form.formState.errors).length > 0 && (
                  <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
                    <div className="text-sm font-medium text-destructive mb-2">
                      Erreurs de formulaire :
                    </div>
                    <div className="text-xs space-y-1">
                      {Object.entries(form.formState.errors).map(([key, error]) => (
                        <div key={key}>
                          <strong>{key}:</strong> {error?.message?.toString()}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <DialogFooter className="gap-3 sm:gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowBookingDialog(false)}
                    className="flex-1"
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    disabled={bookingMutation.isPending}
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
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
