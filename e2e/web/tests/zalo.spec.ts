// Flow 3 (vi): Zalo OA via the built-in emulator (ZALO_CLIENT=emulated; no real Zalo calls).
// Owner connects the OA → a customer books through the rule-based bot in the emulator chat → the
// booking appears in the calendar → the customer asks for staff → the hand-off shows in the inbox
// → staff take over and reply → the reply reaches the customer's chat.
import type { Page } from "@playwright/test";
import { API_ORIGIN } from "../support/env";
import { t } from "../support/i18n";
import { expect, need, test } from "../support/fixtures";
import { SEED } from "../support/seed";
import { addDays, vnDate } from "../support/time";
import { fillField, tap } from "../support/ui";

const L = "vi" as const;
const tomorrow = addDays(vnDate(), 1);

const oaMessages = (emu: Page) => emu.locator("#chat .msg.oa");

/**
 * Taps the newest bot button titled `title` and waits for a new bot message containing `reply`.
 * The bot may answer with several bubbles in one burst, and the emulator orders equal timestamps
 * arbitrarily, so we count matching bubbles instead of reading "the last one".
 */
async function botTap(emu: Page, title: string | RegExp, reply: string | RegExp): Promise<void> {
  const matching = oaMessages(emu).filter({ hasText: reply });
  const before = await matching.count();
  await oaMessages(emu).getByRole("button", { name: title }).last().click();
  await expect(
    matching,
    `new bot message ${String(reply)} after tapping ${String(title)}`,
  ).toHaveCount(before + 1, {
    timeout: 20_000,
  });
}

test.use({ area: "zalo" });

