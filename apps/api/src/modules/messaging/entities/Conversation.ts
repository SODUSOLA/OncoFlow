import type { conversationTypeEnum, conversationStatusEnum } from "../../../db/enums.js";

type ConversationType = (typeof conversationTypeEnum.enumValues)[number];
type ConversationStatus = (typeof conversationStatusEnum.enumValues)[number];

// FR-31: 5-minute SLA for admin inquiries and 2 minutes for MO side-effects, reflecting clinical urgency.
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

// Domain entity for a conversation, including its SLA clock.
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

  // Computes the SLA deadline for a conversation type from a start time.
  static slaDeadlineFor(conversationType: ConversationType, from: Date): Date {
    return new Date(from.getTime() + SLA_WINDOW_MS[conversationType]);
  }

  // Only the first real reply stops the SLA clock; a SYSTEM auto-reply must not count as the staff response.
  recordFirstResponse(at: Date): Conversation {
    if (this.data.firstResponseAt) return this;
    return new Conversation({ ...this.data, firstResponseAt: at });
  }

  // Marks the SLA as breached if the deadline passed with no response.
  checkBreach(now: Date): Conversation {
    if (this.data.slaBreached || this.data.firstResponseAt || !this.data.slaDeadline) return this;
    if (now > this.data.slaDeadline) {
      return new Conversation({ ...this.data, slaBreached: true });
    }
    return this;
  }

  // Returns a copy marked CLOSED.
  close(): Conversation {
    return new Conversation({ ...this.data, status: "CLOSED" });
  }

  // Serializes the conversation for API responses.
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
