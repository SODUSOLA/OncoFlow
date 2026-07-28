import { Router } from "express";
import { listCountdownCasesHandler } from "./controller";
import { requirePermission } from "../../lib/rbac";

const router = Router();

router.get("/countdown-cases", requirePermission("countdownCase", "read"), listCountdownCasesHandler);

export { router as clinicalRoutes };
