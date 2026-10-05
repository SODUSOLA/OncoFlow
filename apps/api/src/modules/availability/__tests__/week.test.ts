import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { user, session } from "../../auth/schema.js";
import { consultantAvailability } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";

const app = createApp();

let userId: string;
let cookie: string;

// The Lagos calendar date `offset` days from today.
function day(offset: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + offset * 86_400_000));
}

const block = (offset: number, startTime = "09:00", endTime = "13:00") => ({ availableDate: day(offset), startTime, endTime });

async function activeDates(): Promise<string[]> {
  const rows = await db.select().from(consultantAvailability)
    .where(and(eq(consultantAvailability.consultantId, userId), isNull(consultantAvailability.deletedAt)));
  return rows.map((r) => r.availableDate).sort();
}

beforeAll(async () => {
  userId = crypto.randomUUID();
  await db.insert(user).values({ id: userId, email: `avail-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1", expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
});

describe("PUT /availability/week", () => {
  it("rejects fewer than 3 days and saves nothing", async () => {
    const res = await request(app).put("/availability/week").set("Cookie", cookie).send({ days: [block(0), block(1)] });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/at least 3/);
    expect(await activeDates()).toEqual([]);
  });

  it("saves exactly 3 days", async () => {
    const res = await request(app).put("/availability/week").set("Cookie", cookie).send({ days: [block(0), block(2), block(4)] });
    expect(res.status).toBe(200);
    expect(await activeDates()).toEqual([day(0), day(2), day(4)]);
  });

  it("replaces the previous week's blocks rather than adding to them", async () => {
    const res = await request(app).put("/availability/week").set("Cookie", cookie)
      .send({ days: [block(1, "10:00", "14:00"), block(3), block(5), block(6)] });
    expect(res.status).toBe(200);
    expect(await activeDates()).toEqual([day(1), day(3), day(5), day(6)]);
  });

  it("rejects duplicate days, days outside the 7-day window, and inverted times", async () => {
    const dup = await request(app).put("/availability/week").set("Cookie", cookie).send({ days: [block(0), block(0), block(1)] });
    expect(dup.status).toBe(422);
    const outside = await request(app).put("/availability/week").set("Cookie", cookie).send({ days: [block(0), block(1), block(9)] });
    expect(outside.status).toBe(422);
    const past = await request(app).put("/availability/week").set("Cookie", cookie).send({ days: [block(-1), block(1), block(2)] });
    expect(past.status).toBe(422);
    const inverted = await request(app).put("/availability/week").set("Cookie", cookie).send({ days: [block(0), block(1), block(2, "15:00", "09:00")] });
    expect(inverted.status).toBe(422);
    expect(await activeDates()).toEqual([day(1), day(3), day(5), day(6)]);
  });
});
