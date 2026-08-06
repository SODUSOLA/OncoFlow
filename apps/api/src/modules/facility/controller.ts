import type { Request, Response } from "express";
import { FacilityRepository } from "./repository.js";
import { Facility } from "./entities/Facility.js";

const facilityRepo = new FacilityRepository();

// Reference/lookup data, not patient data — needed pre-login by the registration wizard's
// facility picker, same reasoning as GET /classifications being opened up to any authenticated
// user (billing/routes.ts). Only ACTIVE facilities and only the fields a picker needs.
export async function listFacilitiesHandler(_req: Request, res: Response) {
  try {
    const rows = await facilityRepo.findAll();
    const active = rows.filter((row) => row.status === "ACTIVE");
    res.json({ facilities: active.map((row) => new Facility(row).toJSON()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
