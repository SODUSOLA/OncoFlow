import type { Request, Response } from "express";
import { resolveScopeOrDeny } from "../../lib/facility-scope.js";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { userHasPermission } from "../../lib/rbac.js";
import { InvoiceService } from "./service.js";
import { InvoiceRepository, InvoiceItemRepository, ServiceClassificationRepository, WalletTransactionRepository, TariffRepository } from "./repository.js";
import { Invoice, InvoiceItem } from "./entities/Invoice.js";
import { ServiceClassification, Tariff } from "./entities/ServiceClassification.js";
import { WalletTransaction } from "./entities/WalletTransaction.js";
// Cross-module read to check whether an invoice's patient is the caller's own record before falling back to staff grants.
import { PatientRepository, WalletRepository } from "../patient/index.js";
import { SubscriptionService } from "./services/SubscriptionService.js";

const invoiceSvc = new InvoiceService();
const invoiceRepo = new InvoiceRepository();
const invoiceItemRepo = new InvoiceItemRepository();
const classificationRepo = new ServiceClassificationRepository();
const tariffRepo = new TariffRepository();
const walletTransactionRepo = new WalletTransactionRepository();
const patientRepo = new PatientRepository();
const walletRepo = new WalletRepository();
const subscriptionSvc = new SubscriptionService();

// True when the patient record belongs to the caller.
async function callerOwnsPatient(callerId: string, patientId: string): Promise<boolean> {
  const patientRow = await patientRepo.findById(patientId);
  return !!patientRow?.userId && patientRow.userId === callerId;
}

// Creates an invoice (staff-only).
export async function createInvoiceHandler(req: Request, res: Response) {
  try {
    const { patientId, facilityId, classificationId, appointmentId } = req.body;
    if (!patientId || !facilityId || !classificationId) {
      res.status(400).json({ error: "patientId, facilityId, classificationId required" });
      return;
    }
    const result = await invoiceSvc.createInvoice({ patientId, facilityId, classificationId, appointmentId });
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "No tariff found for this facility and classification combination" ? 400 : 500;
    res.status(status).json({ error: message });
  }
}

