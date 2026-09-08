import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Filter, ShieldCheck, TriangleAlert, Calendar, Plus, Video, FolderOpen, Clock3 } from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import type { Appointment, Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { cn } from "../../../lib/utils";

// Phase 2 of ONCOFLOW_CONSULTANT_BUILD_GUIDE.md. Two real data gaps in the schema, handled the
// same way the Regional Admin build handled missing fields — derive a real signal where one
// exists, and honestly substitute where it doesn't, rather than fabricate:
//   - No urgency/priority column on `appointment` at all. Urgency here is derived from how soon
//     the appointment starts (same "imminent = urgent" logic as every SLA countdown elsewhere
//     in this app), not a stored value.
//   - No diagnosis field anywhere in the schema. "Primary Diagnosis" in the mockup is replaced
//     with the real `appointmentType` (VIRTUAL/PHYSICAL/CHEMOTHERAPY/PROCEDURE).
const HIGH_URGENCY_WINDOW_MIN = 20;
// Join Call enables from 20 minutes before start through 2 hours after — wide enough to cover
// a call that's simply running long, but not an appointment that's days or weeks overdue (this
// dev database has exactly that: seeded appointments with no relationship to "today").
const JOIN_WINDOW_BEFORE_MIN = 20;
const JOIN_WINDOW_AFTER_MIN = 120;

type Urgency = "high" | "routine";

function urgencyOf(a: Appointment, now: number): Urgency {
  if (a.status === "IN_PROGRESS") return "high";
  if (a.status !== "CONFIRMED" && a.status !== "CHECKED_IN" && a.status !== "PENDING") return "routine";
  const minutesUntil = (new Date(a.scheduledAt).getTime() - now) / 60_000;
  return minutesUntil <= HIGH_URGENCY_WINDOW_MIN ? "high" : "routine";
}

function formatCountdown(ms: number): string {
  const overdue = ms <= 0;
  const abs = Math.abs(ms);
  const mm = String(Math.floor(abs / 60_000) % 60).padStart(2, "0");
  const hh = String(Math.floor(abs / 3_600_000)).padStart(2, "0");
  return `${overdue ? "-" : ""}${hh}:${mm}`;
}

const APPOINTMENT_TYPE_LABEL: Record<Appointment["appointmentType"], string> = {
  VIRTUAL: "Virtual Consult",
  PHYSICAL: "In-Person Visit",
  CHEMOTHERAPY: "Chemotherapy",
  PROCEDURE: "Procedure",
};

export default function AppointmentGridPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [highFilter, setHighFilter] = useState(true);
  const [routineFilter, setRoutineFilter] = useState(true);
  const [virtualOnly, setVirtualOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"time" | "urgency">("time");

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user?.facilityId) return;
    let cancelled = false;
    Promise.all([
      api.get<{ appointments: Appointment[] }>(`/appointments?facilityId=${user.facilityId}`),
      api.get<{ patients: Patient[] }>("/patients?facilityId=all"),
    ]).then(([a, p]) => {
      if (cancelled) return;
      setAppointments(a.appointments.filter((appt) => appt.oncologistId === user.id));
      setPatients(p.patients);
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.facilityId, user?.id]);

  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);

  // "Today's clinical queue" per the page subtitle — future-facing appointments only (nothing
  // already CANCELLED/MISSED/COMPLETED clutters an active work queue).
  const activeAppointments = useMemo(
    () => appointments.filter((a) => !["CANCELLED", "MISSED", "COMPLETED"].includes(a.status)),
    [appointments],
  );

  const counts = useMemo(() => {
    let high = 0, routine = 0;
    for (const a of activeAppointments) (urgencyOf(a, now) === "high" ? high++ : routine++);
    return { high, routine };
  }, [activeAppointments, now]);

  const nextBreach = useMemo(() => {
    const upcoming = activeAppointments
      .filter((a) => a.status === "CONFIRMED" || a.status === "PENDING")
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    return upcoming[0] ?? null;
  }, [activeAppointments]);

  const visibleAppointments = useMemo(() => {
    let list = activeAppointments.filter((a) => {
      const urgency = urgencyOf(a, now);
      if (urgency === "high" && !highFilter) return false;
      if (urgency === "routine" && !routineFilter) return false;
      if (virtualOnly && a.appointmentType !== "VIRTUAL") return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === "urgency") {
        const ua = urgencyOf(a, now) === "high" ? 0 : 1;
        const ub = urgencyOf(b, now) === "high" ? 0 : 1;
        if (ua !== ub) return ua - ub;
      }
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    });
    return list;
  }, [activeAppointments, highFilter, routineFilter, virtualOnly, sortBy, now]);

  if (loading) return <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>;

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-admin-body text-admin-text">Scheduled Consultations</p>
          <p className="text-admin-body text-admin-text-secondary">Review today's clinical queue and high-priority oncology reviews.</p>
        </div>
        <Card className="flex items-center gap-3 border-admin-border px-4 py-2.5">
          <div>
            <p className="text-admin-micro font-bold uppercase tracking-wide text-admin-text-secondary">Next Breach In</p>
            <p className={cn("text-admin-body", nextBreach ? "text-admin-warning" : "text-admin-text-secondary")}>
              {nextBreach ? formatCountdown(new Date(nextBreach.scheduledAt).getTime() - now) : "—"}
            </p>
          </div>
        </Card>
      </div>

      <div className="flex items-start gap-4">
        <div className="w-72 shrink-0 space-y-4">
          <Card className="space-y-6 border-admin-border p-6">
            <p className="flex items-center gap-2 text-admin-body text-admin-text">
              <Filter className="size-3.5" aria-hidden="true" /> Quick Filters
            </p>

            <div className="space-y-3">
              <p className="text-admin-body-sm text-admin-text-secondary">Urgency Level</p>
              <label className="flex items-center gap-3 rounded-admin-sm p-2 hover:bg-admin-card-alt">
                <input type="checkbox" checked={highFilter} onChange={(e) => setHighFilter(e.target.checked)} className="size-5 rounded-admin-xs border-admin-border" />
                <span className="text-admin-body-sm text-admin-text">High Priority</span>
                <span className="ml-auto rounded-full bg-admin-danger/10 px-1.5 py-0.5 text-admin-micro font-bold text-admin-danger-text">{counts.high}</span>
              </label>
              <label className="flex items-center gap-3 rounded-admin-sm bg-admin-sidebar-cta p-2 text-white">
                <input type="checkbox" checked={routineFilter} onChange={(e) => setRoutineFilter(e.target.checked)} className="size-5 rounded-admin-xs" />
                <span className="text-admin-body-sm">Routine</span>
                <span className="ml-auto rounded-full bg-white/20 px-1.5 py-0.5 text-admin-micro font-bold text-white">{counts.routine}</span>
              </label>
            </div>

            <div className="space-y-3">
              <p className="text-admin-body-sm text-admin-text-secondary">Consultation Type</p>
              <button
                onClick={() => setVirtualOnly((v) => !v)}
                className="flex w-full items-center gap-3 rounded-admin-sm bg-admin-sidebar-cta/10 p-2.5"
              >
                <Video className="size-4 text-admin-sidebar-cta" aria-hidden="true" />
                <span className="text-admin-body-sm font-semibold text-admin-text">Virtual Only</span>
                <span className={cn("ml-auto h-6 w-11 shrink-0 rounded-full transition-colors", virtualOnly ? "bg-admin-text" : "bg-admin-border")}>
                  <span className={cn("mt-0.5 block size-5 rounded-full bg-white transition-transform", virtualOnly ? "translate-x-[22px]" : "translate-x-0.5")} />
                </span>
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-admin-body-sm text-admin-text-secondary">Sort By</p>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "time" | "urgency")}
                className="w-full rounded-admin-sm border border-admin-border bg-admin-card-alt px-3 py-2 text-admin-body-sm text-admin-text"
              >
                <option value="time">Earliest Appointment</option>
                <option value="urgency">Most Urgent First</option>
              </select>
            </div>
          </Card>

          <Card className="space-y-2 border-0 bg-admin-sidebar-cta p-6 text-white">
            <ShieldCheck className="size-6" aria-hidden="true" />
            <p className="text-admin-body">Secure Gateway</p>
            <p className="text-admin-body text-white/80">
              All data is encrypted. External exports must be authorized via HIPAA protocols.
            </p>
          </Card>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-4">
          {visibleAppointments.map((a) => {
            const patient = patientById.get(a.patientId);
            const urgency = urgencyOf(a, now);
            const high = urgency === "high";
            const scheduled = new Date(a.scheduledAt);
            const minutesToStart = (scheduled.getTime() - now) / 60_000;
            const canJoin = a.appointmentType === "VIRTUAL"
              && (a.status === "CONFIRMED" || a.status === "CHECKED_IN" || a.status === "IN_PROGRESS")
              && minutesToStart <= JOIN_WINDOW_BEFORE_MIN
              && minutesToStart >= -JOIN_WINDOW_AFTER_MIN;
            return (
              <Card key={a.id} className={cn("flex flex-col overflow-hidden border-admin-border", high && "border-2 border-admin-danger")}>
                <div className="flex items-start justify-between gap-2 border-b border-admin-border p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-admin-lg border border-admin-border bg-admin-disabled-alt text-admin-body font-semibold text-admin-text">
                      {patient ? `${patient.firstName[0]}${patient.lastName[0]}` : "?"}
                    </div>
                    <div>
                      <p className="text-admin-body text-admin-text">{patient ? `${patient.firstName} ${patient.lastName}` : a.patientId.slice(0, 8)}</p>
                      <p className="text-admin-body text-admin-text-secondary">ID: {patient?.uniquePatientId ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={cn(
                      "rounded-full px-3 py-1 text-admin-micro font-bold uppercase tracking-tight",
                      high ? "bg-admin-danger/10 text-admin-danger-text" : "bg-admin-disabled-alt text-admin-text-secondary",
                    )}>
                      {high ? "High Urgency" : "Routine"}
                    </span>
                    <span className={cn("flex items-center gap-1.5 text-admin-body font-bold", high ? "text-admin-danger" : "text-admin-text-secondary")}>
                      <Clock3 className="size-4" aria-hidden="true" />
                      {high ? `Starts in ${formatCountdown(scheduled.getTime() - now)}` : scheduled.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
                <div className="flex gap-4 p-5">
                  <div className="flex-1">
                    <p className="text-admin-micro font-bold uppercase text-admin-text-secondary">Time & Duration</p>
                    <p className="text-admin-body-sm font-semibold text-admin-text">{scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-admin-micro font-bold uppercase text-admin-text-secondary">Consultation</p>
                    <p className="text-admin-body-sm font-semibold text-admin-text">{APPOINTMENT_TYPE_LABEL[a.appointmentType]}</p>
                  </div>
                </div>
                <div className="mt-auto flex gap-3 bg-admin-card-alt p-5">
                  <button
                    onClick={() => navigate(`/dashboard/consulting-oncologist/consult/${a.id}`)}
                    disabled={!canJoin}
                    title={canJoin ? undefined : a.appointmentType !== "VIRTUAL" ? "Not a virtual consult" : "Enabled closer to the appointment time"}
                    className="flex flex-1 items-center justify-center gap-2 rounded-admin-sm bg-admin-sidebar-cta px-4 py-2.5 text-admin-body-sm text-white disabled:opacity-50"
                  >
                    <Video className="size-4" aria-hidden="true" /> Join Call
                  </button>
                  <button
                    onClick={() => navigate(`/dashboard/consulting-oncologist/patient/${a.patientId}`)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-admin-sm border border-admin-sidebar-cta px-4 py-2.5 text-admin-body-sm text-admin-sidebar-cta hover:bg-white"
                  >
                    <FolderOpen className="size-4" aria-hidden="true" /> Patient File
                  </button>
                </div>
              </Card>
            );
          })}

          <Card
            title="Ad-hoc slot creation isn't wired yet — a real 'extra slot' needs a patient, facility, and time, same as any other appointment"
            className="flex cursor-not-allowed flex-col items-center justify-center gap-3 border-2 border-dashed border-admin-border bg-transparent px-8 py-16 text-center opacity-70"
          >
            <div className="flex size-16 items-center justify-center rounded-admin-lg bg-admin-disabled">
              <Plus className="size-5 text-admin-text-secondary" aria-hidden="true" />
            </div>
            <p className="text-admin-body text-admin-text">Create Extra Slot</p>
            <p className="text-admin-body-sm text-admin-text-secondary">Add an emergency consultation window to today's schedule.</p>
          </Card>

          {visibleAppointments.length === 0 && (
            <Card className="col-span-2 flex flex-col items-center gap-2 border-admin-border p-12 text-center">
              <Calendar className="size-6 text-admin-text-secondary" aria-hidden="true" />
              <p className="text-admin-body-sm text-admin-text-secondary">No appointments match the current filters.</p>
            </Card>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-admin-border pt-5 text-admin-body-sm text-admin-text-secondary">
        <span className="flex items-center gap-2">
          <TriangleAlert className="size-3.5" aria-hidden="true" /> End-to-End Encrypted Session
        </span>
        <span>© 2026 OncoSecure Consult</span>
      </div>
    </div>
  );
}
