import { db } from "../db/index.js";
import crypto from "node:crypto";
import { facility, patient, patientAddress, emergencyContact, wallet, patientTimeline } from "../db/schema.js";

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

  for (const [i, p] of PATIENTS.entries()) {
    const patId = crypto.randomUUID();
    const facId = facilities[i % facilities.length]!.id;

    await db.insert(patient).values({
      id: patId,
      uniquePatientId: `OC-${String(i + 1).padStart(5, "0")}`,
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

  console.log(`Seeded ${PATIENTS.length} patients with addresses, contacts, wallets`);
}

// Run directly: npx tsx src/seed/patient.ts
seedPatients().catch(console.error);
