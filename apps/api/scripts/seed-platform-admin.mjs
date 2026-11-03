#!/usr/bin/env node
// Grants a GuGu platform role to an email (local dev only). Usage, from apps/api:
//   node --env-file=../../.env scripts/seed-platform-admin.mjs [--email admin@gugu.local] [--role super_admin|support_admin] [--with-totp]
// Admin writes need two-step verification (topic 05 step 9, ADR-0011). Either enrol in the panel
// (/vi/admin/security) or pass --with-totp: the script then enrols a fresh TOTP factor directly and
// prints its base32 secret once (add it to an authenticator app, or run
// `node scripts/totp-code.mjs <secret>` for the current code). Recovery codes are created in the
// panel ("New recovery codes"). Re-running with --with-totp replaces the factor.
// Creates the user if missing (verified email, no salon membership), sets users.platform_role and
// writes an audit row. Then sign in on the web app with that email: the magic link arrives in
// Mailpit. Platform roles are NOT salon memberships; there is no API to grant them yet (topic 05
// owns `platform.roles.write`). Refuses to run unless every local-dev marker holds: NODE_ENV is
// explicitly `development`, the host is loopback AND the database name is a local GuGu database
// (`gugu` or `gugu_<suffix>`, never `*_test`). A loopback tunnel to a remote database therefore
// also needs a matching name and a dev env file. The OS user is recorded in the audit row.
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { userInfo } from "node:os";
import pg from "pg";

if (process.env.NODE_ENV !== "development") {
  throw new Error("seed-platform-admin is dev-only (NODE_ENV must be development)");
}
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const email = String(arg("email", "admin@gugu.local")).trim().toLowerCase();
const role = arg("role", "super_admin");
const withTotp = process.argv.includes("--with-totp");
if (!["super_admin", "support_admin"].includes(role)) throw new Error(`unknown role ${role}`);
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (pass --env-file=../../.env)");
const parsed = new URL(url);
const host = parsed.hostname.replace(/^\[|\]$/g, "");
if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
  throw new Error(`refusing to grant platform roles on a non-local database (${host})`);
}
const dbName = decodeURIComponent(parsed.pathname.slice(1));
if (!/^gugu(_[a-z0-9_]+)?$/.test(dbName) || dbName.endsWith("_test")) {
  throw new Error(`refusing: database "${dbName}" is not a local GuGu dev database`);
}
const osUser = userInfo().username;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  const found = await client.query("SELECT id, platform_role FROM users WHERE email = $1", [email]);
  let userId = found.rows[0]?.id;
  const before = found.rows[0]?.platform_role ?? null;
  if (!userId) {
    const created = await client.query(
      `INSERT INTO users (id, email, email_verified_at, status, preferred_locale, platform_role, created_at, updated_at)
       VALUES (uuidv7(), $1, now(), 'active', 'vi', $2, now(), now()) RETURNING id`,
      [email, role],
    );
    userId = created.rows[0].id;
    await client.query(
      `INSERT INTO user_profiles (id, user_id, created_at, updated_at) VALUES (uuidv7(), $1, now(), now())`,
      [userId],
    );
  } else {
    await client.query("UPDATE users SET platform_role = $2, updated_at = now() WHERE id = $1", [
      userId,
      role,
    ]);
  }
  await client.query(
    `INSERT INTO audit_logs (id, actor_type, action, target_type, target_id, metadata, created_at)
     VALUES (uuidv7(), 'system', 'admin.platform_role_granted', 'user', $1, $2, now())`,
    [
      userId,
      JSON.stringify({
        source: "seed-platform-admin",
        osUser,
        database: dbName,
        before,
        after: role,
      }),
    ],
  );
  let secret = null;
  if (withTotp) {
    secret = base32(randomBytes(20));
    // Same envelope as src/common/crypto/sealed-box.ts (AES-256-GCM, user id as associated data).
    const key = createHash("sha256")
      .update(
        process.env.MFA_ENCRYPTION_KEY ?? "dev-only-insecure-admin-mfa-key-do-not-use-in-prod",
      )
      .digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(userId, "utf8"));
    const ct = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const sealed = ["v1", iv, cipher.getAuthTag(), ct]
      .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
      .join(".");
    await client.query(
      `INSERT INTO admin_mfa_factors (id, user_id, secret_ciphertext, confirmed_at, created_at, updated_at)
       VALUES (uuidv7(), $1, $2, now(), now(), now())
       ON CONFLICT (user_id) DO UPDATE SET secret_ciphertext = EXCLUDED.secret_ciphertext,
         confirmed_at = now(), last_used_step = NULL, pending_secret_ciphertext = NULL,
         pending_created_at = NULL, updated_at = now()`,
      [userId, sealed],
    );
    await client.query("DELETE FROM admin_recovery_codes WHERE user_id = $1", [userId]);
    await client.query(
      `INSERT INTO audit_logs (id, actor_type, action, target_type, target_id, metadata, created_at)
       VALUES (uuidv7(), 'system', 'admin.mfa_enrolled', 'user', $1, $2, now())`,
      [userId, JSON.stringify({ source: "seed-platform-admin", osUser, database: dbName })],
    );
  }
  await client.query("COMMIT");
  console.log(`platform role ${role} granted to ${email} (user ${userId})`);
  if (secret) {
    console.log(`TOTP enrolled. Secret (shown once): ${secret}`);
    console.log(
      `otpauth://totp/${encodeURIComponent(`GuGu Admin:${email}`)}?secret=${secret}&issuer=GuGu%20Admin&algorithm=SHA1&digits=6&period=30`,
    );
    console.log(`Current code: node scripts/totp-code.mjs ${secret}`);
  }
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}

function base32(buf) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += A[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += A[(value << (5 - bits)) & 31];
  return out;
}
