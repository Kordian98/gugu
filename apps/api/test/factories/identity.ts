import type { INestApplication } from "@nestjs/common";
import type { SalonRole } from "@gugu/domain";
import type { PrismaService } from "../../src/infrastructure/prisma/prisma.service";
import { SessionService } from "../../src/modules/auth/auth.facade";

/** Unique fixture email (never a real address). */
export const testEmail = (tag = "user"): string =>
  `${tag}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}@test.gugu.local`;

export interface SalonFixture {
  salonId: string;
  organizationId: string;
  ownerUserId: string;
}

/**
 * Creates a verified owner + organisation + draft salon (stub location from the identity
 * migration). No subscription: tests that need one start the trial themselves.
 */
export async function createSalonFixture(
  prisma: PrismaService,
  name = "Fixture Salon",
): Promise<SalonFixture> {
  const ward = await prisma.location.findFirstOrThrow({
    where: { level: "ward" },
    select: { id: true, parentId: true },
  });
  const owner = await prisma.user.create({
    data: { email: testEmail("owner"), emailVerifiedAt: new Date(), profile: { create: {} } },
  });
  const suffix = Math.random().toString(36).slice(2, 10);
  const org = await prisma.organization.create({
    data: {
      name,
      slug: `fixture-org-${suffix}`,
      ownerUserId: owner.id,
      members: { create: { userId: owner.id, role: "org_owner" } },
    },
  });
  const salon = await prisma.salon.create({
    data: {
      organizationId: org.id,
      slug: `fixture-salon-${suffix}`,
      name,
      ownerUserId: owner.id,
      location: {
        create: { addressLine: "1 Test St", wardId: ward.id, provinceId: ward.parentId ?? "" },
      },
      members: { create: { userId: owner.id, role: "owner" } },
    },
  });
  return { salonId: salon.id, organizationId: org.id, ownerUserId: owner.id };
}

/** Adds a verified user with a direct salon role (no organisation role). */
export async function addSalonMember(
  prisma: PrismaService,
  salonId: string,
  role: SalonRole,
): Promise<string> {
  const user = await prisma.user.create({
    data: { email: testEmail(role), emailVerifiedAt: new Date(), profile: { create: {} } },
  });
  await prisma.salonMember.create({ data: { salonId, userId: user.id, role } });
  return user.id;
}

/** Native bearer token for a user (real session row; exercises the real guard). */
export async function bearerFor(app: INestApplication, userId: string): Promise<string> {
  const session = await app.get(SessionService).create(userId, "native", {
    ipPrefix: null,
    userAgent: "vitest",
  });
  if (session.kind !== "native") throw new Error("expected native session");
  return `Bearer ${session.tokens.accessToken}`;
}
