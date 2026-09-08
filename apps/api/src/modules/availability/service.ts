import crypto from "node:crypto";
import { AvailabilityRepository } from "./repository.js";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { db } from "../../db/index.js";
import { sql } from "drizzle-orm";
import { notificationService } from "../notification/index.js";

const repo = new AvailabilityRepository();

// Same "what day/time does this actually fall on" framing appointment/repository.ts already
// uses (lagosDateString) — availability blocks are meaningless if they're compared against a
// different timezone than the scheduling flow that reads them.
function lagosDateString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function lagosTimeString(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

// §1 — "Admin notification on availability change": in-app to every REGIONAL_ADMIN in the
// consultant's own region (same region-resolution rule facility-scope.ts uses everywhere else
// in this codebase — a Regional Admin's remit is their region, not one facility).
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

export class AvailabilityService {
  async addBlock(consultantId: string, availableDate: string, startTime: string, endTime: string) {
    if (startTime >= endTime) {
      throw new Error("startTime must be before endTime");
    }
    const row = await repo.create({ id: crypto.randomUUID(), consultantId, availableDate, startTime, endTime });
    void notifyAdminsOfAvailabilityChange(consultantId);
    return row;
  }

  async listForConsultant(consultantId: string) {
    return repo.findByConsultant(consultantId);
  }

  async removeBlock(id: string, callerId: string) {
    const row = await repo.findById(id);
    if (!row) throw new NotFoundError("Availability block not found");
    if (row.consultantId !== callerId) throw new ForbiddenError("You can only remove your own availability");
    await repo.remove(id);
    void notifyAdminsOfAvailabilityChange(callerId);
  }

  // §2 — the server-side scheduling constraint: does `scheduledAt` (+ its duration) fall
  // entirely inside one of this consultant's availability blocks for that Lagos-local date?
  async isWithinAvailability(consultantId: string, scheduledAt: Date, durationMinutes: number): Promise<boolean> {
    const date = lagosDateString(scheduledAt);
    const startTime = lagosTimeString(scheduledAt);
    const endTime = lagosTimeString(new Date(scheduledAt.getTime() + durationMinutes * 60_000));
    const blocks = await repo.findByConsultant(consultantId);
    // Postgres returns `time` columns as "HH:MM:SS" — normalize to "HH:MM" before comparing
    // against the "HH:MM" strings computed above, rather than relying on string-prefix ordering.
    return blocks.some((b) => b.availableDate === date && b.startTime.slice(0, 5) <= startTime && endTime <= b.endTime.slice(0, 5));
  }
}

export const availabilityService = new AvailabilityService();
