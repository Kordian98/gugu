// Payroll & commission after the owner's UX review (topic 07, ADR-0016/0017): the pay setup is
// visible on each team card and edited in one sheet (segmented base type, big amount and %,
// plain-language "from today" preview, real cost); the month is one table with totals, a person
// opens a breakdown with every commissioned service; adjustments need a reason and removing one
// can be undone; the rates tab sets one % for several people at once; the service editor shows
// and changes commission; close/reopen; "This month" has ONE headline (= registry) and a
// waterfall; the staff member gets 403 on payroll and only their own lines, never the real cost.
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
  totals: { total: number; realCost: number };
  rows: { staffId: string; commission: number; total: number; realCost: number }[];
}
interface SettingsJson {
  staff: {
    staffId: string;
    current: {
      commissionPercent: number;
      overrides: { serviceId: string; percent: number | null }[];
      employerCost: { kind: string; percent?: number } | null;
    } | null;
  }[];
}
interface ProfitJson {
  metrics: Record<string, { value: number | null }>;
}

test("owner: pay setup, month table, breakdown, bulk %, service commission, profit; staff: own only", async ({
  seed,
  signedIn,
}) => {
  const month = seed.today.slice(0, 7);
  const owner = await signedIn(seed.ownerEmail);
  const S = `${API}/salons/${seed.salonId}`;
  const settings = async () =>
    (await (await owner.request.get(`${S}/payroll/settings`)).json()) as SettingsJson;
  const current = async (id: string) =>
    need((await settings()).staff.find((s) => s.staffId === id)?.current, "pay version");

  await test.step("Team card shows the pay setup; one sheet edits it from today", async () => {
    await owner.goto("/vi/business/team");
    const card = byTestId(owner, `crm-staff-pay-${seed.staffIds.lan}`);
    await expect(card).toContainText(vnd(8_000_000));
    await expect(card).toContainText("10%");
    await tap(card);
    await expect(byTestId(owner, "crm-pay-current")).toBeVisible();
    // Default "from today", explained in one sentence with today's date.
    const [y, m, d] = seed.today.split("-");
    await expect(byTestId(owner, "crm-pay-from-preview")).toContainText(
      t("vi", "crm:payroll.effective.preview.today", { date: `${d ?? ""}/${m ?? ""}/${y ?? ""}` }),
    );
    // Validation is friendly: an empty amount is refused with a message.
    const amount = byTestId(owner, "crm-pay-amount");
    await fillField(amount, "");
    await tap(byTestId(owner, "crm-pay-save"));
    await expect(owner.getByText(t("vi", "crm:payroll.validation.amountRequired"))).toBeVisible();
    // The amount is grouped while typing.
    await amount.fill("8500000");
    await expect(amount).toHaveValue("8.500.000");
    await tap(owner.getByRole("radio", { name: "15%", exact: true }));
    // Real cost: +21,5 % on top of gross, from the accountant.
    await tap(byTestId(owner, "crm-pay-employer-percent"));
    await fillField(byTestId(owner, "crm-pay-employer-percent-input"), "21,5");
    await tap(byTestId(owner, "crm-pay-save"));
    await expect(byTestId(owner, "crm-pay-save")).toBeHidden();
    await expect(card).toContainText(vnd(8_500_000));
    await expect(card).toContainText("15%");
    const lan = await current(seed.staffIds.lan);
    expect(lan.commissionPercent).toBe(15);
    expect(lan.employerCost).toEqual({ kind: "percent", percent: 21.5 });
  });

  await test.step("month: one table, totals equal the API, real cost next to gross", async () => {
    await owner.goto("/vi/business/payroll");
    await expect(byTestId(owner, "crm-payroll-note")).toContainText(
      t("vi", "crm:payroll.estimateNote"),
    );
    await expect(byTestId(owner, "crm-payroll-status")).toContainText(
      t("vi", "crm:payroll.monthStatus.open"),
    );
    const api = (await (
      await owner.request.get(`${S}/payroll?month=${month}`)
    ).json()) as PayrollJson;
    for (const id of [seed.staffIds.lan, seed.staffIds.mai]) {
      await expect(byTestId(owner, `crm-payroll-row-${id}`)).toBeVisible();
    }
    await expect(byTestId(owner, "crm-payroll-totals")).toContainText(vnd(api.totals.total));
    await expect(byTestId(owner, "crm-payroll-totals-real")).toHaveText(vnd(api.totals.realCost));
    expect(api.totals.realCost).toBeGreaterThan(api.totals.total);
  });

  await test.step("breakdown: services with dates; adjustment needs a reason; undo a removal", async () => {
    await tap(byTestId(owner, `crm-payroll-row-${seed.staffIds.mai}`));
    await expect(byTestId(owner, "crm-payroll-lines")).toBeVisible();
    await tap(byTestId(owner, "crm-adjust-open"));
    await tap(byTestId(owner, "crm-adjust-add"));
    await expect(owner.getByText(t("vi", "crm:payroll.validation.reasonRequired"))).toBeVisible();
    await byTestId(owner, "crm-adjust-amount").fill("250000");
    await expect(byTestId(owner, "crm-adjust-amount")).toHaveValue("250.000");
    await fillField(byTestId(owner, "crm-adjust-reason"), "Thưởng E2E");
    await tap(byTestId(owner, "crm-adjust-add"));
    await expect(owner.getByText("Thưởng E2E")).toBeVisible();
    await tap(owner.getByRole("button", { name: t("vi", "crm:payroll.adjustments.remove") }));
    await expect(owner.getByText("Thưởng E2E")).toBeHidden();
    await tap(byTestId(owner, "crm-undo-action"));
    await expect(owner.getByText("Thưởng E2E")).toBeVisible();
    await owner.keyboard.press("Escape");
  });

  await test.step("rates: the same default % for several people at once", async () => {
    await owner.goto("/vi/business/payroll?tab=rates");
    await tap(byTestId(owner, "crm-rates-select-all"));
    await fillField(byTestId(owner, "crm-rates-bulk-percent"), "12");
    await tap(byTestId(owner, "crm-rates-bulk-apply"));
    await expect(byTestId(owner, "crm-rates-bulk")).toBeHidden();
    await expect(byTestId(owner, `crm-rates-default-${seed.staffIds.mai}`)).toContainText("12%");
    expect((await current(seed.staffIds.lan)).commissionPercent).toBe(12);
    expect((await current(seed.staffIds.mai)).commissionPercent).toBe(12);
  });

  await test.step("service editor shows and changes the commission of that service", async () => {
    await owner.goto("/vi/business/services");
    await tap(byTestId(owner, `crm-service-${seed.serviceIds.gel}`).getByRole("button").first());
    await expect(byTestId(owner, "crm-service-commission")).toBeVisible();
    await tap(byTestId(owner, `crm-service-commission-edit-${seed.staffIds.mai}`));
    await fillField(
      byTestId(owner, `crm-service-commission-rate-${seed.staffIds.mai}-value`),
      "30",
    );
    await tap(owner.getByRole("button", { name: t("vi", "crm:common.done") }));
    await tap(byTestId(owner, "crm-service-save"));
    await expect(byTestId(owner, "crm-service-save")).toBeHidden();
    const mai = await current(seed.staffIds.mai);
    expect(mai.overrides).toContainEqual(
      expect.objectContaining({ serviceId: seed.serviceIds.gel, percent: 30 }),
    );
  });

  await test.step("phone: the month is cards, not a wide table", async () => {
    await owner.setViewportSize({ width: 390, height: 844 });
    await owner.goto("/vi/business/payroll");
    const row = byTestId(owner, `crm-payroll-row-${seed.staffIds.lan}`);
    await expect(row).toBeVisible();
    const box = need(await row.boundingBox(), "row box");
    expect(box.width).toBeLessThanOrEqual(390);
    await owner.setViewportSize({ width: 1440, height: 900 });
  });

  await test.step("close the month, then reopen it with a reason", async () => {
    await owner.goto("/vi/business/payroll");
    await tap(byTestId(owner, "crm-payroll-close"));
    await tap(byTestId(owner, "crm-payroll-close-confirm-confirm"));
    await expect(byTestId(owner, "crm-payroll-status")).toContainText(
      t("vi", "crm:payroll.monthStatus.closed"),
    );
    await tap(byTestId(owner, "crm-payroll-reopen"));
    await expect(owner.getByText(t("vi", "crm:payroll.reopenBody"))).toBeVisible();
    // The sheet can still be settling (WebKit under load): retry the fill until React keeps it.
    await expect(async () => {
      await fillField(byTestId(owner, "crm-payroll-reopen-reason"), "Sửa thưởng");
    }).toPass({ timeout: 15_000 });
    await tap(byTestId(owner, "crm-payroll-reopen-confirm"));
    await expect(byTestId(owner, "crm-payroll-close")).toBeVisible();
  });

  await test.step("This month: one headline = registry, waterfall, real cost labelled", async () => {
    await owner.goto("/vi/business/insights?tab=month");
    await expect(owner.getByTestId(/^crm-profit-tile-/)).toHaveCount(4);
    const profit = (await (
      await owner.request.get(`${S}/insights/profit?month=${month}`)
    ).json()) as ProfitJson;
    const net = need(profit.metrics["profit.net"]?.value, "profit.net");
    await expect(byTestId(owner, "crm-profit-value-profit.net")).toHaveText(vnd(net));
    for (const id of ["revenue", "serviceCosts", "payroll", "otherCosts"]) {
      await expect(byTestId(owner, `crm-profit-row-${id}`)).toBeVisible();
    }
    const employer = need(profit.metrics["profit.employer_costs"]?.value, "employer costs");
    expect(employer).toBeGreaterThan(0);
    await expect(byTestId(owner, "crm-profit-row-payroll")).toContainText(vnd(employer));
    await expect(byTestId(owner, "crm-profit-costs")).toContainText(vnd(12_000_000));
  });

  await test.step("staff (API, own rate-limit bucket): payroll denied, own lines, no real cost", async () => {
    // One browser sign-in per project keeps the run inside the per-IP magic-link budget (README).
    const staff = await ApiClient.signIn(need(seed.staffEmail, "staff account"), "10.77.200.1");
    await expect(staff.call(`/salons/${seed.salonId}/payroll?month=${month}`)).rejects.toThrow(
      /403/,
    );
    const mine = await staff.call<Record<string, unknown>>(
      `/salons/${seed.salonId}/payroll/me?month=${month}`,
    );
    expect(mine["hasProfile"]).toBe(true);
    expect(JSON.stringify(mine)).not.toMatch(/employer|realCost/i);
    const lines = await staff.call<{ staffId: string }>(
      `/salons/${seed.salonId}/payroll/me/lines?month=${month}`,
    );
    expect(lines.staffId).toBe(seed.staffIds.lan);
  });
});
