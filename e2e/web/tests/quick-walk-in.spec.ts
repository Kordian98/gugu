import pg from "pg";
import type { Locator } from "@playwright/test";

import { ApiClient } from "../support/api";
import { API, DATABASE_URL } from "../support/env";
import { expect, test } from "../support/fixtures";
import { t } from "../support/i18n";
import { SEED, seedSalon } from "../support/seed";
import { tap } from "../support/ui";

/** The HTTP API has no test clock or timezone editor. Keep only this test salon at local noon,
 * through a bound fixture update in the isolated E2E database, so midnight cannot erase today.
 * All services, hours, availability, competing bookings and resulting writes use the real API. */
async function localNoon(salonId: string) {
  const database = new URL(DATABASE_URL).pathname.slice(1);
  if (!/^gugu_[a-z0-9_]+$/.test(database) || database.endsWith("_test")) {
    throw new Error("Quick walk-in fixtures require an isolated E2E database");
  }
  const offset = 12 - new Date().getUTCHours();
  const timezone =
    offset === 0 ? "Etc/UTC" : `Etc/GMT${offset > 0 ? "-" : "+"}${String(Math.abs(offset))}`;
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query("UPDATE salons SET timezone = $1 WHERE id = $2", [
      timezone,
      salonId,
    ]);
    expect(result.rowCount).toBe(1);
  } finally {
    await client.end();
  }
  return timezone;
}

type Booking = {
  id: string;
  source: string;
  status: string;
  startsAt: string;
  staffId: string;
  customer: unknown;
};

