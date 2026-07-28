export interface DepartmentData {
  id: string;
  facilityId: string;
  name: string;
}

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

  toJSON() {
    return { ...this.data };
  }
}
