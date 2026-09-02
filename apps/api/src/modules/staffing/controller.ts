import type { Request, Response } from "express";
import { resolveScopeOrDeny } from "../../lib/facility-scope.js";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { StaffingService } from "./service.js";

const staffingSvc = new StaffingService();

function parseIsoWeekParams(source: Record<string, unknown>): { isoYear: number; isoWeek: number } | null {
  const isoYear = Number(source.isoYear);
  const isoWeek = Number(source.isoWeek);
  if (!Number.isInteger(isoYear) || !Number.isInteger(isoWeek) || isoWeek < 1 || isoWeek > 53) return null;
  return { isoYear, isoWeek };
}

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

export async function assignNurseHandler(req: Request, res: Response) {
  try {
    const { facilityId, weekday, isoYear, isoWeek, userId } = req.body;
    const assignedBy = (req as AuthenticatedRequest).userId;
    const assignment = await staffingSvc.assign({ facilityId, weekday, isoYear, isoWeek, userId, assignedBy });
    res.status(201).json({ assignment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(400).json({ error: message });
  }
}

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

export async function listEligibleNursesHandler(req: Request, res: Response) {
  try {
    // Staff directory for a facility — narrowed to the caller's scope so one region cannot
    // enumerate another's nursing roster off an untrusted `?facilityId`.
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
