import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { NotificationRepository } from "./repository.js";
import { pushService, vapidPublicKey } from "./pushService.js";

const notificationRepo = new NotificationRepository();

// Always the caller's own notifications, filtered by recipientId, so no permission grant is needed.
export async function listNotificationsHandler(req: Request, res: Response) {
  try {
    const recipientId = (req as AuthenticatedRequest).userId;
    const rows = await notificationRepo.findByRecipient(recipientId);
    res.json({
      notifications: rows.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        sentAt: row.sentAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
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
