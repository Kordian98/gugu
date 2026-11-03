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

/** Waits until an element's box stops moving (layout settled, e.g. after auto-scroll). */
async function settledBox(locator: Locator) {
  let last = "";
  await expect
    .poll(
      async () => {
        const b = await locator.boundingBox();
        const key = b ? `${String(Math.round(b.x))},${String(Math.round(b.y))}` : "none";
        const same = key === last && key !== "none";
        last = key;
        return same;
      },
      { message: `layout never settled for ${locator.toString()}`, intervals: [100, 100, 200] },
    )
    .toBe(true);
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no bounding box for ${locator.toString()}`);
  return box;
}

/**
 * Drags a calendar block vertically by `dy` px with the mouse, closing the loop on the live drag
 * preview (the block is translated while dragging): engines differ in how many pointer pixels the
 * responder swallows before the drag starts, so we steer until the preview sits on the target.
 * If the preview never moves (the press missed the block, e.g. the grid scrolled), the gesture is
 * released and retried from a freshly measured box.
 */
export async function dragVertically(page: Page, block: Locator, dy: number): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await block.scrollIntoViewIfNeeded();
    const start = await settledBox(block);
    const targetY = start.y + dy;
    const x = start.x + start.width / 2;
    let y = start.y + Math.min(12, start.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    y += 20;
    await page.mouse.move(x, y, { steps: 5 });
    y += dy - 20;
    await page.mouse.move(x, y, { steps: 12 });
    let moved = false;
    for (let i = 0; i < 6; i++) {
      const now = await block.boundingBox();
      if (!now) break;
      if (Math.abs(now.y - start.y) > 5) moved = true;
      const err = targetY - now.y;
      if (Math.abs(err) < 3) break;
      y += err;
      await page.mouse.move(x, y, { steps: 4 });
    }
    if (moved) {
      await page.mouse.up();
      return;
    }
    // Missed: put the pointer back where it started before releasing so nothing is dropped.
    await page.mouse.move(x, start.y + Math.min(12, start.height / 2), { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press("Escape");
  }
  throw new Error(`drag preview never moved for ${block.toString()} after 3 attempts`);
}
