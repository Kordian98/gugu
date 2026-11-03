// Sign-in through the real UI: email on /{locale}/sign-in → magic link from Mailpit → open it.
import { expect, type Page } from "@playwright/test";
import { t, type Locale } from "./i18n";
import { latestMagicLink, searchMail } from "./mailpit";
import { fillField, tap } from "./ui";

export async function signInViaUi(
  page: Page,
  email: string,
  locale: Locale = "vi",
  next?: string,
): Promise<void> {
  const before = (await searchMail(`to:"${email}"`)).length;
  await page.goto(`/${locale}/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await fillField(page.getByLabel(t(locale, "auth:signIn.emailLabel"), { exact: true }), email);
  await tap(page.getByRole("button", { name: t(locale, "auth:signIn.submit") }));
  await expect(page.getByText(t(locale, "auth:checkInbox.title"))).toBeVisible();
  const link = await latestMagicLink(email, before);
  await page.goto(link);
  await expect(page).not.toHaveURL(/\/auth\/verify/, { timeout: 30_000 });
}
