import { expect, test, type Page } from "@playwright/test";
import {
  activate,
  armCounter,
  centerOf,
  clickAt,
  doubleClickAt,
  drag,
  dragHandle,
  enteredGroupId,
  notificationCount,
  pageObjects,
  selectionIds,
  shapeAt,
} from "./helpers";

/**
 * Group selection and group rotation (PLAN.md §5.1; the schema-v3 grouping
 * model of record — `doc.groups` plus each object's `groupId`). A group is a
 * selection UNIT: it selects whole, transforms whole, and only lets go of its
 * members once it is entered.
 *
 * Nothing creates groups on the canvas yet, so the document arrives through
 * the debug bar's import door — the same parse path every fixture takes.
 */

const GREY = { kind: "color", color: { space: "rgb", values: [0.8, 0.8, 0.8] } };

function rect(id: string, x: number, groupId?: string) {
  return {
    id,
    type: "shape",
    shape: "rect",
    x,
    y: 4,
    w: 1,
    h: 1,
    rotation: 0,
    locked: false,
    fill: GREY,
    stroke: null,
    ...(groupId === undefined ? {} : { groupId }),
  };
}

/** "left" and "right" are one group 3in apart; "loose" belongs to nothing. */
const GROUPED_DOCUMENT = {
  version: 3,
  kind: "layout",
  name: "Grouped",
  size: { w: 8.5, h: 11 },
  orientation: "portrait",
  bleed: 0.125,
  margin: 0.5,
  slug: 0,
  columns: 1,
  pages: [
    {
      id: "page-1",
      masterId: null,
      objects: [rect("left", 1, "grp-1"), rect("right", 4, "grp-1"), rect("loose", 6.5)],
    },
  ],
  masters: [],
  layers: [
    {
      id: "layer-1",
      name: "Layer 1",
      color: "#4A90D9",
      visible: true,
      locked: false,
      printing: true,
      opacity: 1,
      blend: "normal",
    },
  ],
  sections: [],
  anchors: [],
  paragraphStyles: [],
  characterStyles: [],
  swatches: [],
  groups: [{ id: "grp-1" }],
  fonts: [],
  assets: {},
  guides: { v: [], h: [] },
};

const LEFT = { x: 1.5, y: 4.5 };
const LOOSE = { x: 7, y: 4.5 };

/** How many groups the document holds — what group/ungroup commits move. */
function groupCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().document.present.groups.length;
  });
}

async function loadGroupedDocument(page: Page): Promise<void> {
  await page.getByLabel("Import document file").setInputFiles({
    name: "grouped.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(GROUPED_DOCUMENT)),
  });
  await expect.poll(async () => (await pageObjects(page)).length).toBe(3);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas-area")).toBeVisible();
  await loadGroupedDocument(page);
  await activate(page, "Select");
});

test("a click on one member selects the whole group", async ({ page }) => {
  await clickAt(page, LEFT);
  await expect.poll(() => selectionIds(page)).toEqual(["left", "right"]);
  // An ungrouped object still selects alone.
  await clickAt(page, LOOSE);
  await expect.poll(() => selectionIds(page)).toEqual(["loose"]);
});

test("a marquee touching one member takes the whole group", async ({ page }) => {
  // The swept rect covers "left" only; "right" joins through the group.
  await drag(page, { x: 0.5, y: 3.5 }, { x: 2.5, y: 5.5 });
  await expect.poll(() => selectionIds(page)).toEqual(["left", "right"]);
});

test("Shift-click adds and removes a group whole", async ({ page }) => {
  await clickAt(page, LOOSE);
  await clickAt(page, LEFT, ["Shift"]);
  await expect.poll(() => selectionIds(page)).toEqual(["loose", "left", "right"]);
  await clickAt(page, LEFT, ["Shift"]);
  await expect.poll(() => selectionIds(page)).toEqual(["loose"]);
});

