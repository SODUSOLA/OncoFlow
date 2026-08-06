import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { PublicInquiryRepository, PublicInquiryMessageRepository } from "./repository.js";
import { PublicInquiry, PublicInquiryMessage } from "./entities/index.js";
import { generateAccessToken, hashAccessToken, verifyAccessToken } from "./service.js";
import { PatientRepository } from "../patient/index.js";

const inquiryRepo = new PublicInquiryRepository();
const messageRepo = new PublicInquiryMessageRepository();
const patientRepo = new PatientRepository();

// --- Visitor-facing (no session — access is proven by the per-inquiry token instead) ---

export async function createInquiryHandler(req: Request, res: Response) {
  try {
    const { name, email, phone, message } = req.body;
    const token = generateAccessToken();
    const inquiry = await inquiryRepo.create({
      name,
      email: email ?? null,
      phone: phone ?? null,
      accessTokenHash: hashAccessToken(token),
    });
    const firstMessage = await messageRepo.create({
      inquiryId: inquiry.id,
      senderType: "VISITOR",
      content: message,
    });
    res.status(201).json({
      inquiry: new PublicInquiry(inquiry).toVisitorJSON(),
      accessToken: token,
      message: new PublicInquiryMessage(firstMessage).toJSON(),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

async function loadInquiryForVisitor(id: string, token: unknown) {
  if (typeof token !== "string" || !token) return { error: 403 as const };
  const inquiry = await inquiryRepo.findById(id);
  if (!inquiry) return { error: 404 as const };
  if (!verifyAccessToken(token, inquiry.accessTokenHash)) return { error: 403 as const };
  return { inquiry };
}

export async function getVisitorMessagesHandler(req: Request, res: Response) {
  try {
    const result = await loadInquiryForVisitor(String(req.params.id), req.query.token);
    if (result.error) {
      res.status(result.error).json({ error: result.error === 404 ? "Inquiry not found" : "Forbidden" });
      return;
    }
    const rows = await messageRepo.findByInquiry(result.inquiry.id);
    res.json({
      inquiry: new PublicInquiry(result.inquiry).toVisitorJSON(),
      messages: rows.map((row) => new PublicInquiryMessage(row).toJSON()),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function postVisitorMessageHandler(req: Request, res: Response) {
  try {
    const { token, content } = req.body;
    const result = await loadInquiryForVisitor(String(req.params.id), token);
    if (result.error) {
      res.status(result.error).json({ error: result.error === 404 ? "Inquiry not found" : "Forbidden" });
      return;
    }
    // A visitor replying to a closed inquiry is a real follow-up, not noise — reopen it so it
    // resurfaces in staff's open queue instead of sitting silently in Closed.
    if (result.inquiry.status === "CLOSED") {
      await inquiryRepo.update(result.inquiry.id, { status: "OPEN" });
    } else {
      await inquiryRepo.update(result.inquiry.id, {});
    }
    const row = await messageRepo.create({ inquiryId: result.inquiry.id, senderType: "VISITOR", content });
    res.status(201).json({ message: new PublicInquiryMessage(row).toJSON() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// --- Staff-facing (requireAuthenticated + publicInquiry permission, enforced in routes.ts) ---

export async function listInquiriesHandler(req: Request, res: Response) {
  try {
    const rows = await inquiryRepo.findAll();
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const filtered = status ? rows.filter((row) => row.status === status) : rows;
    res.json({ inquiries: filtered.map((row) => new PublicInquiry(row).toJSON()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function listStaffMessagesHandler(req: Request, res: Response) {
  try {
    const inquiry = await inquiryRepo.findById(String(req.params.id));
    if (!inquiry) {
      res.status(404).json({ error: "Inquiry not found" });
      return;
    }
    const rows = await messageRepo.findByInquiry(inquiry.id);
    res.json({
      inquiry: new PublicInquiry(inquiry).toJSON(),
      messages: rows.map((row) => new PublicInquiryMessage(row).toJSON()),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function postStaffMessageHandler(req: Request, res: Response) {
  try {
    const inquiry = await inquiryRepo.findById(String(req.params.id));
    if (!inquiry) {
      res.status(404).json({ error: "Inquiry not found" });
      return;
    }
    const callerId = (req as AuthenticatedRequest).userId;
    const row = await messageRepo.create({
      inquiryId: inquiry.id,
      senderType: "STAFF",
      senderUserId: callerId,
      content: req.body.content,
    });
    // First staff reply claims the inquiry — lightweight ownership, not a hard assignment lock.
    if (!inquiry.assignedTo) {
      await inquiryRepo.update(inquiry.id, { assignedTo: callerId });
    } else {
      await inquiryRepo.update(inquiry.id, {});
    }
    res.status(201).json({ message: new PublicInquiryMessage(row).toJSON() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function linkInquiryToPatientHandler(req: Request, res: Response) {
  try {
    const inquiry = await inquiryRepo.findById(String(req.params.id));
    if (!inquiry) {
      res.status(404).json({ error: "Inquiry not found" });
      return;
    }
    const { patientId } = req.body;
    const patientRow = await patientRepo.findById(patientId);
    if (!patientRow) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }
    const updated = await inquiryRepo.update(inquiry.id, { linkedPatientId: patientId });
    res.json({ inquiry: new PublicInquiry(updated!).toJSON() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function closeInquiryHandler(req: Request, res: Response) {
  try {
    const inquiry = await inquiryRepo.findById(String(req.params.id));
    if (!inquiry) {
      res.status(404).json({ error: "Inquiry not found" });
      return;
    }
    const updated = await inquiryRepo.update(inquiry.id, { status: "CLOSED" });
    res.json({ inquiry: new PublicInquiry(updated!).toJSON() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
