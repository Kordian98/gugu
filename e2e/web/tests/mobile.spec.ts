// Flow 6 (vi): phone-sized smoke of the business panel (390×844, touch). Today renders the seeded
// day without horizontal overflow, the bottom tabs navigate, and the centre "+" opens the
// new-appointment sheet.
import type { Page } from "@playwright/test";
import { t } from "../support/i18n";
import { expect, need, test } from "../support/fixtures";
import { SEED } from "../support/seed";
import { hydrated, tap } from "../support/ui";

const L = "vi" as const;
test.use({ area: "mobile" });

const noHorizontalOverflow = async (page: Page, where: string) => {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(
    scroll,
    `${where}: page is ${String(scroll)}px wide in a ${String(width)}px viewport`,
  ).toBeLessThanOrEqual(width);
};

test.describe("mobile business panel @vi", () => {
  test("today, calendar tab and the new-appointment sheet on a phone", async ({
    seed,
    signedIn,
  }) => {
    const page = await signedIn(seed.ownerEmail, { mobile: true });
    await page.goto("/vi/business");
    const tabs = page.getByTestId("crm-bottom-tabs");
    await hydrated(tabs.getByRole("tab", { name: t(L, "crm:nav.today") }));
    await expect(page.getByTestId("crm-sidebar")).toHaveCount(0);
    await noHorizontalOverflow(page, "today");

    await tap(tabs.getByRole("tab", { name: t(L, "crm:nav.items.calendar") }));
    await expect(page).toHaveURL(/\/vi\/business\/calendar/);
    // Phones get the agenda list instead of the staff-column grid.
    const ids = need(seed.bookingIds, "bookings");
    const agenda = page.getByTestId("crm-agenda");
    await expect(agenda.getByTestId(`crm-agenda-${ids.lanToday}`)).toContainText(
      SEED.bookings.lanToday.time,
    );
    await expect(agenda.getByTestId(`crm-agenda-${ids.maiToday}`)).toContainText(
      SEED.bookings.maiToday.time,
    );
    await noHorizontalOverflow(page, "calendar");

    await tap(page.getByTestId("crm-new-appointment-mobile"));
    await expect(page.getByTestId("crm-client-name")).toBeVisible();
    await expect(
      page.getByTestId("crm-chip").filter({ hasText: SEED.services.gel.vi }),
    ).toBeVisible();
    await noHorizontalOverflow(page, "new appointment sheet");
  });
});
