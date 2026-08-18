import { expect, test } from "@playwright/test";
import {
  activate,
  armCounter,
  drag,
  expectNear,
  lineAt,
  notificationCount,
  pageObjects,
  screenPoint,
} from "./helpers";

/**
 * Arrow-tool gesture-clause tests plus the line tool's newly-consumed dash
 * option (PLAN.md §5): titles are VERBATIM registry clause ids. Konva renders
 * to canvas, so assertions run against store state via the dev handle; the
 * store-notification counter proves the §6.3 rule — gesture state lives
 * outside the store and exactly one action commits per completed gesture.
 *
 * The arrow tool commits a schema line object; defaults are OMITTED on the
 * committed object (absent headStart = none, absent headSize = m, absent
 * dash = solid), so untouched options leave only headEnd: "arrow" present.
 *
 * Coordinates are document inches, converted to screen px through the live
 * store's viewport state (the default view shows roughly x −0.4…8.9,
 * y 2.3…8.7 — tests stay inside that band).
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas-area")).toBeVisible();
});

test("arrow.drag.creates", async ({ page }) => {
  await activate(page, "Arrow");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const line = lineAt(await pageObjects(page), 0);
  expectNear(line.x1, 1);
  expectNear(line.y1, 3);
  expectNear(line.x2, 3);
  expectNear(line.y2, 4);
  // The contract's end-head default is stored; the other defaults are
  // omitted on the committed object (absent = none / m / solid).
  expect(line.headEnd).toBe("arrow");
  expect(line.headStart).toBeUndefined();
  expect(line.headSize).toBeUndefined();
  expect(line.dash).toBeUndefined();
});

test("arrow.shift-drag.constrains-angle", async ({ page }) => {
  await activate(page, "Arrow");
  // Near-horizontal drag snaps to 0°: the committed endpoints share a y.
  await drag(page, { x: 2, y: 4 }, { x: 3.9, y: 4.2 }, ["Shift"]);
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  const line = lineAt(await pageObjects(page), 0);
  expectNear(line.x1, 2);
  expectNear(line.y1, 4);
  expectNear(line.x2, 3.9);
  expectNear(line.y2, 4);
});

test("arrow.drag.creates honors head and dash options", async ({ page }) => {
  await activate(page, "Arrow");
  // Options are set BEFORE drawing; the commit snapshots the live values.
  const optionsBar = page.getByTestId("options-bar");
  await optionsBar.getByLabel("Start head", { exact: true }).selectOption("circle");
  await optionsBar.getByLabel("End head", { exact: true }).selectOption("diamond");
  await optionsBar.getByLabel("Head size", { exact: true }).selectOption("l");
  await optionsBar.getByLabel("Dash", { exact: true }).selectOption("dashed");
  await armCounter(page);
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  expect(await notificationCount(page)).toBe(1);
  const line = lineAt(await pageObjects(page), 0);
  expect(line.headStart).toBe("circle");
  expect(line.headEnd).toBe("diamond");
  expect(line.headSize).toBe("l");
  expect(line.dash).toBe("dashed");
});

test("arrow.esc.cancels-draw", async ({ page }) => {
  await activate(page, "Arrow");
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

test("line.drag.creates honors the live dash option", async ({ page }) => {
  const dashOption = () => page.getByTestId("options-bar").getByLabel("Dash", { exact: true });
  await activate(page, "Line");
  await dashOption().selectOption("dotted");
  await drag(page, { x: 1, y: 5 }, { x: 3, y: 5.5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  const dotted = lineAt(await pageObjects(page), 0);
  expect(dotted.dash).toBe("dotted");
  // The draw handed the page back to Select, so the bar now shows the select
  // tool: pick the line up again to reach its options. Option values are held
  // per tool, so the dotted choice is still the one showing.
  await activate(page, "Line");
  await expect(dashOption()).toHaveValue("dotted");
  // Switching back to solid stores the default as ABSENT on the commit.
  await dashOption().selectOption("solid");
  await drag(page, { x: 1, y: 6.5 }, { x: 3, y: 7 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(2);
  const solid = lineAt(await pageObjects(page), 1);
  expect(solid.dash).toBeUndefined();
});

test("draw an arrow then undo returns to the empty page — one history entry", async ({
  page,
}) => {
  await activate(page, "Arrow");
  await drag(page, { x: 1, y: 3 }, { x: 3, y: 4 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  const pastDepth = await page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().document.past.length;
  });
  expect(pastDepth).toBe(1);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await undo.click();
  expect((await pageObjects(page)).length).toBe(0);
  await expect(undo).toBeDisabled();
});
