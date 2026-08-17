import { expect, test, type Page } from "@playwright/test";
import type { LayoutObject, LineObject, ShapeObject } from "../src/core/model";

/**
 * Wired-tool gesture-clause tests (PLAN.md §5): titles are VERBATIM registry
 * clause ids. Konva renders to canvas, so assertions run against store state
 * via the dev handle; the store-notification counter proves the §6.3 rule —
 * gesture state lives outside the store and exactly one action commits per
 * completed gesture.
 *
 * Coordinates are document inches, converted to screen px through the live
 * store's viewport state (the default view shows roughly x −0.4…8.9,
 * y 2.3…8.7 — tests stay inside that band).
 */

type DocPoint = { x: number; y: number };

async function canvasBox(page: Page) {
  const box = await page.getByTestId("canvas-area").boundingBox();
  if (!box) throw new Error("canvas area not visible");
  return box;
}

/** Doc inches → page screen px, mirroring core/geometry/viewport.ts
    pageOriginPx/docToScreen against the live store state (zoom, pan, page
    size) rather than hardcoding a frame. */
async function screenPoint(page: Page, pt: DocPoint): Promise<DocPoint> {
  const box = await canvasBox(page);
  const local = await page.evaluate(
    ({ vpW, vpH, x, y }) => {
      const store = window.__PROTOTYPE_STORE__;
      if (!store) throw new Error("dev store handle missing");
      const state = store.getState();
      const { zoom, pan } = state.viewport;
      const size = state.document.present.size;
      const DPI = 96;
      const originX = vpW / 2 + pan.x - (size.w * DPI * zoom) / 2;
      const originY = vpH / 2 + pan.y - (size.h * DPI * zoom) / 2;
      return { x: originX + x * DPI * zoom, y: originY + y * DPI * zoom };
    },
    { vpW: box.width, vpH: box.height, x: pt.x, y: pt.y },
  );
  return { x: box.x + local.x, y: box.y + local.y };
}

async function activate(page: Page, toolLabel: string): Promise<void> {
  await page.getByTestId("dock").getByRole("button", { name: toolLabel, exact: true }).click();
}

async function drag(
  page: Page,
  from: DocPoint,
  to: DocPoint,
  modifiers: ("Shift" | "Alt")[] = [],
): Promise<void> {
  const a = await screenPoint(page, from);
  const b = await screenPoint(page, to);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  for (const m of modifiers) await page.keyboard.up(m);
}

async function clickAt(
  page: Page,
  pt: DocPoint,
  modifiers: ("Shift" | "Alt")[] = [],
): Promise<void> {
  const p = await screenPoint(page, pt);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.click(p.x, p.y);
  for (const m of modifiers) await page.keyboard.up(m);
}

/** Drag starting from a selection-chrome handle (resize/rotate targets). */
async function dragHandle(
  page: Page,
  handle: string,
  to: DocPoint | { dxPx: number; dyPx: number },
  modifiers: ("Shift" | "Alt")[] = [],
): Promise<void> {
  const box = await page.locator(`[data-handle="${handle}"]`).boundingBox();
  if (!box) throw new Error(`handle ${handle} not visible`);
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const target =
    "dxPx" in to ? { x: from.x + to.dxPx, y: from.y + to.dyPx } : await screenPoint(page, to);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  for (const m of modifiers) await page.keyboard.up(m);
}

/** Store-notification counter (canvas.spec.ts pattern): the in-flight
    preview must live outside the store, so a completed gesture notifies
    subscribers exactly once per dispatched action. */
async function armCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    const counter = { count: 0 };
    store.subscribe(() => {
      counter.count++;
    });
    Object.assign(window, { __STORE_NOTIFICATIONS__: counter });
  });
}

function notificationCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __STORE_NOTIFICATIONS__: { count: number } }).__STORE_NOTIFICATIONS__
        .count,
  );
}

function pageObjects(page: Page): Promise<LayoutObject[]> {
  return page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().document.present.pages[0]?.objects ?? [];
  });
}

function selectionIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().selection.ids;
  });
}

function shapeAt(objects: LayoutObject[], index: number): ShapeObject {
  const obj = objects[index];
  if (!obj || obj.type !== "shape") throw new Error(`expected shape at index ${index}`);
  return obj;
}

function lineAt(objects: LayoutObject[], index: number): LineObject {
  const obj = objects[index];
  if (!obj || obj.type !== "line") throw new Error(`expected line at index ${index}`);
  return obj;
}

/** Dragged bounds land within ±0.01 in of the pointer's doc coordinates. */
function expectNear(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.01);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas-area")).toBeVisible();
});

test("rect.drag.creates", async ({ page }) => {
  await activate(page, "Rectangle");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4.5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const rect = shapeAt(await pageObjects(page), 0);
  expect(rect.shape).toBe("rect");
  expectNear(rect.x, 1);
  expectNear(rect.y, 3);
  expectNear(rect.w, 2);
  expectNear(rect.h, 1.5);
});

test("rect.shift-drag.constrains-square", async ({ page }) => {
  await activate(page, "Rectangle");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4 }, ["Shift"]);
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 1);
  expectNear(rect.y, 3);
  expectNear(rect.w, 2);
  expectNear(rect.h, 2);
});

test("rect.alt-drag.draws-from-center", async ({ page }) => {
  await activate(page, "Rectangle");
  await armCounter(page);
  await drag(page, { x: 3, y: 4 }, { x: 4, y: 4.5 }, ["Alt"]);
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 2);
  expectNear(rect.y, 3.5);
  expectNear(rect.w, 2);
  expectNear(rect.h, 1);
});

test("rect.click.creates-default-size", async ({ page }) => {
  await activate(page, "Rectangle");
  await armCounter(page);
  await clickAt(page, { x: 4, y: 4 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const rect = shapeAt(await pageObjects(page), 0);
  // 1×1 in, centered at the click point (drawBounds machine ASSUMPTION).
  expectNear(rect.x, 3.5);
  expectNear(rect.y, 3.5);
  expectNear(rect.w, 1);
  expectNear(rect.h, 1);
});

test("rect.esc.cancels-draw", async ({ page }) => {
  await activate(page, "Rectangle");
  const before = await page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().document.present;
  });
  const a = await screenPoint(page, { x: 1, y: 3 });
  const b = await screenPoint(page, { x: 3, y: 5 });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await pageObjects(page)).length).toBe(0);
  const after = await page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().document.present;
  });
  expect(after).toEqual(before);
});

test("ellipse.drag.creates", async ({ page }) => {
  await activate(page, "Ellipse");
  await armCounter(page);
  await drag(page, { x: 2, y: 3 }, { x: 4, y: 4 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const ellipse = shapeAt(await pageObjects(page), 0);
  expect(ellipse.shape).toBe("ellipse");
  expectNear(ellipse.x, 2);
  expectNear(ellipse.y, 3);
  expectNear(ellipse.w, 2);
  expectNear(ellipse.h, 1);
});

test("line.drag.creates", async ({ page }) => {
  await activate(page, "Line");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 4, y: 5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const line = lineAt(await pageObjects(page), 0);
  expectNear(line.x1, 1);
  expectNear(line.y1, 3);
  expectNear(line.x2, 4);
  expectNear(line.y2, 5);
});

test("line.shift-drag.constrains-angle", async ({ page }) => {
  await activate(page, "Line");
  // Near-horizontal drag snaps to 0°: length is the drag projected onto
  // the snapped direction.
  await drag(page, { x: 1, y: 3 }, { x: 3.9, y: 3.2 }, ["Shift"]);
  // Near-diagonal drag snaps to 45°.
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 5.2 }, ["Shift"]);
  await expect.poll(async () => (await pageObjects(page)).length).toBe(2);
  const objects = await pageObjects(page);
  const horizontal = lineAt(objects, 0);
  expectNear(horizontal.x1, 1);
  expectNear(horizontal.y1, 3);
  expectNear(horizontal.x2, 3.9);
  expectNear(horizontal.y2, 3);
  const diagonal = lineAt(objects, 1);
  expectNear(diagonal.x2, 3.1);
  expectNear(diagonal.y2, 5.1);
});

