import { expect, test } from "@playwright/test";
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
