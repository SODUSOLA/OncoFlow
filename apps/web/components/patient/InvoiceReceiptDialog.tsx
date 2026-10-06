"use client";

import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { COMPONENT_LABELS, INVOICE_STATUS_VARIANT, koboToNaira } from "@/lib/billing";
import type { Invoice } from "@/lib/types";

const dateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-900">{value}</span>
    </div>
  );
}

// A full receipt for one invoice: who and where, when it was created, issued and paid, every billed service
// (with drugs and quantities) and the fee breakdown. Unpaid invoices can be paid straight from it.
export function InvoiceReceiptDialog({
  invoice, serviceName, onClose, onPay, paying,
}: {
  invoice: Invoice | null;
  serviceName: (classificationId: string) => string;
  onClose: () => void;
  onPay?: (invoice: Invoice) => void;
  paying?: boolean;
}) {
  const payable = invoice && (invoice.status === "SENT" || invoice.status === "OVERDUE");
  const lines = invoice?.lines ?? [];

  return (
    <Dialog open={!!invoice} onClose={onClose} title={invoice ? serviceName(invoice.classificationId) : "Invoice"}>
      {invoice && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-semibold text-neutral-500">INVOICE {invoice.id.slice(0, 8).toUpperCase()}</p>
            <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>{invoice.status}</Badge>
          </div>

          <div className="divide-y divide-dashed divide-neutral-200 rounded-xl bg-patient-bg px-4 py-2">
            <div className="py-1">
              {invoice.createdAt && <Row label="Created" value={dateTime(invoice.createdAt)} />}
              <Row label="Issued (sent to you)" value={invoice.issuedAt ? dateTime(invoice.issuedAt) : "Not yet issued"} />
              {invoice.payment && <Row label="Paid" value={dateTime(invoice.payment.paidAt)} />}
            </div>
            <div className="py-1">
              <Row label="Facility" value={invoice.facilityName ?? "—"} />
              {invoice.payment && <Row label="Payment reference" value={invoice.payment.reference} />}
            </div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-bold tracking-wide text-neutral-400">SERVICES</p>
            {lines.length > 0 ? (
              <ul className="divide-y divide-neutral-100">
                {lines.map((line) => (
                  <li key={line.id} className="py-2">
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="font-medium text-neutral-900">{serviceName(line.classificationId)} · {line.description}</span>
                      <span className="shrink-0 font-semibold text-neutral-900">{koboToNaira(line.amountKobo)}</span>
                    </div>
                    {line.drugs.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-3 text-xs text-neutral-500">
                        {line.drugs.map((d) => (
                          <li key={d.id} className="flex justify-between gap-4">
                            <span>{d.name} {d.strength}</span>
                            <span>× {d.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex justify-between gap-4 py-1 text-sm">
                <span className="font-medium text-neutral-900">{serviceName(invoice.classificationId)}</span>
                <span className="font-semibold text-neutral-900">{koboToNaira(invoice.totalKobo)}</span>
              </div>
            )}
          </div>

          {invoice.items && invoice.items.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-bold tracking-wide text-neutral-400">FEE BREAKDOWN</p>
              {invoice.items.map((item) => (
                <Row key={item.id} label={COMPONENT_LABELS[item.component]} value={koboToNaira(item.amountKobo)} />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg bg-patient-bg px-4 py-3">
            <span className="text-sm font-bold text-neutral-900">{invoice.status === "PAID" ? "TOTAL PAID" : "TOTAL"}</span>
            <span className="text-lg font-bold text-neutral-900">{koboToNaira(invoice.totalKobo)}</span>
          </div>

          {payable && onPay && (
            <Button className="w-full" onClick={() => onPay(invoice)} loading={paying}>Confirm and Pay</Button>
          )}
        </div>
      )}
    </Dialog>
  );
}
