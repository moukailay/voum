import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MapPin, Calendar, Weight, DollarSign, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useLocation } from "wouter";
import { insertTripSchema } from "@shared/schema";

const formSchema = insertTripSchema
  .omit({
    travelerId: true,
    departureDate: true,
    arrivalDate: true,
    availableWeight: true,
    pricePerKg: true,
  })
  .extend({
    departureDate: z.string().min(1, "Departure date is required"),
    arrivalDate: z.string().min(1, "Arrival date is required"),
    availableWeight: z.string().min(1, "Available weight is required"),
    pricePerKg: z.string().min(1, "Price per kg is required"),
  });

type FormData = z.infer<typeof formSchema>;

export default function CreateTrip() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      departureCity: "",
      destinationCity: "",
      departureDate: "",
      arrivalDate: "",
      availableWeight: "",
      pricePerKg: "",
      maxDimensions: "",
      acceptedItems: "",
      restrictedItems: "",
    },
  });

  const createTripMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const tripData = {
        departureCity: data.departureCity,
        destinationCity: data.destinationCity,
        departureDate: new Date(data.departureDate).toISOString(),
        arrivalDate: new Date(data.arrivalDate).toISOString(),
        availableWeight: data.availableWeight,
        pricePerKg: data.pricePerKg,
        maxDimensions: data.maxDimensions || null,
        acceptedItems: data.acceptedItems || null,
        restrictedItems: data.restrictedItems || null,
      };
      return await apiRequest("POST", "/api/trips", tripData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({
        title: "Success!",
        description: "Your trip has been posted successfully",
      });
      setLocation("/my-trips");
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
        title: "Error",
        description: error.message || "Failed to create trip",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createTripMutation.mutate(data);
  };

  return (
    <div className="pb-20 md:pb-8">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <h1 className="text-3xl md:text-4xl font-semibold mb-2">
          Post a trip
        </h1>
        <p className="text-muted-foreground mb-8">
          Share your travel plans and help people send parcels
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Route
              </h2>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="departureCity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Departure City</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Paris"
                          {...field}
                          data-testid="input-departure"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="destinationCity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Destination City</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Lyon"
                          {...field}
                          data-testid="input-destination"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Dates
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="departureDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Departure Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          data-testid="input-departure-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="arrivalDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Arrival Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          data-testid="input-arrival-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Weight className="h-5 w-5 text-primary" />
                Capacity & Pricing
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <FormField
                  control={form.control}
                  name="availableWeight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Available Weight (kg)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="e.g., 10"
                          {...field}
                          data-testid="input-weight"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pricePerKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price per kg (€)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="e.g., 5.00"
                          {...field}
                          data-testid="input-price"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="maxDimensions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Dimensions (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., 50x40x30 cm"
                        {...field}
                        data-testid="input-dimensions"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">
                Additional Details (optional)
              </h2>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="acceptedItems"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Accepted Items</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., Documents, small packages, non-fragile items..."
                          rows={3}
                          {...field}
                          data-testid="input-accepted-items"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="restrictedItems"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Restricted Items</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., No liquids, no fragile items..."
                          rows={3}
                          {...field}
                          data-testid="input-restricted-items"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Card>

            <div className="flex gap-4 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/")}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createTripMutation.isPending}
                data-testid="button-submit-trip"
              >
                {createTripMutation.isPending ? "Creating..." : "Post Trip"}
                {!createTripMutation.isPending && (
                  <ArrowRight className="ml-2 h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
