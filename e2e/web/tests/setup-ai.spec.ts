import { expect, test } from "@playwright/test";

import { signUpWithCodeViaUi } from "../support/auth";
import { API } from "../support/env";
import { t } from "../support/i18n";
import { mail } from "../support/seed";
import { fillField, tap } from "../support/ui";

for (const locale of ["vi", "en"] as const) {
  test(`services setup: AI retry, unavailable fallback and reviewed import @${locale}`, async ({
    page,
  }, info) => {
    if (locale === "en") await page.setViewportSize({ width: 390, height: 844 });
    let status: "failed" | "unavailable" | "available" = "failed";
    await page.route(/\/api\/v1\/salons\/[^/]+\/ai-import$/, (route) =>
      route.fulfill({
        status: status === "failed" ? 503 : 200,
        json:
          status === "failed"
            ? { code: "common.internal_error" }
            : {
                configured: status === "available",
                entitled: true,
                maxImages: 10,
                usage: { usedVnd: 0, capVnd: 100000 },
              },
      }),
    );
    const draft = {
      items: [
        {
          name: { vi: "Chăm sóc AI", en: "AI care" },
          category: "spa",
          price: 185000,
          priceMax: null,
          durationMinutes: 45,
          variants: [],
          addOns: [],
          sourceImage: 1,
          confidence: "high",
        },
      ],
      images: [{ index: 1, redactedRegions: 0, maskedFaces: 0 }],
      usage: { usedVnd: 0, capVnd: 100000 },
    };
    // Only provider availability/extraction are simulated. Confirm writes real catalog services.
    await page.route(/\/api\/v1\/salons\/[^/]+\/ai-import\/extract$/, (route) =>
      route.fulfill({ json: draft }),
    );
    await signUpWithCodeViaUi(page, mail(`setup-ai-${locale}`, info.project.name), locale);
    await fillField(page.getByTestId("crm-setup-salon-name"), "Mây AI Setup");
    await tap(page.getByTestId("crm-setup-next"));
    await expect(page.getByTestId("crm-setup-title")).toHaveText(
      t(locale, "crm:setupWizard.hours.title"),
    );
    await tap(page.getByTestId("crm-setup-next"));
    await expect(page.getByTestId("crm-setup-title")).toHaveText(
      t(locale, "crm:setupWizard.services.title"),
    );
    await expect(page.getByTestId("crm-setup-ai-retry")).toBeVisible();
    await expect(page.getByTestId("crm-setup-template-add")).toBeVisible();
    status = "unavailable";
    await tap(page.getByTestId("crm-setup-ai-retry"));
    await expect(page.getByTestId("crm-setup-ai-unavailable")).toContainText(
      t(locale, "crm:setupWizard.services.aiUnavailable"),
    );
    await expect(page.getByTestId("crm-setup-ai-upload-disabled")).toBeDisabled();
    await tap(
      page.getByRole("radio", { name: t(locale, "crm:setupWizard.services.tabAi"), exact: true }),
    );
    await expect(page.getByTestId("crm-setup-ai-upload-disabled")).toBeVisible();
    status = "available";
    await page.goto(`/${locale}/business/setup?step=services`);
    await expect(
      page.getByRole("radio", { name: t(locale, "crm:setupWizard.services.tabAi"), exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("ai-import-pick")).toBeVisible();
    const chooser = page.waitForEvent("filechooser");
    await tap(page.getByTestId("ai-import-pick"));
    await (
      await chooser
    ).setFiles({
      name: "price-list.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(page.getByTestId("ai-import-picked")).toBeVisible();
    await tap(page.getByTestId("ai-import-read"));
    await expect(page.getByTestId("ai-import-review")).toBeVisible();
    const confirmed = page.waitForResponse(
      (r) => r.url().endsWith("/ai-import/confirm") && r.request().method() === "POST",
    );
    await tap(page.getByTestId("ai-import-save"));
    expect((await confirmed).status()).toBe(201);
    await expect(page.getByTestId("crm-setup-service-list")).toContainText(
      locale === "vi" ? "Chăm sóc AI" : "AI care",
    );
    const progress = page.waitForRequest(
      (r) =>
        r.url().startsWith(API) &&
        r.url().endsWith("/onboarding/progress") &&
        (r.postDataJSON() as { step?: string }).step === "services",
    );
    await tap(page.getByTestId("crm-setup-next"));
    expect((await progress).postDataJSON()).toMatchObject({
      step: "services",
      event: "completed",
      method: "ai_import",
    });
    await expect(page.getByTestId("crm-setup-title")).toHaveText(
      t(locale, "crm:setupWizard.team.title"),
    );
  });
}
