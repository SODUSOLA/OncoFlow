import crypto from "node:crypto";
import { AvailabilityRepository } from "./repository.js";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { db } from "../../db/index.js";
import { sql } from "drizzle-orm";
import { notificationService } from "../notification/index.js";

const repo = new AvailabilityRepository();

// A consultant must be bookable on at least this many days of the week.
export const MIN_AVAILABLE_DAYS = 3;

// Uses the Lagos calendar date, the same timezone the scheduling flow that reads these blocks uses.
function lagosDateString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
// Formats a timestamp as its Africa/Lagos HH:MM time.
function lagosTimeString(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

// Notifies every REGIONAL_ADMIN in the consultant's region of an availability change.
async function notifyAdminsOfAvailabilityChange(consultantId: string): Promise<void> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT u.id
    FROM "user" u
    JOIN user_role ur ON ur.user_id = u.id
    JOIN role r ON r.id = ur.role_id
    WHERE r.name::text = 'REGIONAL_ADMIN'
      AND u.facility_id IN (
        SELECT f.id FROM facility f
        WHERE f.is_deleted = false
          AND f.region = (
            SELECT region FROM facility WHERE id = (SELECT facility_id FROM "user" WHERE id = ${consultantId})
          )
      )
  `);
  await Promise.all(rows.map((r) =>
    notificationService.create({ recipientId: r.id, type: "AVAILABILITY_CHANGED" }).catch((err) => {
      console.error("Availability-change notification failed for admin", r.id, err);
    }),
  ));
}

// Business logic for consultant availability.
export class AvailabilityService {
  // Adds a block after checking the start is before the end, and notifies regional admins.
  async addBlock(consultantId: string, availableDate: string, startTime: string, endTime: string) {
    if (startTime >= endTime) {
      throw new Error("startTime must be before endTime");
    }
    const row = await repo.create({ id: crypto.randomUUID(), consultantId, availableDate, startTime, endTime });
    void notifyAdminsOfAvailabilityChange(consultantId);
    return row;
  }

  // Sets the consultant's availability for the 7 Lagos days starting today in one save, requiring at least MIN_AVAILABLE_DAYS distinct days.
  async setWeek(consultantId: string, days: { availableDate: string; startTime: string; endTime: string }[]) {
    const today = lagosDateString(new Date());
    const windowEnd = lagosDateString(new Date(Date.now() + 6 * 86_400_000));
    const distinct = new Set(days.map((d) => d.availableDate));
    if (distinct.size !== days.length) throw new Error("Each day can only be set once");
    if (days.length < MIN_AVAILABLE_DAYS) throw new Error(`Select at least ${MIN_AVAILABLE_DAYS} days to be available`);
    for (const d of days) {
      if (d.availableDate < today || d.availableDate > windowEnd) throw new Error("Days must fall within the next 7 days");
      if (d.startTime >= d.endTime) throw new Error("startTime must be before endTime");
    }
    const rows = days.map((d) => ({ id: crypto.randomUUID(), consultantId, availableDate: d.availableDate, startTime: d.startTime, endTime: d.endTime }));
    const saved = await repo.replaceRange(consultantId, today, windowEnd, rows);
    void notifyAdminsOfAvailabilityChange(consultantId);
    return saved;
  }

  // Lists a consultant's availability blocks.
  async listForConsultant(consultantId: string) {
    return repo.findByConsultant(consultantId);
  }

  // Removes a block, allowed only for its owner.
  async removeBlock(id: string, callerId: string) {
    const row = await repo.findById(id);
    if (!row) throw new NotFoundError("Availability block not found");
    if (row.consultantId !== callerId) throw new ForbiddenError("You can only remove your own availability");
    await repo.remove(id);
    void notifyAdminsOfAvailabilityChange(callerId);
  }

  // The server-side scheduling constraint: whether the time plus duration fits entirely inside one block on that Lagos date.
  async isWithinAvailability(consultantId: string, scheduledAt: Date, durationMinutes: number): Promise<boolean> {
    const date = lagosDateString(scheduledAt);
    const startTime = lagosTimeString(scheduledAt);
    const endTime = lagosTimeString(new Date(scheduledAt.getTime() + durationMinutes * 60_000));
    const blocks = await repo.findByConsultant(consultantId);
    // Postgres returns time as HH:MM:SS, so it is normalized to HH:MM before comparing.
    return blocks.some((b) => b.availableDate === date && b.startTime.slice(0, 5) <= startTime && endTime <= b.endTime.slice(0, 5));
  }
}

export const availabilityService = new AvailabilityService();
