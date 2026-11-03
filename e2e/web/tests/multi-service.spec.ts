// Multi-service appointment (06 M6.8, vi): one booking with two services in sequence done by two
// staff members — Sơn gel with Nguyễn Lan, then Cắt tóc nữ with Trần Mai. The sheet shows the chain
// plan, the calendar shows one block per staff part, the drawer and the customer's confirmation
// email list both services.
import { t, tx } from "../support/i18n";
import { expect, test } from "../support/fixtures";
import { waitForMail } from "../support/mailpit";
import { SEED, mail } from "../support/seed";
import { addDays, vnDate } from "../support/time";
import { fillField, hydrated, tap } from "../support/ui";

const L = "vi" as const;
test.use({ area: "multi" });

test.describe("multi-service @vi", () => {
  test("two services, two staff, one appointment", async ({ seed, signedIn }, info) => {
    const tomorrow = addDays(vnDate(), 1);
    const customerEmail = mail("chain-customer", info.project.name);
    const { gel, cut } = SEED.services;
    const { lan, mai } = SEED.staff;
    const page = await signedIn(seed.ownerEmail);

    await test.step("compose the chain in the new-appointment sheet", async () => {
      await page.goto("/vi/business");
      await tap(page.getByTestId("crm-new-appointment"));
      await fillField(page.getByTestId("crm-client-name"), "Đỗ Hải Yến");
      await fillField(page.getByTestId("crm-client-phone"), "0944 000 666");
      await fillField(page.getByTestId("crm-client-email"), customerEmail);
      await tap(page.getByTestId("crm-chip").filter({ hasText: gel.vi }));
      await tap(page.getByTestId("crm-chip").filter({ hasText: new RegExp(`^${lan.name}$`) }));
      await tap(page.getByTestId("crm-add-service"));
      const line = page.getByTestId("crm-next-service");
      await tap(line.getByTestId("crm-next-chip").filter({ hasText: cut.vi }));
      await tap(line.getByTestId("crm-next-chip").filter({ hasText: new RegExp(`^${mai.name}$`) }));
      await tap(page.getByRole("button", { name: tomorrow, exact: true }));
      await tap(
        page
          .getByTestId("crm-slot")
          .filter({ hasText: /^10:00/ })
          .first(),
      );
      const plan = page.getByTestId("crm-chain-plan");
      await expect(plan).toContainText(
        t(L, "crm:calendar.chainTotal", { minutes: gel.minutes + cut.minutes, price: "350.000đ" }),
      );
      await expect(plan).toContainText(
        t(L, "crm:calendar.chainPlan", { time: "10:00", service: gel.vi, staff: lan.name }),
      );
      await expect(plan).toContainText(
        t(L, "crm:calendar.chainPlan", { time: "11:00", service: cut.vi, staff: mai.name }),
      );
      await tap(page.getByTestId("crm-new-confirm"));
      await expect(page.getByTestId("crm-new-confirm")).toHaveCount(0);
    });

    await test.step("calendar: one block per staff part; drawer lists both lines", async () => {
      await page.goto(`/vi/business/calendar?date=${tomorrow}`);
      await hydrated(page.getByTestId("crm-timeline"));
      const lanPart = page.getByRole("button", {
        name: new RegExp(`^10:00 ${gel.vi}.*Đỗ Hải Yến`),
      });
      const maiPart = page.getByRole("button", {
        name: new RegExp(`^11:00 ${cut.vi}.*Đỗ Hải Yến`),
      });
      await expect(lanPart).toBeVisible();
      await expect(maiPart).toBeVisible();
      await tap(lanPart);
      await expect(page.getByTestId("crm-booking-customer")).toHaveText("Đỗ Hải Yến");
      // Per-line rows (time · staff · price) exist only in the drawer.
      for (const [time, staff, price] of [
        ["10:00 – 11:00", lan.name, "150.000đ"],
        ["11:00 – 11:45", mai.name, "200.000đ"],
      ] as const) {
        await expect(
          page.getByText(t(L, "crm:booking.lineDetail", { time, staff, price }), { exact: true }),
        ).toBeVisible();
      }
    });

    await test.step("the customer's confirmation email names both services", async () => {
      const [confirmed] = await waitForMail(customerEmail, {
        subject: tx(L, "notifications:email.bookingConfirmed.subject", { salon: seed.salonName }),
      });
      expect(confirmed?.Text).toContain(gel.vi);
      expect(confirmed?.Text).toContain(cut.vi);
    });
  });

  test("availability 'truncated' shows the incomplete-results hint", async ({ seed, signedIn }) => {
    // The engine sets `truncated` only when the chain search budget runs out (ADR-0013); the seed
    // is too small to hit it, so the flag is set on the real response. This checks the UI wiring.
    const { gel, cut } = SEED.services;
    const page = await signedIn(seed.ownerEmail);
    await page.route(/\/salons\/[^/]+\/availability(\/earliest)?\?/, async (route) => {
      const res = await route.fetch();
      const json = (await res.json()) as Record<string, unknown>;
      await route.fulfill({ response: res, json: { ...json, truncated: true } });
    });
    await page.goto("/vi/business");
    await tap(page.getByTestId("crm-new-appointment"));
    await tap(page.getByTestId("crm-chip").filter({ hasText: gel.vi }));
    await tap(page.getByTestId("crm-add-service"));
    await tap(
      page.getByTestId("crm-next-service").getByTestId("crm-next-chip").filter({ hasText: cut.vi }),
    );
    await expect(page.getByTestId("crm-availability-truncated")).toHaveText(
      t(L, "crm:calendar.truncated"),
    );
    await tap(page.getByTestId("crm-find-earliest"));
    await expect(page.getByTestId("crm-earliest-truncated")).toHaveText(
      t(L, "crm:calendar.truncated"),
    );
  });
});
