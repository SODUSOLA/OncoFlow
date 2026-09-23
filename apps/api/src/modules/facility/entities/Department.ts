export interface DepartmentData {
  id: string;
  facilityId: string;
  name: string;
}

// Domain entity for a facility department.
export class Department {
  constructor(private data: DepartmentData) {}

  get id() {
    return this.data.id;
  }
  get facilityId() {
    return this.data.facilityId;
  }
  get name() {
    return this.data.name;
  }

  // Serializes the department for API responses.
  toJSON() {
    return { ...this.data };
  }
}
