import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ShieldAlert, ArrowLeft, Lock } from "lucide-react";
import { api } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { useFolder, useMedicationTriage } from "../lib/vmo";
import { VitalsTimeline } from "../lib/VitalsTimeline";
import { CRCL_COLOR, EGFR_COLOR } from "../../consulting-oncologist/lib/clinicalTypes";

const BASE = "/dashboard/virtual-medical-officer";

// Unlocked once the checklist is complete. The server enforces that; a direct visit before then shows the lock.
export default function PatientFolderPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { folder, locked, error } = useFolder(conversationId);
  const { cards } = useMedicationTriage(folder ? conversationId : undefined);

  if (locked) {
    return (
      <div className="mx-auto max-w-md p-12 text-center">
        <Lock className="mx-auto size-8 text-admin-text-secondary" aria-hidden="true" />
        <h1 className="mt-3 text-admin-h3 text-admin-text">Patient folder locked</h1>
        <p className="mt-1 text-admin-body-sm text-admin-text-secondary">Complete the mandatory triage checklist first.</p>
        <Link to={`${BASE}/triage/${conversationId}`} className="mt-4 inline-block rounded-admin-sm bg-admin-sidebar-cta px-4 py-2 text-admin-body-sm text-white">Begin triage</Link>
      </div>
    );
  }
  if (error) return <p className="p-8 text-admin-danger">{error}</p>;
  if (!folder) return <p className="p-8 text-admin-text-secondary">Loading…</p>;
  const m = folder.clinicalMetrics;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`${BASE}/inbox/${conversationId}`)} aria-label="Back to chat" className="text-admin-text-secondary hover:text-admin-text"><ArrowLeft className="size-5" /></button>
          <div>
            <h1 className="text-admin-h2 text-admin-text">{folder.patient.firstName} {folder.patient.lastName}</h1>
            <p className="text-admin-body-sm text-admin-text-secondary">{folder.patient.uniquePatientId} · {folder.patient.gender} · DOB {folder.patient.dob}</p>
          </div>
        </div>
        <Link to={`${BASE}/medication-triage/${conversationId}`} className="rounded-admin-sm border border-admin-border px-4 py-2 text-admin-body-sm font-semibold text-admin-text hover:bg-admin-card-alt">Medication Triage</Link>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <section className="col-span-2 rounded-admin-sm border border-admin-border bg-white p-5 shadow-admin-card">
          <h2 className="mb-3 text-admin-h4 text-admin-text">Vitals timeline</h2>
          <VitalsTimeline series={cards?.vitalTimelines ?? []} />
        </section>

        <section className="rounded-admin-sm border border-admin-border bg-white p-5 shadow-admin-card">
          <h2 className="mb-3 text-admin-h4 text-admin-text">Current regimen</h2>
          {folder.regimen ? (
            <div className="space-y-1 text-admin-body-sm">
              <p className="font-semibold text-admin-text">{folder.regimen.drugName}</p>
              <p className="text-admin-text-secondary">{folder.regimen.protocolCode}</p>
              {folder.regimen.diagnosis && <p className="text-admin-text-secondary">{folder.regimen.diagnosis}</p>}
              <p className="text-admin-text">Cycle {folder.regimen.currentCycleNumber ?? "–"} of {folder.regimen.totalCycles}</p>
            </div>
          ) : <p className="text-admin-body-sm text-admin-text-secondary">No active regimen.</p>}
        </section>

        <section className="col-span-2 rounded-admin-sm border border-admin-border bg-white p-5 shadow-admin-card">
          <h2 className="mb-3 text-admin-h4 text-admin-text">Recent lab results</h2>
          {!m ? <p className="text-admin-body-sm text-admin-text-secondary">No results recorded yet.</p> : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {m.labValues.map((l) => (
                  <div key={l.analyteCode} className={cn("rounded-admin-sm border p-3", l.outOfRange ? "border-admin-danger bg-red-50" : "border-admin-border")}>
                    <p className="text-admin-micro uppercase text-admin-text-secondary">{l.displayName}</p>
                    <p className={cn("text-admin-h4", l.outOfRange ? "text-admin-danger" : "text-admin-text")}>{l.value} <span className="text-admin-caption font-normal">{l.unit}</span></p>
                    <p className="text-admin-micro text-admin-text-secondary">Normal {l.normalLow}–{l.normalHigh}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-admin-caption text-admin-text-secondary">
                CrCl <b className={CRCL_COLOR[m.crclTier]}>{Number(m.crcl).toFixed(0)}</b> · eGFR <b className={EGFR_COLOR[m.egfrStage]}>{Number(m.egfr).toFixed(0)}</b> · recorded {new Date(m.recordedAt).toLocaleDateString()}
              </p>
            </>
          )}
        </section>

        <EscalationCard conversationId={conversationId!} currentResultsId={m?.id} />
      </div>
    </div>
  );
}

// Wires the Triage Decision card to the real escalation: VMO-initiated, no Clinical Director approval step.
function EscalationCard({ conversationId, currentResultsId }: { conversationId: string; currentResultsId?: string }) {
  const [reason, setReason] = useState("");
  const [linkResults, setLinkResults] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function escalate() {
    setBusy(true); setError(null);
    try {
      await api.post(`/vmo/conversations/${conversationId}/escalations`, {
        triggerReason: reason.trim(),
        ...(linkResults && currentResultsId ? { triggerReference: currentResultsId } : {}),
      });
      setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't escalate"); } finally { setBusy(false); }
  }

  return (
    <section id="escalate" className="rounded-admin-sm border-l-4 border-admin-border border-l-admin-danger bg-white p-5 shadow-admin-card">
      <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text"><ShieldAlert className="size-5 text-admin-danger" aria-hidden="true" /> Escalate to Specialist Oncologist</h2>
      {done ? (
        <p className="mt-3 text-admin-body-sm text-admin-success">Escalated. The Regional Admin has been asked to schedule a consult, and the Clinical Director has been informed.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-admin-caption text-admin-text-secondary">No approval is needed. The Clinical Director is informed; the Regional Admin schedules the virtual consult.</p>
          <label className="block text-admin-caption font-semibold uppercase text-admin-text-secondary">Trigger reason
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} placeholder="e.g. ANC < 1.5 Protocol"
              className="mt-1 w-full rounded-admin-sm border border-admin-border bg-admin-card-alt p-2 text-admin-body-sm font-normal normal-case text-admin-text" />
          </label>
          {currentResultsId && (
            <label className="flex items-center gap-2 text-admin-body-sm text-admin-text">
              <input type="checkbox" checked={linkResults} onChange={(e) => setLinkResults(e.target.checked)} /> Attach the current lab results
            </label>
          )}
          {error && <p role="alert" className="text-admin-body-sm text-admin-danger">{error}</p>}
          <button onClick={escalate} disabled={busy || !reason.trim()} className="w-full rounded-admin-sm bg-admin-danger px-4 py-2 text-admin-body-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Escalating…" : "Escalate"}
          </button>
        </div>
      )}
    </section>
  );
}
