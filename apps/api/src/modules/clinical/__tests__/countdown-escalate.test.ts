import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient } from "../../patient/schema.js";
import { user, role, userRole } from "../../auth/schema.js";
import { notification } from "../../notification/schema.js";
import { countdownCase } from "../schema.js";

const app = createApp();

let caseId: string;
let qaHere: string;
let qaElsewhere: string;

async function makeQaOfficer(facilityId: string | null): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, email: `qa-esc-${id}@test.com`, passwordHash: "test", facilityId });
  const [qaRole] = await db.select().from(role).where(eq(role.name, "QUALITY_ASSURANCE_OFFICER"));
  await db.insert(userRole).values({ userId: id, roleId: qaRole!.id });
  return id;
}

beforeAll(async () => {
  const [fac] = await db.insert(facility).values({ id: crypto.randomUUID(), name: "Escalate Fac", region: "Lagos", address: "E St", status: "ACTIVE" }).returning();
  const [otherFac] = await db.insert(facility).values({ id: crypto.randomUUID(), name: "Escalate Other Fac", region: "Lagos", address: "E St", status: "ACTIVE" }).returning();
  const [pat] = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "ESC-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Esc", lastName: "Patient", dob: "1990-01-01", gender: "Female",
    phone: "+2348012345600", email: `esc.${crypto.randomUUID().slice(0, 6)}@test.com`, facilityId: fac!.id, status: "ACTIVE",
  }).returning();
  const [c] = await db.insert(countdownCase).values({ id: crypto.randomUUID(), patientId: pat!.id, currentDay: 3, status: "ACTIVE" }).returning();
  caseId = c!.id;
  qaHere = await makeQaOfficer(fac!.id);
  qaElsewhere = await makeQaOfficer(otherFac!.id);
});

describe("POST /countdown-cases/:id/escalate", () => {
  it("notifies the QA officers of the patient's facility only", async () => {
    const res = await request(app).post(`/countdown-cases/${caseId}/escalate`);
    expect(res.status).toBe(200);
    expect(res.body.notified).toBeGreaterThanOrEqual(1);

    const here = await db.select().from(notification).where(eq(notification.recipientId, qaHere));
    expect(here.map((n) => n.type)).toContain("COUNTDOWN_ESCALATION");
    const elsewhere = await db.select().from(notification).where(eq(notification.recipientId, qaElsewhere));
    expect(elsewhere).toHaveLength(0);
  });

  it("does not change the case itself", async () => {
    const [row] = await db.select().from(countdownCase).where(eq(countdownCase.id, caseId));
    expect(row!.status).toBe("ACTIVE");
    expect(row!.currentDay).toBe(3);
  });

  it("404s for an unknown case", async () => {
    const res = await request(app).post(`/countdown-cases/${crypto.randomUUID()}/escalate`);
    expect(res.status).toBe(404);
  });
});
