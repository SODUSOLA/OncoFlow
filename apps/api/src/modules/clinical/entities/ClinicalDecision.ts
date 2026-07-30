import type { clinicalDecisionEnum } from "../../../db/enums.js";

type DecisionType = (typeof clinicalDecisionEnum.enumValues)[number];

export interface ClinicalDecisionData {
  id: string;
  labResultId: string;
  qaRecommendation: DecisionType | null;
  qaReason: string | null;
  qaDecidedBy: string | null;
  qaDecidedAt: Date | null;
  finalDecision: DecisionType | null;
  finalReason: string | null;
  directorId: string | null;
  directorDecidedAt: Date | null;
}

// ADR-0012 two-stage sequential decision: stage 1 (qa_*) is a Quality Assurance Officer's
// recommendation; stage 2 (final_decision / director_*) is a State Clinical Director's final
// call, and can only be set once stage 1 is complete. This is the single most important
// invariant in the clinical workflow — enforced here, not just documented.
export class ClinicalDecision {
  constructor(private data: ClinicalDecisionData) {}

  get id() { return this.data.id; }
  get labResultId() { return this.data.labResultId; }
  get qaRecommendation() { return this.data.qaRecommendation; }
  get qaReason() { return this.data.qaReason; }
  get qaDecidedBy() { return this.data.qaDecidedBy; }
  get qaDecidedAt() { return this.data.qaDecidedAt; }
  get finalDecision() { return this.data.finalDecision; }
  get finalReason() { return this.data.finalReason; }
  get directorId() { return this.data.directorId; }
  get directorDecidedAt() { return this.data.directorDecidedAt; }

  recordQaRecommendation(recommendation: DecisionType, reason: string | null, qaUserId: string): ClinicalDecision {
    if (this.data.qaDecidedAt) {
      throw new Error("QA has already recorded a recommendation for this decision");
    }
    return new ClinicalDecision({
      ...this.data,
      qaRecommendation: recommendation,
      qaReason: reason,
      qaDecidedBy: qaUserId,
      qaDecidedAt: new Date(),
    });
  }

  // The hard sequencing rule (build plan F3.6): final_decision can never be set while
  // qa_decided_at IS NULL. No bypass, no override — Stage 2 literally has nothing to review
  // without Stage 1.
  recordFinalDecision(decision: DecisionType, reason: string | null, directorUserId: string): ClinicalDecision {
    if (!this.data.qaDecidedAt) {
      throw new Error("Cannot record a final decision before QA has recorded a recommendation");
    }
    if (this.data.directorDecidedAt) {
      throw new Error("A final decision has already been recorded for this decision");
    }
    return new ClinicalDecision({
      ...this.data,
      finalDecision: decision,
      finalReason: reason,
      directorId: directorUserId,
      directorDecidedAt: new Date(),
    });
  }

  toJSON() {
    return {
      id: this.data.id,
      labResultId: this.data.labResultId,
      qaRecommendation: this.data.qaRecommendation,
      qaReason: this.data.qaReason,
      qaDecidedBy: this.data.qaDecidedBy,
      qaDecidedAt: this.data.qaDecidedAt?.toISOString() ?? null,
      finalDecision: this.data.finalDecision,
      finalReason: this.data.finalReason,
      directorId: this.data.directorId,
      directorDecidedAt: this.data.directorDecidedAt?.toISOString() ?? null,
    };
  }
}
