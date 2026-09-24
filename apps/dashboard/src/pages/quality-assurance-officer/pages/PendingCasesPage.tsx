import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";
import type { PendingReviewCase } from "../../onsite-nursing-officer/lib/types";

// The QA queue: every nursing case a nurse has submitted, waiting on a decision — this is what "a QA
// officer gets notified of the case" means in practice, since there's no separate notification inbox yet.
export default function PendingCasesPage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<PendingReviewCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ cases: PendingReviewCase[] }>("/nursing-cases/pending-review")
      .then((d) => setCases(d.cases))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-admin-h3 text-admin-text">Pending Review</p>
        <p className="text-admin-body-sm text-admin-text-secondary">
          Cases a nursing officer has submitted, oldest first — nothing here closes until you record a decision.
        </p>
      </div>

      {loading ? (
        <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
      ) : cases.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <ClipboardCheck className="size-8 text-admin-success" aria-hidden="true" />
          <p className="text-admin-body-sm text-admin-text-secondary">Nothing pending — every submitted case has been reviewed.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => (
            <Card
              key={c.id}
              className="flex cursor-pointer items-center justify-between gap-3 border-admin-border p-4 hover:border-admin-sidebar-cta"
              onClick={() => navigate(`/dashboard/quality-assurance-officer/cases/${c.id}`)}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-admin-sidebar-cta text-admin-caption font-semibold text-white">
                  {c.patientFirstName[0]}{c.patientLastName[0]}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-admin-body-sm font-semibold text-admin-text">{c.patientFirstName} {c.patientLastName}</p>
                  <p className="text-admin-caption text-admin-text-secondary">
                    {c.patientUniqueId} · Cycle {c.cycleNumber} · Submitted by {c.startedByEmail}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-admin-caption text-admin-text-secondary">{new Date(c.startedAt).toLocaleDateString()}</span>
                <ChevronRight className="size-4 text-admin-text-secondary" aria-hidden="true" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
