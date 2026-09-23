import type { transcriptionAssignmentStatusEnum } from "../../../db/enums.js";

type TranscriptionAssignmentStatus = (typeof transcriptionAssignmentStatusEnum.enumValues)[number];

// Proposed 24-hour default SLA (not FR-pinned), since transcript correction has no patient waiting on it.
const SLA_WINDOW_MS = 24 * 60 * 60 * 1000;

const VALID_TRANSITIONS: Record<TranscriptionAssignmentStatus, TranscriptionAssignmentStatus[]> = {
  QUEUED: ["CLAIMED"],
  CLAIMED: ["IN_PROGRESS", "RELEASED", "COMPLETED"],
  IN_PROGRESS: ["RELEASED", "COMPLETED"],
  // Releasing puts the item back in the shared pool — RELEASED is re-claimable, not terminal.
  RELEASED: ["CLAIMED"],
  COMPLETED: [],
};

export interface TranscriptionAssignmentData {
  id: string;
  meetingId: string;
  scribeId: string | null;
  status: TranscriptionAssignmentStatus;
  queuedAt: Date;
  claimedAt: Date | null;
  completedAt: Date | null;
  slaDeadline: Date | null;
  slaBreached: boolean;
}

// Domain entity for a scribe's assignment to correct a transcript.
export class TranscriptionAssignment {
  constructor(private data: TranscriptionAssignmentData) {}

  get id() { return this.data.id; }
  get meetingId() { return this.data.meetingId; }
  get scribeId() { return this.data.scribeId; }
  get status() { return this.data.status; }
  get queuedAt() { return this.data.queuedAt; }
  get claimedAt() { return this.data.claimedAt; }
  get completedAt() { return this.data.completedAt; }
  get slaDeadline() { return this.data.slaDeadline; }
  get slaBreached() { return this.data.slaBreached; }

  // Computes the assignment SLA deadline from a start time.
  static slaDeadlineFor(from: Date): Date {
    return new Date(from.getTime() + SLA_WINDOW_MS);
  }

  // Throws if the target status isn't a legal transition from the current one.
  private assertTransition(target: TranscriptionAssignmentStatus): void {
    if (!VALID_TRANSITIONS[this.data.status].includes(target)) {
      throw new Error(`Cannot transition from ${this.data.status} to ${target}`);
    }
  }

  // Guards only this transition's legality; the backlog cap of 5 is a table-wide count enforced by the service.
  claim(scribeId: string, now: Date): TranscriptionAssignment {
    this.assertTransition("CLAIMED");
    return new TranscriptionAssignment({ ...this.data, status: "CLAIMED", scribeId, claimedAt: now });
  }

  // Returns a copy released back to the queue.
  release(): TranscriptionAssignment {
    this.assertTransition("RELEASED");
    return new TranscriptionAssignment({ ...this.data, status: "RELEASED", scribeId: null, claimedAt: null });
  }

  // Returns a copy marked completed.
  complete(now: Date): TranscriptionAssignment {
    this.assertTransition("COMPLETED");
    return new TranscriptionAssignment({ ...this.data, status: "COMPLETED", completedAt: now });
  }

  // Marks the SLA as breached if the deadline passed while incomplete.
  checkBreach(now: Date): TranscriptionAssignment {
    if (this.data.slaBreached || this.data.completedAt || !this.data.slaDeadline) return this;
    if (now > this.data.slaDeadline) {
      return new TranscriptionAssignment({ ...this.data, slaBreached: true });
    }
    return this;
  }

  // Serializes the assignment for API responses.
  toJSON() {
    return {
      id: this.data.id,
      meetingId: this.data.meetingId,
      scribeId: this.data.scribeId,
      status: this.data.status,
      queuedAt: this.data.queuedAt.toISOString(),
      claimedAt: this.data.claimedAt?.toISOString() ?? null,
      completedAt: this.data.completedAt?.toISOString() ?? null,
      slaDeadline: this.data.slaDeadline?.toISOString() ?? null,
      slaBreached: this.data.slaBreached,
    };
  }
}
