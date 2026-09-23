import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { NotificationRepository } from "./repository.js";

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
