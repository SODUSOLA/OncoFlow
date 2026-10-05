import type { specialistEscalationStatusEnum } from "../../../db/enums.js";

type EscalationStatus = (typeof specialistEscalationStatusEnum.enumValues)[number];

// A consult can be scheduled and then resolved, or resolved directly (e.g. the specialist reached the patient another way).
const VALID_TRANSITIONS: Record<EscalationStatus, EscalationStatus[]> = {
  NOTIFIED: ["CONSULT_SCHEDULED", "RESOLVED"],
  CONSULT_SCHEDULED: ["RESOLVED"],
  RESOLVED: [],
};

// Owns the escalation's status transitions so callers can't skip or reverse a step.
export class SpecialistEscalation {
  constructor(private status: EscalationStatus) {}

  // Returns the new status, or throws if the move is illegal.
  transitionTo(next: EscalationStatus): EscalationStatus {
    if (!VALID_TRANSITIONS[this.status].includes(next)) {
      throw new Error(`Invalid escalation transition: ${this.status} → ${next}`);
    }
    this.status = next;
    return next;
  }
}
