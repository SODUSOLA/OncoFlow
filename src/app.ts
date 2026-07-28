import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { attachRequestContext } from "./lib/request-context";
import { errorHandler, notFoundHandler } from "./lib/error-handler";
import { authRoutes } from "./modules/auth";
import { patientRoutes } from "./modules/patient";
import { billingRoutes } from "./modules/billing";
import { appointmentRoutes } from "./modules/appointment";
import { clinicalRoutes } from "./modules/clinical";
import { documentRoutes } from "./modules/documents";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*", credentials: true }));
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