test("select.click.selects-topmost", async ({ page }) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 5 });
  await drag(page, { x: 2, y: 4 }, { x: 4, y: 6 });
  const [below, above] = await pageObjects(page);
  if (!below || !above) throw new Error("expected two drawn rects");
  await activate(page, "Select");
  await clickAt(page, { x: 2.5, y: 4.5 });
  expect(await selectionIds(page)).toEqual([above.id]);
});

test("select.click-empty.clears", async ({ page }) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 1, y: 3 }, { x: 2, y: 4 });
  await activate(page, "Select");
  await clickAt(page, { x: 1.5, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  await clickAt(page, { x: 6, y: 6 });
  await expect.poll(() => selectionIds(page)).toEqual([]);
});

test("select.shift-click.toggles-membership", async ({ page }) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 1, y: 3 }, { x: 2, y: 4 });
  await drag(page, { x: 3, y: 3 }, { x: 4, y: 4 });
  const [first, second] = await pageObjects(page);
  if (!first || !second) throw new Error("expected two drawn rects");
  await activate(page, "Select");
  await clickAt(page, { x: 1.5, y: 3.5 });
  expect(await selectionIds(page)).toEqual([first.id]);
  // Shift-click adds…
  await clickAt(page, { x: 3.5, y: 3.5 }, ["Shift"]);
  expect(await selectionIds(page)).toEqual([first.id, second.id]);
  // …and removes when already selected.
  await clickAt(page, { x: 3.5, y: 3.5 }, ["Shift"]);
  expect(await selectionIds(page)).toEqual([first.id]);
});

test("select.alt-click.selects-beneath", async ({ page }) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 5 });
  await drag(page, { x: 2, y: 4 }, { x: 4, y: 6 });
  const [below, above] = await pageObjects(page);
  if (!below || !above) throw new Error("expected two drawn rects");
  await activate(page, "Select");
  const overlap: DocPoint = { x: 2.5, y: 4.5 };
  await clickAt(page, overlap);
  expect(await selectionIds(page)).toEqual([above.id]);
  // Alt-click cycles beneath the current single selection in the hit stack…
  await clickAt(page, overlap, ["Alt"]);
  expect(await selectionIds(page)).toEqual([below.id]);
  // …and wraps back to the top.
  await clickAt(page, overlap, ["Alt"]);
  expect(await selectionIds(page)).toEqual([above.id]);
});

test("select.drag-empty.marquee-selects", async ({ page }) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 1, y: 4 }, { x: 2, y: 5 });
  await drag(page, { x: 3, y: 4 }, { x: 4, y: 5 });
  const [first, second] = await pageObjects(page);
  if (!first || !second) throw new Error("expected two drawn rects");
  await activate(page, "Select");
  await armCounter(page);
  // From empty pasteboard-ish space, intersecting one rect fully and one
  // partially: intersection selects, containment is not required.
  await drag(page, { x: 0.7, y: 3.5 }, { x: 3.4, y: 5.4 });
  expect(await notificationCount(page)).toBe(1);
  expect((await selectionIds(page)).sort()).toEqual([first.id, second.id].sort());
});

test("select.drag.moves-selection", async ({ page }) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 1, y: 3 }, { x: 2, y: 4 });
  await activate(page, "Select");
  // ASSUMPTION under test (matches the shell's early-commit decision of
  // record): dragging an UNSELECTED object commits selection/replace on
  // pointerdown and object/move on release — exactly 2 notifications.
  await armCounter(page);
  await drag(page, { x: 1.5, y: 3.5 }, { x: 3.5, y: 5.5 });
  expect(await notificationCount(page)).toBe(2);
  let rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 3);
  expectNear(rect.y, 5);
  expect(await selectionIds(page)).toEqual([rect.id]);
  // A drag on the already-selected object is the move gesture alone —
  // exactly 1 notification.
  await armCounter(page);
  await drag(page, { x: 3.5, y: 5.5 }, { x: 2.5, y: 4.5 });
  expect(await notificationCount(page)).toBe(1);
  rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 2);
  expectNear(rect.y, 4);
});

