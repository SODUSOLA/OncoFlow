import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, FileText, ExternalLink, History, Clock3, FileCheck2, CheckCircle2 } from "lucide-react";
import { api } from "../../../lib/api";
import type { Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { cn } from "../../../lib/utils";
import type { NursingCase, NursingCaseDetail, PatientCaseHistoryEntry, FileRecord } from "../../onsite-nursing-officer/lib/types";

const STATUS_LABEL: Record<NursingCase["status"], string> = {
  STARTED: "In Progress", PENDING_QA_REVIEW: "Pending QA Review", CLOSED: "Closed",
};
const STATUS_ICON: Record<NursingCase["status"], typeof Clock3> = {
  STARTED: Clock3, PENDING_QA_REVIEW: FileCheck2, CLOSED: CheckCircle2,
};
const STATUS_COLOR: Record<NursingCase["status"], string> = {
  STARTED: "text-admin-warning", PENDING_QA_REVIEW: "text-admin-sidebar-cta", CLOSED: "text-admin-success",
};

// The patient folder, from QA's side: the same last-treatment summary, full case history and document
// archive the nursing officer sees — reviewing a case fairly means being able to check it against the
// patient's record, not just what's on the one submission in front of you.
export default function PatientFolderPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [cases, setCases] = useState<PatientCaseHistoryEntry[]>([]);
  const [lastTreatment, setLastTreatment] = useState<NursingCaseDetail | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    Promise.all([
      api.get<{ patient: Patient }>(`/patients/${patientId}`).then((d) => d.patient).catch(() => null),
      api.get<{ cases: PatientCaseHistoryEntry[] }>(`/nursing-cases?patientId=${patientId}`).then((d) => d.cases).catch(() => []),
      api.get<{ files: FileRecord[] }>(`/files?patientId=${patientId}`).then((d) => d.files).catch(() => []),
    ]).then(async ([patientRow, caseRows, fileRows]) => {
      if (cancelled) return;
      setPatient(patientRow);
      setCases(caseRows);
      setFiles(fileRows);
      const lastClosed = caseRows.find((c) => c.status === "CLOSED");
      if (lastClosed) {
        const detail = await api.get<{ case: NursingCaseDetail }>(`/nursing-cases/${lastClosed.id}`).then((d) => d.case).catch(() => null);
        if (!cancelled) setLastTreatment(detail);
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patientId]);

  if (loading) return <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>;
  if (!patient) return <p className="text-admin-body-sm text-admin-danger">Patient not found.</p>;

  const age = Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 24 * 3600 * 1000));

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-admin-caption text-admin-text-secondary">
        <ChevronLeft className="size-3.5" aria-hidden="true" /> Back
      </button>

      <Card className="flex items-center gap-3 border-admin-border p-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-admin-sidebar-cta text-admin-h4 font-semibold text-white">
          {patient.firstName[0]}{patient.lastName[0]}
        </div>
        <div className="min-w-0">
          <p className="text-admin-h4 text-admin-text">{patient.firstName} {patient.lastName}</p>
          <p className="text-admin-caption text-admin-text-secondary">{patient.uniquePatientId} · {patient.gender}, {age}y</p>
        </div>
      </Card>

      {lastTreatment?.documentationSheet && (
        <Card className="space-y-2 border-admin-border p-4">
          <p className="flex items-center gap-1.5 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">
            <History className="size-3.5" aria-hidden="true" /> Last Treatment
          </p>
          <Row label="Treatment Date" value={lastTreatment.documentationSheet.treatmentDate ?? "—"} />
          <Row label="Diagnosis" value={lastTreatment.documentationSheet.diagnosis ?? "—"} />
          <Row label="Managing Consultant (QA Officer)" value={lastTreatment.documentationSheet.managingConsultant ?? "—"} />
          <Row label="Next Appointment" value={lastTreatment.documentationSheet.nextAppointmentDate ?? "—"} />
          {lastTreatment.documentationSheet.note && (
            <div className="border-t border-admin-border pt-2">
              <p className="text-admin-micro font-semibold text-admin-text-secondary">Note</p>
              <p className="text-admin-body-sm text-admin-text">{lastTreatment.documentationSheet.note}</p>
            </div>
          )}
        </Card>
      )}

      {cases.length > 0 && (
        <div>
          <p className="mb-2 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">
            Case History ({cases.length})
          </p>
          <div className="space-y-1.5">
            {cases.map((c) => {
              const Icon = STATUS_ICON[c.status];
              return (
                <Card
                  key={c.id}
                  className="flex cursor-pointer items-center justify-between gap-3 border-admin-border p-3"
                  onClick={() => navigate(`/dashboard/quality-assurance-officer/cases/${c.id}`)}
                >
                  <div className="min-w-0">
                    <p className="text-admin-caption font-semibold text-admin-text">Cycle {c.cycleNumber} · {new Date(c.startedAt).toLocaleDateString()}</p>
                    <p className="text-admin-micro text-admin-text-secondary">{c.startedByEmail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={cn("flex items-center gap-1 text-admin-micro font-semibold", STATUS_COLOR[c.status])}>
                      <Icon className="size-3.5" aria-hidden="true" /> {STATUS_LABEL[c.status]}
                    </span>
                    <ChevronRight className="size-3.5 text-admin-text-secondary" aria-hidden="true" />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Card className="space-y-2 border-admin-border p-4">
        <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Documents</p>
        {files.length === 0 ? (
          <p className="text-admin-body-sm text-admin-text-secondary">No files on record for this patient.</p>
        ) : (
          <ul className="space-y-1.5">
            {files.map((f) => (
              <li key={f.id}>
                <a
                  href={`/api/files/${f.id}/content`} target="_blank" rel="noreferrer"
                  className="flex items-center justify-between gap-2 rounded-admin-xs border border-admin-border px-3 py-2 text-admin-body-sm text-admin-text hover:bg-admin-card-alt"
                >
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    <FileText className="size-3.5 shrink-0 text-admin-text-secondary" aria-hidden="true" /> {f.mimeType}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-admin-micro text-admin-text-secondary">
                    {new Date(f.createdAt).toLocaleDateString()} <ExternalLink className="size-3" aria-hidden="true" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// One label/value line.
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-admin-body-sm">
      <span className="text-admin-text-secondary">{label}</span>
      <span className="text-right text-admin-text">{value}</span>
    </div>
  );
}
