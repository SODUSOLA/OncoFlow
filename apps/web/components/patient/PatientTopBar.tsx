"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Headphones } from "lucide-react";
import { api } from "@/lib/api";
import type { AppNotification } from "@/lib/types";

// Top bar for the patient app with the notification bell.
export function PatientTopBar() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    api.get<{ notifications: AppNotification[] }>("/notifications")
      .then((res) => setUnreadCount(res.notifications.filter((n) => n.status !== "READ").length))
      .catch(() => setUnreadCount(0));
  }, []);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-end gap-4 px-4 py-3">
      <button
        onClick={() => router.push("/messages?type=MO_SIDE_EFFECT")}
        aria-label="Report a side effect"
        className="relative text-neutral-500 hover:text-primary"
      >
        <Headphones className="size-5" aria-hidden="true" />
        <span className="absolute -right-2 -top-1.5 rounded-full bg-critical px-1 text-[9px] font-bold leading-[14px] text-white">
          HELP
        </span>
      </button>
      <Link href="/notifications" aria-label="Notifications" className="relative text-neutral-500 hover:text-primary">
        <Bell className="size-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-2 -top-2 flex min-w-[16px] items-center justify-center rounded-full bg-critical px-1 text-[10px] font-bold leading-[16px] text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>
    </header>
  );
}
