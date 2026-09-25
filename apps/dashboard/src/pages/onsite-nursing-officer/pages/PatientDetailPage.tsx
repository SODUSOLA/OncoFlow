import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft, Phone, Plus, FileCheck2, Clock3, CheckCircle2, ChevronRight, FileText, Lock, ExternalLink, History,
} from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import type { Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import type { NursingCase, NursingCaseDetail, RegimenCycleRow, PatientCaseHistoryEntry, FileRecord } from "../lib/types";

const STATUS_LABEL: Record<NursingCase["status"], string> = {
  STARTED: "In Progress", PENDING_QA_REVIEW: "Pending QA Review", CLOSED: "Closed",
};
const STATUS_ICON: Record<NursingCase["status"], typeof Clock3> = {
  STARTED: Clock3, PENDING_QA_REVIEW: FileCheck2, CLOSED: CheckCircle2,
};
const STATUS_COLOR: Record<NursingCase["status"], string> = {
  STARTED: "text-admin-warning", PENDING_QA_REVIEW: "text-admin-sidebar-cta", CLOSED: "text-admin-success",
};

// Patient detail page — the patient folder: whether a case can be started or continued, the last closed
// treatment's summary, this patient's full case history (across every nurse, not just the caller), and
// every file/document on record for them. Any professional with patient:read sees the same folder.
export default function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [dueCycle, setDueCycle] = useState<RegimenCycleRow | null>(null);
  const [cases, setCases] = useState<PatientCaseHistoryEntry[]>([]);
  const [lastTreatment, setLastTreatment] = useState<NursingCaseDetail | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the patient couldn't be opened (e.g. outside the nurse's D-1 to D+1 visit window), straight from the API.
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      api.get<{ patient: Patient }>(`/patients/${patientId}`).then((d) => d.patient).catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
        return null;
      }),
      api.get<{ cases: PatientCaseHistoryEntry[] }>(`/nursing-cases?patientId=${patientId}`).then((d) => d.cases).catch(() => []),
      api.get<{ files: FileRecord[] }>(`/files?patientId=${patientId}`).then((d) => d.files).catch(() => []),
      user?.facilityId
        ? api.get<{ cycles: RegimenCycleRow[] }>(`/regimen-cycles?facilityId=${user.facilityId}&date=${today}&due=true`)
            .then((d) => d.cycles.find((c) => c.patientId === patientId) ?? null)
            .catch(() => null)
        : Promise.resolve(null),
    ]).then(async ([patientRow, caseRows, fileRows, cycle]) => {
      if (cancelled) return;
      setPatient(patientRow);
      setCases(caseRows);
      setFiles(fileRows);
      setDueCycle(cycle);
      // The most recent closed visitation, for the "Last Treatment" summary — a separate fetch since the
      // case-history list doesn't carry each case's documentation sheet.
      const lastClosed = caseRows.find((c) => c.status === "CLOSED");
      if (lastClosed) {
        const detail = await api.get<{ case: NursingCaseDetail }>(`/nursing-cases/${lastClosed.id}`).then((d) => d.case).catch(() => null);
        if (!cancelled) setLastTreatment(detail);
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patientId, user?.facilityId]);

  if (loading) return <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>;
  if (!patient) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate("/dashboard/onsite-nursing-officer/patients")} className="flex items-center gap-1 text-admin-caption text-admin-text-secondary">
          <ChevronLeft className="size-3.5" aria-hidden="true" /> Back to Patients
        </button>
        <Card className="flex items-start gap-3 border-admin-border bg-admin-card-alt p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-admin-text-secondary" aria-hidden="true" />
          <div>
            <p className="text-admin-body-sm font-semibold text-admin-text">Patient not available</p>
            <p className="mt-1 text-admin-body-sm text-admin-text-secondary">
              {loadError ?? "This patient could not be found."}
            </p>
            <p className="mt-2 text-admin-caption text-admin-text-secondary">
              You can open a patient from the day before to the day after their scheduled visit, or while your case with them is open.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const age = Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  const openCase = cases.find((c) => c.status !== "CLOSED") ?? null;

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

      {/* No phone number is shown, and calling is intentionally off until in-app calling is integrated. */}
      <Button variant="outline" size="sm" disabled title="In-app calling isn't set up yet" className="w-full rounded-admin-xs">
        <Phone className="size-3.5" aria-hidden="true" /> Call Patient — coming soon
      </Button>

      {openCase ? (
        <Button
          onClick={() => navigate(`/dashboard/onsite-nursing-officer/cases/${openCase.id}`)}
          className="w-full rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90"
        >
          <FileCheck2 className="size-4" aria-hidden="true" /> Continue Open Case
        </Button>
      ) : dueCycle ? (
        <Button
          onClick={() => navigate("/dashboard/onsite-nursing-officer/new-case", { state: { cycle: dueCycle } })}
          className="w-full rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90"
        >
          <Plus className="size-4" aria-hidden="true" /> Start Case for This Patient
        </Button>
      ) : (
        <Card className="border-admin-border bg-admin-card-alt p-3.5 text-center text-admin-body-sm text-admin-text-secondary">
          No visitation currently due for this patient — nothing to start yet.
        </Card>
      )}

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
            Cases With This Patient ({cases.length})
          </p>
          <div className="space-y-1.5">
            {cases.map((c) => {
              const Icon = STATUS_ICON[c.status];
              return (
                <Card
                  key={c.id}
                  className="flex cursor-pointer items-center justify-between gap-3 border-admin-border p-3"
                  onClick={() => navigate(`/dashboard/onsite-nursing-officer/cases/${c.id}`)}
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
