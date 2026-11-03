// Flow 1 (vi): a new owner registers, runs the first-run wizard, adds a service with staff
// checkboxes, books with "find the earliest slot", drag-reschedules in the calendar and cancels.
// Customer emails are asserted in Mailpit and in the drawer's "messages sent" timeline.
import { expect, test } from "@playwright/test";
import { signInViaUi } from "../support/auth";
import { t, tx } from "../support/i18n";
import { waitForMail } from "../support/mailpit";
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
      // Seven open days → seven start-time inputs. (Toggle state is not asserted via aria-checked:
      // react-native-web drops it for role=switch — reported as a product a11y bug.)
      await expect(page.getByLabel(t(L, "crm:team.start"), { exact: true })).toHaveCount(7);
      await tap(page.getByTestId("crm-hours-save"));
      await expect(page.getByText(t(L, "crm:common.saving"))).toHaveCount(0);
      await tap(page.getByTestId("crm-wizard-next"));

      await fillField(page.getByTestId("crm-wizard-service-name"), "Sơn gel");
      await fillField(page.getByTestId("crm-wizard-service-price"), "150000");
      await tap(page.getByTestId("crm-wizard-service-add"));
      await expect(page.getByText("Sơn gel", { exact: true })).toBeVisible();
      await tap(page.getByTestId("crm-wizard-next"));

      await tap(page.getByTestId("crm-wizard-add-me"));
      // Wait for "me" before typing: add-me's success handler clears the name field (reported).
      await expect(page.getByText(ownerName, { exact: true })).toBeVisible();
      await fillField(page.getByTestId("crm-wizard-staff-name"), "Trần Mai");
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
      await tap(staff.getByRole("checkbox", { name: ownerName }));
      await expect(staff.getByText(t(L, "crm:assign.count", { count: 1, total: 2 }))).toBeVisible();
      await tap(page.getByTestId("crm-service-save"));
      const row = page.getByRole("button", {
        name: t(L, "crm:services.edit", { name: "Vẽ móng nghệ thuật" }),
      });
      await expect(row).toContainText("200.000đ");
      await expect(row).toContainText("45");
    });

    const salon = "Mây Nail & Spa E2E";
    const tomorrow = addDays(vnDate(), 1);

    await test.step("book with 'find the earliest slot' (Trần Mai is the only one who can)", async () => {
      await tap(page.getByTestId("crm-new-appointment"));
      await fillField(page.getByTestId("crm-client-name"), "Lê Minh Châu");
      await fillField(page.getByTestId("crm-client-phone"), "0909 000 333");
      await fillField(page.getByTestId("crm-client-email"), earliestEmail);
      await tap(page.getByTestId("crm-chip").filter({ hasText: "Vẽ móng nghệ thuật" }));
      await tap(page.getByTestId("crm-find-earliest"));
      const first = page.getByTestId("crm-earliest-slot").first();
      await expect(first).toBeVisible();
      await tap(first);
      await tap(page.getByTestId("crm-new-confirm"));
      await expect(page.getByTestId("crm-new-confirm")).toHaveCount(0);
      await waitForMail(earliestEmail, {
        subject: tx(L, "notifications:email.bookingConfirmed.subject", { salon }),
      });
    });

    await test.step("book tomorrow 10:00 for a customer with email", async () => {
      await tap(page.getByTestId("crm-new-appointment"));
      await fillField(page.getByTestId("crm-client-name"), "Võ Thị Hồng");
      await fillField(page.getByTestId("crm-client-phone"), "0977 123 456");
      await fillField(page.getByTestId("crm-client-email"), customerEmail);
      await tap(page.getByTestId("crm-chip").filter({ hasText: "Sơn gel" }));
      await tap(page.getByRole("button", { name: tomorrow, exact: true }));
      await tap(page.getByTestId("crm-slot").filter({ hasText: /^10:00$/ }));
      await tap(page.getByTestId("crm-new-confirm"));
      await expect(page.getByTestId("crm-new-confirm")).toHaveCount(0);
      await waitForMail(customerEmail, {
        subject: tx(L, "notifications:email.bookingConfirmed.subject", { salon }),
      });
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
      await waitForMail(customerEmail, {
        subject: tx(L, "notifications:email.bookingRescheduled.subject", { salon }),
      });
    });

    await test.step("drawer shows the messages sent; cancel the booking", async () => {
      await tap(block);
      const messages = page.getByTestId("crm-booking-messages");
      await expect(messages.getByText(t(L, "notifications:panel.messages.title"))).toBeVisible();
      const items = messages.getByTestId("crm-booking-message");
      await expect(
        items.filter({ hasText: t(L, "notifications:panel.messages.kinds.booking_confirmed") }),
      ).toHaveCount(1);
      await expect(
        items.filter({ hasText: t(L, "notifications:panel.messages.kinds.booking_rescheduled") }),
      ).toHaveCount(1);
    });

    await test.step("cancel (salon reason) → cancellation email and timeline entry", async () => {
      await tap(page.getByRole("button", { name: t(L, "crm:booking.cancel"), exact: true }));
      await tap(page.getByRole("radio", { name: t(L, "crm:booking.reasons.salon"), exact: true }));
      await tap(page.getByTestId("crm-cancel-confirm"));
      await expect(page.getByTestId("crm-cancel-confirm")).toHaveCount(0);
      await waitForMail(customerEmail, {
        subject: tx(L, "notifications:email.bookingCancelledBySalon.subject", { salon }),
      });
      await expect(block).toHaveCount(0);
      // Exactly one confirmation, one reschedule and one cancellation reached the customer's inbox.
      const all = await waitForMail(customerEmail, { count: 3 });
      expect(all.map((m) => m.Subject).sort()).toEqual(
        [
          t(L, "notifications:email.bookingCancelledBySalon.subject", { salon }),
          t(L, "notifications:email.bookingConfirmed.subject", { salon }),
          t(L, "notifications:email.bookingRescheduled.subject", { salon }),
        ].sort(),
      );
    });

    await test.step("cancelled booking's drawer lists the cancellation message", async () => {
      await page.goto("/vi/business/appointments");
      await hydrated(page.getByTestId("crm-nav-appointments"));
      const row = page.getByRole("button", { name: /Võ Thị Hồng/ });
      await expect(row).toContainText(t(L, "crm:booking.status.cancelled_by_salon"));
      await tap(row);
      const items = page.getByTestId("crm-booking-messages").getByTestId("crm-booking-message");
      const sent = t(L, "notifications:panel.messages.status.sent");
      for (const kind of [
        "booking_confirmed",
        "booking_rescheduled",
        "booking_cancelled_by_salon",
      ]) {
        await expect(
          items
            .filter({ hasText: t(L, `notifications:panel.messages.kinds.${kind}`) })
            .filter({ hasText: sent }),
          `timeline entry ${kind} with status "${sent}"`,
        ).toHaveCount(1);
      }
      // The pending reminder must not go out for a cancelled booking.
      await expect(
        items.filter({ hasText: t(L, "notifications:panel.messages.status.scheduled") }),
      ).toHaveCount(0);
    });
  });
});
