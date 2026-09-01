import { useEffect, useState } from "react";
import { Search, Lock } from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import type { Appointment, Facility, Patient, PendingRegistration } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import { useRegionScope } from "../lib/useRegionScope";

const CALL_ALLOWED_ROLES = new Set(["REGIONAL_ADMIN", "ONSITE_NURSING_OFFICER"]);

function CallPatientButton({ patientId }: { patientId: string }) {
  const { roles } = useAuth();
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (!roles.some((r) => CALL_ALLOWED_ROLES.has(r.roleName))) return null;

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

interface AdminLabResult {
  fileId: string;
  testDate: string;
  possibleDuplicate: boolean;
  fileStatus: "PENDING" | "CLEAN" | "INFECTED";
}

function PatientDetailPanel({ patient, facilities }: { patient: Patient; facilities: Facility[] }) {
  const [labResults, setLabResults] = useState<AdminLabResult[]>([]);

  useEffect(() => {
    api.get<{ labResults: AdminLabResult[] }>(`/lab-results?patientId=${patient.id}`)
      .then((d) => setLabResults(d.labResults))
      .catch(() => setLabResults([]));
  }, [patient.id]);

  const facility = facilities.find((f) => f.id === patient.facilityId);

  return (
    <Card blueprint className="flex flex-col overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Restricted patient record</p>
        <h3 className="mt-0.5 text-lg font-bold text-gray-900">{patient.firstName} {patient.lastName}</h3>
        <p className="text-sm text-gray-500">
          {patient.uniquePatientId} · {facility?.name ?? "—"} · DOB {new Date(patient.dob).toLocaleDateString()}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 p-5">
        <div className="rounded border border-gray-200 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Phone</p>
          <p className="mt-1 font-mono text-sm text-gray-800">{patient.phoneMasked ?? "—"}</p>
        </div>
        <div className="rounded border border-gray-200 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Registered</p>
          <p className="mt-1 text-sm text-gray-800">{patient.createdAt ? new Date(patient.createdAt).toLocaleDateString() : "—"}</p>
        </div>
      </div>

      <div className="px-5">
        <CallPatientButton patientId={patient.id} />
      </div>

      <div className="mt-5 px-5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Lab records — scoped fields</p>
        {labResults.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">No lab records</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-gray-400">
              <tr>
                <th className="py-1.5 font-medium">File ID</th>
                <th className="py-1.5 font-medium">Test date</th>
                <th className="py-1.5 font-medium">Possible duplicate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {labResults.map((r) => (
                <tr key={r.fileId}>
                  <td className="py-1.5 font-mono text-xs text-gray-600">{r.fileId.slice(0, 8)}</td>
                  <td className="py-1.5 text-gray-600">{new Date(r.testDate).toLocaleDateString()}</td>
                  <td className="py-1.5 text-gray-600">{r.possibleDuplicate ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="m-5 mt-5 flex items-start gap-2 rounded border border-dashed border-gray-200 p-3">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-gray-300" aria-hidden="true" />
        <div>
          <p className="text-xs font-semibold text-gray-500">Clinical content withheld</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Prescriptions, triage answers, clinical notes and unrestricted lab results are outside this role — a
            role wall, not a region filter. Request via the attending clinician.
          </p>
        </div>
      </div>
    </Card>
  );
}

// The patient record and Unique Patient ID already exist by the time a row reaches this queue
// — they're created server-side the moment the patient verifies their email. What's left for
// Admin is confirming the self-reported facility (or reassigning it), which closes out
// onboarding and sends the patient their confirmation email.
function ConfirmFacilityForm({
  registration, facilities, onConfirmed, onCancel,
}: {
  registration: PendingRegistration;
  facilities: Facility[];
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const [facilityId, setFacilityId] = useState(registration.preferredFacilityId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reassigning = facilityId !== registration.preferredFacilityId;

  async function handleConfirm() {
    if (!registration.patientId) {
      setError("This patient hasn't verified their email yet — no record to confirm.");
      return;
    }
    if (!facilityId) {
      setError("Select a facility to confirm.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.patch(`/patients/${registration.patientId}/confirm-facility`, {
        // Only sent when actually changing it — omitted means "the patient's choice was right".
        ...(reassigning ? { facilityId } : {}),
      });
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm facility");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded border border-gray-200 bg-gray-50 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm text-gray-600">Treatment facility</label>
          <select
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Select facility...</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {reassigning && facilityId && (
            <p className="mt-1 text-xs text-amber-600">
              Reassigning from the patient&apos;s own choice — they&apos;ll see the new facility in
              their confirmation email.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">Unique Patient ID</label>
          <p className="rounded border border-gray-200 bg-white px-3 py-2 font-mono text-sm text-gray-700">
            {registration.uniquePatientId ?? "Not issued — email not verified yet"}
          </p>
          <p className="mt-1 text-xs text-gray-400">Issued automatically at email verification.</p>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={handleConfirm} loading={loading} disabled={!registration.patientId} size="sm">
          Confirm &amp; Notify Patient
        </Button>
        <Button onClick={onCancel} variant="ghost" size="sm">Cancel</Button>
      </div>
    </div>
  );
}

function ApprovalQueueSection({ facilities }: { facilities: Facility[] }) {
  const [section, setSection] = useState<"registrations" | "confirmations">("registrations");
  const [registrations, setRegistrations] = useState<PendingRegistration[]>([]);
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);
  const [pendingConfirmations, setPendingConfirmations] = useState<Appointment[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function loadRegistrations() {
    api.get<{ registrations: PendingRegistration[] }>("/patients/pending-registrations")
      .then((d) => setRegistrations(d.registrations)).catch(() => {});
  }

  function loadPendingConfirmations() {
    api.get<{ appointments: Appointment[] }>("/appointments/pending-confirmation-queue")
      .then((d) => setPendingConfirmations(d.appointments)).catch(() => {});
  }

  useEffect(() => {
    loadRegistrations();
    loadPendingConfirmations();
  }, []);

  async function confirmAppointment(id: string) {
    setConfirmingId(id);
    try {
      await api.patch(`/appointments/${id}/status`, { status: "CONFIRMED" });
      loadPendingConfirmations();
    } catch {
      // Left in the queue on failure — retry is just clicking again.
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {([
          ["registrations", `Registrations${registrations.length > 0 ? ` (${registrations.length})` : ""}`],
          ["confirmations", `Appointment Confirmations${pendingConfirmations.length > 0 ? ` (${pendingConfirmations.length})` : ""}`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={cn(
              "rounded-t px-4 py-1.5 text-sm font-medium",
              section === key ? "border border-b-white border-gray-200 bg-white text-ink" : "text-gray-500 hover:text-gray-700",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "registrations" && (
        <Card className="overflow-hidden">
          {registrations.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No pending registrations</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {registrations.map((r) => (
                <li key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-800">{r.fullName}</p>
                      <p className="text-sm text-gray-500">
                        {r.email} · {r.phone} · DOB {new Date(r.dob).toLocaleDateString()}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {r.gender} · Preferred facility: {facilities.find((f) => f.id === r.preferredFacilityId)?.name ?? "None specified"}
                        {" · "}Requested {new Date(r.createdAt).toLocaleDateString()}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {r.uniquePatientId
                          ? <>ID <span className="font-mono text-gray-600">{r.uniquePatientId}</span> · awaiting facility confirmation</>
                          : "Awaiting email verification — no record issued yet"}
                      </p>
                    </div>
                    {approvingUserId !== r.userId && (
                      <Button onClick={() => setApprovingUserId(r.userId)} size="sm">Review &amp; Confirm</Button>
                    )}
                  </div>
                  {approvingUserId === r.userId && (
                    <ConfirmFacilityForm
                      registration={r}
                      facilities={facilities}
                      onCancel={() => setApprovingUserId(null)}
                      onConfirmed={() => {
                        setApprovingUserId(null);
                        loadRegistrations();
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {section === "confirmations" && (
        <Card className="overflow-hidden">
          {pendingConfirmations.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No appointments awaiting confirmation today — paid before 2PM appears here; paid after 2PM auto-reschedules to the next valid day.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {pendingConfirmations.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium text-gray-800">
                      {a.appointmentType.replace(/_/g, " ")} — {a.patientId.slice(0, 8)}
                    </p>
                    <p className="text-sm text-gray-500">{new Date(a.scheduledAt).toLocaleString()}</p>
                  </div>
                  <Button onClick={() => confirmAppointment(a.id)} loading={confirmingId === a.id} size="sm">
                    Confirm
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

export default function PatientSearchPage() {
  const { facilities } = useRegionScope();
  const [tab, setTab] = useState<"search" | "approval-queue">("search");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function load(q?: string) {
    setLoading(true);
    api.get<{ patients: Patient[] }>(`/patients?facilityId=${facilityFilter}${q ? `&q=${encodeURIComponent(q)}` : ""}`)
      .then((d) => setPatients(d.patients))
      .catch(() => setPatients([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(query.trim() || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityFilter]);

  const selected = patients.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {([
          ["search", "Search"],
          ["approval-queue", "Approval Queue"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-t px-4 py-1.5 text-sm font-medium",
              tab === key ? "border border-b-white border-gray-200 bg-white text-ink" : "text-gray-500 hover:text-gray-700",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "search" ? (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                load(query.trim() || undefined);
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or ID..."
                  className="w-full rounded border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-ink focus:outline-none"
                />
              </div>
              <select
                value={facilityFilter}
                onChange={(e) => setFacilityFilter(e.target.value)}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="all">All facilities ({facilities.length})</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <Button type="submit">Search</Button>
            </form>

            <Card blueprint className="overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-3">
                <p className="text-sm font-semibold text-gray-800">
                  {loading ? "Searching…" : `${patients.length} result${patients.length === 1 ? "" : "s"}`}
                </p>
                <p className="text-xs text-gray-400">Phone numbers masked for this role</p>
              </div>
              {patients.length === 0 && !loading ? (
                <div className="p-8 text-center text-gray-400">No patients found</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-gray-400">
                    <tr>
                      <th className="px-5 py-2 font-medium">Patient</th>
                      <th className="px-5 py-2 font-medium">ID</th>
                      <th className="px-5 py-2 font-medium">Facility</th>
                      <th className="px-5 py-2 font-medium">Phone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {patients.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedId(p.id)}
                        className={cn(
                          "cursor-pointer",
                          selectedId === p.id ? "bg-blue-50" : "hover:bg-gray-50",
                        )}
                      >
                        <td className="px-5 py-3 font-medium text-gray-800">{p.firstName} {p.lastName}</td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-500">{p.uniquePatientId}</td>
                        <td className="px-5 py-3 text-gray-500">{facilities.find((f) => f.id === p.facilityId)?.name ?? "—"}</td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-500">{p.phoneMasked ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <div>
            {selected ? (
              <PatientDetailPanel patient={selected} facilities={facilities} />
            ) : (
              <Card blueprint className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">
                Select a patient to view their restricted record
              </Card>
            )}
          </div>
        </div>
      ) : (
        <ApprovalQueueSection facilities={facilities} />
      )}
    </div>
  );
}
