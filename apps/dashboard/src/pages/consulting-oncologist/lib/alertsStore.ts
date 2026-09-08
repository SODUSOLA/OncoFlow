import { api } from "../../../lib/api";
import type { Appointment, Meeting, Patient } from "../../../lib/types";
import { isCriticalMetrics, TRIGGER_LABEL, type CaseLockData, type ClinicalMetricsSnapshot } from "./clinicalTypes";
import { derivePostConsultSlaState } from "./consultSla";

export type ConsultAlertSeverity = "critical" | "warning";
export type ConsultAlertSource = "case-lock" | "clinical-metrics" | "post-consult-sla";

export interface ConsultAlert {
  id: string;
  source: ConsultAlertSource;
  severity: ConsultAlertSeverity;
  badge: string;
  title: string;
  detail: string;
  actionLabel: string;
  actionTo: string;
}

interface AlertsState { alerts: ConsultAlert[]; loading: boolean }

// Phase 8's "shared alert aggregator concept, extended to cover consult-specific alert types" —
// same shared-subscription/bounded-fetch shape as pages/regional-admin/lib/alertsStore.ts (one
// fetch serves every mounted consumer), scoped to THIS consultant's own patients rather than a
// region, and reading real signals only: an active case_lock, a critical clinical-metrics
// snapshot (same CRCL_CASE_LOCK_THRESHOLD/EGFR_CASE_LOCK_STAGES the backend uses to open a lock),
// and a post-call summary past its finalize SLA. No detection logic is reinvented here.
let state: AlertsState = { alerts: [], loading: true };
let inFlight: Promise<void> | null = null;
let loadedForUser: string | null | undefined = undefined;
const subscribers = new Set<() => void>();
const REFRESH_MS = 60_000;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

// Bounded the same way Regional Admin bounds its inquiry-SLA check — a consultant's full
// appointment history can be large; only a recent window is a real, checkable worklist.
const WINDOW_MS_BEFORE = 3 * 24 * 3_600_000;
const WINDOW_MS_AFTER = 5 * 24 * 3_600_000;
const APPOINTMENT_CHECK_LIMIT = 25;

function publish(next: AlertsState): void {
  state = next;
  for (const notify of subscribers) notify();
}

async function fetchAlerts(userId: string, facilityId: string | null): Promise<ConsultAlert[]> {
  if (!facilityId) return [];
  const alerts: ConsultAlert[] = [];

  const [appointments, patients] = await Promise.all([
    api.get<{ appointments: Appointment[] }>(`/appointments?facilityId=${facilityId}`).then((d) => d.appointments).catch(() => []),
    api.get<{ patients: Patient[] }>("/patients?facilityId=all").then((d) => d.patients).catch(() => []),
  ]);
  const patientById = new Map(patients.map((p) => [p.id, p]));
  const patientLabel = (id: string) => {
    const p = patientById.get(id);
    return p ? `${p.firstName} ${p.lastName}` : id.slice(0, 8);
  };

  const now = Date.now();
  const mine = appointments
    .filter((a) => a.oncologistId === userId)
    .filter((a) => {
      const t = new Date(a.scheduledAt).getTime();
      return t >= now - WINDOW_MS_BEFORE && t <= now + WINDOW_MS_AFTER;
    })
    .slice(0, APPOINTMENT_CHECK_LIMIT);

  const patientIds = [...new Set(mine.map((a) => a.patientId))];

  await Promise.all(patientIds.map(async (patientId) => {
    const [caseLock, metrics] = await Promise.all([
      api.get<{ caseLock: CaseLockData | null }>(`/case-locks/active?patientId=${patientId}`).then((d) => d.caseLock).catch(() => null),
      api.get<{ snapshot: ClinicalMetricsSnapshot | null }>(`/clinical-metrics/current?patientId=${patientId}`).then((d) => d.snapshot).catch(() => null),
    ]);
    if (caseLock) {
      alerts.push({
        id: `case-lock-${caseLock.id}`,
        source: "case-lock",
        severity: "critical",
        badge: "CASE LOCKED",
        title: patientLabel(patientId),
        detail: `${TRIGGER_LABEL[caseLock.triggeredBy] ?? caseLock.triggeredBy} — cycle administration blocked.`,
        actionLabel: "Open Patient File",
        actionTo: `/dashboard/consulting-oncologist/patient/${patientId}`,
      });
    } else if (isCriticalMetrics(metrics)) {
      alerts.push({
        id: `metrics-${patientId}`,
        source: "clinical-metrics",
        severity: "critical",
        badge: "LAB FLAG",
        title: patientLabel(patientId),
        detail: "Critical CrCl/eGFR on the latest clinical metrics snapshot.",
        actionLabel: "Open Patient File",
        actionTo: `/dashboard/consulting-oncologist/patient/${patientId}`,
      });
    }
  }));

  await Promise.all(mine.map(async (appointment) => {
    const meeting = await api.get<{ meeting: Meeting }>(`/meetings?appointmentId=${appointment.id}`).then((d) => d.meeting).catch(() => null);
    if (!meeting || meeting.status !== "ENDED" || !meeting.endedAt) return;
    const summary = await api.get<{ summary: unknown }>(`/clinical-notes/by-meeting/${meeting.id}`).then((d) => d.summary).catch(() => undefined);
    const slaState = derivePostConsultSlaState(meeting.endedAt, !!summary);
    if (slaState !== "warning" && slaState !== "breached") return;
    alerts.push({
      id: `post-consult-${meeting.id}`,
      source: "post-consult-sla",
      severity: slaState === "breached" ? "critical" : "warning",
      badge: slaState === "breached" ? "SLA BREACHED" : "SLA WARNING",
      title: patientLabel(appointment.patientId),
      detail: slaState === "breached"
        ? "Post-call summary overdue — past the 24h finalize window."
        : "Post-call summary approaching its 24h finalize window.",
      actionLabel: "Open Summary",
      actionTo: `/dashboard/consulting-oncologist/consult/${appointment.id}/summary`,
    });
  }));

  return alerts;
}

function load(userId: string, facilityId: string | null): Promise<void> {
  if (inFlight && loadedForUser === userId) return inFlight;
  loadedForUser = userId;
  inFlight = fetchAlerts(userId, facilityId)
    .then((alerts) => publish({ alerts, loading: false }))
    .catch(() => publish({ alerts: [], loading: false }))
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function subscribeToConsultAlerts(userId: string, facilityId: string | null, onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  if (loadedForUser === undefined || loadedForUser !== userId) void load(userId, facilityId);
  if (!refreshTimer) {
    refreshTimer = setInterval(() => void load(loadedForUser ?? userId, facilityId), REFRESH_MS);
  }
  return () => {
    subscribers.delete(onStoreChange);
    if (subscribers.size === 0 && refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };
}

export function getConsultAlertsSnapshot(): AlertsState {
  return state;
}
