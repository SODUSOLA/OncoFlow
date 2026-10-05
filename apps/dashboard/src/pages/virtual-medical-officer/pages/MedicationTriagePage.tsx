import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { useMedicationTriage, useFolder } from "../lib/vmo";
import { VitalsTimeline } from "../lib/VitalsTimeline";

const BASE = "/dashboard/virtual-medical-officer";

// A read-aggregation page: drugs used, last labs, vital timelines. Cards are rendered from a list so a new
// card can be added without restructuring the page.
export default function MedicationTriagePage() {
  const { conversationId } = useParams();
  const { cards, error } = useMedicationTriage(conversationId);
  const { folder } = useFolder(cards ? conversationId : undefined);

  if (error) {
    const locked = error.includes("triage checklist");
    return (
      <div className="mx-auto max-w-md p-12 text-center">
        {locked && <Lock className="mx-auto size-8 text-admin-text-secondary" aria-hidden="true" />}
        <p className={locked ? "mt-3 text-admin-body-sm text-admin-text-secondary" : "text-admin-danger"}>{error}</p>
        {locked && <Link to={`${BASE}/triage/${conversationId}`} className="mt-4 inline-block rounded-admin-sm bg-admin-sidebar-cta px-4 py-2 text-admin-body-sm text-white">Begin triage</Link>}
      </div>
    );
  }
  if (!cards) return <p className="p-8 text-admin-text-secondary">Loading…</p>;
  const labs = folder?.clinicalMetrics?.labValues ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex items-center gap-3">
        <Link to={`${BASE}/folder/${conversationId}`} aria-label="Back to folder" className="text-admin-text-secondary hover:text-admin-text"><ArrowLeft className="size-5" /></Link>
        <h1 className="text-admin-h2 text-admin-text">Medication Triage</h1>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <section className="rounded-admin-sm border border-admin-border bg-white p-5 shadow-admin-card">
          <h2 className="mb-3 text-admin-h4 text-admin-text">Drugs used</h2>
          {cards.drugsUsed.length === 0 ? <p className="text-admin-body-sm text-admin-text-secondary">No drugs administered yet.</p> : (
            <ul className="divide-y divide-admin-border">
              {cards.drugsUsed.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-admin-body-sm">
                  <span className="text-admin-text">{d.drugName}{d.drugStrength ? ` ${d.drugStrength}` : ""}</span>
                  <span className="text-admin-text-secondary">×{d.quantityUsed} · {new Date(d.usedAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-admin-sm border border-admin-border bg-white p-5 shadow-admin-card">
          <h2 className="mb-3 text-admin-h4 text-admin-text">Last lab results</h2>
          {labs.length === 0 ? <p className="text-admin-body-sm text-admin-text-secondary">No results recorded yet.</p> : (
            <ul className="divide-y divide-admin-border">
              {labs.map((l) => (
                <li key={l.analyteCode} className="flex items-center justify-between py-2 text-admin-body-sm">
                  <span className="text-admin-text">{l.displayName}</span>
                  <span className={l.outOfRange ? "font-semibold text-admin-danger" : "text-admin-text"}>{l.value} {l.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="col-span-2 rounded-admin-sm border border-admin-border bg-white p-5 shadow-admin-card">
          <h2 className="mb-3 text-admin-h4 text-admin-text">Vital timelines</h2>
          <VitalsTimeline series={cards.vitalTimelines} />
        </section>
      </div>
    </div>
  );
}
