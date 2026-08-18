import { expect, test, type Page } from "@playwright/test";
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
 * Pen-tool gesture-clause tests (PLAN.md §5): titles are VERBATIM registry
 * clause ids (penTool in src/core/registry/tools/shapes.ts). Konva renders to
 * canvas, so assertions run against store state via the dev handle; the
 * store-notification counter proves the contract's per-anchor rule — each
 * anchor placement dispatches exactly one action, and the close/finish
 * gesture commits the shape in one action.
 *
 * Coordinates are document inches, converted to screen px through the live
 * store's viewport state (the default view shows roughly x −0.4…8.9,
 * y 2.3…8.7 — tests stay inside that band). The committed object's frame is
 * the bounding box of the drawn points; `d` segments are normalized 0–1 in
 * that frame.
 */

/** The in-progress pen draft (selectionIds pattern): APP state at
    state.pen.anchors, in document inches. */
function penAnchors(page: Page) {
  return page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().pen.anchors;
  });
}

function lastSeg(d: PathSeg[]): PathSeg {
  const seg = d[d.length - 1];
  if (!seg) throw new Error("expected non-empty path data");
  return seg;
}

function hasClosingZ(d: PathSeg[]): boolean {
  return lastSeg(d).c === "Z";
}

/** On-curve points of M/L segments only (C control points and Z skipped). */
function vertices(d: PathSeg[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const seg of d) {
    if (seg.c === "M" || seg.c === "L") pts.push({ x: seg.x, y: seg.y });
  }
  return pts;
}

/** shapeAt narrowed to a path shape with non-empty M-first data. Unlike the
    shapes.spec.ts variant this does NOT require a trailing Z — the pen
    commits open paths too, and each test asserts closure explicitly. */
function pathShapeAt(
  objects: LayoutObject[],
  index: number,
): { shape: ShapeObject; d: PathSeg[] } {
  const shape = shapeAt(objects, index);
  expect(shape.shape).toBe("path");
  const d = shape.d;
  if (!d || d.length === 0) throw new Error(`expected non-empty path data at index ${index}`);
  expect(d[0]?.c).toBe("M");
  return { shape, d };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas-area")).toBeVisible();
});

