import { useState } from "react";
import { api } from "../../../../lib/api";
import { Button } from "../../../../components/ui/Button";
import { LOSS_REASON_LABEL, type Drug } from "../../../../lib/drugSupply";
import { DrugPicker } from "./DrugPicker";

type Reason = keyof typeof LOSS_REASON_LABEL;

// Form to report spillage or breakage outside any case; Regional Admin is alerted.
export function LossForm({ drugs, onDone }: { drugs: Drug[]; onDone: () => void }) {
  const [drugId, setDrugId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<Reason>("SPILLAGE");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Records the loss, deducts stock and alerts Regional Admin.
  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/drug-loss-reports", { drugId, quantity: Number(quantity), reason, notes: notes.trim() || undefined });
      setQuantity("");
      setNotes("");
      setMessage("Reported. Regional Admin has been notified.");
      onDone();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not report the loss");
    } finally {
      setBusy(false);
    }
  }

  const ready = drugId && Number(quantity) > 0 && (reason !== "OTHER" || notes.trim());

  return (
    <div className="space-y-2">
      <DrugPicker drugs={drugs} value={drugId} onChange={setDrugId} />
      <div className="flex gap-2">
        <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty lost" className="w-28 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm" />
        <select value={reason} onChange={(e) => setReason(e.target.value as Reason)} className="flex-1 rounded-admin-sm border border-admin-border bg-white px-3 py-2 text-admin-body-sm">
          {(Object.keys(LOSS_REASON_LABEL) as Reason[]).map((r) => <option key={r} value={r}>{LOSS_REASON_LABEL[r]}</option>)}
        </select>
      </div>
      <textarea
        value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000}
        placeholder={reason === "OTHER" ? "Describe what happened (required)" : "Notes (optional)"}
        className="w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
      />
      <Button onClick={submit} loading={busy} disabled={!ready} size="sm" className="w-full rounded-admin-xs bg-admin-danger hover:bg-admin-danger/90">Report loss</Button>
      {message && <p className="text-admin-micro text-admin-text-secondary">{message}</p>}
    </div>
  );
}
