import { ENTITY_TOKEN_RE, type EntityTokenKind } from "@gugu/contracts";
import type { PrismaService } from "../../../infrastructure/prisma/prisma.service";

/**
 * Per-conversation pseudonyms (spec 08 §4.3 step 2). Tokens are sequential per kind within one
 * conversation (`staff_1`, `staff_2`…), never derived from database ids, and resolve only inside
 * the conversation (and so the salon) that issued them. The map stores entity ids, never names.
 */
export class TokenVault {
  private readonly byToken = new Map<string, { kind: EntityTokenKind; id: string }>();
  private readonly byEntity = new Map<string, string>();
  private readonly pending: { token: string; kind: EntityTokenKind; id: string }[] = [];

  private constructor(
    private readonly prisma: PrismaService,
    readonly salonId: string,
    readonly conversationId: string,
  ) {}

  static async load(prisma: PrismaService, salonId: string, conversationId: string) {
    const vault = new TokenVault(prisma, salonId, conversationId);
    const rows = await prisma.assistantEntityToken.findMany({
      where: { salonId, conversationId },
      select: { token: true, entityType: true, entityId: true },
    });
    for (const r of rows) vault.remember(r.token, r.entityType as EntityTokenKind, r.entityId);
    return vault;
  }

  /** The token for an entity, issuing the next one of its kind on first use. */
  tokenFor(kind: EntityTokenKind, id: string): Promise<string> {
    const existing = this.byEntity.get(`${kind}:${id}`);
    if (existing) return Promise.resolve(existing);
    const n = [...this.byToken.values()].filter((v) => v.kind === kind).length + 1;
    const token = `${kind}_${String(n)}`;
    this.remember(token, kind, id);
    this.pending.push({ token, kind, id });
    return Promise.resolve(token);
  }

  /** Entity id behind a token of the expected kind, or null (unknown, other kind, other chat). */
  resolve(token: string, kind: EntityTokenKind): string | null {
    if (!ENTITY_TOKEN_RE.test(token)) return null;
    const hit = this.byToken.get(token);
    return hit && hit.kind === kind ? hit.id : null;
  }

  entries(): { token: string; kind: EntityTokenKind; id: string }[] {
    return [...this.byToken.entries()].map(([token, v]) => ({ token, ...v }));
  }

  /** Persists tokens issued since the last flush. */
  async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const rows = this.pending.splice(0);
    await this.prisma.assistantEntityToken.createMany({
      data: rows.map((r) => ({
        salonId: this.salonId,
        conversationId: this.conversationId,
        token: r.token,
        entityType: r.kind,
        entityId: r.id,
      })),
      skipDuplicates: true,
    });
  }

  private remember(token: string, kind: EntityTokenKind, id: string) {
    this.byToken.set(token, { kind, id });
    this.byEntity.set(`${kind}:${id}`, token);
  }
}
