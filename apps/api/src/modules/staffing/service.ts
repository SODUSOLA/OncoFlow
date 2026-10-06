import crypto from "node:crypto";
import { db } from "../../db/index.js";
import { and, eq, inArray } from "drizzle-orm";
import { user, role, userRole } from "../auth/schema.js";
import { FacilityRepository } from "../facility/repository.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { ShiftRequirementRepository, ShiftAssignmentRepository } from "./repository.js";

const requirementRepo = new ShiftRequirementRepository();
const assignmentRepo = new ShiftAssignmentRepository();
const facilityRepo = new FacilityRepository();

export const ALREADY_ASSIGNED_MESSAGE = "This nurse is already assigned to that shift";
export const CROSS_SUPPORT_MESSAGE = "Cross-facility support is not available: a nurse can only be assigned to their own facility";

// Business logic for weekly nurse staffing.
export class StaffingService {
  // Facility × weekday grid for a region and ISO week, joining standing requirements to that week's assignments; the frontend derives shortages from it.
  async getWeekOverview(region: string | undefined, isoYear: number, isoWeek: number) {
    const allFacilities = await facilityRepo.findAll();
    const facilities = region ? allFacilities.filter((f) => f.region === region) : allFacilities;
    const facilityIds = facilities.map((f) => f.id);

    const [requirements, assignments] = await Promise.all([
      requirementRepo.findByFacilityIds(facilityIds),
      assignmentRepo.findForWeek(facilityIds, isoYear, isoWeek),
    ]);

    const assigneeIds = [...new Set(assignments.map((a) => a.userId))];
    const assigneeNames = assigneeIds.length === 0
      ? []
      : await db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, assigneeIds));
    const nameById = new Map(assigneeNames.map((u) => [u.id, u.email]));

    return facilities.map((f) => ({
      facility: { id: f.id, name: f.name, region: f.region },
      weekdays: Array.from({ length: 7 }, (_, weekday) => {
        const requirement = requirements.find((r) => r.facilityId === f.id && r.weekday === weekday);
        const dayAssignments = assignments.filter((a) => a.facilityId === f.id && a.weekday === weekday);
        return {
          weekday,
          requiredCount: requirement?.requiredCount ?? 0,
          assigned: dayAssignments.map((a) => ({ userId: a.userId, email: nameById.get(a.userId) ?? a.userId, published: a.publishedAt !== null })),
        };
      }),
    }));
  }

  // Creates a draft assignment for a nurse. Cross-support is switched off for now: a nurse can only be rostered
  // at the facility they belong to, however the request was made (the picker already lists only home nurses).
  async assign(data: { facilityId: string; weekday: number; isoYear: number; isoWeek: number; userId: string; assignedBy: string }) {
    const [nurse] = await db.select({ facilityId: user.facilityId }).from(user).where(eq(user.id, data.userId)).limit(1);
    if (!nurse) throw new NotFoundError("Nurse not found");
    if (nurse.facilityId !== data.facilityId) throw new ConflictError(CROSS_SUPPORT_MESSAGE);
    if (await assignmentRepo.exists(data)) throw new ConflictError(ALREADY_ASSIGNED_MESSAGE);
    return assignmentRepo.create({ id: crypto.randomUUID(), ...data, assignedAt: new Date() });
  }

  // Publishes the week's drafts for the region's facilities.
  async publishWeek(region: string | undefined, isoYear: number, isoWeek: number) {
    const allFacilities = await facilityRepo.findAll();
    const facilities = region ? allFacilities.filter((f) => f.region === region) : allFacilities;
    return assignmentRepo.publishWeek(facilities.map((f) => f.id), isoYear, isoWeek);
  }

  // Onsite Nursing Officers for the Assign Nurse picker; facilityIds undefined means unrestricted and an empty array means nothing in scope.
  async findEligibleNurses(facilityIds?: string[]) {
    return db
      .select({ id: user.id, email: user.email })
      .from(user)
      .innerJoin(userRole, eq(userRole.userId, user.id))
      .innerJoin(role, eq(userRole.roleId, role.id))
      .where(
        facilityIds
          ? and(eq(role.name, "ONSITE_NURSING_OFFICER"), inArray(user.facilityId, facilityIds))
          : eq(role.name, "ONSITE_NURSING_OFFICER"),
      );
  }

  // The caller's own published assignments (at their own facility) with facility names.
  async getMyAssignments(userId: string, isoYear: number, isoWeek: number) {
    const rows = await assignmentRepo.findForUserWeek(userId, isoYear, isoWeek);
    // Assignments at any facility other than the nurse's own (made before cross-support was switched off) aren't shown.
    const [self] = await db.select({ facilityId: user.facilityId }).from(user).where(eq(user.id, userId)).limit(1);
    const facilities = await facilityRepo.findAll();
    const facilityById = new Map(facilities.map((f) => [f.id, f]));
    return rows
      .filter((r) => r.publishedAt !== null && r.facilityId === self?.facilityId)
      .map((r) => ({
        id: r.id, facilityId: r.facilityId, facilityName: facilityById.get(r.facilityId)?.name ?? "Unknown facility",
        weekday: r.weekday,
      }));
  }
}
