import { useEffect, useState } from "react";
import { ChevronLeft, ClipboardList, Eye, Lock, TriangleAlert, ShieldCheck } from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import type { Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import type { NursingCase, NursingDocumentationSheet, RegimenSummary } from "../lib/types";
import { CaseDrugUsage } from "../pages/case/CaseDrugUsage";
import {
  LAB_FIELDS, VITAL_FIELDS, emptyDocumentationForm, ageFromDob, type DocumentationFormValues,
} from "../lib/documentation";

interface Props {
  nursingCase: NursingCase;
  patient: Patient;
  cycleNumber: number;
  // Set when resuming a case QA sent back — pre-fills the text fields so amending one thing doesn't mean
  // retyping the whole sheet. Vitals and labs still start blank regardless.
  previousSheet?: NursingDocumentationSheet | null;
  onSubmitted: (sheet: NursingDocumentationSheet) => void;
  // The wizard hides its own top-level back button on this step (going further back than the form's own
  // preview would silently drop everything typed here), so this is the only way back to the identity step.
  onBack: () => void;
}

// One labelled number input, used for both the vitals row and the lab panel.
function NumberField({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-admin-micro text-admin-text-secondary">{label} <span className="text-admin-text-secondary/70">({unit})</span></label>
      <input
        type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm"
      />
    </div>
  );
}

// Step 4 of the wizard: the structured NURSING DOCUMENTATION SHEET (replacing the old free-upload
// step) and a read-only preview before it's submitted. Medications administered are logged live against
// the case's real drug ledger as they're added (CaseDrugUsage), not batched with the rest of this form —
// stock is deducted the moment a drug is given, not held back for a final submit.
export function DocumentationForm({ nursingCase, patient, cycleNumber, previousSheet, onSubmitted, onBack }: Props) {
  const [subStep, setSubStep] = useState<"form" | "preview">("form");
  const { user } = useAuth();
  // Everything typed here is cached on this device as it's entered, so leaving mid-form (or a dropped
  // connection) doesn't lose it. Cleared on submit and on sign-out; drug logging is already saved server-side.
  const draftKey = `oncoflow.docDraft.${user?.id}.${nursingCase.id}`;
  const [restored, setRestored] = useState(false);
  const [values, setValues] = useState<DocumentationFormValues>(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) return JSON.parse(raw) as DocumentationFormValues;
    } catch { /* unreadable draft — start fresh */ }
    return emptyDocumentationForm(patient.gender, previousSheet);
  });
  const [interlockChecked, setInterlockChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Managing Consultant is the QA officer assigned to this patient's hospital, not something the nurse
  // types — looked up here so the preview shows the same value the server will resolve and store on submit.
  const [qaOfficer, setQaOfficer] = useState<{ id: string; email: string; fullName: string } | null | undefined>(undefined);
  // Diagnosis likewise isn't typed here — it's whatever the prescribing consultant stated on this
  // patient's active regimen (the one this case's cycle belongs to).
  const [regimen, setRegimen] = useState<RegimenSummary | null | undefined>(undefined);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setRestored(true);
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saves the draft after every change.
  useEffect(() => {
    try { localStorage.setItem(draftKey, JSON.stringify(values)); } catch { /* not persisted; the form still works */ }
  }, [draftKey, values]);

  useEffect(() => {
    let cancelled = false;
    api.get<{ qaOfficer: { id: string; email: string; fullName: string } | null }>(`/facilities/${patient.facilityId}/qa-officer`)
      .then((d) => { if (!cancelled) setQaOfficer(d.qaOfficer); })
      .catch(() => { if (!cancelled) setQaOfficer(null); });
    api.get<{ regimen: RegimenSummary | null }>(`/regimen?patientId=${patient.id}`)
      .then((d) => { if (!cancelled) setRegimen(d.regimen); })
      .catch(() => { if (!cancelled) setRegimen(null); });
    return () => { cancelled = true; };
  }, [patient.facilityId, patient.id]);

  // Updates one top-level field.
  function set<K extends keyof DocumentationFormValues>(key: K, v: DocumentationFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }
  // Updates one vital or lab value by its code.
  function setKeyed(group: "vitals" | "labs", code: string, v: string) {
    setValues((prev) => ({ ...prev, [group]: { ...prev[group], [code]: v } }));
  }

  const weightKg = Number(values.weightKg);
  const heightM = Number(values.heightM);
  const creatinine = values.labs.CREATININE?.trim();
  // Weight, height and creatinine are what BMI/BSA/CrCl/eGFR are computed from — everything else on the
  // sheet is informational, but these three have to be real numbers before the metrics endpoint can run.
  // Mirrors what the API enforces (bounds included), so the button is only live when a submit can succeed.
  const infusionOk = (!values.infusionStart && !values.infusionEnd)
    || (!!values.infusionStart && !!values.infusionEnd && values.infusionEnd > values.infusionStart);
  const readyForPreview = weightKg >= 1 && weightKg <= 500
    && heightM * 100 >= 30 && heightM * 100 <= 260
    && !!creatinine && Number(creatinine) > 0
    && !!values.treatmentDate && infusionOk;

  // Submits the biometrics + lab panel first (the API refuses it if the case has been frozen for QA, so a rejected
  // submission leaves nothing behind), then vitals, then the documentation sheet content.
  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const labValues = LAB_FIELDS
        .filter((f) => values.labs[f.code]?.trim())
        .map((f) => ({ analyteCode: f.code, value: Number(values.labs[f.code]), unit: f.unit }));
      await api.post("/clinical-metrics", {
        patientId: patient.id, regimenCycleId: nursingCase.regimenCycleId,
        weightKg, heightCm: heightM * 100, ageYears: ageFromDob(patient.dob), sex: values.sex, labValues,
      });

      for (const f of VITAL_FIELDS) {
        const raw = values.vitals[f.type]?.trim();
        if (!raw) continue;
        await api.post("/vitals", { patientId: patient.id, vitalType: f.type, value: Number(raw), source: "MANUAL_ENTRY", nursingCaseId: nursingCase.id });
      }

      const res = await api.post<{ documentationSheet: NursingDocumentationSheet }>(
        `/nursing-cases/${nursingCase.id}/documentation-sheet`,
        {
          // diagnosis and managingConsultant aren't sent — the server resolves both (from the cycle's
          // regimen and the patient's facility's QA officer).
          treatmentDate: values.treatmentDate || undefined,
          infusionStartTime: values.infusionStart || undefined, infusionEndTime: values.infusionEnd || undefined,
          note: values.note || undefined, nextAppointmentDate: values.nextAppointmentDate || undefined,
        },
      );
      try { localStorage.removeItem(draftKey); } catch { /* nothing to clear */ }
      onSubmitted(res.documentationSheet);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit — try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (subStep === "preview") {
    return (
      <div className="space-y-3">
        <p className="text-admin-h4 text-admin-text">Preview Documentation</p>
        <Card className="space-y-2 border-admin-border p-4">
          <PreviewRow label="Patient" value={`${patient.firstName} ${patient.lastName} (${patient.uniquePatientId})`} />
          <PreviewRow label="Treatment Date" value={values.treatmentDate || "—"} />
          <PreviewRow label="Cycle Count" value={String(cycleNumber)} />
          <PreviewRow label="Diagnosis" value={regimen === undefined ? "Looking up…" : regimen?.diagnosis ?? "No diagnosis on record for this regimen"} />
          <PreviewRow label="Managing Consultant (QA Officer)" value={qaOfficer === undefined ? "Looking up…" : qaOfficer?.fullName ?? "No QA officer assigned to this facility"} />
          <PreviewRow label="Infusion Time" value={values.infusionStart || values.infusionEnd ? `${values.infusionStart || "—"} – ${values.infusionEnd || "—"}` : "—"} />
        </Card>

        <Card className="space-y-2 border-admin-border p-4">
          <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Vitals &amp; Biometrics</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-admin-body-sm text-admin-text">
            <PreviewRow label="Weight" value={`${values.weightKg || "—"} kg`} />
            <PreviewRow label="Height" value={`${values.heightM || "—"} m`} />
            {VITAL_FIELDS.map((f) => (
              <PreviewRow key={f.type} label={f.label} value={values.vitals[f.type] ? `${values.vitals[f.type]} ${f.unit}` : "—"} />
            ))}
          </div>
          <p className="text-admin-micro text-admin-text-secondary">BMI, BSA, CrCl and eGFR are computed on submit, not entered.</p>
        </Card>

        <Card className="space-y-2 border-admin-border p-4">
          <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Lab Panel</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-admin-body-sm text-admin-text">
            {LAB_FIELDS.map((f) => (
              <PreviewRow key={f.code} label={f.label} value={values.labs[f.code] ? `${values.labs[f.code]} ${f.unit}` : "—"} />
            ))}
          </div>
        </Card>

        <CaseDrugUsage nursingCaseId={nursingCase.id} editable />

        {values.note && (
          <Card className="border-admin-border p-4">
            <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Note</p>
            <p className="mt-1 text-admin-body-sm text-admin-text">{values.note}</p>
          </Card>
        )}
        <PreviewRow label="Next Appointment" value={values.nextAppointmentDate || "—"} />

        <Card
          className={cn("flex items-start gap-2.5 p-3.5", interlockChecked ? "border-admin-success/40 bg-admin-success/5" : "border-admin-border bg-admin-card-alt")}
          onClick={() => setInterlockChecked((v) => !v)}
        >
          <input type="checkbox" checked={interlockChecked} onChange={(e) => setInterlockChecked(e.target.checked)} className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="flex items-center gap-1.5 text-admin-body-sm font-semibold text-admin-text"><Lock className="size-3.5" aria-hidden="true" /> Safety Interlock</p>
            <p className="text-admin-caption text-admin-text-secondary">I confirm this documentation is accurate and ready for submission to QA.</p>
          </div>
        </Card>

        {error && <p className="text-admin-body-sm text-admin-danger">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={() => setSubStep("form")} variant="outline" disabled={submitting} className="flex-1 rounded-admin-xs">
            Back to Form
          </Button>
          <Button onClick={submit} loading={submitting} disabled={!interlockChecked} className="flex-1 rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
            Submit Documentation
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="flex items-center gap-1 text-admin-caption text-admin-text-secondary">
        <ChevronLeft className="size-3.5" aria-hidden="true" /> Previous step
      </button>
      <p className="flex items-center gap-1.5 text-admin-h4 text-admin-text"><ClipboardList className="size-4" aria-hidden="true" /> Nursing Documentation</p>
      {restored && <p className="text-admin-micro text-admin-success">Restored what you'd entered earlier on this device.</p>}

      <Card className="space-y-3 border-admin-border p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Treatment Date</label>
            <input type="date" value={values.treatmentDate} onChange={(e) => set("treatmentDate", e.target.value)} className="mt-0.5 w-full rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm" />
          </div>
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Cycle Count</label>
            <input value={cycleNumber} disabled className="mt-0.5 w-full rounded-admin-sm border border-admin-border bg-admin-disabled px-2.5 py-1.5 text-admin-body-sm text-admin-text-secondary" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Infusion Start</label>
            <input type="time" value={values.infusionStart} onChange={(e) => set("infusionStart", e.target.value)} className="mt-0.5 w-full rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm" />
          </div>
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Infusion End</label>
            <input type="time" value={values.infusionEnd} onChange={(e) => set("infusionEnd", e.target.value)} className="mt-0.5 w-full rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm" />
          </div>
        </div>
        <div>
          <label className="text-admin-caption text-admin-text-secondary">Diagnosis (from the patient's regimen)</label>
          <div className="mt-0.5 rounded-admin-sm border border-admin-border bg-admin-disabled px-2.5 py-1.5 text-admin-body-sm text-admin-text-secondary">
            {regimen === undefined ? "Looking up…" : regimen?.diagnosis ?? "No diagnosis on record for this regimen"}
          </div>
        </div>
        <div>
          <label className="text-admin-caption text-admin-text-secondary">Managing Consultant (QA Officer for this hospital)</label>
          <div className="mt-0.5 flex items-center gap-1.5 rounded-admin-sm border border-admin-border bg-admin-disabled px-2.5 py-1.5 text-admin-body-sm text-admin-text-secondary">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
            {qaOfficer === undefined ? "Looking up…" : qaOfficer?.fullName ?? "No QA officer assigned to this facility"}
          </div>
        </div>
      </Card>

      <Card className="space-y-2 border-admin-border p-4">
        <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Vitals &amp; Biometrics</p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Weight" unit="kg" value={values.weightKg} onChange={(v) => set("weightKg", v)} />
          <NumberField label="Height" unit="m" value={values.heightM} onChange={(v) => set("heightM", v)} />
          {VITAL_FIELDS.map((f) => (
            <NumberField key={f.type} label={f.label} unit={f.unit} value={values.vitals[f.type] ?? ""} onChange={(v) => setKeyed("vitals", f.type, v)} />
          ))}
        </div>
        <div>
          <label className="text-admin-micro text-admin-text-secondary">Biological Sex (for CrCl)</label>
          <div className="mt-1 flex gap-2">
            {(["FEMALE", "MALE"] as const).map((s) => (
              <button
                key={s} type="button" onClick={() => set("sex", s)}
                className={cn("flex-1 rounded-admin-sm border px-3 py-1.5 text-admin-body-sm", values.sex === s ? "border-admin-sidebar-cta bg-admin-sidebar-cta/10 text-admin-sidebar-cta" : "border-admin-border text-admin-text-secondary")}
              >
                {s === "FEMALE" ? "Female" : "Male"}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="space-y-2 border-admin-border p-4">
        <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Lab Panel (FBC / E-U-Cr)</p>
        <div className="grid grid-cols-2 gap-3">
          {LAB_FIELDS.map((f) => (
            <NumberField key={f.code} label={f.label} unit={f.unit} value={values.labs[f.code] ?? ""} onChange={(v) => setKeyed("labs", f.code, v)} />
          ))}
        </div>
        {!creatinine && (
          <p className="flex items-center gap-1.5 text-admin-micro text-admin-warning"><TriangleAlert className="size-3.5" aria-hidden="true" /> Creatinine is required to compute CrCl and eGFR.</p>
        )}
      </Card>

      <CaseDrugUsage nursingCaseId={nursingCase.id} editable />

      <Card className="space-y-3 border-admin-border p-4">
        <div>
          <label className="text-admin-caption text-admin-text-secondary">Note</label>
          <textarea value={values.note} onChange={(e) => set("note", e.target.value)} rows={3} maxLength={4000} className="mt-0.5 w-full rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm" />
        </div>
        <div>
          <label className="text-admin-caption text-admin-text-secondary">Next Appointment Date</label>
          <input type="date" value={values.nextAppointmentDate} onChange={(e) => set("nextAppointmentDate", e.target.value)} className="mt-0.5 w-full rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm" />
        </div>
      </Card>

      <Button onClick={() => setSubStep("preview")} disabled={!readyForPreview} className="w-full rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
        <Eye className="size-4" aria-hidden="true" /> Preview
      </Button>
      {!readyForPreview && (
        <p className="text-center text-admin-micro text-admin-text-secondary">
          {!infusionOk ? "Enter both infusion times, with the end after the start." : "A treatment date, plausible weight and height, and creatinine are required before previewing."}
        </p>
      )}
    </div>
  );
}

// One label/value line in the preview.
function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-admin-body-sm">
      <span className="text-admin-text-secondary">{label}</span>
      <span className="text-right text-admin-text">{value}</span>
    </div>
  );
}
