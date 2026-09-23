import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileCheck2, Clock3, CheckCircle2, ChevronRight } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import type { NursingCaseWithPatient } from "../lib/types";

const STATUS_LABEL: Record<NursingCaseWithPatient["status"], string> = {
  STARTED: "In Progress", PENDING_QA_REVIEW: "Pending QA Review", CLOSED: "Closed",
};
const STATUS_ICON: Record<NursingCaseWithPatient["status"], typeof Clock3> = {
  STARTED: Clock3, PENDING_QA_REVIEW: FileCheck2, CLOSED: CheckCircle2,
};
const STATUS_COLOR: Record<NursingCaseWithPatient["status"], string> = {
  STARTED: "text-admin-warning", PENDING_QA_REVIEW: "text-admin-sidebar-cta", CLOSED: "text-admin-success",
};

// Cases tab: every case this officer has started, each opening onto its own detail page.
export default function CasesPage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<NursingCaseWithPatient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<{ cases: NursingCaseWithPatient[] }>("/nursing-cases/mine")
      .then((d) => { if (!cancelled) setCases(d.cases); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-admin-h4 text-admin-text">My Cases</p>
        <Button onClick={() => navigate("/dashboard/onsite-nursing-officer/new-case")} size="sm" className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
          <Plus className="size-3.5" aria-hidden="true" /> New Case
        </Button>
      </div>

      {loading ? (
        <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
      ) : cases.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <p className="text-admin-body-sm text-admin-text-secondary">No cases started yet.</p>
          <Button onClick={() => navigate("/dashboard/onsite-nursing-officer/new-case")} size="sm" variant="outline" className="rounded-admin-xs">
            Start your first case
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => {
            const Icon = STATUS_ICON[c.status];
            return (
              <Card
                key={c.id}
                className="flex cursor-pointer items-center justify-between gap-3 border-admin-border p-3.5 hover:border-admin-sidebar-cta"
                onClick={() => navigate(`/dashboard/onsite-nursing-officer/cases/${c.id}`)}
              >
                <div className="min-w-0">
                  <p className="truncate text-admin-body-sm font-semibold text-admin-text">{c.patientFirstName} {c.patientLastName}</p>
                  <p className="text-admin-caption text-admin-text-secondary">{c.patientUniqueId} · Started {new Date(c.startedAt).toLocaleDateString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn("flex items-center gap-1.5 rounded-admin-lg bg-admin-card-alt px-2.5 py-1 text-admin-caption font-semibold", STATUS_COLOR[c.status])}>
                    <Icon className="size-3.5" aria-hidden="true" /> {STATUS_LABEL[c.status]}
                  </span>
                  <ChevronRight className="size-4 text-admin-text-secondary" aria-hidden="true" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
