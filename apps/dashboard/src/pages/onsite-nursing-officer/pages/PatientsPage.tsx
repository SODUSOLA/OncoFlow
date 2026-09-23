import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, CalendarClock, History } from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import type { Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { cn } from "../../../lib/utils";
import type { NursingCase, RegimenCycleRow } from "../lib/types";

interface ScheduleInfo { label: string; detail: string }

// Patients tab: who this officer is scheduled to see (today, overdue, tomorrow), who they've seen before,
// and — as a fallback for anyone else — the rest of the facility's patients.
export default function PatientsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [scheduled, setScheduled] = useState<Map<string, ScheduleInfo>>(new Map());
  const [lastSeenAt, setLastSeenAt] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.facilityId) { setLoading(false); return; }
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    Promise.all([
      api.get<{ patients: Patient[] }>(`/patients?facilityId=${user.facilityId}`).then((d) => d.patients).catch(() => []),
      api.get<{ cycles: RegimenCycleRow[] }>(`/regimen-cycles?facilityId=${user.facilityId}&date=${today}&due=true`).then((d) => d.cycles).catch(() => []),
      api.get<{ cycles: RegimenCycleRow[] }>(`/regimen-cycles?facilityId=${user.facilityId}&date=${tomorrow}`).then((d) => d.cycles).catch(() => []),
      api.get<{ cases: NursingCase[] }>("/nursing-cases/mine").then((d) => d.cases).catch(() => []),
    ]).then(([patientRows, due, tomorrowCycles, cases]) => {
      if (cancelled) return;
      setPatients(patientRows);

      const scheduleMap = new Map<string, ScheduleInfo>();
      for (const c of due) {
        const overdue = c.scheduledDate < today;
        scheduleMap.set(c.patientId, { label: overdue ? "Overdue" : "Today", detail: `Cycle ${c.cycleNumber} · ${c.drugName}` });
      }
      for (const c of tomorrowCycles) {
        if (scheduleMap.has(c.patientId)) continue;
        scheduleMap.set(c.patientId, { label: "Tomorrow", detail: `Cycle ${c.cycleNumber} · ${c.drugName}` });
      }
      setScheduled(scheduleMap);

      const seenMap = new Map<string, string>();
      for (const c of cases) {
        const existing = seenMap.get(c.patientId);
        if (!existing || c.startedAt > existing) seenMap.set(c.patientId, c.startedAt);
      }
      setLastSeenAt(seenMap);
    }).finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [user?.facilityId]);

  const q = query.trim().toLowerCase();
  const matches = (p: Patient) => !q || `${p.firstName} ${p.lastName} ${p.uniquePatientId}`.toLowerCase().includes(q);

  const { scheduledPatients, seenPatients, otherPatients } = useMemo(() => {
    const scheduledList = patients.filter((p) => scheduled.has(p.id) && matches(p))
      .sort((a, b) => (scheduled.get(a.id)!.label === "Tomorrow" ? 1 : 0) - (scheduled.get(b.id)!.label === "Tomorrow" ? 1 : 0));
    const seenList = patients.filter((p) => !scheduled.has(p.id) && lastSeenAt.has(p.id) && matches(p))
      .sort((a, b) => lastSeenAt.get(b.id)!.localeCompare(lastSeenAt.get(a.id)!));
    const otherList = patients.filter((p) => !scheduled.has(p.id) && !lastSeenAt.has(p.id) && matches(p))
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    return { scheduledPatients: scheduledList, seenPatients: seenList, otherPatients: otherList };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, scheduled, lastSeenAt, q]);

  const nothingFound = scheduledPatients.length === 0 && seenPatients.length === 0 && otherPatients.length === 0;

  return (
    <div className="space-y-4">
      <p className="text-admin-h4 text-admin-text">Patients</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-admin-text-secondary" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or ID…"
          className="w-full rounded-admin-sm border border-admin-border bg-white py-2.5 pl-9 pr-3 text-admin-body-sm text-admin-text"
        />
      </div>

      {loading ? (
        <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
      ) : nothingFound ? (
        <Card className="p-6 text-center text-admin-body-sm text-admin-text-secondary">No patients found.</Card>
      ) : (
        <>
          <PatientGroup
            title="Scheduled" icon={CalendarClock} patients={scheduledPatients}
            subtitle={(p) => scheduled.get(p.id)!.detail} badge={(p) => scheduled.get(p.id)!.label}
            onOpen={(id) => navigate(`/dashboard/onsite-nursing-officer/patients/${id}`)}
          />
          <PatientGroup
            title="Previously Seen" icon={History} patients={seenPatients}
            subtitle={(p) => p.uniquePatientId} badge={() => null}
            onOpen={(id) => navigate(`/dashboard/onsite-nursing-officer/patients/${id}`)}
          />
          <PatientGroup
            title="All Other Patients at Your Facility" patients={otherPatients}
            subtitle={(p) => p.uniquePatientId} badge={() => null}
            onOpen={(id) => navigate(`/dashboard/onsite-nursing-officer/patients/${id}`)}
          />
        </>
      )}
    </div>
  );
}

// One titled section of patient rows; renders nothing when it has no patients.
function PatientGroup({
  title, icon: Icon, patients, subtitle, badge, onOpen,
}: {
  title: string; icon?: typeof CalendarClock; patients: Patient[];
  subtitle: (p: Patient) => string; badge: (p: Patient) => string | null; onOpen: (patientId: string) => void;
}) {
  if (patients.length === 0) return null;
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">
        {Icon && <Icon className="size-3.5" aria-hidden="true" />} {title} ({patients.length})
      </p>
      <div className="space-y-2">
        {patients.map((p) => {
          const tag = badge(p);
          return (
            <Card
              key={p.id}
              className="flex cursor-pointer items-center justify-between gap-3 border-admin-border p-3.5 hover:border-admin-sidebar-cta"
              onClick={() => onOpen(p.id)}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-admin-sidebar-cta text-admin-caption font-semibold text-white">
                  {p.firstName[0]}{p.lastName[0]}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-admin-body-sm font-semibold text-admin-text">{p.firstName} {p.lastName}</p>
                  <p className="text-admin-caption text-admin-text-secondary">{subtitle(p)}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {tag && (
                  <span className={cn(
                    "rounded-admin-lg px-2 py-0.5 text-admin-micro font-semibold",
                    tag === "Overdue" ? "bg-admin-danger/10 text-admin-danger" : tag === "Today" ? "bg-admin-success/10 text-admin-success" : "bg-admin-card-alt text-admin-text-secondary",
                  )}>
                    {tag}
                  </span>
                )}
                <ChevronRight className="size-4 text-admin-text-secondary" aria-hidden="true" />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