test("pen.click.adds-anchor", async ({ page }) => {
  await activate(page, "Pen / freeform");
  await armCounter(page);
  await clickAt(page, { x: 1, y: 3 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const [first] = await penAnchors(page);
  if (!first) throw new Error("expected a first anchor");
  expectNear(first.point.x, 1);
  expectNear(first.point.y, 3);
  expect(first.handleIn).toBeUndefined();
  expect(first.handleOut).toBeUndefined();
  await clickAt(page, { x: 3, y: 3 });
  await clickAt(page, { x: 3, y: 5 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(3);
  const anchors = await penAnchors(page);
  const expected = [
    { x: 1, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 5 },
  ];
  for (let i = 0; i < expected.length; i++) {
    const anchor = anchors[i];
    const point = expected[i];
    if (!anchor || !point) throw new Error(`expected anchor at index ${i}`);
    expectNear(anchor.point.x, point.x);
    expectNear(anchor.point.y, point.y);
  }
});

test("pen.click-drag.adds-curve-anchor", async ({ page }) => {
  await activate(page, "Pen / freeform");
  await clickAt(page, { x: 1, y: 3 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(1);
  // The drag pulls the tangent out: point at the press, handleOut at the
  // release, handleIn mirrored about the point.
  await drag(page, { x: 3, y: 4 }, { x: 3.6, y: 4.4 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(2);
  const anchors = await penAnchors(page);
  const curve = anchors[1];
  if (!curve) throw new Error("expected a second anchor");
  expectNear(curve.point.x, 3);
  expectNear(curve.point.y, 4);
  if (!curve.handleOut || !curve.handleIn) throw new Error("expected tangent handles");
  expectNear(curve.handleOut.x, 3.6);
  expectNear(curve.handleOut.y, 4.4);
  expectNear(curve.handleIn.x, 2.4);
  expectNear(curve.handleIn.y, 3.6);
});

test("pen.click-start.closes-path", async ({ page }) => {
  await activate(page, "Pen / freeform");
  await clickAt(page, { x: 1, y: 3 });
  await clickAt(page, { x: 3, y: 3 });
  await clickAt(page, { x: 3, y: 5 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(3);
  // Clicking the first anchor again (within tolerance) closes and commits in
  // one action.
  await armCounter(page);
  await clickAt(page, { x: 1, y: 3 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const { shape, d } = pathShapeAt(await pageObjects(page), 0);
  expect(hasClosingZ(d)).toBe(true);
  expectNear(shape.x, 1);
  expectNear(shape.y, 3);
  expectNear(shape.w, 2);
  expectNear(shape.h, 2);
  expect(await penAnchors(page)).toEqual([]);
});

test("pen.double-click.commits-open-path", async ({ page }) => {
  await activate(page, "Pen / freeform");
  // Enter finishes the draft as an open path at its current anchors.
  await clickAt(page, { x: 1, y: 3 });
  await clickAt(page, { x: 3, y: 3 });
  await clickAt(page, { x: 2, y: 5 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(3);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  const open = pathShapeAt(await pageObjects(page), 0);
  expect(hasClosingZ(open.d)).toBe(false);
  expect(vertices(open.d)).toHaveLength(3);
  expect(await penAnchors(page)).toEqual([]);
  // Double-click also finishes: its own two clicks add duplicate anchors and
  // the handler drops the last duplicate, so the vertex count equals the
  // number of distinct points clicked.
  await clickAt(page, { x: 5, y: 3 });
  await clickAt(page, { x: 7, y: 3 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(2);
  const p = await screenPoint(page, { x: 6, y: 5 });
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(async () => (await pageObjects(page)).length).toBe(2);
  const second = pathShapeAt(await pageObjects(page), 1);
  expect(hasClosingZ(second.d)).toBe(false);
  expect(vertices(second.d)).toHaveLength(3);
  expectNear(second.shape.x, 5);
  expectNear(second.shape.y, 3);
  expectNear(second.shape.w, 2);
  expectNear(second.shape.h, 2);
  expect(await penAnchors(page)).toEqual([]);
});

test("pen.esc.discards-path", async ({ page }) => {
  await activate(page, "Pen / freeform");
  await clickAt(page, { x: 1, y: 3 });
  await clickAt(page, { x: 3, y: 3 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(2);
  const before = await page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().document.present;
  });
  await page.keyboard.press("Escape");
  await expect.poll(() => penAnchors(page)).toEqual([]);
  expect((await pageObjects(page)).length).toBe(0);
  const after = await page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().document.present;
  });
  expect(after).toEqual(before);
});

test("pen draft undo retracts one anchor at a time and leaves document history alone", async ({
  page,
}) => {
  await activate(page, "Pen / freeform");
  await clickAt(page, { x: 1, y: 3 });
  await clickAt(page, { x: 3, y: 3 });
  await clickAt(page, { x: 3, y: 5 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(3);
  // Anchor placements are app state — nothing has entered document history.
  const pastDepth = () =>
    page.evaluate(() => {
      const store = window.__PROTOTYPE_STORE__;
      if (!store) throw new Error("dev store handle missing");
      return store.getState().document.past.length;
    });
  expect(await pastDepth()).toBe(0);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await undo.click();
  await expect.poll(async () => (await penAnchors(page)).length).toBe(2);
  await undo.click();
  await expect.poll(async () => (await penAnchors(page)).length).toBe(1);
  expect(await pastDepth()).toBe(0);
  await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeDisabled();
});

test("switching tools discards the draft", async ({ page }) => {
  await activate(page, "Pen / freeform");
  await clickAt(page, { x: 1, y: 3 });
  await clickAt(page, { x: 3, y: 3 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(2);
  await activate(page, "Select");
  await expect.poll(() => penAnchors(page)).toEqual([]);
  expect((await pageObjects(page)).length).toBe(0);
});

test("auto-close commits Enter finishes as closed rings", async ({ page }) => {
  await activate(page, "Pen / freeform");
  await page.getByTestId("options-bar").getByLabel("Auto-close", { exact: true }).check();
  await clickAt(page, { x: 1, y: 3 });
  await clickAt(page, { x: 3, y: 3 });
  await clickAt(page, { x: 2, y: 5 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(3);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  const { d } = pathShapeAt(await pageObjects(page), 0);
  expect(hasClosingZ(d)).toBe(true);
});
