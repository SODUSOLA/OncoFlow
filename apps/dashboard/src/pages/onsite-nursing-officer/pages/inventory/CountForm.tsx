import { useState } from "react";
import { api } from "../../../../lib/api";
import { Button } from "../../../../components/ui/Button";
import type { Drug } from "../../../../lib/drugSupply";
import { DrugPicker } from "./DrugPicker";

interface CountResult { expectedQuantity: number; countedQuantity: number; variance: number }

// Form to record the officer's physical count of one drug against their ledger.
export function CountForm({ drugs, onDone }: { drugs: Drug[]; onDone: () => void }) {
  const [drugId, setDrugId] = useState("");
  const [counted, setCounted] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CountResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Records the count for today; a non-zero variance is flagged to Regional Admin.
  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    const today = new Date().toISOString().slice(0, 10);
    try {
      const res = await api.post<CountResult>("/drug-reconciliations", {
        scope: "NURSING_OFFICER", drugId, periodStart: today, periodEnd: today, countedQuantity: Number(counted),
      });
      setResult(res);
      setCounted("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the count");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <DrugPicker drugs={drugs} value={drugId} onChange={setDrugId} />
      <div className="flex gap-2">
        <input type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="Counted on hand" className="w-36 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm" />
        <Button onClick={submit} loading={busy} disabled={!drugId || counted === ""} size="sm" className="flex-1 rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">Record count</Button>
      </div>
      {result && (
        <p className="text-admin-body-sm text-admin-text">
          Ledger expected {result.expectedQuantity}, you counted {result.countedQuantity}.{" "}
          {result.variance === 0 ? "No variance." : <span className="font-semibold text-admin-danger">Variance {result.variance > 0 ? "+" : ""}{result.variance} flagged to Regional Admin.</span>}
        </p>
      )}
      {error && <p className="text-admin-micro text-admin-danger">{error}</p>}
    </div>
  );
}