for (const locale of ["vi", "en"] as const) {
  test(`walk-in uses three taps, two with one service, and safely recovers today @${locale}`, async ({
    signedIn,
  }, info) => {
    test.setTimeout(180_000);
    const seed = await seedSalon(
      `${process.env["E2E_QUICK_RUN"] ?? "quick"}-${info.project.name}-${locale}`,
      "flexible",
    );
    const timezone = await localNoon(seed.salonId);
    const api = await ApiClient.signIn(
      seed.ownerEmail,
      locale === "vi" ? "10.91.1.1" : "10.91.2.1",
    );
    const base = `/salons/${seed.salonId}`;
    const week = [1, 2, 3, 4, 5, 6, 7];
    const hours = week.map((weekday) => ({
      weekday,
      intervals: [{ start: "00:00", end: "23:59" }],
    }));
    await api.call(`${base}/settings/opening-hours`, "PATCH", { days: hours });
    for (const id of Object.values(seed.staffIds)) {
      await api.call(`${base}/team/${id}/schedule`, "PATCH", {
        days: hours.map((day) => ({ ...day, breaks: [] })),
      });
    }
    const settings = await api.call<{ booking: Record<string, unknown> }>(`${base}/settings`);
    await api.call(`${base}/settings/booking`, "PATCH", {
      ...settings.booking,
      minLeadTimeMinutes: 0,
      slotGranularityMinutes: 5,
    });
    const catalog = await api.call<{ items: { id: string }[] }>(`${base}/services`);
    for (const item of catalog.items) {
      if (!Object.values(seed.serviceIds).includes(item.id))
        await api.call(`${base}/services/${item.id}/active`, "PATCH", { isActive: false });
    }
    const page = await signedIn(seed.ownerEmail, {
      mobile: true,
      locale,
      next: `/${locale}/business`,
    });
    await page.setViewportSize({ width: 360, height: 780 });
    const endpoint = `${API}${base}/bookings`;
    const confirm = page.getByTestId("crm-walk-in-confirm");
    const service = page.getByTestId(`crm-walk-in-service-${seed.serviceIds.gel}`);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
    const created: Booking[] = [];
    let taps = 0;
    const countedTap = async (locator: Locator) => {
      await tap(locator);
      taps++;
    };

    await test.step("Today → service → confirm, no keyboard, one real booking", async () => {
      await countedTap(page.getByTestId("crm-today-walk-in"));
      await countedTap(service);
      await expect(confirm).toBeEnabled();
      await expect(confirm).toBeInViewport();
      const summary = page.getByTestId("crm-walk-in-summary");
      await expect(summary).toContainText("Nguyễn Lan");
      await expect(summary).toContainText(locale === "vi" ? "150.000đ" : "150,000đ");
      await expect(page.getByTestId("crm-quick-walk-in").locator("input")).toHaveCount(0);
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("INPUT");
      await info.attach(`${locale}-quick-walk-in-summary`, {
        body: await page.screenshot({
          path: info.outputPath(`${locale}-quick-walk-in-summary.png`),
          animations: "disabled",
        }),
        contentType: "image/png",
      });
      let release = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let writes = 0;
      await page.route(endpoint, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const body = route.request().postDataJSON() as {
          customer: unknown;
          source: string;
          overrides: unknown[];
        };
        expect(body.customer).toBeNull();
        expect(body.source).toBe("walk_in");
        expect(body.overrides).toEqual([]);
        expect(route.request().headers()["idempotency-key"]).toBeTruthy();
        writes++;
        const response = await route.fetch();
        await held;
        await route.fulfill({ response });
      });
      const saved = page.waitForResponse(
        (response) => response.url() === endpoint && response.request().method() === "POST",
      );
      await countedTap(confirm);
      try {
        await expect(confirm).toBeDisabled();
        await expect(
          page
            .getByTestId("crm-sheet-header")
            .getByRole("button", { name: t(locale, "crm:common.close"), exact: true }),
        ).toBeDisabled();
      } finally {
        release();
      }
      const response = await saved;
      expect(response.status()).toBe(201);
      created.push((await response.json()) as Booking);
      await expect(page.getByTestId("crm-quick-walk-in")).toHaveCount(0);
      await page.unroute(endpoint);
      expect(writes).toBe(1);
      expect(taps).toBe(3);
    });

    await test.step("a competing real booking causes 409; selection survives and retry requires a new tap", async () => {
      await page.goto(`/${locale}/business`);
      await tap(page.getByTestId("crm-today-walk-in"));
      await tap(service);
      await expect(confirm).toBeEnabled();
      let raced = false;
      await page.route(endpoint, async (route) => {
        if (route.request().method() === "POST" && !raced) {
          raced = true;
          await api.call(`${base}/bookings`, "POST", route.request().postDataJSON());
        }
        await route.continue();
      });
      const rejected = page.waitForResponse(
        (response) => response.url() === endpoint && response.request().method() === "POST",
      );
      await tap(confirm);
      expect((await rejected).status()).toBe(409);
      await expect(service).toHaveAttribute("aria-checked", "true");
      await expect(
        page.getByText(t(locale, "crm:quickWalkIn.refreshed"), { exact: true }),
      ).toBeVisible();
      await expect(confirm).toBeEnabled();
      await page.unroute(endpoint);
      const retried = page.waitForResponse(
        (response) => response.url() === endpoint && response.request().method() === "POST",
      );
      await tap(confirm);
      const response = await retried;
      expect(response.status()).toBe(201);
      created.push((await response.json()) as Booking);
    });

    await test.step("one active service is preselected: open → confirm", async () => {
      await api.call(`${base}/services/${seed.serviceIds.cut}/active`, "PATCH", {
        isActive: false,
      });
      if (locale === "en") {
        await api.call(`${base}/services/${seed.serviceIds.gel}`, "PATCH", {
          name: { vi: SEED.services.gel.vi, en: "" },
          price: SEED.services.gel.price,
          durationMinutes: SEED.services.gel.minutes,
        });
      }
      await page.goto(`/${locale}/business`);
      taps = 0;
      await countedTap(page.getByTestId("crm-today-walk-in"));
      await expect(service).toHaveAttribute("aria-checked", "true");
      await expect(service).toContainText(SEED.services.gel.vi);
      await expect(confirm).toBeEnabled();
      const saved = page.waitForResponse(
        (response) => response.url() === endpoint && response.request().method() === "POST",
      );
      await countedTap(confirm);
      const response = await saved;
      expect(response.status()).toBe(201);
      created.push((await response.json()) as Booking);
      expect(taps).toBe(2);
    });

    await test.step("failed availability never enables confirmation and can be retried", async () => {
      await page.goto(`/${locale}/business`);
      const availability = `${API}${base}/availability*`;
      await page.route(availability, (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
      );
      await tap(page.getByTestId("crm-today-walk-in"));
      const error = page.getByTestId("crm-walk-in-availability-error");
      await expect(error).toBeVisible();
      await expect(confirm).toBeDisabled();
      await page.unroute(availability);
      await tap(error.getByRole("button", { name: t(locale, "crm:common.retry"), exact: true }));
      await expect(confirm).toBeEnabled();
      await expect(page.getByTestId("crm-walk-in-summary")).toBeInViewport();
    });

    await test.step("closed today explains the problem without silently booking tomorrow", async () => {
      await api.call(`${base}/settings/opening-hours`, "PATCH", {
        days: week.map((weekday) => ({ weekday, intervals: [] })),
      });
      await page.goto(`/${locale}/business`);
      await tap(page.getByTestId("crm-today-walk-in"));
      await expect(page.getByTestId("crm-walk-in-unavailable")).toContainText(
        t(locale, "crm:quickWalkIn.noSlotsToday"),
      );
      await expect(confirm).toBeDisabled();
      await expect(
        page.getByRole("button", { name: t(locale, "crm:quickWalkIn.openCalendar"), exact: true }),
      ).toBeVisible();
      await info.attach(`${locale}-quick-walk-in-closed`, {
        body: await page.screenshot({
          path: info.outputPath(`${locale}-quick-walk-in-closed.png`),
          animations: "disabled",
        }),
        contentType: "image/png",
      });
    });

    for (const booking of created) {
      expect(booking.source).toBe("walk_in");
      expect(booking.status).toBe("confirmed");
      expect(
        new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(booking.startsAt)),
      ).toBe(today);
    }
  });
}
