import { API } from "../support/env";
import { expect, test } from "../support/fixtures";
import { t } from "../support/i18n";
import { SEED } from "../support/seed";
import { addDays, vnDate } from "../support/time";
import { fillField, hydrated, tap } from "../support/ui";

type SavedBooking = {
  id: string;
  staffId: string;
  service: {
    serviceId: string | null;
    durationMinutes: number;
    priceMinor: number;
    name: { vi: string };
  };
  startsAt: string;
  endsAt: string;
};

test.use({ area: "flexible" });
test.describe.serial("flexible CRM appointments", () => {
  for (const [index, locale] of (["vi", "en"] as const).entries()) {
    test(`drawn duration, one-off service and explicit rule confirmation @${locale}`, async ({
      seed,
      signedIn,
    }) => {
      const day = addDays(vnDate(), index + 1);
      const page = await signedIn(seed.ownerEmail, {
        locale,
        next: `/${locale}/business/calendar?date=${day}`,
      });
      const endpoint = `${API}/salons/${seed.salonId}/bookings`;
      const servicesBefore: unknown = await (
        await page.request.get(`${API}/salons/${seed.salonId}/services`)
      ).json();
      await test.step("drawing 75 minutes books a 60-minute catalog service for exactly 75", async () => {
        const layer = await hydrated(page.getByTestId(`crm-slot-${seed.staffIds.lan}`));
        await layer.evaluate((el) => {
          el.scrollIntoView({ block: "start" });
        });
        const box = await layer.boundingBox();
        if (!box) throw new Error("calendar column missing");
        const x = box.x + box.width / 2;
        // Seed hours start at 08:00; desktop calendar uses 56 px per hour.
        const y = box.y + 6 + 2 * 56;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x, y + (75 * 56) / 60, { steps: 12 });
        const draft = page.getByTestId("crm-draft-block");
        await expect(draft).toBeVisible();
        let pointerY = y + (75 * 56) / 60;
        for (let attempt = 0; attempt < 4; attempt++) {
          const text = await draft.innerText();
          const end = text.split("–")[1];
          if (end === "11:15") break;
          const [hours, minutes] = (end ?? "10:00").split(":").map(Number);
          pointerY += ((675 - ((hours ?? 10) * 60 + (minutes ?? 0))) * 56) / 60;
          await page.mouse.move(x, pointerY, { steps: 4 });
        }
        await expect(draft).toContainText("10:00–11:15");
        await page.mouse.up();
        await expect(page.getByTestId("crm-booking-duration")).toHaveValue("75");
        const preview = page.getByTestId("crm-appointment-preview");
        await expect(preview).toContainText("10:00–11:15");
        await expect(preview).toContainText(t(locale, "crm:calendar.previewDraft"));
        await expect(preview).toBeInViewport();
        await test.info().attach(`${locale}-drawn-appointment-preview`, {
          body: await page.screenshot(),
          contentType: "image/png",
        });
        await fillField(page.getByTestId("crm-client-name"), "Linh Phạm");
        await fillField(page.getByTestId("crm-client-phone"), "0933444555");
        const serviceName = locale === "vi" ? SEED.services.gel.vi : SEED.services.gel.en;
        await tap(page.getByTestId("crm-chip").filter({ hasText: serviceName }));
        await expect(page.getByTestId("crm-new-confirm")).toBeEnabled();
        await expect(preview).toContainText(serviceName);
        await fillField(page.getByTestId("crm-manual-time"), "25:00");
        await expect(page.getByTestId("crm-new-confirm")).toBeDisabled();
        await expect(preview).toContainText("10:00–11:15");
        await fillField(page.getByTestId("crm-manual-time"), "10:00");
        await expect(page.getByTestId("crm-new-confirm")).toBeEnabled();
        // A failed network write keeps the form and draft instead of making the selection vanish.
        await page.route(endpoint, (route) => route.abort("failed"));
        await tap(page.getByTestId("crm-new-confirm"));
        await expect(
          page.getByText(t(locale, "crm:errors.generic"), { exact: true }),
        ).toBeVisible();
        await expect(preview).toContainText("10:00–11:15");
        await page.unroute(endpoint);
        let release = () => {};
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        await page.route(endpoint, async (route) => {
          const result = await route.fetch();
          await held;
          await route.fulfill({ response: result });
        });
        const saved = page.waitForResponse(
          (r) => r.url() === endpoint && r.request().method() === "POST",
        );
        await tap(page.getByTestId("crm-new-confirm"));
        try {
          await expect(preview).toContainText(t(locale, "crm:calendar.previewSaving"));
          await expect(
            page.getByRole("button", { name: t(locale, "crm:common.cancel"), exact: true }),
          ).toBeDisabled();
        } finally {
          release();
        }
        const response = await saved;
        await page.unroute(endpoint);
        expect(response.status()).toBe(201);
        const booking = (await response.json()) as SavedBooking;
        expect(booking.service.serviceId).toBe(seed.serviceIds.gel);
        expect(booking.service.durationMinutes).toBe(75);
        expect(Date.parse(booking.endsAt) - Date.parse(booking.startsAt)).toBe(75 * 60_000);
        await expect(page.getByTestId("crm-new-confirm")).toHaveCount(0);
        await expect(preview).toHaveCount(0);
        await expect(page.getByTestId(`crm-booking-${booking.id}`)).toBeVisible();
        await expect(page.getByTestId(`crm-booking-${booking.id}`)).toBeInViewport();
        await page.reload();
        await expect(page.getByTestId(`crm-booking-${booking.id}`)).toBeVisible();
        // Cancelling a second form removes only its visual draft.
        await tap(page.getByTestId("crm-new-appointment"));
        await tap(page.getByTestId("crm-chip").filter({ hasText: serviceName }));
        await tap(
          page.getByTestId("crm-chip").filter({ hasText: new RegExp(`^${SEED.staff.lan.name}$`) }),
        );
        await fillField(page.getByTestId("crm-manual-time"), "14:00");
        await expect(preview).toHaveCount(1);
        await tap(page.getByRole("button", { name: t(locale, "crm:common.cancel"), exact: true }));
        await expect(preview).toHaveCount(0);
        await expect(page.getByTestId(`crm-booking-${booking.id}`)).toBeVisible();
      });
      await test.step("a one-off service outside hours requires a modal, reason and confirmation", async () => {
        await tap(page.getByTestId("crm-new-appointment"));
        await fillField(page.getByTestId("crm-client-name"), "Linh Phạm");
        await fillField(page.getByTestId("crm-client-phone"), "0933444555");
        await tap(
          page.getByRole("radio", { name: t(locale, "crm:calendar.customService"), exact: true }),
        );
        await fillField(page.getByTestId("crm-custom-service-name"), "Chăm sóc phát sinh");
        await fillField(page.getByTestId("crm-custom-service-price"), "175000");
        await fillField(page.getByTestId("crm-booking-duration"), "30");
        await tap(
          page.getByTestId("crm-chip").filter({ hasText: new RegExp(`^${SEED.staff.mai.name}$`) }),
        );
        const chosenDay = addDays(day, 2);
        await tap(page.getByRole("button", { name: chosenDay, exact: true }));
        await expect(page.getByTestId("crm-override-toggle")).toHaveCount(0);
        await fillField(page.getByTestId("crm-manual-time"), "23:00");
        await expect(page.getByTestId("crm-appointment-preview")).toContainText("23:00–23:30");
        await expect(page.getByTestId("crm-appointment-preview")).toBeInViewport();
        await test.info().attach(`${locale}-right-column-appointment-preview`, {
          body: await page.screenshot(),
          contentType: "image/png",
        });
        const checked = page.waitForResponse(
          (r) => r.url() === endpoint && r.request().method() === "POST" && r.status() === 409,
        );
        await tap(page.getByTestId("crm-new-confirm"));
        const refusal = await checked;
        expect((refusal.request().postDataJSON() as { overrides: string[] }).overrides).toEqual([]);
        await expect(page.getByTestId("crm-override-prompt")).toBeVisible();
        await expect(page.getByTestId("crm-override-prompt")).toHaveText(
          t(locale, "crm:override.codes.hours"),
        );
        await expect(page.getByTestId("crm-override-context")).toContainText(SEED.staff.mai.name);
        await expect(page.getByTestId("crm-new-confirm")).toHaveCount(0);
        await fillField(page.getByTestId("crm-override-prompt-reason"), "Khách cần lịch muộn");
        const saved = page.waitForResponse(
          (r) => r.url() === endpoint && r.request().method() === "POST",
        );
        await tap(page.getByTestId("crm-override-confirm"));
        const response = await saved;
        expect(response.status()).toBe(201);
        const booking = (await response.json()) as SavedBooking;
        expect(booking.service).toMatchObject({
          serviceId: null,
          name: { vi: "Chăm sóc phát sinh" },
          priceMinor: 175000,
          durationMinutes: 30,
        });
        expect(
          (response.request().postDataJSON() as { overrideReason: string }).overrideReason,
        ).toBe("Khách cần lịch muộn");
        expect(new Date(booking.startsAt).getUTCHours()).toBe(16);
        await expect(page.getByTestId("crm-override-prompt")).toHaveCount(0);
        expect(booking.staffId).toBe(seed.staffIds.mai);
        await expect(page).toHaveURL(new RegExp(`date=${chosenDay}`));
        await expect(page.getByTestId("crm-appointment-preview")).toHaveCount(0);
        await expect(page.getByTestId(`crm-booking-${booking.id}`)).toBeVisible();
        await expect(page.getByTestId(`crm-booking-${booking.id}`)).toBeInViewport();
        await page.reload();
        await page.getByTestId(`crm-booking-${booking.id}`).scrollIntoViewIfNeeded();
        await expect(page.getByTestId(`crm-booking-${booking.id}`)).toBeVisible();
        const servicesAfter: unknown = await (
          await page.request.get(`${API}/salons/${seed.salonId}/services`)
        ).json();
        expect(servicesAfter).toEqual(servicesBefore);
      });
    });
  }
});
