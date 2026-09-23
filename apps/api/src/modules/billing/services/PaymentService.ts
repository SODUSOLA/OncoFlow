import crypto from "node:crypto";
import { db } from "../../../db/index.js";
import { payment, walletTransaction, invoice } from "../schema.js";
import { InvoiceRepository, InvoiceItemRepository } from "../repository.js";
import { Invoice, InvoiceItem } from "../entities/Invoice.js";
import { eq, sql } from "drizzle-orm";
import { wallet } from "../../../db/schema.js";
// Cross-module read of the patient's email, needed only to send the receipt after a payment succeeds.
import { PatientRepository } from "../../patient/index.js";
import { sendInvoiceReceipt } from "./EmailService.js";
// Cross-module link from invoice payment to the 2PM-cutoff appointment handling; a no-op for invoices without an appointment.
import { AppointmentService } from "../../appointment/index.js";
import { notificationService } from "../../notification/index.js";

const invoiceRepo = new InvoiceRepository();
const invoiceItemRepo = new InvoiceItemRepository();
const patientRepo = new PatientRepository();
const appointmentService = new AppointmentService();

// Processes payments: gateway webhooks and wallet payments.
export class PaymentService {
  // Handles a payment gateway webhook event, crediting the patient's wallet.
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

  // Pays an invoice from the patient's wallet in one transaction.
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

    // Fire-and-forget outside the transaction so a failed receipt email can't roll back a committed payment.
    void this.sendReceiptBestEffort(invoiceId, invRow.patientId, result.invoice).catch((err) => {
      console.error(`Receipt email failed for invoice ${invoiceId}:`, err);
    });

    void this.notifyPaidBestEffort(invRow.patientId).catch((err) => {
      console.error(`Invoice-paid notification failed for invoice ${invoiceId}:`, err);
    });

    // Best-effort: a failure is staff-recoverable and isn't a reason to undo a committed payment.
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

  // Sends the patient a paid notification, best-effort.
  private async notifyPaidBestEffort(patientId: string): Promise<void> {
    const patientRow = await patientRepo.findById(patientId);
    if (!patientRow?.userId) return;
    await notificationService.create({ recipientId: patientRow.userId, type: "INVOICE_PAID" });
  }
}
