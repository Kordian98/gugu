# Platform & DevOps

Durable reference for how GuGu is built, run, tested, merged, deployed, and observed. Read this when you need to know where something runs, how to get code onto `main`, how to ship it, or how to recover it. Requirements live in `docs/tasks/13-platform-devops.md`; this doc describes what actually exists. Owner: `platform-devops` subagent.

> Status: skeleton — filled as milestones M13.1–M13.9 land. Unbuilt items are marked **NOT IMPLEMENTED**.

## Decisions in force
- Hosting: **AWS ap-southeast-1** (ECS Fargate, RDS PostgreSQL + PostGIS/btree_gist, ElastiCache Valkey node-based, S3 + CloudFront media, SES, Secrets Manager/SSM), Cloudflare at the edge, CDK TypeScript.
- No Vietnamese legal entity yet; data residency pending legal review.
- **No git remote**: local merge gate (below). GitHub Actions design is dormant until a remote exists.
- Channel ids: `push`, `email`, `sms`, `zalo_template` (ZBS Template Message, formerly ZNS), `zalo_oa`.

## Environments
| Env | Purpose | URL | App IDs | Data |
|---|---|---|---|---|
| local | development | localhost | `vn.gugu.app.dev` | deterministic seed |
| staging | internal testing | NOT IMPLEMENTED (`staging.gugu.vn`) | `vn.gugu.app.staging` | seed + test data |
| production | live | NOT IMPLEMENTED (`gugu.vn`) | `vn.gugu.app` | real |

## Local stack
- Compose services, ports, volumes: NOT IMPLEMENTED
- Scripts (`bootstrap`, `dev`, `reset`, `verify`, `gate`, `merge-to-main`, `deploy:*`): NOT IMPLEMENTED
- Provider sink API (SMS, `zalo_template`, push, Zalo OA emulation): NOT IMPLEMENTED

## Seed
Fixed IDs/slugs/phones per seed entity (salons, roles, customers). NOT IMPLEMENTED.

## Delivery workflow (local, no remote)
- Branch `agent/<agent-slug>/<task-id>-<short>`, one worktree per agent in `../gugu-worktrees/`.
- Hooks (lefthook): pre-commit blocks `main`, lint/format staged, gitleaks; commit-msg Conventional Commits. NOT IMPLEMENTED
- Reviewer verdicts: `.git/gugu-reviews/<branch>/<reviewer>.json`, bound to HEAD SHA. Required-reviewer table: `.claude/skills/testing/SKILL.md`. NOT IMPLEMENTED
- `pnpm merge-to-main`: rebase → gate → verdict check → `--no-ff` merge → repo bundle backup. NOT IMPLEMENTED
- Repo backups (`git bundle` after each merge + daily): NOT IMPLEMENTED

## Later: remote + CI
GitHub Actions tiers calling the same scripts, `claude-code-action` reviews, OIDC deploys. NOT IMPLEMENTED (no remote).

## Native builds (EAS)
- Profiles ↔ environments ↔ update channels: NOT IMPLEMENTED
- Credentials (APNs, FCM): EAS-managed — NOT IMPLEMENTED
- OTA policy & rollback: NOT IMPLEMENTED

## Deep links
Scheme, associated domains, path patterns, AASA/assetlinks: NOT IMPLEMENTED

## AWS topology
- Accounts: `gugu-staging`, `gugu-prod`, `gugu-backup` — NOT IMPLEMENTED
- CDK stacks (`Network`, `Data`, `Services`, `Edge`, `Observability`, `Backup`): NOT IMPLEMENTED
- Diagram: NOT IMPLEMENTED

## Observability
Sentry projects, CloudWatch log groups, dashboards, alarms → runbooks: NOT IMPLEMENTED

## Backups & DR
RDS PITR, cross-account snapshot copies, S3 versioning, restore drill log: NOT IMPLEMENTED

## Secrets
Secret classes and where each lives (Secrets Manager / SSM / EAS env): NOT IMPLEMENTED

## Decisions
| ADR | Title | Status |
|---|---|---|
| — | Hosting: AWS ap-southeast-1; Cloudflare edge + CloudFront media | proposed (PO leaning AWS) |
| — | Compute: ECS Fargate (Lambda unsuitable, App Runner closed to new customers) | proposed |
| — | Queue store: ElastiCache Valkey node-based, noeviction | proposed |
| — | IaC: AWS CDK TypeScript | proposed |
| — | Local merge gate with reviewer agents (no remote) | proposed |
| — | Native E2E: Maestro | proposed |
