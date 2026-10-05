import { useState } from "react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { Button } from "../../../components/ui/Button";

const CALL_ALLOWED_ROLES = new Set(["REGIONAL_ADMIN", "ONSITE_NURSING_OFFICER"]);

// Button that places a masked call to a patient.
export function CallPatientButton({ patientId }: { patientId: string }) {
  const { roles } = useAuth();
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (!roles.some((r) => CALL_ALLOWED_ROLES.has(r.roleName))) return null;

  // Places the call through the API.
  async function call() {
    setCalling(true);
    setResult(null);
    try {
      const res = await api.post<{ callSessionId: string }>(`/patients/${patientId}/call`);
      setResult(`Call started (session ${res.callSessionId.slice(0, 8)})`);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Call failed");
    } finally {
      setCalling(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={call} loading={calling} variant="outline" size="sm">Call patient</Button>
      {result && <p className="text-[11px] text-gray-500">{result}</p>}
    </div>
  );
}
