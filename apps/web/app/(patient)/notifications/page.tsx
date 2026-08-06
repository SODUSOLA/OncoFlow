"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Bell } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import type { AppNotification } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  APPOINTMENT_REMINDER: "Appointment Reminder",
  LAB_RESULT_REVIEWED: "Lab Result Reviewed",
  INVOICE_SENT: "Invoice Sent",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  NEW_MESSAGE: "New Message",
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ notifications: AppNotification[] }>("/notifications")
      .then((res) => setNotifications(res.notifications))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Link href="/home" aria-label="Back to Dashboard">
          <ArrowLeft className="size-5 text-neutral-500" />
        </Link>
        <h1 className="font-display text-xl font-bold text-primary">Notification Center</h1>
      </div>
      <p className="text-sm text-neutral-500">Stay updated with clinical alerts, reminders, and payments.</p>

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
              <Card className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-900">
                  {TYPE_LABELS[n.type] ?? n.type}
                </span>
                <span className="text-xs text-neutral-400">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
