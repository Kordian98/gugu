// Flow 1: a new owner signs up with only an email (owner 2026-11-04): email → 6-digit code → the
// guided setup (name + type tiles → hours preset → template services, with the AI import shown as
// "not configured" → team by name → Zalo skipped → celebration with today's calendar) → first
// appointment straight from the done screen. Then the old journey continues: a service performed
// only by one person (staff checkboxes), "find the earliest slot", a client email on the profile,
// drag-reschedule and cancel. GuGu never emails a salon's customers (X26). A second test runs the
// signup on a 390 px phone in English, leaves the wizard halfway and finishes one step from the
// Today "finish setup" card.
import { expect, test, type Page } from "@playwright/test";
import { signInViaUi, signUpWithCodeViaUi } from "../support/auth";
import { API, WEB } from "../support/env";
import { t, type Locale } from "../support/i18n";
import { expectNoMail } from "../support/mailpit";
import { mail } from "../support/seed";
import { addDays, vnDate } from "../support/time";
import { dragVertically, fillField, hydrated, tap } from "../support/ui";

const L = "vi" as const;

const noHorizontalOverflow = async (page: Page, where: string) => {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll, `${where}: ${String(scroll)}px wide in ${String(width)}px`).toBeLessThanOrEqual(
    width,
  );
};

