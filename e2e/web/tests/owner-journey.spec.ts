// Flow 1 (vi): a new owner registers, runs the first-run wizard, adds a service with staff
// checkboxes, books with "find the earliest slot", stores a client's email on the profile,
// drag-reschedules in the calendar and cancels. GuGu never emails a salon's customers (X26):
// Mailpit must stay empty for them, and the drawer says the salon has no Zalo OA to reach them.
import { expect, test } from "@playwright/test";
import { signInViaUi } from "../support/auth";
import { t } from "../support/i18n";
import { expectNoMail } from "../support/mailpit";
import { mail } from "../support/seed";
import { addDays, vnDate } from "../support/time";
import { dragVertically, fillField, hydrated, tap } from "../support/ui";

const L = "vi" as const;

test.describe("owner journey @vi", () => {
  test("register → onboarding → service → book earliest → drag-reschedule → cancel", async ({
    page,
  }, info) => {
    const owner = mail("newowner", info.project.name);
    const customerEmail = mail("customer1", info.project.name);
    const earliestEmail = mail("customer0", info.project.name);
    // A new account's display name defaults to the email's local part.
    const ownerName = owner.slice(0, owner.indexOf("@"));

    await test.step("sign in with a new email and land on registration", async () => {
      await signInViaUi(page, owner, L);
      await expect(page).toHaveURL(/\/vi\/business\/join/);
    });

    await test.step("register the salon", async () => {
      await fillField(
        page.getByLabel(t(L, "auth:join.businessName"), { exact: true }),
        "Mây Nail & Spa E2E",
      );
      const cat = page.getByRole("radiogroup", { name: t(L, "auth:join.category") });
      await tap(cat.getByRole("radio").first());
      await fillField(page.getByLabel(t(L, "auth:join.phone"), { exact: true }), "0912 345 678");
      await tap(
        page
          .getByRole("radiogroup", { name: t(L, "auth:join.province") })
          .getByRole("radio")
          .first(),
      );
      await tap(
        page
          .getByRole("radiogroup", { name: t(L, "auth:join.ward") })
          .getByRole("radio")
          .first(),
      );
      await fillField(
        page.getByLabel(t(L, "auth:join.streetAddress"), { exact: true }),
        "8 Hai Bà Trưng",
      );
      await tap(page.getByRole("button", { name: t(L, "auth:join.submit") }));
      await expect(page.getByText(t(L, "auth:join.doneTitle"))).toBeVisible();
      await tap(page.getByRole("button", { name: t(L, "auth:join.goToBusiness") }));
    });

    await test.step("wizard: hours preset → services → team → go live", async () => {
      await expect(page).toHaveURL(/\/vi\/business\/setup/);
      await tap(page.getByRole("button", { name: t(L, "crm:settings.hoursPreset") }));
      // Seven open days → seven start-time inputs and seven day switches exposed as checked.
      await expect(page.getByLabel(t(L, "crm:team.start"), { exact: true })).toHaveCount(7);
      await expect(page.getByRole("switch", { checked: true })).toHaveCount(7);
      await expect(page.getByRole("switch", { checked: false })).toHaveCount(0);
      await tap(page.getByTestId("crm-hours-save"));
      await expect(page.getByText(t(L, "crm:common.saving"))).toHaveCount(0);
      await tap(page.getByTestId("crm-wizard-next"));

      await fillField(page.getByTestId("crm-wizard-service-name"), "Sơn gel");
      await fillField(page.getByTestId("crm-wizard-service-price"), "150000");
      await tap(page.getByTestId("crm-wizard-service-add"));
      await expect(page.getByText("Sơn gel", { exact: true })).toBeVisible();
      await tap(page.getByTestId("crm-wizard-next"));

      // Type the next name right after "add myself": its success must not wipe the field.
      await tap(page.getByTestId("crm-wizard-add-me"));
      await fillField(page.getByTestId("crm-wizard-staff-name"), "Trần Mai");
      await expect(page.getByText(ownerName, { exact: true })).toBeVisible();
      await expect(page.getByTestId("crm-wizard-staff-name")).toHaveValue("Trần Mai");
      await tap(page.getByTestId("crm-wizard-staff-add"));
      await expect(page.getByText("Trần Mai", { exact: true })).toBeVisible();
      await tap(page.getByTestId("crm-wizard-next"));

      await tap(page.getByTestId("crm-wizard-go-live"));
      await expect(page).toHaveURL(/\/vi\/business$/);
    });

    await test.step("add a service performed only by Trần Mai (staff checkboxes)", async () => {
      await tap(page.getByTestId("crm-nav-services"));
      await tap(page.getByTestId("crm-service-add"));
      await fillField(page.getByTestId("crm-service-name"), "Vẽ móng nghệ thuật");
      await fillField(page.getByTestId("crm-service-price"), "200000");
      await fillField(page.getByLabel(t(L, "crm:services.duration"), { exact: true }), "45");
      const staff = page.getByTestId("crm-service-staff");
      await expect(staff.getByText(t(L, "crm:assign.count", { count: 2, total: 2 }))).toBeVisible();
      const me = staff.getByRole("checkbox", { name: ownerName });
      await expect(me).toBeChecked();
      await tap(me);
      await expect(me).not.toBeChecked();
      await expect(staff.getByRole("checkbox", { name: "Trần Mai" })).toBeChecked();
      await expect(staff.getByText(t(L, "crm:assign.count", { count: 1, total: 2 }))).toBeVisible();
      await tap(page.getByTestId("crm-service-save"));
      const row = page.getByRole("button", {
        name: t(L, "crm:services.edit", { name: "Vẽ móng nghệ thuật" }),
      });
      await expect(row).toContainText("200.000đ");
      await expect(row).toContainText("45");
    });

    const tomorrow = addDays(vnDate(), 1);

    await test.step("book with 'find the earliest slot' (Trần Mai is the only one who can)", async () => {
      await tap(page.getByTestId("crm-new-appointment"));
      await fillField(page.getByTestId("crm-client-name"), "Lê Minh Châu");
      await fillField(page.getByTestId("crm-client-phone"), "0909 000 333");
      // X26 / q87: the booking form has no email field any more.
      await expect(page.getByTestId("crm-client-email")).toHaveCount(0);
      await tap(page.getByTestId("crm-chip").filter({ hasText: "Vẽ móng nghệ thuật" }));
      await tap(page.getByTestId("crm-find-earliest"));
      const first = page.getByTestId("crm-earliest-slot").first();
      await expect(first).toBeVisible();
      await tap(first);
      await tap(page.getByTestId("crm-new-confirm"));
      await expect(page.getByTestId("crm-new-confirm")).toHaveCount(0);
    });

    await test.step("book tomorrow 10:00 for Võ Thị Hồng", async () => {
      await tap(page.getByTestId("crm-new-appointment"));
      await fillField(page.getByTestId("crm-client-name"), "Võ Thị Hồng");
      await fillField(page.getByTestId("crm-client-phone"), "0977 123 456");
      await tap(page.getByTestId("crm-chip").filter({ hasText: "Sơn gel" }));
      await tap(page.getByRole("button", { name: tomorrow, exact: true }));
      await tap(page.getByTestId("crm-slot").filter({ hasText: /^10:00$/ }));
      await tap(page.getByTestId("crm-new-confirm"));
      await expect(page.getByTestId("crm-new-confirm")).toHaveCount(0);
    });

    await test.step("store the client's email on the profile (q87: saved, never used)", async () => {
      await page.goto("/vi/business/customers");
      await tap(await hydrated(page.getByRole("button", { name: /Võ Thị Hồng/ }).first()));
      const field = page.getByTestId("crm-customer-email");
      await expect(page.getByText(t(L, "crm:customers.emailHint"))).toBeVisible();
      await fillField(field, customerEmail);
      await tap(page.getByTestId("crm-customer-email-save"));
      await expect(page.getByText(t(L, "crm:customers.emailSaved"))).toBeVisible();
      await page.reload();
      await tap(await hydrated(page.getByRole("button", { name: /Võ Thị Hồng/ }).first()));
      await expect(page.getByTestId("crm-customer-email")).toHaveValue(customerEmail);
    });

    const block = page.getByRole("button", { name: /^\d\d:\d\d Sơn gel, Võ Thị Hồng,/ });

    await test.step("drag the booking from 10:00 to 14:00 in the calendar", async () => {
      await page.goto(`/vi/business/calendar?date=${tomorrow}`);
      await hydrated(block);
      await expect(block).toHaveAccessibleName(/^10:00 /);
      // Measure the grid (hour labels) instead of assuming px per hour.
      const timeline = page.getByTestId("crm-timeline");
      const h10 = await timeline.getByText("10:00", { exact: true }).boundingBox();
      const h14 = await timeline.getByText("14:00", { exact: true }).boundingBox();
      if (!h10 || !h14) throw new Error("hour labels not found in the timeline");
      await dragVertically(page, block, h14.y - h10.y);
      await expect(block).toHaveAccessibleName(/^14:00 /);
    });

    await test.step("drawer: no Zalo OA, so no message to the customer (and no email)", async () => {
      await tap(block);
      const messages = page.getByTestId("crm-booking-messages");
      await expect(messages.getByText(t(L, "notifications:panel.messages.title"))).toBeVisible();
      await expect(messages.getByTestId("crm-booking-message")).toHaveCount(0);
      await expect(messages.getByTestId("crm-booking-messages-unreachable")).toHaveText(
        t(L, "notifications:panel.messages.reach.not_connected"),
      );
      // The drawer no longer shows a customer email.
      await expect(page.getByTestId("crm-booking-email")).toHaveCount(0);
    });

    await test.step("cancel (salon reason): still nothing reaches the customer by email", async () => {
      await tap(page.getByRole("button", { name: t(L, "crm:booking.cancel"), exact: true }));
      await expect(page.getByText(t(L, "crm:booking.cancelNotice"))).toBeVisible();
      await tap(page.getByRole("radio", { name: t(L, "crm:booking.reasons.salon"), exact: true }));
      await tap(page.getByTestId("crm-cancel-confirm"));
      await expect(page.getByTestId("crm-cancel-confirm")).toHaveCount(0);
      await expect(block).toHaveCount(0);
      // Confirmation, reschedule and cancellation happened: GuGu sent no email to the customer,
      // not even to the address stored on the profile (X26, q85/q86/q87).
      await expectNoMail(customerEmail);
      await expectNoMail(earliestEmail, 0);
    });

    await test.step("cancelled booking's drawer lists no message", async () => {
      await page.goto("/vi/business/appointments");
      await hydrated(page.getByTestId("crm-nav-appointments"));
      const row = page.getByRole("button", { name: /Võ Thị Hồng/ });
      await expect(row).toContainText(t(L, "crm:booking.status.cancelled_by_salon"));
      await tap(row);
      const messages = page.getByTestId("crm-booking-messages");
      await expect(messages.getByTestId("crm-booking-message")).toHaveCount(0);
      await expect(messages.getByTestId("crm-booking-messages-unreachable")).toBeVisible();
    });
  });
});
