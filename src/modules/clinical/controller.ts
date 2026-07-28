import type { Request, Response } from "express";
import { CountdownCaseRepository } from "./repository";
import { CountdownCase } from "./entities/CountdownCase";

const caseRepo = new CountdownCaseRepository();

export async function listCountdownCasesHandler(_req: Request, res: Response) {
  try {
    const rows = await caseRepo.findActive();
    res.json({ cases: rows.map((r) => new CountdownCase(r).toJSON()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
