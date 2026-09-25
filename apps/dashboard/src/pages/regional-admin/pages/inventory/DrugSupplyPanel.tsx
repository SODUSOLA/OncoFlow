import { useState } from "react";
import { Card } from "../../../../components/ui/Card";
import { cn } from "../../../../lib/utils";
import type { Drug } from "../../../../lib/drugSupply";
import { RequestsPanel } from "./RequestsPanel";
import { OfficerStockPanel } from "./OfficerStockPanel";
import { LossesPanel } from "./LossesPanel";
import { CountsPanel } from "./CountsPanel";

type Tab = "requests" | "officers" | "losses" | "counts";
const TABS: { id: Tab; label: string }[] = [
  { id: "requests", label: "Requests & dispatch" }, { id: "officers", label: "Officer stock" },
  { id: "losses", label: "Incidents" }, { id: "counts", label: "Counts & variances" },
];

// Drug supply chain oversight: nursing officers' requests, dispatch, their remaining stock, losses and counts.
export function DrugSupplyPanel({ drugs, onChanged }: { drugs: Drug[]; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>("requests");
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 px-5 pt-3.5">
        <p className="text-sm font-semibold text-gray-800">Drug supply</p>
        <p className="text-xs text-gray-400">Requests from nursing officers, what each has left, and the counts that reconcile them.</p>
        <div className="mt-3 flex gap-4">
          {TABS.map((t) => (
            <button
              key={t.id} type="button" onClick={() => setTab(t.id)}
              className={cn("border-b-2 pb-2 text-sm font-medium", tab === t.id ? "border-ink text-ink" : "border-transparent text-gray-500 hover:text-gray-700")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "requests" && <RequestsPanel onChanged={onChanged} />}
      {tab === "officers" && <OfficerStockPanel />}
      {tab === "losses" && <LossesPanel />}
      {tab === "counts" && <CountsPanel drugs={drugs} onChanged={onChanged} />}
    </Card>
  );
}
