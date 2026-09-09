import { expect, test, type Page } from "@playwright/test";
import { contentPixelAt, draw, drag, pageObjects, shapeAt, centerOf } from "./helpers";

/**
 * Pasteboard-ghosting pixel probe (decision of record in SEAMS.md,
 * 2026-09-08). Konva renders to canvas, so this spec is the one place that
 * reads PIXELS — the render-level smoke probe PLAN.md §5 anticipates. It asserts on
 * ALPHA rather than colour: the content layer's canvas is transparent where
 * nothing is drawn, an on-page pixel reads a === 255, and a ghosted pixel
 * reads a ≈ 128 (PASTEBOARD_GHOST_OPACITY), independent of the pasteboard's
 * CSS colour and the rectangle tool's default fill.
 *
 * Every test runs at 50% zoom: at the 100% boot zoom the canvas area shows
 * only 0.26 in of pasteboard beside the page and nothing above y ≈ 2.4 in, so
 * none of §4's coordinates would be on screen. At 50% the visible document
 * runs from about x = −4.7 to 13.2 and y = −0.8 to 11.8, which reaches every
 * coordinate below.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas-area")).toBeVisible();
  const zoomField = page.getByLabel("Zoom percent");
  await zoomField.fill("50");
  await zoomField.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const store = window.__PROTOTYPE_STORE__;
        if (!store) throw new Error("dev store handle missing");
        return store.getState().viewport.zoom;
      }),
    )
    .toBe(0.5);
});

test("on-page ink is full strength", async ({ page }) => {
  await draw(page, "Rectangle", { x: 1, y: 1 }, { x: 3, y: 3 });
  expect((await contentPixelAt(page, { x: 2, y: 2 })).a).toBe(255);
});

test("pasteboard ink ghosts", async ({ page }) => {
  await draw(page, "Rectangle", { x: -2, y: 1 }, { x: -0.5, y: 3 });
  const { a } = await contentPixelAt(page, { x: -1.25, y: 2 });
  expect(Math.abs(a - 128)).toBeLessThanOrEqual(3);
});

test("a straddling object ghosts only its off-page part", async ({ page }) => {
  await draw(page, "Rectangle", { x: -1, y: 1 }, { x: 1, y: 3 });
  expect((await contentPixelAt(page, { x: 0.5, y: 2 })).a).toBe(255);
  const { a } = await contentPixelAt(page, { x: -0.5, y: 2 });
  expect(Math.abs(a - 128)).toBeLessThanOrEqual(3);
});

test("moving an object onto the pasteboard ghosts it on commit", async ({ page }) => {
  await draw(page, "Rectangle", { x: 1, y: 1 }, { x: 2, y: 2 });
  await drag(page, { x: 1.5, y: 1.5 }, { x: -1.5, y: 2 });
  const moved = shapeAt(await pageObjects(page), 0);
  const { a: movedAlpha } = await contentPixelAt(page, centerOf(moved));
  expect(Math.abs(movedAlpha - 128)).toBeLessThanOrEqual(3);
  expect((await contentPixelAt(page, { x: 1.5, y: 1.5 })).a).toBe(0);
});

test("the selection chrome is not ghosted", async ({ page }) => {
  await draw(page, "Rectangle", { x: -2, y: 1 }, { x: -0.5, y: 3 });
  await expect(page.locator("[data-handle]").first()).toBeVisible();
});

/**
 * The debug bar's off-page ghost slider drives that opacity live, so an SME
 * can judge the 50% ASSUMPTION against real content (PLAN.md §0.1). Same
 * alpha probe: 0.25 reads a ≈ 64, and the on-page half of a straddler must
 * not move off 255 at any setting — the slider dims ink outside the page and
 * nothing else.
 */

/** Sets the slider and waits for its percent readout to agree. */
async function setGhostOpacity(page: Page, opacity: number) {
  await page.getByLabel("Off-page ghost opacity").fill(String(opacity));
  await expect(page.getByTestId("ghost-opacity")).toHaveText(`${Math.round(opacity * 100)}%`);
}

test("the ghost slider boots at the 50% assumption", async ({ page }) => {
  await expect(page.getByTestId("ghost-opacity")).toHaveText("50%");
});

test("lowering the slider dims pasteboard ink further", async ({ page }) => {
  await draw(page, "Rectangle", { x: -2, y: 1 }, { x: -0.5, y: 3 });
  await setGhostOpacity(page, 0.25);
  const { a } = await contentPixelAt(page, { x: -1.25, y: 2 });
  expect(Math.abs(a - 64)).toBeLessThanOrEqual(3);
});

test("raising the slider to 100% leaves pasteboard ink undimmed", async ({ page }) => {
  await draw(page, "Rectangle", { x: -2, y: 1 }, { x: -0.5, y: 3 });
  await setGhostOpacity(page, 1);
  expect((await contentPixelAt(page, { x: -1.25, y: 2 })).a).toBe(255);
});

test("dropping the slider to 0% hides pasteboard ink", async ({ page }) => {
  await draw(page, "Rectangle", { x: -2, y: 1 }, { x: -0.5, y: 3 });
  await setGhostOpacity(page, 0);
  expect((await contentPixelAt(page, { x: -1.25, y: 2 })).a).toBe(0);
});

test("the slider moves only the off-page half of a straddling object", async ({ page }) => {
  await draw(page, "Rectangle", { x: -1, y: 1 }, { x: 1, y: 3 });
  await setGhostOpacity(page, 0.25);
  expect((await contentPixelAt(page, { x: 0.5, y: 2 })).a).toBe(255);
  const { a } = await contentPixelAt(page, { x: -0.5, y: 2 });
  expect(Math.abs(a - 64)).toBeLessThanOrEqual(3);
});
