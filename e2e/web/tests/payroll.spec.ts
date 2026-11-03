// Payroll and the owner's "This month" profit (topic 07, ADR-0014): the owner sees everyone's
// pay with the "estimate before tax and insurance" note, adds an adjustment with a reason, closes
// and reopens the month; the This-month tiles equal the metric registry values from the API; the
// staff member gets 403 on payroll and only their own estimate (UI card: scripts/e2e/crm-payroll.mjs).
import { ApiClient } from "../support/api";
import { API } from "../support/env";
import { expect, need, test } from "../support/fixtures";
import { t } from "../support/i18n";
import { byTestId, fillField, tap } from "../support/ui";

test.use({ area: "payroll" });

/** Same output as packages/localization formatVND (vi): "8.000.000đ". */
const vnd = (n: number) =>
  `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n)}đ`;

interface PayrollJson {
  totals: { total: number };
  rows: { staffId: string; commission: number; total: number }[];
}
interface ProfitJson {
  metrics: Record<string, { value: number | null }>;
}

test("owner: payroll + profit; staff: own estimate only", async ({ seed, signedIn }) => {
  const month = seed.today.slice(0, 7);
  const owner = await signedIn(seed.ownerEmail);

  await test.step("payroll page shows every person, the note, and the API totals", async () => {
    await owner.goto("/vi/business/payroll");
    await expect(byTestId(owner, "crm-payroll-note")).toContainText(
      t("vi", "crm:payroll.estimateNote"),
    );
    const api = (await (
      await owner.request.get(`${API}/salons/${seed.salonId}/payroll?month=${month}`)
    ).json()) as PayrollJson;
    for (const id of [seed.staffIds.lan, seed.staffIds.mai]) {
      await expect(byTestId(owner, `crm-payroll-row-${id}`)).toBeVisible();
    }
    await expect(byTestId(owner, "crm-payroll-totals")).toContainText(vnd(api.totals.total));
  });

  await test.step("an adjustment needs a reason and shows up", async () => {
    await tap(byTestId(owner, `crm-payroll-row-${seed.staffIds.mai}`));
    await tap(byTestId(owner, "crm-adjust-add"));
    await expect(owner.getByText(t("vi", "crm:common.required")).first()).toBeVisible();
    await fillField(byTestId(owner, "crm-adjust-amount"), "250000");
    await fillField(byTestId(owner, "crm-adjust-reason"), "Thưởng E2E");
    await tap(byTestId(owner, "crm-adjust-add"));
    await expect(owner.getByText("Thưởng E2E")).toBeVisible();
    await owner.keyboard.press("Escape");
  });

  await test.step("close the month, then reopen it with a reason", async () => {
    await owner.goto("/vi/business/payroll");
    await tap(byTestId(owner, "crm-payroll-close"));
    await tap(byTestId(owner, "crm-payroll-close-confirm-confirm"));
    await tap(byTestId(owner, "crm-payroll-reopen"));
    await expect(owner.getByText(t("vi", "crm:payroll.reopenBody"))).toBeVisible();
    // The sheet can still be settling (WebKit under load): retry the fill until React keeps it.
    await expect(async () => {
      await fillField(byTestId(owner, "crm-payroll-reopen-reason"), "Sửa thưởng");
    }).toPass({ timeout: 15_000 });
    await tap(byTestId(owner, "crm-payroll-reopen-confirm"));
    await expect(byTestId(owner, "crm-payroll-close")).toBeVisible();
  });

  await test.step("This month: 4 tiles, net equals the registry value", async () => {
    await owner.goto("/vi/business/insights?tab=month");
    await expect(owner.getByTestId(/^crm-profit-tile-/)).toHaveCount(4);
    const profit = (await (
      await owner.request.get(`${API}/salons/${seed.salonId}/insights/profit?month=${month}`)
    ).json()) as ProfitJson;
    const net = need(profit.metrics["profit.net"]?.value, "profit.net");
    await expect(byTestId(owner, "crm-profit-value-profit.net")).toHaveText(vnd(net));
    await expect(byTestId(owner, "crm-profit-costs")).toContainText(vnd(12_000_000));
  });

  await test.step("staff (API, own rate-limit bucket): payroll denied, own estimate only", async () => {
    // One browser sign-in per project keeps the run inside the per-IP magic-link budget (README).
    const staff = await ApiClient.signIn(need(seed.staffEmail, "staff account"), "10.77.200.1");
    await expect(staff.call(`/salons/${seed.salonId}/payroll?month=${month}`)).rejects.toThrow(
      /403/,
    );
    const mine = await staff.call<{ hasProfile: boolean }>(
      `/salons/${seed.salonId}/payroll/me?month=${month}`,
    );
    expect(mine.hasProfile).toBe(true);
  });
});
