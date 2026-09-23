// Append-only: the five mandatory triage answers are never edited; a correction is a new conversation's checklist.
export interface TriageChecklistData {
  id: string;
  conversationId: string;
  completedBy: string;
  completedAt: Date;
  presentingComplaint: string;
  duration: string;
  functionalImpact: string;
  priorMeasures: string;
  canTalkWalkEat: string;
}

// Domain entity for a completed triage checklist.
export class TriageChecklist {
  constructor(private data: TriageChecklistData) {}

  get id() { return this.data.id; }
  get conversationId() { return this.data.conversationId; }
  get completedBy() { return this.data.completedBy; }
  get completedAt() { return this.data.completedAt; }
  get presentingComplaint() { return this.data.presentingComplaint; }
  get duration() { return this.data.duration; }
  get functionalImpact() { return this.data.functionalImpact; }
  get priorMeasures() { return this.data.priorMeasures; }
  get canTalkWalkEat() { return this.data.canTalkWalkEat; }

  // Serializes the checklist for API responses.
  toJSON() {
    return {
      id: this.data.id,
      conversationId: this.data.conversationId,
      completedBy: this.data.completedBy,
      completedAt: this.data.completedAt.toISOString(),
      presentingComplaint: this.data.presentingComplaint,
      duration: this.data.duration,
      functionalImpact: this.data.functionalImpact,
      priorMeasures: this.data.priorMeasures,
      canTalkWalkEat: this.data.canTalkWalkEat,
    };
  }
}
