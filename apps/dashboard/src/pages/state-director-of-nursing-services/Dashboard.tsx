import { useState } from "react";
import { CaseBoard } from "../../components/CaseBoard";
import { IncidentReports } from "../../components/IncidentReports";

type Tab = "activity" | "incidents";

// State Director of Nursing Services (read-only for now): live nurse case activity and the stock incidents nursing
// officers report in the region. Lock/unlock requests and the rest of this role's dashboard are still to be built.
export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("activity");
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-800">Nursing Services</h2>
        <p className="text-sm text-gray-500">Read-only view of nurse activity and stock incidents in your region.</p>
      </div>
      <div className="flex gap-2">
        {([["activity", "Nurse activity"], ["incidents", "Stock incidents"]] as const).map(([key, label]) => (
          <button
            key={key} onClick={() => setTab(key)}
            className={`rounded border px-3 py-1.5 text-sm font-semibold ${tab === key ? "border-ink bg-ink text-white" : "border-gray-200 text-gray-500"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "activity" ? <CaseBoard /> : <div className="rounded border border-gray-200 bg-white"><IncidentReports /></div>}
    </div>
  );
}
