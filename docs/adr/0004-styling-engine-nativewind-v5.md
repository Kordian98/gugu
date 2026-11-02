# 0004 — Styling engine: NativeWind v5 rc (pinned) on Tailwind CSS v4

- **Status:** accepted
- **Date:** 2026-11-02
- **Owner:** architecture (with design-system) · **Topic:** 01 (spike 01-A1)

## Context
The universal app needs one styling engine for iOS, Android and web (master prompt §3.1). On 2026-11-02 NativeWind's stable line is **4.2.7** (Tailwind v3), and **5.0.0-rc.1** (Tailwind v4, `react-native-css`) is a release candidate. The product owner allows pre-release libraries **if they are pinned exactly**. Design tokens are authored in TS in `packages/design-system` (02), so either engine can be generated from them.

## Spike (01-A1)
The default Expo SDK 58 template (expo 58.0.22, RN 0.88.1, React 19.3.0, RNW 0.21.4, Reanimated 4.7.1) was tested with both engines, using one test screen with Vietnamese text, `dark:` variants and an `active:` state.

| Check | NativeWind 5.0.0-rc.1 + Tailwind 4.1.12 | NativeWind 4.2.7 + Tailwind 3.4.19 |
|---|---|---|
| `expo export --platform web` with `web.output: "server"` | ✅ builds; server HTML carries classes; CSS contains utilities + `prefers-color-scheme` | ✅ builds |
| Web in a browser (headless Chrome, dark system theme) | ✅ renders, dark variant applied, Vietnamese diacritics correct | ✅ renders |
| iOS dev build on iPhone 17 Pro Max simulator (iOS 26.4, Xcode 26.4.1) | ✅ `expo run:ios` builds and renders styles correctly | not run (web parity was enough to keep it as fallback) |
| Android | ⏳ not verified: no Android SDK on this Mac | ⏳ |
| Setup cost | metro `withNativewind`, `postcss.config.mjs`, CSS imports, `lightningcss` pinned 1.30.1 | babel preset + `jsxImportSource`, `tailwind.config.js` |

Also verified in the monorepo shell (01-A3, pnpm workspace): web export + browser render with v5 rc. iOS: see `docs/domains/architecture.md` Status.

Spike pitfall: a dev build compiled with `--no-bundler` loads from port 8081. On this machine another project's Metro occupied 8081, so the app loaded a foreign bundle and crashed with `TurboModuleRegistry.getEnforcing(...): 'PlatformConstants' could not be found`. Fix: build with `--port <free port>`. This is not a NativeWind problem.

## Decision
- MUST use **`nativewind@5.0.0-rc.1`** + **`react-native-css@3.1.0-rc.1`** + **`tailwindcss@4.1.12`** + **`@tailwindcss/postcss@4.1.12`**, all pinned exactly (no `^`/`~`).
- MUST pin `lightningcss@1.30.1` via `pnpm.overrides` in `pnpm-workspace.yaml` (NativeWind v5 requirement; otherwise `global.css` deserialization errors).
- `apps/app/global.css` imports Tailwind theme/preflight/utilities (utilities unlayered) + `nativewind/theme`. It is imported once in `app/_layout.tsx`.
- Upgrading the rc → GA is a single PR by `architecture`: bump the pins, run `pnpm verify` + web export + iOS/Android dev builds.

## Alternatives considered
- **NativeWind 4.2.7 (stable):** works on SDK 58 web, but means Tailwind v3 and a later forced migration to v4. Kept as the **fallback**: if v5 rc blocks us (native regressions, Android failures), revert to 4.2.7 + Tailwind 3.4 following the spike setup in this ADR.
- **Tamagui / Unistyles:** strong options, but the master prompt names NativeWind, and they would be a larger deviation.

## Consequences
- Tailwind v4 CSS-first theming fits 02's plan (TS tokens → CSS variables).
- We carry rc risk. Mitigation: exact pins, fallback documented, Android verification required before Step 5 (salon UI) work depends on native styling.
- **Open:** Android verification is pending until an Android SDK/emulator is installed.
