import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft, FileCheck2, Clock3, CheckCircle2, IdCard, FileText, ShieldCheck, TriangleAlert, ExternalLink,
} from "lucide-react";
import { api } from "../../../../lib/api";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { cn } from "../../../../lib/utils";
import type { NursingCaseDetail } from "../../lib/types";
import { CaseDrugUsage } from "./CaseDrugUsage";

const STATUS_LABEL: Record<NursingCaseDetail["status"], string> = {
  STARTED: "In Progress", PENDING_QA_REVIEW: "Pending QA Review", CLOSED: "Closed",
};
const STATUS_ICON: Record<NursingCaseDetail["status"], typeof Clock3> = {
  STARTED: Clock3, PENDING_QA_REVIEW: FileCheck2, CLOSED: CheckCircle2,
};
const STATUS_COLOR: Record<NursingCaseDetail["status"], string> = {
  STARTED: "text-admin-warning", PENDING_QA_REVIEW: "text-admin-sidebar-cta", CLOSED: "text-admin-success",
};

// One nursing case: who it's for, its documentation, any QA decision, and the drugs logged against it.
export default function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const [nursingCase, setNursingCase] = useState<NursingCaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    api.get<{ case: NursingCaseDetail }>(`/nursing-cases/${caseId}`)
      .then((d) => { if (!cancelled) setNursingCase(d.case); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this case"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [caseId]);

  if (loading) return <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>;
  if (error || !nursingCase) return <p className="text-admin-body-sm text-admin-danger">{error ?? "Case not found."}</p>;

  const Icon = STATUS_ICON[nursingCase.status];
  const latestReview = nursingCase.reviews[0] ?? null;

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-admin-caption text-admin-text-secondary">
        <ChevronLeft className="size-3.5" aria-hidden="true" /> Back
      </button>

      <Card className="flex items-center gap-3 border-admin-border p-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-admin-sidebar-cta text-admin-h4 font-semibold text-white">
          {nursingCase.patientFirstName[0]}{nursingCase.patientLastName[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-admin-h4 text-admin-text">{nursingCase.patientFirstName} {nursingCase.patientLastName}</p>
          <p className="text-admin-caption text-admin-text-secondary">
            {nursingCase.patientUniqueId} · {nursingCase.patientGender}, DOB {new Date(nursingCase.patientDob).toLocaleDateString()}
          </p>
        </div>
        <span className={cn("flex shrink-0 items-center gap-1.5 rounded-admin-lg bg-admin-card-alt px-2.5 py-1 text-admin-caption font-semibold", STATUS_COLOR[nursingCase.status])}>
          <Icon className="size-3.5" aria-hidden="true" /> {STATUS_LABEL[nursingCase.status]}
        </span>
      </Card>

      <Card className="space-y-1 border-admin-border p-4 text-admin-body-sm text-admin-text-secondary">
        <p>Started {new Date(nursingCase.startedAt).toLocaleString()}</p>
        {nursingCase.closedAt && <p>Closed {new Date(nursingCase.closedAt).toLocaleString()}</p>}
      </Card>

      {nursingCase.status === "STARTED" && !nursingCase.documentationSheet && (
        <Card className="flex items-start gap-2.5 border-admin-warning/40 bg-admin-warning/10 p-3.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-admin-warning" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-admin-body-sm font-semibold text-admin-text">Documentation not submitted yet</p>
            <p className="text-admin-caption text-admin-text-secondary">Identity verification and the documentation upload were never finished for this case.</p>
            <Button
              onClick={() => navigate("/dashboard/onsite-nursing-officer/new-case", { state: { resumeCase: nursingCase } })}
              size="sm" className="mt-2 rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90"
            >
              Continue Documentation
            </Button>
          </div>
        </Card>
      )}

      {nursingCase.documentationSheet && (
        <Card className="space-y-2 border-admin-border p-4">
          <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Documentation</p>
          <p className="text-admin-body-sm text-admin-text">UPI entered: <span className="font-mono">{nursingCase.documentationSheet.upiCodeEntered}</span></p>
          <p className="text-admin-body-sm text-admin-text-secondary">Identity verified {new Date(nursingCase.documentationSheet.identityVerifiedAt).toLocaleString()}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={`/api/files/${nursingCase.documentationSheet.idPhotoFileId}/content`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 rounded-admin-xs border border-admin-border px-3 py-1.5 text-admin-caption text-admin-text hover:bg-admin-card-alt"
            >
              <IdCard className="size-3.5" aria-hidden="true" /> ID Photo <ExternalLink className="size-3" aria-hidden="true" />
            </a>
            <a
              href={`/api/files/${nursingCase.documentationSheet.fileReference}/content`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 rounded-admin-xs border border-admin-border px-3 py-1.5 text-admin-caption text-admin-text hover:bg-admin-card-alt"
            >
              <FileText className="size-3.5" aria-hidden="true" /> Documentation File <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </div>
        </Card>
      )}

      {latestReview && (
        <Card className={cn("space-y-1 border p-4", latestReview.decision === "REQUIREMENTS_MET" ? "border-admin-success/40 bg-admin-success/5" : "border-admin-danger/40 bg-admin-danger/5")}>
          <p className="flex items-center gap-1.5 text-admin-body-sm font-semibold text-admin-text">
            <ShieldCheck className={cn("size-4", latestReview.decision === "REQUIREMENTS_MET" ? "text-admin-success" : "text-admin-danger")} aria-hidden="true" />
            QA {latestReview.decision === "REQUIREMENTS_MET" ? "requirements met" : "requirements incomplete"}
          </p>
          {latestReview.reason && <p className="text-admin-body-sm text-admin-text">{latestReview.reason}</p>}
          <p className="text-admin-caption text-admin-text-secondary">Reviewed {new Date(latestReview.reviewedAt).toLocaleString()}</p>
        </Card>
      )}

      <CaseDrugUsage nursingCaseId={nursingCase.id} editable={nursingCase.status !== "CLOSED"} />
    </div>
  );
}
