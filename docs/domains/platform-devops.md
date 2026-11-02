# Platform & DevOps

Durable reference for how GuGu is built, run, tested, deployed, and observed. Read this when you need to know where something runs, how to ship it, or how to recover it. Requirements live in `docs/tasks/13-platform-devops.md`; this doc describes what actually exists. Owner: `platform-devops` subagent.

> Status: skeleton — sections are filled as milestones M13.1–M13.9 land. Mark unbuilt items **NOT IMPLEMENTED**.

## Environments
| Env | Purpose | URL | App IDs | Data |
|---|---|---|---|---|
| local | development | localhost | `vn.gugu.app.dev` | deterministic seed |
| preview | per-PR web+API | NOT IMPLEMENTED | — | seed |
| staging | internal testing | NOT IMPLEMENTED (`staging.gugu.vn`) | `vn.gugu.app.staging` | seed + test data |
| production | live | NOT IMPLEMENTED (`gugu.vn`) | `vn.gugu.app` | real |

## Local stack
- Compose services, ports, volumes: NOT IMPLEMENTED
- Scripts (`bootstrap`, `dev`, `reset`, `verify`): NOT IMPLEMENTED
- Provider sink API: NOT IMPLEMENTED

## Seed
Fixed IDs/slugs/phones for each seed entity (salons, roles, customers). NOT IMPLEMENTED.

## Native builds (EAS)
- `eas.json` profiles ↔ environments ↔ update channels: NOT IMPLEMENTED
- Credentials (APNs, FCM): managed by EAS — NOT IMPLEMENTED
- OTA update policy & rollback: NOT IMPLEMENTED

## Deep links
- Scheme, associated domains, path patterns, AASA/assetlinks location: NOT IMPLEMENTED

## CI/CD
- Workflows and tiers (T0–T3): NOT IMPLEMENTED
- Claude PR review: NOT IMPLEMENTED
- Deploy pipeline & approvals: NOT IMPLEMENTED

## Hosting
- Decision ADR: pending (`docs/adr/`)
- Topology diagram: NOT IMPLEMENTED

## Observability
- Sentry projects, log sink, dashboards, alerts → runbooks: NOT IMPLEMENTED

## Backups & DR
- PITR, logical dumps, restore drill log: NOT IMPLEMENTED

## Secrets
- Where each secret class lives: NOT IMPLEMENTED

## Decisions
| ADR | Title | Status |
|---|---|---|
| — | Hosting provider & region (SG; VN residency open) | pending |
| — | Native E2E tool: Maestro | proposed |
