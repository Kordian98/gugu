import { Module } from "@nestjs/common";
import { LoggerModule as PinoLoggerModule } from "nestjs-pino";
import { RequestContext } from "../../common/context/request-context";
import { resolveRequestId } from "../../common/context/request-id";
import { AppConfig } from "../config/app-config";
import { REDACT_PATHS, redactRequest } from "./redaction";

/** Structured JSON logs via Pino; pretty-printed only in development. */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.env.LOG_LEVEL,
          redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
          serializers: { req: redactRequest },
          genReqId: (req) => resolveRequestId(req),
          customProps: () => ({ requestId: RequestContext.requestId() }),
          autoLogging: { ignore: (req) => req.url?.startsWith("/api/v1/health/live") ?? false },
          ...(config.env.NODE_ENV === "development"
            ? { transport: { target: "pino-pretty", options: { singleLine: true } } }
            : {}),
        },
      }),
    }),
  ],
})
export class LoggerModule {}
