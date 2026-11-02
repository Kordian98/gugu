import { z } from "zod";
import { emailSchema, salonRoleSchema } from "../auth/auth";
import { uuidV7Schema } from "../common/ids";

/**
 * Team, working schedules, breaks, time off and staff invitations (topic 07 M7.4; spec 04 "Staff",
 * 05 R6). Times are salon wall-clock "HH:MM"; weekdays are ISO (1 = Monday … 7 = Sunday).
 */

export const TEAM_ERRORS = {
  staffNotFound: "team.staff_not_found",
  invalidInterval: "team.invalid_interval",
  overlappingIntervals: "team.overlapping_intervals",
  invitationInvalid: "team.invitation_invalid",
  invitationEmailMismatch: "team.invitation_email_mismatch",
  alreadyMember: "team.already_member",
  seatLimitReached: "team.seat_limit_reached",
  cannotChangeOwner: "team.cannot_change_owner",
} as const;

export const STAFF_COLORS = ["lilac", "pink", "peach", "gold", "plum"] as const;
export const staffColorSchema = z.enum(STAFF_COLORS);

export const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "hh_mm");
export const weekdaySchema = z.number().int().min(1).max(7);

export const intervalSchema = z
  .object({ start: clockTimeSchema, end: clockTimeSchema })
  .refine((v) => v.start < v.end, { path: ["end"], message: "end_before_start" });
export type Interval = z.infer<typeof intervalSchema>;

/** Same-day intervals must not overlap (sorted, adjacent allowed). */
export const nonOverlapping = (list: readonly Interval[]): boolean =>
  [...list]
    .sort((a, b) => a.start.localeCompare(b.start))
    .every((v, i, arr) => i === 0 || (arr[i - 1]?.end ?? "") <= v.start);

export const dayScheduleSchema = z
  .object({
    weekday: weekdaySchema,
    intervals: z.array(intervalSchema).max(4),
    breaks: z.array(intervalSchema).max(4).default([]),
  })
  .refine((d) => nonOverlapping(d.intervals), { path: ["intervals"], message: "overlap" })
  .refine((d) => nonOverlapping(d.breaks), { path: ["breaks"], message: "overlap" });

/** Full weekly schedule; replaces the staff member's current schedule and weekly breaks. */
export const weeklyScheduleSchema = z.object({
  days: z
    .array(dayScheduleSchema)
    .max(7)
    .refine((ds) => new Set(ds.map((d) => d.weekday)).size === ds.length, "duplicate_weekday"),
});
export type WeeklySchedule = z.infer<typeof weeklyScheduleSchema>;
export type WeeklyScheduleInput = z.input<typeof weeklyScheduleSchema>;

export const timeOffSchema = z.object({
  id: uuidV7Schema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  reason: z.string().nullable(),
});
export type TimeOff = z.infer<typeof timeOffSchema>;

export const timeOffInputSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().max(200).nullable().default(null),
  })
  .refine((v) => new Date(v.startsAt) < new Date(v.endsAt), {
    path: ["endsAt"],
    message: "end_before_start",
  });
export type TimeOffInput = z.input<typeof timeOffInputSchema>;

export const invitableRoleSchema = z.enum(["manager", "receptionist", "staff"]);

export const staffMemberSchema = z.object({
  id: uuidV7Schema,
  displayName: z.string(),
  color: staffColorSchema,
  isBookable: z.boolean(),
  sortOrder: z.number().int(),
  serviceIds: z.array(uuidV7Schema),
  /** Linked account, when the person has joined. */
  member: z
    .object({
      id: uuidV7Schema,
      userId: uuidV7Schema,
      role: salonRoleSchema,
      status: z.enum(["invited", "pending_verification", "active", "removed"]),
      email: z.string().nullable(),
    })
    .nullable(),
  pendingInvitation: z
    .object({
      id: uuidV7Schema,
      email: z.string().nullable(),
      role: salonRoleSchema,
      expiresAt: z.iso.datetime(),
    })
    .nullable(),
  schedule: weeklyScheduleSchema,
  timeOff: z.array(timeOffSchema),
});
export type StaffMember = z.infer<typeof staffMemberSchema>;

export const teamSchema = z.object({ items: z.array(staffMemberSchema) });
export type Team = z.infer<typeof teamSchema>;

export const staffInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  color: staffColorSchema.default("lilac"),
  isBookable: z.boolean().default(true),
  /** Omitted on create → every active service; omitted on update → unchanged. [] = none. */
  serviceIds: z.array(uuidV7Schema).max(500).optional(),
  /** Create the caller's own staff profile ("I also do services", solo salons). Create only. */
  linkToMe: z.boolean().default(false),
});
export type StaffInput = z.input<typeof staffInputSchema>;

export const staffParamsSchema = z.object({ salonId: uuidV7Schema, staffId: uuidV7Schema });
export const timeOffParamsSchema = staffParamsSchema.extend({ timeOffId: uuidV7Schema });

export const createInvitationInputSchema = z.object({
  role: invitableRoleSchema,
  /** When set, only this verified email can accept, and the link is emailed. */
  email: emailSchema.optional(),
  /** Link the new member to an existing staff profile. */
  staffProfileId: uuidV7Schema.optional(),
  locale: z.enum(["vi", "en"]).default("vi"),
});
export type CreateInvitationInput = z.input<typeof createInvitationInputSchema>;

export const invitationCreatedSchema = z.object({
  id: uuidV7Schema,
  /** Share by Zalo/copy (no SMS, X12). Shown once; only a hash is stored. */
  acceptUrl: z.string(),
  expiresAt: z.iso.datetime(),
  emailSent: z.boolean(),
});
export type InvitationCreated = z.infer<typeof invitationCreatedSchema>;

export const invitationTokenInputSchema = z.object({ token: z.string().min(32).max(128) });

export const invitationPreviewSchema = z.object({
  salonName: z.string(),
  role: salonRoleSchema,
  emailBound: z.boolean(),
  status: z.enum(["valid", "expired", "used"]),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

export const invitationAcceptedSchema = z.object({ salonId: uuidV7Schema });

export const memberRoleInputSchema = z.object({ role: invitableRoleSchema });
export const memberParamsSchema = z.object({ salonId: uuidV7Schema, memberId: uuidV7Schema });
