import { expect, test } from "../support/fixtures";
import { t } from "../support/i18n";
import { tap } from "../support/ui";

for (const locale of ["vi", "en"] as const) {
  test.describe(`CRM sign out @${locale}`, () => {
    const mobile = locale === "vi";
    test.use({ area: mobile ? "mobile" : "en" });

    test("keeps a failed sign-out retryable, then revokes the session", async ({
      seed,
      signedIn,
    }) => {
      const page = await signedIn(seed.ownerEmail, { locale, mobile });
      if (mobile) {
        await tap(page.getByRole("tab", { name: t(locale, "crm:nav.more"), exact: true }));
      }
      const signOut = page.getByTestId("crm-sign-out");
      await expect(signOut).toBeVisible();
      const endpoint = "**/api/v1/auth/sign-out";
      await page.route(endpoint, (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
      );
      await tap(signOut);
      await expect(page.getByText(t(locale, "crm:shell.signOutFailed"))).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/${locale}/business`));
      await page.unroute(endpoint);

      const response = page.waitForResponse(
        (res) => res.url().endsWith("/auth/sign-out") && res.status() === 204,
      );
      await tap(signOut);
      await response;
      await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in`));
      await page.reload();
      await expect(page.getByText(t(locale, "auth:signIn.title"), { exact: true })).toBeVisible();
      await expect(page.getByTestId("crm-sign-out")).toHaveCount(0);
      await page.goto(`/${locale}/business/calendar`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in`));
    });
  });
}
