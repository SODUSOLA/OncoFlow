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

// Managing your own availability is a right (requireAuthenticated); the list route's ownership-or-permission check is in the controller so Regional Admin can read others.
router.post("/availability", requireAuthenticated(), validateBody(addAvailabilitySchema), addAvailabilityHandler);
// Lists a consultant's availability blocks.
router.get("/availability", requireAuthenticated(), validateQuery(listAvailabilityQuerySchema), listAvailabilityHandler);
// Removes an availability block owned by the caller.
router.delete("/availability/:id", requireAuthenticated(), validateParams(idParamSchema), removeAvailabilityHandler);

export { router as availabilityRoutes };
