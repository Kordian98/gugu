import type { Problem } from "@gugu/contracts";

/**
 * Throw this for expected failures. The problem filter turns it into RFC 9457 problem+json.
 * `title` is English for logs/developers; users see the translation of `code`.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly options: {
      detail?: string;
      errors?: NonNullable<Problem["errors"]>;
      cause?: unknown;
    } = {},
  ) {
    super(title, { cause: options.cause });
    this.name = "AppError";
  }
}
