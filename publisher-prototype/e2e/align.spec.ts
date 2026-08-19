import { expect, test, type Page } from "@playwright/test";
import {
  activate,
  armCounter,
  clickAt,
  drag,
  draw,
  expectNear,
  notificationCount,
  pageObjects,
  selectionIds,
  shapeAt,
} from "./helpers";

/**
 * Align & distribute panel (live control panel, panels.spec.ts conventions):
 * each button press dispatches EXACTLY ONE store action — an
 * object/resizeCommitted with absolute boxes — so one press is one history
 * entry and one undo restores every moved object at once. Alignment moves
 * AABBs without changing sizes. The "Align to" reference targets the
 * selection bounds, the page (x∈[0,8.5], y∈[0,11]), or the margins
 * (x∈[0.5,8], y∈[0.5,10.5]) of the default 8.5×11 document at margin 0.5.
 */

function panel(page: Page) {
  return page.getByTestId("align-distribute-panel");
}

function alignButton(page: Page, name: string) {
  return panel(page).getByRole("button", { name, exact: true });
}

function referenceSelect(page: Page) {
  return panel(page).getByLabel("Align to", { exact: true });
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

test("align left/right/top and center align selected AABBs — one action, one undo step per press", async ({
  page,
}) => {
  await draw(page, "Rectangle", { x: 1, y: 3 }, { x: 2, y: 4 });
  await draw(page, "Rectangle", { x: 3, y: 4 }, { x: 4, y: 6 });
  await draw(page, "Rectangle", { x: 5, y: 5 }, { x: 6, y: 5.5 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(3);
  await activate(page, "Select");
  await drag(page, { x: 0.7, y: 2.7 }, { x: 6.3, y: 6.3 });
  await expect.poll(() => selectionIds(page)).toHaveLength(3);

  await armCounter(page);
  await alignButton(page, "Align left").click();
  expect(await notificationCount(page)).toBe(1);
  let objects = await pageObjects(page);
  expectNear(shapeAt(objects, 0).x, 1);
  expectNear(shapeAt(objects, 1).x, 1);
  expectNear(shapeAt(objects, 2).x, 1);
  // Sizes never change on align.
  expectNear(shapeAt(objects, 1).w, 1);
  expectNear(shapeAt(objects, 1).h, 2);

  await alignButton(page, "Align top").click();
  objects = await pageObjects(page);
  expectNear(shapeAt(objects, 0).y, 3);
  expectNear(shapeAt(objects, 1).y, 3);
  expectNear(shapeAt(objects, 2).y, 3);

  await alignButton(page, "Align right").click();
  objects = await pageObjects(page);
  const rightEdge = (i: number) => shapeAt(objects, i).x + shapeAt(objects, i).w;
  expectNear(rightEdge(1), rightEdge(0));
  expectNear(rightEdge(2), rightEdge(0));

  await alignButton(page, "Align middle").click();
  objects = await pageObjects(page);
  const vCenter = (i: number) => shapeAt(objects, i).y + shapeAt(objects, i).h / 2;
  expectNear(vCenter(1), vCenter(0));
  expectNear(vCenter(2), vCenter(0));

  // 3 draw commits + 4 align commits = depth 7; each press is one undo step.
  expect(await historyDepth(page)).toBe(7);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await undo.click();
  await undo.click();
  await undo.click();
  await undo.click();
  expect(await historyDepth(page)).toBe(3);
  const first = shapeAt(await pageObjects(page), 0);
  expectNear(first.x, 1);
  expectNear(first.y, 3);
});

test("distribute horizontally equalizes gaps and preserves sizes", async ({ page }) => {
  await draw(page, "Rectangle", { x: 1, y: 3 }, { x: 2, y: 4 });
  await draw(page, "Rectangle", { x: 2.5, y: 3 }, { x: 3.5, y: 4 });
  await draw(page, "Rectangle", { x: 6, y: 3 }, { x: 8, y: 4 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(3);
  await activate(page, "Select");
  await drag(page, { x: 0.7, y: 2.7 }, { x: 7.5, y: 4.4 });
  await expect.poll(() => selectionIds(page)).toHaveLength(3);

  await alignButton(page, "Distribute horizontally").click();
  const objects = await pageObjects(page);
  // Span 1→8 = 7 in, extents 1+1+2 = 4 in, so each gap is (7−4)/2 = 1.5 in:
  // x lands at 1, 3.5 (= 1+1+1.5), and 6 (right edge stays 8).
  expectNear(shapeAt(objects, 0).x, 1);
  expectNear(shapeAt(objects, 1).x, 3.5);
  expectNear(shapeAt(objects, 2).x, 6);
  expectNear(shapeAt(objects, 0).w, 1);
  expectNear(shapeAt(objects, 1).w, 1);
  expectNear(shapeAt(objects, 2).w, 2);
});

test("align to page and margins reference the document geometry", async ({ page }) => {
  await activate(page, "Rectangle");
  await drag(page, { x: 2, y: 3 }, { x: 3, y: 4 });
  await activate(page, "Select");
  await clickAt(page, { x: 2.5, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);

  await referenceSelect(page).selectOption("page");
  await alignButton(page, "Align left").click();
  let rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 0);
  await alignButton(page, "Align top").click();
  rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.y, 0);

  await referenceSelect(page).selectOption("margins");
  await alignButton(page, "Align left").click();
  rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 0.5);
  await alignButton(page, "Align bottom").click();
  rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.y + rect.h, 10.5);
});

test("enablement follows the reference and the selection count", async ({ page }) => {
  const allButtons = [
    "Align left",
    "Align center",
    "Align right",
    "Align top",
    "Align middle",
    "Align bottom",
    "Distribute horizontally",
    "Distribute vertically",
  ];
  const alignNames = allButtons.slice(0, 6);

  // Nothing selected: everything is disabled.
  for (const name of allButtons) {
    await expect(alignButton(page, name)).toBeDisabled();
  }

  // The "guides" reference is present but not yet available. (Asserted via
  // the attribute: toBeDisabled() does not treat <option disabled> inside a
  // closed native select as disabled.)
  await expect(referenceSelect(page).locator('option[value="guides"]')).toHaveAttribute(
    "disabled",
    "",
  );

  await activate(page, "Rectangle");
  await drag(page, { x: 1, y: 3 }, { x: 2, y: 4 });
  await activate(page, "Select");
  await clickAt(page, { x: 1.5, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);

  // One object relative to the selection is a no-op — disabled.
  for (const name of alignNames) {
    await expect(alignButton(page, name)).toBeDisabled();
  }
  // …but one object CAN align to the page.
  await referenceSelect(page).selectOption("page");
  for (const name of alignNames) {
    await expect(alignButton(page, name)).toBeEnabled();
  }
  // Distribution needs three regardless of the reference.
  await expect(alignButton(page, "Distribute horizontally")).toBeDisabled();
  await expect(alignButton(page, "Distribute vertically")).toBeDisabled();

  await draw(page, "Rectangle", { x: 3, y: 4 }, { x: 4, y: 5 });
  await draw(page, "Rectangle", { x: 5, y: 5 }, { x: 6, y: 6 });
  await activate(page, "Select");
  await drag(page, { x: 0.7, y: 2.7 }, { x: 6.3, y: 6.3 });
  await expect.poll(() => selectionIds(page)).toHaveLength(3);

  await expect(alignButton(page, "Distribute horizontally")).toBeEnabled();
  await expect(alignButton(page, "Distribute vertically")).toBeEnabled();
  await referenceSelect(page).selectOption("selection");
  for (const name of alignNames) {
    await expect(alignButton(page, name)).toBeEnabled();
  }
});

test("locked objects are skipped by selection and never move", async ({ page }) => {
  await draw(page, "Rectangle", { x: 1, y: 3 }, { x: 2, y: 4 });
  await draw(page, "Rectangle", { x: 4, y: 5 }, { x: 5, y: 6 });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(2);
  await activate(page, "Select");
  await clickAt(page, { x: 4.5, y: 5.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  await page.getByTestId("transform-panel").getByLabel("Locked", { exact: true }).check();
  expect(shapeAt(await pageObjects(page), 1).locked).toBe(true);

  // The marquee skips locked objects, so only the unlocked rect joins.
  await drag(page, { x: 0.7, y: 2.7 }, { x: 5.3, y: 6.3 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);

  await referenceSelect(page).selectOption("page");
  await alignButton(page, "Align left").click();
  const objects = await pageObjects(page);
  expectNear(shapeAt(objects, 0).x, 0);
  expectNear(shapeAt(objects, 1).x, 4);
});

test("a callout aligns by its visual bounds, tail included", async ({ page }) => {
  // Draw a callout, then swing its tail well to the left of the body through
  // the panel — the same free tip the yellow handle sets.
  await draw(page, "Callout", { x: 3, y: 4 }, { x: 5, y: 5 });
  await page.getByTestId("transform-panel").getByLabel("Tail X", { exact: true }).fill("-0.5");
  await page
    .getByTestId("transform-panel")
    .getByLabel("Tail X", { exact: true })
    .press("Enter");
  await expect
    .poll(async () => shapeAt(await pageObjects(page), 0).tailTip?.x)
    .toBeCloseTo(-0.5, 6);
  await referenceSelect(page).selectOption("margins");
  await armCounter(page);
  await alignButton(page, "Align left").click();
  expect(await notificationCount(page)).toBe(1);
  // The frame is 2in wide and the tail reaches 0.5 box-lengths — 1in — beyond
  // its left edge, so aligning to the 0.5in margin puts the TAIL on the
  // margin and the body an inch inside it. Aligning the frame alone would
  // have parked the body on 0.5 and hung the tail off the page.
  const callout = shapeAt(await pageObjects(page), 0);
  expectNear(callout.x, 1.5);
  expectNear(callout.w, 2);
});
