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
  // Optional so fixtures predating the column still compile; real rows always have it.
  endedAt?: Date | null;
  dailyRoomExp?: Date | null;
  transcriptCorrectedAt: Date | null;
  transcriptCorrectedBy: string | null;
  transcriptSignedOffAt: Date | null;
  transcriptSignedOffBy: string | null;
}

// Domain entity for a video meeting and its status and transcript sign-off stages.
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

  // Returns a copy in the target status, or throws if the transition is illegal.
  transitionTo(target: MeetingStatus): Meeting {
    const allowed = VALID_TRANSITIONS[this.data.status];
    if (!allowed.includes(target)) {
      throw new Error(`Cannot transition from ${this.data.status} to ${target}`);
    }
    return new Meeting({ ...this.data, status: target });
  }

  // Stage 1 of transcript trust: the Scribe's corrections, allowed once after the call ends; later fixes go through Transcript.edit().
  recordTranscriptCorrection(correctedBy: string, at: Date): Meeting {
    if (this.data.status !== "ENDED") {
      throw new Error("Cannot record a transcript correction for a meeting that hasn't ended");
    }
    if (this.data.transcriptCorrectedAt) {
      throw new Error("Transcript correction already recorded");
    }
    return new Meeting({ ...this.data, transcriptCorrectedAt: at, transcriptCorrectedBy: correctedBy });
  }

  // Stage 2: the assigned consultant's sign-off, which makes a transcript citable and can't precede stage 1 (same rule as ADR-0012).
  signOffTranscript(signedOffBy: string, at: Date): Meeting {
    if (!this.data.transcriptCorrectedAt) {
      throw new Error("Cannot sign off a transcript before the Scribe has recorded corrections");
    }
    if (this.data.transcriptSignedOffAt) {
      throw new Error("Transcript already signed off");
    }
    return new Meeting({ ...this.data, transcriptSignedOffAt: at, transcriptSignedOffBy: signedOffBy });
  }

  // Serializes the meeting for API responses.
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
