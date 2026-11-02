import { Module, type Provider } from "@nestjs/common";
import { AppConfig } from "../../infrastructure/config/app-config";
import { AuditModule } from "../audit/audit.facade";
import { BookingsEngineModule } from "../bookings/bookings.facade";
import { SubscriptionsModule } from "../subscriptions/subscriptions.facade";
import { BookingUpdatesService } from "./application/booking-updates.service";
import { BotPortsFactory } from "./application/bot-ports";
import { ConnectionService } from "./application/connection.service";
import { InboundService } from "./application/inbound.service";
import { InboxService } from "./application/inbox.service";
import { OutboundService } from "./application/outbound.service";
import { RemindersService } from "./application/reminders.service";
import { StaffReleaseService } from "./application/staff-release.service";
import { UsageQueries } from "./application/usage.queries";
import { WebhookIngestService } from "./application/webhook-ingest.service";
import { ZaloJobs } from "./application/zalo-jobs";
import { ZaloClock } from "./application/zalo-clock";
import { HttpZaloClient } from "./client/http-zalo-client";
import { DisabledZaloClient, ZALO_CLIENT, type ZaloClient } from "./client/zalo-client";
import { EmulatedZaloClient } from "./emulator/emulated-zalo-client";
import { EmulatorOnlyGuard, ZaloEmulatorController } from "./emulator/emulator.controller";
import { EmulatorStore } from "./emulator/emulator-store";
import { ZaloPanelController } from "./http/zalo-panel.controller";
import { ZaloWebhookController } from "./http/zalo-webhook.controller";
import { TokenCipher } from "./infra/token-cipher";

/** ZALO_CLIENT picks the implementation; nothing else in the module knows which one runs. */
const shared: Provider[] = [
  ZaloClock,
  EmulatorStore,
  UsageQueries,
  ConnectionService,
  OutboundService,
  {
    provide: TokenCipher,
    inject: [AppConfig],
    useFactory: (c: AppConfig) => new TokenCipher(c.env.ZALO_TOKEN_KEY),
  },
  {
    provide: ZALO_CLIENT,
    inject: [AppConfig, EmulatorStore, ZaloClock],
    useFactory: (config: AppConfig, store: EmulatorStore, clock: ZaloClock): ZaloClient => {
      switch (config.env.ZALO_CLIENT) {
        case "http":
          return new HttpZaloClient(config.env.ZALO_APP_ID, config.env.ZALO_APP_SECRET);
        case "emulated":
          return new EmulatedZaloClient(store, clock, config.env.API_PUBLIC_URL);
        default:
          return new DisabledZaloClient();
      }
    },
  },
];

/**
 * Zalo OA integration (topic 09, roadmap X24): salon OA connection, the single webhook, the panel
 * and inbox API, and the built-in emulator. Bot, sends and reminders run in the worker
 * (ZaloWorkerModule). Spec docs/tasks/09-zalo.md · domain doc docs/domains/zalo.md.
 */
@Module({
  controllers: [ZaloPanelController, ZaloWebhookController, ZaloEmulatorController],
  providers: [...shared, WebhookIngestService, InboxService, EmulatorOnlyGuard],
})
export class ZaloModule {}

/** Worker slice: inbound bot processing, ordered sends, reminders, booking updates, token refresh. */
@Module({
  // Audit and entitlements are global in the HTTP app; the worker process imports them here.
  imports: [AuditModule, BookingsEngineModule, SubscriptionsModule],
  providers: [
    ...shared,
    BotPortsFactory,
    InboundService,
    RemindersService,
    BookingUpdatesService,
    StaffReleaseService,
    ZaloJobs,
  ],
  exports: [ZaloJobs],
})
export class ZaloWorkerModule {}
