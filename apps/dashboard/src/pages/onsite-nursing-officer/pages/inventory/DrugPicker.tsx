import type { Drug } from "../../../../lib/drugSupply";

// Drug dropdown shared by the inventory forms. With `stock` (drugId → quantity on hand) it shows what's in
// hand beside each drug and disables the ones at zero, for forms that take stock out.
export function DrugPicker({ drugs, value, onChange, stock }: { drugs: Drug[]; value: string; onChange: (id: string) => void; stock?: Map<string, number> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-admin-sm border border-admin-border bg-white px-3 py-2 text-admin-body-sm">
      <option value="">Select drug…</option>
      {drugs.map((d) => {
        const onHand = stock ? Math.max(stock.get(d.id) ?? 0, 0) : null;
        return (
          <option key={d.id} value={d.id} disabled={onHand === 0}>
            {d.name} {d.strength}{onHand === null ? "" : onHand === 0 ? " — out of stock" : ` — ${onHand} in stock`}
          </option>
        );
      })}
    </select>
  );
}
