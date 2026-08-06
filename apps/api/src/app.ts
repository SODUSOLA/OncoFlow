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
import { appointmentRoutes } from "./modules/appointment/index.js";
import { clinicalRoutes } from "./modules/clinical/index.js";
import { documentRoutes } from "./modules/documents/index.js";
import { messagingRoutes } from "./modules/messaging/index.js";
import { notificationRoutes } from "./modules/notification/index.js";
import { inquiryRoutes } from "./modules/inquiry/index.js";
import { config } from "./config.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  // Captures the raw body alongside normal JSON parsing — webhook signature verification
  // (Daily.co, and eventually Monnify) has to HMAC the exact bytes as sent, and by the time
  // req.body exists as a parsed object that's already lost.
  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }));
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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
