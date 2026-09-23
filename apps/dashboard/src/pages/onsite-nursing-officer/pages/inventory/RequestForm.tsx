import { useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "../../../../lib/api";
import { Button } from "../../../../components/ui/Button";
import type { Drug } from "../../../../lib/drugSupply";
import { DrugPicker } from "./DrugPicker";

interface Line { drugId: string; quantity: string }

// Form to request one or more drugs from Regional Admin.
export function RequestForm({ drugs, onDone }: { drugs: Drug[]; onDone: () => void }) {
  const [lines, setLines] = useState<Line[]>([{ drugId: "", quantity: "" }]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Updates one line of the request.
  function update(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  const ready = lines.every((l) => l.drugId && Number(l.quantity) > 0)
    && new Set(lines.map((l) => l.drugId)).size === lines.length;

  // Sends the request to Regional Admin.
  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/drug-requests", { lines: lines.map((l) => ({ drugId: l.drugId, quantity: Number(l.quantity) })) });
      setLines([{ drugId: "", quantity: "" }]);
      setMessage("Request sent to Regional Admin.");
      onDone();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send the request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><DrugPicker drugs={drugs} value={line.drugId} onChange={(drugId) => update(i, { drugId })} /></div>
          <input
            type="number" min={1} value={line.quantity} onChange={(e) => update(i, { quantity: e.target.value })} placeholder="Qty"
            className="w-20 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
          />
          {lines.length > 1 && (
            <button type="button" aria-label="Remove line" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))} className="text-admin-text-secondary">
              <X className="size-4" />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setLines((prev) => [...prev, { drugId: "", quantity: "" }])} className="flex items-center gap-1 text-admin-caption font-medium text-admin-sidebar-cta">
          <Plus className="size-3.5" /> Add another drug
        </button>
        <Button onClick={submit} loading={busy} disabled={!ready} size="sm" className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">Send request</Button>
      </div>
      {!ready && lines.length > 1 && <p className="text-admin-micro text-admin-text-secondary">Each drug can appear once, with a quantity.</p>}
      {message && <p className="text-admin-micro text-admin-text-secondary">{message}</p>}
    </div>
  );
}
