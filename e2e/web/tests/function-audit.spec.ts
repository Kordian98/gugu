import type { SalonSettings, Team } from "../../../packages/contracts/src/index";
import { test, expect } from "../support/fixtures";
import { ApiClient } from "../support/api";
import { seedSalon } from "../support/seed";
import { t } from "../support/i18n";
import { fillField, tap } from "../support/ui";

test("CRM writes preserve drafts, shifts and optional contacts; destructive actions need confirmation", async ({
  signedIn,
}, info) => {
  test.setTimeout(180_000);
  const seed = await seedSalon(`${info.project.name}-function`, "en");
  const api = await ApiClient.signIn(seed.ownerEmail, "10.124.91.1");
  const page = await signedIn(seed.ownerEmail, { locale: "en" });
  const base = `/salons/${seed.salonId}`;
  const intervals = [
    { start: "08:00", end: "12:00" },
    { start: "14:00", end: "20:00" },
  ];
  const breaks = [
    { start: "10:00", end: "10:15" },
    { start: "16:00", end: "16:30" },
  ];
  await api.call(`${base}/settings/opening-hours`, "PATCH", { days: [{ weekday: 1, intervals }] });
  await api.call(`${base}/team/${seed.staffIds.lan}/schedule`, "PATCH", {
    days: [{ weekday: 1, intervals, breaks }],
  });

  for (const locale of ["vi", "en"] as const) {
    await test.step(`${locale}: resource retry and destructive confirmations`, async () => {
      await page.goto(`/${locale}/business/resources`);
      await tap(page.getByTestId("crm-resource-type-add"));
      await fillField(page.getByTestId("crm-resource-type-name"), `Audit equipment ${locale}`);
      await fillField(page.getByTestId("crm-resource-first-name"), `Audit chair ${locale}`);
      let creates = 0;
      let attempts = 0;
      let fail = true;
      const types = /\/resource-types$/;
      const resources = /\/resources$/;
      await page.route(types, async (route) => {
        if (route.request().method() === "POST") creates++;
        await route.continue();
      });
      await page.route(resources, async (route) => {
        if (route.request().method() === "POST") {
          attempts++;
          if (fail) {
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ code: "common.internal_error" }),
            });
            return;
          }
        }
        await route.continue();
      });
      await tap(page.getByTestId("crm-resource-type-save"));
      await expect.poll(() => attempts).toBe(1);
      await expect(page.getByTestId("crm-resource-type-save")).toBeEnabled();
      await expect(page.getByTestId("crm-resource-type-name")).not.toBeEditable();
      fail = false;
      await tap(page.getByTestId("crm-resource-type-save"));
      await expect(page.getByTestId("crm-resource-type-save")).toHaveCount(0);
      expect(creates).toBe(1);
      expect(attempts).toBe(2);
      await page.unroute(types);
      await page.unroute(resources);
      const deleteId = await page
        .getByTestId(/^crm-resource-delete-/)
        .last()
        .getAttribute("data-testid");
      expect(deleteId).toBeTruthy();
      const remove = page.getByTestId(deleteId ?? "missing");
      await tap(remove);
      const dialog = page.getByTestId("crm-resource-delete-dialog");
      await tap(dialog.getByRole("button", { name: t(locale, "crm:common.cancel"), exact: true }));
      await expect(remove).toBeVisible();
      await tap(remove);
      await tap(page.getByTestId("crm-resource-delete-dialog-confirm"));
      await expect(remove).toHaveCount(0);

      await page.goto(`/${locale}/business/team`);
      await tap(page.getByTestId("crm-staff-add"));
      await fillField(page.getByTestId("crm-staff-name"), `Audit remove ${locale}`);
      await tap(page.getByTestId("crm-staff-save"));
      await expect(page.getByTestId("crm-staff-save")).toHaveCount(0);
      const row = page
        .getByTestId(/^crm-staff-/)
        .filter({ hasText: `Audit remove ${locale}` })
        .first();
      await tap(row.getByRole("button", { name: t(locale, "crm:common.edit"), exact: true }));
      await tap(page.getByTestId("crm-staff-remove"));
      await expect(page.getByTestId("crm-staff-remove-confirm")).toBeVisible();
      await tap(
        page.getByRole("button", { name: t(locale, "crm:common.cancel"), exact: true }).last(),
      );
      await expect(page.getByTestId("crm-staff-save")).toBeVisible();
      await tap(page.getByTestId("crm-staff-remove"));
      await tap(page.getByTestId("crm-staff-remove-confirm"));
      await expect(page.getByTestId("crm-staff-remove-confirm")).toHaveCount(0);
    });

    await test.step(`${locale}: split schedules and unsaved settings survive save`, async () => {
      await page.goto(`/${locale}/business/settings`);
      await fillField(page.getByTestId("crm-profile-name"), `Unsaved salon ${locale}`);
      const hoursSaved = page.waitForResponse(
        (response) =>
          response.url().endsWith("/settings/opening-hours") &&
          response.request().method() === "PATCH",
      );
      await tap(page.getByTestId("crm-hours-save"));
      expect((await hoursSaved).ok()).toBe(true);
      await expect(page.getByTestId("crm-profile-name")).toHaveValue(`Unsaved salon ${locale}`);
      let settings = await api.call<SalonSettings>(`${base}/settings`);
      expect(settings.openingHours.days[0]?.intervals).toEqual(intervals);
      const profileSaved = page.waitForResponse(
        (response) =>
          response.url().endsWith("/settings/profile") && response.request().method() === "PATCH",
      );
      await tap(page.getByTestId("crm-profile-save"));
      expect((await profileSaved).ok()).toBe(true);
      settings = await api.call<SalonSettings>(`${base}/settings`);
      expect(settings.profile.name).toBe(`Unsaved salon ${locale}`);
      expect(settings.profile.phone).toBeNull();
      expect(settings.profile.address).toBeNull();
      await page.goto(`/${locale}/business/team`);
      const row = page.getByTestId(`crm-staff-${seed.staffIds.lan}`);
      await tap(row.getByRole("button", { name: t(locale, "crm:team.hours"), exact: true }));
      await expect(
        page.getByText(t(locale, "crm:team.splitHoursPreserved"), { exact: true }),
      ).toBeVisible();
      await tap(page.getByTestId("crm-schedule-save"));
      await expect(page.getByTestId("crm-schedule-save")).toHaveCount(0);
      const team = await api.call<Team>(`${base}/team`);
      expect(team.items.find((s) => s.id === seed.staffIds.lan)?.schedule.days[0]).toEqual({
        weekday: 1,
        intervals,
        breaks,
      });
    });
  }
});
