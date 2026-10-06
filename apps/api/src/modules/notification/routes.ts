import { Router } from "express";
import { z } from "zod";
import { listNotificationsHandler, markAllNotificationsReadHandler, markNotificationReadHandler, pushPublicKeyHandler, subscribePushHandler, unsubscribePushHandler } from "./controller.js";
import { requireAuthenticated } from "../../lib/rbac.js";
import { validateBody, validateParams } from "../../lib/validation.js";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) });

const router = Router();

// Lists the caller's own notifications.
router.get("/notifications", requireAuthenticated(), listNotificationsHandler);
// Marks one of the caller's own notifications as read.
router.post("/notifications/:id/read", requireAuthenticated(), validateParams(z.object({ id: z.string().uuid() })), markNotificationReadHandler);
// Marks all of the caller's own notifications as read.
router.post("/notifications/read-all", requireAuthenticated(), markAllNotificationsReadHandler);
// Push registration is self-service: any signed-in user manages only their own devices.
router.get("/push/public-key", requireAuthenticated(), pushPublicKeyHandler);
router.post("/push/subscriptions", requireAuthenticated(), validateBody(subscribeSchema), subscribePushHandler);
router.delete("/push/subscriptions", requireAuthenticated(), validateBody(unsubscribeSchema), unsubscribePushHandler);

export { router as notificationRoutes };
