import { Router } from "express";
import { listCountdownCasesHandler } from "./controller.js";
import { requirePermission } from "../../lib/rbac.js";

const router = Router();

router.get("/countdown-cases", requirePermission("countdownCase", "read"), listCountdownCasesHandler);

export { router as clinicalRoutes };
