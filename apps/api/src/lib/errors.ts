export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "NOT_IMPLEMENTED"
  | "BAD_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

// Base class for expected API errors, carrying the HTTP status, machine-readable code and optional details.
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// 400 error for request payloads that fail schema validation.
export class ValidationError extends AppError {
  constructor(details: unknown) {
    super(400, "VALIDATION_ERROR", "Request validation failed", details);
    this.name = "ValidationError";
  }
}

// 401 error for missing or invalid authentication.
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, "UNAUTHORIZED", message);
    this.name = "UnauthorizedError";
  }
}

// 413 error for request bodies over the size limit.
export class PayloadTooLargeError extends AppError {
  constructor(message = "Payload too large") {
    super(413, "PAYLOAD_TOO_LARGE", message);
    this.name = "PayloadTooLargeError";
  }
}

// 403 error for authenticated callers who lack access.
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

// 404 error for resources that don't exist or aren't visible to the caller.
export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, "NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

// 409 error for state conflicts such as duplicates or invalid transitions.
export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super(409, "CONFLICT", message, details);
    this.name = "ConflictError";
  }
}

// 429 error for callers who exceeded a rate limit.
export class RateLimitError extends AppError {
  constructor(message = "Too many requests", details?: unknown) {
    super(429, "RATE_LIMITED", message, details);
    this.name = "RateLimitError";
  }
}

// 501 error for endpoints that are stubbed but not built.
export class NotImplementedError extends AppError {
  constructor(message = "Not implemented", details?: unknown) {
    super(501, "NOT_IMPLEMENTED", message, details);
    this.name = "NotImplementedError";
  }
}
