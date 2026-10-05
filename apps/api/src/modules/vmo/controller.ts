import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { AppError } from "../../lib/errors.js";
import { vmoService } from "./service.js";

const caller = (req: Request) => (req as AuthenticatedRequest).userId;
function fail(res: Response, err: unknown) {
  const status = err instanceof AppError ? err.statusCode : 500;
  res.status(status).json({ error: err instanceof Error ? err.message : "Internal server error" });
}

// Starts or resumes the caller's triage checklist for a chat.
export async function startTriageHandler(req: Request, res: Response) {
  try { res.status(201).json({ triage: await vmoService.startTriage(String(req.params.conversationId), caller(req)) }); } catch (e) { fail(res, e); }
}

// Records the next answer.
export async function answerHandler(req: Request, res: Response) {
  try {
    const { questionId, answer } = req.body;
    res.json({ triage: await vmoService.answer(String(req.params.sessionId), caller(req), questionId, answer) });
  } catch (e) { fail(res, e); }
}

// The gated Patient Folder.
export async function folderHandler(req: Request, res: Response) {
  try { res.json(await vmoService.getFolder(String(req.params.conversationId), caller(req))); } catch (e) { fail(res, e); }
}

// The gated Medication Triage aggregation.
export async function medicationTriageHandler(req: Request, res: Response) {
  try { res.json(await vmoService.getMedicationTriage(String(req.params.conversationId), caller(req))); } catch (e) { fail(res, e); }
}

// Escalates to a Specialist Oncologist.
export async function escalateHandler(req: Request, res: Response) {
  try {
    const { triggerReason, triggerReference } = req.body;
    res.status(201).json({ escalation: await vmoService.escalate(String(req.params.conversationId), caller(req), triggerReason, triggerReference) });
  } catch (e) { fail(res, e); }
}

// Region-scoped escalation list.
export async function listEscalationsHandler(req: Request, res: Response) {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ escalations: await vmoService.listEscalations(caller(req), status) });
  } catch (e) { fail(res, e); }
}

// Regional Admin advances an escalation.
export async function updateEscalationStatusHandler(req: Request, res: Response) {
  try {
    res.json({ escalation: await vmoService.updateEscalationStatus(String(req.params.id), caller(req), req.body.status) });
  } catch (e) { fail(res, e); }
}

// The VMO's chat inbox.
export async function inboxHandler(req: Request, res: Response) {
  try { res.json({ conversations: await vmoService.inbox(caller(req)) }); } catch (e) { fail(res, e); }
}
