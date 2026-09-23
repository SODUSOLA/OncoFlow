import { Router } from "express";
import { z } from "zod";
import { getActivityFeedHandler } from "./controller.js";
import { requirePermission } from "../../lib/rbac.js";
import { validateQuery } from "../../lib/validation.js";

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const router = Router();

// Recent activity feed, restricted to callers with audit:read.
router.get("/audit/activity", requirePermission("audit", "read"), validateQuery(activityQuerySchema), getActivityFeedHandler);

export { router as auditRoutes };
