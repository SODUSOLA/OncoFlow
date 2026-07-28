import type { NextFunction, Request, Response } from "express";
import type { ZodIssue, ZodTypeAny } from "zod";
import { ValidationError } from "./errors";

function formatIssues(issues: ZodIssue[]) {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

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

export function validateBody(schema: ZodTypeAny) {
  return validateTarget(schema, "body");
}

export function validateQuery(schema: ZodTypeAny) {
  return validateTarget(schema, "query");
}

export function validateParams(schema: ZodTypeAny) {
  return validateTarget(schema, "params");
}

