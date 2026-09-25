import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { api } from "../lib/api";
import { INCIDENT_TYPE_LABEL, type IncidentReport } from "../lib/drugSupply";

// Stock incidents (breakage, spoilage, expiry, wastage) reported by nursing officers in the caller's region,
// with the written reason and evidence photo. Shared by Regional Admin's Inventory tab and the SDNS page —
// the API scopes the list to the caller's region and serves the photo behind the same check.
export function IncidentReports() {
  const [rows, setRows] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ losses: IncidentReport[] }>("/drug-loss-reports").then((d) => setRows(d.losses)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (rows.length === 0) return <div className="p-8 text-center text-sm text-gray-400">No incidents reported</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-gray-400">
          <tr>
            <th className="px-5 py-2 font-medium">Reported</th>
            <th className="px-5 py-2 font-medium">Officer</th>
            <th className="px-5 py-2 font-medium">Drug</th>
            <th className="px-5 py-2 font-medium">Qty</th>
            <th className="px-5 py-2 font-medium">Type</th>
            <th className="px-5 py-2 font-medium">Reason</th>
            <th className="px-5 py-2 font-medium">Photo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-5 py-3 text-gray-500">{new Date(r.reportedAt).toLocaleString()}</td>
              <td className="px-5 py-3 text-gray-800">{r.officerEmail}</td>
              <td className="px-5 py-3 text-gray-600">{r.drugName} <span className="text-gray-400">{r.drugStrength}</span></td>
              <td className="px-5 py-3 font-medium text-red-600">{r.quantityLost}</td>
              <td className="px-5 py-3 text-gray-800">{INCIDENT_TYPE_LABEL[r.incidentType]}</td>
              <td className="px-5 py-3 text-gray-600">{r.reason ?? "—"}</td>
              <td className="px-5 py-3">
                {r.photoFileId ? (
                  <a href={`/api/drug-loss-reports/${r.id}/photo`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-admin-sidebar-cta underline">
                    <ImageIcon className="size-3.5" aria-hidden="true" /> View
                  </a>
                ) : <span className="text-gray-400">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
