import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  MapPin,
  Package,
  CheckCircle,
  Clock,
  TrendingUp,
  MessageCircle,
  DollarSign,
  Calendar,
  ExternalLink,
  ChevronDown,
  History,
  Download,
  Bell,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { Booking, Trip, User } from "@shared/schema";

interface BookingWithDetails extends Booking {
  trip?: Trip & { traveler?: User };
  sender?: User;
}

const statusSteps = [
  { key: "pending", label: "Pending", icon: Clock },
  { key: "confirmed", label: "Confirmed", icon: CheckCircle },
  { key: "picked_up", label: "Picked Up", icon: Package },
  { key: "in_transit", label: "In Transit", icon: TrendingUp },
  { key: "arrived", label: "Arrived", icon: MapPin },
  { key: "delivered", label: "Delivered", icon: CheckCircle },
];

export default function BookingDetails() {
  const [, params] = useRoute("/bookings/:id");
  const bookingId = params?.id;
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pin, setPin] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: booking, isLoading } = useQuery<BookingWithDetails>({
    queryKey: ["/api/bookings", bookingId],
    enabled: !!bookingId,
  });

  const { data: reminders } = useQuery<any[]>({
    queryKey: ["/api/bookings", bookingId, "reminders"],
    enabled: !!bookingId,
  });

  const verifyPinMutation = useMutation({
    mutationFn: async (data: { pin: string; action: "pickup" | "delivery" }) => {
      return await apiRequest("POST", `/api/bookings/${bookingId}/verify-pin`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId] });
      toast({
        title: "Success!",
        description: "Status updated successfully",
      });
      setShowPinDialog(false);
      setPin("");
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
        title: "Invalid PIN",
        description: error.message || "The PIN you entered is incorrect",
        variant: "destructive",
      });
    },
  });

  const confirmPickupMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/bookings/${bookingId}/confirm-pickup`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId] });
      toast({
        title: "Présence confirmée !",
        description: "Votre présence au rendez-vous de remise a été confirmée",
      });
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
        title: "Erreur",
        description: error.message || "Impossible de confirmer la présence",
        variant: "destructive",
      });
    },
  });

  const confirmDeliveryMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/bookings/${bookingId}/confirm-delivery`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId] });
      toast({
        title: "Présence confirmée !",
        description: "Votre présence au rendez-vous de livraison a été confirmée",
      });
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
        title: "Erreur",
        description: error.message || "Impossible de confirmer la présence",
        variant: "destructive",
      });
    },
  });

  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen pb-20 md:pb-8">
        <div className="text-muted-foreground">Loading booking details...</div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex items-center justify-center min-h-screen pb-20 md:pb-8">
        <Card className="p-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Booking not found</h3>
          <p className="text-sm text-muted-foreground">
            This booking doesn't exist or has been removed
          </p>
        </Card>
      </div>
    );
  }

  const currentStepIndex = statusSteps.findIndex((s) => s.key === booking.status);
  const isTraveler = user?.id === booking.trip?.travelerId;
  const isSender = user?.id === booking.senderId;

  // Helper function to create Google Maps link
  const getMapLink = (location: string) => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  };

  // Helper function to calculate days until appointment
  const getDaysUntil = (date: Date | string | null | undefined) => {
    if (!date) return null;
    const appointmentDate = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffTime = appointmentDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Helper function to download .ics file
  const downloadCalendar = (type: "pickup" | "delivery") => {
    window.open(`/api/bookings/${bookingId}/calendar/${type}`, "_blank");
  };

  // Helper function to get reminders for appointment type
  const getRemindersForType = (type: "pickup" | "delivery") => {
    if (!reminders) return [];
    return reminders.filter((r: any) => r.type === type);
  };

  return (
    <div className="pb-20 md:pb-8">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <h1 className="text-3xl md:text-4xl font-semibold mb-8">
          Booking Details
        </h1>

        {/* Booking Header */}
        <Card className="p-6 md:p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 text-2xl font-semibold mb-2">
                <MapPin className="h-6 w-6 text-primary" />
                {booking.trip?.departureCity} → {booking.trip?.destinationCity}
              </div>
              <p className="text-muted-foreground">{booking.description}</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-primary">
                {Number(booking.price).toFixed(2)}€
              </div>
              <div className="text-sm text-muted-foreground">
                {Number(booking.weight).toFixed(1)}kg
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              className={cn(
                booking.status === "delivered"
                  ? "bg-chart-3 text-white"
                  : booking.status === "in_transit" || booking.status === "arrived"
                  ? "bg-chart-4 text-white"
                  : "bg-chart-5 text-white"
              )}
            >
              {booking.status.replace("_", " ")}
            </Badge>

            <Badge
              variant="outline"
              className={cn(
                booking.escrowStatus === "released"
                  ? "text-chart-3 border-chart-3"
                  : booking.escrowStatus === "refunded"
                  ? "text-destructive border-destructive"
                  : ""
              )}
            >
              Payment: {booking.escrowStatus}
            </Badge>
          </div>
        </Card>

        {/* Tracking Timeline */}
        <Card className="p-6 md:p-8 mb-6">
          <h2 className="text-xl font-semibold mb-6">Tracking</h2>

          {/* Desktop: Horizontal */}
          <div className="hidden md:block">
            <div className="relative">
              <div className="absolute top-5 left-0 right-0 h-0.5 bg-muted" />
              <div
                className="absolute top-5 left-0 h-0.5 bg-primary transition-all duration-500"
                style={{
                  width: `${(currentStepIndex / (statusSteps.length - 1)) * 100}%`,
                }}
              />

              <div className="relative flex justify-between">
                {statusSteps.map((step, index) => {
                  const Icon = step.icon;
                  const isCompleted = index <= currentStepIndex;
                  const isCurrent = index === currentStepIndex;

                  return (
                    <div key={step.key} className="flex flex-col items-center">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center border-2 bg-background transition-colors",
                          isCompleted
                            ? "border-primary text-primary"
                            : "border-muted text-muted-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="mt-2 text-xs font-medium text-center max-w-20">
                        {step.label}
                      </div>
                      {isCurrent && (
                        <div className="mt-1 text-xs text-primary">Current</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Mobile: Vertical */}
          <div className="md:hidden space-y-4">
            {statusSteps.map((step, index) => {
              const Icon = step.icon;
              const isCompleted = index <= currentStepIndex;
              const isCurrent = index === currentStepIndex;

              return (
                <div key={step.key} className="flex items-start gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 flex-shrink-0",
                      isCompleted
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted bg-background text-muted-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="font-medium">{step.label}</div>
                    {isCurrent && (
                      <div className="text-xs text-primary mt-1">Current status</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Participants */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Sender */}
          {booking.sender && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Sender</h3>
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={booking.sender.profileImageUrl || undefined} />
                  <AvatarFallback>
                    {booking.sender.firstName?.[0] || booking.sender.email?.[0] || "S"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">
                    {booking.sender.firstName && booking.sender.lastName
                      ? `${booking.sender.firstName} ${booking.sender.lastName}`
                      : booking.sender.email}
                  </div>
                </div>
              </div>
              {isTraveler && (
                <Button variant="outline" className="w-full">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Message
                </Button>
              )}
            </Card>
          )}

          {/* Traveler */}
          {booking.trip?.traveler && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Traveler</h3>
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage
                    src={booking.trip.traveler.profileImageUrl || undefined}
                  />
                  <AvatarFallback>
                    {booking.trip.traveler.firstName?.[0] ||
                      booking.trip.traveler.email?.[0] ||
                      "T"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">
                    {booking.trip.traveler.firstName && booking.trip.traveler.lastName
                      ? `${booking.trip.traveler.firstName} ${booking.trip.traveler.lastName}`
                      : booking.trip.traveler.email}
                  </div>
                </div>
              </div>
              {isSender && (
                <Button variant="outline" className="w-full">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Message
                </Button>
              )}
            </Card>
          )}
        </div>

        {/* Appointments */}
        {(booking.pickupDateTime || booking.deliveryDateTime) && (
          <Card className="p-6 md:p-8 mb-6">
            <h2 className="text-xl font-semibold mb-6">Rendez-vous</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pickup Appointment */}
              {booking.pickupDateTime && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Remise du colis</h3>
                  </div>

                  <div className="space-y-3">
                    {/* Location with Map Link */}
                    {booking.pickupLocation && (
                      <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                        <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-muted-foreground mb-1">Lieu</div>
                          <div className="font-medium mb-2">{booking.pickupLocation}</div>
                          <a
                            href={getMapLink(booking.pickupLocation)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            data-testid="link-pickup-map"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Voir sur Google Maps
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Date/Time with Countdown */}
                    <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                      <Calendar className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-muted-foreground mb-1">Date et heure</div>
                        <div className="font-medium">
                          {format(new Date(booking.pickupDateTime), "PPP 'à' HH:mm", { locale: fr })}
                        </div>
                        {(() => {
                          const daysUntil = getDaysUntil(booking.pickupDateTime);
                          if (daysUntil !== null && daysUntil >= 0) {
                            return (
                              <div className="text-xs text-muted-foreground mt-1">
                                {daysUntil === 0 ? "Aujourd'hui" : daysUntil === 1 ? "Demain" : `Dans ${daysUntil} jours`}
                              </div>
                            );
                          } else if (daysUntil !== null && daysUntil < 0) {
                            return (
                              <div className="text-xs text-destructive mt-1">
                                Passé
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>

                    {/* Confirmation Status & Button */}
                    {booking.pickupConfirmedAt ? (
                      <div className="flex items-center gap-2 p-3 bg-chart-3/10 border border-chart-3/20 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-chart-3" />
                        <span className="text-sm font-medium text-chart-3">
                          Présence confirmée
                        </span>
                      </div>
                    ) : (
                      <Button
                        onClick={() => confirmPickupMutation.mutate()}
                        disabled={confirmPickupMutation.isPending}
                        className="w-full"
                        data-testid="button-confirm-pickup"
                      >
                        {confirmPickupMutation.isPending ? (
                          <>
                            <span className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                            Confirmation...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Confirmer ma présence
                          </>
                        )}
                      </Button>
                    )}

                    {/* Calendar Export Button */}
                    <Button
                      variant="outline"
                      onClick={() => downloadCalendar("pickup")}
                      className="w-full"
                      data-testid="button-download-pickup-calendar"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Ajouter au calendrier
                    </Button>

                    {/* Reminders Status */}
                    {(() => {
                      const pickupReminders = getRemindersForType("pickup");
                      if (pickupReminders.length === 0) return null;

                      return (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Bell className="h-4 w-4" />
                            <span className="font-medium">Rappels programmés</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {pickupReminders.map((reminder: any) => (
                              <Badge
                                key={reminder.id}
                                variant={reminder.status === "sent" ? "default" : "secondary"}
                                className="text-xs"
                                data-testid={`badge-reminder-${reminder.id}`}
                              >
                                {reminder.notificationType === "email" ? "📧" : "🔔"}{" "}
                                {reminder.status === "sent" 
                                  ? `Envoyé ${formatDistanceToNow(new Date(reminder.sentAt!), { addSuffix: true, locale: fr })}` 
                                  : `T-${Math.floor((new Date(reminder.scheduledFor).getTime() - Date.now()) / (1000 * 60 * 60))}h`}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Delivery Appointment */}
              {booking.deliveryDateTime && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Livraison du colis</h3>
                  </div>

                  <div className="space-y-3">
                    {/* Location with Map Link */}
                    {booking.deliveryLocation && (
                      <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                        <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-muted-foreground mb-1">Lieu</div>
                          <div className="font-medium mb-2">{booking.deliveryLocation}</div>
                          <a
                            href={getMapLink(booking.deliveryLocation)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            data-testid="link-delivery-map"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Voir sur Google Maps
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Date/Time with Countdown */}
                    <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                      <Calendar className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-muted-foreground mb-1">Date et heure</div>
                        <div className="font-medium">
                          {format(new Date(booking.deliveryDateTime), "PPP 'à' HH:mm", { locale: fr })}
                        </div>
                        {(() => {
                          const daysUntil = getDaysUntil(booking.deliveryDateTime);
                          if (daysUntil !== null && daysUntil >= 0) {
                            return (
                              <div className="text-xs text-muted-foreground mt-1">
                                {daysUntil === 0 ? "Aujourd'hui" : daysUntil === 1 ? "Demain" : `Dans ${daysUntil} jours`}
                              </div>
                            );
                          } else if (daysUntil !== null && daysUntil < 0) {
                            return (
                              <div className="text-xs text-destructive mt-1">
                                Passé
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>

                    {/* Confirmation Status & Button */}
                    {booking.deliveryConfirmedAt ? (
                      <div className="flex items-center gap-2 p-3 bg-chart-3/10 border border-chart-3/20 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-chart-3" />
                        <span className="text-sm font-medium text-chart-3">
                          Présence confirmée
                        </span>
                      </div>
                    ) : (
                      <Button
                        onClick={() => confirmDeliveryMutation.mutate()}
                        disabled={confirmDeliveryMutation.isPending}
                        className="w-full"
                        data-testid="button-confirm-delivery"
                      >
                        {confirmDeliveryMutation.isPending ? (
                          <>
                            <span className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                            Confirmation...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Confirmer ma présence
                          </>
                        )}
                      </Button>
                    )}

                    {/* Calendar Export Button */}
                    <Button
                      variant="outline"
                      onClick={() => downloadCalendar("delivery")}
                      className="w-full"
                      data-testid="button-download-delivery-calendar"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Ajouter au calendrier
                    </Button>

                    {/* Reminders Status */}
                    {(() => {
                      const deliveryReminders = getRemindersForType("delivery");
                      if (deliveryReminders.length === 0) return null;

                      return (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Bell className="h-4 w-4" />
                            <span className="font-medium">Rappels programmés</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {deliveryReminders.map((reminder: any) => (
                              <Badge
                                key={reminder.id}
                                variant={reminder.status === "sent" ? "default" : "secondary"}
                                className="text-xs"
                                data-testid={`badge-reminder-${reminder.id}`}
                              >
                                {reminder.notificationType === "email" ? "📧" : "🔔"}{" "}
                                {reminder.status === "sent" 
                                  ? `Envoyé ${formatDistanceToNow(new Date(reminder.sentAt!), { addSuffix: true, locale: fr })}` 
                                  : `T-${Math.floor((new Date(reminder.scheduledFor).getTime() - Date.now()) / (1000 * 60 * 60))}h`}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Appointment History */}
        {booking.appointmentHistory && booking.appointmentHistory.length > 0 && (
          <Card className="p-6 md:p-8 mb-6">
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-xl font-semibold">
                    Historique des modifications
                  </h2>
                  <Badge variant="secondary" className="ml-2">
                    {booking.appointmentHistory.length}
                  </Badge>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-9 p-0">
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        historyOpen && "rotate-180"
                      )}
                    />
                    <span className="sr-only">Toggle history</span>
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent className="mt-4">
                <div className="space-y-3">
                  {booking.appointmentHistory
                    .slice()
                    .reverse()
                    .map((entry, index) => {
                      const entryDate = new Date(entry.timestamp);
                      
                      // Format action text
                      let actionText = "";
                      if (entry.action === "confirm_pickup") {
                        actionText = "a confirmé sa présence au rendez-vous de remise";
                      } else if (entry.action === "confirm_delivery") {
                        actionText = "a confirmé sa présence au rendez-vous de livraison";
                      } else if (entry.action === "update") {
                        actionText = "a modifié le rendez-vous";
                      }

                      return (
                        <div
                          key={`${entry.timestamp}-${index}`}
                          className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            <div className="h-2 w-2 rounded-full bg-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm">
                              <span className="font-medium">
                                {entry.actor === booking.senderId
                                  ? "L'expéditeur"
                                  : entry.actor === booking.trip?.travelerId
                                  ? "Le voyageur"
                                  : "Système"}
                              </span>{" "}
                              {actionText}
                            </div>
                            {entry.changes && Object.keys(entry.changes).length > 0 && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {Object.entries(entry.changes).map(([key, value]) => {
                                  let label = key;
                                  if (key === "pickupLocation") label = "Lieu de remise";
                                  else if (key === "pickupDateTime") label = "Date de remise";
                                  else if (key === "deliveryLocation") label = "Lieu de livraison";
                                  else if (key === "deliveryDateTime") label = "Date de livraison";
                                  
                                  let displayValue = value;
                                  if (key.includes("DateTime") && value) {
                                    displayValue = format(new Date(value as string), "PPP 'à' HH:mm", { locale: fr });
                                  }
                                  
                                  return (
                                    <div key={key}>
                                      {label}: {displayValue || "Supprimé"}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <div className="mt-1 text-xs text-muted-foreground">
                              {format(entryDate, "PPP 'à' HH:mm", { locale: fr })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        )}

        {/* PINs */}
        {(booking.pickupPIN || booking.deliveryPIN) && (
          <Card className="p-6 md:p-8 mb-6">
            <h2 className="text-xl font-semibold mb-4">Security PINs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {booking.pickupPIN && (
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">
                    Pickup PIN
                  </div>
                  <div className="text-2xl font-mono font-bold tracking-wider">
                    {booking.pickupPIN}
                  </div>
                </div>
              )}
              {booking.deliveryPIN && (
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">
                    Delivery PIN
                  </div>
                  <div className="text-2xl font-mono font-bold tracking-wider">
                    {booking.deliveryPIN}
                  </div>
                </div>
              )}
            </div>

            {isTraveler && (() => {
              // Determine which action we're about to do
              const action = booking.status === "pending" || booking.status === "confirmed"
                ? "pickup"
                : "delivery";
              
              // Check if appointment confirmation is required
              const needsPickupConfirmation = !!(booking.pickupDateTime && !booking.pickupConfirmedAt);
              const needsDeliveryConfirmation = !!(booking.deliveryDateTime && !booking.deliveryConfirmedAt);
              
              const isBlocked = 
                (action === "pickup" && needsPickupConfirmation) ||
                (action === "delivery" && needsDeliveryConfirmation);
              
              return (
                <div className="mt-4 space-y-3">
                  {isBlocked && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                      <p className="text-amber-900 dark:text-amber-200">
                        ⚠️ Vous devez d'abord confirmer votre présence au rendez-vous de {action === "pickup" ? "remise" : "livraison"} avant de valider le code PIN.
                      </p>
                    </div>
                  )}
                  <Button
                    onClick={() => setShowPinDialog(true)}
                    disabled={isBlocked}
                    data-testid="button-verify-pin"
                  >
                    Verify PIN & Update Status
                  </Button>
                </div>
              );
            })()}
          </Card>
        )}

        {/* PIN Verification Dialog */}
        <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Verify PIN</DialogTitle>
              <DialogDescription>
                Enter the PIN to confirm and update the booking status
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="pin">PIN Code</Label>
                <Input
                  id="pin"
                  type="text"
                  maxLength={6}
                  placeholder="Enter 6-digit PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  data-testid="input-pin"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPinDialog(false);
                    setPin("");
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const action =
                      booking.status === "pending" || booking.status === "confirmed"
                        ? "pickup"
                        : "delivery";
                    verifyPinMutation.mutate({ pin, action });
                  }}
                  disabled={verifyPinMutation.isPending || pin.length !== 6}
                  className="flex-1"
                  data-testid="button-confirm-pin"
                >
                  {verifyPinMutation.isPending ? "Verifying..." : "Verify"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
