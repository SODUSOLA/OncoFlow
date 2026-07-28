import type { countdownStatusEnum } from "../../../db/enums";

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

  labsPrompted(): CountdownCase {
    if (this.data.labsPromptedAt) return this;
    return new CountdownCase({ ...this.data, labsPromptedAt: new Date() });
  }

  labsUploaded(): CountdownCase {
    if (!this.data.labsPromptedAt) {
      throw new Error("Cannot upload labs before labs are prompted");
    }
    if (this.data.labsUploadedAt) return this;
    return new CountdownCase({ ...this.data, labsUploadedAt: new Date() });
  }

  resultsSentToQa(): CountdownCase {
    if (!this.data.labsUploadedAt) {
      throw new Error("Cannot send results to QA before labs are uploaded");
    }
    if (this.data.resultsSentToQaAt) return this;
    return new CountdownCase({ ...this.data, resultsSentToQaAt: new Date() });
  }

  paymentConfirmed(): CountdownCase {
    if (!this.data.resultsSentToQaAt) {
      throw new Error("Cannot confirm payment before results are sent to QA");
    }
    return new CountdownCase({ ...this.data, paymentConfirmedAt: new Date(), status: "CLEARED" });
  }

  decrementDay(): CountdownCase {
    if (this.data.currentDay <= 0) return this;
    const nextDay = this.data.currentDay - 1;
    const nextStatus = nextDay === 0 ? "ESCALATED" : this.data.status;
    return new CountdownCase({ ...this.data, currentDay: nextDay, status: nextStatus });
  }

  decline(): CountdownCase {
    return new CountdownCase({ ...this.data, status: "DECLINED" });
  }

  markReminded(): CountdownCase {
    return new CountdownCase({ ...this.data, reminderSentAt: new Date() });
  }

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
