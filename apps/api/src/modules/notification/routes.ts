import { Router } from "express";
import { listNotificationsHandler } from "./controller.js";
import { requireAuthenticated } from "../../lib/rbac.js";

const router = Router();

router.get("/notifications", requireAuthenticated(), listNotificationsHandler);

export { router as notificationRoutes };
