import { Router } from "express";
import { listFacilitiesHandler } from "./controller.js";

const router = Router();

// public — reference data needed pre-login by the registration wizard's facility picker.
router.get("/facilities", listFacilitiesHandler);

export { router as facilityRoutes };
