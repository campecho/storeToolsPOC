import { expect, test, type Page } from "@playwright/test";
import type { LayoutObject, PathSeg, ShapeObject } from "../src/core/model";
import {
  activate,
  armCounter,
  clickAt,
  dockTool,
  drag,
  expectNear,
  hoverAt,
  notificationCount,
  pageObjects,
  screenPoint,
  selectionIds,
  shapeAt,
  type DocPoint,
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

/** An overlay path's `d` attribute, checked the way store geometry is: the
    command letters exactly, the coordinates within the same tolerance
    (pointer input round-trips through screen pixels, so the numbers land
    near the document inches a spec asks for, not on them). */
function expectPath(d: string | null, commands: string, coords: number[]): void {
  if (d === null) throw new Error("expected a path d attribute");
  expect((d.match(/[A-Z]/g) ?? []).join(" ")).toBe(commands);
  const actual = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  expect(actual).toHaveLength(coords.length);
  coords.forEach((expected, i) => expectNear(actual[i] ?? NaN, expected));
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

test("the path in progress previews live — rubber band, then the curve being shaped", async ({
  page,
}) => {
  await activate(page, "Pen / freeform");
  const band = page.getByTestId("pen-rubber-band");
  // Nothing to band to before the first anchor lands.
  await clickAt(page, { x: 1, y: 3 });
  await expect(band).toHaveCount(0);
  // Moving the pointer draws the segment the next click would add — the
  // outline is visible BEFORE anything is finalized.
  await hoverAt(page, { x: 4, y: 3 });
  await expect(band).toHaveCount(1);
  expectPath(await band.getAttribute("d"), "M L", [1, 3, 4, 3]);
  // The pointer leaving the canvas takes the band with it.
  await page.mouse.move(0, 0);
  await expect(band).toHaveCount(0);
  // Over the close target of a closable ring the band shows the CLOSING
  // segment, back to the first anchor.
  await clickAt(page, { x: 4, y: 3 });
  await clickAt(page, { x: 4, y: 5 });
  // Inside the 8px close tolerance (0.083 in at zoom 1) but a clear 0.05 in
  // off the anchor: the band snapping proves it targets the close, not the
  // pointer.
  await hoverAt(page, { x: 1.05, y: 3 });
  expectPath(await band.getAttribute("d"), "M L", [4, 5, 1, 3]);
  // And a curve-anchor drag previews the curve it is shaping, not just its
  // handles: a cubic from the last placed anchor into the one being placed,
  // carrying the drag's mirrored handle.
  const from = await screenPoint(page, { x: 6, y: 5 });
  const to = await screenPoint(page, { x: 6.6, y: 5.4 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  const pending = page.getByTestId("pen-pending-segment");
  await expect(pending).toHaveCount(1);
  expectPath(await pending.getAttribute("d"), "M C", [4, 5, 4, 5, 5.4, 4.6, 6, 5]);
  await page.mouse.up();
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
  // The committed path handed the page back to Select, so the pen has to be
  // picked up again to start the next one.
  await activate(page, "Pen / freeform");
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

/**
 * What COLOR is painted at this document point — the §5 testing note's
 * pixel-sampling probe. Konva draws each layer to its own canvas, stacked in
 * DOM order, so walking them topmost-first and taking the first non-
 * transparent pixel is what the eye sees there. Asking for the colour rather
 * than mere opacity is the point: the page itself paints opaque white
 * everywhere, so "something is painted here" would be true of the whole page
 * and prove nothing.
 */
async function paintedColorAt(page: Page, pt: DocPoint): Promise<string> {
  const p = await screenPoint(page, pt);
  return page.evaluate(({ x, y }) => {
    const canvases = [...document.querySelectorAll("canvas")].reverse();
    for (const canvas of canvases) {
      const rect = canvas.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      const sx = Math.round(((x - rect.left) * canvas.width) / rect.width);
      const sy = Math.round(((y - rect.top) * canvas.height) / rect.height);
      const [r, g, b, a] = ctx.getImageData(sx, sy, 1, 1).data;
      if ((a ?? 0) === 0) continue;
      const hex = (v: number | undefined) => (v ?? 0).toString(16).padStart(2, "0");
      return `#${hex(r)}${hex(g)}${hex(b)}`;
    }
    return "transparent";
  }, p);
}

/** The pen's default fill (penTool options, src/core/registry/tools/shapes.ts). */
const PEN_FILL = "#4472c4";

test("a partial shape's FILL is both painted and clickable", async ({ page }) => {
  await activate(page, "Pen / freeform");
  // Three corners, left open: the fill paints across the implied closure.
  await clickAt(page, { x: 1, y: 3 });
  await clickAt(page, { x: 4, y: 3 });
  await clickAt(page, { x: 4, y: 6 });
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  const { shape, d } = pathShapeAt(await pageObjects(page), 0);
  expect(hasClosingZ(d)).toBe(false);
  expect(shape.fill).not.toBeNull();
  // Enter handed the page back to Select, and the new object came selected;
  // clear it so the click below is what does the selecting.
  await clickAt(page, { x: 7, y: 7 });
  await expect.poll(() => selectionIds(page)).toEqual([]);
  // Deep inside the filled region and well clear of every drawn edge, so
  // neither the stroke band nor tolerance can account for a hit.
  const insideFill = { x: 3, y: 4 };
  const outsideFill = { x: 1.5, y: 5 };
  // The fill really is painted there — and really is not on the other side of
  // the implied closure, which is what makes the click assertions mean
  // something.
  expect(await paintedColorAt(page, insideFill)).toBe(PEN_FILL);
  expect(await paintedColorAt(page, outsideFill)).not.toBe(PEN_FILL);
  await clickAt(page, insideFill);
  await expect.poll(() => selectionIds(page)).toEqual([shape.id]);
  // Where nothing is painted, the same partial shape lets the click through.
  await clickAt(page, outsideFill);
  await expect.poll(() => selectionIds(page)).toEqual([]);
});

test("pen.esc.ends-path", async ({ page }) => {
  await activate(page, "Pen / freeform");
  await clickAt(page, { x: 1, y: 3 });
  await clickAt(page, { x: 3, y: 5 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(2);
  // Esc ENDS the path and keeps it (Illustrator parity) — one action, and
  // what was drawn is now an open path object.
  await armCounter(page);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const { shape, d } = pathShapeAt(await pageObjects(page), 0);
  expect(hasClosingZ(d)).toBe(false);
  expectNear(shape.x, 1);
  expectNear(shape.y, 3);
  expect(await penAnchors(page)).toEqual([]);
});

test("Esc discards a draft too small to be a shape — nothing to keep", async ({ page }) => {
  await activate(page, "Pen / freeform");
  await clickAt(page, { x: 1, y: 3 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(1);
  const documentState = () =>
    page.evaluate(() => {
      const store = window.__PROTOTYPE_STORE__;
      if (!store) throw new Error("dev store handle missing");
      return store.getState().document.present;
    });
  const before = await documentState();
  await page.keyboard.press("Escape");
  await expect.poll(() => penAnchors(page)).toEqual([]);
  expect((await pageObjects(page)).length).toBe(0);
  expect(await documentState()).toEqual(before);
});

test("a straight partial path commits with a zero-extent frame rather than vanishing", async ({
  page,
}) => {
  await activate(page, "Pen / freeform");
  await clickAt(page, { x: 1, y: 3 });
  await clickAt(page, { x: 4, y: 3 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(2);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  const { shape } = pathShapeAt(await pageObjects(page), 0);
  expectNear(shape.w, 3);
  expect(shape.h).toBe(0);
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

test("switching tools commits the draft and leaves the new tool alone", async ({ page }) => {
  await activate(page, "Pen / freeform");
  await clickAt(page, { x: 1, y: 3 });
  await clickAt(page, { x: 3, y: 5 });
  await expect.poll(async () => (await penAnchors(page)).length).toBe(2);
  await activate(page, "Rectangle");
  await expect.poll(() => penAnchors(page)).toEqual([]);
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(hasClosingZ(pathShapeAt(await pageObjects(page), 0).d)).toBe(false);
  // The user picked Rectangle — finishing the draft must not bounce them to
  // Select the way an ordinary draw commit does.
  await expect(dockTool(page, "Rectangle")).toHaveAttribute("aria-pressed", "true");
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
