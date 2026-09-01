import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import { useRegionScope } from "../lib/useRegionScope";

interface Drug { id: string; name: string; strength: string; category: string }
interface VarianceRow {
  id: string; facilityId: string; facilityName: string; weekEnding: string;
  expectedQty: number; actualQty: number; variance: number; status: string;
}
interface OverviewResponse { variances: VarianceRow[]; variancesOpen: number }

export default function InventoryPage() {
  const { region, facilitiesInRegion, loading: scopeLoading } = useRegionScope();
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [variances, setVariances] = useState<VarianceRow[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const [movementType, setMovementType] = useState<"PURCHASE" | "DISPATCH">("PURCHASE");
  const [drugId, setDrugId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [locationId, setLocationId] = useState(""); // "" = regional pool
  const [recording, setRecording] = useState(false);
  const [recordResult, setRecordResult] = useState<string | null>(null);

  function load() {
    const q = region ? `?region=${encodeURIComponent(region)}` : "";
    api.get<OverviewResponse>(`/inventory/overview${q}`).then((d) => setVariances(d.variances)).catch(() => setVariances([]));
  }

  useEffect(() => {
    api.get<{ drugs: Drug[] }>("/inventory/drugs").then((d) => setDrugs(d.drugs)).catch(() => {});
  }, []);

  useEffect(() => {
    // See SchedulingPage's identical guard — an unscoped fetch while region is still resolving
    // can otherwise race with (and overwrite) the correctly-scoped one.
    if (scopeLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, scopeLoading]);

  async function recordMovement() {
    if (!drugId || !quantity) return;
    setRecording(true);
    setRecordResult(null);
    try {
      await api.post("/inventory/movements", {
        facilityId: locationId || null,
        drugId,
        quantity: Number(quantity),
        movementType,
      });
      setRecordResult("Movement recorded");
      setQuantity("");
      load();
    } catch (err) {
      setRecordResult(err instanceof Error ? err.message : "Failed to record movement");
    } finally {
      setRecording(false);
    }
  }

  async function resolveVariance(id: string) {
    setResolvingId(id);
    try {
      await api.post(`/inventory/reconciliations/${id}/resolve`);
      load();
    } catch {
      // Left in the list on failure — retry is just clicking Resolve again.
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card blueprint className="p-5">
        <p className="text-sm font-semibold text-gray-800">Record movement</p>
        <div className="mt-3 flex gap-2">
          {(["PURCHASE", "DISPATCH"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setMovementType(t)}
              className={cn(
                "rounded border px-4 py-1.5 text-sm font-medium capitalize",
                movementType === t ? "border-ink bg-ink text-white" : "border-gray-200 text-gray-600 hover:border-gray-300",
              )}
            >
              {t.toLowerCase()}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Drug</label>
            <select value={drugId} onChange={(e) => setDrugId(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select drug...</option>
              {drugs.map((d) => (
                <option key={d.id} value={d.id}>{d.name} {d.strength}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Quantity</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Location</label>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="">Regional pool</option>
                {facilitiesInRegion.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
          <Button onClick={recordMovement} loading={recording} disabled={!drugId || !quantity}>Record movement</Button>
          {recordResult && (
            <p className={`text-sm ${recordResult === "Movement recorded" ? "text-green-600" : "text-red-600"}`}>{recordResult}</p>
          )}
        </div>
      </Card>

      <Card blueprint className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <p className="text-sm font-semibold text-gray-800">Reconciliation variances</p>
          <span className="rounded border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">{variances.length} open</span>
        </div>
        {variances.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No open variances</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-400">
              <tr>
                <th className="px-5 py-2 font-medium">Facility</th>
                <th className="px-5 py-2 font-medium">Week ending</th>
                <th className="px-5 py-2 font-medium">Counted</th>
                <th className="px-5 py-2 font-medium">System</th>
                <th className="px-5 py-2 font-medium">Variance</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {variances.map((v) => (
                <tr key={v.id}>
                  <td className="px-5 py-3 text-gray-800">{v.facilityName}</td>
                  <td className="px-5 py-3 text-gray-500">{new Date(v.weekEnding).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-gray-600">{v.actualQty}</td>
                  <td className="px-5 py-3 text-gray-600">{v.expectedQty}</td>
                  <td className={cn("px-5 py-3 font-medium", v.variance < 0 ? "text-red-600" : v.variance > 0 ? "text-amber-600" : "text-gray-500")}>
                    {v.variance > 0 ? `+${v.variance}` : v.variance}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => resolveVariance(v.id)} loading={resolvingId === v.id}>
                      Resolve
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
