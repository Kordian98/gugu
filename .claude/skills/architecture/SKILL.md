---
name: architecture
description: GuGu monorepo conventions and procedures. Use when adding a package, a NestJS module, an API endpoint, a shared Zod contract, an ADR, or when upgrading Expo/NestJS/Prisma, changing tsconfig/ESLint/Turborepo config, or checking package boundaries and engineering rules.
---

# GuGu architecture

Full spec: `docs/tasks/01-architecture.md`. Ownership map: `references/ownership.md`. Git workflow: `references/git-workflow.md`.

## When to use
- Creating or changing anything in `packages/*`, root config, the app or API shell.
- Adding a backend module or endpoint, or a shared schema.
- Making a decision another agent must follow (→ ADR).
- Reviewing a change for boundary or engineering-rule violations.
- Branching, committing or merging (→ `references/git-workflow.md`).

## Invariants
- MUST: one frontend (`apps/app`, Expo + Expo Router) for iOS, Android and web. MUST NOT add Next.js, a second React app, or WebView shells.
- MUST: request/response shapes defined once as Zod in `packages/contracts/src/<domain>/` (there is no `packages/validation` or `packages/types`; X3). MUST NOT hand-write types that duplicate a schema, or hand-edit `packages/api-client` (it is generated).
- MUST: business rules in `packages/domain/src/<area>/` (pure: booking math, permission matrix, metric registry) or a module's `domain/`. MUST NOT put pricing, availability or commission logic in UI components.
- MUST: backend modules call each other only through `*.facade.ts` or domain events. MUST NOT import another module's repository, Prisma model access or `infrastructure/`.
- MUST: every tenant repository method takes a `TenantContext`. Reason: tenant isolation is enforced by types, not by convention.
- MUST: errors as RFC 9457 problem+json with a stable `code`; cursor pagination; `Idempotency-Key` on non-repeatable mutations; UUIDv7 IDs; integer VND; UTC `timestamptz`.
- MUST NOT: access `window`, `document` or `localStorage` at module scope in `apps/app` (breaks server rendering).
- MUST NOT: add pre-release dependencies without an accepted ADR. Use `npx expo install` for Expo-managed packages.

## Procedures

### Add a backend module
1. Copy the layout in `references/module-template.md` into `apps/api/src/modules/<name>/`.
2. Define schemas in `packages/contracts/src/<name>/` and export them from the package index.
3. Implement use-cases in `application/`, a repository in `infrastructure/`, and the public API in `<name>.facade.ts`.
4. Register the module in `app.module.ts`. Add the owner to `references/ownership.md`.
5. Add e2e tests including a tenant-isolation case.
6. Create or update `docs/domains/<name>.md` and add it to `docs/llms.txt`.

### Add an endpoint
1. Add input/output Zod schemas in `contracts`.
2. Controller: `@ZodBody/@ZodQuery` (via the global Zod pipe), permission decorator (05), call one use-case, return the output schema.
3. Regenerate OpenAPI → `docs/api/openapi.json` → `pnpm --filter api-client generate`.
4. Add tests: happy path, validation error, forbidden (another tenant).
5. If the product AI agent should use it, add a tool in `packages/agent-tools` (see topic 08).

### Add a shared package
1. `packages/<name>/` with `package.json` (`"private": true`, `exports`), and a `tsconfig.json` that extends `@gugu/config/tsconfig.base.json`.
2. Add its allowed imports to the boundary config (`packages/config/dependency-cruiser.cjs`) and to §3.2 of the spec.
3. Add an owner in `references/ownership.md`.

### Write an ADR
Copy `references/adr-template.md` to `docs/adr/NNNN-<slug>.md` (next number), set Status `proposed`, link it from `docs/llms.txt`. Set it to `accepted` when the owner (or the product owner, for product trade-offs) agrees.

### Branch, commit, merge (local, no remote yet)
1. The orchestrator creates the worktree: `git worktree add ../gugu-wt/<agent>/<milestone>-<slug> -b <agent>/<milestone>-<slug> main`. Work only there.
2. Commit: `<type>(<scope>): <summary>` + `Why:` + `Refs: <milestone>` + the `Co-Authored-By` trailer.
3. Gate: `git rebase main` → `pnpm verify` → `pnpm agents:check` → required reviewer agents (table in `references/git-workflow.md`).
4. Only the orchestrator merges (`--no-ff`, serially), re-verifies `main`, removes the worktree, and **right after the merge** sets the task `done` in the live tracker (GuGu Roadmap artifact, `roadmap-tracker` skill) and syncs `docs/tasks/tracker-inbox.jsonl`.
   Agents set their own task `doing`/`blocked` at start or when stuck; never `done`.
5. Never `--no-verify`, never rewrite `main`, never touch another agent's worktree.

### Upgrade Expo SDK / NestJS / Prisma
1. Spike branch; run `npx expo install --fix` (Expo) or bump the version in one PR per tool.
2. Run the full gates plus iOS/Android dev builds.
3. Update the version table in `docs/tasks/01-architecture.md` §4.1 and ADR-0001 (amend or supersede).

## Before-PR checklist
- [ ] `pnpm verify` green in the worktree, rebased on `main`
- [ ] API client regenerated; no diff
- [ ] Boundaries check green; no new cross-module imports
- [ ] No literal UI strings, no `any` without a `// reason:` comment
- [ ] Domain doc Status table, skill and agent updated if conventions changed; `pnpm agents:check` green
- [ ] ADR added for new decisions
- [ ] Commits follow the convention, with the `Co-Authored-By` trailer
- [ ] Required reviewer agents ran; no blocking findings
- [ ] Tracker task status/note is current (or the change is in `tracker-inbox.jsonl`)
