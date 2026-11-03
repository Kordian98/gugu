// Flow (vi): X25 — a salon on Basic in its free first year (moved there by global-setup through the
// admin API). The owner sees the plan and the free-year end in Settings → Plan, the assistant
// bubble explains that the assistant comes with Pro instead of chatting, the assistant API refuses
// with 403 entitlement.required, and the AI price-list import stays available.
import { ApiClient } from "../support/api";
import { API } from "../support/env";
import { t } from "../support/i18n";
import { expect, test } from "../support/fixtures";
import { tap } from "../support/ui";

const L = "vi" as const;
test.use({ area: "basic" });

test.describe("Basic plan, free first year @vi", () => {
  test("Settings shows Basic and the free-year end; the assistant is an upsell; import stays", async ({
    seed,
    signedIn,
  }, info) => {
    const page = await signedIn(seed.ownerEmail, { next: "/vi/business/settings" });

    const ent = (await (
      await page.request.get(`${API}/salons/${seed.salonId}/entitlements`)
    ).json()) as {
      plan: string;
      status: string;
      freeUntil: string;
      basicMonthlyPriceVnd: number;
      entitlements: Record<string, unknown>;
    };
    expect(ent).toMatchObject({ plan: "basic", status: "active", basicMonthlyPriceVnd: 99_000 });
    expect(ent.entitlements["ai.agent.enabled"]).toBe(false);
    expect(ent.entitlements["ai.onboarding_import"]).toBe(true);
    expect(ent.entitlements["ai.monthly_cost_cap_vnd"]).toBe(10_000);

    await test.step("Settings → Plan: Basic, free through the last free day", async () => {
      const card = page.getByTestId("crm-settings-plan");
      await expect(page.getByTestId("crm-plan-name")).toHaveText(t(L, "crm:plan.name.basic"));
      // Format exactly as the app does, in the browser under test (ICU output differs by engine).
      const lastFreeDay = await page.evaluate(
        (iso) =>
          new Intl.DateTimeFormat("vi-VN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Ho_Chi_Minh",
          }).format(new Date(Date.parse(iso) - 1)),
        ent.freeUntil,
      );
      await expect(card.getByTestId("crm-plan-free-until")).toContainText(lastFreeDay);
      await expect(card.getByTestId("crm-plan-trial-ends")).toHaveCount(0);
      await expect(card).toContainText(t(L, "crm:plan.status.active"));
    });

    await test.step("the assistant bubble shows the Pro upsell, never the chat", async () => {
      await page.goto("/vi/business");
      await tap(page.getByTestId("assistant-bubble"));
      const panel = page.getByTestId("assistant-panel");
      await expect(panel.getByTestId("assistant-upgrade")).toContainText(
        t(L, "crm:assistant.upgradeTitle"),
      );
      await expect(panel.getByTestId("assistant-input")).toHaveCount(0);
      await expect(panel.getByTestId("assistant-not-configured")).toHaveCount(0);
      await tap(panel.getByRole("button", { name: t(L, "crm:assistant.upgradeCta") }));
      await expect(page).toHaveURL(/\/vi\/business\/settings/);
      await expect(page.getByTestId("crm-settings-plan")).toBeVisible();
    });

    await test.step("API: assistant 403 entitlement.required, AI import still entitled", async () => {
      // Native client (bearer): its own rate-limit bucket via X-Forwarded-For.
      const ip = `10.78.${info.project.name === "chromium" ? "1" : "2"}.1`;
      const api = await ApiClient.signIn(seed.ownerEmail, ip);
      const status = await api.call<{ entitled: boolean; permitted: boolean }>(
        `/salons/${seed.salonId}/assistant`,
      );
      expect(status).toMatchObject({ entitled: false, permitted: true });
      await expect(
        api.call(`/salons/${seed.salonId}/assistant/turns`, "POST", { text: "Hôm nay thế nào?" }),
      ).rejects.toThrow(/→ 403 .*entitlement\.required/);
      const aiImport = await api.call<{ entitled: boolean; usage: { capVnd: number } }>(
        `/salons/${seed.salonId}/ai-import`,
      );
      expect(aiImport.entitled).toBe(true);
      expect(aiImport.usage.capVnd).toBe(10_000);
    });
  });
});
