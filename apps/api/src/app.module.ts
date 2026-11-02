import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { RequestContextMiddleware } from "./common/context/request-context.middleware";
import { ProblemFilter } from "./common/problem/problem.filter";
import { createValidationPipe } from "./common/validation/validation.pipe";
import { ConfigModule } from "./infrastructure/config/config.module";
import { LoggerModule } from "./infrastructure/logger/logger.module";
import { PrismaModule } from "./infrastructure/prisma/prisma.module";
import { QueueModule } from "./infrastructure/queue/queue.module";
import { RedisModule } from "./infrastructure/redis/redis.module";
import { HealthModule } from "./modules/health/health.module";

/** Shared infrastructure for the HTTP app and the worker. */
export const INFRASTRUCTURE_MODULES = [
  ConfigModule,
  LoggerModule,
  PrismaModule,
  RedisModule,
  QueueModule,
];

@Module({
  imports: [...INFRASTRUCTURE_MODULES, HealthModule],
  providers: [
    { provide: APP_FILTER, useClass: ProblemFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*path");
  }
}
