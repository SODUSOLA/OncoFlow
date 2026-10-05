import { Router } from "express";
import { z } from "zod";
import { listNotificationsHandler, pushPublicKeyHandler, subscribePushHandler, unsubscribePushHandler } from "./controller.js";
import { requireAuthenticated } from "../../lib/rbac.js";
import { validateBody } from "../../lib/validation.js";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) });

const router = Router();

// Lists the caller's own notifications.
router.get("/notifications", requireAuthenticated(), listNotificationsHandler);
// Push registration is self-service: any signed-in user manages only their own devices.
router.get("/push/public-key", requireAuthenticated(), pushPublicKeyHandler);
router.post("/push/subscriptions", requireAuthenticated(), validateBody(subscribeSchema), subscribePushHandler);
router.delete("/push/subscriptions", requireAuthenticated(), validateBody(unsubscribeSchema), unsubscribePushHandler);

export { router as notificationRoutes };
