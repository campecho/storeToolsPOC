import { expect, test, type Page } from "@playwright/test";
import {
  activate,
  armCounter,
  clickAt,
  drag,
  expectNear,
  notificationCount,
  lineAt,
  pageObjects,
  selectionIds,
  shapeAt,
  type DocPoint,
} from "./helpers";

/**
 * Live control panels (PLAN.md §4.3 "transform" and "color-swatches"): the
 * panels edit the real document through the store — numeric entry applies as
 * it is typed, and one visit to a field is EXACTLY ONE history entry (the
 * §6.3 one-entry-per-gesture rule applied to panel commits, through the
 * NumberField edit run), verified by the store-notification counter and the
 * history depth, with undo restoring the pre-edit document.
 */

function panel(page: Page, id: "transform" | "color-swatches") {
  return page.getByTestId(`${id}-panel`);
}

/** Draw a 1×1-in rect at (1,3)–(2,4) and select it with the Select tool. */
async function drawAndSelectRect(page: Page): Promise<void> {
  await activate(page, "Rectangle");
  await drag(page, { x: 1, y: 3 }, { x: 2, y: 4 });
  await activate(page, "Select");
  await clickAt(page, { x: 1.5, y: 3.5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
}

/** Draw a shape and leave it selected — which is now what drawing does, so
    the panels bind to it with no extra click. */
async function drawShape(page: Page, tool: string, from: DocPoint, to: DocPoint): Promise<void> {
  await activate(page, tool);
  await drag(page, from, to);
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
}

async function commitField(page: Page, panelId: "transform" | "color-swatches", label: string, value: string): Promise<void> {
  const field = panel(page, panelId).getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** The selected rect's outline width, in points. */
function strokeWidthOf(objects: Awaited<ReturnType<typeof pageObjects>>): number | undefined {
  return shapeAt(objects, 0).stroke?.width;
}

function historyDepth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().document.past.length;
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas-area")).toBeVisible();
});

test("transform panel: X/Y entry commits once and moves the selected object", async ({ page }) => {
  await drawAndSelectRect(page);
  await expect(panel(page, "transform").getByLabel("X", { exact: true })).toHaveValue("1");
  await armCounter(page);
  await commitField(page, "transform", "X", "2.5");
  expect(await notificationCount(page)).toBe(1);
  let rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 2.5);
  expectNear(rect.y, 3);
  await commitField(page, "transform", "Y", "4.25");
  rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.y, 4.25);
  expectNear(rect.w, 1);
  expectNear(rect.h, 1);
});

test("transform panel: W/H entry resizes without moving the origin", async ({ page }) => {
  await drawAndSelectRect(page);
  await commitField(page, "transform", "W", "3");
  await commitField(page, "transform", "H", "0.5");
  const rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 1);
  expectNear(rect.y, 3);
  expectNear(rect.w, 3);
  expectNear(rect.h, 0.5);
});

test("transform panel: each commit is one undo step, and undo restores the value", async ({
  page,
}) => {
  await drawAndSelectRect(page);
  expect(await historyDepth(page)).toBe(1);
  await commitField(page, "transform", "X", "4");
  await commitField(page, "transform", "W", "2");
  expect(await historyDepth(page)).toBe(3);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await undo.click();
  let rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 4);
  expectNear(rect.w, 1);
  await undo.click();
  rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 1);
});

test("transform panel: angle entry normalizes into [0, 360); rotate buttons step 90°; reset returns to 0", async ({
  page,
}) => {
  await drawAndSelectRect(page);
  await armCounter(page);
  await commitField(page, "transform", "Angle", "405");
  expect(await notificationCount(page)).toBe(1);
  expect(shapeAt(await pageObjects(page), 0).rotation).toBe(45);
  await panel(page, "transform").getByRole("button", { name: "Rotate 90° CW" }).click();
  expect(shapeAt(await pageObjects(page), 0).rotation).toBe(135);
  await panel(page, "transform").getByRole("button", { name: "Rotate 90° CCW" }).click();
  expect(shapeAt(await pageObjects(page), 0).rotation).toBe(45);
  await panel(page, "transform").getByRole("button", { name: "Reset rotation" }).click();
  expect(shapeAt(await pageObjects(page), 0).rotation).toBe(0);
});

