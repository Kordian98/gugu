# NestJS module template

```
apps/api/src/modules/<name>/
  <name>.module.ts           # wires providers; exports only the facade
  <name>.controller.ts       # HTTP: Zod-validated input, permission decorator, one use-case call
  <name>.facade.ts           # public API for other modules, jobs and agent tools
  application/
    <verb>-<noun>.use-case.ts   # one class per use-case; transaction boundary lives here
  domain/
    <rule>.ts                # pure functions/classes; may use packages/domain
  infrastructure/
    <name>.repository.ts     # Prisma / raw SQL; every tenant method takes TenantContext
  events/
    <name>.events.ts         # event names + payload schemas (from contracts)
  <name>.e2e-spec.ts         # includes a cross-tenant 403/404 case
```

Rules
- The controller never touches the repository directly.
- A use-case that writes and must trigger side effects records an outbox event inside the same transaction. The BullMQ relay publishes it after commit.
- Facade methods take/return `contracts` types, never Prisma types.
- Jobs in `apps/api/src/jobs/` stay thin: parse payload → call facade.
