import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { PatientService } from "../service.js";
import {
  PatientRepository, AddressRepository, EmergencyContactRepository, WalletRepository,
} from "../repository.js";
import { db } from "../../../db/index.js";
import { patient, patientAddress, emergencyContact, wallet } from "../schema.js";
import { facility } from "../../facility/schema.js";

const patientSvc = new PatientService();
const patientRepo = new PatientRepository();
const addressRepo = new AddressRepository();
const contactRepo = new EmergencyContactRepository();
const walletRepo = new WalletRepository();

async function createFacility() {
  const rows = await db.insert(facility).values({
    id: crypto.randomUUID(),
    name: "Test Facility",
    region: "Lagos",
    address: "Test Address",
    status: "ACTIVE",
  }).returning();
  return rows[0]!;
}

describe("PatientService — registerPatient", () => {
  it("creates patient and wallet with 0 balance", async () => {
    const fac = await createFacility();
    const result = await patientSvc.registerPatient({
      uniquePatientId: "OC-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      firstName: "Chidi",
      lastName: "Okonkwo",
      dob: "1985-03-15",
      gender: "Male",
      phone: "+2348012345678",
      email: "chidi." + crypto.randomUUID().slice(0, 4) + "@example.com",
      facilityId: fac.id,
    });

    expect(result.patient).toBeDefined();
    expect(result.patient.fullName).toBe("Chidi Okonkwo");
    expect(result.wallet).toBeDefined();
    expect(result.wallet.balanceKobo).toBe(0n);
  });

  it("rejects duplicate uniquePatientId", async () => {
    const fac = await createFacility();
    const uid = "DUP-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    await patientSvc.registerPatient({
      uniquePatientId: uid,
      firstName: "First",
      lastName: "Patient",
      dob: "1990-01-01",
      gender: "Female",
      phone: "+2348011111111",
      email: "first." + crypto.randomUUID().slice(0, 4) + "@example.com",
      facilityId: fac.id,
    });

    await expect(
      patientSvc.registerPatient({
        uniquePatientId: uid,
        firstName: "Second",
        lastName: "Patient",
        dob: "1990-01-01",
        gender: "Female",
        phone: "+2348022222222",
        email: "second." + crypto.randomUUID().slice(0, 4) + "@example.com",
        facilityId: fac.id,
      }),
    ).rejects.toThrow("Patient with this ID already exists");
  });

  it("rejects a second active ID for the same person (name+DOB+facility) — FR-01", async () => {
    const fac = await createFacility();
    await patientSvc.registerPatient({
      uniquePatientId: "OC-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      firstName: "Ngozi",
      lastName: "Adeyemi",
      dob: "1992-07-04",
      gender: "Female",
      phone: "+2348033333333",
      email: "ngozi." + crypto.randomUUID().slice(0, 4) + "@example.com",
      facilityId: fac.id,
    });

    await expect(
      patientSvc.registerPatient({
        uniquePatientId: "OC-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
        firstName: "ngozi", // case-insensitive match on purpose
        lastName: "ADEYEMI",
        dob: "1992-07-04",
        gender: "Female",
        phone: "+2348044444444",
        email: "ngozi2." + crypto.randomUUID().slice(0, 4) + "@example.com",
        facilityId: fac.id,
      }),
    ).rejects.toThrow("It looks like you may already have an account");
  });

  it("allows the same name+DOB at a different facility (no cross-facility false positive)", async () => {
    const facA = await createFacility();
    const facB = await createFacility();
    await patientSvc.registerPatient({
      uniquePatientId: "OC-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      firstName: "Tunde",
      lastName: "Bello",
      dob: "1988-11-20",
      gender: "Male",
      phone: "+2348055555555",
      email: "tunde." + crypto.randomUUID().slice(0, 4) + "@example.com",
      facilityId: facA.id,
    });

    const second = await patientSvc.registerPatient({
      uniquePatientId: "OC-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      firstName: "Tunde",
      lastName: "Bello",
      dob: "1988-11-20",
      gender: "Male",
      phone: "+2348066666666",
      email: "tunde2." + crypto.randomUUID().slice(0, 4) + "@example.com",
      facilityId: facB.id,
    });
    expect(second.patient).toBeDefined();
  });
});

