import { useEffect, useState, type ReactNode } from "react";
import { Receipt, Lock, Check, Send, Plus, X } from "lucide-react";
import { api } from "../../../lib/api";
import type { Invoice, ServiceClassification, Patient } from "../../../lib/types";
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

// Classifications that are billed elsewhere: membership is deducted from the patient app and side-effect reports are paid upfront in chat.
const NOT_INVOICEABLE = new Set(["SUBSCRIPTION", "SIDE_EFFECT_REPORT"]);

interface Drug { id: string; name: string; strength: string }
interface DrugQty { drugId: string; quantity: number }
interface DraftLine { classificationId: string; subOptionId: string; drugs: DrugQty[] }
interface Quote {
  isSubscriber: boolean;
  totalKobo: string;
  lines: { subOptionId: string; description: string; amountKobo: string; drugs: DrugQty[] }[];
}

const EMPTY_PICK: DraftLine = { classificationId: "", subOptionId: "", drugs: [] };

// Billing page with invoice list and the Invoice Generator.
export default function BillingPage() {
  const { facilitiesInRegion } = useRegionScope();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [classifications, setClassifications] = useState<ServiceClassification[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [genPatientId, setGenPatientId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pick, setPick] = useState<DraftLine>(EMPTY_PICK);
  const [drugQuery, setDrugQuery] = useState("");
  const [genFacilityId, setGenFacilityId] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
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
    api.get<{ drugs: Drug[] }>("/inventory/drugs").then((d) => setDrugs(d.drugs)).catch(() => {});
  }, []);

  // Re-prices the chosen services whenever the patient (which sets the subscriber tier) or the services change.
  useEffect(() => {
    if (!genPatientId || lines.length === 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    api.post<Quote>("/invoices/quote", {
      patientId: genPatientId,
      lines: lines.map(({ subOptionId, drugs }) => ({ subOptionId, ...(drugs.length ? { drugs } : {}) })),
    })
      .then((q) => { if (!cancelled) { setQuote(q); setQuoteError(null); } })
      .catch((err) => { if (!cancelled) { setQuote(null); setQuoteError(err instanceof Error ? err.message : "Could not price these services"); } });
    return () => { cancelled = true; };
  }, [genPatientId, lines]);

  const facilityIdsInRegion = new Set(facilitiesInRegion.map((f) => f.id));
  const invoicesInRegion = invoices.filter((inv) => facilityIdsInRegion.has(inv.facilityId));

  const invoiceable = classifications.filter((c) => !NOT_INVOICEABLE.has(c.name));
  const available = invoiceable.filter((c) => !lines.some((l) => l.classificationId === c.id));
  const pickClassification = classifications.find((c) => c.id === pick.classificationId) ?? null;
  const pickOptions = pickClassification?.subOptions ?? [];
  const isDrugAdministration = pickClassification?.name === "DRUG_ADMINISTRATION";
  const visibleDrugs = drugs.filter((d) => `${d.name} ${d.strength}`.toLowerCase().includes(drugQuery.trim().toLowerCase()));
  const genPatient = patients.find((p) => p.id === genPatientId) ?? null;
  const genFacility = facilitiesInRegion.find((f) => f.id === genFacilityId) ?? null;
  const classificationLabel = (id: string) => classifications.find((c) => c.id === id)?.name.replace(/_/g, " ") ?? "";
  const drugLabel = ({ drugId, quantity }: DrugQty) => { const d = drugs.find((x) => x.id === drugId); return d ? `${d.name} ${d.strength} × ${quantity}` : ""; };

  const step1Status: StepStatus = editingStep === 1 ? "active" : genPatientId ? "done" : "active";
  const step2Status: StepStatus = editingStep === 2 ? "active" : !genPatientId ? "pending" : lines.length > 0 ? "done" : "active";
  const step3Status: StepStatus = editingStep === 3 ? "active" : lines.length === 0 ? "pending" : genFacilityId ? "done" : "active";
  const step4Status: StepStatus = genPatientId && lines.length > 0 && genFacilityId ? "active" : "pending";
  const allComplete = step4Status === "active" && !!quote;

  function chooseClassification(id: string) {
    const c = classifications.find((x) => x.id === id);
    setPick({ classificationId: id, subOptionId: c?.subOptions?.[0]?.id ?? "", drugs: [] });
    setDrugQuery("");
  }

  function toggleDrug(id: string) {
    setPick((p) => ({ ...p, drugs: p.drugs.some((x) => x.drugId === id) ? p.drugs.filter((x) => x.drugId !== id) : [...p.drugs, { drugId: id, quantity: 1 }] }));
  }

  function setDrugQuantity(id: string, quantity: number) {
    setPick((p) => ({ ...p, drugs: p.drugs.map((x) => (x.drugId === id ? { ...x, quantity } : x)) }));
  }

  function addService() {
    if (!pick.classificationId || !pick.subOptionId) return;
    setLines((prev) => [...prev, pick]);
    setPick(EMPTY_PICK);
    setDrugQuery("");
    setEditingStep(2);
  }

  // Creates the invoice from the chosen services and sends it, so the patient sees it straight away.
  async function generateInvoice() {
    if (!genPatientId || !genFacilityId || lines.length === 0) return;
    setGenLoading(true);
    setGenResult(null);
    try {
      const created = await api.post<{ invoiceId: string }>("/invoices", {
        patientId: genPatientId,
        facilityId: genFacilityId,
        lines: lines.map(({ subOptionId, drugs }) => ({ subOptionId, ...(drugs.length ? { drugs } : {}) })),
      });
      await api.post(`/invoices/${created.invoiceId}/send`, {});
      setGenResult("Invoice created and sent successfully");
      setGenPatientId("");
      setLines([]);
      setPick(EMPTY_PICK);
      setGenFacilityId("");
      setEditingStep(null);
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
            doneSummary={(
              <ul className="space-y-1">
                {lines.map((l) => {
                  const q = quote?.lines.find((x) => x.subOptionId === l.subOptionId);
                  return (
                    <li key={l.subOptionId} className="flex justify-between gap-3">
                      <span>
                        <span className="font-medium text-admin-text">{classificationLabel(l.classificationId)}</span>
                        {q && <span> · {q.description}</span>}
                      </span>
                      {q && <span className="font-medium text-admin-text">{koboToNaira(Number(q.amountKobo))}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          >
            {lines.length > 0 && (
              <ul className="mb-4 divide-y divide-admin-border rounded-admin-sm border border-admin-border">
                {lines.map((l) => {
                  const q = quote?.lines.find((x) => x.subOptionId === l.subOptionId);
                  return (
                    <li key={l.subOptionId} className="flex items-start justify-between gap-3 px-3 py-2 text-admin-body-sm">
                      <div>
                        <p className="font-medium text-admin-text">{classificationLabel(l.classificationId)}{q && <span className="font-normal text-admin-text-secondary"> · {q.description}</span>}</p>
                        {l.drugs.length > 0 && <p className="text-admin-caption text-admin-text-secondary">{l.drugs.map(drugLabel).join(", ")}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        {q && <span className="font-medium text-admin-text">{koboToNaira(Number(q.amountKobo))}</span>}
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((x) => x.subOptionId !== l.subOptionId))}
                          aria-label={`Remove ${classificationLabel(l.classificationId)}`}
                          className="text-admin-text-secondary hover:text-admin-danger"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {available.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-admin-caption font-medium text-admin-text-secondary">
                    {lines.length === 0 ? "Select Primary Classification" : "Add another classification"}
                  </label>
                  <select
                    value={pick.classificationId}
                    onChange={(e) => chooseClassification(e.target.value)}
                    className="w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
                  >
                    <option value="">Select from compliant dropdown...</option>
                    {available.map((c) => (
                      <option key={c.id} value={c.id}>{c.name.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>

                {pickClassification && pickOptions.length > 1 && (
                  <div>
                    <label className="mb-1 block text-admin-caption font-medium text-admin-text-secondary">Type</label>
                    <select
                      value={pick.subOptionId}
                      onChange={(e) => setPick((p) => ({ ...p, subOptionId: e.target.value }))}
                      className="w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
                    >
                      {pickOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {isDrugAdministration && (
                  <div>
                    <label className="mb-1 block text-admin-caption font-medium text-admin-text-secondary">
                      Drugs administered ({pick.drugs.length} selected) — covered by the flat fee
                    </label>
                    <input
                      value={drugQuery}
                      onChange={(e) => setDrugQuery(e.target.value)}
                      placeholder="Search drugs…"
                      className="mb-2 w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
                    />
                    <ul className="max-h-44 space-y-1 overflow-y-auto rounded-admin-sm border border-admin-border p-2">
                      {visibleDrugs.length === 0 && <li className="px-1 text-admin-caption text-admin-text-secondary">No drugs found</li>}
                      {visibleDrugs.map((d) => {
                        const chosen = pick.drugs.find((x) => x.drugId === d.id);
                        return (
                          <li key={d.id} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-admin-card-alt">
                            <label className="flex flex-1 cursor-pointer items-center gap-2 text-admin-body-sm">
                              <input type="checkbox" checked={!!chosen} onChange={() => toggleDrug(d.id)} />
                              <span>{d.name} <span className="text-admin-text-secondary">{d.strength}</span></span>
                            </label>
                            {chosen && (
                              <label className="flex items-center gap-1 text-admin-caption text-admin-text-secondary">
                                Qty
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={chosen.quantity}
                                  onChange={(e) => setDrugQuantity(d.id, Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                                  aria-label={`Quantity of ${d.name} ${d.strength}`}
                                  className="w-16 rounded-admin-sm border border-admin-border px-2 py-1 text-admin-body-sm text-admin-text"
                                />
                              </label>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <Button
                  type="button"
                  onClick={addService}
                  disabled={!pick.classificationId || !pick.subOptionId}
                  className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90"
                >
                  <Plus className="size-4" aria-hidden="true" /> Add service
                </Button>
              </div>
            ) : (
              <p className="text-admin-caption text-admin-text-secondary">Every available classification has been added.</p>
            )}

            {lines.length > 0 && (
              <button type="button" onClick={() => setEditingStep(null)} className="mt-3 text-admin-caption font-medium text-admin-sidebar-cta hover:underline">
                Continue to facility
              </button>
            )}
            {quoteError && <p role="alert" className="mt-2 text-admin-caption text-admin-danger">{quoteError}</p>}
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
                : "The services could not be priced. Check the message under Service Classification."}
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
                {quote && (
                  <Badge variant={quote.isSubscriber ? "success" : "neutral"}>{quote.isSubscriber ? "Subscriber rate" : "Standard rate"}</Badge>
                )}
                <div className="space-y-1.5 border-t border-admin-border pt-3 text-admin-body-sm">
                  {!quote && <p className="text-admin-text-secondary/50">Services Pending...</p>}
                  {quote?.lines.map((l) => (
                    <div key={l.subOptionId}>
                      <div className="flex justify-between gap-3">
                        <span className="text-admin-text-secondary">{l.description}</span>
                        <span className="font-medium text-admin-text">{koboToNaira(Number(l.amountKobo))}</span>
                      </div>
                      {l.drugs.length > 0 && <p className="text-admin-caption text-admin-text-secondary">{l.drugs.map(drugLabel).join(", ")}</p>}
                    </div>
                  ))}
                </div>
                <div className="flex items-baseline justify-between border-t border-admin-border pt-3">
                  <span className="text-admin-body-sm font-semibold text-admin-text">Total</span>
                  <span className="text-2xl font-bold text-admin-sidebar-cta">{koboToNaira(quote ? Number(quote.totalKobo) : 0)}</span>
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
                  {allComplete ? "Flat fees from the OncoFlow price list." : "Complete all steps to unlock submission."}
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
