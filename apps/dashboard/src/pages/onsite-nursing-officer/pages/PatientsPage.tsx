import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight } from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import type { Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";

export default function PatientsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.facilityId) { setLoading(false); return; }
    api.get<{ patients: Patient[] }>(`/patients?facilityId=${user.facilityId}`)
      .then((d) => setPatients(d.patients))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.facilityId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => `${p.firstName} ${p.lastName} ${p.uniquePatientId}`.toLowerCase().includes(q));
  }, [patients, query]);

  return (
    <div className="space-y-4">
      <p className="text-admin-h4 text-admin-text">Patients</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-admin-text-secondary" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or ID…"
          className="w-full rounded-admin-sm border border-admin-border bg-white py-2.5 pl-9 pr-3 text-admin-body-sm text-admin-text"
        />
      </div>

      {loading ? (
        <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-center text-admin-body-sm text-admin-text-secondary">No patients found.</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <Card
              key={p.id}
              className="flex cursor-pointer items-center justify-between gap-3 border-admin-border p-3.5 hover:border-admin-sidebar-cta"
              onClick={() => navigate(`/dashboard/onsite-nursing-officer/patients/${p.id}`)}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-admin-sidebar-cta text-admin-caption font-semibold text-white">
                  {p.firstName[0]}{p.lastName[0]}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-admin-body-sm font-semibold text-admin-text">{p.firstName} {p.lastName}</p>
                  <p className="text-admin-caption text-admin-text-secondary">{p.uniquePatientId}</p>
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-admin-text-secondary" aria-hidden="true" />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