test("the rotation handle turns a group as one body, members orbiting the pivot", async ({
  page,
}) => {
  await clickAt(page, LEFT);
  await expect.poll(() => selectionIds(page)).toHaveLength(2);
  // The group's frame is the union AABB (1,4)–(5,5); its centre (3, 4.5) is
  // the pivot both members swing about.
  await armCounter(page);
  await dragHandle(page, "rotate", { x: 5, y: 4.5 });
  expect(await notificationCount(page)).toBe(1);
  const objects = await pageObjects(page);
  const left = shapeAt(objects, 0);
  const right = shapeAt(objects, 1);
  expect(Math.abs(left.rotation - 90)).toBeLessThanOrEqual(1);
  expect(Math.abs(right.rotation - 90)).toBeLessThanOrEqual(1);
  // The pair keeps its 3in separation and its midpoint, standing vertical
  // where it stood horizontal — the group held together through the turn.
  const a = centerOf(left);
  const b = centerOf(right);
  expect(Math.abs(b.x - a.x)).toBeLessThanOrEqual(0.06);
  expect(Math.abs(Math.abs(b.y - a.y) - 3)).toBeLessThanOrEqual(0.06);
  expect(Math.abs((a.x + b.x) / 2 - 3)).toBeLessThanOrEqual(0.06);
  expect(Math.abs((a.y + b.y) / 2 - 4.5)).toBeLessThanOrEqual(0.06);
  // The ungrouped object was never part of it.
  expect(shapeAt(objects, 2)).toMatchObject({ x: 6.5, y: 4, rotation: 0 });
});

test("select.double-click-group.enters-group: the member then selects and turns alone", async ({
  page,
}) => {
  await clickAt(page, LEFT);
  await expect.poll(() => selectionIds(page)).toHaveLength(2);
  await doubleClickAt(page, LEFT);
  await expect.poll(() => enteredGroupId(page)).toBe("grp-1");
  await expect.poll(() => selectionIds(page)).toEqual(["left"]);
  // Inside the group the frame hugs the one member, so its own centre is the
  // pivot: it turns in place and its neighbour does not move at all.
  await dragHandle(page, "rotate", { x: 2.5, y: 4.5 });
  const objects = await pageObjects(page);
  const left = shapeAt(objects, 0);
  expect(Math.abs(left.rotation - 90)).toBeLessThanOrEqual(1);
  const a = centerOf(left);
  expect(Math.abs(a.x - 1.5)).toBeLessThanOrEqual(0.02);
  expect(Math.abs(a.y - 4.5)).toBeLessThanOrEqual(0.02);
  expect(shapeAt(objects, 1)).toMatchObject({ x: 4, y: 4, rotation: 0 });
});

test("clicking outside the entered group leaves it, and the group selects whole again", async ({
  page,
}) => {
  await clickAt(page, LEFT);
  await doubleClickAt(page, LEFT);
  await expect.poll(() => enteredGroupId(page)).toBe("grp-1");
  await clickAt(page, LOOSE);
  await expect.poll(() => enteredGroupId(page)).toBeNull();
  await clickAt(page, LEFT);
  await expect.poll(() => selectionIds(page)).toEqual(["left", "right"]);
});

test("select.ctrl-g.groups-selection: Ctrl+G binds a selection into one group", async ({ page }) => {
  await clickAt(page, LOOSE);
  await clickAt(page, LEFT, ["Shift"]);
  await expect.poll(() => selectionIds(page)).toEqual(["loose", "left", "right"]);
  await armCounter(page);
  await page.keyboard.press("Control+g");
  expect(await notificationCount(page)).toBe(1);
  // One group now holds all three: clicking any member takes the whole thing.
  await clickAt(page, { x: 0.2, y: 6.5 });
  await clickAt(page, LEFT);
  await expect.poll(() => selectionIds(page)).toHaveLength(3);
  // …and it turns as one body, which is the point of grouping.
  await dragHandle(page, "rotate", { x: 8, y: 4.5 });
  const objects = await pageObjects(page);
  for (const i of [0, 1, 2]) {
    expect(Math.abs(shapeAt(objects, i).rotation - 90)).toBeLessThanOrEqual(1);
  }
});

