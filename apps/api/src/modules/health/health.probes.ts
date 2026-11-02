import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { type Probe, timedCheck } from "./application/probes";

@Injectable()
export class PrismaProbe implements Probe {
  constructor(private readonly prisma: PrismaService) {}

  check() {
    return timedCheck(() => this.prisma.$queryRaw`SELECT 1`);
  }
}

@Injectable()
export class RedisProbe implements Probe {
  constructor(private readonly redis: RedisService) {}

  check() {
    return timedCheck(async () => {
      if (this.redis.client.status === "wait") await this.redis.client.connect();
      await this.redis.client.ping();
    });
  }
}
