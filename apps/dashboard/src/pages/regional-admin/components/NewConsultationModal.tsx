import { useEffect, useMemo, useState } from "react";
import { X, CalendarPlus } from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import type { Patient, ConsultantAvailability, Appointment, Meeting } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";

interface Consultant { id: string; email: string; roleName: string }

const TYPE_OPTIONS: { value: Appointment["appointmentType"]; label: string }[] = [
  { value: "VIRTUAL", label: "Virtual Consult" },
  { value: "PHYSICAL", label: "In-Person Visit" },
  { value: "CHEMOTHERAPY", label: "Chemotherapy" },
  { value: "PROCEDURE", label: "Procedure" },
];

// ONCOFLOW_SCHEDULING_AND_VIDEO_LIFECYCLE.md — the revived New Consultation action. Real POST
// /consultations call: server-side availability enforcement, room provisioning, notifications,
// and reminders all happen behind this one submit, not simulated here.
export function NewConsultationModal({ onClose, onScheduled }: { onClose: () => void; onScheduled: () => void }) {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [oncologistId, setOncologistId] = useState("");
  const [appointmentType, setAppointmentType] = useState<Appointment["appointmentType"]>("VIRTUAL");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [availability, setAvailability] = useState<ConsultantAvailability[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ appointment: Appointment; meeting: Meeting | null; roomProvisioningError: string | null } | null>(null);

  useEffect(() => {
    if (!user?.facilityId) return;
    api.get<{ patients: Patient[] }>(`/patients?facilityId=${user.facilityId}`).then((d) => setPatients(d.patients)).catch(() => {});
    api.get<{ consultants: Consultant[] }>(`/consultants?facilityId=${user.facilityId}`).then((d) => setConsultants(d.consultants)).catch(() => {});
  }, [user?.facilityId]);

  useEffect(() => {
    if (!oncologistId) { setAvailability([]); return; }
    api.get<{ availability: ConsultantAvailability[] }>(`/availability?consultantId=${oncologistId}`).then((d) => setAvailability(d.availability)).catch(() => setAvailability([]));
  }, [oncologistId]);

  const filteredPatients = useMemo(() => {
    const q = patientQuery.trim().toLowerCase();
    if (!q) return patients.slice(0, 8);
    return patients.filter((p) => `${p.firstName} ${p.lastName} ${p.uniquePatientId}`.toLowerCase().includes(q)).slice(0, 8);
  }, [patients, patientQuery]);

  const blocksForDate = useMemo(() => availability.filter((b) => b.availableDate === date), [availability, date]);

  async function submit() {
    if (!patientId || !oncologistId || !date || !time || !user?.facilityId) return;
    setSaving(true);
    setError(null);
    try {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
      const res = await api.post<{ appointment: Appointment; meeting: Meeting | null; roomProvisioningError: string | null }>(
        "/consultations",
        { patientId, oncologistId, facilityId: user.facilityId, appointmentType, scheduledAt, durationMinutes },
      );
      setResult(res);
      onScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not schedule this consultation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto border-admin-border p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
            <CalendarPlus className="size-5 text-admin-sidebar-cta" aria-hidden="true" /> New Consultation
          </h2>
          <button onClick={onClose} className="text-admin-text-secondary hover:text-admin-text">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {result ? (
          <div className="mt-5 space-y-3">
            <p className="text-admin-body-sm text-admin-success">Consultation scheduled — both participants have been notified.</p>
            {result.appointment.appointmentType === "VIRTUAL" && (
              result.roomProvisioningError ? (
                <p className="text-admin-body-sm text-admin-danger">
                  Video room could not be provisioned: {result.roomProvisioningError}. The appointment itself was created — retry provisioning from the appointment record.
                </p>
              ) : (
                <p className="text-admin-body-sm text-admin-text-secondary">Video room provisioned — room: {result.meeting?.roomId}</p>
              )
            )}
            <Button onClick={onClose} className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">Done</Button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <label className="text-admin-caption text-admin-text-secondary">Patient</label>
              <input
                value={patientId ? `${patients.find((p) => p.id === patientId)?.firstName ?? ""} ${patients.find((p) => p.id === patientId)?.lastName ?? ""}` : patientQuery}
                onChange={(e) => { setPatientQuery(e.target.value); setPatientId(""); }}
                placeholder="Search patient by name or ID…"
                className="mt-1 w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
              />
              {!patientId && patientQuery && (
                <ul className="mt-1 max-h-40 overflow-y-auto rounded-admin-sm border border-admin-border">
                  {filteredPatients.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => { setPatientId(p.id); setPatientQuery(""); }}
                        className="block w-full px-3 py-2 text-left text-admin-body-sm hover:bg-admin-card-alt"
                      >
                        {p.firstName} {p.lastName} <span className="text-admin-text-secondary">({p.uniquePatientId})</span>
                      </button>
                    </li>
                  ))}
                  {filteredPatients.length === 0 && <li className="px-3 py-2 text-admin-caption text-admin-text-secondary">No matches</li>}
                </ul>
              )}
            </div>

            <div>
              <label className="text-admin-caption text-admin-text-secondary">Consultant</label>
              <select value={oncologistId} onChange={(e) => setOncologistId(e.target.value)} className="mt-1 w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm">
                <option value="">Select a consultant…</option>
                {consultants.map((c) => (
                  <option key={c.id} value={c.id}>{c.email} — {c.roleName.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-admin-caption text-admin-text-secondary">Type</label>
                <select value={appointmentType} onChange={(e) => setAppointmentType(e.target.value as Appointment["appointmentType"])} className="mt-1 w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm">
                  {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-admin-caption text-admin-text-secondary">Duration (min)</label>
                <input type="number" min={5} max={240} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className="mt-1 w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-admin-caption text-admin-text-secondary">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm" />
              </div>
              <div>
                <label className="text-admin-caption text-admin-text-secondary">Time</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm" />
              </div>
            </div>

            {oncologistId && date && (
              <p className="text-admin-caption text-admin-text-secondary">
                {blocksForDate.length === 0
                  ? "This consultant has no stated availability on this date — scheduling will be rejected server-side."
                  : `Available: ${blocksForDate.map((b) => `${b.startTime.slice(0, 5)}–${b.endTime.slice(0, 5)}`).join(", ")}`}
              </p>
            )}

            {error && <p className="text-admin-body-sm text-admin-danger">{error}</p>}

            <div className="flex justify-end gap-2 border-t border-admin-border pt-4">
              <Button onClick={onClose} variant="ghost">Cancel</Button>
              <Button
                onClick={submit}
                loading={saving}
                disabled={!patientId || !oncologistId || !date || !time}
                className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90"
              >
                Schedule Consultation
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
