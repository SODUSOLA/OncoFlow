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
