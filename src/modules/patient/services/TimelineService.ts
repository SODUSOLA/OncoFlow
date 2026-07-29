import crypto from "node:crypto";
import { PatientTimelineRepository } from "../repository.js";
import type { PatientTimelineEventType } from "../entities/TimelineEvent.js";

const timelineRepo = new PatientTimelineRepository();

export class TimelineService {
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

  async getByPatient(patientId: string) {
    return timelineRepo.findByPatient(patientId);
  }
}

export const timelineService = new TimelineService();
