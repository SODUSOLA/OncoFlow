import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { NotificationRepository } from "./repository.js";
import { pushService, vapidPublicKey } from "./pushService.js";
import { CHAT_NOTIFICATION_TYPES } from "./service.js";

const notificationRepo = new NotificationRepository();

// Always the caller's own notifications, filtered by recipientId, so no permission grant is needed.
export async function listNotificationsHandler(req: Request, res: Response) {
  try {
    const recipientId = (req as AuthenticatedRequest).userId;
    // ?scope=alerts is the Notification Center's view: clinical alerts, reminders and payments, without chat messages.
    const rows = await notificationRepo.findByRecipient(recipientId, {
      excludeTypes: req.query.scope === "alerts" ? CHAT_NOTIFICATION_TYPES : undefined,
    });
    res.json({
      notifications: rows.map((row) => ({
        id: row.id,
        type: row.type,
        referenceId: row.referenceId,
        status: row.status,
        sentAt: row.sentAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Marks one of the caller's own notifications as read, as it is opened.
export async function markNotificationReadHandler(req: Request, res: Response) {
  try {
    const ok = await notificationRepo.markRead(String(req.params.id), (req as AuthenticatedRequest).userId);
    if (!ok) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Marks the caller's own notifications as read; the recipient filter in the query means nobody can touch another user's.
export async function markAllNotificationsReadHandler(req: Request, res: Response) {
  try {
    const updated = await notificationRepo.markAllRead((req as AuthenticatedRequest).userId);
    res.json({ updated });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// The public VAPID key the browser needs to subscribe; null when push isn't configured.
export async function pushPublicKeyHandler(_req: Request, res: Response) {
  res.json({ publicKey: vapidPublicKey() });
}

// Registers the caller's own device. Always self-scoped, so no permission grant is needed.
export async function subscribePushHandler(req: Request, res: Response) {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    await pushService.subscribe(userId, req.body, req.get("user-agent") ?? null);
    res.status(201).json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Removes one of the caller's own devices.
export async function unsubscribePushHandler(req: Request, res: Response) {
  try {
    const removed = await pushService.unsubscribe((req as AuthenticatedRequest).userId, req.body.endpoint);
    res.json({ removed });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
