"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ShieldCheck, Plus, CircleAlert, CircleX, CircleCheck, RotateCw, ArrowLeft, ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { BalanceAmount } from "@/components/patient/BalanceAmount";
import { api } from "@/lib/api";
import { useMyPatient } from "@/lib/useMyPatient";
import type { Invoice, InvoiceComponent, InvoiceStatus, ServiceClassification } from "@/lib/types";

const STATUS_VARIANT: Record<InvoiceStatus, "default" | "success" | "warning" | "critical"> = {
  DRAFT: "default",
  SENT: "warning",
  PAID: "success",
  VOID: "default",
  OVERDUE: "critical",
};

const COMPONENT_LABELS: Record<InvoiceComponent, string> = {
  NETWORK_FEE: "Network fee",
  FACILITY_FEE: "Facility fee",
  PROFESSIONAL_FEE: "Professional fee",
  DRUG_COST: "Drug cost",
};

const CLASSIFICATION_LABELS: Record<ServiceClassification["name"], string> = {
  SUBSCRIPTION: "Subscription",
  CONSULTATION: "Clinical Consultation",
  DRUG_ADMINISTRATION: "Drug Administration",
  CHEMOTHERAPY: "Chemotherapy Session",
  GENERAL_ADMISSION: "General Admission",
  PROCEDURE: "Procedure",
  SIDE_EFFECT_REPORT: "Side Effect Report",
};

