import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();

let regionalAdminCookie: string;
let plainCookie: string;

// Creates a user and returns a valid session cookie for requests.
async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId, email: `inquiry-${crypto.randomUUID()}@test.com`, passwordHash: "test",
  });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { userId, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

beforeAll(async () => {
  await seedIdentity();

  const admin = await createSessionCookie();
  regionalAdminCookie = admin.cookie;
  const regionalAdminRoleRow = await db.select().from(role).where(eq(role.name, "REGIONAL_ADMIN")).limit(1);
  await db.insert(userRole).values({ userId: admin.userId, roleId: regionalAdminRoleRow[0]!.id });

  const plain = await createSessionCookie();
  plainCookie = plain.cookie;
});

// Creates a public inquiry through the API for tests.
async function createInquiry() {
  const res = await request(app).post("/public-inquiries").send({
    name: "Test Visitor", email: `visitor-${crypto.randomUUID()}@example.com`, message: "How much does a consult cost?",
  });
  return { inquiryId: res.body.inquiry.id as string, token: res.body.accessToken as string };
}

describe("POST /public-inquiries — visitor create (no auth)", () => {
  it("creates an inquiry and returns an access token", async () => {
    const res = await request(app).post("/public-inquiries").send({
      name: "Bola Ade", phone: "+2348011112222", message: "Do you have a Kano branch?",
    });
    expect(res.status).toBe(201);
    expect(res.body.inquiry.id).toBeDefined();
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.inquiry.status).toBe("OPEN");
  });

  it("rejects an inquiry with neither email nor phone", async () => {
    const res = await request(app).post("/public-inquiries").send({ name: "No Contact", message: "Hi" });
    expect(res.status).toBe(400);
  });
});

describe("Visitor message thread — token-based access", () => {
  it("lets the visitor read their own thread with the correct token", async () => {
    const { inquiryId, token } = await createInquiry();
    const res = await request(app).get(`/public-inquiries/${inquiryId}/messages?token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it("lets the visitor post a follow-up message with the correct token", async () => {
    const { inquiryId, token } = await createInquiry();
    const res = await request(app).post(`/public-inquiries/${inquiryId}/messages`).send({ token, content: "Following up" });
    expect(res.status).toBe(201);
    expect(res.body.message.senderType).toBe("VISITOR");
  });

  it("rejects a wrong token", async () => {
    const { inquiryId } = await createInquiry();
    const res = await request(app).get(`/public-inquiries/${inquiryId}/messages?token=wrong-token-value`);
    expect(res.status).toBe(403);
  });

  it("rejects a missing token", async () => {
    const { inquiryId } = await createInquiry();
    const res = await request(app).get(`/public-inquiries/${inquiryId}/messages`);
    expect(res.status).toBe(400);
  });
});

describe("Staff inquiry inbox — requires publicInquiry permission", () => {
  it("lets a REGIONAL_ADMIN list inquiries", async () => {
    await createInquiry();
    const res = await request(app).get("/admin/inquiries").set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.inquiries)).toBe(true);
    expect(res.body.inquiries.length).toBeGreaterThan(0);
  });

  it("rejects a plain authenticated user with no publicInquiry:read grant", async () => {
    const res = await request(app).get("/admin/inquiries").set("Cookie", plainCookie);
    expect(res.status).toBe(403);
  });

  it("lets a REGIONAL_ADMIN reply, and the visitor sees the reply via their token", async () => {
    const { inquiryId, token } = await createInquiry();
    const replyRes = await request(app)
      .post(`/admin/inquiries/${inquiryId}/messages`)
      .set("Cookie", regionalAdminCookie)
      .send({ content: "We can help with that — which facility are you closest to?" });
    expect(replyRes.status).toBe(201);
    expect(replyRes.body.message.senderType).toBe("STAFF");

    const visitorRes = await request(app).get(`/public-inquiries/${inquiryId}/messages?token=${token}`);
    expect(visitorRes.body.messages).toHaveLength(2);
    expect(visitorRes.body.messages[1].senderType).toBe("STAFF");
  });

  it("lets a REGIONAL_ADMIN link an inquiry to an existing patient and reject an unknown one", async () => {
    const { inquiryId } = await createInquiry();
    const badLink = await request(app)
      .post(`/admin/inquiries/${inquiryId}/link`)
      .set("Cookie", regionalAdminCookie)
      .send({ patientId: crypto.randomUUID() });
    expect(badLink.status).toBe(404);
  });

  it("lets a REGIONAL_ADMIN close an inquiry, and a new visitor message reopens it", async () => {
    const { inquiryId, token } = await createInquiry();
    const closeRes = await request(app)
      .post(`/admin/inquiries/${inquiryId}/close`)
      .set("Cookie", regionalAdminCookie);
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.inquiry.status).toBe("CLOSED");

    const followUp = await request(app)
      .post(`/public-inquiries/${inquiryId}/messages`)
      .send({ token, content: "Still there?" });
    expect(followUp.status).toBe(201);

    const staffView = await request(app)
      .get(`/admin/inquiries/${inquiryId}/messages`)
      .set("Cookie", regionalAdminCookie);
    expect(staffView.body.inquiry.status).toBe("OPEN");
  });
});
