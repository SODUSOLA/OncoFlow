import { useEffect, useMemo, useState } from "react";
import { Lock, TriangleAlert, ChevronLeft, ChevronRight, LayoutList, Map as MapIcon } from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import type { Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { cn } from "../../../lib/utils";
import { useRegionScope } from "../lib/useRegionScope";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const PAGE_SIZE = 5;
const AVATAR_COLORS = ["bg-blue-100 text-blue-700", "bg-purple-100 text-purple-700", "bg-teal-100 text-teal-700", "bg-orange-100 text-orange-700"];

function initialOf(email: string) {
  return email.slice(0, 1).toUpperCase();
}

// Small radial gauge, matching the designer mockup's "Regional Staffing Utilization" diamond
// gauge — plain SVG, no charting library needed for one ring.
function RadialGauge({ percent }: { percent: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const color = clamped < 80 ? "#d97706" : "#15803d";
  return (
    <svg viewBox="0 0 100 100" className="size-16 shrink-0 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="9" />
      <circle
        cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (clamped / 100) * c}
      />
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

// ISO 8601 week number (Monday-first, week 1 contains the year's first Thursday) — standard
// algorithm, no library needed for this one calculation.
function getIsoWeek(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { isoYear: d.getUTCFullYear(), isoWeek };
}

function TransferPanel({ patients }: { patients: Patient[] }) {
  const { user } = useAuth();
  const { region, facilitiesInRegion, loading: scopeLoading } = useRegionScope();
  const [transfers, setTransfers] = useState<TransferRequestRow[]>([]);
  const [patientId, setPatientId] = useState("");
  const [fromFacilityId, setFromFacilityId] = useState("");
  const [toFacilityId, setToFacilityId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function loadTransfers() {
    const q = region ? `?region=${encodeURIComponent(region)}` : "";
    api.get<{ transfers: TransferRequestRow[] }>(`/transfers${q}`).then((d) => setTransfers(d.transfers)).catch(() => {});
  }

  useEffect(() => {
    if (scopeLoading) return;
    loadTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, scopeLoading]);

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
      <Card blueprint className="p-5">
        <p className="text-sm font-semibold text-gray-800">Initiate facility transfer</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Patient</label>
            <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.firstName} {p.lastName} · {p.uniquePatientId}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">From facility</label>
              <select value={fromFacilityId} onChange={(e) => setFromFacilityId(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="">Select...</option>
                {facilitiesInRegion.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">To facility</label>
              <select value={toFacilityId} onChange={(e) => setToFacilityId(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="">Select...</option>
                {facilitiesInRegion.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
          <Button onClick={submitTransfer} loading={submitting} disabled={!patientId || !fromFacilityId || !toFacilityId}>
            Submit for approval
          </Button>
          {result && <p className={`text-sm ${result.includes("submitted") ? "text-green-600" : "text-red-600"}`}>{result}</p>}
        </div>
        <div className="mt-4 flex items-start gap-2 rounded border border-gray-200 bg-gray-50 p-3">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-gray-300" aria-hidden="true" />
          <p className="text-xs text-gray-500">
            You initiate; someone else approves. Your own requests appear below as read-only — the approve control is never rendered for the initiator.
          </p>
        </div>
      </Card>

      <Card blueprint className="overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-3.5">
          <p className="text-sm font-semibold text-gray-800">Transfer requests in region</p>
        </div>
        {transfers.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No transfer requests</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {transfers.map((t) => {
              const patient = patientById.get(t.patientId);
              const isOwn = t.requestedBy === user?.id;
              return (
                <li key={t.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {patient ? `${patient.firstName} ${patient.lastName}` : t.patientId.slice(0, 8)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {facilityById.get(t.fromFacilityId)?.name ?? "—"} → {facilityById.get(t.toFacilityId)?.name ?? "—"}
                      </p>
                    </div>
                    <Badge variant={TRANSFER_STATUS_VARIANT[t.status]}>{t.status}</Badge>
                  </div>
                  {isOwn && t.status === "PENDING" && (
                    <p className="mt-1 text-[11px] text-gray-400">Approval blocked — initiator</p>
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

export default function SchedulingPage() {
  const { isoYear, isoWeek } = useMemo(() => getIsoWeek(new Date()), []);
  const { region, facilitiesInRegion, loading: scopeLoading } = useRegionScope();
  const [rows, setRows] = useState<WeekOverviewRow[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  const [assigning, setAssigning] = useState<{ facilityId: string; weekday: number } | null>(null);
  const [eligibleNurses, setEligibleNurses] = useState<Nurse[]>([]);
  const [selectedNurseId, setSelectedNurseId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [page, setPage] = useState(0);

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
    // Waits for the region to resolve before fetching — an unscoped fetch (region still null)
    // would return every facility system-wide, and could race with the later scoped one if
    // it happens to take longer (a real bug seen in dev with a large unscoped facility set).
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
        if (day.assigned.length < day.requiredCount) shortageFacilities.add(row.facility.id);
      }
    }
    return {
      shortageFacilities: shortageFacilities.size,
      utilization: requiredTotal === 0 ? 100 : Math.round((assignedTotal / requiredTotal) * 100),
    };
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagedRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function rowUtilization(row: WeekOverviewRow): number {
    let required = 0;
    let assigned = 0;
    for (const day of row.weekdays.slice(0, 5)) {
      required += day.requiredCount;
      assigned += day.assigned.length;
    }
    return required === 0 ? 100 : Math.round((assigned / required) * 100);
  }

  async function openAssign(facilityId: string, weekday: number) {
    setAssigning({ facilityId, weekday });
    setSelectedNurseId("");
    try {
      const res = await api.get<{ nurses: Nurse[] }>(`/staffing/eligible-nurses?facilityId=${facilityId}`);
      setEligibleNurses(res.nurses);
    } catch {
      setEligibleNurses([]);
    }
  }

  async function confirmAssign() {
    if (!assigning || !selectedNurseId) return;
    setAssignLoading(true);
    try {
      await api.post("/staffing/assignments", {
        facilityId: assigning.facilityId, weekday: assigning.weekday, isoYear, isoWeek, userId: selectedNurseId,
      });
      setAssigning(null);
      load();
    } catch {
      // Left open on failure so the admin can retry without re-selecting the facility/day.
    } finally {
      setAssignLoading(false);
    }
  }

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
          <p className="text-lg font-bold text-gray-900">Week {isoWeek} Allocation Console</p>
          <p className="text-sm text-gray-400">Manage nursing assignments and resolve cross-support conflicts across regions.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-gray-200 bg-white p-0.5 text-xs font-medium">
            <button
              onClick={() => setViewMode("list")}
              className={cn("flex items-center gap-1.5 rounded px-2.5 py-1.5", viewMode === "list" ? "bg-gray-100 text-gray-800" : "text-gray-400")}
            >
              <LayoutList className="size-3.5" aria-hidden="true" /> List View
            </button>
            <button
              disabled
              title="Map View — no mapping library in this codebase yet"
              className="flex cursor-not-allowed items-center gap-1.5 rounded px-2.5 py-1.5 text-gray-300"
            >
              <MapIcon className="size-3.5" aria-hidden="true" /> Map View
            </button>
          </div>
          <span className="rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
            {region ?? "—"} Region
          </span>
          <Button onClick={publishSchedule} loading={publishing}>↑ Publish Schedule</Button>
        </div>
      </div>
      {publishResult && <p className="text-sm text-gray-500">{publishResult}</p>}

      <div className="grid grid-cols-3 gap-4">
        <Card blueprint className="p-4">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden="true" />
            <p className="text-sm font-semibold text-gray-800">Critical Shortages</p>
            <span className="ml-auto rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {stats.shortageFacilities} {stats.shortageFacilities === 1 ? "Facility" : "Facilities"}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {stats.shortageFacilities > 0
              ? "Immediate cross-support required to meet clinical safety ratios."
              : "No shortages this week."}
          </p>
          <p className="mt-2 text-xs font-medium text-ink">Review Conflicts →</p>
        </Card>
        <Card blueprint className="p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Enforced Shift Policy</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-gray-200 p-2 text-center">
              <p className="font-semibold text-gray-700">M / W / F</p>
              <p className="text-gray-400">Virtual + Chemo</p>
            </div>
            <div className="rounded border border-gray-200 p-2 text-center">
              <p className="font-semibold text-gray-700">T / Th</p>
              <p className="text-gray-400">Physical + Procedure</p>
            </div>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-gray-400">
            <Lock className="size-3" aria-hidden="true" /> Misscheduling prevented by system rules (FR-20).
          </p>
        </Card>
        <Card blueprint className="flex items-center gap-3 p-4">
          <RadialGauge percent={stats.utilization} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Regional Staffing Utilization</p>
            <p className={cn("text-2xl font-bold", stats.utilization < 80 ? "text-amber-600" : "text-green-700")}>{stats.utilization}%</p>
          </div>
        </Card>
      </div>

      <Card blueprint className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <p className="text-sm font-semibold text-gray-800">Facility Requirements & Assignments</p>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-red-500" aria-hidden="true" /> Conflict Day</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-green-500" aria-hidden="true" /> Fully Staffed</span>
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No facilities found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 text-left text-xs text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Facility & Location</th>
                  {WEEKDAY_LABELS.map((d) => (
                    <th key={d} className="px-4 py-3 font-medium">{d}</th>
                  ))}
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagedRows.map((row) => {
                  const shortDay = row.weekdays.slice(0, 5).find((d) => d.assigned.length < d.requiredCount);
                  return (
                    <tr key={row.facility.id} className={shortDay ? "border-l-2 border-l-red-400" : undefined}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{row.facility.name}</p>
                        <p className="text-xs text-gray-400">{row.facility.region} District</p>
                        {shortDay && (
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-red-500">
                            <TriangleAlert className="size-3" aria-hidden="true" /> High patient volume expected
                          </p>
                        )}
                      </td>
                      {row.weekdays.slice(0, 5).map((day) => {
                        const short = day.assigned.length < day.requiredCount;
                        const missing = Math.max(0, day.requiredCount - day.assigned.length);
                        return (
                          <td key={day.weekday} className="px-4 py-3">
                            <span className={cn(
                              "mb-1 inline-block rounded px-2 py-1 text-xs font-medium",
                              short ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700",
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
                                  className="flex size-5 items-center justify-center rounded-full border border-dashed border-red-300 text-[10px] text-red-300"
                                >
                                  ?
                                </span>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3">
                        {shortDay ? (
                          <Button onClick={() => openAssign(row.facility.id, shortDay.weekday)} size="sm">Assign Nurse</Button>
                        ) : (
                          <Button variant="outline" size="sm" title={`${rowUtilization(row)}% staffed`}>View Details</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
          <p>Showing {pagedRows.length} of {rows.length} {rows.length === 1 ? "Facility" : "Facilities"}</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-gray-200 p-1 disabled:opacity-30"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="rounded border border-gray-200 p-1 disabled:opacity-30"
            >
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </Card>

      {assigning && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-gray-800">
            Assign Nurse — {WEEKDAY_LABELS[assigning.weekday]}
          </p>
          <div className="flex items-center gap-2">
            <select
              value={selectedNurseId}
              onChange={(e) => setSelectedNurseId(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select nurse...</option>
              {eligibleNurses.map((n) => (
                <option key={n.id} value={n.id}>{n.email}</option>
              ))}
            </select>
            <Button onClick={confirmAssign} loading={assignLoading} disabled={!selectedNurseId} size="sm">Assign</Button>
            <Button onClick={() => setAssigning(null)} variant="ghost" size="sm">Cancel</Button>
          </div>
          {eligibleNurses.length === 0 && (
            <p className="mt-2 text-xs text-gray-400">No Onsite Nursing Officer is linked to this facility yet.</p>
          )}
        </Card>
      )}

      <TransferPanel patients={patients.filter((p) => facilitiesInRegion.some((f) => f.id === p.facilityId))} />
    </div>
  );
}
