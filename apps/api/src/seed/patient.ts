import { db } from "../db/index.js";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import {
  facility, patient, patientAddress, emergencyContact, wallet, patientTimeline, patientRegistrationRequest,
  user, userRole,
} from "../db/schema.js";
import { User } from "../modules/auth/index.js";

// Shared by every seeded patient login below (both the 5 linked accounts and the 2 pending
// registrations) — same convenience convention as demo-users.ts's staff DEMO_PASSWORD.
const PATIENT_PASSWORD = "PatientPass123!";

const PATIENTS = [
  {
    firstName: "Adebayo",
    lastName: "Ogunlesi",
    dob: "1978-04-12",
    gender: "Male",
    phone: "+2347012345001",
    email: "adebayo.ogunlesi@example.com",
    address: "15 Broad Street, Marina",
    city: "Lagos Island",
    state: "Lagos",
    emergencyName: "Folake Ogunlesi",
    emergencyRelationship: "Spouse",
    emergencyPhone: "+2347012345002",
  },
  {
    firstName: "Ngozi",
    lastName: "Eze",
    dob: "1985-09-23",
    gender: "Female",
    phone: "+2348023456001",
    email: "ngozi.eze@example.com",
    address: "42 Awolowo Road, Ikoyi",
    city: "Ikeja",
    state: "Lagos",
    emergencyName: "Chinedu Eze",
    emergencyRelationship: "Brother",
    emergencyPhone: "+2348023456002",
  },
  {
    firstName: "Ibrahim",
    lastName: "Suleiman",
    dob: "1965-11-08",
    gender: "Male",
    phone: "+2349034567001",
    email: "ibrahim.suleiman@example.com",
    address: "7 Sultan Road",
    city: "Kano Municipal",
    state: "Kano",
    emergencyName: "Aisha Suleiman",
    emergencyRelationship: "Spouse",
    emergencyPhone: "+2349034567002",
  },
  {
    firstName: "Chimamanda",
    lastName: "Adichie-Nwosu",
    dob: "1992-07-15",
    gender: "Female",
    phone: "+2347045678001",
    email: "chimamanda.adichie@example.com",
    address: "88 Independence Avenue, Central District",
    city: "Abuja",
    state: "FCT",
    emergencyName: "Kenechukwu Nwosu",
    emergencyRelationship: "Spouse",
    emergencyPhone: "+2347045678002",
  },
  {
    firstName: "Olusegun",
    lastName: "Adebayo",
    dob: "1959-02-28",
    gender: "Male",
    phone: "+2348056789001",
    email: "olusegun.adebayo@example.com",
    address: "23 Ring Road, Ugbowo",
    city: "Benin City",
    state: "Edo",
    emergencyName: "Yetunde Adebayo",
    emergencyRelationship: "Daughter",
    emergencyPhone: "+2348056789002",
  },
];

// Registered (real login, PATIENT role) but never approved — no `patient` row yet, so they
// show up in Regional Admin's "Registrations" tab (GET /patients/pending-registrations) out
// of the box, without needing to manually walk through the wizard first to see that screen work.
const PENDING_REGISTRATIONS = [
  {
    fullName: "Yewande Okafor",
    email: "yewande.okafor@example.com",
    dob: "1995-03-14",
    gender: "Female",
    phone: "+2348099998888",
  },
  {
    fullName: "Suleiman Bello",
    email: "suleiman.bello@example.com",
    dob: "1982-11-02",
    gender: "Male",
    phone: "+2348077776666",
  },
];

async function ensurePatientRoleId(): Promise<string> {
  const rows = await db.execute<{ id: string }>(sql`SELECT id FROM "role" WHERE name = 'PATIENT' LIMIT 1`);
  if (rows.length === 0) {
    throw new Error("PATIENT role not seeded — run seed/identity.ts first");
  }
  return rows[0]!.id;
}

async function createPatientLogin(email: string, patientRoleId: string): Promise<string> {
  const userId = crypto.randomUUID();
  const passwordHash = await User.hashPassword(PATIENT_PASSWORD);
  await db.insert(user).values({
    id: userId, email, passwordHash, status: "ACTIVE", mfaEnabled: false,
  });
  await db.insert(userRole).values({ id: crypto.randomUUID(), userId, roleId: patientRoleId });
  return userId;
}

export async function seedPatients() {
  const existing = await db.select().from(patient).limit(1);
  if (existing.length > 0) {
    console.log("Patients already seeded, skipping");
    return;
  }

  const facilities = await db.select().from(facility);
  if (facilities.length === 0) {
    console.log("No facilities found. Run seedFacilities first.");
    return;
  }

  const patientRoleId = await ensurePatientRoleId();

  for (const [i, p] of PATIENTS.entries()) {
    const patId = crypto.randomUUID();
    const facId = facilities[i % facilities.length]!.id;
    const userId = await createPatientLogin(p.email, patientRoleId);

    await db.insert(patient).values({
      id: patId,
      uniquePatientId: `OC-${String(i + 1).padStart(5, "0")}`,
      userId,
      firstName: p.firstName,
      lastName: p.lastName,
      dob: p.dob,
      gender: p.gender,
      phone: p.phone,
      email: p.email,
      facilityId: facId,
      status: "ACTIVE",
    });

    await db.insert(patientAddress).values({
      id: crypto.randomUUID(),
      patientId: patId,
      country: "Nigeria",
      state: p.state,
      city: p.city,
      address: p.address,
    });

    await db.insert(emergencyContact).values({
      id: crypto.randomUUID(),
      patientId: patId,
      name: p.emergencyName,
      relationship: p.emergencyRelationship,
      phone: p.emergencyPhone,
    });

    await db.insert(wallet).values({
      id: crypto.randomUUID(),
      patientId: patId,
      balanceKobo: 0n,
    });

    await db.insert(patientTimeline).values({
      id: crypto.randomUUID(),
      patientId: patId,
      eventType: "REGISTRATION",
      referenceId: patId,
    });
  }

  console.log(`Seeded ${PATIENTS.length} patients (with login accounts) + addresses, contacts, wallets`);

  for (const [i, r] of PENDING_REGISTRATIONS.entries()) {
    const userId = await createPatientLogin(r.email, patientRoleId);
    const preferredFacilityId = facilities[i % facilities.length]!.id;
    await db.insert(patientRegistrationRequest).values({
      id: crypto.randomUUID(),
      userId,
      email: r.email,
      fullName: r.fullName,
      gender: r.gender,
      dob: r.dob,
      phone: r.phone,
      preferredFacilityId,
    });
  }

  console.log(`Seeded ${PENDING_REGISTRATIONS.length} pending registrations awaiting Regional Admin approval`);
  console.log(`Password for all seeded patient logins: ${PATIENT_PASSWORD}`);
}

// Run directly: npx tsx src/seed/patient.ts — guarded so importing this from seed/index.ts
// doesn't also trigger a second, racing invocation (see identity.ts's own comment on this).
if (import.meta.url === `file://${process.argv[1]}`) {
  seedPatients().catch(console.error);
}
