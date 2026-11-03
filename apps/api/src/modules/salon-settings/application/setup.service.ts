import { Injectable } from "@nestjs/common";
import {
  SALON_ERRORS,
  type SetupBusinessInputParsed,
  type SetupProgressInput,
  type SetupState,
} from "@gugu/contracts";
import type { SalonContext, UserPrincipal } from "../../../common/guards/principal";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import { AnalyticsService } from "../../analytics/analytics.facade";
import { AuditService } from "../../audit/audit.facade";
import { EntitlementService } from "../../subscriptions/subscriptions.facade";
import { BUSINESS_TYPE_CATEGORY, stepIndex, withStep, withoutStep } from "../domain/setup";
import { SalonSettingsService } from "./salon-settings.service";

type Tx = Prisma.TransactionClient;
const secondsSince = (d: Date) => Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));

/**
 * Guided setup after the email-only signup (07 §3.7, owner 2026-11-04): server-side wizard progress,
 * the business step (name + type) and the Today card. Each step also emits a
 * PII-free analytics event so the signup funnel's drop-off is visible (X14).
 */
@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly settings: SalonSettingsService,
    private readonly entitlements: EntitlementService,
  ) {}

  /**
   * The setup row of a salon from the email-only signup. Only quick start (and, for older salons,
   * saving the business step) creates one: progress and the card are 404 without it (L2).
   */
  private async row(tx: Tx, salonId: string) {
    const existing = await tx.salonSetup.findUnique({ where: { salonId } });
    if (!existing) throw new AppError(404, COMMON_ERRORS.notFound, "No guided setup");
    return existing;
  }

  /** q103: nothing but the name step works until the salon has a name. */
  private assertNamed(setup: { nameConfirmed: boolean }): void {
    if (!setup.nameConfirmed) {
      throw new AppError(409, SALON_ERRORS.nameRequired, "Name the salon first");
    }
  }

  async saveBusiness(
    ctx: SalonContext,
    user: UserPrincipal,
    input: SetupBusinessInputParsed,
  ): Promise<void> {
    const slug = input.businessType ? BUSINESS_TYPE_CATEGORY[input.businessType] : null;
    const category = slug
      ? await this.prisma.serviceCategory.findUnique({ where: { slug }, select: { id: true } })
      : null;
    await this.prisma.$transaction(async (tx) => {
      // Older salons (old form, no row) get one here: the business step is a real setup step.
      const setup = await tx.salonSetup.upsert({
        where: { salonId: ctx.salonId },
        create: { salonId: ctx.salonId },
        update: {},
      });
      const salon = await tx.salon.update({
        where: { id: ctx.salonId, organizationId: ctx.organizationId },
        data: {
          name: input.name,
          ...(input.businessType ? { primaryCategoryId: category?.id ?? null } : {}),
        },
        select: { organizationId: true },
      });
      // The organisation created unnamed by quick start takes the salon's name.
      await tx.organization.updateMany({
        where: { id: salon.organizationId, name: "" },
        data: { name: input.name },
      });
      await tx.salonSetup.update({
        where: { salonId: ctx.salonId },
        data: {
          businessType: input.businessType ?? setup.businessType,
          nameConfirmed: true,
          completedSteps: withStep(setup.completedSteps, "business"),
          skippedSteps: withoutStep(setup.skippedSteps, "business"),
        },
      });
      await this.audit.record(
        {
          action: "salon.profile_updated",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "salon",
          targetId: ctx.salonId,
          metadata: { fields: "setup_business", businessType: input.businessType ?? null },
        },
        tx,
      );
      await this.analytics.record(
        {
          name: "setup_step_completed",
          salonId: ctx.salonId,
          actorUserId: user.userId,
          props: {
            step: "business",
            step_index: stepIndex("business"),
            method: input.businessType ? "tiles" : null,
            business_type: input.businessType ?? null,
            seconds_since_start: secondsSince(setup.startedAt),
          },
        },
        tx,
      );
    });
    // The trial's AI allowance starts with the first real setup step (ADR-0018, M1).
    await this.entitlements.invalidate(ctx.salonId);
  }

  async progress(
    ctx: SalonContext,
    user: UserPrincipal,
    input: SetupProgressInput,
  ): Promise<SetupState> {
    const { step, event } = input;
    const { finishedNow, closed } = await this.prisma.$transaction(async (tx) => {
      const setup = await this.row(tx, ctx.salonId);
      // Only looking at the name step works before the salon has a name (it can't be skipped).
      if (!(step === "business" && event === "viewed")) this.assertNamed(setup);
      const now = new Date();
      const data: Prisma.SalonSetupUpdateInput = {};
      const base = { step, step_index: stepIndex(step) };
      let finished = false;
      if (event === "viewed") {
        data.currentStep = step;
        if (step === "done") {
          data.wizardClosedAt = setup.wizardClosedAt ?? now;
          if (!setup.finishedAt) {
            data.finishedAt = now;
            finished = true;
          }
        }
      } else if (event === "completed") {
        data.completedSteps = withStep(setup.completedSteps, step);
        data.skippedSteps = withoutStep(setup.skippedSteps, step);
      } else if (event === "skipped") {
        if (!setup.completedSteps.includes(step)) {
          data.skippedSteps = withStep(setup.skippedSteps, step);
        }
      } else {
        data.currentStep = step;
        data.wizardClosedAt = setup.wizardClosedAt ?? now;
      }
      const updated = await tx.salonSetup.update({ where: { salonId: ctx.salonId }, data });
      const actor = { salonId: ctx.salonId, actorUserId: user.userId };
      if (event === "viewed") {
        await this.analytics.record({ ...actor, name: "setup_step_viewed", props: base }, tx);
      } else if (event === "completed") {
        await this.analytics.record(
          {
            ...actor,
            name: "setup_step_completed",
            props: {
              ...base,
              method: input.method ?? null,
              business_type: null,
              seconds_since_start: secondsSince(setup.startedAt),
            },
          },
          tx,
        );
      } else if (event === "skipped") {
        await this.analytics.record({ ...actor, name: "setup_step_skipped", props: base }, tx);
      } else {
        await this.analytics.record({ ...actor, name: "setup_left", props: base }, tx);
      }
      return { finishedNow: finished ? setup : null, closed: updated.wizardClosedAt !== null };
    });

    // Once the wizard is closed (reached "done", or a step finished later from the Today card), a
    // complete salon goes live: with no public page (X23) "live" only ends the checklist, so the
    // owner needs no extra button.
    if (closed) await this.settings.goLiveIfReady(ctx);
    if (finishedNow) {
      const fresh = await this.prisma.salonSetup.findUniqueOrThrow({
        where: { salonId: ctx.salonId },
      });
      await this.analytics.record({
        name: "setup_finished",
        salonId: ctx.salonId,
        actorUserId: user.userId,
        props: {
          seconds_since_start: secondsSince(finishedNow.startedAt),
          completed_count: fresh.completedSteps.length,
          skipped_count: fresh.skippedSteps.length,
          went_live: (await this.settings.onboarding(ctx)).done.includes("live"),
        },
      });
    }
    const state = (await this.settings.onboarding(ctx)).setup;
    if (!state) throw new Error("setup row missing after progress");
    return state;
  }

  async dismissCard(ctx: SalonContext, user: UserPrincipal): Promise<void> {
    const remaining = (await this.settings.onboarding(ctx)).setup?.remaining.length ?? 0;
    await this.prisma.$transaction(async (tx) => {
      const setup = await this.row(tx, ctx.salonId);
      this.assertNamed(setup);
      if (setup.cardDismissedAt) return;
      await tx.salonSetup.update({
        where: { salonId: ctx.salonId },
        data: { cardDismissedAt: new Date(), wizardClosedAt: setup.wizardClosedAt ?? new Date() },
      });
      await this.analytics.record(
        {
          name: "setup_card_dismissed",
          salonId: ctx.salonId,
          actorUserId: user.userId,
          props: { remaining_count: remaining },
        },
        tx,
      );
    });
  }
}
