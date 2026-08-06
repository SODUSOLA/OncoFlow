import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import crypto from "node:crypto";
import { facility } from "../../facility/schema.js";

const app = createApp();
const base = "/patients";

let testFacilityId: string;

beforeAll(async () => {
  const rows = await db.insert(facility).values({
    id: crypto.randomUUID(),
    name: "API Test Facility",
    region: "Lagos",
    address: "API Test Address",
    status: "ACTIVE",
  }).returning();
  testFacilityId = rows[0]!.id;
});

describe("POST /patients — register", () => {
  it("registers a patient and returns 201", async () => {
    const res = await request(app)
      .post(base)
      .send({
        uniquePatientId: "API-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
        firstName: "Api",
        lastName: "Test",
        dob: "1990-06-15",
        gender: "Female",
        phone: "+2348012340001",
        email: "api." + crypto.randomUUID().slice(0, 4) + "@test.com",
        facilityId: testFacilityId,
      });

    expect(res.status).toBe(201);
    expect(res.body.patient).toBeDefined();
    expect(res.body.patient.firstName).toBe("Api");
    expect(res.body.wallet).toBeDefined();
    expect(res.body.wallet.balanceKobo).toBe("0");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await request(app).post(base).send({ firstName: "Incomplete" });
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate uniquePatientId", async () => {
    const uid = "DUPAPI-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    await request(app).post(base).send({
      uniquePatientId: uid,
      firstName: "First",
      lastName: "Dup",
      dob: "1980-01-01",
      gender: "Male",
      phone: "+2348011112222",
      email: "dup1." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: testFacilityId,
    });

    const res = await request(app).post(base).send({
      uniquePatientId: uid,
      firstName: "Second",
      lastName: "Dup",
      dob: "1980-01-01",
      gender: "Male",
      phone: "+2348033334444",
      email: "dup2." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: testFacilityId,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Patient with this ID already exists");
  });
});

describe("GET /patients/:id — get patient", () => {
  it("returns patient with nested objects", async () => {
    const uid = "GET-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    const reg = await request(app).post(base).send({
      uniquePatientId: uid,
      firstName: "GetTest",
      lastName: "Patient",
      dob: "1985-03-20",
      gender: "Male",
      phone: "+2348055556666",
      email: "get." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: testFacilityId,
    });

    const res = await request(app).get(`${base}/${reg.body.patient.id}`);
    expect(res.status).toBe(200);
    expect(res.body.patient).toBeDefined();
    expect(res.body.patient.firstName).toBe("GetTest");
    expect(res.body.addresses).toBeDefined();
    expect(res.body.emergencyContacts).toBeDefined();
    expect(res.body.wallet).toBeDefined();
  });

  it("returns 404 for unknown patient", async () => {
    const res = await request(app).get(`${base}/${crypto.randomUUID()}`);
    expect(res.status).toBe(404);
  });
});

describe("GET /patients — search by facility", () => {
  it("returns patients for a facility", async () => {
    const uid = "SEARCH-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    await request(app).post(base).send({
      uniquePatientId: uid,
      firstName: "Search",
      lastName: "Me",
      dob: "1995-07-10",
      gender: "Female",
      phone: "+2348066667777",
      email: "search." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: testFacilityId,
    });

    const res = await request(app).get(`${base}?facilityId=${testFacilityId}`);
    expect(res.status).toBe(200);
    expect(res.body.patients.length).toBeGreaterThanOrEqual(1);
  });

  it("filters by search query", async () => {
    const uid = "QFILTER-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    await request(app).post(base).send({
      uniquePatientId: uid,
      firstName: "QueryFilter",
      lastName: "Test",
      dob: "2000-12-25",
      gender: "Male",
      phone: "+2348077778888",
      email: "qfilter." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: testFacilityId,
    });

    const res = await request(app).get(`${base}?facilityId=${testFacilityId}&q=QueryFilter`);
    expect(res.status).toBe(200);
    expect(res.body.patients).toHaveLength(1);
    expect(res.body.patients[0]!.firstName).toBe("QueryFilter");
  });

  it("searches across all facilities when facilityId is omitted", async () => {
    const uid = "ALLFAC-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    await request(app).post(base).send({
      uniquePatientId: uid,
      firstName: "AllFacilities",
      lastName: "Test",
      dob: "1998-03-03",
      gender: "Male",
      phone: "+2348088889999",
      email: "allfac." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: testFacilityId,
    });

    const res = await request(app).get(`${base}?q=AllFacilities`);
    expect(res.status).toBe(200);
    expect(res.body.patients.some((p: { firstName: string }) => p.firstName === "AllFacilities")).toBe(true);
  });

  it("treats facilityId=all the same as omitting it", async () => {
    const res = await request(app).get(`${base}?facilityId=all`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.patients)).toBe(true);
  });
});

