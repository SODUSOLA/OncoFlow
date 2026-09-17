import { useEffect, useState } from "react";
import { TriangleAlert, Package } from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";

interface Drug { id: string; name: string; strength: string; category: string }
interface VarianceRow { id: string; facilityId: string; weekEnding: string; expectedQty: number; actualQty: number; variance: number; status: string }
interface StockRow { drugId: string; drugName: string; drugStrength: string; facilityId: string | null; quantity: number }
interface OverviewResponse { stock: StockRow[]; variances: VarianceRow[] }

// Same client-side-display-only heuristic as Regional Admin's Inventory page — no reorder
// threshold column exists per drug/facility in the data model.
const LOW_STOCK_THRESHOLD = 10;

// ONCOFLOW_NURSING_OFFICER_BUILD_GUIDE.md — "Local Inventory Ledger — purchased/dispatched
// counts, weekly reconciliation prompt... can be built independently." Reuses the exact same
// /inventory endpoints Regional Admin's Inventory page uses, scoped down to this officer's own
// facility (the API has no facility-level query filter, only region — filtered client-side,
// same as everywhere else at this dev scale).
export default function InventoryPage() {
  const { user } = useAuth();
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [variances, setVariances] = useState<VarianceRow[]>([]);
  const [drugId, setDrugId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [movementType, setMovementType] = useState<"PURCHASE" | "DISPATCH">("DISPATCH");
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    api.get<OverviewResponse>("/inventory/overview").then((d) => {
      setStock(d.stock.filter((s) => s.facilityId === user?.facilityId));
      setVariances(d.variances.filter((v) => v.facilityId === user?.facilityId && v.status === "OPEN"));
    }).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get<{ drugs: Drug[] }>("/inventory/drugs").then((d) => setDrugs(d.drugs)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.facilityId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.facilityId]);

  async function recordMovement() {
    if (!drugId || !quantity) return;
    setRecording(true);
    setResult(null);
    try {
      await api.post("/inventory/movements", {
        facilityId: user?.facilityId, drugId, quantity: Number(quantity), movementType,
      });
      setResult("Recorded.");
      setQuantity("");
      load();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Could not record movement");
    } finally {
      setRecording(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-admin-h4 text-admin-text">Local Inventory Ledger</p>

      {variances.length > 0 && (
        <Card className="flex items-start gap-2.5 border-admin-warning/40 bg-admin-warning/10 p-3.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-admin-warning" aria-hidden="true" />
          <p className="text-admin-body-sm text-admin-text">
            {variances.length} weekly reconciliation {variances.length === 1 ? "variance" : "variances"} open for your facility.
          </p>
        </Card>
      )}

      <Card className="border-admin-border p-4">
        <p className="mb-2 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Record Movement</p>
        <div className="space-y-2">
          <select value={drugId} onChange={(e) => setDrugId(e.target.value)} className="w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm">
            <option value="">Select drug…</option>
            {drugs.map((d) => <option key={d.id} value={d.id}>{d.name} {d.strength}</option>)}
          </select>
          <div className="flex gap-2">
            <select value={movementType} onChange={(e) => setMovementType(e.target.value as "PURCHASE" | "DISPATCH")} className="rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm">
              <option value="DISPATCH">Dispatch</option>
              <option value="PURCHASE">Purchase</option>
            </select>
            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty" className="w-24 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm" />
            <Button onClick={recordMovement} loading={recording} disabled={!drugId || !quantity} size="sm" className="flex-1 rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
              Record
            </Button>
          </div>
          {result && <p className="text-admin-micro text-admin-text-secondary">{result}</p>}
        </div>
      </Card>

      <div>
        <p className="mb-2 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Stock on Hand</p>
        {loading ? (
          <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
        ) : stock.length === 0 ? (
          <Card className="p-6 text-center text-admin-body-sm text-admin-text-secondary">No stock recorded for this facility.</Card>
        ) : (
          <div className="space-y-1.5">
            {stock.map((s) => (
              <Card key={s.drugId} className={cn("flex items-center justify-between gap-3 border-admin-border p-3", s.quantity < LOW_STOCK_THRESHOLD && "border-admin-danger/40 bg-admin-danger/5")}>
                <div className="flex items-center gap-2.5">
                  <Package className="size-4 shrink-0 text-admin-text-secondary" aria-hidden="true" />
                  <div>
                    <p className="text-admin-body-sm font-medium text-admin-text">{s.drugName}</p>
                    <p className="text-admin-micro text-admin-text-secondary">{s.drugStrength}</p>
                  </div>
                </div>
                <span className={cn("text-admin-body font-semibold", s.quantity < LOW_STOCK_THRESHOLD ? "text-admin-danger" : "text-admin-text")}>{s.quantity}</span>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
