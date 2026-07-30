import type { conversationTypeEnum, conversationStatusEnum } from "../../../db/enums.js";

type ConversationType = (typeof conversationTypeEnum.enumValues)[number];
type ConversationStatus = (typeof conversationStatusEnum.enumValues)[number];

// FR-31: Admin inquiry gets a 5-minute response SLA, MO side-effect gets 2 minutes —
// the tighter window reflects clinical urgency, not just channel volume.
const SLA_WINDOW_MS: Record<ConversationType, number> = {
  ADMIN_INQUIRY: 5 * 60 * 1000,
  MO_SIDE_EFFECT: 2 * 60 * 1000,
};

export interface ConversationData {
  id: string;
  patientId: string;
  conversationType: ConversationType;
  status: ConversationStatus;
  slaDeadline: Date | null;
  firstResponseAt: Date | null;
  slaBreached: boolean;
  assignedTo: string | null;
}

export class Conversation {
  constructor(private data: ConversationData) {}

  get id() { return this.data.id; }
  get patientId() { return this.data.patientId; }
  get conversationType() { return this.data.conversationType; }
  get status() { return this.data.status; }
  get slaDeadline() { return this.data.slaDeadline; }
  get firstResponseAt() { return this.data.firstResponseAt; }
  get slaBreached() { return this.data.slaBreached; }
  get assignedTo() { return this.data.assignedTo; }

  static slaDeadlineFor(conversationType: ConversationType, from: Date): Date {
    return new Date(from.getTime() + SLA_WINDOW_MS[conversationType]);
  }

  // Only the first real reply stops the SLA clock — a SYSTEM message (auto-reply, etc.)
  // must never count as the staff response it's standing in for.
  recordFirstResponse(at: Date): Conversation {
    if (this.data.firstResponseAt) return this;
    return new Conversation({ ...this.data, firstResponseAt: at });
  }

  checkBreach(now: Date): Conversation {
    if (this.data.slaBreached || this.data.firstResponseAt || !this.data.slaDeadline) return this;
    if (now > this.data.slaDeadline) {
      return new Conversation({ ...this.data, slaBreached: true });
    }
    return this;
  }

  close(): Conversation {
    return new Conversation({ ...this.data, status: "CLOSED" });
  }

  toJSON() {
    return {
      id: this.data.id,
      patientId: this.data.patientId,
      conversationType: this.data.conversationType,
      status: this.data.status,
      slaDeadline: this.data.slaDeadline?.toISOString() ?? null,
      firstResponseAt: this.data.firstResponseAt?.toISOString() ?? null,
      slaBreached: this.data.slaBreached,
      assignedTo: this.data.assignedTo,
    };
  }
}
