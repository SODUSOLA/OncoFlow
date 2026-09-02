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

export class ValidationError extends AppError {
  constructor(details: unknown) {
    super(400, "VALIDATION_ERROR", "Request validation failed", details);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, "UNAUTHORIZED", message);
    this.name = "UnauthorizedError";
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Payload too large") {
    super(413, "PAYLOAD_TOO_LARGE", message);
    this.name = "PayloadTooLargeError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, "NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super(409, "CONFLICT", message, details);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests", details?: unknown) {
    super(429, "RATE_LIMITED", message, details);
    this.name = "RateLimitError";
  }
}

export class NotImplementedError extends AppError {
  constructor(message = "Not implemented", details?: unknown) {
    super(501, "NOT_IMPLEMENTED", message, details);
    this.name = "NotImplementedError";
  }
}
