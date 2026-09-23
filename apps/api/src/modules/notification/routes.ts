import { Router } from "express";
import { listNotificationsHandler } from "./controller.js";
import { requireAuthenticated } from "../../lib/rbac.js";

const router = Router();

// Lists the caller's own notifications.
router.get("/notifications", requireAuthenticated(), listNotificationsHandler);

export { router as notificationRoutes };
