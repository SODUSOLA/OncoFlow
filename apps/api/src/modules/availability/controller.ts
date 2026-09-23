import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { userHasPermission } from "../../lib/rbac.js";
import { availabilityService } from "./service.js";

// Maps a service error message to an HTTP status.
function errorStatus(message: string): number {
  if (message === "Availability block not found") return 404;
  if (message.startsWith("You can only")) return 403;
  if (message === "startTime must be before endTime") return 422;
  return 500;
}

// Adds an availability block for the calling consultant.
export async function addAvailabilityHandler(req: Request, res: Response) {
  try {
    const consultantId = (req as AuthenticatedRequest).userId;
    const { availableDate, startTime, endTime } = req.body;
    const result = await availabilityService.addBlock(consultantId, availableDate, startTime, endTime);
    res.status(201).json({ availability: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(errorStatus(message)).json({ error: message });
  }
}

// consultantId may be another consultant's, since Regional Admin's scheduler reads other consultants' availability.
export async function listAvailabilityHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const consultantId = String(req.query.consultantId);
    const isSelf = consultantId === callerId;
    if (!isSelf && !(await userHasPermission(callerId, "availability", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const result = await availabilityService.listForConsultant(consultantId);
    res.json({ availability: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Removes one of the caller's availability blocks.
export async function removeAvailabilityHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    await availabilityService.removeBlock(String(req.params.id), callerId);
    res.status(204).send();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(errorStatus(message)).json({ error: message });
  }
}