test("transform panel: lock is undoable app-visible state — a locked object ignores nudges until unlocked", async ({
  page,
}) => {
  await drawAndSelectRect(page);
  const locked = panel(page, "transform").getByLabel("Locked", { exact: true });
  await locked.check();
  expect(shapeAt(await pageObjects(page), 0).locked).toBe(true);
  // Geometry entry disables while locked. The object stays SELECTED (the
  // select tool's hit test skips locked objects, so a canvas click would
  // deselect it instead) — blur the checkbox and nudge: the arrow-key
  // dispatch happens, the reducer skips the locked object.
  await expect(panel(page, "transform").getByLabel("X", { exact: true })).toBeDisabled();
  const blurActive = () =>
    page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
  await blurActive();
  await page.keyboard.press("ArrowRight");
  expectNear(shapeAt(await pageObjects(page), 0).x, 1);
  await locked.uncheck();
  expect(shapeAt(await pageObjects(page), 0).locked).toBe(false);
  await blurActive();
  await page.keyboard.press("ArrowRight");
  expectNear(shapeAt(await pageObjects(page), 0).x, 1.1);
});

test("transform panel: nudge increment edits the same live option the arrow keys obey", async ({
  page,
}) => {
  await drawAndSelectRect(page);
  await commitField(page, "transform", "Nudge increment", "0.25");
  // The options bar renders the same select-tool option — one state, two surfaces.
  await expect(page.getByTestId("options-bar").getByLabel("Nudge", { exact: true })).toHaveValue(
    "0.25",
  );
  await clickAt(page, { x: 1.5, y: 3.5 });
  await page.keyboard.press("ArrowDown");
  const rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.y, 3.25);
});

