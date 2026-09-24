import type { Request, Response } from "express";
import { FacilityRepository } from "./repository.js";
import { Facility } from "./entities/Facility.js";

const facilityRepo = new FacilityRepository();

// Reference data needed before login by the registration facility picker, so it returns only ACTIVE facilities and the fields a picker needs.
export async function listFacilitiesHandler(_req: Request, res: Response) {
  try {
    const rows = await facilityRepo.findAll();
    const active = rows.filter((row) => row.status === "ACTIVE");
    res.json({ facilities: active.map((row) => new Facility(row).toJSON()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// The QA officer assigned to a facility — the nursing documentation form shows this in place of a
// free-typed "Managing Consultant" name, so it can be looked up (and previewed) before the nurse submits.
export async function getFacilityQaOfficerHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const officer = await facilityRepo.findQaOfficer(String(id));
    const qaOfficer = officer && {
      id: officer.id, email: officer.email,
      fullName: officer.firstName || officer.lastName
        ? [officer.firstName, officer.lastName].filter(Boolean).join(" ")
        : officer.email.split("@")[0]!,
    };
    res.json({ qaOfficer });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
