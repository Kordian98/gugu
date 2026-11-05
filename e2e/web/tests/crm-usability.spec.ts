import { API } from "../support/env";
import { expect, test } from "../support/fixtures";
import { t } from "../support/i18n";
import { fillField, tap } from "../support/ui";

test.use({ area: "usability" });

test("client search, full directory, safe edits and failed-read recovery in vi/en", async ({
  seed,
  signedIn,
}) => {
  const page = await signedIn(seed.ownerEmail);
  const endpoint = `${API}/salons/${seed.salonId}/customers`;
  const me = (await (await page.request.get(`${API}/me`)).json()) as { csrfToken: string };
  for (let i = 0; i < 51; i++) {
    const response = await page.request.post(endpoint, {
      headers: { "x-csrf-token": me.csrfToken },
      data: { displayName: `Audit client ${String(i)}`, phone: null },
    });
    expect(response.ok()).toBe(true);
  }
  for (const locale of ["vi", "en"] as const) {
    await page.goto(`/${locale}/business/customers`);
    await expect(
      page.getByText(t(locale, "crm:customers.loadedCount", { shown: 50, total: 53 })),
    ).toBeVisible();
    await tap(page.getByTestId("crm-customers-more"));
    await expect(
      page.getByText(t(locale, "crm:customers.loadedCount", { shown: 53, total: 53 })),
    ).toBeVisible();
    await expect(page.getByTestId("crm-customers-more")).toHaveCount(0);

    await fillField(page.getByTestId("crm-search"), "000222");
    await page.getByTestId("crm-search").press("Enter");
    await expect(page.getByTestId("crm-customers-search")).toHaveValue("000222");
    await expect(
      page.getByText(t(locale, "crm:customers.loadedCount", { shown: 1, total: 1 })),
    ).toBeVisible();
    await fillField(page.getByTestId("crm-customers-search"), "no-such-client");
    await expect(page.getByText(t(locale, "crm:customers.noResultsTitle"))).toBeVisible();
    await tap(
      page.getByRole("button", { name: t(locale, "crm:customers.clearFilters"), exact: true }),
    );
    await expect(page.getByTestId("crm-customers-search")).toHaveValue("");

    await fillField(page.getByTestId("crm-customers-search"), "000222");
    const row = page.locator('[data-testid^="crm-customer-"]').filter({ hasText: "+84987000222" });
    await tap(row);
    await fillField(page.getByTestId("crm-customer-edit-name"), `Trần Bảo Vy ${locale}`);
    await tap(page.getByTestId("crm-customer-name-save"));
    await expect(page.getByTestId("crm-customer-name-save")).toHaveCount(0);
    await fillField(page.getByTestId("crm-customer-note"), `Internal note ${locale}`);
    await tap(page.getByTestId("crm-customer-note-save"));
    await expect(page.getByText(`Internal note ${locale}`, { exact: true })).toBeVisible();
    await tap(page.getByRole("button", { name: t(locale, "crm:common.delete"), exact: true }));
    await expect(page.getByText(t(locale, "crm:customers.deleteNoteTitle"))).toBeVisible();
    await tap(page.getByRole("button", { name: t(locale, "crm:common.cancel"), exact: true }));
    await expect(page.getByText(`Internal note ${locale}`, { exact: true })).toBeVisible();
    await tap(page.getByRole("button", { name: t(locale, "crm:common.delete"), exact: true }));
    await tap(page.getByTestId("crm-customer-note-delete-confirm"));
    await expect(page.getByText(`Internal note ${locale}`, { exact: true })).toHaveCount(0);
    await tap(
      page.getByRole("button", { name: t(locale, "crm:common.close"), exact: true }).last(),
    );

    await tap(page.getByTestId("crm-customer-add"));
    await expect(page.getByTestId("crm-customer-save")).toBeDisabled();
    await fillField(page.getByTestId("crm-customer-name"), "   ");
    await expect(page.getByTestId("crm-customer-save")).toBeDisabled();
    await tap(page.getByRole("button", { name: t(locale, "crm:common.cancel"), exact: true }));

    await page.route(`${endpoint}?*`, (route) =>
      route.fulfill({ status: 503, json: { code: "common.internal_error" } }),
    );
    await page.reload();
    const error = page.getByTestId("crm-query-error");
    await expect(error).toBeVisible();
    await expect(page.getByTestId("crm-customers-empty")).toHaveCount(0);
    await page.unroute(`${endpoint}?*`);
    await tap(error.getByRole("button", { name: t(locale, "crm:common.retry") }));
    await expect(error).toHaveCount(0);
    await expect(page.getByTestId("crm-customers-search")).toBeVisible();
  }
});
