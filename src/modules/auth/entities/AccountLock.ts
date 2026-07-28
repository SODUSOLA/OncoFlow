import type { accountLockTypeEnum } from "../../../db/enums";

type LockType = (typeof accountLockTypeEnum.enumValues)[number];

export interface AccountLockData {
  id: string;
  userId: string;
  lockedBy: string;
  lockedAt: Date;
  lockedUntil: Date | null;
  reason: string;
  lockType: LockType;
  isDeleted: boolean;
  deletedAt: Date | null;
}

export class AccountLock {
  constructor(private data: AccountLockData) {}

  get id(): string {
    return this.data.id;
  }
  get userId(): string {
    return this.data.userId;
  }
  get lockType(): LockType {
    return this.data.lockType;
  }
  get lockedUntil(): Date | null {
    return this.data.lockedUntil;
  }
  get lockedAt(): Date {
    return this.data.lockedAt;
  }

  get isActive(): boolean {
    if (this.data.isDeleted) return false;
    if (this.data.lockedUntil && this.data.lockedUntil < new Date()) return false;
    return true;
  }

  get isExpired(): boolean {
    return !!this.data.lockedUntil && this.data.lockedUntil < new Date();
  }
}