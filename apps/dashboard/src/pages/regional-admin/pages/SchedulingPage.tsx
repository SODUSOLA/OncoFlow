import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, TriangleAlert, ChevronLeft, ChevronRight, LayoutList, Map as MapIcon, X } from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import type { Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { cn } from "../../../lib/utils";
import { useRegionScope } from "../lib/useRegionScope";
import { getIsoWeek } from "../lib/isoWeek";
import { isStaffingConflict } from "../lib/alertRules";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const PAGE_SIZE = 5;
const AVATAR_COLORS = ["bg-blue-100 text-blue-700", "bg-purple-100 text-purple-700", "bg-teal-100 text-teal-700", "bg-orange-100 text-orange-700"];

// Returns the uppercase first letter of an email for an avatar.
function initialOf(email: string) {
  return email.slice(0, 1).toUpperCase();
}

// A static decorative diamond around the utilization number, per the design system, not a proportional gauge.
function UtilizationDiamond({ percent }: { percent: number }) {
  const color = percent < 80 ? "#E67E22" : "#2D6A4F";
  return (
    <svg viewBox="0 0 100 100" className="size-16 shrink-0">
      <rect x="18" y="18" width="64" height="64" rx="8" transform="rotate(45 50 50)" fill="none" stroke={color} strokeWidth="4" />
    </svg>
  );
}

interface WeekOverviewDay {
  weekday: number;
  requiredCount: number;
  assigned: { userId: string; email: string; published: boolean }[];
}
interface WeekOverviewRow {
  facility: { id: string; name: string; region: string };
  weekdays: WeekOverviewDay[];
}
interface Nurse { id: string; email: string }
interface TransferRequestRow {
  id: string;
  patientId: string;
  fromFacilityId: string;
  toFacilityId: string;
  requestedBy: string;
  approvedBy: string | null;
  status: "PENDING" | "APPROVED" | "DECLINED";
  createdAt: string;
}

const TRANSFER_STATUS_VARIANT: Record<TransferRequestRow["status"], "warning" | "success" | "critical"> = {
  PENDING: "warning",
  APPROVED: "success",
  DECLINED: "critical",
};

// Transfer panel isn't in the new mockups but is shipped functionality, so it's kept and retokened rather than removed.
function TransferPanel({ patients }: { patients: Patient[] }) {
  const { user } = useAuth();
  const { region, facilitiesInRegion, loading: scopeLoading } = useRegionScope();
  const [transfers, setTransfers] = useState<TransferRequestRow[]>([]);
  const [patientId, setPatientId] = useState("");
  const [fromFacilityId, setFromFacilityId] = useState("");
  const [toFacilityId, setToFacilityId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Loads transfer requests for the region.
  function loadTransfers() {
    const q = region ? `?region=${encodeURIComponent(region)}` : "";
    api.get<{ transfers: TransferRequestRow[] }>(`/transfers${q}`).then((d) => setTransfers(d.transfers)).catch(() => {});
  }

  useEffect(() => {
    if (scopeLoading) return;
    loadTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, scopeLoading]);

  // Submits a new patient transfer request.
  async function submitTransfer() {
    if (!patientId || !fromFacilityId || !toFacilityId) return;
    setSubmitting(true);
    setResult(null);
    try {
      await api.post("/transfers", { patientId, fromFacilityId, toFacilityId });
      setResult("Transfer request submitted");
      setPatientId("");
      setFromFacilityId("");
      setToFacilityId("");
      loadTransfers();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Failed to submit transfer request");
    } finally {
      setSubmitting(false);
    }
  }

  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const facilityById = useMemo(() => new Map(facilitiesInRegion.map((f) => [f.id, f])), [facilitiesInRegion]);

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card className="border-admin-border p-5">
        <p className="text-admin-body-sm font-semibold text-admin-text">Initiate facility transfer</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-admin-caption font-medium text-admin-text-secondary">Patient</label>
            <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className="w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm">
              <option value="">Select patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.firstName} {p.lastName} · {p.uniquePatientId}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-admin-caption font-medium text-admin-text-secondary">From facility</label>
              <select value={fromFacilityId} onChange={(e) => setFromFacilityId(e.target.value)} className="w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm">
                <option value="">Select...</option>
                {facilitiesInRegion.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-admin-caption font-medium text-admin-text-secondary">To facility</label>
              <select value={toFacilityId} onChange={(e) => setToFacilityId(e.target.value)} className="w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm">
                <option value="">Select...</option>
                {facilitiesInRegion.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
          <Button
            onClick={submitTransfer}
            loading={submitting}
            disabled={!patientId || !fromFacilityId || !toFacilityId}
            className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90"
          >
            Submit for approval
          </Button>
          {result && <p className={cn("text-admin-body-sm", result.includes("submitted") ? "text-admin-success" : "text-admin-danger")}>{result}</p>}
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-admin-sm border border-admin-border bg-admin-card-alt p-3">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-admin-text-secondary" aria-hidden="true" />
          <p className="text-admin-caption text-admin-text-secondary">
            You initiate; someone else approves. Your own requests appear below as read-only — the approve control is never rendered for the initiator.
          </p>
        </div>
      </Card>

      <Card className="overflow-hidden border-admin-border">
        <div className="border-b border-admin-border px-5 py-3.5">
          <p className="text-admin-body-sm font-semibold text-admin-text">Transfer requests in region</p>
        </div>
        {transfers.length === 0 ? (
          <div className="p-8 text-center text-admin-body-sm text-admin-text-secondary">No transfer requests</div>
        ) : (
          <ul className="divide-y divide-admin-border">
            {transfers.map((t) => {
              const patient = patientById.get(t.patientId);
              const isOwn = t.requestedBy === user?.id;
              return (
                <li key={t.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-admin-body-sm font-medium text-admin-text">
                        {patient ? `${patient.firstName} ${patient.lastName}` : t.patientId.slice(0, 8)}
                      </p>
                      <p className="text-admin-caption text-admin-text-secondary">
                        {facilityById.get(t.fromFacilityId)?.name ?? "—"} → {facilityById.get(t.toFacilityId)?.name ?? "—"}
                      </p>
                    </div>
                    <Badge variant={TRANSFER_STATUS_VARIANT[t.status]}>{t.status}</Badge>
                  </div>
                  {isOwn && t.status === "PENDING" && (
                    <p className="mt-1 text-admin-micro text-admin-text-secondary">Approval blocked — initiator</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// Row severity from the share of short weekdays, driving both the action button and cell styling from one function.
type RowSeverity = "none" | "partial" | "critical";
// Classifies a facility's week as none, partial or critical.
function rowSeverity(row: WeekOverviewRow): RowSeverity {
  const shortDays = row.weekdays.slice(0, 5).filter(isStaffingConflict).length;
  if (shortDays === 0) return "none";
  if (shortDays >= 3) return "critical";
  return "partial";
}

// Scheduling page with the weekly staffing grid and transfer panel.
export default function SchedulingPage() {
  const { isoYear, isoWeek } = useMemo(() => getIsoWeek(new Date()), []);
  const { region, facilitiesInRegion, loading: scopeLoading } = useRegionScope();
  const [rows, setRows] = useState<WeekOverviewRow[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  // The facility dialog: which facility is open and, once the admin starts assigning, which weekday.
  const [dialog, setDialog] = useState<{ facilityId: string; weekday: number | null } | null>(null);
  const [eligibleNurses, setEligibleNurses] = useState<Nurse[] | null>(null);
  const [selectedNurseId, setSelectedNurseId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignNotice, setAssignNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [page, setPage] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  // Loads the week's staffing overview.
  function load() {
    setLoading(true);
    const q = new URLSearchParams({ isoYear: String(isoYear), isoWeek: String(isoWeek) });
    if (region) q.set("region", region);
    api.get<{ facilities: WeekOverviewRow[] }>(`/staffing/week?${q.toString()}`)
      .then((d) => setRows(d.facilities))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get<{ patients: Patient[] }>("/patients?facilityId=all").then((d) => setPatients(d.patients)).catch(() => {});
  }, []);

  useEffect(() => {
    // Waits for the region to resolve so an unscoped fetch can't return every facility or race the scoped one.
    if (scopeLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, scopeLoading]);

  const stats = useMemo(() => {
    let requiredTotal = 0;
    let assignedTotal = 0;
    const shortageFacilities = new Set<string>();
    for (const row of rows) {
      for (const day of row.weekdays.slice(0, 5)) {
        requiredTotal += day.requiredCount;
        assignedTotal += day.assigned.length;
        if (isStaffingConflict(day)) shortageFacilities.add(row.facility.id);
      }
    }
    return {
      shortageFacilities: shortageFacilities.size,
      utilization: requiredTotal === 0 ? 100 : Math.round((assignedTotal / requiredTotal) * 100),
    };
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagedRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Computes a facility's week utilization percentage.
  function rowUtilization(row: WeekOverviewRow): number {
    let required = 0;
    let assigned = 0;
    for (const day of row.weekdays.slice(0, 5)) {
      required += day.requiredCount;
      assigned += day.assigned.length;
    }
    return required === 0 ? 100 : Math.round((assigned / required) * 100);
  }

  // Opens the facility dialog; with a weekday it goes straight to assigning that day, without one it just shows the week.
  async function openFacility(facilityId: string, weekday: number | null) {
    setDialog({ facilityId, weekday });
    setSelectedNurseId("");
    setAssignError(null);
    setAssignNotice(null);
    setEligibleNurses(null);
    try {
      const res = await api.get<{ nurses: Nurse[] }>(`/staffing/eligible-nurses?facilityId=${facilityId}`);
      setEligibleNurses(res.nurses);
    } catch {
      setEligibleNurses([]);
    }
  }

  function closeDialog() {
    setDialog(null);
    setSelectedNurseId("");
    setAssignError(null);
    setAssignNotice(null);
  }

  // Assigns the selected nurse to the chosen day, keeping the dialog open so the admin sees the roster update.
  async function confirmAssign() {
    if (!dialog || dialog.weekday === null || !selectedNurseId) return;
    setAssignLoading(true);
    setAssignError(null);
    setAssignNotice(null);
    try {
      await api.post("/staffing/assignments", {
        facilityId: dialog.facilityId, weekday: dialog.weekday, isoYear, isoWeek, userId: selectedNurseId,
      });
      const nurse = eligibleNurses?.find((n) => n.id === selectedNurseId);
      setAssignNotice(`${nurse?.email ?? "Nurse"} assigned to ${WEEKDAY_LABELS[dialog.weekday]}`);
      setSelectedNurseId("");
      setDialog({ facilityId: dialog.facilityId, weekday: null });
      load();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Could not assign the nurse");
    } finally {
      setAssignLoading(false);
    }
  }

  const dialogRow = dialog ? rows.find((r) => r.facility.id === dialog.facilityId) ?? null : null;
  // A nurse already on the chosen day can't be picked again.
  const assignedOnDay = new Set(
    dialogRow && dialog && dialog.weekday !== null ? dialogRow.weekdays[dialog.weekday]?.assigned.map((a) => a.userId) : [],
  );
  const availableNurses = (eligibleNurses ?? []).filter((n) => !assignedOnDay.has(n.id));

  // Publishes the week's schedule.
  async function publishSchedule() {
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await api.post<{ published: number }>("/staffing/publish", { isoYear, isoWeek, region: region || undefined });
      setPublishResult(`Published ${res.published} assignment${res.published === 1 ? "" : "s"}`);
      load();
    } catch (err) {
      setPublishResult(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-admin-h3 text-admin-text">Week {isoWeek} Allocation Console</p>
          <p className="text-admin-body-sm text-admin-text-secondary">Assign each facility's own nurses to the shifts it requires. Nurses work at their home facility only.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-admin-sm border border-admin-border bg-white p-0.5 text-admin-caption font-medium">
            <button
              onClick={() => setViewMode("list")}
              className={cn("flex items-center gap-1.5 rounded-admin-xs px-2.5 py-1.5", viewMode === "list" ? "bg-admin-card-alt text-admin-text" : "text-admin-text-secondary")}
            >
              <LayoutList className="size-3.5" aria-hidden="true" /> List View
            </button>
            <button
              disabled
              title="Map View — no mapping library in this codebase yet"
              className="flex cursor-not-allowed items-center gap-1.5 rounded-admin-xs px-2.5 py-1.5 text-admin-text-secondary/50"
            >
              <MapIcon className="size-3.5" aria-hidden="true" /> Map View
            </button>
          </div>
          {/* Static region label matching the mockup's control; a dropdown would offer a choice Regional Admin doesn't have. */}
          <span className="rounded-admin-sm border border-admin-border bg-white px-3 py-1.5 text-admin-caption font-medium text-admin-text-secondary">
            {region ?? "—"} Region
          </span>
          <Button onClick={publishSchedule} loading={publishing} className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
            ↑ Publish Schedule
          </Button>
        </div>
      </div>
      {publishResult && <p className="text-admin-body-sm text-admin-text-secondary">{publishResult}</p>}

      <div className="grid grid-cols-3 gap-4">
        <Card className="border-admin-border p-4">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-admin-danger" aria-hidden="true" />
            <p className="text-admin-body-sm font-semibold text-admin-text">Critical Shortages</p>
            <span className="ml-auto rounded-admin-xs bg-admin-danger/10 px-2 py-0.5 text-admin-caption font-medium text-admin-danger-text">
              {stats.shortageFacilities} {stats.shortageFacilities === 1 ? "Facility" : "Facilities"}
            </span>
          </div>
          <p className="mt-2 text-admin-caption text-admin-text-secondary">
            {stats.shortageFacilities > 0
              ? "Assign more of the facility's own nurses to meet clinical safety ratios."
              : "No shortages this week."}
          </p>
          <button
            onClick={() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="mt-2 text-admin-caption font-medium text-admin-sidebar-cta hover:underline"
          >
            Review Conflicts →
          </button>
        </Card>
        <Card className="border-admin-border p-4">
          <p className="mb-2 text-admin-caption font-semibold uppercase tracking-wide text-admin-text-secondary">Enforced Shift Policy</p>
          <div className="grid grid-cols-2 gap-2 text-admin-caption">
            <div className="rounded-admin-sm border border-admin-border p-2 text-center">
              <p className="font-semibold text-admin-text">M / W / F</p>
              <p className="text-admin-text-secondary">Virtual + Chemo</p>
            </div>
            <div className="rounded-admin-sm border border-admin-border p-2 text-center opacity-70">
              <p className="font-semibold text-admin-text">T / Th</p>
              <p className="text-admin-text-secondary">Physical + Procedure</p>
            </div>
          </div>
          <p className="mt-2 flex items-center gap-1 text-admin-micro text-admin-text-secondary">
            <Lock className="size-3" aria-hidden="true" /> Misscheduling prevented by system rules (FR-20).
          </p>
        </Card>
        <Card className="flex items-center gap-3 border-admin-border p-4">
          <UtilizationDiamond percent={stats.utilization} />
          <div>
            <p className="text-admin-caption font-semibold uppercase tracking-wide text-admin-text-secondary">Regional Staffing Utilization</p>
            <p className={cn("text-[48px] font-bold leading-[56px] tracking-[-0.96px]", stats.utilization < 80 ? "text-admin-warning" : "text-admin-success")}>
              {stats.utilization}%
            </p>
          </div>
        </Card>
      </div>

      <Card ref={tableRef} className="overflow-hidden border-admin-border">
        <div className="flex items-center justify-between border-b border-admin-border px-5 py-3">
          <p className="text-admin-body-sm font-semibold text-admin-text">Facility Requirements & Assignments</p>
          <div className="flex items-center gap-3 text-admin-caption text-admin-text-secondary">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-admin-danger" aria-hidden="true" /> Conflict Day</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-admin-success" aria-hidden="true" /> Fully Staffed</span>
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-admin-text-secondary">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-admin-text-secondary">No facilities found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-admin-body-sm">
              <thead className="border-b border-admin-border text-left text-admin-caption text-admin-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Facility & Location</th>
                  {WEEKDAY_LABELS.map((d) => (
                    <th key={d} className="px-4 py-3 font-medium">{d}</th>
                  ))}
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-border">
                {pagedRows.map((row) => {
                  const severity = rowSeverity(row);
                  const shortDay = row.weekdays.slice(0, 5).find(isStaffingConflict);
                  return (
                    <tr key={row.facility.id} className={severity !== "none" ? "border-l-2 border-l-admin-danger" : undefined}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-admin-text">{row.facility.name}</p>
                        <p className="text-admin-caption text-admin-text-secondary">{row.facility.region} District</p>
                        {severity !== "none" && (
                          <p className="mt-0.5 flex items-center gap-1 text-admin-micro text-admin-danger">
                            <TriangleAlert className="size-3" aria-hidden="true" /> Nurse coverage below required ratio
                          </p>
                        )}
                      </td>
                      {row.weekdays.slice(0, 5).map((day) => {
                        const short = isStaffingConflict(day);
                        const missing = Math.max(0, day.requiredCount - day.assigned.length);
                        return (
                          <td key={day.weekday} className="px-4 py-3">
                            <span className={cn(
                              "mb-1 inline-block rounded-admin-xs px-2 py-1 text-admin-caption font-medium",
                              short ? "bg-admin-danger/10 text-admin-danger-text" : "bg-admin-success/10 text-admin-success",
                            )}>
                              {day.assigned.length}/{day.requiredCount} Nurses
                            </span>
                            <div className="flex -space-x-1.5">
                              {day.assigned.map((a, i) => (
                                <span
                                  key={a.userId}
                                  title={a.email}
                                  className={cn(
                                    "flex size-5 items-center justify-center rounded-full border border-white text-[10px] font-semibold",
                                    AVATAR_COLORS[i % AVATAR_COLORS.length],
                                  )}
                                >
                                  {initialOf(a.email)}
                                </span>
                              ))}
                              {Array.from({ length: missing }).map((_, i) => (
                                <span
                                  key={`missing-${i}`}
                                  className="flex size-5 items-center justify-center rounded-full border border-dashed border-admin-danger/40 text-[10px] text-admin-danger/60"
                                >
                                  ?
                                </span>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3">
                        {severity === "critical" && shortDay ? (
                          <Button onClick={() => openFacility(row.facility.id, shortDay.weekday)} size="sm" className="rounded-admin-xs bg-admin-danger hover:bg-admin-danger/90">
                            Assign Nurse
                          </Button>
                        ) : severity === "partial" && shortDay ? (
                          <Button
                            onClick={() => openFacility(row.facility.id, shortDay.weekday)}
                            variant="outline"
                            size="sm"
                            className="rounded-admin-xs border-admin-warning text-admin-warning hover:bg-admin-warning/10"
                          >
                            Review Gaps
                          </Button>
                        ) : (
                          <Button onClick={() => openFacility(row.facility.id, null)} variant="outline" size="sm" title={`${rowUtilization(row)}% staffed`} className="rounded-admin-xs border-admin-border text-admin-text">
                            View Details
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-admin-border px-5 py-3 text-admin-caption text-admin-text-secondary">
          <p>Showing {pagedRows.length} of {rows.length} {rows.length === 1 ? "Facility" : "Facilities"}</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-admin-sm border border-admin-border p-1 disabled:opacity-30"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="rounded-admin-sm border border-admin-border p-1 disabled:opacity-30"
            >
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </Card>

      {dialog && dialogRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`${dialogRow.facility.name} staffing`}>
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-admin-border p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-admin-h4 text-admin-text">{dialogRow.facility.name}</h2>
                <p className="text-admin-caption text-admin-text-secondary">Week {isoWeek} · {rowUtilization(dialogRow)}% staffed</p>
              </div>
              <button onClick={closeDialog} aria-label="Close" className="text-admin-text-secondary hover:text-admin-text">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <table className="mt-4 w-full text-admin-body-sm">
              <thead className="border-b border-admin-border text-left text-admin-caption text-admin-text-secondary">
                <tr>
                  <th className="py-2 pr-3 font-medium">Day</th>
                  <th className="py-2 pr-3 font-medium">Staffed</th>
                  <th className="py-2 pr-3 font-medium">Assigned nurses</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-border">
                {dialogRow.weekdays.slice(0, 5).map((day) => {
                  const short = isStaffingConflict(day);
                  return (
                    <tr key={day.weekday} className={dialog.weekday === day.weekday ? "bg-admin-card-alt" : undefined}>
                      <td className="py-2.5 pr-3 font-medium text-admin-text">{WEEKDAY_LABELS[day.weekday]}</td>
                      <td className="py-2.5 pr-3">
                        <span className={cn(
                          "inline-block rounded-admin-xs px-2 py-0.5 text-admin-caption font-medium",
                          short ? "bg-admin-danger/10 text-admin-danger-text" : "bg-admin-success/10 text-admin-success",
                        )}>
                          {day.assigned.length}/{day.requiredCount}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        {day.assigned.length === 0 ? (
                          <span className="text-admin-caption text-admin-text-secondary">No nurses assigned</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {day.assigned.map((a) => (
                              <li key={a.userId} className="flex items-center gap-2 text-admin-caption text-admin-text">
                                {a.email}
                                <Badge variant={a.published ? "success" : "neutral"}>{a.published ? "Published" : "Draft"}</Badge>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <Button
                          onClick={() => { setDialog({ facilityId: dialog.facilityId, weekday: day.weekday }); setSelectedNurseId(""); setAssignError(null); setAssignNotice(null); }}
                          variant="outline"
                          size="sm"
                          className="rounded-admin-xs"
                        >
                          Assign
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {assignNotice && <p role="status" className="mt-3 text-admin-body-sm text-admin-success">{assignNotice}</p>}

            {dialog.weekday !== null && (
              <div className="mt-4 rounded-admin-sm border border-admin-border p-4">
                <p className="mb-2 text-admin-body-sm font-semibold text-admin-text">Assign nurse — {WEEKDAY_LABELS[dialog.weekday]}</p>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedNurseId}
                    onChange={(e) => setSelectedNurseId(e.target.value)}
                    className="flex-1 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
                  >
                    <option value="">Select nurse...</option>
                    {availableNurses.map((n) => (
                      <option key={n.id} value={n.id}>{n.email}</option>
                    ))}
                  </select>
                  <Button onClick={confirmAssign} loading={assignLoading} disabled={!selectedNurseId} size="sm" className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
                    Assign
                  </Button>
                  <Button onClick={() => { setDialog({ facilityId: dialog.facilityId, weekday: null }); setAssignError(null); }} variant="ghost" size="sm">Cancel</Button>
                </div>
                {eligibleNurses !== null && eligibleNurses.length === 0 && (
                  <p className="mt-2 text-admin-caption text-admin-text-secondary">No Onsite Nursing Officer is linked to this facility yet.</p>
                )}
                {eligibleNurses !== null && eligibleNurses.length > 0 && availableNurses.length === 0 && (
                  <p className="mt-2 text-admin-caption text-admin-text-secondary">Every nurse at this facility is already assigned to {WEEKDAY_LABELS[dialog.weekday]}.</p>
                )}
                {assignError && <p role="alert" className="mt-2 text-admin-caption text-admin-danger">{assignError}</p>}
              </div>
            )}
          </Card>
        </div>
      )}

      <TransferPanel patients={patients.filter((p) => facilitiesInRegion.some((f) => f.id === p.facilityId))} />
    </div>
  );
}
