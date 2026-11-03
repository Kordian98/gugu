#!/usr/bin/env node
// Grants a GuGu platform role to an email (local dev only). Usage, from apps/api:
//   node --env-file=../../.env scripts/seed-platform-admin.mjs [--email admin@gugu.local] [--role super_admin|support_admin]
// Creates the user if missing (verified email, no salon membership), sets users.platform_role and
// writes an audit row. Then sign in on the web app with that email: the magic link arrives in
// Mailpit. Platform roles are NOT salon memberships; there is no API to grant them yet (topic 05
// owns `platform.roles.write`). Refuses to run in production or against a non-local database.
import pg from "pg";

if (process.env.NODE_ENV === "production") throw new Error("seed-platform-admin is dev-only");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const email = String(arg("email", "admin@gugu.local")).trim().toLowerCase();
const role = arg("role", "super_admin");
if (!["super_admin", "support_admin"].includes(role)) throw new Error(`unknown role ${role}`);
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (pass --env-file=../../.env)");
const host = new URL(url).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
  throw new Error(`refusing to grant platform roles on a non-local database (${host})`);
}

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
    [userId, JSON.stringify({ source: "seed-platform-admin", before, after: role })],
  );
  await client.query("COMMIT");
  console.log(`platform role ${role} granted to ${email} (user ${userId})`);
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
