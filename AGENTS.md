# GuGu — agent entry point

GuGu Studio is a SaaS for Vietnamese beauty & wellness salons (SaaS-first; the marketplace comes later, X19/X23): one universal Expo app (iOS, Android, web) in `apps/app`, a NestJS API in `apps/api`, shared packages in `packages/`. The project is AI-first — read `docs/ai-first-conventions.md` before adding anything.

## Status
SaaS core built (CRM, booking engine, Zalo bot, notifications, admin, AI import/assistant); see the Steps table in `docs/tasks/00-roadmap.md`. Topic specs live in `docs/tasks/`; build order and cross-topic resolutions live in `docs/tasks/00-roadmap.md`; product decisions pending in `docs/tasks/open-questions.md`.

## Live tracker (mandatory)
The Claude artifact **GuGu Roadmap** (https://claude.ai/artifact/CkweFTJGUNC1M9hoCAmwn3) is the source of truth for milestone status and product questions. Every agent loads the `roadmap-tracker` skill and updates it at the start and end of each task, when blocked, and when it needs a decision.

## Where things are
- `docs/tasks/` — task specs per topic (01–13)
- `docs/domains/` — durable domain docs
- `docs/adr/` — architecture decision records
- `.claude/agents/` — domain subagents; delegate domain work to them
- `.claude/skills/` — domain skills; load the relevant one before editing that domain

## Non-negotiables
- One universal frontend (Expo + Expo Router). No Next.js, no WebView apps.
- Backend is the source of truth for availability and authorization.
- Every tenant-owned record is scoped to a salon; enforce in the backend.
- No hardcoded UI strings; vi is the default locale, en is second.
- Customers pay at the salon; no customer payment processing in MVP.
- Never mark a feature complete when only its UI exists.
