import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { attachRequestContext } from "./lib/request-context.js";
import { errorHandler, notFoundHandler } from "./lib/error-handler.js";
import { authRoutes } from "./modules/auth/index.js";
import { patientRoutes } from "./modules/patient/index.js";
import { facilityRoutes } from "./modules/facility/index.js";
import { billingRoutes } from "./modules/billing/index.js";
import { appointmentRoutes } from "./modules/appointment/routes.js";
import { clinicalRoutes } from "./modules/clinical/index.js";
import { documentRoutes } from "./modules/documents/index.js";
import { messagingRoutes } from "./modules/messaging/index.js";
import { notificationRoutes } from "./modules/notification/index.js";
import { inquiryRoutes } from "./modules/inquiry/index.js";
import { staffingRoutes } from "./modules/staffing/index.js";
import { inventoryRoutes } from "./modules/inventory/index.js";
import { clinicalMetricsRoutes } from "./modules/clinical-metrics/index.js";
import { availabilityRoutes } from "./modules/availability/index.js";
import { nursingRoutes } from "./modules/nursing/index.js";
// Imported directly from routes.js, not modules/audit/index.js — that index re-exports
// service/repository only, deliberately not routes, to avoid a circular import (see the comment
// in modules/audit/index.js for why).
import { auditRoutes } from "./modules/audit/routes.js";
import { config } from "./config.js";

// The one route that accepts a base64 file body — see the body-limit split below.
const UPLOAD_PATH = "/files/upload";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  // Captures the raw body alongside normal JSON parsing — webhook signature verification
  // (Daily.co, and eventually Monnify) has to HMAC the exact bytes as sent, and by the time
  // req.body exists as a parsed object that's already lost.
  // Body limits are deliberately split. express.json()'s default is 100kb, and because uploads
  // arrive as base64 inside the JSON body (inflating bytes by 4/3), that capped real files at
  // roughly 75kb — so any document or voice note of a realistic size was rejected by the parser
  // before reaching the route. Worse, the resulting PayloadTooLargeError is not an AppError, so
  // the error handler reported it as a generic 500 "Internal server error" and the cause was
  // invisible from the client.
  //
  // Only /files/upload gets the large budget. Applying it globally would let any endpoint accept
  // a multi-megabyte body, which is a cheap way to tie up the process.
  const captureRawBody = (req: express.Request, _res: express.Response, buf: Buffer) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  };
  const standardJson = express.json({ limit: "1mb", verify: captureRawBody });
  const uploadJson = express.json({ limit: config.maxUploadBodyBytes, verify: captureRawBody });
  app.use((req, res, next) => {
    (req.path === UPLOAD_PATH ? uploadJson : standardJson)(req, res, next);
  });
  app.use(cookieParser());
  app.use(attachRequestContext);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use(authRoutes);
  app.use(patientRoutes);
  app.use(facilityRoutes);
  app.use(billingRoutes);
  app.use(appointmentRoutes);
  app.use(clinicalRoutes);
  app.use(documentRoutes);
  app.use(messagingRoutes);
  app.use(notificationRoutes);
  app.use(inquiryRoutes);
  app.use(staffingRoutes);
  app.use(inventoryRoutes);
  app.use(auditRoutes);
  app.use(clinicalMetricsRoutes);
  app.use(availabilityRoutes);
  app.use(nursingRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
