import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { accessibleFacilityIds } from "../../lib/facility-scope.js";
import { auditService } from "./service.js";

// Returns the recent activity feed scoped to the caller's region.
export async function getActivityFeedHandler(req: Request, res: Response) {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const limit = typeof req.query.limit === "number" ? req.query.limit : 30;
    const allowed = await accessibleFacilityIds(userId);
    const events = await auditService.getActivityFeed(allowed, limit);
    res.json({ events });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
