import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <Card className="p-12 text-center max-w-md">
        <Package className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <h2 className="text-xl font-semibold mb-4">Page not found</h2>
        <p className="text-muted-foreground mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button onClick={() => setLocation("/")} data-testid="button-home">
          Go back home
        </Button>
      </Card>
    </div>
  );
}
