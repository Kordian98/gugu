// Flow 5 (vi): platform admin. The admin account is granted with the repo's own
// apps/api/scripts/seed-platform-admin.mjs --with-totp (global-setup; the E2E DB name `gugu_e2e`
// satisfies its `gugu_<suffix>`, not-`*_test` guard). Admin writes need a step-up: the action sheet
// asks for a TOTP code, computed with apps/api/scripts/totp-code.mjs. The admin extends a salon's trial by +30 days with a reason;
// the subscription card, the audit log and the salon's own entitlements reflect it. A salon owner
// opening /admin gets the denied card, and the admin API refuses them.
import { API } from "../support/env";
import { t } from "../support/i18n";
import { adminEmailFor, adminTotpSecretFor, expect, test } from "../support/fixtures";
import { totpCode } from "../support/totp";
import { addDays, vnDate } from "../support/time";
import { fillField, tap } from "../support/ui";

const L = "vi" as const;
test.use({ area: "admin" });

/** End of a salon-local day as the admin UI sends it (23:59:59.999 in UTC+7). */
const endOfDayVn = (ymd: string) => new Date(`${ymd}T23:59:59.999+07:00`).toISOString();

test.describe("platform admin @vi", () => {
  test("super admin extends a trial and suspends with step-up; the owner sees it and is denied /admin", async ({
    seed,
    signedIn,
  }, info) => {
    const target = addDays(vnDate(), 30);
    const admin = await signedIn(adminEmailFor(info.project.name), { next: "/vi/admin/salons" });

    await test.step("find the salon and open its detail", async () => {
      await expect(admin).toHaveURL(/\/vi\/admin\/salons/);
      await fillField(admin.getByTestId("admin-salon-search"), seed.salonName);
      // The search applies on Enter (or blur); wait for the filtered list before clicking a row.
      await admin.getByTestId("admin-salon-search").press("Enter");
      await expect(
        admin.getByText(t(L, "admin:salons.subtitle", { count: 1 }), { exact: true }),
      ).toBeVisible();
      await tap(admin.getByTestId(`admin-salon-row-${seed.salonId}`));
      await expect(admin.getByTestId("admin-salon-detail")).toContainText(seed.salonName);
    });

    const card = admin.getByTestId("admin-subscription");
    const trialRow = card.getByText(t(L, "admin:detail.subscription.trialEnds")).locator("..");
    // Format exactly as the app does, in the browser under test (ICU output differs by engine).
    const fmt = (iso: string) =>
      admin.evaluate(
        (v) =>
          new Intl.DateTimeFormat("vi-VN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "Asia/Ho_Chi_Minh",
          }).format(new Date(v)),
        iso,
      );

    await test.step("extend the trial to +30 days with a reason", async () => {
      await tap(card.getByTestId("admin-open-trial"));
      await tap(admin.getByRole("button", { name: t(L, "admin:actions.dates.d30"), exact: true }));
      await fillField(
        admin.getByTestId("admin-extend-trial-reason"),
        "E2E: onboarding call scheduled, extend trial",
      );
      // Extending a trial is a normal write: an enrolled factor suffices, no step-up prompt.
      await tap(admin.getByTestId("admin-extend-trial-submit"));
      await expect(admin.getByTestId("admin-extend-trial-submit")).toHaveCount(0);
      await expect(trialRow).toContainText(await fmt(endOfDayVn(target)));
      await expect(admin.getByTestId("admin-audit")).toContainText(
        t(L, "admin:auditAction.admin_trial_extended"),
      );
    });

    // One owner session for the rest (magic links are capped at 3 per email per 15 min).
    const owner = await signedIn(seed.ownerEmail);
    await test.step("the salon owner's entitlements carry the new trial end", async () => {
      const res = await owner.request.get(`${API}/salons/${seed.salonId}/entitlements`);
      expect(res.status(), "owner GET entitlements").toBe(200);
      const ent = (await res.json()) as { trialEndsAt: string | null; status: string };
      // Stored at second precision: 23:59:59 salon time on the chosen day.
      expect(ent.trialEndsAt, `salon ${seed.salonId} trialEndsAt`).toBe(
        endOfDayVn(target).replace(".999Z", ".000Z"),
      );
      expect(ent.status).toBe("trialing");
    });

    await test.step("the owner finds the trial end in Settings → Plan (X25)", async () => {
      await owner.goto("/vi/business/settings");
      await expect(owner.getByTestId("crm-plan-name")).toHaveText(t(L, "crm:plan.name.trial"));
      const trialDay = await owner.evaluate(
        (iso) =>
          new Intl.DateTimeFormat("vi-VN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Ho_Chi_Minh",
          }).format(new Date(iso)),
        endOfDayVn(target),
      );
      await expect(owner.getByTestId("crm-plan-trial-ends")).toContainText(trialDay);
      await expect(owner.getByTestId("crm-plan-free-until")).toBeVisible();
    });

    await test.step("suspending is high-risk: TOTP step-up, the owner sees the banner, unsuspend", async () => {
      await tap(admin.getByTestId("admin-open-suspend"));
      await fillField(
        admin.getByTestId("admin-suspend-reason"),
        "E2E: unpaid invoice, suspend then restore",
      );
      await tap(admin.getByTestId("admin-suspend-submit"));
      // Not stepped up yet → the sheet asks for a TOTP code, then retries the write.
      const stepUp = admin.getByTestId("admin-suspend-stepup");
      await expect(stepUp).toContainText(t(L, "admin:actions.stepUpAction"));
      await fillField(
        admin.getByTestId("admin-suspend-stepup-code"),
        totpCode(adminTotpSecretFor(info.project.name)),
      );
      await tap(admin.getByTestId("admin-suspend-stepup-submit"));
      await expect(admin.getByTestId("admin-open-unsuspend")).toBeVisible();

      await owner.goto("/vi/business");
      await expect(owner.getByTestId("crm-suspension-banner")).toBeVisible();

      // Still inside the step-up window: unsuspending needs no new code.
      await tap(admin.getByTestId("admin-open-unsuspend"));
      await fillField(
        admin.getByTestId("admin-unsuspend-reason"),
        "E2E: invoice paid, restore access",
      );
      await tap(admin.getByTestId("admin-unsuspend-submit"));
      await expect(admin.getByTestId("admin-open-suspend")).toBeVisible();
      await owner.reload();
      await expect(owner.getByTestId("crm-nav-calendar")).toBeVisible();
      await expect(owner.getByTestId("crm-suspension-banner")).toHaveCount(0);
    });

    await test.step("extend the free Basic year by 30 days (high risk, audited)", async () => {
      const freeRow = card.getByText(t(L, "admin:detail.subscription.freeUntil")).locator("..");
      const before = (await freeRow.innerText()).trim();
      await tap(card.getByTestId("admin-open-free"));
      await tap(admin.getByRole("button", { name: t(L, "admin:actions.dates.d30"), exact: true }));
      await fillField(
        admin.getByTestId("admin-extend-free-reason"),
        "E2E: pilot partner, one extra free month",
      );
      // Still inside the step-up window from the suspension above: no new code needed.
      await tap(admin.getByTestId("admin-extend-free-submit"));
      await expect(admin.getByTestId("admin-extend-free-submit")).toHaveCount(0);
      await expect(freeRow).not.toHaveText(before);
      await expect(admin.getByTestId("admin-audit")).toContainText(
        t(L, "admin:auditAction.admin_free_period_extended"),
      );
    });

    await test.step("the owner gets the denied card at /admin and the admin API refuses", async () => {
      await owner.goto("/vi/admin");
      const denied = owner.getByTestId("admin-denied");
      await expect(denied).toContainText(t(L, "admin:guard.deniedTitle"));
      await expect(owner.getByTestId("admin-sidebar")).toHaveCount(0);
      const res = await owner.request.get(`${API}/admin/salons`);
      expect([403, 404], `owner GET /admin/salons → ${String(res.status())}`).toContain(
        res.status(),
      );
      await tap(denied.getByRole("button", { name: t(L, "admin:guard.toWorkspace") }));
      await expect(owner).toHaveURL(/\/vi\/business/);
    });
  });
});
