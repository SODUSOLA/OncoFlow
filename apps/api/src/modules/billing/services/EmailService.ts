import { enqueueEmail } from "../../../lib/email-queue.js";
import type { Invoice, InvoiceItem } from "../entities/Invoice.js";

const COMPONENT_LABELS: Record<string, string> = {
  NETWORK_FEE: "Network Fee",
  FACILITY_FEE: "Hospital Facility Fee",
  PROFESSIONAL_FEE: "Professional Fee",
  DRUG_COST: "Medication & Consumables",
};

function koboToNaira(kobo: string): string {
  const naira = Number(kobo) / 100;
  return `₦${naira.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

export async function sendInvoiceReceipt(
  patientEmail: string,
  invoice: ReturnType<Invoice["toJSON"]>,
  items: ReturnType<InvoiceItem["toJSON"]>[],
): Promise<void> {
  const rows = items
    .map((item) => `<tr><td>${COMPONENT_LABELS[item.component] ?? item.component}</td><td style="text-align:right">${koboToNaira(item.amountKobo)}</td></tr>`)
    .join("");

  const html = `
    <h2>Payment Receipt</h2>
    <p>Thank you — your payment for invoice ${invoice.id.slice(0, 8)} was received.</p>
    <table style="width:100%;border-collapse:collapse" cellpadding="6">
      ${rows}
      <tr style="font-weight:bold;border-top:1px solid #ccc"><td>Total</td><td style="text-align:right">${koboToNaira(invoice.totalKobo)}</td></tr>
    </table>
  `;

  await enqueueEmail(patientEmail, "OncoFlow — Payment Receipt", html);
}
