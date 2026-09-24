import { Router } from "express";
import { z } from "zod";
import { listFacilitiesHandler, getFacilityQaOfficerHandler } from "./controller.js";
import { requireAuthenticated } from "../../lib/rbac.js";
import { validateParams } from "../../lib/validation.js";

const facilityIdParamSchema = z.object({ id: z.string().uuid() });

const router = Router();

// public — reference data needed pre-login by the registration wizard's facility picker.
router.get("/facilities", listFacilitiesHandler);
// Who to show as "Managing Consultant" on a case at this facility — any authenticated staff member can
// look this up, same as a directory listing.
router.get("/facilities/:id/qa-officer", requireAuthenticated(), validateParams(facilityIdParamSchema), getFacilityQaOfficerHandler);

export { router as facilityRoutes };
