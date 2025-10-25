import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import { DesktopNav } from "@/components/DesktopNav";
import { MobileNav } from "@/components/MobileNav";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Home from "@/pages/Home";
import Search from "@/pages/Search";
import CreateTrip from "@/pages/CreateTrip";
import TripDetails from "@/pages/TripDetails";
import Messages from "@/pages/Messages";
import Profile from "@/pages/Profile";
import MyTrips from "@/pages/MyTrips";
import MyBookings from "@/pages/MyBookings";
import BookingDetails from "@/pages/BookingDetails";

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  return (
    <>
      {isAuthenticated && <DesktopNav user={user} />}
      
      <Switch>
        {isLoading || !isAuthenticated ? (
          <Route path="/" component={Landing} />
        ) : (
          <>
            <Route path="/" component={Home} />
            <Route path="/search" component={Search} />
            <Route path="/create-trip" component={CreateTrip} />
            <Route path="/trips/:id" component={TripDetails} />
            <Route path="/messages" component={Messages} />
            <Route path="/profile" component={Profile} />
            <Route path="/my-trips" component={MyTrips} />
            <Route path="/my-bookings" component={MyBookings} />
            <Route path="/bookings/:id" component={BookingDetails} />
          </>
        )}
        <Route component={NotFound} />
      </Switch>

      {isAuthenticated && <MobileNav />}
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
