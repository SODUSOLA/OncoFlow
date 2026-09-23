import { useState } from "react";
import { api } from "../../../../lib/api";
import { Button } from "../../../../components/ui/Button";
import type { Drug } from "../../../../lib/drugSupply";
import type { NursingCase } from "../../lib/types";
import { DrugPicker } from "./DrugPicker";

// Form to log a drug administered against one of the officer's open cases.
export function UsageForm({ drugs, cases, onDone }: { drugs: Drug[]; cases: NursingCase[]; onDone: () => void }) {
  const [caseId, setCaseId] = useState("");
  const [drugId, setDrugId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Records the usage, which deducts stock immediately.
  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/drug-usage", { nursingCaseId: caseId, drugId, quantity: Number(quantity) });
      setQuantity("");
      setMessage("Logged. Your stock has been updated.");
      onDone();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not log usage");
    } finally {
      setBusy(false);
    }
  }

  if (cases.length === 0) {
    return <p className="text-admin-body-sm text-admin-text-secondary">Usage is logged against a case. Start a case from the Uploads tab first.</p>;
  }

  return (
    <div className="space-y-2">
      <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className="w-full rounded-admin-sm border border-admin-border bg-white px-3 py-2 text-admin-body-sm">
        <option value="">Select case…</option>
        {cases.map((c) => <option key={c.id} value={c.id}>Case {c.id.slice(0, 8).toUpperCase()} · {new Date(c.startedAt).toLocaleDateString()}</option>)}
      </select>
      <DrugPicker drugs={drugs} value={drugId} onChange={setDrugId} />
      <div className="flex gap-2">
        <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty used" className="w-28 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm" />
        <Button onClick={submit} loading={busy} disabled={!caseId || !drugId || !(Number(quantity) > 0)} size="sm" className="flex-1 rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">Log usage</Button>
      </div>
      {message && <p className="text-admin-micro text-admin-text-secondary">{message}</p>}
    </div>
  );
}
