// [append-only] — the 5 fixed mandatory triage questions (Blueprint §2.3). Once completed,
// a TriageChecklist is never edited; a correction would be a new Conversation's checklist,
// not a mutation of this one.
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
