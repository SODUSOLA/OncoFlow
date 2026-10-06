"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Bell, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { AppNotification } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  APPOINTMENT_REMINDER: "Appointment Reminder",
  LAB_RESULT_REVIEWED: "Lab Result Reviewed",
  INVOICE_SENT: "Invoice Sent",
  INVOICE_PAID: "Payment Confirmed",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  NEW_MESSAGE: "New Message",
  APPOINTMENT_SCHEDULED: "Appointment Scheduled",
  APPOINTMENT_CONFIRMED: "Appointment Confirmed",
  APPOINTMENT_RESCHEDULED: "Appointment Rescheduled",
  SLA_BREACH: "Response Delayed",
  CONVERSATION_FEEDBACK: "New Feedback Received",
};

// Chat traffic stays in the chat panel; this page is for clinical alerts, reminders and payments.
const CHAT_TYPES = new Set(["NEW_MESSAGE", "CONVERSATION_FEEDBACK"]);

// Where a notification leads: the specific thread, invoice or appointment area it is about. Older notifications
// carry no reference, so they open the right section instead; types with no destination are not clickable.
function destinationFor(n: AppNotification): string | null {
  switch (n.type) {
    case "NEW_MESSAGE":
    case "CONVERSATION_FEEDBACK":
    case "SLA_BREACH":
      return n.referenceId ? `/messages?conversation=${n.referenceId}` : "/messages";
    case "INVOICE_SENT":
    case "INVOICE_PAID":
    case "PAYMENT_CONFIRMED":
      return n.referenceId ? `/wallet?invoice=${n.referenceId}` : "/wallet";
    case "APPOINTMENT_REMINDER":
    case "APPOINTMENT_CONFIRMED":
    case "APPOINTMENT_RESCHEDULED":
    case "APPOINTMENT_SCHEDULED":
      return "/appointments";
    case "LAB_RESULT_REVIEWED":
      return "/records";
    default:
      return null;
  }
}

// Notifications page listing the patient's notifications live.
export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const unreadCount = notifications.filter((n) => n.status !== "READ").length;

  // Opens what a notification is about, marking it read first so the badge and dot clear.
  function openNotification(n: AppNotification) {
    const destination = destinationFor(n);
    if (n.status !== "READ") {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: "READ" as const } : x)));
      window.dispatchEvent(new Event("notifications:read-one"));
      void api.post(`/notifications/${n.id}/read`, {}).catch(() => {});
    }
    if (destination) router.push(destination);
  }

  // Marks everything read on the server, then mirrors it locally and tells the top bar to clear its badge.
  async function markAllRead() {
    setMarking(true);
    try {
      await api.post("/notifications/read-all", {});
      setNotifications((prev) => prev.map((n) => ({ ...n, status: "READ" as const })));
      window.dispatchEvent(new Event("notifications:read-all"));
    } catch {
      // Left unread so the button stays available to retry.
    } finally {
      setMarking(false);
    }
  }

  useEffect(() => {
    api.get<{ notifications: AppNotification[] }>("/notifications?scope=alerts")
      .then((res) => setNotifications(res.notifications))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, []);

  // The per-user room is joined server-side on connect, so notifications created while the page is open arrive live.
  useEffect(() => {
    const socket = getSocket();
    // Prepends a pushed notification if it isn't already listed.
    function onNewNotification(n: AppNotification) {
      // Chat messages live in the chat panel, not here.
      if (CHAT_TYPES.has(n.type)) return;
      setNotifications((prev) => (prev.some((existing) => existing.id === n.id) ? prev : [n, ...prev]));
    }
    socket.on("notification:new", onNewNotification);
    return () => {
      socket.off("notification:new", onNewNotification);
    };
  }, []);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Link href="/home" aria-label="Back to Dashboard">
          <ArrowLeft className="size-5 text-neutral-500" />
        </Link>
        <h1 className="font-display text-xl font-bold text-primary">Notification Center</h1>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">Stay updated with clinical alerts, reminders, and payments.</p>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} loading={marking} className="shrink-0">
            Mark all as read
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-center text-sm text-neutral-400">Loading…</p>
      ) : notifications.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <Bell className="size-8 text-neutral-300" aria-hidden="true" />
          <p className="text-sm font-medium text-neutral-700">No notifications yet</p>
          <p className="text-sm text-neutral-400">
            Alerts about appointments, lab results, and payments will show up here.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => (
            <li key={n.id}>
              <Card
                className={destinationFor(n) ? "flex cursor-pointer items-center justify-between transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" : "flex items-center justify-between"}
                {...(destinationFor(n)
                  ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-label": `Open ${TYPE_LABELS[n.type] ?? n.type}`,
                      onClick: () => openNotification(n),
                      onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openNotification(n); } },
                    }
                  : {})}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                  {n.status !== "READ" && <span className="size-2 shrink-0 rounded-full bg-critical" aria-label="Unread" />}
                  {TYPE_LABELS[n.type] ?? n.type}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-neutral-400">
                  {new Date(n.createdAt).toLocaleString()}
                  {destinationFor(n) && <ChevronRight className="size-4" aria-hidden="true" />}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
