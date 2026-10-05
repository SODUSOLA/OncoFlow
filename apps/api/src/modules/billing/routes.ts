import { Router } from "express";
import {
  createInvoiceHandler, getInvoiceHandler, listInvoicesHandler,
  sendInvoiceHandler, payInvoiceHandler, voidInvoiceHandler,
  listClassificationsHandler, listWalletTransactionsHandler, listTariffsHandler,
  getSubscriptionHandler, subscribeHandler,
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

const subscribeSchema = z.object({ billingCycle: z.enum(["MONTHLY", "YEARLY"]) });

const router = Router();

// Read and pay require only authentication (ownership check in the controller); create, send and void stay staff-only.
router.post("/invoices", requirePermission("invoice", "create"), validateBody(createInvoiceSchema), createInvoiceHandler);
// Lists invoices (own for patients, scoped for staff).
router.get("/invoices", requireAuthenticated(), validateQuery(listInvoicesQuerySchema), listInvoicesHandler);
// Reads one invoice.
router.get("/invoices/:id", requireAuthenticated(), validateParams(invoiceIdParamSchema), getInvoiceHandler);
// Sends a draft invoice to the patient.
router.post("/invoices/:id/send", requirePermission("invoice", "update"), validateParams(invoiceIdParamSchema), sendInvoiceHandler);
// Pays an invoice from the wallet.
router.post("/invoices/:id/pay", requireAuthenticated(), validateParams(invoiceIdParamSchema), payInvoiceHandler);
// Voids an invoice.
router.post("/invoices/:id/void", requirePermission("invoice", "update"), validateParams(invoiceIdParamSchema), voidInvoiceHandler);
// Reference data any authenticated user needs to render invoice titles.
router.get("/classifications", requireAuthenticated(), listClassificationsHandler);
// Staff-only fee-breakdown lookup for the Invoice Generator preview.
router.get("/tariffs", requirePermission("tariff", "read"), validateQuery(listTariffsQuerySchema), listTariffsHandler);
// Lists wallet transactions (own for patients).
router.get("/wallet/transactions", requireAuthenticated(), validateQuery(walletTransactionsQuerySchema), listWalletTransactionsHandler);

// Membership is a patient's own account, so these need a session rather than a grant; handlers only ever touch the caller's record.
router.get("/subscription", requireAuthenticated(), getSubscriptionHandler);
router.post("/subscription", requireAuthenticated(), validateBody(subscribeSchema), subscribeHandler);

export { router as billingRoutes };
