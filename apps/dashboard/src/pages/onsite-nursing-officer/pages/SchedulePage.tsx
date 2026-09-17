import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert, CalendarClock, ChevronRight } from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { Card } from "../../../components/ui/Card";
// Shared pure utility, no regional-admin-specific coupling — see that file's own comment on why
// one definition matters (SchedulingPage/NotificationCenterPage both depend on it too).
import { getIsoWeek } from "../../regional-admin/lib/isoWeek";
import type { RegimenCycleRow } from "../lib/types";

function tomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

interface Assignment { id: string; facilityId: string; facilityName: string; weekday: number }

export default function SchedulePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cycles, setCycles] = useState<RegimenCycleRow[]>([]);
  const [crossSupport, setCrossSupport] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.facilityId) { setLoading(false); return; }
    let cancelled = false;
    const tomorrow = tomorrowDateString();
    const { isoYear, isoWeek } = getIsoWeek(new Date(`${tomorrow}T00:00:00`));

    Promise.all([
      api.get<{ cycles: RegimenCycleRow[] }>(`/regimen-cycles?facilityId=${user.facilityId}&date=${tomorrow}`).then((d) => d.cycles).catch(() => []),
      api.get<{ assignments: Assignment[] }>(`/staffing/mine?isoYear=${isoYear}&isoWeek=${isoWeek}`).then((d) => d.assignments).catch(() => []),
    ]).then(([cycleRows, assignments]) => {
      if (cancelled) return;
      setCycles(cycleRows);
      // Cross-support: a published assignment at a facility other than my own.
      setCrossSupport(assignments.filter((a) => a.facilityId !== user.facilityId));
    }).finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [user?.facilityId]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-admin-h4 text-admin-text">Tomorrow's Schedule</p>
        <p className="text-admin-caption text-admin-text-secondary">{new Date(`${tomorrowDateString()}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
      </div>

      {crossSupport.length > 0 ? (
        <Card className="flex items-start gap-2.5 border-admin-warning/40 bg-admin-warning/10 p-3.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-admin-warning" aria-hidden="true" />
          <div>
            <p className="text-admin-body-sm font-semibold text-admin-text">Cross-support assignment</p>
            <p className="text-admin-caption text-admin-text-secondary">
              You're assigned to {crossSupport.map((a) => a.facilityName).join(", ")} tomorrow — not your home facility.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="flex items-center gap-2.5 border-admin-border bg-admin-card-alt p-3.5">
          <CalendarClock className="size-4 shrink-0 text-admin-text-secondary" aria-hidden="true" />
          <p className="text-admin-caption text-admin-text-secondary">No cross-support assignments tomorrow.</p>
        </Card>
      )}

      <div>
        <p className="mb-2 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">
          Scheduled Visitations ({cycles.length})
        </p>
        {loading ? (
          <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
        ) : cycles.length === 0 ? (
          <Card className="p-6 text-center text-admin-body-sm text-admin-text-secondary">Nothing scheduled for tomorrow.</Card>
        ) : (
          <div className="space-y-2">
            {cycles.map((c) => (
              <Card
                key={c.id}
                className="flex cursor-pointer items-center justify-between gap-3 border-admin-border p-3.5 hover:border-admin-sidebar-cta"
                onClick={() => navigate(`/dashboard/onsite-nursing-officer/patients/${c.patientId}`)}
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
                <ChevronRight className="size-4 shrink-0 text-admin-text-secondary" aria-hidden="true" />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
