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
import { vmoRoutes } from "./modules/vmo/index.js";
import { drugSupplyRoutes } from "./modules/drug-supply/index.js";
// Imported straight from routes.js because modules/audit/index.js deliberately doesn't re-export routes (circular import).
import { auditRoutes } from "./modules/audit/routes.js";
import { config } from "./config.js";

// The one route that accepts a base64 file body — see the body-limit split below.
const UPLOAD_PATH = "/files/upload";

// Builds and returns the fully configured Express app (middleware, routes, error handlers) without starting a listener.
export function createApp() {
  const app = express();

  // Security headers and CORS come first so every response, including errors, carries them.
  app.use(helmet());
  // Cross-origin requests are limited to the configured origins, with credentials allowed.
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  // Keeps the raw request bytes alongside the parsed JSON so webhook HMAC signatures can be verified.
  const captureRawBody = (req: express.Request, _res: express.Response, buf: Buffer) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  };
  // Default JSON body limit for every route except uploads.
  const standardJson = express.json({ limit: "1mb", verify: captureRawBody });
  // Larger JSON limit for base64 file uploads only, so other endpoints can't be used to tie up the process.
  const uploadJson = express.json({ limit: config.maxUploadBodyBytes, verify: captureRawBody });
  // Picks the upload or standard body parser based on the request path.
  app.use((req, res, next) => {
    (req.path === UPLOAD_PATH ? uploadJson : standardJson)(req, res, next);
  });
  // Parses cookies and attaches the per-request context (request id, actor) used by later middleware.
  app.use(cookieParser());
  app.use(attachRequestContext);

  // Liveness probe used by Docker and load balancers.
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
  app.use(drugSupplyRoutes);
  app.use(vmoRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
