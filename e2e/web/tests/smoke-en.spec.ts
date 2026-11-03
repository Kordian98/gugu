// English smoke (the vi flows cover behaviour; this proves the en locale end to end): sign in on
// /en, the business panel renders English copy (no Vietnamese, no raw keys), the calendar shows the
// seeded bookings with English service names.
import { t } from "../support/i18n";
import { expect, test } from "../support/fixtures";
import { SEED } from "../support/seed";
import { hydrated, tap } from "../support/ui";

const E = "en" as const;
test.use({ area: "en" });

test.describe("smoke @en", () => {
  test("sign in and use the panel in English", async ({ seed, signedIn }) => {
    const page = await signedIn(seed.ownerEmail, { locale: "en", next: "/en/business" });
    await expect(page).toHaveURL(/\/en\/business/);
    await hydrated(page.getByTestId("crm-nav-calendar"));
    await expect(page.getByTestId("crm-nav-calendar")).toContainText(
      t(E, "crm:nav.items.calendar"),
    );
    await expect(page.getByTestId("crm-new-appointment")).toContainText(
      t(E, "crm:shell.newAppointment"),
    );
    await expect(page.getByText(t("vi", "crm:nav.items.calendar"), { exact: true })).toHaveCount(0);
    // Raw i18n keys look like `crm.something` / `nav.items.x`; none may render.
    expect(await page.locator("body").innerText()).not.toMatch(
      /\b(?:crm|nav|shell|calendar)\.[a-z]+\.[a-zA-Z]+/,
    );

    await tap(page.getByTestId("crm-nav-calendar"));
    await expect(page).toHaveURL(/\/en\/business\/calendar/);
    const lan = SEED.bookings.lanToday;
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^${lan.time} AM ${SEED.services.gel.en}, ${lan.name},`),
      }),
    ).toBeVisible();
  });
});
