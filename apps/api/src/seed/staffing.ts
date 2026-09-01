import { db } from "../db/index.js";
import { sql, and, eq } from "drizzle-orm";
import crypto from "node:crypto";
import { facility, shiftRequirement } from "../db/schema.js";

// Standing per-facility nurse staffing policy — weekday 0=Mon .. 6=Sun. Judgment call, no
// product spec for exact headcounts: weekdays need more coverage than weekends, matching
// typical outpatient oncology clinic patterns (heavier Mon/Wed/Fri per FR-20's chemo/virtual
// day split).
const WEEKDAY_REQUIRED_COUNTS = [3, 2, 3, 2, 3, 1, 0]; // Mon Tue Wed Thu Fri Sat Sun

export async function seedStaffing() {
  const facilities = await db.select().from(facility).where(sql`${facility.isDeleted} = false`);

  for (const f of facilities) {
    for (let weekday = 0; weekday < 7; weekday++) {
      const existing = await db.select().from(shiftRequirement)
        .where(and(eq(shiftRequirement.facilityId, f.id), eq(shiftRequirement.weekday, weekday)))
        .limit(1);
      if (existing.length > 0) continue;

      await db.insert(shiftRequirement).values({
        id: crypto.randomUUID(),
        facilityId: f.id,
        weekday,
        requiredCount: WEEKDAY_REQUIRED_COUNTS[weekday]!,
      });
    }
    console.log(`  Seeded shift requirements for ${f.name}`);
  }

  console.log("Staffing seed complete.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedStaffing().catch(console.error);
}
