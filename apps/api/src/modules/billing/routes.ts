import { Router } from "express";
import {
  createInvoiceHandler, getInvoiceHandler, listInvoicesHandler,
  sendInvoiceHandler, payInvoiceHandler, voidInvoiceHandler,
  listClassificationsHandler,
} from "./controller.js";
import { requirePermission } from "../../lib/rbac.js";
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
  facilityId: z.string().uuid().optional(),
}).refine((value) => Boolean(value.patientId || value.facilityId), {
  message: "Provide patientId or facilityId query parameter",
});

const router = Router();

router.post("/invoices", requirePermission("invoice", "create"), validateBody(createInvoiceSchema), createInvoiceHandler);
router.get("/invoices", requirePermission("invoice", "read"), validateQuery(listInvoicesQuerySchema), listInvoicesHandler);
router.get("/invoices/:id", requirePermission("invoice", "read"), validateParams(invoiceIdParamSchema), getInvoiceHandler);
router.post("/invoices/:id/send", requirePermission("invoice", "update"), validateParams(invoiceIdParamSchema), sendInvoiceHandler);
router.post("/invoices/:id/pay", requirePermission("invoice", "update"), validateParams(invoiceIdParamSchema), payInvoiceHandler);
router.post("/invoices/:id/void", requirePermission("invoice", "update"), validateParams(invoiceIdParamSchema), voidInvoiceHandler);
router.get("/classifications", requirePermission("serviceClassification", "read"), listClassificationsHandler);

export { router as billingRoutes };
