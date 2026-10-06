"use client";

import { ChevronRight } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { INVOICE_STATUS_VARIANT, koboToNaira } from "@/lib/billing";
import type { Invoice } from "@/lib/types";

// The invoices still waiting to be paid; choosing one opens its full receipt.
export function PendingInvoicesDialog({
  open, invoices, serviceName, onClose, onSelect,
}: {
  open: boolean;
  invoices: Invoice[];
  serviceName: (classificationId: string) => string;
  onClose: () => void;
  onSelect: (invoice: Invoice) => void;
}) {
  const total = invoices.reduce((sum, inv) => sum + Number(inv.totalKobo), 0);
  return (
    <Dialog open={open} onClose={onClose} title="Pending Invoices">
      {invoices.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">You have no invoices waiting for payment.</p>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <button
                  onClick={() => onSelect(inv)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3 text-left hover:border-primary"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-neutral-900">{serviceName(inv.classificationId)}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {inv.issuedAt ? `Issued ${new Date(inv.issuedAt).toLocaleDateString()}` : "Not yet issued"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <p className="text-sm font-bold text-neutral-900">{koboToNaira(inv.totalKobo)}</p>
                      <Badge variant={INVOICE_STATUS_VARIANT[inv.status]} className="mt-0.5 px-2 py-0.5">{inv.status}</Badge>
                    </div>
                    <ChevronRight className="size-4 text-neutral-400" aria-hidden="true" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between rounded-lg bg-patient-bg px-4 py-3">
            <span className="text-sm font-bold text-neutral-900">TOTAL DUE</span>
            <span className="text-lg font-bold text-neutral-900">{koboToNaira(String(total))}</span>
          </div>
        </div>
      )}
    </Dialog>
  );
}
