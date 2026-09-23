import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";

interface Incident {
  id: string; nursingCaseId: string | null; attemptedBy: string; fileScanResult: string; incidentReference: string; createdAt: string;
}

// The real destination of the alert's "View Incident" action; read-only since the data model has no resolution action.
export default function SecurityIncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ incidents: Incident[] }>("/security-incidents")
      .then((d) => setIncidents(d.incidents))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <p className="text-admin-h3 text-admin-text">Security Incidents</p>
        <p className="text-admin-body-sm text-admin-text-secondary">
          Uploads rejected by the safety scan across the platform — fed by the same file table every upload goes
          through, not a separate detection system.
        </p>
      </div>

      {loading ? (
        <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
      ) : incidents.length === 0 ? (
        <Card className="p-8 text-center text-admin-body-sm text-admin-text-secondary">No security incidents recorded.</Card>
      ) : (
        <div className="space-y-2">
          {incidents.map((i) => (
            <Card key={i.id} className="flex items-start gap-3 border-admin-danger/30 bg-admin-danger/5 p-4">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-admin-danger" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-admin-body-sm font-semibold text-admin-danger">{i.incidentReference}</p>
                  <p className="text-admin-caption text-admin-text-secondary">{new Date(i.createdAt).toLocaleString()}</p>
                </div>
                <p className="mt-1 text-admin-body-sm text-admin-text">Scan result: {i.fileScanResult}</p>
                {i.nursingCaseId && <p className="text-admin-caption text-admin-text-secondary">Nursing case: {i.nursingCaseId}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
