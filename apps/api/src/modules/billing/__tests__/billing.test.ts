import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { ServiceClassificationRepository, TariffRepository } from "../repository.js";
import { db } from "../../../db/index.js";
import { serviceClassification, tariff } from "../schema.js";
import { facility } from "../../facility/schema.js";

const classRepo = new ServiceClassificationRepository();
const tariffRepo = new TariffRepository();

let testClassId: string;
let testFacId: string;

beforeAll(async () => {
  const classes = await db.select().from(serviceClassification).limit(1);
  if (classes.length === 0) {
    testClassId = crypto.randomUUID();
    await classRepo.create({ id: testClassId, name: "CONSULTATION", cappedNetworkFeeKobo: 500000n });
  } else {
    testClassId = classes[0]!.id;
  }

  const facs = await db.select().from(facility).limit(1);
  if (facs.length === 0) {
    testFacId = crypto.randomUUID();
    await db.insert(facility).values({ id: testFacId, name: "Test Billing Facility", region: "Lagos", address: "Billing St", status: "ACTIVE" });
  } else {
    testFacId = facs[0]!.id;
  }
});

describe("ServiceClassificationRepository", () => {
  it("finds by name using seeded data", async () => {
    const found = await classRepo.findByName("CONSULTATION");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("CONSULTATION");
  });

  it("lists all classifications", async () => {
    const all = await classRepo.findAll();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });
});

describe("TariffRepository", () => {
  it("creates tariff and enforces unique (facility_id, classification_id)", async () => {
    const facId = crypto.randomUUID();
    await db.insert(facility).values({ id: facId, name: "Uniq Test Fac", region: "Oyo", address: "U St", status: "ACTIVE" });

    await tariffRepo.create({
      id: crypto.randomUUID(),
      facilityId: facId,
      classificationId: testClassId,
      networkFeeKobo: 500000n,
      facilityBedFeeKobo: 300000n,
      drugPriceKobo: 200000n,
    });

    await expect(
      tariffRepo.create({
        id: crypto.randomUUID(),
        facilityId: facId,
        classificationId: testClassId,
        networkFeeKobo: 100n,
        facilityBedFeeKobo: 100n,
        drugPriceKobo: 100n,
      }),
    ).rejects.toThrow("Tariff already exists for this facility and classification");
  });

  it("computes total from tariff components", async () => {
    const { Tariff } = await import("../entities/ServiceClassification.js");
    const t = new Tariff({
      id: "00000000-0000-0000-0000-000000000001",
      facilityId: "00000000-0000-0000-0000-000000000002",
      classificationId: "00000000-0000-0000-0000-000000000003",
      networkFeeKobo: 5000n,
      facilityBedFeeKobo: 3000n,
      drugPriceKobo: 2000n,
    });
    expect(t.totalKobo()).toBe(10000n);
  });

  it("finds tariff by facility and classification", async () => {
    const facId = crypto.randomUUID();
    await db.insert(facility).values({ id: facId, name: "Find Test Fac", region: "Lagos", address: "F St", status: "ACTIVE" });

    await tariffRepo.create({
      id: crypto.randomUUID(),
      facilityId: facId,
      classificationId: testClassId,
      networkFeeKobo: 100000n,
      facilityBedFeeKobo: 60000n,
      drugPriceKobo: 40000n,
    });

    const found = await tariffRepo.findByFacilityAndClassification(facId, testClassId);
    expect(found).not.toBeNull();
    expect(found!.networkFeeKobo).toBe(100000n);
  });
});
