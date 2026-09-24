import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "../../../components/ui/Button";

// Returns today's date as YYYY-MM-DD.
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PrescribeRegimenValues {
  diagnosis: string;
  drugName: string;
  protocolCode: string;
  totalCycles: number;
  cycleIntervalDays: number;
  startedAt: string;
}

interface PrescribeRegimenModalProps {
  patientName: string;
  onClose: () => void;
  onSubmit: (values: PrescribeRegimenValues) => Promise<void>;
}

// A consultant prescribing a new treatment plan for a patient (POST /regimen). This is the one place a
// diagnosis is stated — the nursing documentation form reads it back read-only for every cycle under this
// regimen, rather than a nurse retyping one fresh at each visit. Cycles are generated server-side from
// totalCycles/cycleIntervalDays, so this only collects what the consultant actually decides.
export function PrescribeRegimenModal({ patientName, onClose, onSubmit }: PrescribeRegimenModalProps) {
  const [diagnosis, setDiagnosis] = useState("");
  const [drugName, setDrugName] = useState("");
  const [protocolCode, setProtocolCode] = useState("");
  const [totalCycles, setTotalCycles] = useState("6");
  const [cycleIntervalDays, setCycleIntervalDays] = useState("21");
  const [startedAt, setStartedAt] = useState(todayDateString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = diagnosis.trim() && drugName.trim() && protocolCode.trim()
    && Number(totalCycles) > 0 && Number(cycleIntervalDays) > 0 && startedAt;

  // Submits the new regimen and closes the modal.
  async function handleSubmit() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        diagnosis: diagnosis.trim(), drugName: drugName.trim(), protocolCode: protocolCode.trim(),
        totalCycles: Number(totalCycles), cycleIntervalDays: Number(cycleIntervalDays), startedAt,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prescribe this regimen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-admin-md border border-admin-border bg-white shadow-admin-card">
        <div className="flex items-center justify-between border-b border-admin-border px-6 py-4">
          <div>
            <p className="text-admin-h4 text-admin-text">Prescribe Regimen</p>
            <p className="text-admin-caption text-admin-text-secondary">{patientName}</p>
          </div>
          <button onClick={onClose} className="rounded-admin-sm p-1.5 text-admin-text-secondary hover:bg-admin-card-alt">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-3 px-6 py-5">
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Diagnosis</label>
            <textarea
              value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={2} autoFocus maxLength={500}
              placeholder="e.g. Breast cancer, stage II"
              className="mt-0.5 w-full rounded-admin-sm border border-admin-border p-2.5 text-admin-body-sm text-admin-text placeholder:text-admin-text-secondary focus:outline-none focus:ring-1 focus:ring-admin-sidebar-cta"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-admin-caption text-admin-text-secondary">Drug Name</label>
              <input
                value={drugName} onChange={(e) => setDrugName(e.target.value)} placeholder="e.g. Pembrolizumab"
                className="mt-0.5 w-full rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm"
              />
            </div>
            <div>
              <label className="text-admin-caption text-admin-text-secondary">Protocol Code</label>
              <input
                value={protocolCode} onChange={(e) => setProtocolCode(e.target.value)} placeholder="e.g. PEM-Q3W"
                className="mt-0.5 w-full rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-admin-caption text-admin-text-secondary">Total Cycles</label>
              <input
                type="number" min={1} max={50} value={totalCycles} onChange={(e) => setTotalCycles(e.target.value)}
                className="mt-0.5 w-full rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm"
              />
            </div>
            <div>
              <label className="text-admin-caption text-admin-text-secondary">Interval (days)</label>
              <input
                type="number" min={1} max={180} value={cycleIntervalDays} onChange={(e) => setCycleIntervalDays(e.target.value)}
                className="mt-0.5 w-full rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm"
              />
            </div>
            <div>
              <label className="text-admin-caption text-admin-text-secondary">Cycle 1 Date</label>
              <input
                type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)}
                className="mt-0.5 w-full rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm"
              />
            </div>
          </div>
          <p className="text-admin-micro text-admin-text-secondary">
            Generates {Number(totalCycles) || 0} cycles, {Number(cycleIntervalDays) || 0} days apart starting {startedAt || "—"}.
          </p>
          {error && <p className="text-admin-body-sm text-admin-danger">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-admin-border px-6 py-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            loading={saving}
            disabled={!valid}
            className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90"
          >
            Prescribe
          </Button>
        </div>
      </div>
    </div>
  );
}
