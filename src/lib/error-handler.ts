import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "./errors.js";

function getRequestId(req: Request): string | undefined {
  const contextReq = req as Request & { requestId?: string };
  return contextReq.requestId ?? (typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : undefined);
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = getRequestId(req);

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    res.status(400).json({
      error: "Request validation failed",
      code: "VALIDATION_ERROR",
      details,
      requestId,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
      requestId,
    });
    return;
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({
    error: message === "Internal server error" ? message : "Internal server error",
    code: "INTERNAL_ERROR",
    requestId,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  const requestId = getRequestId(req);
  res.status(404).json({
    error: "Not found",
    code: "NOT_FOUND",
    requestId,
  });
}
