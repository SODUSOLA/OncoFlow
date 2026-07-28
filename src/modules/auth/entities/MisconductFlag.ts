import type { misconductStatusEnum } from "../../../db/enums";

type MisconductStatus = (typeof misconductStatusEnum.enumValues)[number];

export interface MisconductFlagData {
  id: string;
  flaggedUserId: string;
  triggerReason: string;
  conversationId: string | null;
  status: MisconductStatus;
  reviewer1Id: string | null;
  reviewer2Id: string | null;
  resolvedAt: Date | null;
}

export class MisconductFlag {
  constructor(private data: MisconductFlagData) {}

  get id(): string {
    return this.data.id;
  }
  get flaggedUserId(): string {
    return this.data.flaggedUserId;
  }
  get status(): MisconductStatus {
    return this.data.status;
  }
  get resolvedAt(): Date | null {
    return this.data.resolvedAt;
  }
}