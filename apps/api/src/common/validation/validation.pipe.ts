import { StandardSchemaValidationPipe } from "@nestjs/common";
import { AppError } from "../problem/app-error";
import { COMMON_ERRORS } from "../problem/error-codes";

/**
 * Global validation: any `@Body/@Query/@Param({ schema })` with a Zod (Standard Schema) schema from
 * @gugu/contracts is validated here, and failures become a 400 problem with field-level `errors`.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new AppError(400, COMMON_ERRORS.validationFailed, "Request validation failed", {
        errors: issues.map((issue) => ({
          path: (issue.path ?? [])
            .map((p) => (typeof p === "object" ? String(p.key) : String(p)))
            .join("."),
          code: "invalid",
          message: issue.message,
        })),
      }),
  });
}
