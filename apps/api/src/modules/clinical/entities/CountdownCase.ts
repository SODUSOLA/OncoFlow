import type { countdownStatusEnum } from "../../../db/enums.js";

type CountdownStatus = (typeof countdownStatusEnum.enumValues)[number];

export interface CountdownCaseData {
  id: string;
  patientId: string;
  currentDay: number;
  status: CountdownStatus;
  labsPromptedAt: Date | null;
  labsUploadedAt: Date | null;
  resultsSentToQaAt: Date | null;
  paymentConfirmedAt: Date | null;
  reminderSentAt: Date | null;
}

// Domain entity for the 7-day countdown case, enforcing its ordered milestones.
export class CountdownCase {
  constructor(private data: CountdownCaseData) {}

  get id() { return this.data.id; }
  get patientId() { return this.data.patientId; }
  get currentDay() { return this.data.currentDay; }
  get status() { return this.data.status; }
  get labsPromptedAt() { return this.data.labsPromptedAt; }
  get labsUploadedAt() { return this.data.labsUploadedAt; }
  get resultsSentToQaAt() { return this.data.resultsSentToQaAt; }
  get paymentConfirmedAt() { return this.data.paymentConfirmedAt; }
  get reminderSentAt() { return this.data.reminderSentAt; }

  // Records that labs were prompted, idempotently.
  labsPrompted(): CountdownCase {
    if (this.data.labsPromptedAt) return this;
    return new CountdownCase({ ...this.data, labsPromptedAt: new Date() });
  }

  // Records that labs were uploaded, requiring the prompt first.
  labsUploaded(): CountdownCase {
    if (!this.data.labsPromptedAt) {
      throw new Error("Cannot upload labs before labs are prompted");
    }
    if (this.data.labsUploadedAt) return this;
    return new CountdownCase({ ...this.data, labsUploadedAt: new Date() });
  }

  // Records that results were sent to QA, requiring the upload first.
  resultsSentToQa(): CountdownCase {
    if (!this.data.labsUploadedAt) {
      throw new Error("Cannot send results to QA before labs are uploaded");
    }
    if (this.data.resultsSentToQaAt) return this;
    return new CountdownCase({ ...this.data, resultsSentToQaAt: new Date() });
  }

  // Records payment confirmation, requiring results to have been sent to QA.
  paymentConfirmed(): CountdownCase {
    if (!this.data.resultsSentToQaAt) {
      throw new Error("Cannot confirm payment before results are sent to QA");
    }
    return new CountdownCase({ ...this.data, paymentConfirmedAt: new Date(), status: "CLEARED" });
  }

  // Decrements the countdown day, never below zero.
  decrementDay(): CountdownCase {
    if (this.data.currentDay <= 0) return this;
    const nextDay = this.data.currentDay - 1;
    const nextStatus = nextDay === 0 ? "ESCALATED" : this.data.status;
    return new CountdownCase({ ...this.data, currentDay: nextDay, status: nextStatus });
  }

  // Marks the case as declined.
  decline(): CountdownCase {
    return new CountdownCase({ ...this.data, status: "DECLINED" });
  }

  // Stamps that a reminder was sent.
  markReminded(): CountdownCase {
    return new CountdownCase({ ...this.data, reminderSentAt: new Date() });
  }

  // Serializes the case for API responses.
  toJSON() {
    return {
      id: this.data.id,
      patientId: this.data.patientId,
      currentDay: this.data.currentDay,
      status: this.data.status,
      labsPromptedAt: this.data.labsPromptedAt?.toISOString() ?? null,
      labsUploadedAt: this.data.labsUploadedAt?.toISOString() ?? null,
      resultsSentToQaAt: this.data.resultsSentToQaAt?.toISOString() ?? null,
      paymentConfirmedAt: this.data.paymentConfirmedAt?.toISOString() ?? null,
      reminderSentAt: this.data.reminderSentAt?.toISOString() ?? null,
    };
  }
}
