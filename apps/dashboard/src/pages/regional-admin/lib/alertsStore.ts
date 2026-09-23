import { api } from "../../../lib/api";
import type { CountdownCase, Patient, PublicInquiryMessage } from "../../../lib/types";
import { getIsoWeek } from "./isoWeek";
import { deriveCountdownStatus, isCountdownBreached, classifyInquirySla, isStaffingConflict, WEEKDAY_NAMES } from "./alertRules";

export type AlertSeverity = "critical" | "warning";
export type AlertSource = "countdown" | "staffing" | "inventory" | "inquiry" | "security" | "drug";

export interface RegionAlert {
  id: string;
  source: AlertSource;
  severity: AlertSeverity;
  // Short tag fixed at creation so every consumer shows the identical label instead of re-deriving it.
  badge: string;
  title: string;
  detail: string;
  actionLabel: string;
  actionTo: string;
  // Present for countdown and staffing alerts so callers can filter by region without this store depending on useAuth, avoiding an import cycle.
  facilityId?: string;
}

interface AlertsState {
  alerts: RegionAlert[];
  loading: boolean;
}

// The single alert aggregator behind the Notification Center, the bell dot and Critical Shortages; one shared subscription costs one fetch.
let state: AlertsState = { alerts: [], loading: true };
let inFlight: Promise<void> | null = null;
let loadedForRegion: string | null | undefined = undefined;
const subscribers = new Set<() => void>();
const REFRESH_MS = 60_000;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

// Caps the inquiries checked at the oldest-updated window to avoid an N+1 over hundreds of open inquiries.
const INQUIRY_CHECK_LIMIT = 25;

// Publishes new alert state to every subscriber.
function publish(next: AlertsState): void {
  state = next;
  for (const notify of subscribers) notify();
}

// SLA-breached and escalated countdown cases.
async function countdownAlerts(): Promise<RegionAlert[]> {
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

  return alerts;
}

// Days in the current ISO week that are short of their required nurse count.
async function staffingAlerts(region: string | null): Promise<RegionAlert[]> {
  const alerts: RegionAlert[] = [];
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

  return alerts;
}

// Open facility-level reconciliation variances.
async function inventoryAlerts(region: string | null): Promise<RegionAlert[]> {
  const alerts: RegionAlert[] = [];
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

  return alerts;
}

// Uploads rejected by the virus scan, bounded to recent incidents since they are rare.
async function securityAlerts(): Promise<RegionAlert[]> {
  const alerts: RegionAlert[] = [];
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

  return alerts;
}

// Open inquiries approaching or past their SLA, checked over the oldest-updated window only.
async function inquiryAlerts(): Promise<RegionAlert[]> {
  const openInquiries = await api
    .get<{ inquiries: { id: string; name: string; status: "OPEN" | "CLOSED"; updatedAt: string }[] }>("/admin/inquiries?status=OPEN")
    .then((d) => d.inquiries)
    .catch(() => []);
  const oldestInquiries = [...openInquiries]
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
    .slice(0, INQUIRY_CHECK_LIMIT);
  const inquiryResults = await Promise.all(
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
  return inquiryResults.filter((a): a is RegionAlert => a !== null);
}

interface DrugAlertsResponse {
  lowStock: { scope: "REGIONAL" | "NURSING_OFFICER"; drugId: string; drugName: string; drugStrength: string; quantity: number; reorderThreshold: number; officerId?: string; officerEmail?: string }[];
  losses: { id: string; officerEmail: string; drugName: string; quantityLost: number; reason: string; reportedAt: string }[];
  variances: { id: string; scope: "REGIONAL" | "NURSING_OFFICER"; officerEmail: string | null; drugName: string; variance: number; periodEnd: string }[];
}

// Low stock, recent drug losses and unresolved count variances, all computed server-side by GET /drug-alerts.
async function drugAlerts(): Promise<RegionAlert[]> {
  const data = await api.get<DrugAlertsResponse>("/drug-alerts").catch(() => null);
  if (!data) return [];
  const to = "/dashboard/regional-admin/inventory";
  const low: RegionAlert[] = data.lowStock.map((l) => ({
    id: `drug-low-${l.scope}-${l.officerId ?? "regional"}-${l.drugId}`,
    source: "drug", severity: l.quantity <= 0 ? "critical" : "warning", badge: "LOW STOCK",
    title: `${l.drugName} ${l.drugStrength}`,
    detail: `${l.scope === "REGIONAL" ? "Regional stock" : l.officerEmail} is at ${l.quantity} (reorder at ${l.reorderThreshold}).`,
    actionLabel: "View Stock", actionTo: to,
  }));
  const losses: RegionAlert[] = data.losses.map((l) => ({
    id: `drug-loss-${l.id}`,
    source: "drug", severity: "warning", badge: "DRUG LOSS",
    title: `${l.quantityLost} × ${l.drugName} lost`,
    detail: `${l.officerEmail} reported ${l.reason.toLowerCase()}, ${new Date(l.reportedAt).toLocaleString()}.`,
    actionLabel: "View Losses", actionTo: to,
  }));
  const variances: RegionAlert[] = data.variances.map((v) => ({
    id: `drug-variance-${v.id}`,
    source: "drug", severity: "warning", badge: "STOCK VARIANCE",
    title: `${v.drugName} count off by ${v.variance > 0 ? "+" : ""}${v.variance}`,
    detail: `${v.scope === "REGIONAL" ? "Regional stock" : v.officerEmail}, counted for ${v.periodEnd}.`,
    actionLabel: "Review Count", actionTo: to,
  }));
  return [...low, ...losses, ...variances];
}

// Every alert source, each returning its own alerts; adding a source means adding one entry here, not new branches below.
const ALERT_SOURCES: ((region: string | null) => Promise<RegionAlert[]>)[] = [
  countdownAlerts, staffingAlerts, inventoryAlerts, securityAlerts, drugAlerts, inquiryAlerts,
];

// Runs every source in parallel and merges the results; a failing source contributes nothing rather than hiding the rest.
async function fetchAlerts(region: string | null): Promise<RegionAlert[]> {
  const results = await Promise.all(ALERT_SOURCES.map((source) => source(region).catch(() => [] as RegionAlert[])));
  return results.flat();
}

// Loads alerts for a region, sharing an in-flight request.
function load(region: string | null): Promise<void> {
  if (inFlight && loadedForRegion === region) return inFlight;
  loadedForRegion = region;
  inFlight = fetchAlerts(region)
    .then((alerts) => publish({ alerts, loading: false }))
    .catch(() => publish({ alerts: [], loading: false }))
    .finally(() => { inFlight = null; });
  return inFlight;
}

// Subscribes to alert changes and starts loading and refreshing on first use.
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

// Returns the current alert state.
export function getAlertsSnapshot(): AlertsState {
  return state;
}
