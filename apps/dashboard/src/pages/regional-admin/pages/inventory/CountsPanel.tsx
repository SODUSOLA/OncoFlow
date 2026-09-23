import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { Button } from "../../../../components/ui/Button";
import { cn } from "../../../../lib/utils";
import type { Drug } from "../../../../lib/drugSupply";
import type { OfficerStockRow } from "./OfficerStockPanel";

interface Reconciliation {
  id: string; scope: "REGIONAL" | "NURSING_OFFICER"; officerEmail: string | null; drugName: string; drugStrength: string;
  periodEnd: string; expectedQuantity: number; countedQuantity: number; variance: number; resolvedAt: string | null;
}

// Records physical counts against the regional or an officer's ledger, and lists variances to resolve.
export function CountsPanel({ drugs, onChanged }: { drugs: Drug[]; onChanged: () => void }) {
  const [scope, setScope] = useState<"REGIONAL" | "NURSING_OFFICER">("REGIONAL");
  const [officerId, setOfficerId] = useState("");
  const [drugId, setDrugId] = useState("");
  const [counted, setCounted] = useState("");
  const [officers, setOfficers] = useState<{ id: string; email: string }[]>([]);
  const [rows, setRows] = useState<Reconciliation[]>([]);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Reloads the reconciliation history.
  const load = useCallback(() => {
    api.get<{ reconciliations: Reconciliation[] }>("/drug-reconciliations").then((d) => setRows(d.reconciliations)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    api.get<{ stock: OfficerStockRow[] }>("/drug-stock/officers").then((d) => {
      const seen = new Map(d.stock.map((s) => [s.officerId, s.officerEmail]));
      setOfficers([...seen].map(([id, email]) => ({ id, email })));
    }).catch(() => {});
  }, [load]);

  // Records the count for today, snapshotting the ledger's expected quantity.
  async function record() {
    setBusy(true);
    setMessage(null);
    const day = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
      const res = await api.post<{ expectedQuantity: number; variance: number }>("/drug-reconciliations", {
        scope, nursingOfficerId: scope === "NURSING_OFFICER" ? officerId : undefined, drugId,
        periodStart: day, periodEnd: day, countedQuantity: Number(counted),
      });
      setMessage(`Expected ${res.expectedQuantity}. ${res.variance === 0 ? "No variance." : `Variance ${res.variance > 0 ? "+" : ""}${res.variance} flagged.`}`);
      setCounted("");
      load();
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not record the count");
    } finally {
      setBusy(false);
    }
  }

  // Resolves a flagged variance.
  async function resolve(id: string) {
    setResolving(id);
    try {
      await api.post(`/drug-reconciliations/${id}/resolve`);
      load();
      onChanged();
    } catch {
      // Left in the list on failure, so retrying is just clicking Resolve again.
    } finally {
      setResolving(null);
    }
  }

  const ready = drugId && counted !== "" && (scope === "REGIONAL" || officerId);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 border-b border-gray-100 px-5 py-4 md:grid-cols-5">
        <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="REGIONAL">Regional stock</option>
          <option value="NURSING_OFFICER">Nursing officer</option>
        </select>
        <select value={officerId} onChange={(e) => setOfficerId(e.target.value)} disabled={scope === "REGIONAL"} className="rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50">
          <option value="">Officer…</option>
          {officers.map((o) => <option key={o.id} value={o.id}>{o.email}</option>)}
        </select>
        <select value={drugId} onChange={(e) => setDrugId(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="">Drug…</option>
          {drugs.map((d) => <option key={d.id} value={d.id}>{d.name} {d.strength}</option>)}
        </select>
        <input type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="Counted" className="rounded border border-gray-300 px-3 py-2 text-sm" />
        <Button onClick={record} loading={busy} disabled={!ready}>Record count</Button>
        {message && <p className="col-span-full text-sm text-gray-600">{message}</p>}
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">No counts recorded yet</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-400">
            <tr>
              <th className="px-5 py-2 font-medium">Scope</th>
              <th className="px-5 py-2 font-medium">Drug</th>
              <th className="px-5 py-2 font-medium">Day</th>
              <th className="px-5 py-2 font-medium">Expected</th>
              <th className="px-5 py-2 font-medium">Counted</th>
              <th className="px-5 py-2 font-medium">Variance</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 text-gray-800">{r.scope === "REGIONAL" ? "Regional stock" : r.officerEmail}</td>
                <td className="px-5 py-3 text-gray-600">{r.drugName} <span className="text-gray-400">{r.drugStrength}</span></td>
                <td className="px-5 py-3 text-gray-500">{r.periodEnd}</td>
                <td className="px-5 py-3 text-gray-600">{r.expectedQuantity}</td>
                <td className="px-5 py-3 text-gray-600">{r.countedQuantity}</td>
                <td className={cn("px-5 py-3 font-medium", r.variance < 0 ? "text-red-600" : r.variance > 0 ? "text-amber-600" : "text-gray-500")}>
                  {r.variance > 0 ? `+${r.variance}` : r.variance}
                </td>
                <td className="px-5 py-3 text-right">
                  {r.variance !== 0 && (r.resolvedAt ? <span className="text-xs text-gray-400">Resolved</span> : (
                    <Button size="sm" variant="outline" onClick={() => resolve(r.id)} loading={resolving === r.id}>Resolve</Button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
