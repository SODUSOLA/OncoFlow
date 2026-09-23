import type { NextFunction, Request, Response } from "express";
import type { ZodIssue, ZodTypeAny } from "zod";
import { ValidationError } from "./errors.js";

// Converts Zod issues into the { path, message } shape returned to clients.
function formatIssues(issues: ZodIssue[]) {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

// Writes the validated value back onto req (query is a getter, so it needs special handling).
function assignValidatedValue(req: Request, target: "body" | "query" | "params", value: unknown) {
  if (target === "body") {
    req.body = value;
    return;
  }

  if (target === "query") {
    req.query = value as Request["query"];
    return;
  }

  req.params = value as Request["params"];
}

// Builds a middleware that validates one part of the request against a Zod schema.
function validateTarget(schema: ZodTypeAny, target: "body" | "query" | "params") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      next(new ValidationError(formatIssues(result.error.issues)));
      return;
    }

    assignValidatedValue(req, target, result.data);
    next();
  };
}

// Middleware validating the request body.
export function validateBody(schema: ZodTypeAny) {
  return validateTarget(schema, "body");
}

// Middleware validating the query string.
export function validateQuery(schema: ZodTypeAny) {
  return validateTarget(schema, "query");
}

// Middleware validating the route params.
export function validateParams(schema: ZodTypeAny) {
  return validateTarget(schema, "params");
}

