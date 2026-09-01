import { Router } from "express";
import {
  createInvoiceHandler, getInvoiceHandler, listInvoicesHandler,
  sendInvoiceHandler, payInvoiceHandler, voidInvoiceHandler,
  listClassificationsHandler, listWalletTransactionsHandler, listTariffsHandler,
} from "./controller.js";
import { requirePermission, requireAuthenticated } from "../../lib/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../lib/validation.js";
import { z } from "zod";

const invoiceIdParamSchema = z.object({
  id: z.string().uuid(),
});

const createInvoiceSchema = z.object({
  patientId: z.string().uuid(),
  facilityId: z.string().uuid(),
  classificationId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
});

const listInvoicesQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  facilityId: z.union([z.string().uuid(), z.literal("all")]).optional(),
}).refine((value) => Boolean(value.patientId || value.facilityId), {
  message: "Provide patientId or facilityId query parameter",
});

const walletTransactionsQuerySchema = z.object({
  patientId: z.string().uuid(),
});

const listTariffsQuerySchema = z.object({
  facilityId: z.string().uuid(),
});

const router = Router();

// requireAuthenticated on read/pay: a patient reading or paying their OWN invoice is a right,
// not a grant — ownership-or-permission check lives in the controller (callerOwnsPatient).
// create/send/void stay staff-only — "cannot generate or edit invoices" is a hard rule.
router.post("/invoices", requirePermission("invoice", "create"), validateBody(createInvoiceSchema), createInvoiceHandler);
router.get("/invoices", requireAuthenticated(), validateQuery(listInvoicesQuerySchema), listInvoicesHandler);
router.get("/invoices/:id", requireAuthenticated(), validateParams(invoiceIdParamSchema), getInvoiceHandler);
router.post("/invoices/:id/send", requirePermission("invoice", "update"), validateParams(invoiceIdParamSchema), sendInvoiceHandler);
router.post("/invoices/:id/pay", requireAuthenticated(), validateParams(invoiceIdParamSchema), payInvoiceHandler);
router.post("/invoices/:id/void", requirePermission("invoice", "update"), validateParams(invoiceIdParamSchema), voidInvoiceHandler);
// Reference/lookup data (category names, not scoped to any one patient) — every authenticated
// user reasonably needs this to render invoice titles, same reasoning as the facility list.
router.get("/classifications", requireAuthenticated(), listClassificationsHandler);
// Staff-only fee-breakdown lookup for the Invoice Generator preview (tariff:read) — not a
// patient-facing endpoint, no ownership concept applies to a per-facility rate sheet.
router.get("/tariffs", requirePermission("tariff", "read"), validateQuery(listTariffsQuerySchema), listTariffsHandler);
router.get("/wallet/transactions", requireAuthenticated(), validateQuery(walletTransactionsQuerySchema), listWalletTransactionsHandler);

export { router as billingRoutes };
