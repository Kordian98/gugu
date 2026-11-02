// Spike 04-S0 (ADR-0008): Prisma Client 7 + adapter-pg against PostGIS `Unsupported` columns and a raw
// EXCLUDE constraint. Run via `pnpm --filter @gugu/api spike:s0`, which prepares the gugu_spike DB.
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../prisma/spike/generated/client.js";

const url = process.env["SPIKE_DATABASE_URL"];
const run = url ? describe : describe.skip;

run("spike 04-S0", () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    pool = new pg.Pool({ connectionString: url, max: 25 });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  it("creates rows with UUIDv7 ids when the Unsupported column is optional", async () => {
    const row = await prisma.spikeLocation.create({ data: { name: `loc-${String(Date.now())}` } });
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it("writes and queries geography through tagged raw SQL using the GiST index", async () => {
    const row = await prisma.spikeLocation.create({ data: { name: `geo-${String(Date.now())}` } });
    await prisma.$executeRaw`UPDATE spike_locations SET geo = ST_SetSRID(ST_MakePoint(106.700, 10.776), 4326)::geography WHERE id = ${row.id}::uuid`;
    const near = await prisma.$queryRaw<{ id: string; meters: number }[]>`
      SELECT id, ST_Distance(geo, ST_SetSRID(ST_MakePoint(106.710, 10.776), 4326)::geography)::float8 AS meters
      FROM spike_locations
      WHERE ST_DWithin(geo, ST_SetSRID(ST_MakePoint(106.710, 10.776), 4326)::geography, 3000)
      ORDER BY meters`;
    expect(near.find((r) => r.id === row.id)?.meters).toBeGreaterThan(1000);
    const usesIndex = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
      const rows = await tx.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
        "EXPLAIN SELECT id FROM spike_locations WHERE ST_DWithin(geo, ST_SetSRID(ST_MakePoint(106.71, 10.776), 4326)::geography, 3000)",
      );
      return rows.some((r) => r["QUERY PLAN"].includes("spike_locations_geo_idx"));
    });
    expect(usesIndex).toBe(true);
  });

  it("hides models with a required Unsupported column from create() but allows reads", async () => {
    // @ts-expect-error -- Prisma omits create() from the types when a required field is Unsupported.
    const create: unknown = prisma.spikeOccupancy.create;
    expect(typeof create === "function" ? "runtime-present" : "absent").toBeDefined();
    await expect(prisma.spikeOccupancy.findMany({ take: 1 })).resolves.toBeInstanceOf(Array);
  });

  const claim = (staff: string, offsetMin: number, withLock: boolean) => async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialise claims per staff member so concurrent inserts wait instead of deadlocking.
      if (withLock)
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [staff]);
      await client.query(
        `INSERT INTO spike_occupancy (id, staff_id, range)
         VALUES (uuidv7(), $1, tstzrange(now() + interval '1 day' + make_interval(mins => $2::int),
                                         now() + interval '1 day' + make_interval(mins => $2::int + 60)))`,
        [staff, offsetMin],
      );
      await client.query("COMMIT");
      return "ok";
    } catch (e) {
      await client.query("ROLLBACK");
      return (e as { code?: string }).code ?? "error";
    } finally {
      client.release();
    }
  };

  const race = async (withLock: boolean) => {
    const staff = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => claim(staff, i % 3, withLock)()),
    );
    const counts: Record<string, number> = {};
    for (const r of results) counts[r] = (counts[r] ?? 0) + 1;
    return counts;
  };

  it("without a lock: exactly one of 20 concurrent overlapping claims wins; losers get 23P01 or 40P01", async () => {
    const counts = await race(false);
    expect(counts["ok"]).toBe(1);
    expect((counts["23P01"] ?? 0) + (counts["40P01"] ?? 0)).toBe(19);
  });

  it("with a per-staff advisory xact lock: one winner, 19 clean 23P01, no deadlocks", async () => {
    for (let round = 0; round < 5; round++) {
      expect(await race(true)).toEqual({ ok: 1, "23P01": 19 });
    }
  });

  it("ignores inactive rows in the exclusion predicate", async () => {
    const staff = crypto.randomUUID();
    const insert = (active: boolean) =>
      pool.query(
        "INSERT INTO spike_occupancy (id, staff_id, range, active) VALUES (uuidv7(), $1, tstzrange('2030-01-01 10:00Z', '2030-01-01 11:00Z'), $2)",
        [staff, active],
      );
    await insert(false);
    await insert(true);
    await expect(insert(true)).rejects.toMatchObject({ code: "23P01" });
  });
});
