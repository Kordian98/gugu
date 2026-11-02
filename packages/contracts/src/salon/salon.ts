import { z } from "zod";
import { salonRoleSchema } from "../auth/auth";
import { uuidV7Schema } from "../common/ids";

/** Minimal salon read models for the workspace shell (topic 07 extends them). */

export const salonParamsSchema = z.object({ salonId: uuidV7Schema });

export const salonSummarySchema = z.object({
  id: uuidV7Schema,
  organizationId: uuidV7Schema,
  slug: z.string(),
  name: z.string(),
  status: z.enum(["draft", "pending_review", "active", "suspended", "closed"]),
  timezone: z.string(),
  /** The caller's effective role in this salon. */
  myRole: salonRoleSchema,
  /** The caller's effective permissions (for UI gating only; the API enforces). */
  myPermissions: z.array(z.string()),
});
export type SalonSummary = z.infer<typeof salonSummarySchema>;

export const updateSalonProfileInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
});
export type UpdateSalonProfileInput = z.infer<typeof updateSalonProfileInputSchema>;

export const salonMemberItemSchema = z.object({
  id: uuidV7Schema,
  userId: uuidV7Schema,
  role: salonRoleSchema,
  status: z.enum(["invited", "pending_verification", "active", "removed"]),
  displayName: z.string().nullable(),
});
export const salonMemberListSchema = z.object({ items: z.array(salonMemberItemSchema) });
export type SalonMemberList = z.infer<typeof salonMemberListSchema>;