function koboToNaira(kobo: string) {
  return `₦${(Number(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

type View = "list" | "insufficient" | "unsuccessful" | "verified";

export default function WalletPage() {
  const { patient, wallet, loading: patientLoading, notLinked, reload } = useMyPatient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [classifications, setClassifications] = useState<ServiceClassification[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    if (!patient) return;
    const [listRes, classRes] = await Promise.all([
      api.get<{ invoices: Invoice[] }>(`/invoices?patientId=${patient.id}`).catch(() => ({ invoices: [] })),
      api.get<{ classifications: ServiceClassification[] }>("/classifications").catch(() => ({ classifications: [] })),
    ]);
    setClassifications(classRes.classifications);
    const withItems = await Promise.all(
      listRes.invoices.map(async (inv) => {
        try {
          const detail = await api.get<{ invoice: Invoice }>(`/invoices/${inv.id}`);
          return detail.invoice;
        } catch {
          return inv;
        }
      })
    );
    setInvoices(withItems);
  }, [patient]);

  useEffect(() => {
    (async () => {
      await loadInvoices();
      setLoading(false);
    })();
  }, [loadInvoices]);

  function classificationName(classificationId: string) {
    const found = classifications.find((c) => c.id === classificationId);
    return found ? CLASSIFICATION_LABELS[found.name] : "Invoice";
  }

  async function handlePay(invoice: Invoice) {
    setActiveInvoice(invoice);
    setPaying(true);
    setPayError(null);
    try {
      await api.post(`/invoices/${invoice.id}/pay`);
      await loadInvoices();
      await reload();
      setActiveInvoice(invoice);
      setView("verified");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment failed";
      if (message.toLowerCase().includes("insufficient")) {
        setView("insufficient");
      } else {
        setPayError(message);
        setView("unsuccessful");
      }
    } finally {
      setPaying(false);
    }
  }

  async function retryPayment() {
    if (activeInvoice) await handlePay(activeInvoice);
  }

  function backToWallet() {
    setView("list");
    setActiveInvoice(null);
    setPayError(null);
  }

  if (patientLoading || loading) {
    return <p className="p-6 text-center text-sm text-neutral-400">Loading your wallet…</p>;
  }

  if (notLinked || !patient) {
    return (
      <div className="p-4">
        <Card className="text-center text-sm text-neutral-600">
          Your wallet becomes available once your care team confirms your patient record.
        </Card>
      </div>
    );
  }

  const pendingInvoices = invoices.filter((inv) => inv.status === "SENT" || inv.status === "OVERDUE");
  const paidInvoices = invoices.filter((inv) => inv.status === "PAID");
  const lastPayment = paidInvoices[0];
  const balanceKobo = wallet?.balanceKobo ?? "0";

  if (view === "insufficient" && activeInvoice) {
    const shortfall = Number(activeInvoice.totalKobo) - Number(balanceKobo);
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <button onClick={backToWallet} aria-label="Back to Wallet"><ArrowLeft className="size-5 text-neutral-500" /></button>
          <h1 className="text-lg font-bold text-neutral-900">Wallet</h1>
        </div>
        <div className="rounded-2xl border border-critical/30 bg-critical-bg p-6 text-center">
          <div className="mx-auto flex size-13 items-center justify-center rounded-xl bg-critical text-white">
            <CircleAlert className="size-6" aria-hidden="true" />
          </div>
          <h2 className="mt-3.5 text-lg font-bold text-critical">Insufficient Balance</h2>
          <p className="mt-2 text-sm leading-relaxed text-critical/80">
            Your current balance is <b>{koboToNaira(balanceKobo)}</b>, which is less than the invoice amount of{" "}
            <b>{koboToNaira(activeInvoice.totalKobo)}</b>.
          </p>
        </div>
        <Card>
          <div className="mb-3 flex justify-between">
            <div>
              <p className="text-xs text-neutral-500">Available Funds</p>
              <p className="text-lg font-bold text-neutral-900">{koboToNaira(balanceKobo)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-neutral-500">Shortfall</p>
              <p className="text-lg font-bold text-critical">-{koboToNaira(String(shortfall))}</p>
            </div>
          </div>
          <Button className="w-full" disabled>
            <Plus className="size-4" aria-hidden="true" /> Top Up Balance
          </Button>
          <p className="mt-2 text-center text-xs text-neutral-500">
            Top-up isn&apos;t connected to a payment provider yet — this button is a placeholder.
          </p>
        </Card>
        <Card>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wide text-neutral-500">INVOICE DETAILS</span>
            <Badge variant="warning">{activeInvoice.status}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-800">{classificationName(activeInvoice.classificationId)}</span>
            <span className="text-base font-bold text-neutral-900">{koboToNaira(activeInvoice.totalKobo)}</span>
          </div>
        </Card>
      </div>
    );
  }

  if (view === "unsuccessful" && activeInvoice) {
    return (
      <div className="space-y-4 p-4 text-center">
        <div className="mx-auto flex size-15 items-center justify-center rounded-xl bg-critical-bg text-critical">
          <CircleX className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-neutral-900">Payment Unsuccessful</h1>
        <p className="text-sm leading-relaxed text-neutral-500">
          {payError ?? "A technical error occurred while processing your request."} No funds have been deducted.
        </p>
        <Button className="w-full" onClick={retryPayment} loading={paying}>
          <RotateCw className="size-4" aria-hidden="true" /> Retry Payment
        </Button>
        <Button variant="outline" className="w-full" onClick={backToWallet}>
          Back to Wallet
        </Button>
        <Card className="text-left">
          <p className="mb-2.5 text-[11px] font-bold tracking-wide text-neutral-500">TRANSACTION CONTEXT</p>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Invoice</span>
            <span className="font-semibold text-neutral-900">{classificationName(activeInvoice.classificationId)}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-neutral-500">Total Amount</span>
            <span className="font-bold text-neutral-900">{koboToNaira(activeInvoice.totalKobo)}</span>
          </div>
        </Card>
      </div>
    );
  }

  if (view === "verified" && activeInvoice) {
    return (
      <div className="space-y-4 p-4 text-center">
        <div className="mx-auto flex size-15 items-center justify-center rounded-xl bg-teal-bg text-teal">
          <CircleCheck className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-neutral-900">Transaction Verified</h1>
        <p className="text-sm text-neutral-500">Clinical payment successfully processed and logged.</p>
        <Card className="space-y-3 text-left">
          <div className="flex justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-wide text-neutral-400">INVOICE</p>
              <p className="font-mono text-sm font-semibold text-neutral-900">{classificationName(activeInvoice.classificationId)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold tracking-wide text-neutral-400">DATE</p>
              <p className="font-mono text-sm font-semibold text-neutral-900">{new Date().toLocaleDateString()}</p>
            </div>
          </div>
          <div className="border-t border-dashed border-neutral-200 pt-3">
            <p className="mb-2 text-[11px] font-bold tracking-wide text-neutral-400">BILLING DETAILS</p>
            {(activeInvoice.items ?? []).map((item) => (
              <div key={item.id} className="flex justify-between py-1 text-sm">
                <span className="text-neutral-600">{COMPONENT_LABELS[item.component]}</span>
                <span className="font-semibold text-neutral-900">{koboToNaira(item.amountKobo)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-patient-bg px-4 py-3">
            <span className="text-sm font-bold text-neutral-900">TOTAL PAID</span>
            <span className="text-lg font-bold text-neutral-900">{koboToNaira(activeInvoice.totalKobo)}</span>
          </div>
        </Card>
        <Button className="w-full" onClick={backToWallet}>
          Back to Wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="font-display text-xl font-bold text-primary">Wallet</h1>

      <Card>
        <p className="text-sm font-medium text-neutral-500">Available Wallet Balance</p>
        <p className="my-1 font-display text-2xl font-bold text-neutral-900">
          <BalanceAmount balanceKobo={balanceKobo} />
        </p>
        <p className="mb-3.5 flex items-center gap-1 text-xs font-semibold text-teal">
          <ShieldCheck className="size-3.5" aria-hidden="true" /> Verified &amp; Secure Funds
        </p>
        <div className="flex gap-2">
          <Button className="min-w-0 flex-1" size="sm" disabled>
            <Plus className="size-4 shrink-0" aria-hidden="true" /> <span className="truncate">Top Up Balance</span>
          </Button>
          <Button variant="outline" className="min-w-0 flex-1" size="sm" disabled>
            <span className="truncate">Manage Methods</span>
          </Button>
        </div>

        {/* The ledger was reachable only from the home screen, so anyone who navigated straight
            to Wallet — the obvious place to look for it — had no way through. */}
        <Link
          href="/wallet/transactions"
          className="mt-3.5 flex items-center justify-between border-t border-neutral-200 pt-3.5 text-sm font-semibold text-primary"
        >
          Transaction History
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </Card>

      <div className="flex gap-3">
        <div className="flex-1 rounded-xl bg-critical-bg p-3.5">
          <p className="text-xs text-critical/70">Pending Invoices</p>
          <p className="text-base font-bold text-neutral-900">{pendingInvoices.length} Items</p>
        </div>
        <div className="flex-1 rounded-xl bg-amber-bg p-3.5">
          <p className="text-xs text-amber-text">Last Payment</p>
          <p className="text-base font-bold text-neutral-900">
            {lastPayment?.issuedAt ? new Date(lastPayment.issuedAt).toLocaleDateString() : "—"}
          </p>
        </div>
      </div>

      <h2 className="text-base font-bold text-neutral-900">Invoices &amp; Billing</h2>

      {invoices.length === 0 ? (
        <Card className="text-center text-sm text-neutral-400">No invoices yet</Card>
      ) : (
        <ul className="space-y-3">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Card className="p-3.5">
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">{classificationName(invoice.classificationId)}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {invoice.issuedAt ? `Issued ${new Date(invoice.issuedAt).toLocaleDateString()}` : "Not yet issued"}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[invoice.status]}>{invoice.status}</Badge>
                </div>
                <p className="mb-2.5 text-xl font-bold text-neutral-900">{koboToNaira(invoice.totalKobo)}</p>
                {invoice.items && invoice.items.length > 0 && (
                  <div className="mb-2.5 space-y-1 rounded-lg bg-patient-bg p-3">
                    {invoice.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-xs">
                        <span className="text-neutral-500">{COMPONENT_LABELS[item.component]}</span>
                        <span className="font-medium text-neutral-700">{koboToNaira(item.amountKobo)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(invoice.status === "SENT" || invoice.status === "OVERDUE") && (
                  <Button className="w-full" size="sm" onClick={() => handlePay(invoice)} loading={paying && activeInvoice?.id === invoice.id}>
                    Confirm and Pay
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="bg-primary text-white">
        <p className="mb-2 text-base font-bold">Automatic Payments</p>
        <p className="text-sm leading-relaxed text-white/70">
          Enable safe, friction-free billing to ensure your care plan is never interrupted by administrative delays.
        </p>
      </Card>
    </div>
  );
}
