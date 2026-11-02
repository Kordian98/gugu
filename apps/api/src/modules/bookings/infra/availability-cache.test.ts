import { describe, expect, it, vi } from "vitest";
import type { RedisService } from "../../../infrastructure/redis/redis.service";
import { AvailabilityCache } from "./availability-cache";

/** In-memory stand-in for the ioredis calls the cache makes. */
function fakeRedis(opts: { failGet?: boolean } = {}) {
  const store = new Map<string, string>();
  const client = {
    get: vi.fn((k: string) =>
      opts.failGet ? Promise.reject(new Error("down")) : Promise.resolve(store.get(k) ?? null),
    ),
    set: vi.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve("OK");
    }),
    multi: () => {
      const ops: (() => void)[] = [];
      const chain = {
        incr: (k: string) => {
          ops.push(() => store.set(k, String(Number(store.get(k) ?? 0) + 1)));
          return chain;
        },
        expire: () => chain,
        exec: () => {
          ops.forEach((op) => {
            op();
          });
          return Promise.resolve([]);
        },
      };
      return chain;
    },
  };
  return { redis: { client } as unknown as RedisService, store, client };
}

const scope = (patch: Partial<{ availabilityVersion: number; now: Date }> = {}) => ({
  salonId: "s1",
  availabilityVersion: 1,
  now: new Date("2026-12-01T01:00:10Z"),
  kind: "availability",
  ...patch,
});

describe("AvailabilityCache", () => {
  it("serves repeats from cache; version, occupancy, minute and query make new keys", async () => {
    const { redis } = fakeRedis();
    const cache = new AvailabilityCache(redis);
    let n = 0;
    const compute = () => Promise.resolve({ n: ++n });
    expect(await cache.getOrCompute(scope(), { q: 1 }, compute)).toEqual({ n: 1 });
    expect(await cache.getOrCompute(scope(), { q: 1 }, compute)).toEqual({ n: 1 });
    expect(await cache.getOrCompute(scope(), { q: 2 }, compute)).toEqual({ n: 2 });
    expect(await cache.getOrCompute(scope({ availabilityVersion: 2 }), { q: 1 }, compute)).toEqual({
      n: 3,
    });
    await cache.bumpOccupancy("s1");
    expect(await cache.getOrCompute(scope(), { q: 1 }, compute)).toEqual({ n: 4 });
    const nextMinute = new Date("2026-12-01T01:01:00Z");
    expect(await cache.getOrCompute(scope({ now: nextMinute }), { q: 1 }, compute)).toEqual({
      n: 5,
    });
  });

  it("fails open when Valkey is down", async () => {
    const { redis, client } = fakeRedis({ failGet: true });
    const cache = new AvailabilityCache(redis);
    expect(await cache.getOrCompute(scope(), {}, () => Promise.resolve(42))).toBe(42);
    expect(client.set).not.toHaveBeenCalled();
  });
});
