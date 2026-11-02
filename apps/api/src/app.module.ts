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
import { MailModule } from "./infrastructure/mail/mail.module";
import { RateLimitModule } from "./infrastructure/rate-limit/rate-limit.module";
import { AuditModule } from "./modules/audit/audit.facade";
import { AuthModule } from "./modules/auth/auth.facade";
import { AuthorizationModule } from "./modules/authorization/authorization.facade";
import { HealthModule } from "./modules/health/health.module";
import { SalonsModule } from "./modules/salons/salons.module";
import { SubscriptionsModule } from "./modules/subscriptions/subscriptions.module";

/** Shared infrastructure for the HTTP app and the worker. */
export const INFRASTRUCTURE_MODULES = [
  ConfigModule,
  LoggerModule,
  PrismaModule,
  RedisModule,
  QueueModule,
];

@Module({
  imports: [
    ...INFRASTRUCTURE_MODULES,
    RateLimitModule,
    MailModule,
    AuditModule,
    AuthModule,
    AuthorizationModule,
    HealthModule,
    SubscriptionsModule,
    SalonsModule,
  ],
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
