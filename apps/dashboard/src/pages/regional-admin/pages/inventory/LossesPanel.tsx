import { useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { LOSS_REASON_LABEL } from "../../../../lib/drugSupply";

interface LossRow {
  id: string; officerEmail: string; drugName: string; drugStrength: string; quantityLost: number;
  reason: keyof typeof LOSS_REASON_LABEL; notes: string | null; reportedAt: string;
}

// Spillage and breakage reported by officers in the region.
export function LossesPanel() {
  const [rows, setRows] = useState<LossRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ losses: LossRow[] }>("/drug-loss-reports").then((d) => setRows(d.losses)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (rows.length === 0) return <div className="p-8 text-center text-sm text-gray-400">No losses reported</div>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-gray-400">
        <tr>
          <th className="px-5 py-2 font-medium">Reported</th>
          <th className="px-5 py-2 font-medium">Officer</th>
          <th className="px-5 py-2 font-medium">Drug</th>
          <th className="px-5 py-2 font-medium">Qty</th>
          <th className="px-5 py-2 font-medium">Reason</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-5 py-3 text-gray-500">{new Date(r.reportedAt).toLocaleString()}</td>
            <td className="px-5 py-3 text-gray-800">{r.officerEmail}</td>
            <td className="px-5 py-3 text-gray-600">{r.drugName} <span className="text-gray-400">{r.drugStrength}</span></td>
            <td className="px-5 py-3 font-medium text-red-600">{r.quantityLost}</td>
            <td className="px-5 py-3 text-gray-600">{LOSS_REASON_LABEL[r.reason]}{r.notes ? ` — ${r.notes}` : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