// Returns one invoice, allowed for its patient or staff with invoice:read.
export async function getInvoiceHandler(req: Request, res: Response) {
  try {
    const row = await invoiceRepo.findById(String(req.params.id));
    if (!row) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = await callerOwnsPatient(callerId, row.patientId);
    const isStaff = await userHasPermission(callerId, "invoice", "read");
    if (!isSelf && !isStaff) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    // A draft is staff work-in-progress; the patient first sees an invoice once it has been sent, so a draft looks like it doesn't exist to them.
    if (!isStaff && row.status === "DRAFT") {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const entity = new Invoice(row);
    const items = await invoiceItemRepo.findByInvoice(row.id);
    res.json({ invoice: { ...entity.toJSON(), items: items.map((item) => new InvoiceItem(item).toJSON()) } });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Lists invoices by patient (ownership or permission) or by facility scope.
export async function listInvoicesHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const facilityId = typeof req.query.facilityId === "string" ? req.query.facilityId : undefined;
    if (!patientId && !facilityId) {
      res.status(400).json({ error: "Provide patientId or facilityId query parameter" });
      return;
    }

    const callerId = (req as AuthenticatedRequest).userId;
    let hideDrafts = false;
    if (patientId) {
      // Own-invoices path: ownership alone is enough, no blanket invoice:read needed.
      const isSelf = await callerOwnsPatient(callerId, patientId);
      const isStaff = await userHasPermission(callerId, "invoice", "read");
      if (!isSelf && !isStaff) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      hideDrafts = !isStaff;
    } else if (!(await userHasPermission(callerId, "invoice", "read"))) {
      // facilityId path is inherently a staff/facility-wide query — no "self" concept applies.
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    let invoices;
    if (patientId) {
      invoices = await invoiceRepo.findByPatient(patientId);
    } else {
      // The client-supplied ?facilityId is narrowed to the caller's real scope, closing the IDOR where "all" or another facility's id leaked billing data.
      const scope = await resolveScopeOrDeny(req, res, "invoice");
      if (!scope) return;
      invoices = scope.kind === "unrestricted"
        ? await invoiceRepo.findAll()
        : await invoiceRepo.findByFacilityIds(scope.facilityIds);
    }
    res.json({ invoices: invoices.filter((r) => !hideDrafts || r.status !== "DRAFT").map((r) => new Invoice(r).toJSON()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Sends a draft invoice to the patient.
export async function sendInvoiceHandler(req: Request, res: Response) {
  try {
    const result = await invoiceSvc.sendInvoiceWithAutoDeduct(String(req.params.id));
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(400).json({ error: message });
  }
}

// Patients can pay their own invoices from their wallet with ownership alone; staff paying on their behalf need the permission.
export async function payInvoiceHandler(req: Request, res: Response) {
  try {
    const row = await invoiceRepo.findById(String(req.params.id));
    if (!row) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = await callerOwnsPatient(callerId, row.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "invoice", "update"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const result = await invoiceSvc.payInvoice(String(req.params.id));
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(400).json({ error: message });
  }
}

// Voids an invoice.
export async function voidInvoiceHandler(req: Request, res: Response) {
  try {
    const result = await invoiceSvc.voidInvoice(String(req.params.id));
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(400).json({ error: message });
  }
}

// Feeds the Invoice Generator's fee-breakdown preview; staff-only since a tariff has no patient owner.
export async function listTariffsHandler(req: Request, res: Response) {
  try {
    const facilityId = typeof req.query.facilityId === "string" ? req.query.facilityId : undefined;
    if (!facilityId) {
      res.status(400).json({ error: "facilityId query parameter required" });
      return;
    }
    // Tariffs are per-facility commercial terms, so they are narrowed to the caller's scope like invoices.
    const scope = await resolveScopeOrDeny(req, res, "tariff");
    if (!scope) return;
    const rows = scope.kind === "unrestricted"
      ? await tariffRepo.findByFacility(facilityId)
      : await tariffRepo.findByFacilityIds(scope.facilityIds);
    res.json({ tariffs: rows.map((row) => new Tariff(row).toJSON()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Lists the service classifications (reference data).
export async function listClassificationsHandler(_req: Request, res: Response) {
  try {
    const rows = await classificationRepo.findAll();
    res.json({ classifications: rows.map((row) => new ServiceClassification(row).toJSON()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Patients may read their own wallet ledger (ownership-or-permission), so the route only requires authentication.
export async function listWalletTransactionsHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    if (!patientId) {
      res.status(400).json({ error: "patientId query parameter required" });
      return;
    }

    const patientRow = await patientRepo.findById(patientId);
    if (!patientRow) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = patientRow.userId !== null && patientRow.userId === callerId;
    if (!isSelf && !(await userHasPermission(callerId, "wallet", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const walletRow = await walletRepo.findByPatient(patientId);
    if (!walletRow) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const rows = await walletTransactionRepo.findByWallet(walletRow.id);
    res.json({ transactions: rows.map((row) => new WalletTransaction(row).toJSON()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Returns the caller's own membership state and the term prices.
export async function getSubscriptionHandler(req: Request, res: Response) {
  try {
    const patientRow = await patientRepo.findByUserId((req as AuthenticatedRequest).userId);
    if (!patientRow) {
      res.status(404).json({ error: "No patient record is linked to this account" });
      return;
    }
    res.json(await subscriptionSvc.current(patientRow.id));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Subscribes or renews the caller's own membership from their wallet; an uncovered fee returns 402 with the unpaid invoice.
export async function subscribeHandler(req: Request, res: Response) {
  try {
    const patientRow = await patientRepo.findByUserId((req as AuthenticatedRequest).userId);
    if (!patientRow) {
      res.status(404).json({ error: "No patient record is linked to this account" });
      return;
    }
    const result = await subscriptionSvc.subscribe(patientRow.id, req.body.billingCycle);
    if (!result.paid) {
      res.status(402).json({ error: "Insufficient wallet balance", invoice: result.invoice });
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
}
