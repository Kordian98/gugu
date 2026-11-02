# Ownership map

Every path has exactly one owning agent. Shared paths name a primary owner; others propose changes through the orchestrator. Agent names marked *(planned)* are created by their topic; check `.claude/agents/`. `pnpm agents:check` validates this file.

| Path | Owner agent | Topic |
|---|---|---|
| root config, `packages/config/**`, `packages/api-client/**` (generated), `docs/adr/**`, `docs/llms.txt` | architecture | 01 |
| `packages/contracts/**` | architecture (structure); each domain owns its subfolder `contracts/src/<domain>/` | 01 + domain |
| `apps/app/app/_layout.tsx`, `apps/app/src/providers/**` | architecture | 01 |
| `apps/api/src/main.ts`, `apps/api/src/common/**`, `apps/api/src/app.module.ts` | architecture | 01 |
| `packages/design-system/**`, `apps/app/src/features/home/hero3d/**` | design-system *(planned)* | 02 |
| `packages/localization/**` | localization *(planned)* | 03 |
| `apps/api/prisma/**`, `apps/api/src/infrastructure/{prisma,s3}/**`, `modules/media/**` | backend-database *(planned)* | 04 |
| `modules/{auth,users}/**`, `apps/api/src/common/guards/**` (tenant/RBAC) | auth-security *(planned)* | 05 |
| `packages/domain/src/booking/**`, `modules/{availability,bookings}/**` | booking-engine *(planned)* | 06 |
| `modules/{salons,staff,services,customers,metrics}/**`, `apps/app/app/[locale]/(business)/**`, `apps/app/app/[locale]/(staff)/**` | salon-crm *(planned)* | 07 |
| `packages/agent-tools/**` (framework), `modules/assistant/**` | ai-agent *(planned)* | 08 |
| `modules/zalo/**` | zalo *(planned)* | 09 |
| `modules/{search,categories,locations}/**`, `apps/app/app/[locale]/(public)/**` | marketplace *(planned)* | 10 |
| `modules/{reviews,favorites,notifications}/**`, `apps/app/app/[locale]/(customer)/**` | customer-notifications *(planned)* | 11 |
| `modules/{attribution,subscriptions,analytics,administration}/**`, `apps/app/app/[locale]/(admin)/**` | monetization-admin *(planned)* | 12 |
| `infra/**`, `.github/**`, `apps/app/eas.json`, `e2e/**` | platform-devops *(planned)* | 13 |
