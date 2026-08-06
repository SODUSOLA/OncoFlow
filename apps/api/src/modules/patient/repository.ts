import { db } from "../../db/index.js";
import { eq, sql, and, desc } from "drizzle-orm";
import {
  patient, patientAddress, emergencyContact, wallet, patientTimeline, patientRegistrationRequest,
} from "./schema.js";

export class PatientRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(patient)
      .where(sql`${patient.id} = ${id} AND ${patient.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findByUniqueId(uniquePatientId: string) {
    const row = await db
      .select()
      .from(patient)
      .where(sql`${patient.uniquePatientId} = ${uniquePatientId} AND ${patient.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  // FR-01: reject a second active ID for a matched patient (name+DOB+facility). Case-insensitive
  // on name since "Jane"/"jane" typed at two different registration times is still one person.
  async findPotentialDuplicate(firstName: string, lastName: string, dob: string, facilityId: string) {
    const row = await db
      .select()
      .from(patient)
      .where(sql`
        lower(${patient.firstName}) = lower(${firstName})
        AND lower(${patient.lastName}) = lower(${lastName})
        AND ${patient.dob} = ${dob}
        AND ${patient.facilityId} = ${facilityId}
        AND ${patient.isDeleted} = false
      `)
      .limit(1);
    return row[0] ?? null;
  }

  async findByUserId(userId: string) {
    const row = await db
      .select()
      .from(patient)
      .where(sql`${patient.userId} = ${userId} AND ${patient.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findByFacility(facilityId: string) {
    return db
      .select()
      .from(patient)
      .where(and(eq(patient.facilityId, facilityId), eq(patient.isDeleted, false)));
  }

  // Cross-facility search (e.g. Regional Admin linking a public inquiry to an existing
  // patient, or the invoice generator's patient picker) — same permission gate as
  // findByFacility (patient:read), just not scoped to one facility.
  async findAll() {
    return db.select().from(patient).where(eq(patient.isDeleted, false));
  }

  async create(data: typeof patient.$inferInsert) {
    const row = await db.insert(patient).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof patient.$inferInsert>) {
    const row = await db
      .update(patient)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(patient.id, id), eq(patient.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }

  async softDelete(id: string) {
    await db
      .update(patient)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(patient.id, id));
  }
}

export class AddressRepository {
  async findByPatient(patientId: string) {
    return db
      .select()
      .from(patientAddress)
      .where(and(eq(patientAddress.patientId, patientId), eq(patientAddress.isDeleted, false)));
  }

  async create(data: typeof patientAddress.$inferInsert) {
    const row = await db.insert(patientAddress).values(data).returning();
    return row[0]!;
  }

  async softDelete(id: string) {
    await db
      .update(patientAddress)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(patientAddress.id, id));
  }
}

export class EmergencyContactRepository {
  async findByPatient(patientId: string) {
    return db
      .select()
      .from(emergencyContact)
      .where(and(eq(emergencyContact.patientId, patientId), eq(emergencyContact.isDeleted, false)));
  }

  async create(data: typeof emergencyContact.$inferInsert) {
    const row = await db.insert(emergencyContact).values(data).returning();
    return row[0]!;
  }

  async softDelete(id: string) {
    await db
      .update(emergencyContact)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(emergencyContact.id, id));
  }
}

export class WalletRepository {
  async findByPatient(patientId: string) {
    const row = await db
      .select()
      .from(wallet)
      .where(eq(wallet.patientId, patientId))
      .limit(1);
    return row[0] ?? null;
  }

  async create(data: typeof wallet.$inferInsert) {
    const row = await db.insert(wallet).values(data).returning();
    return row[0]!;
  }

  async updateBalance(id: string, balanceKobo: bigint) {
    const row = await db
      .update(wallet)
      .set({ balanceKobo, updatedAt: new Date() })
      .where(eq(wallet.id, id))
      .returning();
    return row[0]!;
  }
}

export class PatientTimelineRepository {
  async findByPatient(patientId: string) {
    return db
      .select()
      .from(patientTimeline)
      .where(eq(patientTimeline.patientId, patientId))
      .orderBy(patientTimeline.createdAt);
  }

  async create(data: typeof patientTimeline.$inferInsert) {
    const row = await db.insert(patientTimeline).values(data).returning();
    return row[0]!;
  }
}

export class PatientRegistrationRequestRepository {
  async create(data: typeof patientRegistrationRequest.$inferInsert) {
    const row = await db.insert(patientRegistrationRequest).values(data).returning();
    return row[0]!;
  }

  async findByUserId(userId: string) {
    const row = await db
      .select()
      .from(patientRegistrationRequest)
      .where(eq(patientRegistrationRequest.userId, userId))
      .limit(1);
    return row[0] ?? null;
  }

  // Every remaining row here IS pending, by construction — approval deletes the row
  // (see PatientService.registerPatient), so there's no separate status to filter on.
  // Returns request rows only — the caller (controller) enriches each with the user's email
  // via UserRepository, rather than this repository importing auth/schema.ts directly for a
  // SQL join (forbidden cross-module schema import, .dependency-cruiser.js).
  async findAllPending() {
    return db
      .select()
      .from(patientRegistrationRequest)
      .orderBy(desc(patientRegistrationRequest.createdAt));
  }

  async deleteByUserId(userId: string) {
    await db.delete(patientRegistrationRequest).where(eq(patientRegistrationRequest.userId, userId));
  }
}