test("transform panel: corner radius shows for a rounded rect only, and edits the same value the handle sets", async ({
  page,
}) => {
  await drawAndSelectRect(page);
  // A plain rect has no corner to round — no field, nothing to edit.
  await expect(panel(page, "transform").getByLabel("Corner radius", { exact: true })).toHaveCount(0);

  await drawShape(page, "Rounded rectangle", { x: 4, y: 3 }, { x: 6, y: 4 });
  const radius = panel(page, "transform").getByLabel("Corner radius", { exact: true });
  await expect(radius).toHaveValue("0.1");

  const before = await historyDepth(page);
  await commitField(page, "transform", "Corner radius", "0.4");
  expect(shapeAt(await pageObjects(page), 1).cornerRadius).toBe(0.4);
  // One visit, one entry — the same edit-run discipline every field follows.
  expect(await historyDepth(page)).toBe(before + 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(shapeAt(await pageObjects(page), 1).cornerRadius).toBe(0.1);
});

test("every pre-draw shape option is editable on the selection", async ({ page }) => {
  // The star's two parameters, through the panel that now owns them.
  await drawShape(page, "Star / polygon", { x: 1, y: 3 }, { x: 3, y: 5 });
  await commitField(page, "transform", "Points", "8");
  await commitField(page, "transform", "Inner radius", "0.25");
  expect(shapeAt(await pageObjects(page), 0)).toMatchObject({
    points: 8,
    innerRadiusRatio: 0.25,
  });

  // The callout's tail and the flowchart's symbol are enums, one commit each.
  await drawShape(page, "Callout", { x: 4, y: 3 }, { x: 6, y: 4.5 });
  await armCounter(page);
  await panel(page, "transform").getByLabel("Tail anchor", { exact: true }).selectOption("top-right");
  expect(await notificationCount(page)).toBe(1);
  expect(shapeAt(await pageObjects(page), 1).tailAnchor).toBe("top-right");

  await drawShape(page, "Flowchart", { x: 1, y: 6 }, { x: 3, y: 7 });
  await panel(page, "transform").getByLabel("Symbol", { exact: true }).selectOption("decision");
  expect(shapeAt(await pageObjects(page), 2).symbol).toBe("decision");

  // Undo steps back through them one edit at a time.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(shapeAt(await pageObjects(page), 2).symbol).toBe("process");
});

test("color panel: a line's dash and end decorations are editable on the selection", async ({
  page,
}) => {
  await drawShape(page, "Line", { x: 1, y: 3 }, { x: 4, y: 5 });
  const colorPanel = panel(page, "color-swatches");
  // Dash and heads describe the outline, so they live with the outline.
  await expect(colorPanel.getByLabel("Dash", { exact: true })).toHaveCount(0);
  await colorPanel.getByLabel("Outline", { exact: true }).check();

  await armCounter(page);
  await colorPanel.getByLabel("Dash", { exact: true }).selectOption("dashed");
  expect(await notificationCount(page)).toBe(1);
  expect(lineAt(await pageObjects(page), 0).dash).toBe("dashed");

  await colorPanel.getByLabel("End head", { exact: true }).selectOption("arrow");
  await colorPanel.getByLabel("Head size", { exact: true }).selectOption("l");
  expect(lineAt(await pageObjects(page), 0)).toMatchObject({ headEnd: "arrow", headSize: "l" });

  // The schema's additive rule: a default stores as absence, not as a value.
  await colorPanel.getByLabel("Dash", { exact: true }).selectOption("solid");
  expect(lineAt(await pageObjects(page), 0).dash).toBeUndefined();
});

test("transform panel: a pen path's closed state is the placed autoClose option", async ({
  page,
}) => {
  await activate(page, "Pen / freeform");
  for (const point of [
    { x: 1, y: 3 },
    { x: 3, y: 3 },
    { x: 2, y: 5 },
  ]) {
    await clickAt(page, point);
  }
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  const closed = panel(page, "transform").getByLabel("Closed path", { exact: true });
  // autoClose defaults off, so the drafted path finished open.
  await expect(closed).not.toBeChecked();
  await closed.check();
  const path = shapeAt(await pageObjects(page), 0);
  expect(path.d?.[path.d.length - 1]?.c).toBe("Z");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const reopened = shapeAt(await pageObjects(page), 0);
  expect(reopened.d?.[reopened.d.length - 1]?.c).not.toBe("Z");
});

test("color panel: picking a fill color commits one literal rgb paint; None hollows; undo restores", async ({
  page,
}) => {
  await drawAndSelectRect(page);
  await armCounter(page);
  await panel(page, "color-swatches").getByLabel("Color", { exact: true }).fill("#ff0000");
  expect(await notificationCount(page)).toBe(1);
  let rect = shapeAt(await pageObjects(page), 0);
  expect(rect.fill).toEqual({ kind: "color", color: { space: "rgb", values: [1, 0, 0] } });
  await panel(page, "color-swatches").getByRole("button", { name: "None", exact: true }).click();
  rect = shapeAt(await pageObjects(page), 0);
  expect(rect.fill).toBeNull();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  rect = shapeAt(await pageObjects(page), 0);
  expect(rect.fill).toEqual({ kind: "color", color: { space: "rgb", values: [1, 0, 0] } });
});

test("color panel: outline color keeps the width; width entry keeps the color", async ({
  page,
}) => {
  await drawAndSelectRect(page);
  const colorPanel = panel(page, "color-swatches");
  await colorPanel.getByLabel("Outline", { exact: true }).check();
  // The drawn rect's contract-default outline: black at 0.75pt.
  await colorPanel.getByLabel("Color", { exact: true }).fill("#00ff00");
  let stroke = shapeAt(await pageObjects(page), 0).stroke;
  expect(stroke).toEqual({
    paint: { kind: "color", color: { space: "rgb", values: [0, 1, 0] } },
    width: 0.75,
  });
  await commitField(page, "color-swatches", "Width", "4");
  stroke = shapeAt(await pageObjects(page), 0).stroke;
  expect(stroke).toEqual({
    paint: { kind: "color", color: { space: "rgb", values: [0, 1, 0] } },
    width: 4,
  });
  await colorPanel.getByRole("button", { name: "None", exact: true }).click();
  expect(shapeAt(await pageObjects(page), 0).stroke).toBeNull();
});

test("color panel: outline width applies while typing, without leaving the field", async ({
  page,
}) => {
  await drawAndSelectRect(page);
  const colorPanel = panel(page, "color-swatches");
  await colorPanel.getByLabel("Outline", { exact: true }).check();
  const width = colorPanel.getByLabel("Width", { exact: true });
  const before = await historyDepth(page);
  await width.fill("");
  // Clearing the field commits nothing — there is no value to apply yet.
  expect(strokeWidthOf(await pageObjects(page))).toBe(0.75);
  await width.pressSequentially("12");
  // Still in the field, still selected: the document already shows 12pt.
  await expect(width).toBeFocused();
  expect(await selectionIds(page)).toHaveLength(1);
  expect(strokeWidthOf(await pageObjects(page))).toBe(12);
  // Both keystrokes folded into one entry, so one undo reverses the visit.
  expect(await historyDepth(page)).toBe(before + 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(strokeWidthOf(await pageObjects(page))).toBe(0.75);
});

test("color panel: a width field that remounts starts a fresh run", async ({ page }) => {
  await drawAndSelectRect(page);
  const colorPanel = panel(page, "color-swatches");
  const outline = colorPanel.getByLabel("Outline", { exact: true });
  const fill = colorPanel.getByLabel("Fill", { exact: true });
  await outline.check();
  const before = await historyDepth(page);
  await commitField(page, "color-swatches", "Width", "3");
  // Switching target unmounts the width field; switching back mounts a new
  // one, whose run must not fold into the entry the first one opened.
  await fill.check();
  await outline.check();
  await commitField(page, "color-swatches", "Width", "6");
  expect(strokeWidthOf(await pageObjects(page))).toBe(6);
  expect(await historyDepth(page)).toBe(before + 2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(strokeWidthOf(await pageObjects(page))).toBe(3);
});

test("color panel: Escape abandons the width edit, reverting inside the same run", async ({
  page,
}) => {
  await drawAndSelectRect(page);
  const colorPanel = panel(page, "color-swatches");
  await colorPanel.getByLabel("Outline", { exact: true }).check();
  const width = colorPanel.getByLabel("Width", { exact: true });
  const before = await historyDepth(page);
  await width.fill("9");
  expect(strokeWidthOf(await pageObjects(page))).toBe(9);
  await width.press("Escape");
  expect(strokeWidthOf(await pageObjects(page))).toBe(0.75);
  // The revert rides the same run, so the abandoned edit is still one entry
  // — one that now snapshots and restores the same width either side of it.
  expect(await historyDepth(page)).toBe(before + 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(strokeWidthOf(await pageObjects(page))).toBe(0.75);
});

test("color panel: a document swatch applies as a swatch REFERENCE, and undo restores the literal", async ({
  page,
}) => {
  // Give the document a named swatch through the debug load door (the panel
  // itself only APPLIES swatches; swatch management is a later slice).
  await page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    const doc = JSON.parse(JSON.stringify(store.getState().document.present)) as {
      swatches: unknown[];
    };
    doc.swatches = [
      { id: "sw-brand", name: "Brand Blue", space: "rgb", values: [0.2, 0.4, 0.6] },
    ];
    store.dispatch({ type: "document/loadedCommitted", payload: doc });
  });
  await drawAndSelectRect(page);
  await armCounter(page);
  await panel(page, "color-swatches").getByRole("button", { name: "Brand Blue" }).click();
  expect(await notificationCount(page)).toBe(1);
  let rect = shapeAt(await pageObjects(page), 0);
  expect(rect.fill).toEqual({ kind: "swatch", swatchId: "sw-brand" });
  // The color well previews the referenced swatch (#336699).
  await expect(panel(page, "color-swatches").getByLabel("Color", { exact: true })).toHaveValue(
    "#336699",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  rect = shapeAt(await pageObjects(page), 0);
  // Back to the rect tool's literal contract-default fill, previewed as its hex.
  expect(rect.fill).toMatchObject({ kind: "color" });
  await expect(panel(page, "color-swatches").getByLabel("Color", { exact: true })).toHaveValue(
    "#4472c4",
  );
});
