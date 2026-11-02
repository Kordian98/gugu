# 0001 — Toolchain baseline

- **Status:** accepted
- **Date:** 2026-11-02
- **Owner:** architecture · **Topic:** 01 (01-A1/A2)

## Context
Agents need one version baseline (spec 01 §4.1, gaps G1/G4/G5/G16/G17). Versions were verified on npm, nodejs.org and on this machine on 2026-11-02. Product owner: pre-release libraries are allowed only if pinned; localhost only; no git remote.

## Decision
| Tool | Pinned | Notes |
|---|---|---|
| Node.js | 26 LTS (`.nvmrc` = 26, `engines >=26`) | machine has 26.5.0 |
| pnpm | **10.26.2** (`packageManager`) | Spec suggested 11.x. 10.26.2 is what is installed and works with Expo/Metro here (no corepack on this Mac). Moving to pnpm 11/12 is a separate PR. |
| Turborepo | 2.11.10 | local cache only (no remote) |
| TypeScript | ~6.0.3 | Expo SDK 58 template version; typescript-eslint supports <6.1 |
| Expo SDK | 58 (expo ~58.0.22, expo-router ~58.0.29) | RN 0.88.1, React 19.3.0, RNW ~0.21.4, Reanimated 4.7.1, Worklets 0.13.0 |
| Styling | NativeWind 5.0.0-rc.1 / Tailwind 4.1.12 | ADR-0004 |
| ESLint | **9.39.5** (not 10) | `eslint-config-expo@58.0.4` plugins (`eslint-plugin-import`, `eslint-plugin-react`) do not accept ESLint 10 yet |
| typescript-eslint | 8.72.1 | `strictTypeChecked` |
| Prettier | 3.9.10 | |
| dependency-cruiser | 18.7.1 | package boundaries (`pnpm boundaries`) |
| Vitest | 5.0.5 | unit tests in packages |
| Zod | 4.6.7 | `packages/contracts` |
| TanStack Query | 5.105.1 | |
| NestJS / Prisma | 12.x / 7.10.x | pinned when the API shell lands (01-A4); never Prisma 8 rc without an ADR |

Rules:
- Expo-managed packages are added with `npx expo install` (from `apps/app`), so they match the SDK.
- Every non-Expo dependency is pinned exactly; pre-releases need an ADR.
- pnpm uses the default isolated linker. Build scripts are allow-listed in `pnpm-workspace.yaml` (`onlyBuiltDependencies`).

## Alternatives considered
- pnpm 11/12: not installed locally; no blocker found with 10.26.2. Revisit with corepack.
- ESLint 10: blocked by Expo's lint config peer ranges.

## Consequences
- `pnpm verify` is reproducible with the pinned set.
- Upgrade path per tool: spike branch → `pnpm verify` → web export + native dev builds → amend this ADR.
