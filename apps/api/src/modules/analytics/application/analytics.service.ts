import { createHmac } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ANALYTICS_EVENTS, type AnalyticsEventName, type AnalyticsProps } from "@gugu/contracts";
import { AppConfig } from "../../../infrastructure/config/app-config";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

type Db = Prisma.TransactionClient;

export interface AnalyticsEntry<N extends AnalyticsEventName> {
  name: N;
  salonId: string | null;
  /** Hashed with a server secret before storage; the raw id is never stored. */
  actorUserId?: string | null;
  props: AnalyticsProps<N>;
}

/**
 * Minimal server-side analytics (X14) until topic 12 builds the full pipeline. Events are
 * pseudonymous with no direct identifiers: ids, enums and counts, the actor only as an HMAC with a
 * dedicated secret (ANALYTICS_HASH_SECRET). Events are validated
 * against the typed catalogue (strict schemas, so an unexpected property is a bug, not data) and
 * stored in `analytics_events`. Recording never fails the caller's request.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  actorHash(userId: string): string {
    return createHmac("sha256", this.config.env.ANALYTICS_HASH_SECRET)
      .update(`analytics\u0000${userId}`)
      .digest("base64url");
  }

  async record<N extends AnalyticsEventName>(entry: AnalyticsEntry<N>, db?: Db): Promise<void> {
    const props = ANALYTICS_EVENTS[entry.name].parse(entry.props) as Prisma.InputJsonObject;
    try {
      await (db ?? this.prisma).analyticsEvent.create({
        data: {
          name: entry.name,
          salonId: entry.salonId,
          actorHash: entry.actorUserId ? this.actorHash(entry.actorUserId) : null,
          props,
        },
      });
    } catch (err) {
      // Inside a transaction a failed insert aborts it, so only swallow outside one.
      if (db) throw err;
      this.logger.warn({ err, event: entry.name }, "analytics event not stored");
    }
  }
}
