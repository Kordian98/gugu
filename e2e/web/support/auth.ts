// Sign-in through the real UI: email on /{locale}/sign-in → magic link from Mailpit → open it.
import { expect, test, type Page, type Route } from "@playwright/test";
import { t, type Locale } from "./i18n";
import { latestMagicLink, searchMail } from "./mailpit";
import { fillField, tap } from "./ui";

// The magic-link issue and verify endpoints allow 30 requests per IP /24 per 15 min. Every browser
// connects from 127.0.0.1, so chromium + webkit together outgrow one bucket (32 sign-ins once
// plan.spec and payroll.spec landed). Like the seed (10.77.<n>.1, support/seed.ts), each UI sign-in
// sends its own X-Forwarded-For /24, trusted because the E2E backend runs with TRUST_PROXY=loopback.
// Only these two auth requests are rewritten; the rest of the session keeps 127.0.0.1.
const AUTH_LIMITED = /\/api\/v1\/auth\/magic-link(\/verify)?(\?|$)/;
let signInCounter = 0;
function nextSignInIp(): string {
  const worker = test.info().workerIndex % 150;
  return `10.${String(100 + worker)}.${String(++signInCounter % 256)}.1`;
}

export async function signInViaUi(
  page: Page,
  email: string,
  locale: Locale = "vi",
  next?: string,
): Promise<void> {
  const ip = nextSignInIp();
  const withIp = (route: Route) =>
    route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": ip } });
  await page.route(AUTH_LIMITED, withIp);
  const before = (await searchMail(`to:"${email}"`)).length;
  await page.goto(`/${locale}/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await fillField(page.getByLabel(t(locale, "auth:signIn.emailLabel"), { exact: true }), email);
  await tap(page.getByRole("button", { name: t(locale, "auth:signIn.submit") }));
  await expect(
    page.getByText(t(locale, "auth:checkInbox.title")),
    `sign-in ${email} (XFF ${ip}): "check inbox" screen not shown — a rate-limit notice here means an auth bucket overflowed`,
  ).toBeVisible();
  const link = await latestMagicLink(email, before);
  await page.goto(link);
  await expect(page).not.toHaveURL(/\/auth\/verify/, { timeout: 30_000 });
  await page.unroute(AUTH_LIMITED, withIp);
}
