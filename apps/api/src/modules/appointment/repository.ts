import { db } from "../../db/index.js";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { appointment, appointmentParticipant, transferRequest } from "./schema.js";
import type { AppointmentStatus } from "./entities/Appointment.js";
// Cross-module read (same pattern as other modules' PatientRepository/FileRepository imports)
// — the pending-confirmation queue is inherently a join between "appointment is still PENDING"
// and "its invoice is already PAID," which no single module owns on its own.
import { invoice } from "../billing/schema.js";

function lagosDateString(timestamp: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(timestamp);
}

export class AppointmentRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(appointment)
      .where(sql`${appointment.id} = ${id} AND ${appointment.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findByPatient(patientId: string) {
    return db
      .select()
      .from(appointment)
      .where(and(eq(appointment.patientId, patientId), eq(appointment.isDeleted, false)))
      .orderBy(appointment.scheduledAt);
  }

  async findByFacility(facilityId: string) {
    return db
      .select()
      .from(appointment)
      .where(and(eq(appointment.facilityId, facilityId), eq(appointment.isDeleted, false)))
      .orderBy(appointment.scheduledAt);
  }

  async findAll(filters?: { patientId?: string; facilityId?: string; status?: AppointmentStatus }) {
    const conditions = [eq(appointment.isDeleted, false)];
    if (filters?.patientId) conditions.push(eq(appointment.patientId, filters.patientId));
    if (filters?.facilityId) conditions.push(eq(appointment.facilityId, filters.facilityId));
    if (filters?.status) conditions.push(eq(appointment.status, filters.status));
    return db.select().from(appointment).where(and(...conditions)).orderBy(appointment.scheduledAt);
  }

  async create(data: typeof appointment.$inferInsert) {
    const row = await db.insert(appointment).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof appointment.$inferInsert>) {
    const row = await db
      .update(appointment)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(appointment.id, id), eq(appointment.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }

  async softDelete(id: string) {
    const row = await db
      .update(appointment)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(appointment.id, id))
      .returning();
    return row[0] ?? null;
  }

  // Appointments paid for (invoice PAID) before the 2PM Lagos cutoff, still awaiting a staff
  // member's same-day confirmation — the admin-facing queue this feeds. Day-matching happens
  // in application code (Lagos calendar-day string comparison) rather than a timezone-aware SQL
  // clause — row counts here are small (per-facility, per-day), same trade-off the rest of this
  // repository already makes (plain filters, no raw SQL) elsewhere.
  async findPendingConfirmationQueue(facilityId?: string) {
    const conditions = [
      eq(appointment.status, "PENDING"),
      eq(appointment.isDeleted, false),
      eq(invoice.status, "PAID"),
    ];
    if (facilityId) conditions.push(eq(appointment.facilityId, facilityId));

    const rows = await db
      .select({ appointment })
      .from(appointment)
      .innerJoin(invoice, eq(invoice.appointmentId, appointment.id))
      .where(and(...conditions))
      .orderBy(appointment.scheduledAt);

    const today = lagosDateString(new Date());
    return rows.map((r) => r.appointment).filter((a) => lagosDateString(a.scheduledAt) === today);
  }
}

export class AppointmentParticipantRepository {
  async findByAppointment(appointmentId: string) {
    return db
      .select()
      .from(appointmentParticipant)
      .where(eq(appointmentParticipant.appointmentId, appointmentId));
  }

  async create(data: typeof appointmentParticipant.$inferInsert) {
    const row = await db.insert(appointmentParticipant).values(data).returning();
    return row[0]!;
  }

  async remove(id: string) {
    await db.delete(appointmentParticipant).where(eq(appointmentParticipant.id, id));
  }
}

// Scoped to "either the origin or destination facility is in the region" per
// 21-regional-admin-scope-definition.md's own framing of TransferRequest's region scope,
// not just the origin (a Regional Admin should see a transfer routing a patient into their
// region too, not only ones leaving it).
export class TransferRequestRepository {
  async create(data: typeof transferRequest.$inferInsert) {
    const row = await db.insert(transferRequest).values(data).returning();
    return row[0]!;
  }

  async findByFacilityIds(facilityIds: string[]) {
    if (facilityIds.length === 0) return [];
    return db
      .select()
      .from(transferRequest)
      .where(and(
        or(inArray(transferRequest.fromFacilityId, facilityIds), inArray(transferRequest.toFacilityId, facilityIds)),
        eq(transferRequest.isDeleted, false),
      ))
      .orderBy(sql`${transferRequest.createdAt} desc`);
  }
}