describe("PatientRepository — CRUD", () => {
  it("finds patient by uniquePatientId", async () => {
    const fac = await createFacility();
    const id = crypto.randomUUID();
    const uid = "FIND-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    await db.insert(patient).values({
      id,
      uniquePatientId: uid,
      firstName: "Find",
      lastName: "Me",
      dob: "2000-06-01",
      gender: "Male",
      phone: "+2348099999999",
      email: "find." + crypto.randomUUID().slice(0, 4) + "@example.com",
      facilityId: fac.id,
      status: "ACTIVE",
    });

    const found = await patientRepo.findByUniqueId(uid);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(id);
  });

  it("soft-deletes a patient", async () => {
    const fac = await createFacility();
    const id = crypto.randomUUID();
    await db.insert(patient).values({
      id,
      uniquePatientId: "DEL-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      firstName: "Delete",
      lastName: "Patient",
      dob: "1975-12-25",
      gender: "Female",
      phone: "+2348077777777",
      email: "delete." + crypto.randomUUID().slice(0, 4) + "@example.com",
      facilityId: fac.id,
      status: "ACTIVE",
    });

    await patientRepo.softDelete(id);
    const found = await patientRepo.findById(id);
    expect(found).toBeNull();
  });
});

describe("AddressRepository", () => {
  it("creates and retrieves addresses for a patient", async () => {
    const fac = await createFacility();
    const patientId = crypto.randomUUID();
    await db.insert(patient).values({
      id: patientId,
      uniquePatientId: "ADDR-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      firstName: "Address",
      lastName: "Test",
      dob: "1980-01-01",
      gender: "Male",
      phone: "+2348012340000",
      email: "addr." + crypto.randomUUID().slice(0, 4) + "@example.com",
      facilityId: fac.id,
      status: "ACTIVE",
    });

    await addressRepo.create({
      id: crypto.randomUUID(),
      patientId,
      country: "Nigeria",
      state: "Lagos",
      city: "Ikeja",
      address: "123 Test Ave",
    });

    const addresses = await addressRepo.findByPatient(patientId);
    expect(addresses).toHaveLength(1);
    expect(addresses[0]!.city).toBe("Ikeja");
  });
});

describe("EmergencyContactRepository", () => {
  it("creates and retrieves emergency contacts", async () => {
    const fac = await createFacility();
    const patientId = crypto.randomUUID();
    await db.insert(patient).values({
      id: patientId,
      uniquePatientId: "EC-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      firstName: "EC",
      lastName: "Test",
      dob: "1995-05-05",
      gender: "Female",
      phone: "+2348055555555",
      email: "ec." + crypto.randomUUID().slice(0, 4) + "@example.com",
      facilityId: fac.id,
      status: "ACTIVE",
    });

    await contactRepo.create({
      id: crypto.randomUUID(),
      patientId,
      name: "Mother",
      relationship: "Parent",
      phone: "+2348066666666",
    });

    const contacts = await contactRepo.findByPatient(patientId);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.name).toBe("Mother");
  });
});

describe("WalletRepository", () => {
  it("updates wallet balance", async () => {
    const fac = await createFacility();
    const pid = crypto.randomUUID();
    await db.insert(patient).values({
      id: pid,
      uniquePatientId: "WAL-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      firstName: "Wallet",
      lastName: "Test",
      dob: "1970-01-01",
      gender: "Male",
      phone: "+2348098765432",
      email: "wal." + crypto.randomUUID().slice(0, 4) + "@example.com",
      facilityId: fac.id,
      status: "ACTIVE",
    });

    const w = await walletRepo.create({
      id: crypto.randomUUID(),
      patientId: pid,
      balanceKobo: 0n,
    });

    await walletRepo.updateBalance(w.id, 50000n);
    const updated = await walletRepo.findByPatient(pid);
    expect(updated!.balanceKobo).toBe(50000n);
  });
});
