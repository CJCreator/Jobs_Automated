"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, Compass, Sparkles, Menu } from "lucide-react";
import { cn } from "@/lib/cn";
import { isActivePath } from "@/lib/nav-items";

export function BottomNav() {
  const pathname = usePathname();

  const handleOpenAssistant = () => {
    window.dispatchEvent(new CustomEvent("co-assistant"));
  };

  const handleOpenMenu = () => {
    window.dispatchEvent(new CustomEvent("co-open-menu"));
  };

  const navItems = [
    { href: "/", label: "Today", icon: LayoutDashboard },
    { href: "/pipeline", label: "Pipeline", icon: ListChecks },
    { href: "/explore", label: "Explore", icon: Compass },
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border bg-surface/95 px-2 py-1.5 backdrop-blur-md md:hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 rounded-lg py-1 px-3 text-[10px] font-medium transition-colors",
              active
                ? "text-brand"
                : "text-muted hover:text-foreground"
            )}
          >
            <Icon className="size-5" />
            <span>{label}</span>
          </Link>
        );
      })}

      {/* Assistant / Cmd+K Trigger */}
      <button
        type="button"
        onClick={handleOpenAssistant}
        className="flex flex-col items-center justify-center gap-0.5 rounded-lg py-1 px-3 text-[10px] font-medium text-muted transition-colors hover:text-foreground focus:outline-none"
        aria-label="Open AI Assistant"
      >
        <Sparkles className="size-5 text-brand" />
        <span>Ask AI</span>
      </button>

      {/* Slide-over Drawer Menu Trigger */}
      <button
        type="button"
        onClick={handleOpenMenu}
        className="flex flex-col items-center justify-center gap-0.5 rounded-lg py-1 px-3 text-[10px] font-medium text-muted transition-colors hover:text-foreground focus:outline-none"
        aria-label="Open Menu"
      >
        <Menu className="size-5" />
        <span>Menu</span>
      </button>
    </nav>
  );
}

