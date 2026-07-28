import { db } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { appointment, appointmentParticipant } from "./schema";
import type { AppointmentStatus } from "./entities/Appointment";

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
