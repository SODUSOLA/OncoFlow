import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { Card } from "../../../components/ui/Card";
import { cn } from "../../../lib/utils";
import type { RegimenCycleRow } from "../lib/types";
import { CycleStatusBadge } from "../lib/CycleStatusBadge";

// Returns today's date as YYYY-MM-DD.
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// Returns tomorrow's date as YYYY-MM-DD.
function tomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Schedule tab: cycles due now (inside the D-1..D+1 visit window) plus a look-ahead at tomorrow.
export default function SchedulePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [due, setDue] = useState<RegimenCycleRow[]>([]);
  const [tomorrow, setTomorrow] = useState<RegimenCycleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.facilityId) { setLoading(false); return; }
    let cancelled = false;
    Promise.all([
      api.get<{ cycles: RegimenCycleRow[] }>(`/regimen-cycles?facilityId=${user.facilityId}&date=${todayDateString()}&due=true`).then((d) => d.cycles).catch(() => []),
      api.get<{ cycles: RegimenCycleRow[] }>(`/regimen-cycles?facilityId=${user.facilityId}&date=${tomorrowDateString()}`).then((d) => d.cycles).catch(() => []),
    ]).then(([dueCycles, tomorrowCycles]) => {
      if (cancelled) return;
      setDue(dueCycles);
      setTomorrow(tomorrowCycles);
    }).finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [user?.facilityId]);

  // A visitation with a live case opens that case (where it can be continued or amended); one with none goes
  // through the patient page, the one place that decides whether a case can be started for them right now.
  function open(c: RegimenCycleRow) {
    navigate(c.caseId ? `/dashboard/onsite-nursing-officer/cases/${c.caseId}` : `/dashboard/onsite-nursing-officer/patients/${c.patientId}`);
  }

  return (
    <div className="space-y-4">
      <p className="text-admin-h4 text-admin-text">Schedule</p>

      <div>
        <p className="mb-2 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">
          Due Now ({due.length})
        </p>
        {loading ? (
          <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
        ) : due.length === 0 ? (
          <Card className="p-6 text-center text-admin-body-sm text-admin-text-secondary">Nothing due — no visitations today, and nothing left over.</Card>
        ) : (
          <div className="space-y-2">
            {due.map((c) => {
              return (
                <Card
                  key={c.id}
                  className="flex cursor-pointer items-center justify-between gap-3 border-admin-border p-3.5 hover:border-admin-sidebar-cta"
                  onClick={() => open(c)}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-admin-sidebar-cta text-admin-caption font-semibold text-white">
                      {c.firstName[0]}{c.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-admin-body-sm font-semibold text-admin-text">{c.firstName} {c.lastName}</p>
                      <p className="text-admin-caption text-admin-text-secondary">{c.uniquePatientId} · Cycle {c.cycleNumber} · {c.drugName}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <CycleStatusBadge cycle={c} today={todayDateString()} />
                    <ChevronRight className="size-4 text-admin-text-secondary" aria-hidden="true" />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">
          Tomorrow ({tomorrow.length})
        </p>
        {loading ? null : tomorrow.length === 0 ? (
          <Card className="p-4 text-center text-admin-body-sm text-admin-text-secondary">Nothing scheduled for tomorrow yet.</Card>
        ) : (
          <div className="space-y-2">
            {tomorrow.map((c) => (
              <Card
                key={c.id}
                className={cn("flex cursor-pointer items-center justify-between gap-3 border-admin-border p-3 opacity-80 hover:border-admin-sidebar-cta hover:opacity-100")}
                onClick={() => open(c)}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-admin-card-alt text-admin-micro font-semibold text-admin-text">
                    {c.firstName[0]}{c.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-admin-caption font-semibold text-admin-text">{c.firstName} {c.lastName}</p>
                    <p className="text-admin-micro text-admin-text-secondary">{c.uniquePatientId} · Cycle {c.cycleNumber} · {c.drugName}</p>
                  </div>
                </div>
                <ChevronRight className="size-3.5 shrink-0 text-admin-text-secondary" aria-hidden="true" />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
