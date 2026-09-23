import { useEffect, useState, type ReactNode } from "react";
import { Receipt, Lock, Check, Send } from "lucide-react";
import { api } from "../../../lib/api";
import type { Invoice, ServiceClassification, Patient, Facility, Tariff } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { cn } from "../../../lib/utils";
import { useRegionScope } from "../lib/useRegionScope";

// Formats kobo as a naira string.
function koboToNaira(k: number) {
  return `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

const STATUS_VARIANT: Record<Invoice["status"], "success" | "info" | "neutral" | "critical" | "warning"> = {
  PAID: "success",
  SENT: "info",
  DRAFT: "neutral",
  VOID: "critical",
  OVERDUE: "warning",
};

type StepStatus = "done" | "active" | "pending";

// Numbered accordion step matching the mockup; step 4 is a real confirmation since no medication-bundle model exists.
function StepCard({
  index, title, status, doneSummary, onEdit, children,
}: {
  index: number;
  title: string;
  status: StepStatus;
  doneSummary?: ReactNode;
  onEdit?: () => void;
  children?: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-admin-border transition-colors",
        status === "active" && "border-2 border-admin-sidebar-cta shadow-admin-card",
        status === "pending" && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-admin-caption font-semibold",
              status === "done" ? "bg-admin-success text-white" : status === "active" ? "bg-admin-sidebar-cta text-white" : "border border-admin-border text-admin-text-secondary",
            )}
          >
            {status === "done" ? <Check className="size-3.5" aria-hidden="true" /> : index}
          </span>
          <p className={cn("text-admin-body-sm font-semibold", status === "pending" ? "text-admin-text-secondary" : "text-admin-text")}>{title}</p>
        </div>
        {status === "done" && onEdit && (
          <button onClick={onEdit} className="text-admin-caption font-medium text-admin-sidebar-cta hover:underline">Edit</button>
        )}
      </div>
      {status === "done" && doneSummary && (
        <div className="border-t border-admin-border bg-admin-card-alt px-5 py-3 text-admin-body-sm text-admin-text-secondary">{doneSummary}</div>
      )}
      {status === "active" && children && (
        <div className="border-t border-admin-border px-5 py-4">{children}</div>
      )}
    </Card>
  );
}

// Billing page with invoice list and the Invoice Generator.
export default function BillingPage() {
  const { facilitiesInRegion } = useRegionScope();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [classifications, setClassifications] = useState<ServiceClassification[]>([]);
  const [genPatientId, setGenPatientId] = useState("");
  const [genClassificationId, setGenClassificationId] = useState("");
  const [genFacilityId, setGenFacilityId] = useState("");
  const [genTariffs, setGenTariffs] = useState<Tariff[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<1 | 2 | 3 | null>(null);

  // Loads invoices across the region.
  function loadInvoices() {
    api.get<{ invoices: Invoice[] }>("/invoices?facilityId=all").then((d) => setInvoices(d.invoices)).catch(() => {});
  }

  useEffect(() => {
    loadInvoices();
    api.get<{ patients: Patient[] }>("/patients?facilityId=all").then((d) => setPatients(d.patients)).catch(() => {});
    api.get<{ classifications: ServiceClassification[] }>("/classifications").then((d) => setClassifications(d.classifications)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!genFacilityId) {
      setGenTariffs([]);
      return;
    }
    api.get<{ tariffs: Tariff[] }>(`/tariffs?facilityId=${genFacilityId}`)
      .then((d) => setGenTariffs(d.tariffs)).catch(() => setGenTariffs([]));
  }, [genFacilityId]);

  const facilityIdsInRegion = new Set(facilitiesInRegion.map((f) => f.id));
  const invoicesInRegion = invoices.filter((inv) => facilityIdsInRegion.has(inv.facilityId));

  const genTariff = genTariffs.find((t) => t.classificationId === genClassificationId) ?? null;
  const genPatient = patients.find((p) => p.id === genPatientId) ?? null;
  const genFacility = facilitiesInRegion.find((f) => f.id === genFacilityId) ?? null;
  const genClassification = classifications.find((c) => c.id === genClassificationId) ?? null;
  const total = genTariff
    ? Number(genTariff.networkFeeKobo) + Number(genTariff.facilityBedFeeKobo) + Number(genTariff.professionalFeeKobo) + Number(genTariff.drugPriceKobo)
    : 0;

  const step1Status: StepStatus = editingStep === 1 ? "active" : genPatientId ? "done" : "active";
  const step2Status: StepStatus = editingStep === 2 ? "active" : !genPatientId ? "pending" : genClassificationId ? "done" : "active";
  const step3Status: StepStatus = editingStep === 3 ? "active" : !genClassificationId ? "pending" : genFacilityId ? "done" : "active";
  const step4Status: StepStatus = genPatientId && genClassificationId && genFacilityId ? "active" : "pending";
  const allComplete = step4Status === "active" && !!genTariff;

  // Generates an invoice for the chosen patient, facility and classification.
  async function generateInvoice() {
    if (!genPatientId || !genFacilityId || !genClassificationId) return;
    setGenLoading(true);
    setGenResult(null);
    try {
      await api.post<{ invoice: Invoice }>("/invoices", {
        patientId: genPatientId,
        classificationId: genClassificationId,
        facilityId: genFacilityId,
      });
      setGenResult("Invoice created successfully");
      setGenPatientId("");
      setGenClassificationId("");
      setGenFacilityId("");
      loadInvoices();
    } catch (err) {
      setGenResult(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setGenLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-admin-h2 text-admin-text">
          <Receipt className="size-6 text-admin-sidebar-cta" aria-hidden="true" /> Invoice Generator
        </h2>
        <p className="mt-1 text-admin-body-sm text-admin-text-secondary">
          Secure financial reconciliation. Complete the required fields sequentially to generate a locked preview. Manual numeric entry is strictly prohibited for compliance.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-3">
          <StepCard
            index={1}
            title="Patient Identification"
            status={step1Status}
            onEdit={() => setEditingStep(1)}
            doneSummary={genPatient && (
              <p><span className="font-medium text-gray-800">{genPatient.firstName} {genPatient.lastName}</span> · ID: {genPatient.uniquePatientId}</p>
            )}
          >
            <label className="mb-1 block text-admin-caption font-medium text-admin-text-secondary">Select patient</label>
            <select
              value={genPatientId}
              onChange={(e) => { setGenPatientId(e.target.value); setEditingStep(null); }}
              className="w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
            >
              <option value="">Select from patient registry...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.uniquePatientId})</option>
              ))}
            </select>
          </StepCard>

          <StepCard
            index={2}
            title="Service Classification"
            status={step2Status}
            onEdit={() => setEditingStep(2)}
            doneSummary={genClassification && <p className="font-medium text-admin-text">{genClassification.name.replace(/_/g, " ")}</p>}
          >
            <label className="mb-1 block text-admin-caption font-medium text-admin-text-secondary">Select Primary Classification</label>
            <select
              value={genClassificationId}
              onChange={(e) => { setGenClassificationId(e.target.value); setEditingStep(null); }}
              className="w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
            >
              <option value="">Select from compliant dropdown...</option>
              {classifications.map((c) => (
                <option key={c.id} value={c.id}>{c.name.replace(/_/g, " ")}</option>
              ))}
            </select>
            <label className="mb-1 mt-3 block text-admin-caption font-medium text-admin-text-secondary">Secondary Code (Optional)</label>
            <div className="flex items-center gap-2 rounded-admin-sm border border-admin-border bg-admin-card-alt px-3 py-2 text-admin-body-sm text-admin-text-secondary">
              <Lock className="size-3.5 shrink-0" aria-hidden="true" /> Requires Primary Classification First
            </div>
          </StepCard>

          <StepCard
            index={3}
            title="Facility"
            status={step3Status}
            onEdit={() => setEditingStep(3)}
            doneSummary={genFacility && <p className="font-medium text-admin-text">{genFacility.name}</p>}
          >
            <label className="mb-1 block text-admin-caption font-medium text-admin-text-secondary">Select facility</label>
            <select
              value={genFacilityId}
              onChange={(e) => { setGenFacilityId(e.target.value); setEditingStep(null); }}
              className="w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
            >
              <option value="">Select facility...</option>
              {facilitiesInRegion.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </StepCard>

          <StepCard index={4} title="Review & Send" status={step4Status}>
            <p className="text-admin-body-sm text-admin-text-secondary">
              {allComplete
                ? "All required fields are set — the computed preview on the right is locked and ready. Use “Send to Patient” to issue."
                : "No tariff is configured for this facility/classification pair."}
            </p>
          </StepCard>

          {genResult && (
            <p className={cn("text-admin-body-sm", genResult.includes("successfully") ? "text-admin-success" : "text-admin-danger")}>{genResult}</p>
          )}
        </div>

        <div>
          <Card className="sticky top-4 overflow-hidden border-admin-border">
            <div className="relative overflow-hidden">
              {!allComplete && (
                <p
                  className="pointer-events-none absolute inset-x-0 top-1/3 select-none text-center text-4xl font-black uppercase tracking-widest text-admin-disabled"
                  style={{ transform: "rotate(-18deg)" }}
                  aria-hidden="true"
                >
                  Draft
                </p>
              )}
              <div className="relative flex items-center gap-2 border-b border-admin-border px-5 py-3.5">
                <Lock className="size-3.5 text-admin-text-secondary" aria-hidden="true" />
                <p className="text-admin-body-sm font-semibold text-admin-text">Computed Preview</p>
              </div>
              <div className="relative space-y-3 p-5">
                <div className="flex items-start justify-between text-admin-body-sm">
                  <div>
                    <p className="text-admin-micro uppercase tracking-wide text-admin-text-secondary">Billed To</p>
                    <p className="font-medium text-admin-text">{genPatient ? `${genPatient.firstName} ${genPatient.lastName}` : "—"}</p>
                    <p className="text-admin-caption text-admin-text-secondary">{genPatient?.uniquePatientId ?? ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-admin-micro uppercase tracking-wide text-admin-text-secondary">Invoice Date</p>
                    <p className="font-medium text-admin-text">{new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
                  </div>
                </div>
                <div className="space-y-1.5 border-t border-admin-border pt-3 text-admin-body-sm">
                  <div className="flex justify-between">
                    <span className="text-admin-text-secondary">Network Fee</span>
                    <span className={genTariff ? "font-medium text-admin-text" : "text-admin-text-secondary/50"}>
                      {genTariff ? koboToNaira(Number(genTariff.networkFeeKobo)) : "Pending..."}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-admin-text-secondary">Facility Fees</span>
                    <span className={genTariff ? "font-medium text-admin-text" : "text-admin-text-secondary/50"}>
                      {genTariff ? koboToNaira(Number(genTariff.facilityBedFeeKobo)) : "Facility Fees Pending... --"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-admin-text-secondary">Professional Fee</span>
                    <span className={genTariff ? "font-medium text-admin-text" : "text-admin-text-secondary/50"}>
                      {genTariff ? koboToNaira(Number(genTariff.professionalFeeKobo)) : "Pending..."}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-admin-text-secondary">Medications</span>
                    <span className={genTariff ? "font-medium text-admin-text" : "text-admin-text-secondary/50"}>
                      {genTariff ? koboToNaira(Number(genTariff.drugPriceKobo)) : "Medications Pending... --"}
                    </span>
                  </div>
                </div>
                <div className="flex items-baseline justify-between border-t border-admin-border pt-3">
                  <span className="text-admin-body-sm font-semibold text-admin-text">Total</span>
                  <span className="text-2xl font-bold text-admin-sidebar-cta">{koboToNaira(total)}</span>
                </div>
                <Button
                  onClick={generateInvoice}
                  loading={genLoading}
                  disabled={!allComplete}
                  className="w-full justify-center rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90"
                >
                  <Send className="size-4" aria-hidden="true" /> Send to Patient
                </Button>
                <p className="text-center text-admin-micro text-admin-text-secondary">
                  {allComplete ? "Amount computed from the regional tariff table." : "Complete all steps to unlock submission."}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden border-admin-border">
        <div className="border-b border-admin-border px-5 py-3.5">
          <p className="text-admin-body-sm font-semibold text-admin-text">Invoice & payment status — region</p>
        </div>
        {invoicesInRegion.length === 0 ? (
          <div className="p-8 text-center text-admin-text-secondary">No invoices found</div>
        ) : (
          <table className="w-full text-admin-body-sm">
            <thead className="text-left text-admin-caption text-admin-text-secondary">
              <tr>
                <th className="px-5 py-2 font-medium">Invoice</th>
                <th className="px-5 py-2 font-medium">Patient</th>
                <th className="px-5 py-2 font-medium">Facility</th>
                <th className="px-5 py-2 font-medium">Amount</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium">Issued</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-border">
              {invoicesInRegion.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-5 py-3 font-mono text-admin-caption text-admin-text-secondary">{inv.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-5 py-3 font-medium text-admin-text">{patients.find((p) => p.id === inv.patientId)?.firstName ?? inv.patientId.slice(0, 8)}</td>
                  <td className="px-5 py-3 text-admin-text-secondary">{facilitiesInRegion.find((f) => f.id === inv.facilityId)?.name ?? "—"}</td>
                  <td className="px-5 py-3">{koboToNaira(inv.totalKobo)}</td>
                  <td className="px-5 py-3"><Badge variant={STATUS_VARIANT[inv.status]}>{inv.status}</Badge></td>
                  <td className="px-5 py-3 text-admin-text-secondary">{inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
