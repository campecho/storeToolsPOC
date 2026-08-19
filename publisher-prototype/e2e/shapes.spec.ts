import { expect, test } from "@playwright/test";
import { shapeOutline } from "../src/core/geometry/shapePaths";
import type { LayoutObject, PathSeg, ShapeObject } from "../src/core/model";
import {
  activate,
  armCounter,
  clickAt,
  drag,
  dragHandle,
  draw,
  expectNear,
  notificationCount,
  pageObjects,
  screenPoint,
  selectionIds,
  shapeAt,
} from "./helpers";

/**
 * Shape-tool gesture-clause tests (PLAN.md §5): titles are VERBATIM registry
 * clause ids. Konva renders to canvas, so assertions run against store state
 * via the dev handle; the store-notification counter proves the §6.3 rule —
 * gesture state lives outside the store and exactly one action commits per
 * completed gesture.
 *
 * Coordinates are document inches, converted to screen px through the live
 * store's viewport state (the default view shows roughly x −0.4…8.9,
 * y 2.3…8.7 — tests stay inside that band). Every tool here commits a
 * ShapeObject with shape "path"; its `d` segments are normalized 0–1 in the
 * frame box, so vertex assertions are resolution-independent.
 */

/** On-curve points of M/L segments only (C control points and Z skipped). */
function vertices(d: PathSeg[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const seg of d) {
    if (seg.c === "M" || seg.c === "L") pts.push({ x: seg.x, y: seg.y });
  }
  return pts;
}

/** True when some vertex lies within 1e-6 of (x, y) in normalized units. */
function hasVertex(d: PathSeg[], x: number, y: number): boolean {
  return vertices(d).some((v) => Math.abs(v.x - x) <= 1e-6 && Math.abs(v.y - y) <= 1e-6);
}

/** shapeAt plus the OUTLINE it resolves to. A parametric kind stores its
    parameters rather than a path, so geometry assertions read the curve the
    shape actually draws — through the same resolver the renderer uses. */
function outlineAt(
  objects: LayoutObject[],
  index: number,
): { shape: ShapeObject; d: PathSeg[] } {
  const shape = shapeAt(objects, index);
  const d = shapeOutline(shape, shape.w, shape.h);
  if (d.length === 0) throw new Error(`expected a non-empty outline at index ${index}`);
  expect(d[0]?.c).toBe("M");
  expect(d[d.length - 1]?.c).toBe("Z");
  return { shape, d };
}

/** shapeAt narrowed to a rounded rect: the one shape kind that stores its
    geometry parametrically, so it carries a radius and no `d`. */
function roundedRectAt(objects: LayoutObject[], index: number): ShapeObject {
  const shape = shapeAt(objects, index);
  expect(shape.shape).toBe("roundedRect");
  expect(shape.d).toBeUndefined();
  expect(typeof shape.cornerRadius).toBe("number");
  return shape;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas-area")).toBeVisible();
});

test("rounded-rect.drag.creates", async ({ page }) => {
  await activate(page, "Rounded rectangle");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4.5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const shape = roundedRectAt(await pageObjects(page), 0);
  expectNear(shape.x, 1);
  expectNear(shape.y, 3);
  expectNear(shape.w, 2);
  expectNear(shape.h, 1.5);
  // The tool's default radius stores AS a radius, in inches — not baked into
  // a path, so it survives every later resize as a radius.
  expectNear(shape.cornerRadius ?? 0, 0.1);
});

test("rounded-rect.shift-drag.constrains-square", async ({ page }) => {
  await activate(page, "Rounded rectangle");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4 }, ["Shift"]);
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const shape = roundedRectAt(await pageObjects(page), 0);
  expectNear(shape.w, 2);
  expectNear(shape.h, 2);
});

test("rounded-rect.alt-drag.draws-from-center", async ({ page }) => {
  await activate(page, "Rounded rectangle");
  await armCounter(page);
  await drag(page, { x: 3, y: 4 }, { x: 4, y: 4.5 }, ["Alt"]);
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const shape = roundedRectAt(await pageObjects(page), 0);
  expectNear(shape.x, 2);
  expectNear(shape.y, 3.5);
  expectNear(shape.w, 2);
  expectNear(shape.h, 1);
});

