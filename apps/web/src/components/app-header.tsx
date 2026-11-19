"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { en } from "@/i18n/en";
import { cn } from "@/components/ui/cn";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";

const items = [
  { href: "/app", label: en.app.nav.home },
  { href: "/app/resume", label: en.app.nav.resume },
  { href: "/app/tailor", label: en.app.nav.tailor },
  { href: "/app/key", label: en.app.nav.key },
  { href: "/app/privacy", label: en.app.nav.privacy },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** `signOut` is a server-rendered form, passed in as children. */
export function AppHeader({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu after navigating.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/app" className="font-heading text-2xl font-semibold text-brand">
          {en.product}
        </Link>

        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 font-semibold md:hidden"
          aria-expanded={open}
          aria-controls="app-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
          {open ? en.common.closeMenu : en.common.openMenu}
        </button>

        <div
          id="app-menu"
          className={cn("w-full flex-col gap-4 md:flex md:w-auto md:flex-1 md:flex-row md:items-center md:justify-between", open ? "flex" : "hidden")}
        >
          <nav aria-label={en.common.mainNav}>
            <ul className="flex flex-col gap-1 md:flex-row md:gap-1">
              {items.map((item) => {
                const current = isCurrent(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center rounded-lg px-3 font-medium",
                        current ? "bg-brand-soft font-semibold text-brand underline decoration-2 underline-offset-8" : "text-ink hover:bg-brand-soft",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex flex-wrap items-center gap-3 pb-2 md:pb-0">
            <p className="min-w-0 text-sm text-muted">
              <span className="sr-only">{en.app.signedInAs} </span>
              {email}
            </p>
            {children}
          </div>
        </div>
      </div>
    </header>
  );
}
