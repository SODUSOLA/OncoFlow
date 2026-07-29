import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { FacilityRepository, DepartmentRepository } from "../repository.js";

const facRepo = new FacilityRepository();
const deptRepo = new DepartmentRepository();

describe("FacilityRepository", () => {
  it("creates and finds a facility", async () => {
    const id = crypto.randomUUID();
    await facRepo.create({
      id,
      name: "Test Hospital",
      region: "Lagos",
      address: "123 Test St",
      status: "ACTIVE",
    });

    const found = await facRepo.findById(id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test Hospital");
  });

  it("soft-deletes a facility", async () => {
    const id = crypto.randomUUID();
    await facRepo.create({
      id,
      name: "Delete Hospital",
      region: "Oyo",
      address: "456 Delete St",
      status: "ACTIVE",
    });

    await facRepo.softDelete(id);
    const found = await facRepo.findById(id);
    expect(found).toBeNull();

    const all = await facRepo.findAll();
    expect(all.find((f) => f.id === id)).toBeUndefined();
  });

  it("updates a facility", async () => {
    const id = crypto.randomUUID();
    await facRepo.create({
      id,
      name: "Original Hospital",
      region: "FCT",
      address: "789 Original St",
      status: "ACTIVE",
    });

    await facRepo.update(id, { name: "Updated Hospital" });
    const found = await facRepo.findById(id);
    expect(found!.name).toBe("Updated Hospital");
  });
});

describe("DepartmentRepository", () => {
  it("creates and lists departments by facility", async () => {
    const facId = crypto.randomUUID();
    await facRepo.create({
      id: facId,
      name: "Dept Test Hospital",
      region: "Lagos",
      address: "Dept St",
      status: "ACTIVE",
    });

    await deptRepo.create({ id: crypto.randomUUID(), facilityId: facId, name: "Oncology" });
    await deptRepo.create({ id: crypto.randomUUID(), facilityId: facId, name: "Radiology" });

    const depts = await deptRepo.findByFacility(facId);
    expect(depts).toHaveLength(2);
  });

  it("soft-deletes a department", async () => {
    const facId = crypto.randomUUID();
    await facRepo.create({
      id: facId,
      name: "Dept Del Hospital",
      region: "Oyo",
      address: "Del St",
      status: "ACTIVE",
    });

    const deptId = crypto.randomUUID();
    await deptRepo.create({ id: deptId, facilityId: facId, name: "To Delete" });

    await deptRepo.softDelete(deptId);
    const found = await deptRepo.findById(deptId);
    expect(found).toBeNull();
  });
});
