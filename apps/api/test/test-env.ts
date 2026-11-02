/**
 * Integration tests must never touch the dev database or the dev Redis (incident 2026-11-03: suites
 * wrote salons into `gugu` and a fake-clock trial expiry changed a real salon). Called from
 * vitest.integration.config.ts before any app module loads:
 *  - DATABASE_URL is replaced by TEST_DATABASE_URL (required) and its database name must end in
 *    `_test` and differ from the dev database;
 *  - REDIS_URL is moved to a dedicated logical db (REDIS_TEST_DB, default 15).
 */
export function forceTestEnvironment(env: NodeJS.ProcessEnv = process.env): {
  databaseUrl: string;
} {
  const devUrl = env["DATABASE_URL"];
  const testUrl = env["TEST_DATABASE_URL"];
  if (!testUrl)
    throw new Error(
      "TEST_DATABASE_URL is not set: refusing to run integration tests against the dev database",
    );
  const testDb = new URL(testUrl).pathname.slice(1);
  const devDb = devUrl ? new URL(devUrl).pathname.slice(1) : null;
  if (!testDb.endsWith("_test"))
    throw new Error(`TEST_DATABASE_URL must point at a *_test database (got "${testDb}")`);
  // Idempotent: after the first call (config, then global setup) DATABASE_URL already is the test
  // URL. The test database must never be the dev database.
  if (devUrl !== undefined && devUrl !== testUrl && devDb === testDb) {
    throw new Error(`TEST_DATABASE_URL equals DATABASE_URL ("${testDb}")`);
  }
  if (env["POSTGRES_DB"] && testDb === env["POSTGRES_DB"]) {
    throw new Error(`TEST_DATABASE_URL points at the dev database "${testDb}"`);
  }
  env["DATABASE_URL"] = testUrl;
  env["SHADOW_DATABASE_URL"] ??= testUrl.replace(/_test$/, "_test_shadow");
  const redis = new URL(env["REDIS_URL"] ?? "redis://127.0.0.1:6379");
  redis.pathname = `/${env["REDIS_TEST_DB"] ?? "15"}`;
  env["REDIS_URL"] = redis.toString();
  return { databaseUrl: testUrl };
}
