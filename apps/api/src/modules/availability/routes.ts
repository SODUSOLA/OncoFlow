import { Router } from "express";
import { z } from "zod";
import { addAvailabilityHandler, listAvailabilityHandler, removeAvailabilityHandler } from "./controller.js";
import { requireAuthenticated } from "../../lib/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../lib/validation.js";

const addAvailabilitySchema = z.object({
  availableDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM"),
});
const listAvailabilityQuerySchema = z.object({ consultantId: z.string().uuid() });
const idParamSchema = z.object({ id: z.string().uuid() });

const router = Router();

// requireAuthenticated, not requirePermission — a consultant managing their OWN availability is
// a right, not a granted permission (same pattern as clinical-metrics' patient-facing GETs).
// Ownership-or-permission for the list route is resolved inside the controller, since Regional
// Admin legitimately needs to read a DIFFERENT consultant's availability while scheduling.
router.post("/availability", requireAuthenticated(), validateBody(addAvailabilitySchema), addAvailabilityHandler);
router.get("/availability", requireAuthenticated(), validateQuery(listAvailabilityQuerySchema), listAvailabilityHandler);
router.delete("/availability/:id", requireAuthenticated(), validateParams(idParamSchema), removeAvailabilityHandler);

export { router as availabilityRoutes };
