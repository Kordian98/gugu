# 0011 — Platform-admin TOTP step-up bound to the session

- **Status:** proposed
- **Date:** 2026-11-03
- **Owner:** auth-security · **Topic:** 05 (step 9); supersedes ADR-0010 decision 3 ("step-up = recent sign-in")

## Context
ADR-0010 shipped the admin panel with a cheap stand-in for step-up: high-risk writes needed a session created in the last 15 minutes. That proves only that the admin recently completed an email magic link; whoever controls the admin mailbox passes it. Spec 05 G18 and owner answer q72 ask for passkeys with TOTP as backup. Passkeys need WebAuthn on web and native (`@simplewebauthn/server` plus platform modules) and a relying-party/domain decision; TOTP needs nothing but the API and an authenticator app, so it ships first.

## Decision
1. **Enrolment is mandatory before any admin write.** `AdminActions.run` calls `AdminMfaService.assertWriteAllowed`: no confirmed factor → 403 `admin.mfa_enrollment_required`. Reads stay open so the admin can reach `/admin/security`.
2. **TOTP per RFC 6238** (SHA-1, 30 s, 6 digits, ±1 step), implemented in `apps/api/src/modules/auth/mfa/totp.ts` (no dependency; tested against the RFC vectors). The 160-bit secret is sealed with AES-256-GCM under `MFA_ENCRYPTION_KEY` (separate from `AUTH_SECRET`), with the user id as associated data, and is shown only once, at enrolment. A first enrolment needs a sign-in within 15 minutes; replacing a factor needs an active step-up. A (re-)enrolment stays pending until its first code is confirmed, so the old factor keeps working meanwhile.
3. **Recovery codes:** 10 per enrolment, `xxxxx-xxxxx` Crockford base32 (50 bits), stored only as HMAC-SHA256(`AUTH_SECRET`, user id ‖ normalised code), single-use (conditional update), regenerated with a current TOTP code.
4. **Step-up = a verified code elevates THIS session** for `ADMIN_STEP_UP_MINUTES` (10): `sessions.step_up_until`. Another session of the same admin is not elevated. Native refresh rotation keeps the session and so its elevation until it expires. Sign-out or revocation ends it.
5. **High-risk actions** (need step-up): suspend, unsuspend, founding-partner revoke, override creation, and **plan assignment**. Extending the free Basic year (X25, ADR-0015) was added later on the same grounds (it gives away paid months). Plan assignment was added because a first paid activation before the marketplace launch makes the organisation a founding partner (X20, a sticky two-year fee waiver that is never re-set automatically), and it is the money-configuration action. Trial extension, paid-until, override revoke and founding-partner grant stay without step-up (reversible, audited, and needed often during manual billing); every one still needs an enrolled factor.
6. **Brute force:** each code attempt is reserved atomically (INCR) before any comparison and refunded only on success; 5 attempts per admin per 15 minutes, then 429 for every MFA check. TOTP replay is blocked by `last_used_step` (a code is accepted only if its step is newer than the last accepted one). Every failure is audited (`admin.mfa_step_up_failed`).
7. **Admin API rate limit:** per user, 240 requests and 30 writes per minute on every `@RequirePlatformPermission` route (`ADMIN_RATE_LIMIT_PER_MINUTE`, `ADMIN_WRITE_RATE_LIMIT_PER_MINUTE`), enforced in the global `AuthGuard`.

## Alternatives considered
- Passkeys first — preferred by q72, but needs WebAuthn on three platforms and a domain decision; planned next, with TOTP kept as the backup factor.
- Elevation bound to the user instead of the session — a second (possibly stolen) session would inherit it.
- Step-up by fresh sign-in (ADR-0010) — mailbox control alone passes it.
- `otplib` — a dependency for ~60 lines of well-specified code; the RFC vectors cover the implementation.

## Consequences
- Every admin writes only after enrolment; the seed script can enrol a factor for local dev (`--with-totp`), and `apps/api/scripts/totp-code.mjs <secret>` prints the current code.
- There is no admin-assisted reset yet: an admin who loses both the device and all recovery codes is reset by a database operation (later: `platform.roles.write` flow with a second super_admin, open question in the tracker).
- No QR code is rendered yet (no QR library in the app): the panel shows the setup key and an `otpauth://` link.
- Passkeys and read-only impersonation (spec 05 step 9) remain to be built.
