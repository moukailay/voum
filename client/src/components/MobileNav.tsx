import { Home, Search, MessageCircle, User } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const [location] = useLocation();

  const navItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Search, label: "Search", path: "/search" },
    { icon: MessageCircle, label: "Messages", path: "/messages" },
    { icon: User, label: "Profile", path: "/profile" },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-card-border md:hidden"
      data-testid="nav-mobile"
    >
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path;
          
          return (
            <Link
              key={item.path}
              href={item.path}
              data-testid={`link-mobile-nav-${item.label.toLowerCase()}`}
            >
              <button
                className={cn(
                  "flex flex-col items-center justify-center w-16 h-full hover-elevate",
                  isActive && "text-primary"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs mt-1">{item.label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
