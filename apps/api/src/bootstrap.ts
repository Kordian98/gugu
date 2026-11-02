import { type INestApplication, VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppConfig } from "./infrastructure/config/app-config";

/**
 * HTTP setup shared by main.ts and e2e tests: `/api/v1/...` routes (URI versioning, default v1) and
 * Swagger UI at `/api/docs` (JSON at `/api/docs-json`).
 */
export function configureHttpApp(app: INestApplication): INestApplication {
  const express = app.getHttpAdapter().getInstance() as {
    disable(setting: string): void;
    set(setting: string, value: unknown): void;
  };
  express.disable("x-powered-by");
  // req.ip honours X-Forwarded-For only from configured proxy hops (TRUST_PROXY; default none).
  express.set("trust proxy", app.get(AppConfig).env.TRUST_PROXY);
  // Credentialed CORS for the web app origins only (spec 05 R33). Cookies are SameSite=Lax.
  app.enableCors({
    origin: app.get(AppConfig).webOrigins,
    credentials: true,
    allowedHeaders: [
      "content-type",
      "authorization",
      "accept-language",
      "x-csrf-token",
      "x-request-id",
      // Booking writes from the web CRM are idempotent (topic 06).
      "idempotency-key",
    ],
    exposedHeaders: ["x-request-id"],
    maxAge: 600,
  });
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.enableShutdownHooks();
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("GuGu API")
      .setDescription("Booking marketplace API. Errors are RFC 9457 application/problem+json.")
      .setVersion("1")
      .build(),
  );
  SwaggerModule.setup("api/docs", app, document, { jsonDocumentUrl: "api/docs-json" });
  return app;
}
