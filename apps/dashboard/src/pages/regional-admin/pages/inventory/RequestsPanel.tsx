import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { Button } from "../../../../components/ui/Button";
import { cn } from "../../../../lib/utils";
import { requestStatusClass, requestStatusLabel, type DrugRequest, type DrugStockRow } from "../../../../lib/drugSupply";

// One request from a nursing officer, with an inline dispatch form bounded by regional stock.
function RequestRow({ request, available, onChanged }: { request: DrugRequest; available: Map<string, number>; onChanged: () => void }) {
  const [dispatching, setDispatching] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opens the dispatch form prefilled with as much of each line as regional stock allows.
  function open() {
    setQuantities(Object.fromEntries(request.lines.map((l) => [l.drugId, String(Math.max(0, Math.min(l.quantityRequested, available.get(l.drugId) ?? 0)))])));
    setError(null);
    setDispatching(true);
  }

  const lines = request.lines
    .map((l) => ({ drugId: l.drugId, quantity: Number(quantities[l.drugId] ?? 0) }))
    .filter((l) => l.quantity > 0);

  // Sends the dispatch; drugs left at zero are simply not sent (partial fulfilment).
  async function dispatch() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/drug-requests/${request.id}/dispatch`, { lines });
      setDispatching(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dispatch");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800">{request.requesterEmail}</p>
          <p className="text-xs text-gray-400">{request.facilityName} · {new Date(request.requestedAt).toLocaleString()}</p>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", requestStatusClass(request))}>{requestStatusLabel(request)}</span>
      </div>

      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-xs text-gray-400">
          <tr>
            <th className="py-1 font-medium">Drug</th>
            <th className="py-1 font-medium">Requested</th>
            <th className="py-1 font-medium">{request.dispatch ? "Dispatched" : "Regional stock"}</th>
            {dispatching && <th className="py-1 font-medium">Dispatch</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {request.lines.map((l) => {
            const dispatched = request.dispatch?.lines.find((d) => d.drugId === l.drugId)?.quantityDispatched;
            const stock = available.get(l.drugId) ?? 0;
            return (
              <tr key={l.drugId}>
                <td className="py-2 text-gray-800">{l.drugName} <span className="text-gray-400">{l.drugStrength}</span></td>
                <td className="py-2 text-gray-600">{l.quantityRequested}</td>
                <td className={cn("py-2", request.dispatch ? "text-gray-600" : stock < l.quantityRequested ? "font-medium text-amber-600" : "text-gray-600")}>
                  {request.dispatch ? dispatched ?? 0 : stock}
                </td>
                {dispatching && (
                  <td className="py-2">
                    <input
                      type="number" min={0} max={Math.min(l.quantityRequested, stock)} value={quantities[l.drugId] ?? "0"}
                      onChange={(e) => setQuantities((prev) => ({ ...prev, [l.drugId]: e.target.value }))}
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {request.status === "REQUESTED" && !dispatching && (
        <Button size="sm" className="mt-3" onClick={open}>Dispatch</Button>
      )}
      {dispatching && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={dispatch} loading={busy} disabled={lines.length === 0}>Confirm dispatch</Button>
          <Button size="sm" variant="outline" onClick={() => setDispatching(false)} disabled={busy}>Cancel</Button>
          <p className="text-xs text-gray-400">Set a drug to 0 to leave it out; regional stock caps each line.</p>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// Queue of drug requests from the region, with dispatch for open ones and status for the rest.
export function RequestsPanel({ onChanged }: { onChanged: () => void }) {
  const [requests, setRequests] = useState<DrugRequest[]>([]);
  const [available, setAvailable] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  // Reloads the queue and current regional stock.
  const load = useCallback(() => {
    Promise.all([
      api.get<{ requests: DrugRequest[] }>("/drug-requests").then((d) => setRequests(d.requests)),
      api.get<{ stock: DrugStockRow[] }>("/drug-stock/regional").then((d) => setAvailable(new Map(d.stock.map((s) => [s.drugId, s.quantity])))),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = requests.filter((r) => r.status === "REQUESTED");
  const rest = requests.filter((r) => r.status !== "REQUESTED");

  // Reloads here and lets the parent refresh the regional stock table.
  function changed() {
    load();
    onChanged();
  }

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (requests.length === 0) return <div className="p-8 text-center text-sm text-gray-400">No drug requests from your region yet</div>;

  return (
    <div className="divide-y divide-gray-100">
      {open.length > 0 && <p className="bg-gray-50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Awaiting dispatch ({open.length})</p>}
      {open.map((r) => <RequestRow key={r.id} request={r} available={available} onChanged={changed} />)}
      {rest.length > 0 && <p className="bg-gray-50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Dispatched, delivered and cancelled</p>}
      {rest.map((r) => <RequestRow key={r.id} request={r} available={available} onChanged={changed} />)}
    </div>
  );
}
