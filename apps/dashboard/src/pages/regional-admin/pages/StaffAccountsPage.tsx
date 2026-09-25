import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { useRegionScope } from "../lib/useRegionScope";

const ROLES: { value: string; label: string }[] = [
  { value: "ONSITE_NURSING_OFFICER", label: "Onsite Nursing Officer" },
  { value: "QUALITY_ASSURANCE_OFFICER", label: "Quality Assurance Officer" },
  { value: "VIRTUAL_MEDICAL_OFFICER", label: "Virtual Medical Officer" },
  { value: "CONSULTING_ONCOLOGIST", label: "Consulting Oncologist" },
  { value: "CONSULTING_SURGEON", label: "Consulting Surgeon" },
  { value: "CONSULTING_NUTRITIONIST", label: "Consulting Nutritionist" },
  { value: "CONSULTING_PSYCHO_ONCOLOGIST", label: "Consulting Psycho-Oncologist" },
  { value: "SCRIBE", label: "Scribe" },
];
const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r.replace(/_/g, " ").toLowerCase();

interface StaffRow { id: string; email: string; fullName: string; status: string; facilityName: string | null; createdAt: string; roles: string[] }

// Regional Admin provisions staff accounts in their region. The new hire sets their own password from an emailed
// invite. This page deliberately offers no lock/unlock or password actions — those aren't Regional Admin's authority.
export default function StaffAccountsPage() {
  const { facilitiesInRegion } = useRegionScope();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", role: ROLES[0]!.value, facilityId: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  const load = useCallback(() => {
    api.get<{ staff: StaffRow[] }>("/staff-accounts").then((d) => setStaff(d.staff)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.post<{ inviteSent: boolean }>("/staff-accounts", form);
      setMessage(res.inviteSent
        ? { tone: "ok", text: `Account created. An invite was emailed to ${form.email}.` }
        : { tone: "warn", text: "Account created, but the invite email could not be sent. Check the mail configuration." });
      setForm({ ...form, email: "", firstName: "", lastName: "" });
      load();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not create the account" });
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm";
  const ready = form.email && form.firstName && form.lastName && form.facilityId;
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <p className="flex items-center gap-2 text-admin-h3 text-admin-text"><UserPlus className="size-5 text-admin-sidebar-cta" aria-hidden="true" /> Staff Accounts</p>
        <p className="text-admin-body-sm text-admin-text-secondary">Create accounts for staff in your region. They set their own password from the emailed invite.</p>
      </div>

      <Card className="border-admin-border p-4">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <input className={input} placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <input className={input} placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          <input className={`${input} sm:col-span-2`} type="email" placeholder="Work email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select className={`${input} bg-white`} aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select className={`${input} bg-white`} aria-label="Facility" value={form.facilityId} onChange={(e) => setForm({ ...form, facilityId: e.target.value })}>
            <option value="">Select facility…</option>
            {facilitiesInRegion.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy} disabled={!ready} className="w-full rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">Create account &amp; send invite</Button>
          </div>
        </form>
        {message && (
          <p className={`mt-2 text-admin-caption ${message.tone === "ok" ? "text-admin-success" : message.tone === "warn" ? "text-admin-warning" : "text-admin-danger"}`}>{message.text}</p>
        )}
      </Card>

      {loading ? <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p> : (
        <Card className="overflow-x-auto border-admin-border">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-400">
              <tr><th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Role</th><th className="px-4 py-2 font-medium">Facility</th><th className="px-4 py-2 font-medium">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {staff.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5"><p className="text-gray-800">{s.fullName}</p><p className="text-xs text-gray-400">{s.email}</p></td>
                  <td className="px-4 py-2.5 text-gray-600">{s.roles.map(roleLabel).join(", ")}</td>
                  <td className="px-4 py-2.5 text-gray-600">{s.facilityName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
