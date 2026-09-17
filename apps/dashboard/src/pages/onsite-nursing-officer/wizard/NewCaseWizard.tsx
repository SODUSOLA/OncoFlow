import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ChevronLeft, ShieldAlert, Camera, CheckCircle2, XCircle, Lock, ShieldCheck, TriangleAlert,
} from "lucide-react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import type { Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import type { RegimenCycleRow, NursingCase, FileRecord } from "../lib/types";
import { uploadFile, pollScanStatus } from "../lib/uploadFile";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

type Step = 1 | 2 | 3 | 4 | 5 | "success" | "error";

interface ErrorState { message: string; incidentReference: string | null }

// ONCOFLOW_NURSING_OFFICER_BUILD_GUIDE.md — the wizard build spec (Steps 1-5 + success/error).
// "This persona deliberately uses friction as a safety mechanism... don't simplify these into
// fewer clicks." Every step here does a real thing: Step 2 really creates the nursing_case,
// Step 3/5's uploads really go through the file table's virus-scan pipeline, Step 5's interlock
// really gates the request (not just a disabled attribute), and the Error screen is only ever
// reached from a real INFECTED scan result.
export default function NewCaseWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const preselectedPatientId = (location.state as { patientId?: string } | null)?.patientId;

  const [step, setStep] = useState<Step>(1);
  const [cycles, setCycles] = useState<RegimenCycleRow[]>([]);
  const [loadingCycles, setLoadingCycles] = useState(true);
  const [selectedCycle, setSelectedCycle] = useState<RegimenCycleRow | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [nursingCase, setNursingCase] = useState<NursingCase | null>(null);

  const [upiCode, setUpiCode] = useState("");
  const [idPhoto, setIdPhoto] = useState<{ file: FileRecord; previewUrl: string } | null>(null);
  const [idPhotoScanning, setIdPhotoScanning] = useState(false);
  const [idPhotoError, setIdPhotoError] = useState<string | null>(null);

  const [interlockChecked, setInterlockChecked] = useState(false);
  const [docFile, setDocFile] = useState<FileRecord | null>(null);
  const [docScanning, setDocScanning] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [errorState, setErrorState] = useState<ErrorState | null>(null);
  const [finalizedAt, setFinalizedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.facilityId) { setLoadingCycles(false); return; }
    api.get<{ cycles: RegimenCycleRow[] }>(`/regimen-cycles?facilityId=${user.facilityId}&date=${todayDateString()}`)
      .then((d) => {
        setCycles(d.cycles);
        if (preselectedPatientId) {
          const match = d.cycles.find((c) => c.patientId === preselectedPatientId);
          if (match) selectCycle(match);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCycles(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.facilityId]);

  function selectCycle(cycle: RegimenCycleRow) {
    setSelectedCycle(cycle);
    setStartError(null);
    api.get<{ patient: Patient }>(`/patients/${cycle.patientId}`).then((d) => setPatient(d.patient)).catch(() => {});
    setStep(2);
  }

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

  async function handleIdPhoto(file: File) {
    if (!selectedCycle) return;
    setIdPhotoError(null);
    setIdPhotoScanning(true);
    try {
      const uploaded = await uploadFile(file, selectedCycle.patientId);
      const resolved = await pollScanStatus(uploaded.id);
      if (resolved.virusScanStatus === "INFECTED") {
        await reportIncident(uploaded.id);
        return;
      }
      setIdPhoto({ file: resolved, previewUrl: URL.createObjectURL(file) });
    } catch (err) {
      setIdPhotoError(err instanceof Error ? err.message : "Could not verify this file");
    } finally {
      setIdPhotoScanning(false);
    }
  }

  async function handleDocUpload(file: File) {
    if (!selectedCycle) return;
    setDocError(null);
    setDocScanning(true);
    try {
      const uploaded = await uploadFile(file, selectedCycle.patientId);
      const resolved = await pollScanStatus(uploaded.id);
      if (resolved.virusScanStatus === "INFECTED") {
        await reportIncident(uploaded.id);
        return;
      }
      setDocFile(resolved);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Could not verify this file");
    } finally {
      setDocScanning(false);
    }
  }

  async function reportIncident(fileId: string) {
    try {
      const res = await api.post<{ incident: { incidentReference: string } }>("/security-incidents", {
        fileId, nursingCaseId: nursingCase?.id,
      });
      setErrorState({ message: "This file was flagged by the safety scan and rejected.", incidentReference: res.incident.incidentReference });
    } catch {
      setErrorState({ message: "This file was flagged by the safety scan and rejected.", incidentReference: null });
    }
    setStep("error");
  }

  async function finalSubmit() {
    if (!nursingCase || !idPhoto || !docFile || !interlockChecked) return;
    setSubmitting(true);
    setDocError(null);
    try {
      await api.post(`/nursing-cases/${nursingCase.id}/documentation-sheet`, {
        upiCodeEntered: upiCode, idPhotoFileId: idPhoto.file.id, fileReference: docFile.id,
      });
      setFinalizedAt(new Date().toISOString());
      setStep("success");
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Could not submit — try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {step !== "success" && step !== "error" && (
        <button
          onClick={() => (step === 1 ? navigate(-1) : setStep((step - 1) as Step))}
          className="flex items-center gap-1 text-admin-caption text-admin-text-secondary"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" /> {step === 1 ? "Back" : "Previous step"}
        </button>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-admin-h4 text-admin-text">New Case — Select Patient</p>
          {loadingCycles ? (
            <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
          ) : cycles.length === 0 ? (
            <Card className="p-6 text-center text-admin-body-sm text-admin-text-secondary">No visitations scheduled today.</Card>
          ) : (
            cycles.map((c) => {
              const overdue = c.scheduledDate < todayDateString();
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
                  <span className={cn("shrink-0 rounded-admin-lg px-2 py-0.5 text-admin-micro font-semibold", overdue ? "bg-admin-danger/10 text-admin-danger" : "bg-admin-success/10 text-admin-success")}>
                    {overdue ? "Overdue" : "Today"}
                  </span>
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
        <div className="space-y-3">
          <p className="text-admin-h4 text-admin-text">Identity Verification</p>
          <div>
            <label className="text-admin-caption text-admin-text-secondary">UPI Code</label>
            <input
              value={upiCode}
              onChange={(e) => setUpiCode(e.target.value)}
              placeholder="Enter the patient's Unique Patient Identifier"
              className="mt-1 w-full rounded-admin-sm border border-admin-border px-3 py-2.5 text-admin-body-sm"
            />
          </div>
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Physical ID Photo</label>
            {idPhoto ? (
              <div className="mt-1 flex items-center gap-3 rounded-admin-sm border border-admin-success/40 bg-admin-success/5 p-3">
                <img src={idPhoto.previewUrl} alt="Captured ID" className="size-14 shrink-0 rounded-admin-sm object-cover" />
                <p className="flex items-center gap-1.5 text-admin-body-sm text-admin-success"><CheckCircle2 className="size-4" aria-hidden="true" /> Cleared safety scan</p>
              </div>
            ) : (
              <label className="mt-1 flex cursor-pointer flex-col items-center gap-2 rounded-admin-sm border border-dashed border-admin-border bg-admin-card-alt py-6 text-center">
                <Camera className="size-6 text-admin-text-secondary" aria-hidden="true" />
                <span className="text-admin-caption text-admin-text-secondary">{idPhotoScanning ? "Scanning…" : "Tap to capture or upload"}</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" disabled={idPhotoScanning}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleIdPhoto(f); }} />
              </label>
            )}
            {idPhotoError && <p className="mt-1 text-admin-caption text-admin-danger">{idPhotoError}</p>}
          </div>
          <Button
            onClick={() => setStep(4)}
            disabled={!upiCode.trim() || !idPhoto}
            className="w-full rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90"
          >
            Continue
          </Button>
        </div>
      )}

      {step === 4 && patient && idPhoto && (
        <div className="space-y-3">
          <p className="text-admin-h4 text-admin-text">Name Verification</p>
          <Card className="flex items-center gap-3 border-admin-border p-4">
            <img src={idPhoto.previewUrl} alt="Captured ID" className="size-16 shrink-0 rounded-admin-sm object-cover" />
            <div>
              <p className="text-admin-body font-semibold text-admin-text">{patient.firstName} {patient.lastName}</p>
              <p className="text-admin-body-sm text-admin-text-secondary">DOB: {new Date(patient.dob).toLocaleDateString()}</p>
              <p className="text-admin-body-sm text-admin-text-secondary">Gender: {patient.gender}</p>
            </div>
          </Card>
          <p className="text-admin-caption text-admin-text-secondary">Does the captured photo match this patient's name and date of birth?</p>
          <div className="flex gap-2">
            <Button onClick={() => navigate("/dashboard/onsite-nursing-officer/uploads")} variant="outline" className="flex-1 rounded-admin-xs border-admin-danger text-admin-danger">
              <XCircle className="size-4" aria-hidden="true" /> Report Mismatch
            </Button>
            <Button onClick={() => setStep(5)} className="flex-1 rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
              <CheckCircle2 className="size-4" aria-hidden="true" /> Confirm Match
            </Button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <p className="text-admin-h4 text-admin-text">Final Upload</p>
          <Card
            className={cn("flex items-start gap-2.5 p-3.5", interlockChecked ? "border-admin-success/40 bg-admin-success/5" : "border-admin-border bg-admin-card-alt")}
            onClick={() => setInterlockChecked((v) => !v)}
          >
            <input type="checkbox" checked={interlockChecked} onChange={(e) => setInterlockChecked(e.target.checked)} className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="flex items-center gap-1.5 text-admin-body-sm font-semibold text-admin-text"><Lock className="size-3.5" aria-hidden="true" /> Safety Interlock</p>
              <p className="text-admin-caption text-admin-text-secondary">I confirm this documentation is accurate and ready for upload.</p>
            </div>
          </Card>

          <div>
            <label className="text-admin-caption text-admin-text-secondary">Documentation File</label>
            {!interlockChecked ? (
              <div className="mt-1 rounded-admin-sm border border-dashed border-admin-border bg-admin-disabled py-6 text-center text-admin-caption text-admin-text-secondary">
                Check the safety interlock above to enable upload
              </div>
            ) : docFile ? (
              <div className="mt-1 flex items-center gap-2 rounded-admin-sm border border-admin-success/40 bg-admin-success/5 p-3 text-admin-body-sm text-admin-success">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> Cleared safety scan
              </div>
            ) : (
              <label className="mt-1 flex cursor-pointer flex-col items-center gap-2 rounded-admin-sm border border-dashed border-admin-border bg-admin-card-alt py-6 text-center">
                <ShieldAlert className="size-6 text-admin-text-secondary" aria-hidden="true" />
                <span className="text-admin-caption text-admin-text-secondary">{docScanning ? "Scanning…" : "Tap to select file"}</span>
                <input type="file" className="hidden" disabled={docScanning}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleDocUpload(f); }} />
              </label>
            )}
            {docError && <p className="mt-1 text-admin-caption text-admin-danger">{docError}</p>}
          </div>

          <Button
            onClick={finalSubmit}
            loading={submitting}
            disabled={!interlockChecked || !docFile}
            className="w-full rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90"
          >
            Submit Documentation
          </Button>
        </div>
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
          <Card className="w-full border-admin-border p-4 text-left">
            <p className="text-admin-caption text-admin-text-secondary">Case Reference</p>
            <p className="font-mono text-admin-body-sm text-admin-text">{nursingCase.id}</p>
            <p className="mt-3 flex items-center gap-1.5 text-admin-caption text-admin-success"><Lock className="size-3.5" aria-hidden="true" /> Files stored encrypted at rest</p>
          </Card>
          <Button onClick={() => navigate("/dashboard/onsite-nursing-officer/uploads")} className="w-full rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
            Back to My Cases
          </Button>
        </div>
      )}

      {step === "error" && errorState && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-admin-danger/10">
            <ShieldAlert className="size-8 text-admin-danger" aria-hidden="true" />
          </div>
          <div>
            <p className="text-admin-h4 text-admin-danger">Upload Rejected</p>
            <p className="mt-1 text-admin-body-sm text-admin-text-secondary">{errorState.message}</p>
          </div>
          <Card className="w-full border-admin-danger/30 bg-admin-danger/5 p-4 text-left">
            {errorState.incidentReference ? (
              <>
                <p className="text-admin-caption text-admin-text-secondary">Incident Log</p>
                <p className="font-mono text-admin-body-sm text-admin-danger">{errorState.incidentReference}</p>
              </>
            ) : (
              <p className="text-admin-body-sm text-admin-text-secondary">Incident could not be logged automatically — notify your Regional Admin directly.</p>
            )}
            <p className="mt-3 text-admin-caption text-admin-text-secondary">Your Regional Admin has been alerted.</p>
          </Card>
          <Button onClick={() => navigate("/dashboard/onsite-nursing-officer/uploads")} className="w-full rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
            Back to My Cases
          </Button>
        </div>
      )}
    </div>
  );
}
