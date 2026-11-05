import type { Locator } from "@playwright/test";
import { expect, need, test } from "../support/fixtures";
import { t } from "../support/i18n";
import { SEED } from "../support/seed";
import { tap } from "../support/ui";

// A page can have no horizontal overflow while its most important text is reduced to one letter.
// Exercise actual controls and inspect the service-name box as well as the document boundary.
test.use({ area: "mobile" });

async function touchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Control is not visible: ${locator.toString()}`);
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

test("phone service names, editor choices and calendar controls remain usable in vi/en", async ({
  seed,
  signedIn,
}) => {
  const page = await signedIn(seed.ownerEmail, { mobile: true });
  await page.setViewportSize({ width: 360, height: 780 });
  const service = need(seed.serviceIds, "services").gel;
  for (const locale of ["vi", "en"] as const) {
    await page.goto(`/${locale}/business/services`);
    const name = page.getByTestId(`crm-service-name-${service}`);
    await expect(name).toHaveText(SEED.services.gel[locale]);
    const readable = await name.evaluate((el) => ({
      clipped: el.scrollWidth > el.clientWidth,
      width: el.getBoundingClientRect().width,
    }));
    expect(readable.clipped).toBe(false);
    expect(readable.width).toBeGreaterThan(160);
    await touchTarget(page.getByTestId(`crm-service-delete-${service}`));
    await touchTarget(page.getByTestId("crm-bell"));
    await tap(
      page.getByRole("button", {
        name: t(locale, "crm:services.edit", { name: SEED.services.gel[locale] }),
      }),
    );
    const input = page.getByTestId("crm-service-name");
    await expect(input).toBeVisible();
    expect(
      await input.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    await touchTarget(input);
    const category = page.getByRole("button", {
      name: t(locale, "crm:services.category"),
      exact: true,
    });
    await tap(category);
    await expect(category).toHaveAttribute("aria-expanded", "true");
    // Opening a choice must leave the editor and its input operable in the same modal.
    await expect(input).toBeVisible();
    await input.fill(SEED.services.gel[locale]);
    await page.keyboard.press("Escape");
    await expect(category).toHaveAttribute("aria-expanded", "false");
    await expect(category).toBeFocused();
    await expect(input).toBeVisible();
    await tap(page.getByRole("button", { name: t(locale, "crm:common.cancel"), exact: true }));
    await page.goto(`/${locale}/business/calendar`);
    await touchTarget(
      page.getByRole("button", { name: t(locale, "crm:timeline.prevDay"), exact: true }),
    );
    await touchTarget(
      page.getByRole("button", { name: t(locale, "crm:timeline.nextDay"), exact: true }),
    );
    await touchTarget(page.getByRole("tab", { name: t(locale, "crm:calendar.all"), exact: true }));
    if ((await page.evaluate(() => document.documentElement.style.colorScheme)) !== "dark") {
      await tap(page.getByTestId("crm-theme-toggle-mobile"));
    }
    await expect(page.getByTestId("crm-agenda")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    const bookings = /\/salons\/[^/]+\/bookings\?/;
    await page.route(bookings, (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
    );
    await page.reload();
    await expect(page.getByTestId("crm-query-error")).toBeVisible();
    await expect(page.getByTestId("crm-agenda")).toHaveCount(0);
    await page.unroute(bookings);
    await tap(page.getByRole("button", { name: t(locale, "crm:common.retry"), exact: true }));
    await expect(page.getByTestId("crm-agenda")).toBeVisible();
  }
});
