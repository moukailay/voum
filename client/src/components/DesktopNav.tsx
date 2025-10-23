import { Package, MessageCircle, User, LogOut } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { User as UserType } from "@shared/schema";

interface DesktopNavProps {
  user?: UserType;
}

export function DesktopNav({ user }: DesktopNavProps) {
  const [location] = useLocation();

  const navItems = [
    { label: "Search Trips", path: "/search" },
    { label: "My Trips", path: "/my-trips" },
    { label: "Messages", path: "/messages" },
  ];

  return (
    <nav
      className="hidden md:block sticky top-0 z-50 bg-card border-b border-card-border"
      data-testid="nav-desktop"
    >
      <div className="max-w-7xl mx-auto px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/">
              <button
                className="flex items-center gap-2 text-xl font-bold hover-elevate"
                data-testid="link-home-logo"
              >
                <Package className="h-6 w-6 text-primary" />
                <span>ParcelLink</span>
              </button>
            </Link>

            <div className="flex items-center gap-4">
              {navItems.map((item) => {
                const isActive = location === item.path;
                return (
                  <Link key={item.path} href={item.path}>
                    <button
                      className={cn(
                        "text-sm font-medium hover-elevate px-3 py-2 rounded-lg",
                        isActive ? "text-primary" : "text-muted-foreground"
                      )}
                      data-testid={`link-nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      {item.label}
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />

            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    data-testid="button-user-menu"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.profileImageUrl || undefined} />
                      <AvatarFallback>
                        {user.firstName?.[0] || user.email?.[0] || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <Link href="/profile">
                    <DropdownMenuItem data-testid="link-profile">
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => (window.location.href = "/api/logout")}
                    data-testid="button-logout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
