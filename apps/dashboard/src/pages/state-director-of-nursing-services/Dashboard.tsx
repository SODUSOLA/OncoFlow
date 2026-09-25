import { IncidentReports } from "../../components/IncidentReports";

// State Director of Nursing Services: for now, the stock incidents (breakage, spoilage, expiry, wastage) nursing
// officers report in their region. The rest of this role's dashboard is still to be built.
export default function Dashboard() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-800">Stock Incidents</h2>
        <p className="text-sm text-gray-500">Breakage, spoilage, expiry and wastage reported by nursing officers in your region.</p>
      </div>
      <div className="rounded border border-gray-200 bg-white">
        <IncidentReports />
      </div>
    </div>
  );
}
