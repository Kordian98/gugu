// Multi-service appointment (06 M6.8, vi): one booking with two services in sequence done by two
// staff members — Sơn gel with Nguyễn Lan, then Cắt tóc nữ with Trần Mai. The sheet shows the chain
// plan, the calendar shows one block per staff part and the drawer lists both services. GuGu never
// emails the customer (X26): the salon has no Zalo OA here, so no message reaches them at all.
import { t } from "../support/i18n";
import { expect, test } from "../support/fixtures";
import { expectNoMail } from "../support/mailpit";
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

    await test.step("the client exists with an email stored on the profile (q87)", async () => {
      await page.goto("/vi/business/customers");
      await tap(await hydrated(page.getByTestId("crm-customer-add")));
      await fillField(page.getByTestId("crm-customer-name"), "Đỗ Hải Yến");
      await fillField(page.getByTestId("crm-customer-phone"), "0944 000 666");
      await tap(page.getByTestId("crm-customer-save"));
      await fillField(page.getByTestId("crm-customer-email"), customerEmail);
      await tap(page.getByTestId("crm-customer-email-save"));
      await expect(page.getByText(t(L, "crm:customers.emailSaved"))).toBeVisible();
    });

    await test.step("compose the chain in the new-appointment sheet", async () => {
      await page.goto("/vi/business");
      await tap(page.getByTestId("crm-new-appointment"));
      await fillField(page.getByTestId("crm-client-name"), "Đỗ Hải Yến");
      await fillField(page.getByTestId("crm-client-phone"), "0944 000 666");
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

    await test.step("no email to the customer; the drawer says Zalo cannot reach them", async () => {
      const messages = page.getByTestId("crm-booking-messages");
      await expect(messages.getByTestId("crm-booking-message")).toHaveCount(0);
      await expect(messages.getByTestId("crm-booking-messages-unreachable")).toHaveText(
        t(L, "notifications:panel.messages.reach.not_connected"),
      );
      await expectNoMail(customerEmail);
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
