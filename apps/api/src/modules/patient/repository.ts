import { db } from "../../db/index.js";
import { eq, sql, and, desc, inArray } from "drizzle-orm";
import {
  patient, patientAddress, emergencyContact, wallet, patientTimeline, patientRegistrationRequest,
} from "./schema.js";

// Data access for patients.
export class PatientRepository {
  // Finds a non-deleted patient by id.
  async findById(id: string) {
    const row = await db
      .select()
      .from(patient)
      .where(sql`${patient.id} = ${id} AND ${patient.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  // Finds a patient by their Unique Patient ID.
  async findByUniqueId(uniquePatientId: string) {
    const row = await db
      .select()
      .from(patient)
      .where(sql`${patient.uniquePatientId} = ${uniquePatientId} AND ${patient.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  // FR-01: finds an active patient with the same name, DOB and facility, matching names case-insensitively.
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

  // Finds the patient linked to a user account.
  async findByUserId(userId: string) {
    const row = await db
      .select()
      .from(patient)
      .where(sql`${patient.userId} = ${userId} AND ${patient.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  // Lists a facility's patients.
  async findByFacility(facilityId: string) {
    return db
      .select()
      .from(patient)
      .where(and(eq(patient.facilityId, facilityId), eq(patient.isDeleted, false)));
  }

  // Takes the authorization-narrowed facility set and fetches in one query instead of one per facility.
  async findByFacilityIds(facilityIds: string[]) {
    return db
      .select()
      .from(patient)
      .where(and(inArray(patient.facilityId, facilityIds), eq(patient.isDeleted, false)));
  }

  // Cross-facility search for pickers such as linking an inquiry, under the same patient:read gate.
  async findAll() {
    return db.select().from(patient).where(eq(patient.isDeleted, false));
  }

  // Inserts a patient.
  async create(data: typeof patient.$inferInsert) {
    const row = await db.insert(patient).values(data).returning();
    return row[0]!;
  }

  // Updates a patient.
  async update(id: string, data: Partial<typeof patient.$inferInsert>) {
    const row = await db
      .update(patient)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(patient.id, id), eq(patient.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }

  // Soft-deletes a patient.
  async softDelete(id: string) {
    await db
      .update(patient)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(patient.id, id));
  }
}

// Data access for patient addresses.
export class AddressRepository {
  // Lists a patient's addresses.
  async findByPatient(patientId: string) {
    return db
      .select()
      .from(patientAddress)
      .where(and(eq(patientAddress.patientId, patientId), eq(patientAddress.isDeleted, false)));
  }

  // Inserts an address.
  async create(data: typeof patientAddress.$inferInsert) {
    const row = await db.insert(patientAddress).values(data).returning();
    return row[0]!;
  }

  // Soft-deletes an address.
  async softDelete(id: string) {
    await db
      .update(patientAddress)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(patientAddress.id, id));
  }
}

// Data access for emergency contacts.
export class EmergencyContactRepository {
  // Lists a patient's emergency contacts.
  async findByPatient(patientId: string) {
    return db
      .select()
      .from(emergencyContact)
      .where(and(eq(emergencyContact.patientId, patientId), eq(emergencyContact.isDeleted, false)));
  }

  // Inserts an emergency contact.
  async create(data: typeof emergencyContact.$inferInsert) {
    const row = await db.insert(emergencyContact).values(data).returning();
    return row[0]!;
  }

  // Soft-deletes an emergency contact.
  async softDelete(id: string) {
    await db
      .update(emergencyContact)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(emergencyContact.id, id));
  }
}

// Data access for wallets.
export class WalletRepository {
  // Finds a patient's wallet.
  async findByPatient(patientId: string) {
    const row = await db
      .select()
      .from(wallet)
      .where(eq(wallet.patientId, patientId))
      .limit(1);
    return row[0] ?? null;
  }

  // Inserts a wallet.
  async create(data: typeof wallet.$inferInsert) {
    const row = await db.insert(wallet).values(data).returning();
    return row[0]!;
  }

  // Turns the patient's automatic wallet deduction on or off.
  async setAutoDeduct(id: string, enabled: boolean) {
    const row = await db
      .update(wallet)
      .set({ autoDeductEnabled: enabled, updatedAt: new Date() })
      .where(eq(wallet.id, id))
      .returning();
    return row[0]!;
  }

  // Sets a wallet's balance.
  async updateBalance(id: string, balanceKobo: bigint) {
    const row = await db
      .update(wallet)
      .set({ balanceKobo, updatedAt: new Date() })
      .where(eq(wallet.id, id))
      .returning();
    return row[0]!;
  }
}

// Data access for the patient timeline.
export class PatientTimelineRepository {
  // Lists a patient's timeline entries.
  async findByPatient(patientId: string) {
    return db
      .select()
      .from(patientTimeline)
      .where(eq(patientTimeline.patientId, patientId))
      .orderBy(patientTimeline.createdAt);
  }

  // Inserts a timeline entry.
  async create(data: typeof patientTimeline.$inferInsert) {
    const row = await db.insert(patientTimeline).values(data).returning();
    return row[0]!;
  }
}

// Data access for patient registration requests.
export class PatientRegistrationRequestRepository {
  // Inserts a registration request.
  async create(data: typeof patientRegistrationRequest.$inferInsert) {
    const row = await db.insert(patientRegistrationRequest).values(data).returning();
    return row[0]!;
  }

  // Finds a user's registration request.
  async findByUserId(userId: string) {
    const row = await db
      .select()
      .from(patientRegistrationRequest)
      .where(eq(patientRegistrationRequest.userId, userId))
      .limit(1);
    return row[0] ?? null;
  }

  // Every remaining row is pending by construction; the controller adds emails rather than this module importing auth's schema for a join.
  async findAllPending() {
    return db
      .select()
      .from(patientRegistrationRequest)
      .orderBy(desc(patientRegistrationRequest.createdAt));
  }

  // Deletes a user's registration request.
  async deleteByUserId(userId: string) {
    await db.delete(patientRegistrationRequest).where(eq(patientRegistrationRequest.userId, userId));
  }
}
