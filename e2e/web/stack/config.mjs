// Single source of truth for the E2E stack's ports, database and Redis DB.
// The suite NEVER touches the dev database `gugu`, the dev Redis DB 0 or the dev ports
// (API 3002, web 8097, 8094). Everything below is dedicated to `pnpm e2e:web`.
const env = process.env;

export const E2E = {
  apiPort: Number(env.E2E_API_PORT ?? 3460),
  webPort: Number(env.E2E_WEB_PORT ?? 8460),
  pg: {
    host: "127.0.0.1",
    port: Number(env.POSTGRES_PORT ?? 15432),
    user: env.POSTGRES_USER ?? "gugu",
    password: env.POSTGRES_PASSWORD ?? "gugu",
    // `gugu_<suffix>` but not `*_test`: seed-platform-admin.mjs only runs against such names,
    // and `*_test` belongs to the API integration tests.
    // E2E_PG_DATABASE lets parallel worktrees use their own `gugu_<suffix>` E2E database.
    database: env.E2E_PG_DATABASE ?? "gugu_e2e",
  },
  redisDb: Number(env.E2E_REDIS_DB ?? 14),
  redisPort: Number(env.REDIS_PORT ?? 16379),
  mailpit: env.E2E_MAILPIT_URL ?? `http://localhost:${env.MAILPIT_UI_PORT ?? 18025}`,
  smtpPort: Number(env.MAILPIT_SMTP_PORT ?? 11025),
  /** Every E2E mailbox lives under this domain so Mailpit cleanup never touches dev mail. */
  mailDomain: "e2e.gugu.test",
};

export const apiUrl = `http://localhost:${E2E.apiPort}`;
export const webUrl = `http://localhost:${E2E.webPort}`;
export const databaseUrl = `postgresql://${E2E.pg.user}:${E2E.pg.password}@${E2E.pg.host}:${String(E2E.pg.port)}/${E2E.pg.database}`;
export const redisUrl = `redis://127.0.0.1:${String(E2E.redisPort)}/${String(E2E.redisDb)}`;

const FORBIDDEN_PORTS = new Set([3002, 8097, 8094]);
export function assertIsolated() {
  for (const p of [E2E.apiPort, E2E.webPort]) {
    if (FORBIDDEN_PORTS.has(p)) throw new Error(`E2E refuses dev port ${String(p)}`);
  }
  if (E2E.pg.database === "gugu" || E2E.pg.database.endsWith("_test")) {
    throw new Error(`E2E refuses database ${E2E.pg.database}`);
  }
  if (E2E.redisDb === 0 || E2E.redisDb === 15) {
    throw new Error(`E2E refuses Redis DB ${String(E2E.redisDb)} (dev = 0, integration = 15)`);
  }
}

/** Environment for the API and the worker: built from scratch, never from the dev .env. */
export function backendEnv() {
  return {
    PATH: env.PATH,
    HOME: env.HOME,
    NODE_ENV: "development",
    TZ: "UTC",
    API_PORT: String(E2E.apiPort),
    LOG_LEVEL: env.E2E_LOG_LEVEL ?? "warn",
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    WEB_APP_URL: webUrl,
    WEB_ORIGINS: webUrl,
    API_PUBLIC_URL: apiUrl,
    // Seed calls (Node, via loopback) send X-Forwarded-For so they get their own rate-limit
    // buckets; browsers send none, so their req.ip stays 127.0.0.1. See support/api.ts.
    TRUST_PROXY: "loopback",
    SMTP_URL: `smtp://127.0.0.1:${String(E2E.smtpPort)}`,
    MAIL_FROM: "GuGu E2E <no-reply@gugu.local>",
    ZALO_CLIENT: "emulated",
    ZALO_EMULATOR_NAMESPACE: "e2e",
    // Empty unless the caller exports a key: the assistant test then asserts "not configured".
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY ?? "",
    GOOGLE_CLIENT_IDS: "",
    APPLE_CLIENT_IDS: "",
    ZALO_LOGIN_ENABLED: "false",
  };
}
