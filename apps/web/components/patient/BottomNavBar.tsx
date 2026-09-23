"use client";

import { LayoutGrid, FileText, Wallet, MessageCircle, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/home", label: "Dashboard", icon: LayoutGrid },
  { href: "/records", label: "Records", icon: FileText },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/messages", label: "Chat", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: User },
] as const;

// Bottom tab bar for the patient app.
export function BottomNavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-3 pt-1" aria-label="Primary">
      <ul className="mx-auto flex max-w-md items-center justify-between gap-1 rounded-full bg-surface px-2 py-1.5 shadow-md">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1 text-[10px] font-semibold transition-colors duration-fast",
                  active ? "bg-neutral-100" : ""
                )}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full transition-colors duration-fast",
                    active ? "bg-primary text-white" : "text-neutral-400"
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <span className={active ? "text-primary" : "text-neutral-400"}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
