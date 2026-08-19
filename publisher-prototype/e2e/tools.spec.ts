import { expect, test } from "@playwright/test";
import { rotatedFrameCorners } from "../src/core/hittest";
import {
  activate,
  armCounter,
  clickAt,
  drag,
  dragHandle,
  draw,
  expectNear,
  lineAt,
  notificationCount,
  pageObjects,
  screenPoint,
  selectionIds,
  shapeAt,
  type DocPoint,
} from "./helpers";

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
  // Near-horizontal drag snaps to 0°: length is the drag projected onto
  // the snapped direction.
  await draw(page, "Line", { x: 1, y: 3 }, { x: 3.9, y: 3.2 }, ["Shift"]);
  // Near-diagonal drag snaps to 45°.
  await draw(page, "Line", { x: 1, y: 3 }, { x: 3, y: 5.2 }, ["Shift"]);
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

test("a drawn object lands selected, whichever tool drew it", async ({ page }) => {
  // Every draw tool commits the same way, so selection follows all of them —
  // and the panels bind to the selection, which is what puts a new shape's
  // own parameters in reach the moment it exists.
  for (const label of ["Rectangle", "Ellipse", "Line", "Star / polygon"] as const) {
    await activate(page, label);
    await drag(page, { x: 1, y: 3 }, { x: 2, y: 4 });
    const objects = await pageObjects(page);
    const drawn = objects[objects.length - 1];
    if (!drawn) throw new Error(`${label} drew nothing`);
    expect(await selectionIds(page)).toEqual([drawn.id]);
  }
});

