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

/**
 * Drags a calendar block vertically by `dy` px with the mouse, closing the loop on the live drag
 * preview (the block is translated while dragging): engines differ in how many pointer pixels the
 * responder swallows before the drag starts, so we steer until the preview sits on the target.
 */
export async function dragVertically(page: Page, block: Locator, dy: number): Promise<void> {
  const start = await block.boundingBox();
  if (!start) throw new Error(`no bounding box for ${block.toString()}`);
  const targetY = start.y + dy;
  const x = start.x + start.width / 2;
  let y = start.y + Math.min(12, start.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  y += 20;
  await page.mouse.move(x, y, { steps: 5 });
  y += dy - 20;
  await page.mouse.move(x, y, { steps: 12 });
  for (let i = 0; i < 6; i++) {
    const now = await block.boundingBox();
    if (!now) break;
    const err = targetY - now.y;
    if (Math.abs(err) < 3) break;
    y += err;
    await page.mouse.move(x, y, { steps: 4 });
  }
  await page.mouse.up();
}
