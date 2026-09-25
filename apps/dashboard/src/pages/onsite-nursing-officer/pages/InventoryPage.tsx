import { useCallback, useEffect, useState } from "react";
import { TriangleAlert, Package, Truck } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import { requestStatusClass, requestStatusLabel, type Drug, type DrugRequest, type DrugStockRow } from "../../../lib/drugSupply";
import type { NursingCase } from "../lib/types";
import { RequestForm } from "./inventory/RequestForm";
import { UsageForm } from "./inventory/UsageForm";
import { LossForm } from "./inventory/LossForm";
import { CountForm } from "./inventory/CountForm";

type Panel = "request" | "usage" | "loss" | "count";
const PANELS: { id: Panel; label: string }[] = [
  { id: "request", label: "Request" }, { id: "usage", label: "Usage" }, { id: "loss", label: "Incident" }, { id: "count", label: "Count" },
];

// A delivery Regional Admin has dispatched, which credits the officer's stock only once they confirm physical receipt.
function DeliveryCard({ request, onAcknowledged }: { request: DrugRequest; onAcknowledged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirms the drugs were physically received.
  async function acknowledge() {
    if (!request.dispatch) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/drug-dispatches/${request.dispatch.id}/acknowledge`);
      onAcknowledged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm receipt");
      setBusy(false);
    }
  }

  return (
    <Card className="border-admin-warning/40 bg-admin-warning/5 p-3.5">
      <div className="flex items-center gap-2">
        <Truck className="size-4 text-admin-warning" aria-hidden="true" />
        <p className="text-admin-body-sm font-semibold text-admin-text">In transit to you</p>
      </div>
      <ul className="mt-2 space-y-0.5">
        {request.dispatch?.lines.map((l) => (
          <li key={l.drugId} className="flex justify-between text-admin-body-sm text-admin-text">
            <span>{l.drugName} <span className="text-admin-text-secondary">{l.drugStrength}</span></span>
            <span className="font-semibold">{l.quantityDispatched}{l.quantityDispatched < (request.lines.find((r) => r.drugId === l.drugId)?.quantityRequested ?? 0) && " (partial)"}</span>
          </li>
        ))}
      </ul>
      {confirming ? (
        <div className="mt-3 space-y-2">
          <p className="text-admin-caption text-admin-text-secondary">Only confirm once the drugs are physically in your hands. This adds them to your stock.</p>
          <div className="flex gap-2">
            <Button size="sm" loading={busy} onClick={acknowledge} className="flex-1 rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">Yes, I've received them</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(false)} className="rounded-admin-xs">Not yet</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" onClick={() => setConfirming(true)} className="mt-3 w-full rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">Confirm receipt</Button>
      )}
      {error && <p className="mt-2 text-admin-micro text-admin-danger">{error}</p>}
    </Card>
  );
}

// Inventory tab: the officer's own drug ledger, incoming deliveries, requests, usage, losses and counts.
export default function InventoryPage() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [stock, setStock] = useState<DrugStockRow[]>([]);
  const [requests, setRequests] = useState<DrugRequest[]>([]);
  const [cases, setCases] = useState<NursingCase[]>([]);
  const [panel, setPanel] = useState<Panel>("request");
  const [loading, setLoading] = useState(true);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Reloads the officer's stock and requests after any change.
  const load = useCallback(() => {
    Promise.all([
      api.get<{ stock: DrugStockRow[] }>("/drug-stock/mine").then((d) => setStock(d.stock)),
      api.get<{ requests: DrugRequest[] }>("/drug-requests/mine").then((d) => setRequests(d.requests)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.get<{ drugs: Drug[] }>("/inventory/drugs").then((d) => setDrugs(d.drugs)).catch(() => {});
    api.get<{ cases: NursingCase[] }>("/nursing-cases/mine").then((d) => setCases(d.cases.filter((c) => c.status !== "CLOSED"))).catch(() => {});
    load();
  }, [load]);

  // Cancels a request that hasn't been dispatched yet.
  async function cancel(id: string) {
    setCancelError(null);
    try {
      await api.post(`/drug-requests/${id}/cancel`);
      load();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Could not cancel");
    }
  }

  const inTransit = requests.filter((r) => r.status === "DISPATCHED" && r.dispatch?.status === "IN_TRANSIT");
  const low = stock.filter((s) => s.lowStock);

  return (
    <div className="space-y-4">
      <p className="text-admin-h4 text-admin-text">Local Inventory Ledger</p>

      {low.length > 0 && (
        <Card className="flex items-start gap-2.5 border-admin-warning/40 bg-admin-warning/10 p-3.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-admin-warning" aria-hidden="true" />
          <p className="text-admin-body-sm text-admin-text">
            Low stock: {low.map((s) => s.drugName).join(", ")}. Request a top-up below.
          </p>
        </Card>
      )}

      {inTransit.map((r) => <DeliveryCard key={r.id} request={r} onAcknowledged={load} />)}

      <div>
        <p className="mb-2 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Stock on Hand</p>
        {loading ? (
          <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
        ) : stock.length === 0 ? (
          <Card className="p-6 text-center text-admin-body-sm text-admin-text-secondary">No stock yet. Request drugs below; they appear here once you confirm receipt.</Card>
        ) : (
          <div className="space-y-1.5">
            {stock.map((s) => (
              <Card key={s.drugId} className={cn("flex items-center justify-between gap-3 border-admin-border p-3", (s.lowStock || s.quantity < 0) && "border-admin-danger/40 bg-admin-danger/5")}>
                <div className="flex items-center gap-2.5">
                  <Package className="size-4 shrink-0 text-admin-text-secondary" aria-hidden="true" />
                  <div>
                    <p className="text-admin-body-sm font-medium text-admin-text">{s.drugName}</p>
                    <p className="text-admin-micro text-admin-text-secondary">
                      {s.drugStrength}
                      {s.quantity < 0 ? " · Below zero: check receipts and counts" : s.lowStock ? ` · Low (reorder at ${s.reorderThreshold})` : ""}
                    </p>
                  </div>
                </div>
                <span className={cn("text-admin-body font-semibold", s.lowStock || s.quantity < 0 ? "text-admin-danger" : "text-admin-text")}>{s.quantity}</span>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="border-admin-border p-4">
        <div className="mb-3 grid grid-cols-4 gap-1 rounded-admin-sm bg-admin-card-alt p-1">
          {PANELS.map((p) => (
            <button
              key={p.id} type="button" onClick={() => setPanel(p.id)}
              className={cn("rounded-admin-xs py-1.5 text-admin-caption font-medium", panel === p.id ? "bg-white text-admin-text shadow-admin-card" : "text-admin-text-secondary")}
            >
              {p.label}
            </button>
          ))}
        </div>
        {panel === "request" && <RequestForm drugs={drugs} onDone={load} />}
        {panel === "usage" && <UsageForm drugs={drugs} cases={cases} onDone={load} />}
        {panel === "loss" && <LossForm drugs={drugs} onDone={load} />}
        {panel === "count" && <CountForm drugs={drugs} onDone={load} />}
      </Card>

      <div>
        <p className="mb-2 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">My Requests</p>
        {requests.length === 0 ? (
          <Card className="p-4 text-center text-admin-body-sm text-admin-text-secondary">No requests yet.</Card>
        ) : (
          <div className="space-y-1.5">
            {requests.slice(0, 8).map((r) => (
              <Card key={r.id} className="border-admin-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-admin-caption text-admin-text-secondary">{new Date(r.requestedAt).toLocaleString()}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-admin-micro font-semibold", requestStatusClass(r))}>{requestStatusLabel(r)}</span>
                </div>
                <p className="mt-1 text-admin-body-sm text-admin-text">
                  {r.lines.map((l) => `${l.quantityRequested} × ${l.drugName}`).join(", ")}
                </p>
                {r.status === "REQUESTED" && (
                  <button type="button" onClick={() => cancel(r.id)} className="mt-1 text-admin-caption font-medium text-admin-danger">Cancel request</button>
                )}
              </Card>
            ))}
            {cancelError && <p className="text-admin-micro text-admin-danger">{cancelError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
