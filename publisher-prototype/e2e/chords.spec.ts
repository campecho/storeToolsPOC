import { expect, test, type Page } from "@playwright/test";
import {
  activate,
  armCounter,
  clickAt,
  dockTool,
  drag,
  draw,
  expectNear,
  notificationCount,
  pageObjects,
  screenPoint,
  selectionIds,
  shapeAt,
} from "./helpers";

/**
 * The global key chords (core/registry/globalKeys.ts): undo/redo, select all
 * and deselect, the object clipboard, keyboard duplicate, and the zoom keys.
 *
 * These belong to no tool, so what each test really asks is whether the chord
 * works from wherever the user happens to be — and, for the three that produce
 * a selection, whether the page comes back to the Select tool that can act on
 * it.
 */

function zoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().viewport.zoom;
  });
}

async function drawRect(page: Page): Promise<void> {
  await draw(page, "Rectangle", { x: 1, y: 3 }, { x: 2, y: 4 });
  await expect.poll(async () => (await pageObjects(page)).length).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas-area")).toBeVisible();
});

test("document.ctrl-z.undoes and document.ctrl-shift-z.redoes, leaving the view alone", async ({
  page,
}) => {
  await drawRect(page);
  await page.keyboard.press("Control+=");
  const zoomed = await zoom(page);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(0);
  // The zoom was never a history entry, so undoing the draw left it standing.
  expect(await zoom(page)).toBe(zoomed);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  // Publisher's redo chord reaches the same place.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(0);
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
});

test("document.ctrl-a.selects-all hands the page to Select, and Ctrl+Shift+A lets go", async ({
  page,
}) => {
  await drawRect(page);
  await draw(page, "Rectangle", { x: 3, y: 3 }, { x: 4, y: 4 });
  // Arm a DRAW tool: the chord has to work with any tool active, and the
  // selection it makes is only visible once Select is armed again.
  await activate(page, "Ellipse");
  await page.keyboard.press("Control+a");
  await expect.poll(() => selectionIds(page)).toHaveLength(2);
  await expect(dockTool(page, "Select")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Control+Shift+a");
  await expect.poll(() => selectionIds(page)).toHaveLength(0);
});

test("document.ctrl-c.copies-selection and document.ctrl-v.pastes-clipboard, cascading", async ({
  page,
}) => {
  await drawRect(page);
  await page.keyboard.press("Control+c");
  // Copying changes no document, so it is not a history entry.
  await armCounter(page);
  await page.keyboard.press("Control+v");
  expect(await notificationCount(page)).toBe(1);
  await expect.poll(async () => (await pageObjects(page)).length).toBe(2);
  const first = shapeAt(await pageObjects(page), 1);
  expectNear(first.x, 1.25);
  expectNear(first.y, 3.25);
  // The paste lands selected, and the second one steps further so it cannot
  // hide under the first.
  await expect.poll(() => selectionIds(page)).toEqual([first.id]);
  await page.keyboard.press("Control+v");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(3);
  const second = shapeAt(await pageObjects(page), 2);
  expectNear(second.x, 1.5);
  expectNear(second.y, 3.5);
  expect(second.id).not.toBe(first.id);
});

test("document.ctrl-x.cuts-selection: the objects go, the clipboard keeps them", async ({
  page,
}) => {
  await drawRect(page);
  await page.keyboard.press("Control+x");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(0);
  // Undo restores what the cut deleted…
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(1);
  // …and the clipboard still holds it, so a paste adds a second.
  await page.keyboard.press("Control+v");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(2);
});

test("document.ctrl-d.duplicates-selection without touching the clipboard", async ({ page }) => {
  await drawRect(page);
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+d");
  await expect.poll(async () => (await pageObjects(page)).length).toBe(2);
  const copy = shapeAt(await pageObjects(page), 1);
  expectNear(copy.x, 1.25);
  expectNear(copy.y, 3.25);
  await expect.poll(() => selectionIds(page)).toEqual([copy.id]);
  // The clipboard still holds the ORIGINAL: pasting now lands where a paste
  // of that first copy would, not where another duplicate would.
  await page.keyboard.press("Control+v");
  const pasted = shapeAt(await pageObjects(page), 2);
  expectNear(pasted.x, 1.25);
  expectNear(pasted.y, 3.25);
});

test("select.shift-arrow.nudges-coarse steps ten times the increment", async ({ page }) => {
  await drawRect(page);
  await activate(page, "Select");
  await clickAt(page, { x: 1.5, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  await armCounter(page);
  await page.keyboard.press("Shift+ArrowRight");
  // Still one gesture, one history entry — Shift changes the step, not the
  // shape of the commit.
  expect(await notificationCount(page)).toBe(1);
  const rect = shapeAt(await pageObjects(page), 0);
  expectNear(rect.x, 2);
  expectNear(rect.y, 3);
});

test("the zoom chords step the ladder and fit the page", async ({ page }) => {
  expect(await zoom(page)).toBe(1);
  await page.keyboard.press("Control+=");
  await expect.poll(() => zoom(page)).toBe(1.25);
  await page.keyboard.press("Control+-");
  await expect.poll(() => zoom(page)).toBe(1);
  await page.keyboard.press("Control+0");
  const fitted = await zoom(page);
  expect(fitted).not.toBe(1);
  // The chord and the debug bar's Fit control agree, being the same commit.
  await page.keyboard.press("Control+=");
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  expect(await zoom(page)).toBe(fitted);
});

test("a chord never fires mid-drag", async ({ page }) => {
  await drawRect(page);
  await activate(page, "Select");
  await clickAt(page, { x: 1.5, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  const from = await screenPoint(page, { x: 1.5, y: 3.5 });
  const to = await screenPoint(page, { x: 4.5, y: 3.5 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  // Undo here would edit the page under a gesture that has not committed yet.
  await page.keyboard.press("Control+z");
  await page.mouse.up();
  const moved = shapeAt(await pageObjects(page), 0);
  expectNear(moved.x, 4);
  // Released, the same chord works — and takes the move with it.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => shapeAt(await pageObjects(page), 0).x).toBeCloseTo(1, 3);
});

test("a chord never fires while a field has focus", async ({ page }) => {
  await drawRect(page);
  await activate(page, "Select");
  await clickAt(page, { x: 1.5, y: 3.5 });
  await expect.poll(() => selectionIds(page)).toHaveLength(1);
  const nudge = page.getByTestId("options-bar").getByLabel("Nudge", { exact: true });
  await nudge.focus();
  // Ctrl+A in a number field selects its text; it must not reach the canvas,
  // and Ctrl+D must not duplicate behind the user's back.
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+d");
  expect((await pageObjects(page)).length).toBe(1);
  // Drawing still works afterwards — the guard suppressed nothing lasting.
  await drag(page, { x: 5, y: 5 }, { x: 6, y: 6 });
});
