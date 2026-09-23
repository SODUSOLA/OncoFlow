import crypto from "node:crypto";
import { PatientTimelineRepository } from "../repository.js";
import type { PatientTimelineEventType } from "../entities/TimelineEvent.js";

const timelineRepo = new PatientTimelineRepository();

// Business logic for the patient timeline.
export class TimelineService {
  // Records a timeline entry for a patient.
  async record(data: {
    patientId: string;
    eventType: PatientTimelineEventType;
    referenceId: string;
  }) {
    await timelineRepo.create({
      id: crypto.randomUUID(),
      patientId: data.patientId,
      eventType: data.eventType,
      referenceId: data.referenceId,
    });
  }

  // Lists a patient's timeline entries.
  async getByPatient(patientId: string) {
    return timelineRepo.findByPatient(patientId);
  }
}

export const timelineService = new TimelineService();
