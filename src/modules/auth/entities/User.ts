import bcrypt from "bcryptjs";
import type { userStatusEnum } from "../../../db/enums";

type UserStatus = (typeof userStatusEnum.enumValues)[number];

const VALID_TRANSITIONS: Record<UserStatus, UserStatus[]> = {
  ACTIVE: ["INACTIVE", "LOCKED", "SUSPENDED"],
  INACTIVE: ["ACTIVE"],
  LOCKED: ["ACTIVE"],
  SUSPENDED: ["ACTIVE"],
};

export interface UserData {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  lastLogin: Date | null;
  mfaEnabled: boolean;
  isDeleted: boolean;
  deletedAt: Date | null;
}

export class User {
  constructor(private data: UserData) {}

  static getValidTransitions(): Record<UserStatus, UserStatus[]> {
    return VALID_TRANSITIONS;
  }

  get id(): string {
    return this.data.id;
  }
  get email(): string {
    return this.data.email;
  }
  get status(): UserStatus {
    return this.data.status;
  }
  get mfaEnabled(): boolean {
    return this.data.mfaEnabled;
  }
  get passwordHash(): string {
    return this.data.passwordHash;
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async verifyPassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.data.passwordHash);
  }

  transitionTo(newStatus: UserStatus): void {
    const allowed = VALID_TRANSITIONS[this.data.status];
    if (!allowed?.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${this.data.status} → ${newStatus}`,
      );
    }
    this.data.status = newStatus;
  }

  markLastLogin(): void {
    this.data.lastLogin = new Date();
  }

  enableMfa(): void {
    this.data.mfaEnabled = true;
  }

  disableMfa(): void {
    this.data.mfaEnabled = false;
  }

  toSafeJSON() {
    return {
      id: this.data.id,
      email: this.data.email,
      status: this.data.status,
      lastLogin: this.data.lastLogin,
      mfaEnabled: this.data.mfaEnabled,
    };
  }
}