test("Ctrl+G nests a group already in the selection instead of flattening it", async ({ page }) => {
  await clickAt(page, LEFT);
  await clickAt(page, LOOSE, ["Shift"]);
  await page.keyboard.press("Control+g");
  await expect.poll(() => groupCount(page)).toBe(2);
  // grp-1 survives inside the new group: entering the outer one selects it
  // whole rather than dropping straight to a member.
  await doubleClickAt(page, LEFT);
  await expect.poll(() => selectionIds(page)).toEqual(["left", "right"]);
});

test("Ctrl+G needs two units — one group re-grouped alone commits nothing", async ({ page }) => {
  await clickAt(page, LEFT);
  await armCounter(page);
  await page.keyboard.press("Control+g");
  await page.keyboard.press("Control+g");
  expect(await notificationCount(page)).toBe(0);
  expect(await groupCount(page)).toBe(1);
});

test("select.ctrl-shift-g.ungroups-selection: Ctrl+Shift+G takes the group apart", async ({
  page,
}) => {
  await clickAt(page, LEFT);
  await expect.poll(() => selectionIds(page)).toHaveLength(2);
  await armCounter(page);
  await page.keyboard.press("Control+Shift+g");
  expect(await notificationCount(page)).toBe(1);
  await expect.poll(() => groupCount(page)).toBe(0);
  // The freed objects stay selected, and each now selects alone.
  await expect.poll(() => selectionIds(page)).toEqual(["left", "right"]);
  await clickAt(page, LEFT);
  await expect.poll(() => selectionIds(page)).toEqual(["left"]);
});

test("Ctrl+Shift+G removes one nesting level, leaving the inner group standing", async ({
  page,
}) => {
  await clickAt(page, LEFT);
  await clickAt(page, LOOSE, ["Shift"]);
  await page.keyboard.press("Control+g");
  await expect.poll(() => groupCount(page)).toBe(2);
  await page.keyboard.press("Control+Shift+g");
  await expect.poll(() => groupCount(page)).toBe(1);
  // grp-1 outlived its wrapper: its members still select together.
  await clickAt(page, { x: 0.2, y: 6.5 });
  await clickAt(page, LEFT);
  await expect.poll(() => selectionIds(page)).toEqual(["left", "right"]);
});

test("grouping and ungrouping are each one undo step", async ({ page }) => {
  await clickAt(page, LEFT);
  await clickAt(page, LOOSE, ["Shift"]);
  await page.keyboard.press("Control+g");
  await expect.poll(() => groupCount(page)).toBe(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => groupCount(page)).toBe(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => groupCount(page)).toBe(2);
});

test("the chrome shows grouped status: a group outlines its members, a multi-selection does not", async ({
  page,
}) => {
  await clickAt(page, LEFT);
  await expect.poll(() => selectionIds(page)).toHaveLength(2);
  await expect(page.getByTestId("group-members")).toBeVisible();
  // The same two objects held as an ad-hoc selection look like a selection.
  await page.keyboard.press("Control+Shift+g");
  await expect.poll(() => groupCount(page)).toBe(0);
  await clickAt(page, LEFT);
  await clickAt(page, { x: 4.5, y: 4.5 }, ["Shift"]);
  await expect.poll(() => selectionIds(page)).toHaveLength(2);
  await expect(page.getByTestId("group-members")).toBeHidden();
});

test("an empty-canvas click clears the selection and the entered group with it", async ({
  page,
}) => {
  await clickAt(page, LEFT);
  await doubleClickAt(page, LEFT);
  await expect.poll(() => enteredGroupId(page)).toBe("grp-1");
  await clickAt(page, { x: 0.2, y: 6.5 });
  await expect.poll(() => selectionIds(page)).toEqual([]);
  await expect.poll(() => enteredGroupId(page)).toBeNull();
});
