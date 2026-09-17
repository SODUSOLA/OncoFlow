import { api } from "../../../lib/api";
import type { CountdownCase, Patient, PublicInquiryMessage } from "../../../lib/types";
import { getIsoWeek } from "./isoWeek";
import { deriveCountdownStatus, isCountdownBreached, classifyInquirySla, isStaffingConflict, WEEKDAY_NAMES } from "./alertRules";

export type AlertSeverity = "critical" | "warning";
export type AlertSource = "countdown" | "staffing" | "inventory" | "inquiry" | "security";

export interface RegionAlert {
  id: string;
  source: AlertSource;
  severity: AlertSeverity;
  /** Short tag rendered on the card, e.g. "SLA BREACHED" / "CONFLICT" — fixed at creation so
   *  every consumer (Notification Center, the Scheduling page) shows the identical label rather
   *  than each re-deriving it from `source`. */
  badge: string;
  title: string;
  detail: string;
  actionLabel: string;
  actionTo: string;
  /** Present for countdown/staffing alerts so callers can filter by their own region scope
   *  (facilityIdsInRegion) without this store depending on useRegionScope/useAuth — same
   *  cycle-avoidance reasoning as facilityStore.ts. Inventory (already region-filtered
   *  server-side by the `region` load param) and inquiries (not facility-scoped at all in this
   *  system) omit it. */
  facilityId?: string;
}

interface AlertsState {
  alerts: RegionAlert[];
  loading: boolean;
}

// The single real aggregator behind ONCOFLOW_REGIONAL_ADMIN_BUILD_GUIDE.md's cross-cutting rule:
// Notification Center, the top bar's bell dot, and Scheduling's Critical Shortages card all read
// from this one fetch rather than each re-deriving breach/conflict state. A shared subscription
// (same pattern as facilityStore.ts) means three mounted consumers cost one fetch, not three.
let state: AlertsState = { alerts: [], loading: true };
let inFlight: Promise<void> | null = null;
let loadedForRegion: string | null | undefined = undefined;
const subscribers = new Set<() => void>();
const REFRESH_MS = 60_000;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

// Fetching every open inquiry's message thread to check its SLA is an N+1 — this dev database
// alone has 200+ open inquiries. Bounding to the oldest-updated-first window is both cheaper and
// strictly more correct: an inquiry updated seconds ago cannot be breaching a 5-minute SLA yet.
const INQUIRY_CHECK_LIMIT = 25;

function publish(next: AlertsState): void {
  state = next;
  for (const notify of subscribers) notify();
}

