---
name: run-locally
description: Boot the full GuGu stack locally (Postgres+PostGIS, Redis, MinIO, Mailpit, provider-sink, API, workers, Expo app) and verify it on web, iOS simulator and Android emulator. Use when asked to run, start, demo, or screenshot the app, to confirm a change works end to end, or when the local environment is broken.
---

# Run GuGu locally and verify all platforms

> Status: commands below are the **target contract** from `docs/tasks/13-platform-devops.md` (M13.1, M13.3). Until those milestones land, check `package.json` scripts and update this file when they diverge.

## When to use
- Verifying a feature works in the real app, not only in tests.
- Reproducing a bug reported on web/iOS/Android.
- Fresh machine or broken environment.

## Invariants
- Localhost is the only environment for now (no staging/AWS). MUST NOT call real providers: provider-sink emulates push, `zalo_template` (ZBS Template Message), `zalo_oa` and an SMS mock; Mailpit catches email.
- MUST use the deterministic seed; refer to seed entities by their fixed slugs/IDs (`docs/domains/platform-devops.md#seed`).
- `make reset` / `pnpm reset --yes` only ever touches local Docker volumes.

## Procedure: boot

1. Prerequisites: Node (version in `.nvmrc`), pnpm (via corepack), Docker running. For native: Xcode + iOS simulator (macOS), Android Studio + an emulator image.
2. `cp .env.example .env` if `.env` is missing (never commit `.env`).
3. `pnpm bootstrap` — installs deps, `docker compose up -d --wait`, runs migrations, seeds. Ends with `STATUS: ok` and prints URLs.
4. `pnpm dev` — runs API, worker, and Expo dev server (Turborepo).
5. Check readiness: `curl -s localhost:3000/api/v1/health/ready` → every dependency `up`.

| Service | URL |
|---|---|
| API / Swagger | http://localhost:3000/api/v1 · http://localhost:3000/api/docs |
| Web app | http://localhost:8081 (redirects to `/vi`) |
| Mailpit (emails) | http://localhost:8025 |
| MinIO console | http://localhost:9001 |
| Provider sink (push / `zalo_template` / `zalo_oa` / SMS mock) | http://localhost:4010/messages |

## Procedure: verify web
1. Open `http://localhost:8081/vi` and `/en`; confirm locale strings differ and no raw keys (`booking.bookNow`) render.
2. For a screenshot or interaction, use Playwright: `pnpm e2e:web` (own stack, see `e2e/web/README.md`) or a browser tool.
3. Check the browser console for errors.

## Procedure: verify Android
1. Start an emulator. Build/install dev client once: `pnpm --filter app exec expo run:android` (or install the EAS `development` build).
2. The app reaches the API at `http://10.0.2.2:3000` (emulator) — set via `EXPO_PUBLIC_API_URL` in `.env` (use the LAN IP for a physical device).
3. Optional automated smoke: `maestro test e2e/native/smoke.yaml`.

## Procedure: verify iOS (macOS only)
1. `pnpm --filter app exec expo run:ios` (simulator; no Apple account needed) or install the EAS `development` simulator build.
2. Simulator reaches the API at `http://localhost:3000`.
3. Optional: `maestro test e2e/native/smoke.yaml`.
4. Physical iPhone requires an Apple Developer account and an EAS dev build — report if unavailable instead of guessing.

## Procedure: log in as a seed user
1. Request OTP for a seed phone (see `docs/domains/platform-devops.md#seed`).
2. Read the OTP from provider-sink: `curl -s 'localhost:4010/messages?to=<phone>&latest=1'`.
3. Seed roles available: customer (vi), customer (en), owner, manager, receptionist, staff, super_admin.

## Procedure: deep links
- Android: `adb shell am start -a android.intent.action.VIEW -d "gugu://vi/salon/<seed-slug>"`
- iOS: `xcrun simctl openurl booted "gugu://vi/salon/<seed-slug>"`
- Universal/App Links need a deployed domain with AASA/assetlinks — not testable until staging exists (13-M13.6); use the custom scheme locally.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `health/ready` shows postgres down | `docker compose ps`; `docker compose logs postgres`; port 5432 clash with a host Postgres |
| Migration drift error | `pnpm --filter api prisma migrate status`; never edit applied migrations |
| Android can't reach API | Use `10.0.2.2` or LAN IP; check `adb reverse tcp:3000 tcp:3000` |
| Metro cache weirdness | `pnpm --filter app exec expo start -c` |
| Need a clean slate | `pnpm reset --yes && pnpm bootstrap` |

## Report back
List which platforms were verified, the exact commands, what was observed (screens, URLs, status lines), and anything not verified with the reason (e.g. no Xcode on this machine).