test("a committed draw hands the page back to the select tool", async ({ page }) => {
  // The other half of landing selected: the tool that drew steps aside, so
  // the new object can be moved or resized without a trip to the dock. The
  // options bar names the active tool, which is where the switch shows.
  const optionsBar = page.getByTestId("options-bar");
  await activate(page, "Rectangle");
  await expect(optionsBar).toContainText("Rectangle");
  await drag(page, { x: 1, y: 3 }, { x: 2, y: 4 });
  await expect(optionsBar).toContainText("Select");
  // And the object is immediately draggable — no re-arming in between.
  await drag(page, { x: 1.5, y: 3.5 }, { x: 2.5, y: 4.5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  const moved = shapeAt(await pageObjects(page), 0);
  expectNear(moved.x, 2);
  expectNear(moved.y, 4);
});

test("the pen hands back only when the path commits, not on each anchor", async ({ page }) => {
  // Anchor placements are their own committed gestures but are NOT draws —
  // switching on one would end the path after a single click.
  const optionsBar = page.getByTestId("options-bar");
  await activate(page, "Pen / freeform");
  await clickAt(page, { x: 1, y: 3 });
  await clickAt(page, { x: 3, y: 3 });
  await clickAt(page, { x: 2, y: 5 });
  await expect(optionsBar).toContainText("Pen / freeform");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  await expect(optionsBar).toContainText("Select");
});

test("select.click.selects-topmost", async ({ page }) => {
  await draw(page, "Rectangle", { x: 1, y: 3 }, { x: 3, y: 5 });
  await draw(page, "Rectangle", { x: 2, y: 4 }, { x: 4, y: 6 });
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
  await draw(page, "Rectangle", { x: 1, y: 3 }, { x: 2, y: 4 });
  await draw(page, "Rectangle", { x: 3, y: 3 }, { x: 4, y: 4 });
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
  await draw(page, "Rectangle", { x: 1, y: 3 }, { x: 3, y: 5 });
  await draw(page, "Rectangle", { x: 2, y: 4 }, { x: 4, y: 6 });
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
  await draw(page, "Rectangle", { x: 1, y: 4 }, { x: 2, y: 5 });
  await draw(page, "Rectangle", { x: 3, y: 4 }, { x: 4, y: 5 });
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
  // Drawing leaves its object selected, so clear it first: the clause under
  // test is the one that starts from an UNSELECTED object.
  await clickAt(page, { x: 6, y: 6 });
  expect(await selectionIds(page)).toEqual([]);
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

test("select.drag-handle.resizes a rotated frame in its own space", async ({ page }) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 2, y: 3 }, { x: 4, y: 4 });
  await activate(page, "Select");
  await clickAt(page, { x: 3, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  // A quarter turn: from here the chrome hugs the object, so its handles sit
  // on the rotated frame rather than on the box around it.
  await dragHandle(page, "rotate", { x: 3.8, y: 3.5 });
  let rect = shapeAt(await pageObjects(page), 0);
  expect(Math.abs(rect.rotation - 90)).toBeLessThanOrEqual(1);
  const rotation = rect.rotation;
  const before = rotatedFrameCorners(rect, rotation);
  // The se handle now hangs below-left on screen. Dragging it scales the
  // frame's OWN width and height (1.25× and 2.5×), never the document axes.
  await armCounter(page);
  await dragHandle(page, "se", { x: 1, y: 5 });
  expect(await notificationCount(page)).toBe(1);
  rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.rotation, rotation);
  expectNear(rect.w, 2.5);
  expectNear(rect.h, 2.5);
  // The nw corner — the anchor opposite the dragged handle — has not moved.
  const after = rotatedFrameCorners(rect, rotation);
  expectNear(after[0]?.x ?? NaN, before[0]?.x ?? NaN);
  expectNear(after[0]?.y ?? NaN, before[0]?.y ?? NaN);
});

test("selection handles carry the cursor of the direction they stretch", async ({ page }) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 2, y: 3 }, { x: 4, y: 4 });
  await activate(page, "Select");
  await clickAt(page, { x: 3, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  for (const [handle, cursor] of [
    ["n", "ns-resize"],
    ["s", "ns-resize"],
    ["e", "ew-resize"],
    ["w", "ew-resize"],
    ["nw", "nwse-resize"],
    ["se", "nwse-resize"],
    ["ne", "nesw-resize"],
    ["sw", "nesw-resize"],
  ] as const) {
    await expect(page.locator(`[data-handle="${handle}"]`)).toHaveCSS("cursor", cursor);
  }
  // Rotation has no cursor keyword — the knob carries a drawn glyph.
  await expect(page.locator('[data-handle="rotate"]')).toHaveCSS("cursor", /^url\(.*\) 12 12, grab$/);

  // A quarter turn takes the cursors with it: the handles now stretch along
  // the frame's own edges, so every axis swaps for its partner.
  await dragHandle(page, "rotate", { x: 3.8, y: 3.5 });
  expect(Math.abs(shapeAt(await pageObjects(page), 0).rotation - 90)).toBeLessThanOrEqual(1);
  for (const [handle, cursor] of [
    ["n", "ew-resize"],
    ["e", "ns-resize"],
    ["nw", "nesw-resize"],
    ["ne", "nwse-resize"],
  ] as const) {
    await expect(page.locator(`[data-handle="${handle}"]`)).toHaveCSS("cursor", cursor);
  }
});

test("the handle's cursor survives the drag that hides the handle", async ({ page }) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 2, y: 3 }, { x: 4, y: 4 });
  await activate(page, "Select");
  await clickAt(page, { x: 3, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  const area = page.getByTestId("canvas-area");
  await expect(area).toHaveCSS("cursor", "default");
  // Press the se handle and move without releasing: the preview replaces the
  // chrome, so the handle is gone — the canvas area holds its cursor instead.
  const box = await page.locator('[data-handle="se"]').boundingBox();
  if (!box) throw new Error("se handle not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 40, { steps: 4 });
  await expect(page.locator('[data-handle="se"]')).toHaveCount(0);
  await expect(area).toHaveCSS("cursor", "nwse-resize");
  await page.mouse.up();
  await expect(area).toHaveCSS("cursor", "default");
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

