import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { Problem } from "@gugu/contracts";
import { RequestContext } from "../context/request-context";
import { AppError } from "./app-error";
import { CODE_BY_STATUS, COMMON_ERRORS } from "./error-codes";

/**
 * Global exception filter: every error leaves the API as `application/problem+json`
 * (docs/tasks/04-backend-database.md §4.5). Never includes stack traces, SQL or internal messages
 * for 5xx; those go to the log only.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger("ProblemFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const problem = this.toProblem(exception);
    problem.instance = req.originalUrl.split("?")[0] ?? req.originalUrl;
    const traceId = RequestContext.requestId() ?? (typeof req.id === "string" ? req.id : undefined);
    if (traceId) problem.traceId = traceId;

    if (problem.status >= 500) {
      this.logger.error({ err: exception, code: problem.code, traceId }, "unhandled error");
    }
    res.status(problem.status).type("application/problem+json").json(problem);
  }

  private toProblem(exception: unknown): Problem {
    if (exception instanceof AppError) {
      return {
        type: "about:blank",
        status: exception.status,
        code: exception.code,
        title: exception.title,
        ...(exception.options.detail ? { detail: exception.options.detail } : {}),
        ...(exception.options.errors ? { errors: exception.options.errors } : {}),
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        type: "about:blank",
        status,
        code:
          CODE_BY_STATUS[status] ??
          (status >= 500 ? COMMON_ERRORS.internal : COMMON_ERRORS.badRequest),
        title: status >= 500 ? "Internal Server Error" : exception.message,
      };
    }
    return {
      type: "about:blank",
      status: 500,
      code: COMMON_ERRORS.internal,
      title: "Internal Server Error",
    };
  }
}
