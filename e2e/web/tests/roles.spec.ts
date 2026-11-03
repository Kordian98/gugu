// Flow 2 (vi): receptionist and staff roles on the seeded salon.
// - Receptionist joins through an invite (created in the Team UI, delivered by email) and sees
//   every booking of the day with full phone numbers.
// - Staff (linked to Nguyễn Lan) lands on "my day" with only her own client, sees that client's
//   phone (q24: staff see phones by default), and the API refuses other staff's bookings and
//   another salon entirely (tenant escape).
import type { Page } from "@playwright/test";
import { t, tx } from "../support/i18n";
import { API } from "../support/env";
import { expect, otherSeed, test } from "../support/fixtures";
import { waitForMail } from "../support/mailpit";
import { SEED, mail } from "../support/seed";
import { addDays } from "../support/time";
import { hydrated, fillField, tap } from "../support/ui";

const L = "vi" as const;
const lan = SEED.bookings.lanToday;
const mai = SEED.bookings.maiToday;
const e164 = (vn: string) => `+84${vn.replace(/\D/g, "").slice(1)}`;

async function openBlock(page: Page, time: string, service: string, customer: string) {
  const block = page.getByRole("button", { name: new RegExp(`^${time} ${service}, ${customer},`) });
  await tap(block);
  await expect(page.getByTestId("crm-booking-customer")).toHaveText(customer);
}

test.describe("roles @vi", () => {
  test("receptionist joins by email invite and sees all bookings with phones", async ({
    page,
    seed,
    signedIn,
  }, info) => {
    const recep = mail("recep-ui", info.project.name);
    let acceptUrl = "";

    await test.step("owner invites a receptionist from the Team page", async () => {
      const owner = await signedIn(seed.ownerEmail);
      await owner.goto("/vi/business/team");
      await tap(owner.getByRole("button", { name: t(L, "crm:team.invite") }).first());
      await tap(
        owner.getByRole("radio", { name: t(L, "crm:shell.roles.receptionist"), exact: true }),
      );
      await fillField(owner.getByLabel(t(L, "crm:team.inviteEmail"), { exact: true }), recep);
      await tap(owner.getByTestId("crm-invite-create"));
      acceptUrl = (await owner.getByTestId("crm-invite-url").innerText()).trim();
      expect(acceptUrl).toMatch(/\/vi\/join-team\?token=/);
      const [invitation] = await waitForMail(recep, {
        subject: tx(L, "email:teamInvitation.subject"),
      });
      expect(invitation?.Text, "invitation email carries the same link").toContain(acceptUrl);
    });

    await test.step("receptionist signs in from the link and accepts", async () => {
      const path = new URL(acceptUrl).pathname + new URL(acceptUrl).search;
      const { signInViaUi } = await import("../support/auth");
      await signInViaUi(page, recep, L, path);
      await expect(page).toHaveURL(/\/vi\/join-team/);
      await tap(page.getByTestId("crm-join-accept"));
      await expect(page).toHaveURL(/\/vi\/business/);
    });

    await test.step("calendar shows both staff's bookings; drawer shows full phones", async () => {
      await page.goto(`/vi/business/calendar?date=${seed.today}`);
      await hydrated(page.getByTestId("crm-timeline"));
      await openBlock(page, lan.time, SEED.services.gel.vi, lan.name);
      await expect(page.getByRole("link", { name: e164(lan.phone) })).toBeVisible();
      await page.keyboard.press("Escape");
      await tap(page.getByRole("button", { name: t(L, "crm:common.close") }).last());
      await openBlock(page, mai.time, SEED.services.cut.vi, mai.name);
      await expect(page.getByRole("link", { name: e164(mai.phone) })).toBeVisible();
    });
  });

  test("staff (phone): own-scope 'my day' with phone; other staff and other salon refused", async ({
    seed,
    signedIn,
  }, info) => {
    const page = await signedIn(seed.staffEmail, { mobile: true });

    await test.step("lands on my day with only her own client", async () => {
      await page.goto("/vi/business");
      const myDay = page.getByTestId("crm-my-day");
      await expect(myDay.getByTestId(`crm-my-day-${seed.bookingIds.lanToday}`)).toContainText(
        lan.name,
      );
      await expect(myDay.getByTestId(`crm-my-day-${seed.bookingIds.maiToday}`)).toHaveCount(0);
      await expect(myDay).not.toContainText(mai.name);
    });

    await test.step("drawer shows the client's phone (staff see phones by default)", async () => {
      await tap(
        page.getByTestId("crm-my-day").getByTestId(`crm-my-day-${seed.bookingIds.lanToday}`),
      );
      await expect(page.getByTestId("crm-booking-customer")).toHaveText(lan.name);
      await expect(page.getByRole("link", { name: e164(lan.phone) })).toBeVisible();
    });

    await test.step("API (same session) refuses Mai's booking and another salon", async () => {
      const from = seed.today;
      const to = addDays(seed.today, 1);
      const list = await page.request.get(
        `${API}/salons/${seed.salonId}/bookings?from=${from}&to=${to}`,
      );
      expect(list.status(), "own salon bookings list").toBe(200);
      const ids = ((await list.json()) as { items: { id: string }[] }).items.map((b) => b.id);
      expect(ids, `staff list should hold Lan's ${seed.bookingIds.lanToday} only`).toContain(
        seed.bookingIds.lanToday,
      );
      expect(ids, `staff list must not hold Mai's ${seed.bookingIds.maiToday}`).not.toContain(
        seed.bookingIds.maiToday,
      );

      const other = await page.request.get(
        `${API}/salons/${seed.salonId}/bookings/${seed.bookingIds.maiToday}`,
      );
      expect(
        [403, 404],
        `GET Mai's booking ${seed.bookingIds.maiToday} as Lan → ${String(other.status())}`,
      ).toContain(other.status());

      const foreign = otherSeed(info.project.name);
      const escape = await page.request.get(
        `${API}/salons/${foreign.salonId}/bookings?from=${from}&to=${to}`,
      );
      expect(
        [403, 404],
        `GET salon ${foreign.salonId} (other tenant) → ${String(escape.status())}`,
      ).toContain(escape.status());
    });
  });

  test("BUG: staff on desktop see an empty Today timeline despite own bookings", async ({
    seed,
    signedIn,
  }) => {
    test.info().annotations.push({
      type: "issue",
      description:
        "Today timeline columns come from GET /team, which staff may not read (members.read), so a staff member with appointments sees 'Chưa có lịch hẹn hôm nay' on desktop while the KPI says 1. Expected: her own column with her booking.",
    });
    test.fail();
    const page = await signedIn(seed.staffEmail);
    await page.goto("/vi/business");
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^${lan.time} ${SEED.services.gel.vi}, ${lan.name},`),
      }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