test("select.drag-handle.resizes", async ({ page }) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4 });
  await activate(page, "Select");
  await clickAt(page, { x: 2, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  // Dragging the se handle scales from the nw anchor.
  await armCounter(page);
  await dragHandle(page, "se", { x: 4, y: 5 });
  expect(await notificationCount(page)).toBe(1);
  let rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 1);
  expectNear(rect.y, 3);
  expectNear(rect.w, 3);
  expectNear(rect.h, 2);
  // Shift preserves the aspect ratio (3:2 here).
  await armCounter(page);
  await dragHandle(page, "se", { x: 5, y: 4.8 }, ["Shift"]);
  expect(await notificationCount(page)).toBe(1);
  rect = shapeAt(await pageObjects(page), 0);
  expect(Math.abs(rect.w / rect.h - 3 / 2)).toBeLessThanOrEqual(0.01);
  expect(rect.w).toBeGreaterThan(3.5);
});

test("select.drag-rotate.rotates", async ({ page }) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 2, y: 4 }, { x: 3, y: 5 });
  await activate(page, "Select");
  await clickAt(page, { x: 2.5, y: 4.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  // The rotate handle sits above the AABB top-center; dragging it to the
  // pivot's east side turns the initial −90° pointer angle into +90°.
  await armCounter(page);
  await dragHandle(page, "rotate", { x: 3.2, y: 4.5 });
  expect(await notificationCount(page)).toBe(1);
  let rect = shapeAt(await pageObjects(page), 0);
  expect(Math.abs(rect.rotation - 90)).toBeLessThanOrEqual(1);
  // Shift snaps the resulting rotation to 15° increments.
  await armCounter(page);
  await dragHandle(page, "rotate", { dxPx: 60, dyPx: 30 }, ["Shift"]);
  expect(await notificationCount(page)).toBe(1);
  rect = shapeAt(await pageObjects(page), 0);
  expect(rect.rotation).not.toBeCloseTo(90, 5);
  expect(Math.round(rect.rotation / 15) * 15).toBeCloseTo(rect.rotation, 9);
});

test("select.arrow.nudges", async ({ page }) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 1, y: 3 }, { x: 2, y: 4 });
  await activate(page, "Select");
  await clickAt(page, { x: 1.5, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  // Default increment from the contract: 0.1 in. One dispatch per keydown.
  await armCounter(page);
  await page.keyboard.press("ArrowRight");
  expect(await notificationCount(page)).toBe(1);
  let rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 1.1);
  expectNear(rect.y, 3);
  // Changing the live option in the options bar changes the increment.
  await page.getByTestId("options-bar").getByLabel("Nudge", { exact: true }).fill("0.25");
  await clickAt(page, { x: 1.6, y: 3.5 });
  await page.keyboard.press("ArrowDown");
  rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 1.1);
  expectNear(rect.y, 3.25);
});

test("draw, move, then undo twice returns to the empty page — one history entry per gesture", async ({
  page,
}) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 1, y: 3 }, { x: 2, y: 4 });
  await activate(page, "Select");
  await drag(page, { x: 1.5, y: 3.5 }, { x: 3.5, y: 5.5 });
  // Exactly 2 history entries: the draw and the move. The selection commit
  // is app state and never enters document history.
  const pastDepth = await page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().document.past.length;
  });
  expect(pastDepth).toBe(2);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await undo.click();
  const rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 1);
  expectNear(rect.y, 3);
  await undo.click();
  expect((await pageObjects(page)).length).toBe(0);
  await expect(undo).toBeDisabled();
});
