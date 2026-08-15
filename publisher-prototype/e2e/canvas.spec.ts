import { expect, test, type Page } from "@playwright/test";

/**
 * Gesture-clause tests (PLAN.md §5 testing note): Konva renders to canvas,
 * so Playwright asserts on STORE STATE after dispatch, not on the DOM. Test
 * titles are keyed to registry clause ids.
 */

type ViewportState = { zoom: number; pan: { x: number; y: number } };

function viewportState(page: Page): Promise<ViewportState> {
  return page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().viewport;
  });
}

async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("canvas-area").boundingBox();
  if (!box) throw new Error("canvas area not visible");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas-area")).toBeVisible();
});

test("boots with the stage, overlay, rulers, and a 100% viewport", async ({ page }) => {
  await expect(page.locator(".canvas-area canvas").first()).toBeVisible();
  await expect(page.getByTestId("svg-overlay")).toBeAttached();
  await expect(page.getByLabel("Zoom percent")).toHaveValue("100%");
  const vp = await viewportState(page);
  expect(vp.zoom).toBe(1);
  expect(vp.pan).toEqual({ x: 0, y: 0 });
});

test("zoom.wheel.ctrl-zooms-at-cursor", async ({ page }) => {
  const center = await canvasCenter(page);
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  // One 100px wheel notch at ×1.1 per 77px of travel.
  await expect.poll(async () => (await viewportState(page)).zoom).toBeCloseTo(1.1 ** (100 / 77), 5);
});

test("zoom.click.steps-in", async ({ page }) => {
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  const center = await canvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await expect.poll(async () => (await viewportState(page)).zoom).toBe(1.25);
});

test("zoom.alt-click.steps-out", async ({ page }) => {
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  const center = await canvasCenter(page);
  await page.keyboard.down("Alt");
  await page.mouse.click(center.x, center.y);
  await page.keyboard.up("Alt");
  await expect.poll(async () => (await viewportState(page)).zoom).toBe(0.75);
});

test("pan.drag.moves-viewport commits exactly one action on pointer-up", async ({ page }) => {
  // Count store notifications during the gesture: the in-flight preview must
  // live outside the store (PLAN.md §6.3), so the count on release is 1.
  await page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    const counter = { count: 0 };
    store.subscribe(() => {
      counter.count++;
    });
    Object.assign(window, { __STORE_NOTIFICATIONS__: counter });
  });
  const center = await canvasCenter(page);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 120, center.y + 40, { steps: 8 });
  await page.mouse.up();

  const notifications = await page.evaluate(
    () => (window as unknown as { __STORE_NOTIFICATIONS__: { count: number } }).__STORE_NOTIFICATIONS__.count,
  );
  expect(notifications).toBe(1);
  const vp = await viewportState(page);
  expect(vp.pan).toEqual({ x: 120, y: 40 });
});

test("fit control centers the page within the working range", async ({ page }) => {
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  const vp = await viewportState(page);
  expect(vp.pan).toEqual({ x: 0, y: 0 });
  expect(vp.zoom).toBeGreaterThanOrEqual(0.1);
  expect(vp.zoom).toBeLessThanOrEqual(4);
  const box = await page.getByTestId("canvas-area").boundingBox();
  if (!box) throw new Error("canvas area not visible");
  // 8.5×11 + bleed at 96 DPI fits within the ~85% fraction of the viewport.
  expect((8.5 + 0.25) * 96 * vp.zoom).toBeLessThanOrEqual(box.width);
  expect((11 + 0.25) * 96 * vp.zoom).toBeLessThanOrEqual(box.height);
});

test("stress fixture loads deterministically and clears", async ({ page }) => {
  await page.getByRole("button", { name: "Load stress fixture" }).click();
  await expect.poll(() =>
    page.evaluate(() => {
      const store = window.__PROTOTYPE_STORE__;
      if (!store) throw new Error("dev store handle missing");
      return store.getState().document.pages[0]?.objects.length ?? 0;
    }),
  ).toBe(300);
  await expect(page.getByTestId("fps")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /Clear stress fixture/ }).click();
  await expect.poll(() =>
    page.evaluate(() => {
      const store = window.__PROTOTYPE_STORE__;
      if (!store) throw new Error("dev store handle missing");
      return store.getState().document.pages[0]?.objects.length ?? 0;
    }),
  ).toBe(0);
});
