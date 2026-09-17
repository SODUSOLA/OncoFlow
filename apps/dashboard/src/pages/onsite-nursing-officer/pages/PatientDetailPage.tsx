import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Phone, Plus } from "lucide-react";
import { api } from "../../../lib/api";
import type { Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";

function CallButton({ patientId }: { patientId: string }) {
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState<string | null>(null);

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

export default function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    api.get<{ patient: Patient }>(`/patients/${patientId}`)
      .then((d) => setPatient(d.patient))
      .catch(() => {})
      .finally(() => setLoading(false));
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

      <Card className="space-y-2 border-admin-border p-4">
        <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Contact</p>
        <p className="text-admin-body-sm text-admin-text">{patient.phoneMasked ?? "No phone on record"}</p>
        <CallButton patientId={patient.id} />
      </Card>

      <Button
        onClick={() => navigate("/dashboard/onsite-nursing-officer/new-case", { state: { patientId: patient.id } })}
        className="w-full rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90"
      >
        <Plus className="size-4" aria-hidden="true" /> Start Case for This Patient
      </Button>
    </div>
  );
}
