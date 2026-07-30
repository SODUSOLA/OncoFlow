import type { transcriptionAssignmentStatusEnum } from "../../../db/enums.js";

type TranscriptionAssignmentStatus = (typeof transcriptionAssignmentStatusEnum.enumValues)[number];

// F3.11 §5 — proposed default, not FR-pinned like the Messaging SLA (FR-31 pins 2/5 minutes).
// Transcript correction is reference-quality work with no patient waiting on it in the moment,
// so same-day-but-not-instant is proportionate. Flagged for confirmation, not a fixed spec.
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

  static slaDeadlineFor(from: Date): Date {
    return new Date(from.getTime() + SLA_WINDOW_MS);
  }

  private assertTransition(target: TranscriptionAssignmentStatus): void {
    if (!VALID_TRANSITIONS[this.data.status].includes(target)) {
      throw new Error(`Cannot transition from ${this.data.status} to ${target}`);
    }
  }

  // Backlog cap (§5, proposed default: 5 concurrent CLAIMED/IN_PROGRESS) is a count enforced
  // by the service layer against the whole table, not something a single assignment can know
  // about itself — this only guards the state-machine legality of this one transition.
  claim(scribeId: string, now: Date): TranscriptionAssignment {
    this.assertTransition("CLAIMED");
    return new TranscriptionAssignment({ ...this.data, status: "CLAIMED", scribeId, claimedAt: now });
  }

  release(): TranscriptionAssignment {
    this.assertTransition("RELEASED");
    return new TranscriptionAssignment({ ...this.data, status: "RELEASED", scribeId: null, claimedAt: null });
  }

  complete(now: Date): TranscriptionAssignment {
    this.assertTransition("COMPLETED");
    return new TranscriptionAssignment({ ...this.data, status: "COMPLETED", completedAt: now });
  }

  checkBreach(now: Date): TranscriptionAssignment {
    if (this.data.slaBreached || this.data.completedAt || !this.data.slaDeadline) return this;
    if (now > this.data.slaDeadline) {
      return new TranscriptionAssignment({ ...this.data, slaBreached: true });
    }
    return this;
  }

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