describe("PUT /patients/:id — update", () => {
  it("updates patient fields", async () => {
    const uid = "UPD-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    const reg = await request(app).post(base).send({
      uniquePatientId: uid,
      firstName: "OldName",
      lastName: "Patient",
      dob: "1990-01-01",
      gender: "Male",
      phone: "+2348011113333",
      email: "upd." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: testFacilityId,
    });

    const res = await request(app)
      .put(`${base}/${reg.body.patient.id}`)
      .send({ firstName: "NewName", phone: "+2348099990000" });
    expect(res.status).toBe(200);
    expect(res.body.patient.firstName).toBe("NewName");
  });

  it("returns 404 for unknown patient", async () => {
    const res = await request(app).put(`${base}/${crypto.randomUUID()}`).send({ firstName: "X" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /patients/:id — soft delete", () => {
  it("soft-deletes a patient", async () => {
    const uid = "DELAPI-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    const reg = await request(app).post(base).send({
      uniquePatientId: uid,
      firstName: "DeleteMe",
      lastName: "Patient",
      dob: "1980-05-05",
      gender: "Female",
      phone: "+2348022223333",
      email: "delapi." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: testFacilityId,
    });

    const del = await request(app).delete(`${base}/${reg.body.patient.id}`);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);

    const get = await request(app).get(`${base}/${reg.body.patient.id}`);
    expect(get.status).toBe(404);
  });
});

describe("POST /patients/:id/addresses", () => {
  it("creates an address for a patient", async () => {
    const uid = "ADDRAPI-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    const reg = await request(app).post(base).send({
      uniquePatientId: uid,
      firstName: "Addr",
      lastName: "Api",
      dob: "1992-08-15",
      gender: "Male",
      phone: "+2348033334444",
      email: "addrapi." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: testFacilityId,
    });

    const res = await request(app)
      .post(`${base}/${reg.body.patient.id}/addresses`)
      .send({ country: "Nigeria", state: "Lagos", city: "Ikeja", address: "456 New St" });
    expect(res.status).toBe(201);
    expect(res.body.address.city).toBe("Ikeja");
  });

  it("returns 404 for unknown patient", async () => {
    const res = await request(app)
      .post(`${base}/${crypto.randomUUID()}/addresses`)
      .send({ country: "Nigeria", state: "Lagos", city: "Ikeja", address: "St" });
    expect(res.status).toBe(404);
  });
});

describe("POST /patients/:id/emergency-contacts", () => {
  it("creates an emergency contact for a patient", async () => {
    const uid = "ECAPI-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    const reg = await request(app).post(base).send({
      uniquePatientId: uid,
      firstName: "EC",
      lastName: "Api",
      dob: "1988-11-20",
      gender: "Female",
      phone: "+2348044445555",
      email: "ecapi." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: testFacilityId,
    });

    const res = await request(app)
      .post(`${base}/${reg.body.patient.id}/emergency-contacts`)
      .send({ name: "Father", relationship: "Parent", phone: "+2348055556666" });
    expect(res.status).toBe(201);
    expect(res.body.emergencyContact.name).toBe("Father");
  });
});