test("rounded-rect.click.creates-default-size", async ({ page }) => {
  await activate(page, "Rounded rectangle");
  await armCounter(page);
  await clickAt(page, { x: 4, y: 4 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const shape = roundedRectAt(await pageObjects(page), 0);
  // 1×1 in, centered at the click point (drawBounds machine ASSUMPTION).
  expectNear(shape.x, 3.5);
  expectNear(shape.y, 3.5);
  expectNear(shape.w, 1);
  expectNear(shape.h, 1);
});

test("rounded-rect.drag-adjust-handle.sets-corner-radius", async ({ page }) => {
  await activate(page, "Rounded rectangle");
  await drag(page, { x: 2, y: 3 }, { x: 4, y: 4 });
  await activate(page, "Select");
  await clickAt(page, { x: 3, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  // The adjust handle is the chrome's, alongside the resize and rotate ones.
  const adjust = page.locator('[data-handle="corner-radius"]');
  await expect(adjust).toBeVisible();
  // Dragging it right along the top edge grows the radius by the travel.
  await armCounter(page);
  await dragHandle(page, "corner-radius", { dxPx: 96 * 0.25, dyPx: 0 });
  expect(await notificationCount(page)).toBe(1);
  let shape = roundedRectAt(await pageObjects(page), 0);
  expectNear(shape.cornerRadius ?? 0, 0.35);
  // It clamps at half the shorter side — 0.5in on this 2×1in frame.
  await dragHandle(page, "corner-radius", { dxPx: 96 * 4, dyPx: 0 });
  shape = roundedRectAt(await pageObjects(page), 0);
  expectNear(shape.cornerRadius ?? 0, 0.5);
  // One drag, one history entry: undo returns the radius the first set.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  shape = roundedRectAt(await pageObjects(page), 0);
  expectNear(shape.cornerRadius ?? 0, 0.35);
});

test("a rounded rect's radius is a radius: it survives a resize, and only rounded rects show the handle", async ({
  page,
}) => {
  await activate(page, "Rounded rectangle");
  await drag(page, { x: 2, y: 3 }, { x: 4, y: 4 });
  await activate(page, "Select");
  await clickAt(page, { x: 3, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  await dragHandle(page, "se", { x: 6, y: 5 });
  // Stretching the frame leaves the stored radius alone — the corner stays
  // the size it was set to, rather than stretching into an ellipse.
  expectNear(roundedRectAt(await pageObjects(page), 0).cornerRadius ?? 0, 0.1);

  // A plain rect has no corner to round, so it carries no adjust handle.
  await activate(page, "Rectangle");
  await drag(page, { x: 1, y: 6 }, { x: 2, y: 7 });
  await activate(page, "Select");
  await clickAt(page, { x: 1.5, y: 6.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  await expect(page.locator('[data-handle="corner-radius"]')).toHaveCount(0);
});

test("rounded-rect.esc.cancels-draw", async ({ page }) => {
  await activate(page, "Rounded rectangle");
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

test("star-polygon.drag.creates", async ({ page }) => {
  await activate(page, "Star / polygon");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const { shape, d } = outlineAt(await pageObjects(page), 0);
  // The tool's defaults store AS parameters — no baked path to go stale.
  expect(shape).toMatchObject({ shape: "starPolygon", points: 5, innerRadiusRatio: 0.5 });
  expect(shape.d).toBeUndefined();
  // Default 5-point star: 5 outer + 5 inner vertices, topmost point up.
  expect(vertices(d)).toHaveLength(10);
  expect(hasVertex(d, 0.5, 0)).toBe(true);
});

test("star-polygon.drag.creates honors the live points and inner-radius options", async ({
  page,
}) => {
  await activate(page, "Star / polygon");
  const optionsBar = page.getByTestId("options-bar");
  await optionsBar.getByLabel("Points", { exact: true }).fill("6");
  await optionsBar.getByLabel("Inner radius", { exact: true }).fill("0.3");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const { shape, d } = outlineAt(await pageObjects(page), 0);
  expect(shape).toMatchObject({ points: 6, innerRadiusRatio: 0.3 });
  const pts = vertices(d);
  expect(pts).toHaveLength(12);
  // Vertex 1 is an inner vertex: its normalized distance from the center
  // (0.5, 0.5) is the inner-radius ratio times the 0.5 outer radius.
  const inner = pts[1];
  if (!inner) throw new Error("expected an inner vertex at index 1");
  expect(Math.abs(Math.hypot(inner.x - 0.5, inner.y - 0.5) - 0.15)).toBeLessThanOrEqual(1e-6);
});

test("callout.drag.creates", async ({ page }) => {
  await activate(page, "Callout");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4.5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const { shape, d } = outlineAt(await pageObjects(page), 0);
  // The bottom-left preset seeds a free tip just below and left of the body,
  // which is where the drawn tail points.
  expect(shape).toMatchObject({ shape: "callout", tailTip: { x: 0.06, y: 1.22 } });
  expect(hasVertex(d, 0.06, 1.22)).toBe(true);
  // The body fills the frame, so its corners are the unit box's.
  expect(hasVertex(d, 1, 0)).toBe(true);
  expect(hasVertex(d, 1, 1)).toBe(true);
});

test("callout.drag.creates with the tail seeded bottom-right", async ({ page }) => {
  await activate(page, "Callout");
  await page
    .getByTestId("options-bar")
    .getByLabel("Tail from", { exact: true })
    .selectOption("bottom-right");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4.5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const { shape, d } = outlineAt(await pageObjects(page), 0);
  expect(shape).toMatchObject({ tailTip: { x: 0.94, y: 1.22 } });
  expect(hasVertex(d, 0.94, 1.22)).toBe(true);
});

test("callout.drag-tail-handle.repositions-tail sets length AND angle", async ({ page }) => {
  await draw(page, "Callout", { x: 2, y: 4 }, { x: 4, y: 5 });
  await activate(page, "Select");
  await clickAt(page, { x: 3, y: 4.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  // The handle sits ON the tip, which the bottom-left preset put below-left
  // of the body — outside the frame, where a callout points.
  await expect(page.locator('[data-handle="callout-tail"]')).toBeVisible();
  await armCounter(page);
  // Drag it far to the upper right: the tail should now leave by the top edge
  // and reach further than it did.
  await dragHandle(page, "callout-tail", { x: 5.5, y: 2.5 });
  expect(await notificationCount(page)).toBe(1);
  const tip = shapeAt(await pageObjects(page), 0).tailTip;
  if (tip === undefined) throw new Error("expected a stored tail tip");
  // Frame (2,4)–(4,5): the drop point is 1.75 across and −2 up in unit terms.
  expect(tip.x).toBeGreaterThan(1);
  expect(tip.y).toBeLessThan(0);
  // The drawn outline follows it: the tip is a vertex, and the tail now
  // leaves by the TOP edge rather than the bottom it started on.
  const { d } = outlineAt(await pageObjects(page), 0);
  expect(hasVertex(d, tip.x, tip.y)).toBe(true);
  expect(d.filter((s) => (s.c === "M" || s.c === "L") && s.y === 0)).toHaveLength(4);
});

test("banner.drag.creates", async ({ page }) => {
  await activate(page, "Banner");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4.5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const { shape, d } = outlineAt(await pageObjects(page), 0);
  // The ribbon stores the two adjustments the tool's options seeded.
  expect(shape).toMatchObject({ shape: "banner", panelInset: 0.17, panelHeight: 0.65 });
  // Five rings: the raised panel, two tails, two folds. One silhouette could
  // not draw the fold and panel-bottom lines the ribbon reads by.
  expect(d.filter((s) => s.c === "M")).toHaveLength(5);
  // The panel's bottom corners sit on the inset, where the tails begin.
  expect(hasVertex(d, 0.17, 0.65)).toBe(true);
  expect(hasVertex(d, 0.83, 0.65)).toBe(true);
});

test("banner.drag-inset-handle and .drag-height-handle adjust the ribbon", async ({ page }) => {
  await draw(page, "Banner", { x: 2, y: 4 }, { x: 6, y: 6 });
  await activate(page, "Select");
  await clickAt(page, { x: 4, y: 4.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  // Two yellow handles, which no other kind has.
  await expect(page.locator('[data-handle="banner-inset"]')).toBeVisible();
  await expect(page.locator('[data-handle="banner-height"]')).toBeVisible();

  // Sliding the inset handle right narrows the panel and widens the tails.
  await armCounter(page);
  await dragHandle(page, "banner-inset", { x: 3.2, y: 5.5 });
  expect(await notificationCount(page)).toBe(1);
  const wider = shapeAt(await pageObjects(page), 0);
  expect(wider.panelInset).toBeCloseTo(0.3, 2);
  expect(wider.panelHeight).toBeCloseTo(0.65, 6);

  // Dragging the height handle down deepens the panel, raising the tails'
  // band to meet it — between them the two reach the second reference picture
  // from the first, which is the whole point of having both.
  await armCounter(page);
  await dragHandle(page, "banner-height", { x: 4, y: 5.6 });
  expect(await notificationCount(page)).toBe(1);
  const deeper = shapeAt(await pageObjects(page), 0);
  expect(deeper.panelHeight).toBeCloseTo(0.8, 2);
  expect(deeper.panelInset).toBeCloseTo(0.3, 2);
});

for (const { label, id } of [
  { label: "Star / polygon", id: "star-polygon" },
  { label: "Callout", id: "callout" },
  { label: "Banner", id: "banner" },
] as const) {
  test(`${id}.click.creates-default-size`, async ({ page }) => {
    await activate(page, label);
    await armCounter(page);
    await clickAt(page, { x: 4, y: 4 });
    await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
    expect(await notificationCount(page)).toBe(1);
    const { shape } = outlineAt(await pageObjects(page), 0);
    // 1×1 in, centered at the click point (drawBounds machine ASSUMPTION).
    expectNear(shape.x, 3.5);
    expectNear(shape.y, 3.5);
    expectNear(shape.w, 1);
    expectNear(shape.h, 1);
  });
}

test("draw a star then undo returns to the empty page — one history entry", async ({ page }) => {
  await activate(page, "Star / polygon");
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  const pastDepth = await page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().document.past.length;
  });
  expect(pastDepth).toBe(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await pageObjects(page)).length).toBe(0);
});
