import { expect, test } from "@playwright/test";
import type { LayoutObject, PathSeg, ShapeObject } from "../src/core/model";
import {
  activate,
  armCounter,
  clickAt,
  drag,
  expectNear,
  notificationCount,
  pageObjects,
  screenPoint,
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

/** shapeAt narrowed to a path shape with well-formed data: `d` is a
    non-empty M…Z segment list. */
function pathShapeAt(
  objects: LayoutObject[],
  index: number,
): { shape: ShapeObject; d: PathSeg[] } {
  const shape = shapeAt(objects, index);
  expect(shape.shape).toBe("path");
  const d = shape.d;
  if (!d || d.length === 0) throw new Error(`expected non-empty path data at index ${index}`);
  expect(d[0]?.c).toBe("M");
  expect(d[d.length - 1]?.c).toBe("Z");
  return { shape, d };
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
  const { shape, d } = pathShapeAt(await pageObjects(page), 0);
  expectNear(shape.x, 1);
  expectNear(shape.y, 3);
  expectNear(shape.w, 2);
  expectNear(shape.h, 1.5);
  // Rounded corners are cubic arcs — at least one C segment per corner.
  expect(d.filter((seg) => seg.c === "C").length).toBeGreaterThanOrEqual(4);
});

test("rounded-rect.shift-drag.constrains-square", async ({ page }) => {
  await activate(page, "Rounded rectangle");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4 }, ["Shift"]);
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const { shape } = pathShapeAt(await pageObjects(page), 0);
  expectNear(shape.w, 2);
  expectNear(shape.h, 2);
});

test("rounded-rect.alt-drag.draws-from-center", async ({ page }) => {
  await activate(page, "Rounded rectangle");
  await armCounter(page);
  await drag(page, { x: 3, y: 4 }, { x: 4, y: 4.5 }, ["Alt"]);
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const { shape } = pathShapeAt(await pageObjects(page), 0);
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
  const { shape } = pathShapeAt(await pageObjects(page), 0);
  // 1×1 in, centered at the click point (drawBounds machine ASSUMPTION).
  expectNear(shape.x, 3.5);
  expectNear(shape.y, 3.5);
  expectNear(shape.w, 1);
  expectNear(shape.h, 1);
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
  const { d } = pathShapeAt(await pageObjects(page), 0);
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
  const { d } = pathShapeAt(await pageObjects(page), 0);
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
  const { d } = pathShapeAt(await pageObjects(page), 0);
  // Default tail anchor bottom-left: the tail tip touches the frame bottom
  // near the left edge; the body's right edge spans the full width.
  expect(hasVertex(d, 0.06, 1)).toBe(true);
  expect(hasVertex(d, 1, 0.75)).toBe(true);
});

test("callout.drag.creates with tail anchor bottom-right", async ({ page }) => {
  await activate(page, "Callout");
  await page
    .getByTestId("options-bar")
    .getByLabel("Tail anchor", { exact: true })
    .selectOption("bottom-right");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4.5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const { d } = pathShapeAt(await pageObjects(page), 0);
  expect(hasVertex(d, 0.94, 1)).toBe(true);
});

test("banner.drag.creates", async ({ page }) => {
  await activate(page, "Banner");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4.5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const { d } = pathShapeAt(await pageObjects(page), 0);
  // Ribbon fold notches sit at mid-height on both sides.
  expect(hasVertex(d, 0.15, 0.5)).toBe(true);
  expect(hasVertex(d, 0.85, 0.5)).toBe(true);
});

test("flowchart.drag.creates", async ({ page }) => {
  await activate(page, "Flowchart");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4.5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const { d } = pathShapeAt(await pageObjects(page), 0);
  // Default symbol "process": exactly the four frame corners.
  const pts = vertices(d);
  expect(pts).toHaveLength(4);
  expect(hasVertex(d, 0, 0)).toBe(true);
  expect(hasVertex(d, 1, 0)).toBe(true);
  expect(hasVertex(d, 1, 1)).toBe(true);
  expect(hasVertex(d, 0, 1)).toBe(true);
});

test("flowchart.drag.creates with decision and terminator symbols", async ({ page }) => {
  await activate(page, "Flowchart");
  const symbol = page.getByTestId("options-bar").getByLabel("Symbol", { exact: true });
  await symbol.selectOption("decision");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4.5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const decision = pathShapeAt(await pageObjects(page), 0);
  // Decision: a diamond on the frame's edge midpoints.
  expect(vertices(decision.d)).toHaveLength(4);
  expect(hasVertex(decision.d, 0.5, 0)).toBe(true);
  expect(hasVertex(decision.d, 1, 0.5)).toBe(true);
  expect(hasVertex(decision.d, 0.5, 1)).toBe(true);
  expect(hasVertex(decision.d, 0, 0.5)).toBe(true);
  await symbol.selectOption("terminator");
  await drag(page, { x: 4, y: 3 }, { x: 6, y: 4 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(2);
  const terminator = pathShapeAt(await pageObjects(page), 1);
  // Terminator: rounded ends are cubic arcs.
  expect(terminator.d.filter((seg) => seg.c === "C").length).toBeGreaterThan(0);
});

for (const { label, id } of [
  { label: "Star / polygon", id: "star-polygon" },
  { label: "Callout", id: "callout" },
  { label: "Banner", id: "banner" },
  { label: "Flowchart", id: "flowchart" },
] as const) {
  test(`${id}.click.creates-default-size`, async ({ page }) => {
    await activate(page, label);
    await armCounter(page);
    await clickAt(page, { x: 4, y: 4 });
    await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
    expect(await notificationCount(page)).toBe(1);
    const { shape } = pathShapeAt(await pageObjects(page), 0);
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
