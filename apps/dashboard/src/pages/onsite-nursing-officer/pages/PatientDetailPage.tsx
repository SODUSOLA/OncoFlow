import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Phone, Plus, FileCheck2, Clock3, CheckCircle2, ChevronRight } from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import type { Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import type { NursingCase, RegimenCycleRow } from "../lib/types";

const STATUS_LABEL: Record<NursingCase["status"], string> = {
  STARTED: "In Progress", PENDING_QA_REVIEW: "Pending QA Review", CLOSED: "Closed",
};
const STATUS_ICON: Record<NursingCase["status"], typeof Clock3> = {
  STARTED: Clock3, PENDING_QA_REVIEW: FileCheck2, CLOSED: CheckCircle2,
};
const STATUS_COLOR: Record<NursingCase["status"], string> = {
  STARTED: "text-admin-warning", PENDING_QA_REVIEW: "text-admin-sidebar-cta", CLOSED: "text-admin-success",
};

// Button that places a masked call to the patient.
function CallButton({ patientId }: { patientId: string }) {
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Places the call through the API.
  async function call() {
    setCalling(true);
    setResult(null);
    try {
      const res = await api.post<{ callSessionId: string }>(`/patients/${patientId}/call`);
      setResult(`Call started — session ${res.callSessionId.slice(0, 8)}`);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Call failed");
    } finally {
      setCalling(false);
    }
  }

  return (
    <div>
      <Button onClick={call} loading={calling} variant="outline" size="sm" className="rounded-admin-xs">
        <Phone className="size-3.5" aria-hidden="true" /> Call Patient
      </Button>
      {result && <p className="mt-1 text-admin-micro text-admin-text-secondary">{result}</p>}
    </div>
  );
}

// Patient detail page: the single place that decides whether a case can be started, continued, or neither, for this patient.
export default function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [dueCycle, setDueCycle] = useState<RegimenCycleRow | null>(null);
  const [cases, setCases] = useState<NursingCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      api.get<{ patient: Patient }>(`/patients/${patientId}`).then((d) => d.patient).catch(() => null),
      api.get<{ cases: NursingCase[] }>("/nursing-cases/mine").then((d) => d.cases.filter((c) => c.patientId === patientId)).catch(() => []),
      user?.facilityId
        ? api.get<{ cycles: RegimenCycleRow[] }>(`/regimen-cycles?facilityId=${user.facilityId}&date=${today}&due=true`)
            .then((d) => d.cycles.find((c) => c.patientId === patientId) ?? null)
            .catch(() => null)
        : Promise.resolve(null),
    ]).then(([patientRow, caseRows, cycle]) => {
      if (cancelled) return;
      setPatient(patientRow);
      setCases(caseRows.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
      setDueCycle(cycle);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patientId, user?.facilityId]);

  if (loading) return <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>;
  if (!patient) return <p className="text-admin-body-sm text-admin-danger">Patient not found.</p>;

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

      <Card className="space-y-2 border-admin-border p-4">
        <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Contact</p>
        <p className="text-admin-body-sm text-admin-text">{patient.phoneMasked ?? "No phone on record"}</p>
        <CallButton patientId={patient.id} />
      </Card>

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
                    <p className="text-admin-caption font-semibold text-admin-text">Case {c.id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-admin-micro text-admin-text-secondary">{new Date(c.startedAt).toLocaleDateString()}</p>
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
    </div>
  );
}
