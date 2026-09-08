import type { meetingStatusEnum } from "../../../db/enums.js";

type MeetingStatus = (typeof meetingStatusEnum.enumValues)[number];

const VALID_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  SCHEDULED: ["IN_PROGRESS", "ENDED"],
  IN_PROGRESS: ["ENDED"],
  ENDED: [],
};

export interface MeetingData {
  id: string;
  appointmentId: string;
  provider: string;
  roomId: string;
  status: MeetingStatus;
  // Optional (not just nullable) so existing test fixtures built before this field existed don't
  // all need updating — every real row from the repository has it, since the column itself is
  // nullable-but-present.
  endedAt?: Date | null;
  dailyRoomExp?: Date | null;
  transcriptCorrectedAt: Date | null;
  transcriptCorrectedBy: string | null;
  transcriptSignedOffAt: Date | null;
  transcriptSignedOffBy: string | null;
}

export class Meeting {
  constructor(private data: MeetingData) {}

  get id() { return this.data.id; }
  get appointmentId() { return this.data.appointmentId; }
  get provider() { return this.data.provider; }
  get roomId() { return this.data.roomId; }
  get status() { return this.data.status; }
  get endedAt() { return this.data.endedAt; }
  get dailyRoomExp() { return this.data.dailyRoomExp; }
  get transcriptCorrectedAt() { return this.data.transcriptCorrectedAt; }
  get transcriptCorrectedBy() { return this.data.transcriptCorrectedBy; }
  get transcriptSignedOffAt() { return this.data.transcriptSignedOffAt; }
  get transcriptSignedOffBy() { return this.data.transcriptSignedOffBy; }

  transitionTo(target: MeetingStatus): Meeting {
    const allowed = VALID_TRANSITIONS[this.data.status];
    if (!allowed.includes(target)) {
      throw new Error(`Cannot transition from ${this.data.status} to ${target}`);
    }
    return new Meeting({ ...this.data, status: target });
  }

  // F3.11 §4, stage 1 of 2 — a Scribe completing corrections on every segment. This alone does
  // NOT make the transcript trusted/citable; it just closes out the Scribe's own work and makes
  // the transcript ready for the assigned consultant's sign-off (stage 2, below). Can only
  // happen once the call has actually ended, and only once — post-correction fixes go through
  // Transcript.edit(), not a second call here.
  recordTranscriptCorrection(correctedBy: string, at: Date): Meeting {
    if (this.data.status !== "ENDED") {
      throw new Error("Cannot record a transcript correction for a meeting that hasn't ended");
    }
    if (this.data.transcriptCorrectedAt) {
      throw new Error("Transcript correction already recorded");
    }
    return new Meeting({ ...this.data, transcriptCorrectedAt: at, transcriptCorrectedBy: correctedBy });
  }

  // Stage 2 of 2 — the respective consultant (the appointment's assigned oncologist; enforced
  // by the service layer, not here) reviewing and signing off. This is the actual gate for
  // "eligible to be referenced from a ClinicalNote" (Sprint 4) — a corrected-but-unsigned
  // transcript is not yet trusted. Same hard sequencing rule as ClinicalDecision's QA->Director
  // stages (ADR-0012): stage 2 can never be set while stage 1 is still null, no bypass.
  signOffTranscript(signedOffBy: string, at: Date): Meeting {
    if (!this.data.transcriptCorrectedAt) {
      throw new Error("Cannot sign off a transcript before the Scribe has recorded corrections");
    }
    if (this.data.transcriptSignedOffAt) {
      throw new Error("Transcript already signed off");
    }
    return new Meeting({ ...this.data, transcriptSignedOffAt: at, transcriptSignedOffBy: signedOffBy });
  }

  toJSON() {
    return {
      id: this.data.id,
      appointmentId: this.data.appointmentId,
      provider: this.data.provider,
      roomId: this.data.roomId,
      status: this.data.status,
      endedAt: this.data.endedAt?.toISOString() ?? null,
      dailyRoomExp: this.data.dailyRoomExp?.toISOString() ?? null,
      transcriptCorrectedAt: this.data.transcriptCorrectedAt?.toISOString() ?? null,
      transcriptCorrectedBy: this.data.transcriptCorrectedBy,
      transcriptSignedOffAt: this.data.transcriptSignedOffAt?.toISOString() ?? null,
      transcriptSignedOffBy: this.data.transcriptSignedOffBy,
    };
  }
}
