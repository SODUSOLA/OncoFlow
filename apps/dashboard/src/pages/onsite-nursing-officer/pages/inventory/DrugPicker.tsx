import type { Drug } from "../../../../lib/drugSupply";

// Drug dropdown shared by the inventory forms.
export function DrugPicker({ drugs, value, onChange }: { drugs: Drug[]; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-admin-sm border border-admin-border bg-white px-3 py-2 text-admin-body-sm">
      <option value="">Select drug…</option>
      {drugs.map((d) => <option key={d.id} value={d.id}>{d.name} {d.strength}</option>)}
    </select>
  );
}
