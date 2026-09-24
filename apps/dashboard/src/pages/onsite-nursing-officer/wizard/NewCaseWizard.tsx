import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ChevronLeft, CheckCircle2, XCircle, Lock, ShieldCheck, TriangleAlert, UserRound,
} from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import type { Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import type { RegimenCycleRow, NursingCase, NursingCaseDetail } from "../lib/types";
import { ageFromDob } from "../lib/documentation";
import { CycleStatusBadge } from "../lib/CycleStatusBadge";
import { DocumentationForm } from "./DocumentationForm";

// Returns today's date as YYYY-MM-DD.
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// 1 select patient · 2 confirm start · 3 identity check · 4 documentation.
type Step = 1 | 2 | 3 | 4 | "success";

// The case wizard: pick the visitation, confirm the start, check the patient's identity against their profile photo, then document. Identity is stored on the case, so a resumed case never repeats it.
export default function NewCaseWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  // Handed a concrete, already-due cycle by the patient page (or Schedule via it) — trusted as-is, so step 1's
  // own list is never re-searched for it. Without this, a cycle scheduled for tomorrow-turned-today, or one the
  // list simply hadn't loaded yet, could silently fail to match and leave "Start Case" looking like it did nothing.
  const navState = location.state as { cycle?: RegimenCycleRow; resumeCase?: NursingCaseDetail } | null;
  const preselectedCycle = navState?.cycle ?? null;
  // A case that was already started (Step 2 done) but never finished Steps 3-5 — from the case detail page's
  // "Continue Documentation". Re-running confirmCaseStart for it would 409 (a case is already open for this
  // regimen cycle), so this resumes straight into identity verification instead of creating a second case.
  const resumeCase = navState?.resumeCase ?? null;

  const [step, setStep] = useState<Step>(1);
  const [cycles, setCycles] = useState<RegimenCycleRow[]>([]);
  const [loadingCycles, setLoadingCycles] = useState(true);
  const [selectedCycle, setSelectedCycle] = useState<RegimenCycleRow | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [nursingCase, setNursingCase] = useState<NursingCase | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [mismatchOpen, setMismatchOpen] = useState(false);
  const [mismatchNote, setMismatchNote] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [finalizedAt, setFinalizedAt] = useState<string | null>(null);
  // Whether the metrics just submitted triggered a case lock (critical CrCl/eGFR) — the real server-side
  // decision, re-fetched rather than re-derived, so this can never disagree with what actually locked the case.
  const [caseLocked, setCaseLocked] = useState(false);

  // Known from the fresh-start path (selectedCycle) or the resume path (resumeCase, which the API now
  // joins to its cycle) — whichever is set, the wizard is always on one path or the other by step 5.
  const cycleNumber = selectedCycle?.cycleNumber ?? resumeCase?.cycleNumber ?? 0;

  useEffect(() => {
    if (resumeCase) {
      // A case awaiting QA (or closed) can't be changed — straight back to it rather than into a form that would 409.
      if (!resumeCase.editable) { navigate(`/dashboard/onsite-nursing-officer/cases/${resumeCase.id}`, { replace: true }); return; }
      setNursingCase(resumeCase);
      api.get<{ patient: Patient }>(`/patients/${resumeCase.patientId}`).then((d) => setPatient(d.patient)).catch(() => {});
      // Always via the identity page: if it's already verified it says so and offers Continue, so nothing is
      // skipped silently. What the nurse had filled in further on is restored from the saved draft.
      setStep(3);
    } else if (preselectedCycle) {
      // Jumps straight to step 2 when the caller already knows the cycle, but still loads step 1's own list
      // in the background — "Previous step" from step 2 has to land somewhere real, not an empty list that
      // was never fetched because the direct jump skipped it.
      selectCycle(preselectedCycle);
    }
    if (!user?.facilityId) { setLoadingCycles(false); return; }
    // due=true: today's cycles plus any still-SCHEDULED ones that slipped past their date — the same list
    // Schedule's "Due Now" section shows, so a cycle picked there is guaranteed to appear here too.
    api.get<{ cycles: RegimenCycleRow[] }>(`/regimen-cycles?facilityId=${user.facilityId}&date=${todayDateString()}&due=true`)
      .then((d) => setCycles(d.cycles))
      .catch(() => {})
      .finally(() => setLoadingCycles(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.facilityId]);

  // Selects a regimen cycle and moves on.
  function selectCycle(cycle: RegimenCycleRow) {
    // A visitation already being worked on is opened, not started again (which the API would 409).
    if (cycle.caseId) { navigate(`/dashboard/onsite-nursing-officer/cases/${cycle.caseId}`); return; }
    setSelectedCycle(cycle);
    setStartError(null);
    api.get<{ patient: Patient }>(`/patients/${cycle.patientId}`).then((d) => setPatient(d.patient)).catch(() => {});
    setStep(2);
  }

  // Creates the nursing case for the selected cycle.
  async function confirmCaseStart() {
    if (!selectedCycle) return;
    setStarting(true);
    setStartError(null);
    try {
      const res = await api.post<{ case: NursingCase }>("/nursing-cases", {
        patientId: selectedCycle.patientId, regimenCycleId: selectedCycle.id,
      });
      setNursingCase(res.case);
      setStep(3);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Could not start the case");
    } finally {
      setStarting(false);
    }
  }

  // Records that the patient in front of the nurse matches the profile photo on file.
  async function confirmIdentity() {
    if (!nursingCase) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await api.post<{ case: NursingCase }>(`/nursing-cases/${nursingCase.id}/verify-identity`);
      setNursingCase(res.case);
      setStep(4);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Could not record the verification");
    } finally {
      setVerifying(false);
    }
  }

  // Records the mismatch (audited, Regional Admin is told) before leaving, instead of just walking away.
  async function reportMismatch() {
    if (!nursingCase) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      await api.post(`/nursing-cases/${nursingCase.id}/report-mismatch`, { note: mismatchNote.trim() || undefined });
      navigate("/dashboard/onsite-nursing-officer/cases");
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Could not record the report");
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-4">
      {step !== "success" && step !== 4 && (
        <button
          onClick={() => {
            // By step 3 the case already exists, so back leaves the wizard rather than landing on a
            // "Confirm Case Started" that would try to create a second one.
            if (step === 1 || step === 3) navigate(-1);
            else setStep((step - 1) as Step);
          }}
          className="flex items-center gap-1 text-admin-caption text-admin-text-secondary"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" /> {step === 1 || step === 3 ? "Back" : "Previous step"}
        </button>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-admin-h4 text-admin-text">New Case — Select Patient</p>
          {loadingCycles ? (
            <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
          ) : cycles.length === 0 ? (
            <Card className="p-6 text-center text-admin-body-sm text-admin-text-secondary">Nothing due — no visitations today, and nothing left over.</Card>
          ) : (
            cycles.map((c) => {
              return (
                <Card key={c.id} onClick={() => selectCycle(c)} className="flex cursor-pointer items-center justify-between gap-3 border-admin-border p-3.5 hover:border-admin-sidebar-cta">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-admin-sidebar-cta text-admin-caption font-semibold text-white">
                      {c.firstName[0]}{c.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-admin-body-sm font-semibold text-admin-text">{c.firstName} {c.lastName}</p>
                      <p className="text-admin-caption text-admin-text-secondary">{c.uniquePatientId} · Cycle {c.cycleNumber}</p>
                    </div>
                  </div>
                  <CycleStatusBadge cycle={c} today={todayDateString()} />
                </Card>
              );
            })
          )}
        </div>
      )}

      {step === 2 && patient && (
        <div className="space-y-3">
          <p className="text-admin-h4 text-admin-text">Confirm Case Start</p>
          <Card className="border-admin-border p-4">
            <p className="text-admin-body font-semibold text-admin-text">{patient.firstName} {patient.lastName}</p>
            <p className="mt-1 text-admin-body-sm text-admin-text-secondary">MRN: {patient.uniquePatientId}</p>
            <p className="text-admin-body-sm text-admin-text-secondary">DOB: {new Date(patient.dob).toLocaleDateString()}</p>
          </Card>
          <Card className="flex items-start gap-2.5 border-admin-warning/40 bg-admin-warning/10 p-3.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-admin-warning" aria-hidden="true" />
            <p className="text-admin-caption text-admin-text">
              Starting this case begins documentation for this patient's visitation. You are personally responsible for what's entered under your account.
            </p>
          </Card>
          {startError && <p className="text-admin-body-sm text-admin-danger">{startError}</p>}
          <Button onClick={confirmCaseStart} loading={starting} className="w-full rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
            Confirm Case Started
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-admin-h4 text-admin-text">Identity Verification</p>
          {!patient ? (
            <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
          ) : (
            <Card className="flex flex-col items-center gap-4 border-admin-border p-6 text-center">
              {patient.profilePictureFileId ? (
                <img
                  src={`/api/files/${patient.profilePictureFileId}/content`} alt={`${patient.firstName} ${patient.lastName}`}
                  className="size-44 rounded-admin-md border border-admin-border object-cover"
                />
              ) : (
                <div className="flex size-44 flex-col items-center justify-center gap-1 rounded-admin-md border border-dashed border-admin-border bg-admin-card-alt text-admin-text-secondary">
                  <UserRound className="size-12" aria-hidden="true" />
                  <span className="text-admin-micro">No profile photo on file</span>
                </div>
              )}
              <div>
                <p className="text-admin-h3 text-admin-text">{patient.firstName} {patient.lastName}</p>
                <p className="mt-0.5 font-mono text-admin-body-sm text-admin-text-secondary">{patient.uniquePatientId}</p>
              </div>
              <div className="grid w-full grid-cols-2 gap-3 border-t border-admin-border pt-4">
                <div>
                  <p className="text-admin-micro font-semibold uppercase tracking-wide text-admin-text-secondary">Date of birth</p>
                  <p className="text-admin-body-sm text-admin-text">{new Date(patient.dob).toLocaleDateString()} · {ageFromDob(patient.dob)}y</p>
                </div>
                <div>
                  <p className="text-admin-micro font-semibold uppercase tracking-wide text-admin-text-secondary">Sex</p>
                  <p className="text-admin-body-sm text-admin-text">{patient.gender}</p>
                </div>
              </div>
            </Card>
          )}

          {nursingCase?.identityVerifiedAt ? (
            <>
              <p className="flex items-center gap-1.5 text-admin-body-sm text-admin-success">
                <CheckCircle2 className="size-4" aria-hidden="true" /> Identity verified {new Date(nursingCase.identityVerifiedAt).toLocaleString()}
              </p>
              <Button onClick={() => setStep(4)} className="w-full rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
                Continue to Documentation
              </Button>
            </>
          ) : (
            <>
              <p className="text-center text-admin-caption text-admin-text-secondary">
                {patient?.profilePictureFileId
                  ? "Does the patient in front of you match this photo, name and date of birth?"
                  : "No photo on file — check the patient against their name, date of birth and ID."}
              </p>
              {verifyError && <p className="text-center text-admin-body-sm text-admin-danger">{verifyError}</p>}
              {mismatchOpen ? (
                <div className="space-y-2">
                  <textarea
                    value={mismatchNote} onChange={(e) => setMismatchNote(e.target.value)} rows={2} maxLength={1000}
                    placeholder="What doesn't match? (optional)"
                    className="w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => setMismatchOpen(false)} variant="outline" disabled={verifying} className="flex-1 rounded-admin-xs">Cancel</Button>
                    <Button onClick={reportMismatch} loading={verifying} className="flex-1 rounded-admin-xs bg-admin-danger hover:bg-admin-danger/90">
                      Report &amp; Leave
                    </Button>
                  </div>
                  <p className="text-admin-micro text-admin-text-secondary">This is recorded and sent to your Regional Admin.</p>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={() => setMismatchOpen(true)} variant="outline" disabled={verifying} className="flex-1 rounded-admin-xs border-admin-danger text-admin-danger">
                    <XCircle className="size-4" aria-hidden="true" /> Report Mismatch
                  </Button>
                  <Button onClick={confirmIdentity} loading={verifying} disabled={!patient} className="flex-1 rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
                    <CheckCircle2 className="size-4" aria-hidden="true" /> Confirm Identity
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {step === 4 && nursingCase && patient && (
        <DocumentationForm
          nursingCase={nursingCase}
          patient={patient}
          cycleNumber={cycleNumber}
          previousSheet={resumeCase?.documentationSheet}
          onBack={() => setStep(3)}
          onSubmitted={() => {
            setFinalizedAt(new Date().toISOString());
            setStep("success");
            api.get<{ caseLock: unknown }>(`/case-locks/active?patientId=${nursingCase.patientId}`)
              .then((d) => setCaseLocked(!!d.caseLock)).catch(() => {});
          }}
        />
      )}

      {step === "success" && nursingCase && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-admin-success/10">
            <ShieldCheck className="size-8 text-admin-success" aria-hidden="true" />
          </div>
          <div>
            <p className="text-admin-h4 text-admin-text">Case Submitted for QA Review</p>
            <p className="mt-1 text-admin-body-sm text-admin-text-secondary">{finalizedAt && new Date(finalizedAt).toLocaleString()}</p>
          </div>
          {caseLocked && (
            <Card className="flex w-full items-start gap-2.5 border-admin-danger/40 bg-admin-danger/5 p-3.5 text-left">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-admin-danger" aria-hidden="true" />
              <p className="text-admin-body-sm text-admin-danger">
                The submitted CrCl or eGFR was critical — this patient's case is now locked pending sign-off from a Senior Clinical Director or Chief Consultant.
              </p>
            </Card>
          )}
          <Card className="w-full border-admin-border p-4 text-left">
            <p className="text-admin-caption text-admin-text-secondary">Case Reference</p>
            <p className="font-mono text-admin-body-sm text-admin-text">{nursingCase.id}</p>
            <p className="mt-3 flex items-center gap-1.5 text-admin-caption text-admin-success"><Lock className="size-3.5" aria-hidden="true" /> Files stored encrypted at rest</p>
          </Card>
          <Button onClick={() => navigate(`/dashboard/onsite-nursing-officer/cases/${nursingCase.id}`)} className="w-full rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
            View Case
          </Button>
        </div>
      )}
    </div>
  );
}
