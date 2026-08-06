import { Router } from "express";
import { z } from "zod";
import {
  createInquiryHandler, getVisitorMessagesHandler, postVisitorMessageHandler,
  listInquiriesHandler, listStaffMessagesHandler, postStaffMessageHandler,
  linkInquiryToPatientHandler, closeInquiryHandler,
} from "./controller.js";
import { requirePermission } from "../../lib/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../lib/validation.js";

const inquiryIdParamSchema = z.object({ id: z.string().uuid() });

const createInquirySchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().min(1).max(32).optional(),
  message: z.string().trim().min(1).max(4000),
}).refine((value) => Boolean(value.email || value.phone), {
  message: "Provide an email or phone number so we can follow up",
});

const visitorMessageSchema = z.object({
  token: z.string().trim().min(1),
  content: z.string().trim().min(1).max(4000),
});

const visitorMessagesQuerySchema = z.object({
  token: z.string().trim().min(1),
});

const staffMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

const linkPatientSchema = z.object({
  patientId: z.string().uuid(),
});

const listInquiriesQuerySchema = z.object({
  status: z.enum(["OPEN", "CLOSED"]).optional(),
});

const router = Router();

// Public — no session. A visitor's only credential is the per-inquiry token issued at creation.
router.post("/public-inquiries", validateBody(createInquirySchema), createInquiryHandler);
router.get(
  "/public-inquiries/:id/messages",
  validateParams(inquiryIdParamSchema),
  validateQuery(visitorMessagesQuerySchema),
  getVisitorMessagesHandler,
);
router.post(
  "/public-inquiries/:id/messages",
  validateParams(inquiryIdParamSchema),
  validateBody(visitorMessageSchema),
  postVisitorMessageHandler,
);

// Staff — session + a real permission grant, not ownership (there's no "own" inquiry to own).
router.get(
  "/admin/inquiries",
  requirePermission("publicInquiry", "read"),
  validateQuery(listInquiriesQuerySchema),
  listInquiriesHandler,
);
router.get(
  "/admin/inquiries/:id/messages",
  requirePermission("publicInquiry", "read"),
  validateParams(inquiryIdParamSchema),
  listStaffMessagesHandler,
);
router.post(
  "/admin/inquiries/:id/messages",
  requirePermission("publicInquiry", "update"),
  validateParams(inquiryIdParamSchema),
  validateBody(staffMessageSchema),
  postStaffMessageHandler,
);
router.post(
  "/admin/inquiries/:id/link",
  requirePermission("publicInquiry", "update"),
  validateParams(inquiryIdParamSchema),
  validateBody(linkPatientSchema),
  linkInquiryToPatientHandler,
);
router.post(
  "/admin/inquiries/:id/close",
  requirePermission("publicInquiry", "update"),
  validateParams(inquiryIdParamSchema),
  closeInquiryHandler,
);

export { router as inquiryRoutes };
