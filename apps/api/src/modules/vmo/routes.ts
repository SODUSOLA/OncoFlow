import { Router } from "express";
import { z } from "zod";
import {
  startTriageHandler, answerHandler, folderHandler, medicationTriageHandler, escalateHandler,
  listEscalationsHandler, updateEscalationStatusHandler, inboxHandler, unclaimedHandler, claimHandler, attachmentHandler,
} from "./controller.js";
import { requirePermission, requireRole } from "../../lib/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../lib/validation.js";
import { specialistEscalationStatusEnum } from "../../db/enums.js";

const conversationParam = z.object({ conversationId: z.string().uuid() });
const sessionParam = z.object({ sessionId: z.string().uuid() });
const idParam = z.object({ id: z.string().uuid() });
const answerSchema = z.object({ questionId: z.string().uuid(), answer: z.boolean() });
const escalateSchema = z.object({
  triggerReason: z.string().trim().min(1).max(500),
  triggerReference: z.string().uuid().optional(),
});
const statusSchema = z.object({ status: z.enum(["CONSULT_SCHEDULED", "RESOLVED"]) });
const listQuery = z.object({ status: z.enum(specialistEscalationStatusEnum.enumValues).optional() });

const router = Router();

// The VMO's checklist and the patient views it unlocks. No generic patient/vitals/labs grants exist for the role:
// everything a VMO can read about a patient goes through these routes, each re-checking chat + checklist.
router.get("/vmo/inbox", requirePermission("conversation", "read"), requireRole("VIRTUAL_MEDICAL_OFFICER"), inboxHandler);
router.get("/vmo/unclaimed", requirePermission("conversation", "read"), requireRole("VIRTUAL_MEDICAL_OFFICER"), unclaimedHandler);
router.get("/vmo/conversations/:conversationId/messages/:messageId/attachment", requirePermission("conversation", "read"), requireRole("VIRTUAL_MEDICAL_OFFICER"), validateParams(z.object({ conversationId: z.string().uuid(), messageId: z.string().uuid() })), attachmentHandler);
router.post("/vmo/conversations/:conversationId/claim", requirePermission("conversation", "update"), requireRole("VIRTUAL_MEDICAL_OFFICER"), validateParams(conversationParam), claimHandler);
router.post("/vmo/conversations/:conversationId/triage", requirePermission("triage", "create"), requireRole("VIRTUAL_MEDICAL_OFFICER"), validateParams(conversationParam), startTriageHandler);
router.post("/vmo/triage-sessions/:sessionId/answers", requirePermission("triage", "create"), requireRole("VIRTUAL_MEDICAL_OFFICER"), validateParams(sessionParam), validateBody(answerSchema), answerHandler);
router.get("/vmo/conversations/:conversationId/folder", requirePermission("triage", "read"), requireRole("VIRTUAL_MEDICAL_OFFICER"), validateParams(conversationParam), folderHandler);
router.get("/vmo/conversations/:conversationId/medication-triage", requirePermission("triage", "read"), requireRole("VIRTUAL_MEDICAL_OFFICER"), validateParams(conversationParam), medicationTriageHandler);
router.post("/vmo/conversations/:conversationId/escalations", requirePermission("specialistEscalation", "create"), requireRole("VIRTUAL_MEDICAL_OFFICER"), validateParams(conversationParam), validateBody(escalateSchema), escalateHandler);

// Regional Admin (actionable) and Clinical Directors (informational) read; only the admin advances status.
router.get("/escalations", requirePermission("specialistEscalation", "read"), validateQuery(listQuery), listEscalationsHandler);
router.patch("/escalations/:id/status", requirePermission("specialistEscalation", "update"), validateParams(idParam), validateBody(statusSchema), updateEscalationStatusHandler);

export { router as vmoRoutes };
