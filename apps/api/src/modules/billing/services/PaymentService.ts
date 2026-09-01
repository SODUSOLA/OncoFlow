import crypto from "node:crypto";
import { db } from "../../../db/index.js";
import { payment, walletTransaction, invoice } from "../schema.js";
import { InvoiceRepository, InvoiceItemRepository } from "../repository.js";
import { Invoice, InvoiceItem } from "../entities/Invoice.js";
import { eq, sql } from "drizzle-orm";
import { wallet } from "../../../db/schema.js";
// Cross-module read, same pattern as billing/controller.ts's own PatientRepository import —
// needed for the patient's email once a payment succeeds (receipt) and nowhere else in this
// service.
import { PatientRepository } from "../../patient/index.js";
import { sendInvoiceReceipt } from "./EmailService.js";
// Cross-module — connects invoice payment to the 2PM-cutoff appointment categorization
// (handlePaymentEvent). Only relevant when the invoice is appointment-linked; a no-op call
// for anything else (side-effect reports, etc.) since handlePaymentEvent checks for a row.
import { AppointmentService } from "../../appointment/index.js";
import { notificationService } from "../../notification/index.js";

const invoiceRepo = new InvoiceRepository();
const invoiceItemRepo = new InvoiceItemRepository();
const patientRepo = new PatientRepository();
const appointmentService = new AppointmentService();

export class PaymentService {
  async processWebhookEvent(event: {
    eventType: string;
    reference: string;
    amountKobo: bigint;
    invoiceId: string;
  }): Promise<{ handled: boolean; duplicate: boolean }> {
    if (event.eventType !== "SUCCESSFUL_TRANSACTION") return { handled: false, duplicate: false };

    const result = await db.transaction(async (tx) => {
      const invoiceRows = await tx.select().from(invoice).where(eq(invoice.id, event.invoiceId)).limit(1);
      const invoiceRow = invoiceRows[0];
      if (!invoiceRow) {
        throw new Error("Invoice not found");
      }

      const walletRows = await tx.select().from(wallet).where(eq(wallet.patientId, invoiceRow.patientId)).limit(1);
      const walletRow = walletRows[0];
      if (!walletRow) {
        throw new Error("Wallet not found for patient");
      }

      const insertedPayments = await tx.insert(payment).values({
        id: crypto.randomUUID(),
        invoiceId: invoiceRow.id,
        walletId: walletRow.id,
        gateway: "MONNIFY",
        reference: event.reference,
        status: "SUCCESS",
        amountKobo: event.amountKobo,
      }).onConflictDoNothing().returning();

      if (insertedPayments.length === 0) {
        return { handled: true, duplicate: true };
      }

      const paymentRow = insertedPayments[0]!;
      await tx.insert(walletTransaction).values({
        id: crypto.randomUUID(),
        walletId: walletRow.id,
        paymentId: paymentRow.id,
        type: "CREDIT",
        amountKobo: event.amountKobo,
      });

      await tx.update(wallet).set({
        balanceKobo: sql`${wallet.balanceKobo} + ${event.amountKobo}`,
        updatedAt: new Date(),
      }).where(eq(wallet.id, walletRow.id));

      return { handled: true, duplicate: false };
    });

    return result;
  }

  async payInvoiceWithWallet(invoiceId: string) {
    const invRow = await invoiceRepo.findById(invoiceId);
    if (!invRow) throw new Error("Invoice not found");

    const entity = new Invoice(invRow);
    if (entity.status !== "SENT") {
      throw new Error("Only SENT invoices can be paid");
    }

    const result = await db.transaction(async (tx) => {
      const walletRows = await tx.select().from(wallet).where(eq(wallet.patientId, invRow.patientId)).limit(1);
      const walletRow = walletRows[0];
      if (!walletRow) {
        throw new Error("Wallet not found");
      }
      if (walletRow.balanceKobo < invRow.totalKobo) {
        throw new Error("Insufficient wallet balance");
      }

      const paymentRows = await tx.insert(payment).values({
        id: crypto.randomUUID(),
        invoiceId,
        walletId: walletRow.id,
        gateway: "WALLET",
        reference: `INV-${invoiceId}-${Date.now()}`,
        status: "SUCCESS",
        amountKobo: invRow.totalKobo,
      }).returning();
      const paymentRow = paymentRows[0]!;

      await tx.insert(walletTransaction).values({
        id: crypto.randomUUID(),
        walletId: walletRow.id,
        paymentId: paymentRow.id,
        type: "DEBIT",
        amountKobo: invRow.totalKobo,
      });

      await tx.update(wallet).set({
        balanceKobo: sql`${wallet.balanceKobo} - ${invRow.totalKobo}`,
        updatedAt: new Date(),
      }).where(eq(wallet.id, walletRow.id));

      const updatedInvoiceRows = await tx.update(invoice).set({
        status: "PAID",
        updatedAt: new Date(),
      }).where(eq(invoice.id, invoiceId)).returning();

      const updatedInvoice = updatedInvoiceRows[0] ?? { ...invRow, status: "PAID" };
      return { invoice: new Invoice(updatedInvoice).toJSON() };
    });

    // Fire-and-forget, outside the transaction — the payment itself already committed and must
    // never roll back because a receipt email failed to send. Logged, never re-thrown.
    void this.sendReceiptBestEffort(invoiceId, invRow.patientId, result.invoice).catch((err) => {
      console.error(`Receipt email failed for invoice ${invoiceId}:`, err);
    });

    void this.notifyPaidBestEffort(invRow.patientId).catch((err) => {
      console.error(`Invoice-paid notification failed for invoice ${invoiceId}:`, err);
    });

    // Same best-effort tolerance as the receipt email — a failure here is staff-recoverable
    // (they can manually confirm/reschedule), not a reason to undo a committed payment.
    if (invRow.appointmentId) {
      void appointmentService.handlePaymentEvent(invRow.appointmentId, new Date()).catch((err) => {
        console.error(`2PM-cutoff categorization failed for invoice ${invoiceId}:`, err);
      });
    }

    return result;
  }

  private async sendReceiptBestEffort(
    invoiceId: string,
    patientId: string,
    invoiceJSON: ReturnType<Invoice["toJSON"]>,
  ): Promise<void> {
    const patientRow = await patientRepo.findById(patientId);
    if (!patientRow?.email) return;
    const itemRows = await invoiceItemRepo.findByInvoice(invoiceId);
    const items = itemRows.map((row) => new InvoiceItem(row).toJSON());
    await sendInvoiceReceipt(patientRow.email, invoiceJSON, items);
  }

  private async notifyPaidBestEffort(patientId: string): Promise<void> {
    const patientRow = await patientRepo.findById(patientId);
    if (!patientRow?.userId) return;
    await notificationService.create({ recipientId: patientRow.userId, type: "INVOICE_PAID" });
  }
}
