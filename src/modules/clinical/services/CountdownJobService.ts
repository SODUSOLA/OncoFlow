import { CountdownCaseRepository } from "../repository.js";
import { CountdownCase } from "../entities/CountdownCase.js";

const caseRepo = new CountdownCaseRepository();

export class CountdownJobService {
  async decrementActiveCases() {
    const active = await caseRepo.findActive();
    const results: { id: string; day: number; escalated: boolean }[] = [];

    for (const row of active) {
      const entity = new CountdownCase(row);
      const next = entity.decrementDay();
      const reminded = next.markReminded();
      await caseRepo.update(row.id, {
        currentDay: next.currentDay,
        status: next.status,
        reminderSentAt: reminded.reminderSentAt,
      });

      results.push({
        id: row.id,
        day: next.currentDay,
        escalated: next.status === "ESCALATED",
      });
    }

    return results;
  }
}
