import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "./errors.js";
import type { ErrorCode } from "./errors.js";

// body-parser rejects a malformed or oversized body by throwing an error that carries a `type`
// discriminator and an HTTP status, but is a plain Error rather than an AppError. Without this
// map every one of them fell through to the generic 500 branch below, so a request that was
// merely too large was reported as "Internal server error" with no indication of the real cause
// — which is exactly how the 100kb default body limit stayed hidden behind a 500 on file upload.
const BODY_PARSER_ERRORS: Record<string, { status: number; code: ErrorCode; message: string }> = {
  "entity.too.large": {
    status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body is too large",
  },
  "entity.parse.failed": {
    status: 400, code: "BAD_REQUEST", message: "Request body is not valid JSON",
  },
  "encoding.unsupported": {
    status: 415, code: "BAD_REQUEST", message: "Unsupported content encoding",
  },
  "charset.unsupported": {
    status: 415, code: "BAD_REQUEST", message: "Unsupported charset",
  },
  "request.aborted": {
    status: 400, code: "BAD_REQUEST", message: "Request aborted before the body was received",
  },
};

function bodyParserFailure(err: unknown) {
  if (typeof err !== "object" || err === null || !("type" in err)) return undefined;
  const { type } = err as { type?: unknown };
  return typeof type === "string" ? BODY_PARSER_ERRORS[type] : undefined;
}

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

  const bodyFailure = bodyParserFailure(err);
  if (bodyFailure) {
    res.status(bodyFailure.status).json({
      error: bodyFailure.message,
      code: bodyFailure.code,
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
