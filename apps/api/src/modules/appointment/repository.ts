import { db } from "../../db/index.js";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { appointment, appointmentParticipant, transferRequest } from "./schema.js";
import type { AppointmentStatus } from "./entities/Appointment.js";
// Cross-module read: the confirmation queue joins PENDING appointments with PAID invoices, which no single module owns.
import { invoice } from "../billing/schema.js";

// Formats a timestamp as its Africa/Lagos calendar date (YYYY-MM-DD).
function lagosDateString(timestamp: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(timestamp);
}

// Data access for appointments.
export class AppointmentRepository {
  // Finds one non-deleted appointment by id.
  async findById(id: string) {
    const row = await db
      .select()
      .from(appointment)
      .where(sql`${appointment.id} = ${id} AND ${appointment.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  // Lists a patient's appointments.
  async findByPatient(patientId: string) {
    return db
      .select()
      .from(appointment)
      .where(and(eq(appointment.patientId, patientId), eq(appointment.isDeleted, false)))
      .orderBy(appointment.scheduledAt);
  }

  // Lists a facility's appointments.
  async findByFacility(facilityId: string) {
    return db
      .select()
      .from(appointment)
      .where(and(eq(appointment.facilityId, facilityId), eq(appointment.isDeleted, false)))
      .orderBy(appointment.scheduledAt);
  }

  // facilityIds is the authorization-narrowed set; an empty array legitimately yields no results.
  async findAll(filters?: {
    patientId?: string; facilityId?: string; facilityIds?: string[]; status?: AppointmentStatus;
  }) {
    const conditions = [eq(appointment.isDeleted, false)];
    if (filters?.patientId) conditions.push(eq(appointment.patientId, filters.patientId));
    if (filters?.facilityId) conditions.push(eq(appointment.facilityId, filters.facilityId));
    if (filters?.facilityIds) conditions.push(inArray(appointment.facilityId, filters.facilityIds));
    if (filters?.status) conditions.push(eq(appointment.status, filters.status));
    return db.select().from(appointment).where(and(...conditions)).orderBy(appointment.scheduledAt);
  }

  // Inserts an appointment.
  async create(data: typeof appointment.$inferInsert) {
    const row = await db.insert(appointment).values(data).returning();
    return row[0]!;
  }

  // Updates an appointment's fields.
  async update(id: string, data: Partial<typeof appointment.$inferInsert>) {
    const row = await db
      .update(appointment)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(appointment.id, id), eq(appointment.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }

  // Soft-deletes an appointment.
  async softDelete(id: string) {
    const row = await db
      .update(appointment)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(appointment.id, id))
      .returning();
    return row[0] ?? null;
  }

  // PAID-but-PENDING appointments for today (Lagos), matched by date string in application code since per-facility per-day row counts are small.
  async findPendingConfirmationQueue(facilityIds?: string[]) {
    const conditions = [
      eq(appointment.status, "PENDING"),
      eq(appointment.isDeleted, false),
      eq(invoice.status, "PAID"),
    ];
    if (facilityIds) conditions.push(inArray(appointment.facilityId, facilityIds));

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

// Data access for appointment participants.
export class AppointmentParticipantRepository {
  // Lists the participants of an appointment.
  async findByAppointment(appointmentId: string) {
    return db
      .select()
      .from(appointmentParticipant)
      .where(eq(appointmentParticipant.appointmentId, appointmentId));
  }

  // Adds a participant row.
  async create(data: typeof appointmentParticipant.$inferInsert) {
    const row = await db.insert(appointmentParticipant).values(data).returning();
    return row[0]!;
  }

  // Removes a participant row.
  async remove(id: string) {
    await db.delete(appointmentParticipant).where(eq(appointmentParticipant.id, id));
  }
}

// Transfer requests are scoped to origin OR destination facility so a Regional Admin also sees transfers into their region.
export class TransferRequestRepository {
  // Inserts a transfer request.
  async create(data: typeof transferRequest.$inferInsert) {
    const row = await db.insert(transferRequest).values(data).returning();
    return row[0]!;
  }

  // Lists transfer requests touching any of the given facilities.
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
