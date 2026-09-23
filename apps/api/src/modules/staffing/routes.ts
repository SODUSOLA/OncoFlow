import { Router } from "express";
import { z } from "zod";
import {
  getWeekOverviewHandler, assignNurseHandler, publishWeekHandler, listEligibleNursesHandler, getMyAssignmentsHandler,
} from "./controller.js";
import { requirePermission, requireAuthenticated } from "../../lib/rbac.js";
import { validateBody, validateQuery } from "../../lib/validation.js";

const weekQuerySchema = z.object({
  isoYear: z.coerce.number().int().min(2020).max(2100),
  isoWeek: z.coerce.number().int().min(1).max(53),
  region: z.string().trim().min(1).optional(),
});

const myAssignmentsQuerySchema = z.object({
  isoYear: z.coerce.number().int().min(2020).max(2100),
  isoWeek: z.coerce.number().int().min(1).max(53),
});

const assignNurseSchema = z.object({
  facilityId: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  isoYear: z.number().int().min(2020).max(2100),
  isoWeek: z.number().int().min(1).max(53),
  userId: z.string().uuid(),
});

const publishSchema = z.object({
  isoYear: z.number().int().min(2020).max(2100),
  isoWeek: z.number().int().min(1).max(53),
  region: z.string().trim().min(1).optional(),
});

const eligibleNursesQuerySchema = z.object({
  facilityId: z.string().uuid().optional(),
});

const router = Router();

// Weekly staffing grid for the caller's region.
router.get("/staffing/week", requirePermission("staffing", "read"), validateQuery(weekQuerySchema), getWeekOverviewHandler);
// The caller's own published assignments.
router.get("/staffing/mine", requireAuthenticated(), validateQuery(myAssignmentsQuerySchema), getMyAssignmentsHandler);
// Nurses eligible for assignment at a facility.
router.get("/staffing/eligible-nurses", requirePermission("staffing", "read"), validateQuery(eligibleNursesQuerySchema), listEligibleNursesHandler);
// Assigns a nurse to a facility and weekday.
router.post("/staffing/assignments", requirePermission("staffing", "update"), validateBody(assignNurseSchema), assignNurseHandler);
// Publishes a week's draft assignments.
router.post("/staffing/publish", requirePermission("staffing", "update"), validateBody(publishSchema), publishWeekHandler);

export { router as staffingRoutes };
