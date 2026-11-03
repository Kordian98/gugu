# e2e/web — GuGu web E2E (Playwright)

Browser journeys against a real stack: production Expo web export, NestJS API + BullMQ worker,
Postgres/PostGIS, Valkey, Mailpit, built-in Zalo emulator. Chromium and WebKit. Use it before
approving any branch that touches `apps/app/**` or user-facing `apps/api/**` behaviour.

## Run

```sh
pnpm stack:up      # shared Compose services: Postgres 15432, Valkey 16379, Mailpit 18025
pnpm e2e:web       # boots its own API/worker/web, seeds, runs everything; last line STATUS: ok|fail
pnpm --filter @gugu/e2e-web exec playwright test tests/zalo.spec.ts --project=chromium   # one file
```

Reports: `reports/e2e-web/junit.xml`, `reports/e2e-web/html/`, traces and screenshots of failures in
`reports/e2e-web/artifacts/` (open with `pnpm --filter @gugu/e2e-web exec playwright show-trace <zip>`).
Full run ≈ 75 s cold (≈ 30 s of it is the web export).

Local iteration: `E2E_REUSE_WEB=1` keeps a web server already on :8460 (skips the export; rebuild
after app changes by stopping it). `E2E_WEB_MODE=dev` uses the Metro dev server instead of the export.

## Isolation (MUST)

| Thing | E2E value | Never |
|---|---|---|
| Database | `gugu_e2e` — dropped and recreated every run | `gugu` (dev), `gugu_test` (integration) |
| Redis | DB 14, flushed every run | 0 (dev), 15 (integration) |
| API / worker | :3460, env built from scratch (no `.env`) | :3002 |
| Web | :8460 | :8097, :8094 |
| Mail | Mailpit, every address `*@e2e.gugu.test`; cleared per run by that domain only | dev mail |

`stack/config.mjs` is the single source of these values and refuses the dev ones. Parallel worktrees can move off the shared defaults with `E2E_PG_DATABASE=gugu_<suffix>`, `E2E_REDIS_DB`, `E2E_API_PORT` and `E2E_WEB_PORT` (Mailpit is shared: other runs clear `*@e2e.gugu.test`).
`stack/config.mjs` is the single source of these values and refuses the dev ones. A parallel
worktree can run its own copy with `E2E_DATABASE=gugu_<suffix>_e2e E2E_REDIS_DB=<n> E2E_API_PORT=… E2E_WEB_PORT=…`.
`ANTHROPIC_API_KEY` is passed through only if you export it; by default the assistant is "not
configured" and no LLM is called. Zalo runs on the emulator (`ZALO_CLIENT=emulated`).

## Seed (deterministic)

`global-setup.ts` → `support/seed.ts`, through the public API only. One salon per Playwright
project × spec area (`roles`, `zalo`, `admin`, `assistant`, `mobile`, `en`, `multi`, `basic`), so parallel
project × spec area (`roles`, `zalo`, `admin`, `assistant`, `mobile`, `en`, `multi`, `payroll`), so parallel
files never share an account or a salon. Fixed names, emails (`owner-<area>.<project>@e2e.gugu.test`),
phones and wall-clock times (Lan 10:00, Mai 11:00, salon hours 08:00–22:00, Asia/Ho_Chi_Minh);
only the date is "today in VN" because the engine refuses past times. IDs are in `.e2e/seed.json`.
The `basic` salon is moved from its trial to the free Basic year (X25) through the admin API by a setup-only admin (`admin-setup.<project>@…`), so the test admin's magic links and TOTP steps stay untouched. The platform admin is granted with `apps/api/scripts/seed-platform-admin.mjs --with-totp`; step-up
codes come from `apps/api/scripts/totp-code.mjs` (`support/totp.ts`).

Rate-limit budget: magic-link issue/verify allow 30 per IP per 15 min. Browser sign-ins use
127.0.0.1 (≈ 26 per run); seed sign-ins send `X-Forwarded-For: 10.77.<n>.1` (the backend runs with
`TRUST_PROXY=loopback`) so they get their own buckets. A magic link is capped at 3 per email per
15 min: one sign-in per account per test file. Add a new area rather than reusing another file's
accounts.

## Writing tests

- Selectors: `testID` (→ `data-testid`) first, then role + translated name via `support/i18n.ts`
  (`t("vi", "crm:nav.items.calendar")`). Never hardcode UI copy; never select by CSS class.
- Hydration: the web export is server-rendered; use `tap()` / `fillField()` from `support/ui.ts`,
  which wait for React to own the node (input typed before hydration is lost).
- No sleeps: web-first `expect`, `expect.poll` (Mailpit), counts of matching bot bubbles (Zalo).
- Every journey in vi; `smoke-en.spec.ts` covers en.
- Known product bugs: a test asserting the correct behaviour, marked `test.fail()` with an `issue`
  annotation (it turns red when the bug is fixed — then drop `test.fail()`).
- Flaky: tag `@quarantine` and add a line to `docs/runbooks/quarantine.md`.

## Specs

| File | Proves |
|---|---|
| `owner-journey.spec.ts` | registration → wizard → service with staff checkboxes → earliest-slot booking → drag-reschedule → cancel; customer emails + drawer messages timeline |
| `roles.spec.ts` | receptionist invite by email + join, all bookings with phones; staff "my day" own scope + phone; API refuses other staff's booking and another tenant |
| `zalo.spec.ts` | OA connect via emulator OAuth; bot booking appears in calendar; hand-off in inbox; take-over + reply reaches the customer |
| `multi-service.spec.ts` | 2-service chain with two staff: plan, calendar parts, drawer lines, email |
| `assistant.spec.ts` | bubble opens; "not configured" without a key |
| `admin.spec.ts` | TOTP-enrolled super admin extends a trial; high-risk suspend needs step-up; owner sees banner and `/admin` denied |
| `mobile.spec.ts` | 390×844 business panel: tabs, agenda, new-appointment sheet, no horizontal overflow |
| `smoke-en.spec.ts` | en sign-in and panel copy |
| `payroll.spec.ts` | owner payroll (note, totals = API), adjustment needs a reason, close + audited reopen, This-month tiles = registry values; staff 403 on payroll and own estimate only (API) |
