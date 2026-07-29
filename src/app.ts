import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { attachRequestContext } from "./lib/request-context.js";
import { errorHandler, notFoundHandler } from "./lib/error-handler.js";
import { authRoutes } from "./modules/auth/index.js";
import { patientRoutes } from "./modules/patient/index.js";
import { billingRoutes } from "./modules/billing/index.js";
import { appointmentRoutes } from "./modules/appointment/index.js";
import { clinicalRoutes } from "./modules/clinical/index.js";
import { documentRoutes } from "./modules/documents/index.js";

function resolveCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (raw && raw.length > 0) {
    return raw.split(",").map((origin) => origin.trim()).filter(Boolean);
  }
  // Wildcard + credentials is both rejected by browsers and a real access-control gap —
  // fail loudly in production instead of silently falling back to it (sprint2-hardening-checklist.md).
  if (process.env.NODE_ENV === "production") {
    throw new Error("CORS_ORIGIN must be set (comma-separated allowlist) in production");
  }
  return ["http://localhost:5173"];
}

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: resolveCorsOrigins(), credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachRequestContext);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use(authRoutes);
  app.use(patientRoutes);
  app.use(billingRoutes);
  app.use(appointmentRoutes);
  app.use(clinicalRoutes);
  app.use(documentRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