async function fetchAlerts(region: string | null): Promise<RegionAlert[]> {
  const alerts: RegionAlert[] = [];

  const [cases, patients] = await Promise.all([
    api.get<{ cases: CountdownCase[] }>("/countdown-cases?scope=overview").then((d) => d.cases).catch(() => []),
    api.get<{ patients: Patient[] }>("/patients?facilityId=all").then((d) => d.patients).catch(() => []),
  ]);
  const patientById = new Map(patients.map((p) => [p.id, p]));
  for (const c of cases) {
    const status = deriveCountdownStatus(c);
    if (!isCountdownBreached(status)) continue;
    const patient = patientById.get(c.patientId);
    alerts.push({
      id: `countdown-${c.id}`,
      source: "countdown",
      severity: "critical",
      badge: "SLA BREACHED",
      title: patient ? `${patient.firstName} ${patient.lastName}` : c.patientId.slice(0, 8),
      detail: `7-Day Countdown case — ${status === "escalated" ? "Escalated" : "Overdue bloodwork"}.`,
      actionLabel: "Open Countdown",
      actionTo: "/dashboard/regional-admin/countdown",
      facilityId: patient?.facilityId,
    });
  }

  const { isoYear, isoWeek } = getIsoWeek(new Date());
  const staffingQ = new URLSearchParams({ isoYear: String(isoYear), isoWeek: String(isoWeek) });
  if (region) staffingQ.set("region", region);
  const staffingRows = await api
    .get<{ facilities: { facility: { id: string; name: string }; weekdays: { weekday: number; requiredCount: number; assigned: unknown[] }[] }[] }>(
      `/staffing/week?${staffingQ.toString()}`,
    )
    .then((d) => d.facilities)
    .catch(() => []);
  for (const row of staffingRows) {
    for (const day of row.weekdays) {
      if (!isStaffingConflict(day)) continue;
      alerts.push({
        id: `staffing-${row.facility.id}-${day.weekday}`,
        source: "staffing",
        severity: "critical",
        badge: "CONFLICT",
        title: row.facility.name,
        detail: `${day.assigned.length}/${day.requiredCount} nurses assigned for ${WEEKDAY_NAMES[day.weekday] ?? `day ${day.weekday}`}.`,
        actionLabel: "Assign Nurse",
        actionTo: "/dashboard/regional-admin/scheduling",
        facilityId: row.facility.id,
      });
    }
  }

  const variancesOpen = await api
    .get<{ variancesOpen: number }>(`/inventory/overview${region ? `?region=${encodeURIComponent(region)}` : ""}`)
    .then((d) => d.variancesOpen)
    .catch(() => 0);
  if (variancesOpen > 0) {
    alerts.push({
      id: "inventory-variance",
      source: "inventory",
      severity: "warning",
      badge: "RECONCILIATION",
      title: "Inventory variance",
      detail: `${variancesOpen} ${variancesOpen === 1 ? "variance" : "variances"} awaiting review.`,
      actionLabel: "View Ledger",
      actionTo: "/dashboard/regional-admin/inventory",
    });
  }

  // ONCOFLOW_NURSING_OFFICER_BUILD_GUIDE.md Finding 3 — a rejected (INFECTED-flagged) upload
  // feeds this same aggregator as a new source, not a new notification system. Bounded to
  // recent incidents only (the endpoint already caps at 50 by default) — this is a rare event,
  // not something that needs its own pagination here.
  const incidents = await api
    .get<{ incidents: { id: string; incidentReference: string; fileScanResult: string; createdAt: string }[] }>("/security-incidents")
    .then((d) => d.incidents)
    .catch(() => []);
  for (const incident of incidents) {
    alerts.push({
      id: `security-${incident.id}`,
      source: "security",
      severity: "critical",
      badge: "SECURITY THREAT",
      title: `Upload rejected — ${incident.incidentReference}`,
      detail: `A file was flagged ${incident.fileScanResult} by the safety scan and blocked, ${new Date(incident.createdAt).toLocaleString()}.`,
      actionLabel: "View Incident",
      actionTo: "/dashboard/regional-admin/security-incidents",
    });
  }

  const openInquiries = await api
    .get<{ inquiries: { id: string; name: string; status: "OPEN" | "CLOSED"; updatedAt: string }[] }>("/admin/inquiries?status=OPEN")
    .then((d) => d.inquiries)
    .catch(() => []);
  const oldestInquiries = [...openInquiries]
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
    .slice(0, INQUIRY_CHECK_LIMIT);
  const inquiryAlerts = await Promise.all(
    oldestInquiries.map(async (inq) => {
      const msgs = await api
        .get<{ messages: PublicInquiryMessage[] }>(`/admin/inquiries/${inq.id}/messages`)
        .then((r) => r.messages)
        .catch(() => []);
      const last = msgs[msgs.length - 1];
      if (!last || last.senderType !== "VISITOR") return null;
      const minutesSince = Math.floor((Date.now() - new Date(last.createdAt).getTime()) / 60_000);
      const sla = classifyInquirySla(minutesSince);
      if (sla === "normal") return null;
      const alert: RegionAlert = {
        id: `inquiry-${inq.id}`,
        source: "inquiry",
        severity: sla === "breached" ? "critical" : "warning",
        badge: sla === "breached" ? "SLA BREACHED" : "SLA WARNING",
        title: inq.name,
        detail: sla === "breached"
          ? `Open inquiry, no staff reply for ${minutesSince}m — past the SLA.`
          : `Open inquiry approaching its SLA limit (${minutesSince}m, no reply yet).`,
        actionLabel: sla === "breached" ? "Open Chat" : "Reply",
        actionTo: "/dashboard/regional-admin/inquiry",
      };
      return alert;
    }),
  );
  alerts.push(...inquiryAlerts.filter((a): a is RegionAlert => a !== null));

  return alerts;
}

function load(region: string | null): Promise<void> {
  if (inFlight && loadedForRegion === region) return inFlight;
  loadedForRegion = region;
  inFlight = fetchAlerts(region)
    .then((alerts) => publish({ alerts, loading: false }))
    .catch(() => publish({ alerts: [], loading: false }))
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function subscribeToAlerts(region: string | null, onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  if (loadedForRegion === undefined || loadedForRegion !== region) void load(region);
  if (!refreshTimer) {
    refreshTimer = setInterval(() => void load(loadedForRegion ?? null), REFRESH_MS);
  }
  return () => {
    subscribers.delete(onStoreChange);
    if (subscribers.size === 0 && refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };
}

export function getAlertsSnapshot(): AlertsState {
  return state;
}
