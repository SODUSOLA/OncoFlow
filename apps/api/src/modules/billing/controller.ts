import type { Request, Response } from "express";
import { resolveScopeOrDeny } from "../../lib/facility-scope.js";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { userHasPermission } from "../../lib/rbac.js";
import { InvoiceService } from "./service.js";
import { InvoiceRepository, InvoiceItemRepository, ServiceClassificationRepository, WalletTransactionRepository, TariffRepository } from "./repository.js";
import { Invoice, InvoiceItem } from "./entities/Invoice.js";
import { ServiceClassification, Tariff } from "./entities/ServiceClassification.js";
import { WalletTransaction } from "./entities/WalletTransaction.js";
// Cross-module read (same pattern as clinical/documents controllers) — needed to check
// "is this invoice's/query's patientId the caller's own patient record" (Patient role spec:
// "can pay own invoices... cannot generate or edit invoices") before falling back to the
// staff-level invoice:read/update grant.
import { PatientRepository, WalletRepository } from "../patient/index.js";

const invoiceSvc = new InvoiceService();
const invoiceRepo = new InvoiceRepository();
const invoiceItemRepo = new InvoiceItemRepository();
const classificationRepo = new ServiceClassificationRepository();
const tariffRepo = new TariffRepository();
const walletTransactionRepo = new WalletTransactionRepository();
const patientRepo = new PatientRepository();
const walletRepo = new WalletRepository();

async function callerOwnsPatient(callerId: string, patientId: string): Promise<boolean> {
  const patientRow = await patientRepo.findById(patientId);
  return !!patientRow?.userId && patientRow.userId === callerId;
}

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

export async function getInvoiceHandler(req: Request, res: Response) {
  try {
    const row = await invoiceRepo.findById(String(req.params.id));
    if (!row) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = await callerOwnsPatient(callerId, row.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "invoice", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const entity = new Invoice(row);
    const items = await invoiceItemRepo.findByInvoice(row.id);
    res.json({ invoice: { ...entity.toJSON(), items: items.map((item) => new InvoiceItem(item).toJSON()) } });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function listInvoicesHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const facilityId = typeof req.query.facilityId === "string" ? req.query.facilityId : undefined;
    if (!patientId && !facilityId) {
      res.status(400).json({ error: "Provide patientId or facilityId query parameter" });
      return;
    }

    const callerId = (req as AuthenticatedRequest).userId;
    if (patientId) {
      // Own-invoices path: ownership alone is enough, no blanket invoice:read needed.
      const isSelf = await callerOwnsPatient(callerId, patientId);
      if (!isSelf && !(await userHasPermission(callerId, "invoice", "read"))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    } else if (!(await userHasPermission(callerId, "invoice", "read"))) {
      // facilityId path is inherently a staff/facility-wide query — no "self" concept applies.
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    let invoices;
    if (patientId) {
      invoices = await invoiceRepo.findByPatient(patientId);
    } else {
      // `?facilityId` is client-supplied and untrusted: narrow it against what this caller may
      // actually see rather than querying it directly. Previously `?facilityId=all` returned
      // every invoice on the platform, and an explicit id let one facility's staff read another
      // facility's billing — the same IDOR already fixed on patient search.
      const scope = await resolveScopeOrDeny(req, res, "invoice");
      if (!scope) return;
      invoices = scope.kind === "unrestricted"
        ? await invoiceRepo.findAll()
        : await invoiceRepo.findByFacilityIds(scope.facilityIds);
    }
    res.json({ invoices: invoices.map((r) => new Invoice(r).toJSON()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function sendInvoiceHandler(req: Request, res: Response) {
  try {
    const result = await invoiceSvc.sendInvoice(String(req.params.id));
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(400).json({ error: message });
  }
}

// Patient role spec: "can pay own invoices from wallet" — no blanket invoice:update grant
// needed for this, only ownership. Staff paying on a patient's behalf still needs the permission.
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

export async function voidInvoiceHandler(req: Request, res: Response) {
  try {
    const result = await invoiceSvc.voidInvoice(String(req.params.id));
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(400).json({ error: message });
  }
}

// Feeds the dashboard Invoice Generator's per-classification fee breakdown preview (Network/
// Facility/Professional/Drug sections) before an invoice is actually created — staff-only,
// no ownership concept applies to a tariff the way it does to a specific patient's invoice.
export async function listTariffsHandler(req: Request, res: Response) {
  try {
    const facilityId = typeof req.query.facilityId === "string" ? req.query.facilityId : undefined;
    if (!facilityId) {
      res.status(400).json({ error: "facilityId query parameter required" });
      return;
    }
    // Tariffs are per-facility commercial terms, so reading another facility's is a real
    // disclosure — narrowed the same way as invoices above.
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

export async function listClassificationsHandler(_req: Request, res: Response) {
  try {
    const rows = await classificationRepo.findAll();
    res.json({ classifications: rows.map((row) => new ServiceClassification(row).toJSON()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// requireAuthenticated on the route: a patient reading their OWN wallet's ledger is a right,
// not a grant — same ownership-or-permission pattern as getWalletHandler in patient/controller.ts.
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
