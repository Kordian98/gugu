// Flow 5 (vi): platform admin. The admin account is granted with the repo's own
// apps/api/scripts/seed-platform-admin.mjs (global-setup; the E2E DB name `gugu_e2e` satisfies its
// `gugu_<suffix>`, not-`*_test` guard). The admin extends a salon's trial by +30 days with a reason;
// the subscription card, the audit log and the salon's own entitlements reflect it. A salon owner
// opening /admin gets the denied card, and the admin API refuses them.
import { API } from "../support/env";
import { t } from "../support/i18n";
import { adminEmailFor, expect, test } from "../support/fixtures";
import { addDays, vnDate } from "../support/time";
import { fillField, tap } from "../support/ui";

const L = "vi" as const;
test.use({ area: "admin" });

/** End of a salon-local day as the admin UI sends it (23:59:59.999 in UTC+7). */
const endOfDayVn = (ymd: string) => new Date(`${ymd}T23:59:59.999+07:00`).toISOString();

test.describe("platform admin @vi", () => {
  test("super admin extends a trial; the salon sees the new end date", async ({
    seed,
    signedIn,
  }, info) => {
    const target = addDays(vnDate(), 30);
    const admin = await signedIn(adminEmailFor(info.project.name), { next: "/vi/admin/salons" });

    await test.step("find the salon and open its detail", async () => {
      await expect(admin).toHaveURL(/\/vi\/admin\/salons/);
      await fillField(admin.getByTestId("admin-salon-search"), seed.salonName);
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
      const sheet = admin.getByTestId("admin-extend-trial");
      await tap(sheet.getByRole("button", { name: t(L, "admin:actions.dates.d30"), exact: true }));
      await fillField(
        admin.getByTestId("admin-extend-trial-reason"),
        "E2E: onboarding call scheduled, extend trial",
      );
      await tap(admin.getByTestId("admin-extend-trial-submit"));
      await expect(admin.getByTestId("admin-extend-trial-submit")).toHaveCount(0);
      await expect(trialRow).toContainText(await fmt(endOfDayVn(target)));
      await expect(admin.getByTestId("admin-audit")).toContainText(
        t(L, "admin:auditAction.admin_trial_extended"),
      );
    });

    await test.step("the salon owner's entitlements carry the new trial end", async () => {
      const owner = await signedIn(seed.ownerEmail);
      const res = await owner.request.get(`${API}/salons/${seed.salonId}/entitlements`);
      expect(res.status(), "owner GET entitlements").toBe(200);
      const ent = (await res.json()) as { trialEndsAt: string | null; status: string };
      expect(ent.trialEndsAt, `salon ${seed.salonId} trialEndsAt`).toBe(endOfDayVn(target));
      expect(ent.status).toBe("trialing");
    });
  });

  test("a salon owner gets the denied card at /admin and the admin API refuses", async ({
    seed,
    signedIn,
  }) => {
    const owner = await signedIn(seed.ownerEmail, { next: "/vi/admin" });
    await owner.goto("/vi/admin");
    const denied = owner.getByTestId("admin-denied");
    await expect(denied).toContainText(t(L, "admin:guard.deniedTitle"));
    await expect(owner.getByTestId("admin-sidebar")).toHaveCount(0);
    const res = await owner.request.get(`${API}/admin/salons`);
    expect([403, 404], `owner GET /admin/salons → ${String(res.status())}`).toContain(res.status());
    await tap(denied.getByRole("button", { name: t(L, "admin:guard.toWorkspace") }));
    await expect(owner).toHaveURL(/\/vi\/business/);
  });
});
