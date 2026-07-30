import type { Request, Response } from "express";
import { InvoiceService } from "./service.js";
import { InvoiceRepository, ServiceClassificationRepository } from "./repository.js";
import { Invoice } from "./entities/Invoice.js";
import { ServiceClassification } from "./entities/ServiceClassification.js";

const invoiceSvc = new InvoiceService();
const invoiceRepo = new InvoiceRepository();
const classificationRepo = new ServiceClassificationRepository();

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
    const entity = new Invoice(row);
    res.json({ invoice: entity.toJSON() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function listInvoicesHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const facilityId = typeof req.query.facilityId === "string" ? req.query.facilityId : undefined;
    let invoices;
    if (patientId) {
      invoices = await invoiceRepo.findByPatient(patientId);
    } else if (facilityId) {
      invoices = await invoiceRepo.findByFacility(facilityId);
    } else {
      res.status(400).json({ error: "Provide patientId or facilityId query parameter" });
      return;
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

export async function payInvoiceHandler(req: Request, res: Response) {
  try {
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

export async function listClassificationsHandler(_req: Request, res: Response) {
  try {
    const rows = await classificationRepo.findAll();
    res.json({ classifications: rows.map((row) => new ServiceClassification(row).toJSON()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