test.describe("owner journey @vi", () => {
  test("email only → guided setup → first appointment → service → drag-reschedule → cancel", async ({
    page,
  }, info) => {
    const owner = mail("newowner", info.project.name);
    const customerEmail = mail("customer1", info.project.name);
    // A new account's display name defaults to the email's local part.
    const ownerName = owner.slice(0, owner.indexOf("@"));
    const gel = "Sơn gel tay";

    await test.step("sign up with only an email and the 6-digit code", async () => {
      await signUpWithCodeViaUi(page, owner, L);
      await expect(page).toHaveURL(/\/vi\/business\/setup/);
      await expect(page.getByTestId("crm-setup-title")).toHaveText(
        t(L, "crm:setupWizard.business.title"),
      );
      await expect(page.getByText(t(L, "crm:setupWizard.totalEta"))).toBeVisible();
    });

    await test.step("(a) the name is mandatory: no skip, no 'later', the app stays closed", async () => {
      const next = page.getByTestId("crm-setup-next");
      await expect(next).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByTestId("crm-setup-skip")).toHaveCount(0);
      await expect(page.getByTestId("crm-setup-later")).toHaveCount(0);
      // q103: no default name anywhere.
      for (const placeholder of ["Salon của tôi", "Salon của bạn", "My salon"]) {
        await expect(page.getByText(placeholder)).toHaveCount(0);
      }
      // The workspace does not open before the salon has a name.
      await page.goto("/vi/business/calendar");
      await expect(page).toHaveURL(/\/vi\/business\/setup/);
      await expect(page.getByTestId("crm-nav-services")).toHaveCount(0);
      // Friendly inline validation, then a live preview and a check pop.
      await fillField(page.getByTestId("crm-setup-salon-name"), "M");
      await expect(page.getByTestId("crm-setup-name-issue")).toHaveText(
        t(L, "crm:setupWizard.business.nameTooShort"),
      );
      await expect(next).toHaveAttribute("aria-disabled", "true");
      await fillField(page.getByTestId("crm-setup-salon-name"), "Mây Nail & Spa E2E");
      await expect(page.getByTestId("crm-setup-name-ok")).toBeVisible();
      await expect(page.getByTestId("crm-setup-name-preview")).toContainText("Mây Nail & Spa E2E");
      await tap(page.getByTestId("crm-setup-type-nails"));
      await expect(page.getByTestId("crm-setup-type-nails")).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await tap(next);
      await expect(page.getByTestId("crm-setup-cheer")).toHaveText(
        t(L, "crm:setupWizard.cheer.remaining_other", { count: 4 }),
      );
    });

    await test.step("(b) opening hours preset", async () => {
      await expect(page.getByTestId("crm-setup-title")).toHaveText(
        t(L, "crm:setupWizard.hours.title"),
      );
      await expect(page.getByTestId("crm-setup-hours-everyday_9_21")).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await tap(page.getByTestId("crm-setup-next"));
    });

    await test.step("(c) AI import not configured is explained; template services fill the list", async () => {
      const ai = page.getByTestId("crm-setup-ai-unavailable");
      await expect(ai).toBeVisible();
      await expect(ai).toContainText(t(L, "crm:setupWizard.services.aiUnavailable"));
      await expect(page.getByTestId("crm-setup-ai-pick")).toHaveCount(0);
      const list = page.getByTestId("crm-setup-service-list");
      await expect(list).toContainText(t(L, "crm:setupWizard.services.empty"));
      await tap(page.getByTestId("crm-setup-template-add"));
      await expect(page.getByTestId("crm-setup-template-added")).toHaveText(
        t(L, "crm:setupWizard.services.added_other", { count: 7 }),
      );
      await expect(list.getByText(gel, { exact: true })).toBeVisible();
      await expect(list.getByText("Úp móng gel", { exact: true })).toBeVisible();
      await tap(page.getByTestId("crm-setup-next"));
    });

    await test.step("(d) team by name: me + Trần Mai", async () => {
      await tap(page.getByTestId("crm-setup-with-team"));
      await expect(page.getByTestId("crm-setup-my-name")).toHaveValue(ownerName);
      await fillField(page.getByTestId("crm-setup-staff-name"), "Trần Mai");
      await tap(page.getByTestId("crm-setup-staff-add"));
      await expect(
        page.getByTestId("crm-setup-team-list").getByText("Trần Mai", { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("crm-setup-staff-name")).toHaveValue("");
      await tap(page.getByTestId("crm-setup-next"));
    });

    await test.step("(e) Zalo: one-line benefit, connect offered, skipped", async () => {
      await expect(page.getByTestId("crm-setup-title")).toHaveText(
        t(L, "crm:setupWizard.zalo.title"),
      );
      await expect(page.getByTestId("crm-setup-zalo-connect")).toBeVisible();
      await tap(page.getByTestId("crm-setup-skip"));
    });

    await test.step("(f) celebration with today's real calendar", async () => {
      await expect(page.getByTestId("crm-setup-done")).toBeVisible();
      await expect(page.getByTestId("crm-setup-title")).toHaveText(
        t(L, "crm:setupWizard.done.title"),
      );
      const preview = page.getByTestId("crm-setup-calendar-preview");
      await expect(preview.getByText("Trần Mai")).toBeVisible();
      await expect(page.getByTestId("crm-setup-done-remaining")).toContainText(
        t(L, "crm:finishSetup.items.zalo"),
      );
    });

    await test.step("first appointment straight from the done screen", async () => {
      await tap(page.getByTestId("crm-setup-first-booking"));
      await expect(page).toHaveURL(/\/vi\/business\/calendar/);
      await fillField(page.getByTestId("crm-client-name"), "Phạm Thu Trang");
      await fillField(page.getByTestId("crm-client-phone"), "0909 000 111");
      await tap(page.getByTestId("crm-chip").filter({ hasText: gel }));
      await tap(page.getByTestId("crm-find-earliest"));
      const first = page.getByTestId("crm-earliest-slot").first();
      await expect(first).toBeVisible();
      await tap(first);
      await tap(page.getByTestId("crm-new-confirm"));
      await expect(page.getByTestId("crm-new-confirm")).toHaveCount(0);
    });

    await test.step("Today: no redirect back, a compact finish card that can be hidden", async () => {
      await page.goto("/vi/business");
      const card = await hydrated(page.getByTestId("crm-finish-setup"));
      await expect(page).toHaveURL(/\/vi\/business$/);
      await expect(card.getByTestId("crm-finish-setup-zalo")).toBeVisible();
      await expect(card.getByTestId("crm-finish-setup-services")).toHaveCount(0);
      // The old checklist never shows for salons from the guided setup.
      await expect(page.getByTestId("crm-setup-card")).toHaveCount(0);
      await tap(page.getByTestId("crm-finish-setup-dismiss"));
      await expect(page.getByTestId("crm-finish-setup")).toHaveCount(0);
      await page.reload();
      await hydrated(page.getByTestId("crm-nav-services"));
      await expect(page.getByTestId("crm-finish-setup")).toHaveCount(0);
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
      await tap(page.getByTestId("crm-chip").filter({ hasText: gel }));
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

    const block = page.getByRole("button", {
      name: new RegExp(`^\\d\\d:\\d\\d ${gel}, Võ Thị Hồng,`),
    });

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
      await expect(page.getByTestId("crm-booking-email")).toHaveCount(0);
    });

    await test.step("cancel (salon reason): still nothing reaches the customer by email", async () => {
      await tap(page.getByRole("button", { name: t(L, "crm:booking.cancel"), exact: true }));
      await expect(page.getByText(t(L, "crm:booking.cancelNotice"))).toBeVisible();
      await tap(page.getByRole("radio", { name: t(L, "crm:booking.reasons.salon"), exact: true }));
      await tap(page.getByTestId("crm-cancel-confirm"));
      await expect(page.getByTestId("crm-cancel-confirm")).toHaveCount(0);
      await expect(block).toHaveCount(0);
      // GuGu sent no email to the customer, not even to the address stored on the profile (X26).
      await expectNoMail(customerEmail);
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

    await test.step("q102: invited staff sign in on the generic screen first and still just join", async () => {
      const staffEmail = mail("invitedstaff", info.project.name);
      // The owner invites by email (email-bound invitation) with their own browser session.
      const me = (await (await page.request.get(`${API}/me`)).json()) as {
        user: { memberships: { salonId: string }[] };
        csrfToken: string;
      };
      const salonId = me.user.memberships[0]?.salonId ?? "";
      const invited = await page.request.post(`${API}/salons/${salonId}/invitations`, {
        headers: { "x-csrf-token": me.csrfToken },
        data: { role: "staff", email: staffEmail, locale: "vi" },
      });
      expect(invited.status()).toBe(201);

      const ctx = await page
        .context()
        .browser()
        ?.newContext({
          baseURL: WEB,
          locale: "vi-VN",
          timezoneId: "Asia/Ho_Chi_Minh",
          viewport: { width: 1440, height: 900 },
        });
      if (!ctx) throw new Error("no browser");
      const staff = await ctx.newPage();
      await signInViaUi(staff, staffEmail, L);
      const card = staff.getByTestId("crm-invitations");
      await expect(card).toBeVisible();
      await expect(card).toContainText(
        t(L, "crm:quickStart.invitedOne", { salon: "Mây Nail & Spa E2E" }),
      );
      await expect(staff.getByTestId("crm-quick-start-create-own")).toHaveText(
        t(L, "crm:quickStart.createOwn"),
      );
      await tap(staff.getByTestId("crm-invitation-join"));
      // Joined: the invitation screen is gone and the workspace opens in the inviter's salon.
      await expect(staff.getByTestId("crm-invitations")).toHaveCount(0);
      await expect(staff).toHaveURL(/\/vi\/business$/);
      // Exactly the inviter's salon: no empty salon of their own.
      await expect
        .poll(async () => {
          const res = (await (await staff.request.get(`${API}/me`)).json()) as {
            user: { memberships: { salonId: string; role: string }[] };
          };
          return res.user.memberships.map((m) => `${m.salonId}:${m.role}`);
        })
        .toEqual([`${salonId}:staff`]);
      await ctx.close();
    });
  });
});

test.describe("phone signup @en", () => {
  test("390 px: email only → leave the wizard halfway → finish one step from Today", async ({
    browser,
  }, info) => {
    const E: Locale = "en";
    const ctx = await browser.newContext({
      baseURL: WEB,
      locale: "en-US",
      timezoneId: "Asia/Ho_Chi_Minh",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const owner = mail("phoneowner", info.project.name);

    await test.step("sign up and land in the full-screen wizard", async () => {
      await signUpWithCodeViaUi(page, owner, E);
      await expect(page).toHaveURL(/\/en\/business\/setup/);
      await expect(page.getByTestId("crm-setup-title")).toHaveText(
        t(E, "crm:setupWizard.business.title"),
      );
      // Focused screen: no workspace tabs while setting up.
      await expect(page.getByTestId("crm-nav-services")).toHaveCount(0);
      await noHorizontalOverflow(page, "wizard step 1");
    });

    await test.step("name + type, skip hours, then 'Later' on services", async () => {
      await fillField(page.getByTestId("crm-setup-salon-name"), "Lotus Lashes E2E");
      await tap(page.getByTestId("crm-setup-type-lashes_brows"));
      await tap(page.getByTestId("crm-setup-next"));
      await expect(page.getByTestId("crm-setup-title")).toHaveText(
        t(E, "crm:setupWizard.hours.title"),
      );
      await tap(page.getByTestId("crm-setup-skip"));
      await expect(page.getByTestId("crm-setup-cheer")).toHaveText(
        t(E, "crm:setupWizard.cheer.skipped"),
      );
      await expect(page.getByTestId("crm-setup-template")).toContainText("Classic lash extensions");
      await noHorizontalOverflow(page, "services step");
      await tap(page.getByTestId("crm-setup-later"));
      await expect(page).toHaveURL(/\/en\/business$/);
    });

    await test.step("Today shows only what is still open; resume one step from the card", async () => {
      const card = await hydrated(page.getByTestId("crm-finish-setup"));
      await expect(card.getByTestId("crm-finish-setup-business")).toHaveCount(0);
      await expect(card.getByTestId("crm-finish-setup-hours")).toBeVisible();
      await expect(card.getByTestId("crm-finish-setup-services")).toBeVisible();
      await expect(card.getByTestId("crm-finish-setup-team")).toBeVisible();
      await tap(card.getByTestId("crm-finish-setup-hours"));
      await expect(page.getByTestId("crm-setup-title")).toHaveText(
        t(E, "crm:setupWizard.hours.title"),
      );
      await tap(page.getByTestId("crm-setup-hours-weekdays_9_19"));
      await tap(page.getByTestId("crm-setup-next"));
      await expect(page).toHaveURL(/\/en\/business$/);
      const after = await hydrated(page.getByTestId("crm-finish-setup"));
      await expect(after.getByTestId("crm-finish-setup-hours")).toHaveCount(0);
      await expect(after.getByTestId("crm-finish-setup-services")).toBeVisible();
      await noHorizontalOverflow(page, "Today with the finish card");
    });

    await ctx.close();
  });
});
