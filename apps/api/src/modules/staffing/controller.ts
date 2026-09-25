import type { Request, Response } from "express";
import { AppError } from "../../lib/errors.js";
import { accessibleFacilityIds, resolveScopeOrDeny } from "../../lib/facility-scope.js";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { StaffingService } from "./service.js";

const staffingSvc = new StaffingService();

// Parses and validates isoYear and isoWeek from a request source, or returns null.
function parseIsoWeekParams(source: Record<string, unknown>): { isoYear: number; isoWeek: number } | null {
  const isoYear = Number(source.isoYear);
  const isoWeek = Number(source.isoWeek);
  if (!Number.isInteger(isoYear) || !Number.isInteger(isoWeek) || isoWeek < 1 || isoWeek > 53) return null;
  return { isoYear, isoWeek };
}

// Returns the weekly staffing overview for the caller's scope.
export async function getWeekOverviewHandler(req: Request, res: Response) {
  try {
    const params = parseIsoWeekParams(req.query as Record<string, unknown>);
    if (!params) {
      res.status(400).json({ error: "isoYear and isoWeek query parameters are required" });
      return;
    }
    const region = typeof req.query.region === "string" ? req.query.region : undefined;
    const overview = await staffingSvc.getWeekOverview(region, params.isoYear, params.isoWeek);
    res.json({ facilities: overview });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Staff reading their own assignments is a right, so it needs only authentication.
export async function getMyAssignmentsHandler(req: Request, res: Response) {
  try {
    const params = parseIsoWeekParams(req.query as Record<string, unknown>);
    if (!params) {
      res.status(400).json({ error: "isoYear and isoWeek query parameters are required" });
      return;
    }
    const callerId = (req as AuthenticatedRequest).userId;
    const assignments = await staffingSvc.getMyAssignments(callerId, params.isoYear, params.isoWeek);
    res.json({ assignments });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Assigns a nurse to a facility shift.
export async function assignNurseHandler(req: Request, res: Response) {
  try {
    const { facilityId, weekday, isoYear, isoWeek, userId } = req.body;
    const assignedBy = (req as AuthenticatedRequest).userId;
    // An admin rosters only within their own region.
    const scope = await accessibleFacilityIds(assignedBy);
    if (scope && !scope.includes(facilityId)) {
      res.status(403).json({ error: "Forbidden: facility outside your region" });
      return;
    }
    const assignment = await staffingSvc.assign({ facilityId, weekday, isoYear, isoWeek, userId, assignedBy });
    res.status(201).json({ assignment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(err instanceof AppError ? err.statusCode : 400).json({ error: message });
  }
}

// Publishes a facility week's draft assignments.
export async function publishWeekHandler(req: Request, res: Response) {
  try {
    const params = parseIsoWeekParams(req.body as Record<string, unknown>);
    if (!params) {
      res.status(400).json({ error: "isoYear and isoWeek are required" });
      return;
    }
    const region = typeof req.body.region === "string" ? req.body.region : undefined;
    const publishedCount = await staffingSvc.publishWeek(region, params.isoYear, params.isoWeek);
    res.json({ published: publishedCount });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Lists nurses eligible for assignment at a facility.
export async function listEligibleNursesHandler(req: Request, res: Response) {
  try {
    // Narrowed to the caller's scope so one region can't enumerate another's nursing roster via an untrusted ?facilityId.
    const scope = await resolveScopeOrDeny(req, res, "staffing");
    if (!scope) return;
    const nurses = await staffingSvc.findEligibleNurses(
      scope.kind === "unrestricted" ? undefined : scope.facilityIds,
    );
    res.json({ nurses });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
