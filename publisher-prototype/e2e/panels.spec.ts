import { expect, test, type Page } from "@playwright/test";
import {
  activate,
  armCounter,
  clickAt,
  drag,
  draw,
  expectNear,
  lineAt,
  notificationCount,
  pageObjects,
  selectionIds,
  shapeAt,
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

test("transform panel: a lone line shows its two points, not a bounding box", async ({ page }) => {
  await draw(page, "Line", { x: 2, y: 4 }, { x: 4, y: 5 });
  await activate(page, "Select");
  await clickAt(page, { x: 3, y: 4.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  const transform = panel(page, "transform");
  await expect(transform.getByLabel("X1", { exact: true })).toHaveValue("2");
  await expect(transform.getByLabel("Y1", { exact: true })).toHaveValue("4");
  await expect(transform.getByLabel("X2", { exact: true })).toHaveValue("4");
  await expect(transform.getByLabel("Y2", { exact: true })).toHaveValue("5");
  // A line has no box, so it offers none of a box's fields.
  for (const label of ["X", "Y", "W", "H"]) {
    await expect(transform.getByLabel(label, { exact: true })).toHaveCount(0);
  }
  // Each field moves its own end, one commit, leaving the other alone.
  await armCounter(page);
  await commitField(page, "transform", "X2", "6.5");
  expect(await notificationCount(page)).toBe(1);
  const line = lineAt(await pageObjects(page), 0);
  expectNear(line.x1, 2);
  expectNear(line.y1, 4);
  expectNear(line.x2, 6.5);
  expectNear(line.y2, 5);
});

test("transform panel: a vertical line stays editable along the axis it has no extent on", async ({
  page,
}) => {
  // The old bounding-box fields disabled W here — a zero extent cannot be
  // scaled — which left a vertical line unable to move either end sideways.
  await draw(page, "Line", { x: 3, y: 3 }, { x: 3, y: 5 });
  await activate(page, "Select");
  await clickAt(page, { x: 3, y: 4 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  await expect(panel(page, "transform").getByLabel("X1", { exact: true })).toBeEnabled();
  await commitField(page, "transform", "X1", "1.5");
  const line = lineAt(await pageObjects(page), 0);
  expectNear(line.x1, 1.5);
  expectNear(line.x2, 3);
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

  await activate(page, "Rounded rectangle");
  await drag(page, { x: 4, y: 3 }, { x: 6, y: 4 });
  await activate(page, "Select");
  await clickAt(page, { x: 5, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
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

test("transform panel: the Shape group shows the selected kind's parameters and nothing else", async ({
  page,
}) => {
  const shapeGroup = panel(page, "transform").getByRole("group", { name: "Shape" });
  // A rect is shaped by its frame box alone — no group at all.
  await draw(page, "Rectangle", { x: 1, y: 3 }, { x: 2, y: 4 });
  await expect(shapeGroup).toHaveCount(0);
  // A star stores two parameters; a callout stores one, and not the star's.
  await draw(page, "Star / polygon", { x: 3, y: 3 }, { x: 5, y: 5 });
  await expect(shapeGroup.getByLabel("Points", { exact: true })).toBeVisible();
  await expect(shapeGroup.getByLabel("Inner radius", { exact: true })).toBeVisible();
  await draw(page, "Callout", { x: 1, y: 6 }, { x: 3, y: 7 });
  await expect(shapeGroup.getByLabel("Tail anchor", { exact: true })).toBeVisible();
  await expect(shapeGroup.getByLabel("Points", { exact: true })).toHaveCount(0);
});

test("transform panel: star points and inner radius edit the drawn star, one entry per visit", async ({
  page,
}) => {
  await draw(page, "Star / polygon", { x: 1, y: 3 }, { x: 3, y: 5 });
  // The drawing tool's own contract defaults, now showing as the placed
  // shape's stored parameters.
  await expect(panel(page, "transform").getByLabel("Points", { exact: true })).toHaveValue("5");
  const before = await historyDepth(page);
  await armCounter(page);
  await commitField(page, "transform", "Points", "9");
  expect(await notificationCount(page)).toBe(1);
  expect(shapeAt(await pageObjects(page), 0).points).toBe(9);
  await commitField(page, "transform", "Inner radius", "0.25");
  expect(shapeAt(await pageObjects(page), 0).innerRadiusRatio).toBe(0.25);
  // Two visits, two entries — and the inner radius shares its action with
  // the canvas adjust handle, so undo steps back through either the same way.
  expect(await historyDepth(page)).toBe(before + 2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(shapeAt(await pageObjects(page), 0).innerRadiusRatio).toBe(0.5);
  expect(shapeAt(await pageObjects(page), 0).points).toBe(9);
});

test("transform panel: points entry refuses values outside the tool's declared range", async ({
  page,
}) => {
  await draw(page, "Star / polygon", { x: 1, y: 3 }, { x: 3, y: 5 });
  const points = panel(page, "transform").getByLabel("Points", { exact: true });
  // The star tool's contract range is 3–24; beyond it nothing commits,
  // though the draft keeps showing what was typed.
  await points.fill("40");
  await expect(points).toHaveValue("40");
  expect(shapeAt(await pageObjects(page), 0).points).toBe(5);
  await points.fill("2");
  expect(shapeAt(await pageObjects(page), 0).points).toBe(5);
  await points.fill("12");
  expect(shapeAt(await pageObjects(page), 0).points).toBe(12);
});

test("transform panel: callout tail anchor and flowchart symbol commit one entry per pick", async ({
  page,
}) => {
  await draw(page, "Callout", { x: 1, y: 3 }, { x: 3, y: 4.5 });
  const tail = panel(page, "transform").getByLabel("Tail anchor", { exact: true });
  await expect(tail).toHaveValue("bottom-left");
  await armCounter(page);
  await tail.selectOption("top-right");
  expect(await notificationCount(page)).toBe(1);
  expect(shapeAt(await pageObjects(page), 0).tailAnchor).toBe("top-right");

  await draw(page, "Flowchart", { x: 4, y: 3 }, { x: 6, y: 4.5 });
  const symbol = panel(page, "transform").getByLabel("Symbol", { exact: true });
  await expect(symbol).toHaveValue("process");
  const before = await historyDepth(page);
  await symbol.selectOption("decision");
  expect(shapeAt(await pageObjects(page), 1).symbol).toBe("decision");
  expect(await historyDepth(page)).toBe(before + 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(shapeAt(await pageObjects(page), 1).symbol).toBe("process");
});

test("transform panel: Closed opens and closes a placed freeform path", async ({ page }) => {
  await activate(page, "Pen / freeform");
  await clickAt(page, { x: 1, y: 3 });
  await clickAt(page, { x: 3, y: 3 });
  await clickAt(page, { x: 2, y: 5 });
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  const closed = panel(page, "transform").getByLabel("Closed", { exact: true });
  // Enter commits an OPEN path — the checkbox is the placed counterpart of
  // the pen's own auto-close option.
  await expect(closed).not.toBeChecked();
  await closed.check();
  const ringed = shapeAt(await pageObjects(page), 0).d ?? [];
  expect(ringed.at(-1)?.c).toBe("Z");
  await closed.uncheck();
  const opened = shapeAt(await pageObjects(page), 0).d ?? [];
  expect(opened.at(-1)?.c).not.toBe("Z");
});

test("transform panel: locking a shape disables its parameters too", async ({ page }) => {
  await draw(page, "Star / polygon", { x: 1, y: 3 }, { x: 3, y: 5 });
  await panel(page, "transform").getByLabel("Locked", { exact: true }).check();
  await expect(panel(page, "transform").getByLabel("Points", { exact: true })).toBeDisabled();
  await expect(panel(page, "transform").getByLabel("Inner radius", { exact: true })).toBeDisabled();
});

test("color panel: dash and end decorations edit a line, storing defaults as absence", async ({
  page,
}) => {
  await draw(page, "Line", { x: 1, y: 3 }, { x: 4, y: 3 });
  const colorPanel = panel(page, "color-swatches");
  const ends = colorPanel.getByRole("group", { name: "Line ends" });
  // Line detail belongs to the outline, so it rides the Outline target.
  await expect(ends).toHaveCount(0);
  await colorPanel.getByLabel("Outline", { exact: true }).check();
  await expect(ends.getByLabel("Dash", { exact: true })).toHaveValue("solid");

  await armCounter(page);
  await ends.getByLabel("Dash", { exact: true }).selectOption("dashed");
  expect(await notificationCount(page)).toBe(1);
  expect(lineAt(await pageObjects(page), 0).dash).toBe("dashed");
  await ends.getByLabel("End head", { exact: true }).selectOption("diamond");
  await ends.getByLabel("Head size", { exact: true }).selectOption("l");
  let line = lineAt(await pageObjects(page), 0);
  expect(line.headEnd).toBe("diamond");
  expect(line.headSize).toBe("l");
  // The schema's defaults store as ABSENCE, not as the written-out value.
  await ends.getByLabel("Dash", { exact: true }).selectOption("solid");
  await ends.getByLabel("Head size", { exact: true }).selectOption("m");
  await ends.getByLabel("End head", { exact: true }).selectOption("none");
  line = lineAt(await pageObjects(page), 0);
  expect(line.dash).toBeUndefined();
  expect(line.headSize).toBeUndefined();
  expect(line.headEnd).toBeUndefined();
});

test("color panel: an arrow's drawn heads show in the panel, and each pick is one undo step", async ({
  page,
}) => {
  await draw(page, "Arrow", { x: 1, y: 3 }, { x: 4, y: 3 });
  const colorPanel = panel(page, "color-swatches");
  await colorPanel.getByLabel("Outline", { exact: true }).check();
  const ends = colorPanel.getByRole("group", { name: "Line ends" });
  // The arrow tool draws headEnd "arrow" by contract; the panel reads it.
  await expect(ends.getByLabel("End head", { exact: true })).toHaveValue("arrow");
  await expect(ends.getByLabel("Start head", { exact: true })).toHaveValue("none");
  const before = await historyDepth(page);
  await ends.getByLabel("Start head", { exact: true }).selectOption("circle");
  expect(lineAt(await pageObjects(page), 0).headStart).toBe("circle");
  expect(await historyDepth(page)).toBe(before + 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const reverted = lineAt(await pageObjects(page), 0);
  expect(reverted.headStart).toBeUndefined();
  // Editing one end leaves the other exactly as it stood.
  expect(reverted.headEnd).toBe("arrow");
});

test("color panel: line-end controls stay hidden when no line is selected", async ({ page }) => {
  await draw(page, "Rectangle", { x: 1, y: 3 }, { x: 2, y: 4 });
  const colorPanel = panel(page, "color-swatches");
  await colorPanel.getByLabel("Outline", { exact: true }).check();
  await expect(colorPanel.getByRole("group", { name: "Line ends" })).toHaveCount(0);
  // Width still applies — a rect's outline has one, it just has no ends.
  await expect(colorPanel.getByLabel("Width", { exact: true })).toBeVisible();
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
