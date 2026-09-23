import { useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { cn } from "../../../../lib/utils";
import type { DrugStockRow } from "../../../../lib/drugSupply";

export interface OfficerStockRow extends DrugStockRow { officerId: string; officerEmail: string; facilityId: string | null }

// Today's Lagos date as YYYY-MM-DD, the default for the per-day view.
function today(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

// How much of each drug every nursing officer in the region had left at the end of a chosen day.
export function OfficerStockPanel() {
  const [asOf, setAsOf] = useState(today());
  const [rows, setRows] = useState<OfficerStockRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<{ stock: OfficerStockRow[] }>(`/drug-stock/officers?asOf=${asOf}`)
      .then((d) => setRows(d.stock))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [asOf]);

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
        <label className="text-xs font-medium text-gray-500" htmlFor="stock-as-of">Stock left at end of</label>
        <input id="stock-as-of" type="date" value={asOf} max={today()} onChange={(e) => e.target.value && setAsOf(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
      </div>
      {loading ? (
        <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">No officer held stock on this day</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-400">
            <tr>
              <th className="px-5 py-2 font-medium">Nursing officer</th>
              <th className="px-5 py-2 font-medium">Drug</th>
              <th className="px-5 py-2 font-medium">Left</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r) => (
              <tr key={`${r.officerId}-${r.drugId}`}>
                <td className="px-5 py-3 text-gray-800">{r.officerEmail}</td>
                <td className="px-5 py-3 text-gray-600">{r.drugName} <span className="text-gray-400">{r.drugStrength}</span></td>
                <td className="px-5 py-3">
                  <span className={cn("rounded px-2 py-0.5 text-xs font-medium", r.quantity < 0 ? "bg-red-100 text-red-700" : r.lowStock ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700")}>
                    {r.quantity}{r.quantity < 0 ? " · Below zero" : r.lowStock ? " · Low" : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
