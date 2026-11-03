// UI helpers shared by the specs.
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Expo web server-renders each route, so the first paint is static HTML: typing or clicking before
 * React hydrates that node is silently lost. React stamps `__reactProps$…` on a DOM node once it
 * owns it, so wait for that on the element we are about to use (no sleeps, no product hooks).
 */
export async function hydrated(locator: Locator): Promise<Locator> {
  await expect(locator.first()).toBeVisible();
  await expect
    .poll(
      () =>
        locator
          .first()
          .evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps$"))),
      {
        message: `element never hydrated: ${locator.toString()}`,
      },
    )
    .toBe(true);
  return locator;
}

export const byTestId = (page: Page | Locator, id: string): Locator => page.getByTestId(id);

/** Fill a hydrated input and confirm React kept the value (controlled inputs can reset). */
export async function fillField(locator: Locator, value: string): Promise<void> {
  await hydrated(locator);
  await locator.fill(value);
  await expect(locator).toHaveValue(value);
}

/** Click once the element is hydrated (so the handler is attached). */
export async function tap(locator: Locator): Promise<void> {
  await hydrated(locator);
  await locator.click();
}
