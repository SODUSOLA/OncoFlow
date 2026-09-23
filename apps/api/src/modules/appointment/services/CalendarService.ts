import { AppointmentRepository } from "../repository.js";
// Intentional cross-module read (FR-24): the unified calendar merges appointments with countdown-case key dates.
import { CountdownCaseRepository } from "../../clinical/index.js";
import { PatientRepository } from "../../patient/index.js";

export type CalendarItemKind =
  | "appointment"
  | "countdown_labs_prompted"
  | "countdown_results_sent_to_qa"
  | "countdown_payment_confirmed"
  | "countdown_reminder_sent";

export interface CalendarItem {
  kind: CalendarItemKind;
  date: string;
  patientId: string;
  facilityId: string | null;
  referenceId: string;
  status: string;
}

const appointmentRepo = new AppointmentRepository();
const countdownRepo = new CountdownCaseRepository();
const patientRepo = new PatientRepository();

// Builds the merged calendar of appointments and case dates.
export class CalendarService {
  // Scope is resolved by the controller, never from client params; passing neither id returns everything (SUPER_ADMIN only).
  async getUnifiedCalendar(scope: { facilityId?: string; patientId?: string }): Promise<CalendarItem[]> {
    const items: CalendarItem[] = [];

    const appointments = scope.patientId
      ? await appointmentRepo.findByPatient(scope.patientId)
      : scope.facilityId
        ? await appointmentRepo.findByFacility(scope.facilityId)
        : await appointmentRepo.findAll();

    for (const a of appointments) {
      items.push({
        kind: "appointment",
        date: a.scheduledAt.toISOString(),
        patientId: a.patientId,
        facilityId: a.facilityId,
        referenceId: a.id,
        status: a.status,
      });
    }

    // PhysicalCase isn't merged yet (no repository until Sprint 4); adding it later is one more block like these.
    let countdownCases;
    if (scope.patientId) {
      countdownCases = await countdownRepo.findByPatient(scope.patientId);
    } else if (scope.facilityId) {
      const patients = await patientRepo.findByFacility(scope.facilityId);
      countdownCases = await countdownRepo.findActiveByPatientIds(patients.map((p) => p.id));
    } else {
      countdownCases = await countdownRepo.findActive();
    }

    const facilityByPatientId = new Map<string, string>();
    if (!scope.patientId) {
      const patients = scope.facilityId
        ? await patientRepo.findByFacility(scope.facilityId)
        : [];
      for (const p of patients) facilityByPatientId.set(p.id, p.facilityId);
    }

    const countdownDateFields: { field: keyof typeof countdownCases[number]; kind: CalendarItemKind }[] = [
      { field: "labsPromptedAt", kind: "countdown_labs_prompted" },
      { field: "resultsSentToQaAt", kind: "countdown_results_sent_to_qa" },
      { field: "paymentConfirmedAt", kind: "countdown_payment_confirmed" },
      { field: "reminderSentAt", kind: "countdown_reminder_sent" },
    ];

    for (const c of countdownCases) {
      for (const { field, kind } of countdownDateFields) {
        const value = c[field];
        if (value instanceof Date) {
          items.push({
            kind,
            date: value.toISOString(),
            patientId: c.patientId,
            facilityId: facilityByPatientId.get(c.patientId) ?? null,
            referenceId: c.id,
            status: c.status,
          });
        }
      }
    }

    items.sort((x, y) => x.date.localeCompare(y.date));
    return items;
  }
}
