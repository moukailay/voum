import { Package, TrendingUp, Shield, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-card-border">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 text-xl font-bold">
              <Package className="h-6 w-6 text-primary" />
              <span>ParcelLink</span>
            </div>
            <Button
              onClick={() => (window.location.href = "/api/login")}
              data-testid="button-login"
            >
              Log in
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-12 md:py-20">
        <div className="max-w-4xl mx-auto px-4 md:px-8 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
            Send parcels with
            <span className="text-primary"> trusted travelers</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Connect with travelers going your way. Send parcels quickly,
            economically, and securely between cities.
          </p>
          <Button
            size="lg"
            onClick={() => (window.location.href = "/api/login")}
            data-testid="button-get-started"
            className="text-base px-8 py-6"
          >
            Get Started
          </Button>
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 md:py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-center mb-12">
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="p-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-4">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                1. Post or Search
              </h3>
              <p className="text-sm text-muted-foreground">
                Travelers post their trips. Senders search for available routes.
              </p>
            </Card>

            <Card className="p-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-4">
                <MessageCircle className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                2. Connect & Coordinate
              </h3>
              <p className="text-sm text-muted-foreground">
                Use our messaging system to arrange pickup and delivery details.
              </p>
            </Card>

            <Card className="p-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-4">
                <Shield className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                3. Track & Deliver
              </h3>
              <p className="text-sm text-muted-foreground">
                Track your parcel status and confirm delivery with a secure PIN.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-center mb-12">
            Why choose ParcelLink?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-lg bg-chart-3/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-chart-3" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Secure Payments</h3>
                <p className="text-sm text-muted-foreground">
                  Funds held in escrow until delivery is confirmed
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-lg bg-chart-5/10 flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-chart-5" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Real-time Messaging</h3>
                <p className="text-sm text-muted-foreground">
                  Coordinate directly with travelers through our platform
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-lg bg-chart-4/10 flex items-center justify-center">
                  <Package className="h-5 w-5 text-chart-4" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Track Your Parcel</h3>
                <p className="text-sm text-muted-foreground">
                  Follow every step from pickup to delivery
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Verified Users</h3>
                <p className="text-sm text-muted-foreground">
                  Build trust with ratings and verification badges
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 md:py-16 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto px-4 md:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to get started?
          </h2>
          <p className="text-lg mb-8 opacity-90">
            Join thousands of travelers and senders already using ParcelLink
          </p>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => (window.location.href = "/api/login")}
            data-testid="button-cta-signup"
            className="text-base px-8 py-6"
          >
            Sign up now
          </Button>
        </div>
      </section>
    </div>
  );
}
