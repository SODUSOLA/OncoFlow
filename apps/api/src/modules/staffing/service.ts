import crypto from "node:crypto";
import { db } from "../../db/index.js";
import { and, eq, inArray } from "drizzle-orm";
import { user, role, userRole } from "../auth/schema.js";
import { FacilityRepository } from "../facility/repository.js";
import { ShiftRequirementRepository, ShiftAssignmentRepository } from "./repository.js";

const requirementRepo = new ShiftRequirementRepository();
const assignmentRepo = new ShiftAssignmentRepository();
const facilityRepo = new FacilityRepository();

export class StaffingService {
  // The whole facility x weekday grid for a region + ISO week, in one call — requirements
  // (standing policy) joined against this specific week's actual assignments. Frontend derives
  // shortage/utilization stats from this rather than the backend precomputing them, same
  // approach as the Dashboard page's countdown-case stats.
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

  async assign(data: { facilityId: string; weekday: number; isoYear: number; isoWeek: number; userId: string; assignedBy: string }) {
    return assignmentRepo.create({ id: crypto.randomUUID(), ...data, assignedAt: new Date() });
  }

  async publishWeek(region: string | undefined, isoYear: number, isoWeek: number) {
    const allFacilities = await facilityRepo.findAll();
    const facilities = region ? allFacilities.filter((f) => f.region === region) : allFacilities;
    return assignmentRepo.publishWeek(facilities.map((f) => f.id), isoYear, isoWeek);
  }

  // Eligible assignees for the "Assign Nurse" picker — Onsite Nursing Officers, optionally
  // narrowed to one facility (user.facilityId, populated for facility-scoped staff per
  // auth/schema.ts's own comment on that column).
  // `facilityIds` is the authorization-narrowed set from lib/facility-scope.ts. Undefined means
  // unrestricted (SUPER_ADMIN / national roles); an empty array means nothing in scope, which
  // inArray renders as a false predicate — correctly returning no nurses rather than all of them.
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
}
