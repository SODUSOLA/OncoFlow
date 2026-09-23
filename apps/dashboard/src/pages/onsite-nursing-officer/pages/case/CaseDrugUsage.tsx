import { useEffect, useState } from "react";
import { Pill } from "lucide-react";
import { api } from "../../../../lib/api";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import type { Drug } from "../../../../lib/drugSupply";
import { DrugPicker } from "../inventory/DrugPicker";

interface UsageRow { id: string; drugId: string; drugName: string; drugStrength: string; quantityUsed: number; usedAt: string }

// Drugs administered for this case: the case is the context, so logging usage here takes only a drug and a
// quantity — no case picker, the same "no-option for user input" shape the invoice generator uses, per request.
export function CaseDrugUsage({ nursingCaseId, editable }: { nursingCaseId: string; editable: boolean }) {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drugId, setDrugId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reloads the drugs administered for this case.
  function load() {
    api.get<{ usage: UsageRow[] }>(`/drug-usage?nursingCaseId=${nursingCaseId}`).then((d) => setUsage(d.usage)).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get<{ drugs: Drug[] }>("/inventory/drugs").then((d) => setDrugs(d.drugs)).catch(() => {});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nursingCaseId]);

  // Logs the drug against this case, which deducts it from the officer's stock immediately.
  async function logUsage() {
    if (!drugId || !(Number(quantity) > 0)) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/drug-usage", { nursingCaseId, drugId, quantity: Number(quantity) });
      setDrugId("");
      setQuantity("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log this drug");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 border-admin-border p-4">
      <p className="flex items-center gap-1.5 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">
        <Pill className="size-3.5" aria-hidden="true" /> Drugs Administered
      </p>

      {loading ? (
        <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
      ) : usage.length === 0 ? (
        <p className="text-admin-body-sm text-admin-text-secondary">Nothing logged for this case yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {usage.map((u) => (
            <li key={u.id} className="flex items-center justify-between rounded-admin-sm bg-admin-card-alt px-3 py-2 text-admin-body-sm">
              <span className="text-admin-text">{u.drugName} <span className="text-admin-text-secondary">{u.drugStrength}</span></span>
              <span className="text-admin-text-secondary">{u.quantityUsed} · {new Date(u.usedAt).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <div className="flex gap-2 border-t border-admin-border pt-3">
          <div className="min-w-0 flex-1"><DrugPicker drugs={drugs} value={drugId} onChange={setDrugId} /></div>
          <input
            type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty"
            className="w-20 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
          />
          <Button onClick={logUsage} loading={busy} disabled={!drugId || !(Number(quantity) > 0)} size="sm" className="shrink-0 rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
            Log
          </Button>
        </div>
      ) : (
        <p className="border-t border-admin-border pt-3 text-admin-micro text-admin-text-secondary">This case is closed — nothing more can be logged against it.</p>
      )}
      {error && <p className="text-admin-micro text-admin-danger">{error}</p>}
    </Card>
  );
}
