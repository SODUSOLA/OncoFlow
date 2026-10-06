import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { user, session } from "../../auth/schema.js";
import { notification } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";

const app = createApp();

async function makeUser() {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, email: `readall-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({ id: sessionId, userId: id, device: "t", ip: "127.0.0.1", expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true });
  return { id, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

async function addNotification(recipientId: string, status: "PENDING" | "SENT" | "READ") {
  await db.insert(notification).values({ id: crypto.randomUUID(), recipientId, type: "NEW_MESSAGE", status });
}

let me: { id: string; cookie: string };
let other: { id: string; cookie: string };

beforeAll(async () => {
  me = await makeUser();
  other = await makeUser();
});

describe("POST /notifications/read-all", () => {
  it("marks only the caller's unread notifications as read", async () => {
    await addNotification(me.id, "SENT");
    await addNotification(me.id, "PENDING");
    await addNotification(me.id, "READ");
    await addNotification(other.id, "SENT");

    const res = await request(app).post("/notifications/read-all").set("Cookie", me.cookie);
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    const mine = await db.select().from(notification).where(eq(notification.recipientId, me.id));
    expect(mine.every((n) => n.status === "READ")).toBe(true);
    const theirs = await db.select().from(notification).where(eq(notification.recipientId, other.id));
    expect(theirs.every((n) => n.status === "SENT")).toBe(true);
  });

  it("reports zero when there is nothing unread", async () => {
    const res = await request(app).post("/notifications/read-all").set("Cookie", me.cookie);
    expect(res.body.updated).toBe(0);
  });
});

describe("opening a single notification", () => {
  it("returns its reference and marks only that one read, and only for its recipient", async () => {
    const referenceId = crypto.randomUUID();
    const mine = crypto.randomUUID();
    const mineOther = crypto.randomUUID();
    const theirs = crypto.randomUUID();
    await db.insert(notification).values([
      { id: mine, recipientId: me.id, type: "NEW_MESSAGE", status: "SENT", referenceId },
      { id: mineOther, recipientId: me.id, type: "NEW_MESSAGE", status: "SENT" },
      { id: theirs, recipientId: other.id, type: "NEW_MESSAGE", status: "SENT" },
    ]);

    const list = await request(app).get("/notifications").set("Cookie", me.cookie);
    expect(list.body.notifications.find((n: { id: string }) => n.id === mine).referenceId).toBe(referenceId);

    const ok = await request(app).post(`/notifications/${mine}/read`).set("Cookie", me.cookie);
    expect(ok.status).toBe(200);
    const rows = await db.select().from(notification).where(eq(notification.recipientId, me.id));
    expect(rows.find((n) => n.id === mine)!.status).toBe("READ");
    expect(rows.find((n) => n.id === mineOther)!.status).toBe("SENT");

    const foreign = await request(app).post(`/notifications/${theirs}/read`).set("Cookie", me.cookie);
    expect(foreign.status).toBe(404);
    const untouched = await db.select().from(notification).where(eq(notification.id, theirs));
    expect(untouched[0]!.status).toBe("SENT");
  });
});

describe("the Notification Center view", () => {
  it("leaves chat messages out but keeps alerts, reminders and payments", async () => {
    const who = await makeUser();
    await db.insert(notification).values([
      { id: crypto.randomUUID(), recipientId: who.id, type: "NEW_MESSAGE", status: "SENT" },
      { id: crypto.randomUUID(), recipientId: who.id, type: "CONVERSATION_FEEDBACK", status: "SENT" },
      { id: crypto.randomUUID(), recipientId: who.id, type: "INVOICE_PAID", status: "SENT" },
      { id: crypto.randomUUID(), recipientId: who.id, type: "APPOINTMENT_REMINDER", status: "SENT" },
      { id: crypto.randomUUID(), recipientId: who.id, type: "LAB_RESULT_REVIEWED", status: "SENT" },
    ]);
    const center = await request(app).get("/notifications?scope=alerts").set("Cookie", who.cookie);
    expect(center.body.notifications.map((n: { type: string }) => n.type).sort()).toEqual(["APPOINTMENT_REMINDER", "INVOICE_PAID", "LAB_RESULT_REVIEWED"]);
    const everything = await request(app).get("/notifications").set("Cookie", who.cookie);
    expect(everything.body.notifications).toHaveLength(5);
  });
});