test.describe("zalo @vi", () => {
  test("connect OA → bot booking in calendar → hand-off in inbox → staff reply", async ({
    seed,
    signedIn,
  }, info) => {
    const oaId = `oa_e2e_${info.project.name}`;
    const owner = await signedIn(seed.ownerEmail);

    await test.step("owner connects the OA through the emulator's consent page", async () => {
      await owner.goto("/vi/business/settings?section=zalo");
      await tap(owner.getByTestId("zalo-connect"));
      await owner.waitForURL(/\/dev\/zalo-emulator\/oauth\/permission/);
      await owner.locator('input[name="oa_id"]').fill(oaId);
      await owner.locator('input[name="oa_name"]').fill("Lotus E2E OA");
      await owner.getByRole("button", { name: "Allow" }).click();
      await owner.waitForURL(/\/vi\/business\/settings\?section=zalo&zalo=connected/);
      await expect(owner.getByText(t(L, "zalo:panel.result.connected"))).toBeVisible();
      await expect(
        owner.getByText(t(L, "zalo:panel.status.connected"), { exact: true }),
      ).toBeVisible();
    });

    const emu = await owner.context().newPage();
    await test.step("customer greets the OA in the emulator", async () => {
      await emu.goto(`${API_ORIGIN}/api/v1/dev/zalo-emulator?oa=${oaId}`);
      await expect(emu.locator("#oa")).toHaveValue(oaId);
      await emu.locator("#uid").fill(`zuser-${info.project.name}`);
      await emu.locator("#name").fill("Mai Zalo");
      await emu.locator("#phone").fill("0901234567");
      await emu.locator("#text").fill("xin chào");
      await emu.getByRole("button", { name: "Send", exact: true }).click();
      await expect(oaMessages(emu).first()).toBeVisible();
      await expect(oaMessages(emu).last()).toContainText(
        t(L, "zalo:bot.greetingNoName", { salon: seed.salonName }),
      );
    });

    const [, mm, dd] = tomorrow.split("-");
    let bookingRef = "";
    await test.step("customer books Sơn gel with Trần Mai tomorrow 12:00 through the bot", async () => {
      await botTap(emu, t(L, "zalo:bot.menu.book"), t(L, "zalo:bot.chooseService"));
      await botTap(emu, SEED.services.gel.vi, t(L, "zalo:bot.chooseStaff"));
      await botTap(emu, SEED.staff.mai.name, t(L, "zalo:bot.chooseDay"));
      await botTap(emu, new RegExp(`${dd ?? ""}/${mm ?? ""}$`), /\d\d\/\d\d\?/);
      await botTap(emu, new RegExp(`^${t(L, "zalo:bot.part.afternoon")}`), /12:00/);
      await botTap(emu, /^12:00$/, t(L, "zalo:bot.shareInfoTitle"));
      await botTap(emu, "Share", t(L, "zalo:bot.confirm"));
      const summary = oaMessages(emu)
        .filter({ hasText: SEED.services.gel.vi })
        .filter({ hasText: "12:00" });
      await expect(summary.last()).toContainText(SEED.staff.mai.name);
      await botTap(emu, t(L, "zalo:bot.confirm"), /Mã lịch hẹn: [A-Z0-9-]+/);
      const booked = await oaMessages(emu)
        .filter({ hasText: /Mã lịch hẹn:/ })
        .last()
        .innerText();
      bookingRef = /Mã lịch hẹn: ([A-Z0-9-]+)/.exec(booked)?.[1] ?? "";
      expect(bookingRef, `booking ref in "${booked}"`).not.toBe("");
    });

    await test.step("the bot booking is in the calendar (source: Zalo chat)", async () => {
      await owner.goto(`/vi/business/calendar?date=${tomorrow}`);
      const block = owner.getByRole("button", {
        name: new RegExp(`^12:00 ${SEED.services.gel.vi}, Mai Zalo,`),
      });
      await tap(block);
      await expect(owner.getByText(t(L, "crm:booking.title", { code: bookingRef }))).toBeVisible();
      await expect(
        owner.getByText(t(L, "crm:booking.source.zalo_oa"), { exact: true }),
      ).toBeVisible();
      await expect(owner.getByTestId("crm-booking-customer")).toHaveText("Mai Zalo");
    });

    await test.step("customer asks for staff → hand-off message", async () => {
      await botTap(emu, t(L, "zalo:bot.menu.staff"), t(L, "zalo:bot.handoff"));
    });

    await test.step("receptionist sees the waiting chat in the inbox, takes over and replies", async () => {
      const recep = await signedIn(need(seed.receptionistEmail, "receptionist"));
      await recep.goto("/vi/business/zalo");
      const waiting = recep.getByTestId("zalo-waiting");
      const item = waiting
        .locator('[data-testid^="zalo-waiting-"]')
        .filter({ hasText: "Mai Zalo" });
      await expect(item).toBeVisible();
      await tap(item.getByRole("button", { name: t(L, "zalo:panel.inbox.takeOver"), exact: true }));
      // Taken over: no longer waiting; the thread shows staff mode and the bot's hand-off message.
      await expect(item).toHaveCount(0);
      await tap(
        recep.locator('[data-testid^="zalo-conversation-"]').filter({ hasText: "Mai Zalo" }),
      );
      const thread = recep.getByTestId("zalo-thread");
      await expect(thread).toContainText(t(L, "zalo:bot.handoff"));
      await expect(thread).toContainText(t(L, "zalo:panel.inbox.staffActiveNote"));
      await expect(recep.getByTestId("zalo-release")).toBeVisible();
      await fillField(
        recep.getByTestId("zalo-reply-input"),
        "Chào chị Mai, em là lễ tân, em hỗ trợ chị nhé!",
      );
      await tap(recep.getByTestId("zalo-reply-send"));
      await expect(thread).toContainText("Chào chị Mai, em là lễ tân");
    });

    await test.step("the staff reply reaches the customer's Zalo chat", async () => {
      await expect(oaMessages(emu).filter({ hasText: "Chào chị Mai, em là lễ tân" })).toHaveCount(
        1,
        { timeout: 20_000 },
      );
    });
  });
});
