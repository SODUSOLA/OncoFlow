import { Router } from "express";
import { z } from "zod";
import {
  getWeekOverviewHandler, assignNurseHandler, publishWeekHandler, listEligibleNursesHandler,
} from "./controller.js";
import { requirePermission } from "../../lib/rbac.js";
import { validateBody, validateQuery } from "../../lib/validation.js";

const weekQuerySchema = z.object({
  isoYear: z.coerce.number().int().min(2020).max(2100),
  isoWeek: z.coerce.number().int().min(1).max(53),
  region: z.string().trim().min(1).optional(),
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

router.get("/staffing/week", requirePermission("staffing", "read"), validateQuery(weekQuerySchema), getWeekOverviewHandler);
router.get("/staffing/eligible-nurses", requirePermission("staffing", "read"), validateQuery(eligibleNursesQuerySchema), listEligibleNursesHandler);
router.post("/staffing/assignments", requirePermission("staffing", "update"), validateBody(assignNurseSchema), assignNurseHandler);
router.post("/staffing/publish", requirePermission("staffing", "update"), validateBody(publishSchema), publishWeekHandler);

export { router as staffingRoutes };
