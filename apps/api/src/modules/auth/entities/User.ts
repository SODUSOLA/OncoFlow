import bcrypt from "bcryptjs";
import type { userStatusEnum } from "../../../db/enums.js";

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
  firstName: string | null;
  lastName: string | null;
  profilePictureFileId: string | null;
  passwordHash: string;
  status: UserStatus;
  facilityId: string | null;
  lastLogin: Date | null;
  mfaEnabled: boolean;
  emailVerifiedAt: Date | null;
  isDeleted: boolean;
  deletedAt: Date | null;
}

// User domain entity owning password, status transitions and MFA/email flags.
export class User {
  constructor(private data: UserData) {}

  // Returns the allowed user status transitions.
  static getValidTransitions(): Record<UserStatus, UserStatus[]> {
    return VALID_TRANSITIONS;
  }

  get id(): string {
    return this.data.id;
  }
  get email(): string {
    return this.data.email;
  }
  get firstName(): string | null {
    return this.data.firstName;
  }
  get lastName(): string | null {
    return this.data.lastName;
  }
  // Falls back to the email's local part when no name is on record, so a display string is always available.
  get fullName(): string {
    if (this.data.firstName || this.data.lastName) {
      return [this.data.firstName, this.data.lastName].filter(Boolean).join(" ");
    }
    return this.data.email.split("@")[0]!;
  }
  get status(): UserStatus {
    return this.data.status;
  }
  get mfaEnabled(): boolean {
    return this.data.mfaEnabled;
  }
  get facilityId(): string | null {
    return this.data.facilityId;
  }
  get emailVerified(): boolean {
    return this.data.emailVerifiedAt !== null;
  }
  get passwordHash(): string {
    return this.data.passwordHash;
  }

  // Hashes a password with bcrypt (cost 12).
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  // Checks a plaintext password against the stored hash.
  async verifyPassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.data.passwordHash);
  }

  // Moves the user to a new status, or throws if the transition is illegal.
  transitionTo(newStatus: UserStatus): void {
    const allowed = VALID_TRANSITIONS[this.data.status];
    if (!allowed?.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${this.data.status} → ${newStatus}`,
      );
    }
    this.data.status = newStatus;
  }

  // Stamps the last-login time.
  markLastLogin(): void {
    this.data.lastLogin = new Date();
  }

  // Stamps the email as verified.
  markEmailVerified(): void {
    this.data.emailVerifiedAt = new Date();
  }

  // Marks MFA as enabled.
  enableMfa(): void {
    this.data.mfaEnabled = true;
  }

  // Marks MFA as disabled.
  disableMfa(): void {
    this.data.mfaEnabled = false;
  }

  // Serializes the user without secrets (password hash, MFA secret).
  toSafeJSON() {
    return {
      id: this.data.id,
      email: this.data.email,
      firstName: this.data.firstName,
      lastName: this.data.lastName,
      fullName: this.fullName,
      profilePictureFileId: this.data.profilePictureFileId,
      status: this.data.status,
      facilityId: this.data.facilityId,
      lastLogin: this.data.lastLogin,
      mfaEnabled: this.data.mfaEnabled,
      emailVerified: this.emailVerified,
    };
  }
}