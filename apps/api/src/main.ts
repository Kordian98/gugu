import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureHttpApp } from "./bootstrap";
import { AppConfig } from "./infrastructure/config/app-config";

const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
configureHttpApp(app);
const { API_PORT } = app.get(AppConfig).env;
await app.listen(API_PORT, "0.0.0.0");
app.get(Logger).log(`GuGu API on http://localhost:${String(API_PORT)}/api/v1 · docs /api/docs`);
