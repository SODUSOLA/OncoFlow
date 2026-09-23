import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { config } from "../../config.js";

// Pins the real HTTP statuses for body-parser failures, which previously fell through to a generic 500 "Internal server error".

const app = createApp();

describe("body parser failures are reported as themselves, not as 500s", () => {
  it("returns 413 for a body over the standard route limit", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      // Over the 1mb standard limit; /auth/login is deliberately not the upload route.
      .send(JSON.stringify({ email: "probe@test.local", password: "x".repeat(2 * 1024 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(res.status).not.toBe(500);
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": "broken", ');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
    expect(res.body.error).toMatch(/valid JSON/i);
  });

  it("still accepts a normal-sized body on the same route", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "probe@test.local", password: "password123" });

    // 401 (bad credentials) is the point — the body parsed fine and the route ran.
    expect(res.status).toBe(401);
  });
});

describe("upload body budget", () => {
  // Deriving the upload limit from maxUploadBytes keeps it from drifting below the base64-inflated size of a file that is within budget.
  it("allows for base64 inflation over the raw file limit", () => {
    expect(config.maxUploadBodyBytes).toBeGreaterThan(config.maxUploadBytes * 4 / 3);
  });
});
