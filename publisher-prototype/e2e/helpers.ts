import { expect, type Page } from "@playwright/test";
import type { LayoutObject, LineObject, ShapeObject } from "../src/core/model";

/**
 * Shared Playwright helpers (PLAN.md §5 testing note): Konva renders to
 * canvas, so specs drive real pointer/keyboard input and assert on store
 * state via the dev handle. Coordinates are document inches converted
 * through the live store's viewport state; the store-notification counter
 * proves one dispatched action per completed gesture or panel commit.
 */

export type DocPoint = { x: number; y: number };

export async function canvasBox(page: Page) {
  const box = await page.getByTestId("canvas-area").boundingBox();
  if (!box) throw new Error("canvas area not visible");
  return box;
}

/** Doc inches → page screen px, mirroring core/geometry/viewport.ts
    pageOriginPx/docToScreen against the live store state (zoom, pan, page
    size) rather than hardcoding a frame. */
export async function screenPoint(page: Page, pt: DocPoint): Promise<DocPoint> {
  const box = await canvasBox(page);
  const local = await page.evaluate(
    ({ vpW, vpH, x, y }) => {
      const store = window.__PROTOTYPE_STORE__;
      if (!store) throw new Error("dev store handle missing");
      const state = store.getState();
      const { zoom, pan } = state.viewport;
      const size = state.document.present.size;
      const DPI = 96;
      const originX = vpW / 2 + pan.x - (size.w * DPI * zoom) / 2;
      const originY = vpH / 2 + pan.y - (size.h * DPI * zoom) / 2;
      return { x: originX + x * DPI * zoom, y: originY + y * DPI * zoom };
    },
    { vpW: box.width, vpH: box.height, x: pt.x, y: pt.y },
  );
  return { x: box.x + local.x, y: box.y + local.y };
}

/** A dock button, found by the tool's NAME. Dock buttons read
    "Label (Shortcut)", or just "Label" when the tool is dock-only, so the
    match anchors on the label and lets an optional shortcut follow: a spec
    names the tool it means, not the key it happens to carry, and rebinding —
    or removing — a shortcut moves no test. The label must still end there,
    so "Crop" never matches "Crop & straighten". */
export function dockTool(page: Page, toolLabel: string) {
  const label = toolLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByTestId("dock").getByRole("button", { name: new RegExp(`^${label}( \\(|$)`) });
}

export async function activate(page: Page, toolLabel: string): Promise<void> {
  await dockTool(page, toolLabel).click();
}

export async function drag(
  page: Page,
  from: DocPoint,
  to: DocPoint,
  modifiers: ("Shift" | "Alt")[] = [],
): Promise<void> {
  const a = await screenPoint(page, from);
  const b = await screenPoint(page, to);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  for (const m of modifiers) await page.keyboard.up(m);
}

/**
 * Draw one object with a named tool — activate, then drag.
 *
 * Every draw needs its OWN activation: a committed draw hands the page back
 * to the select tool (App's onObjectDrawn), so a draw tool is never still
 * armed for the next shape. Specs that place several objects say so once
 * through this helper rather than repeating the pair.
 */
export async function draw(
  page: Page,
  toolLabel: string,
  from: DocPoint,
  to: DocPoint,
  modifiers: ("Shift" | "Alt")[] = [],
): Promise<void> {
  await activate(page, toolLabel);
  await drag(page, from, to, modifiers);
}

export async function clickAt(
  page: Page,
  pt: DocPoint,
  modifiers: ("Shift" | "Alt")[] = [],
): Promise<void> {
  const p = await screenPoint(page, pt);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.click(p.x, p.y);
  for (const m of modifiers) await page.keyboard.up(m);
}

/** Drag starting from a selection-chrome handle (resize/rotate targets). */
export async function dragHandle(
  page: Page,
  handle: string,
  to: DocPoint | { dxPx: number; dyPx: number },
  modifiers: ("Shift" | "Alt")[] = [],
): Promise<void> {
  const box = await page.locator(`[data-handle="${handle}"]`).boundingBox();
  if (!box) throw new Error(`handle ${handle} not visible`);
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const target =
    "dxPx" in to ? { x: from.x + to.dxPx, y: from.y + to.dyPx } : await screenPoint(page, to);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  for (const m of modifiers) await page.keyboard.up(m);
}

/** Store-notification counter (canvas.spec.ts pattern): the in-flight
    preview must live outside the store, so a completed gesture notifies
    subscribers exactly once per dispatched action. */
export async function armCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    const counter = { count: 0 };
    store.subscribe(() => {
      counter.count++;
    });
    Object.assign(window, { __STORE_NOTIFICATIONS__: counter });
  });
}

export function notificationCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __STORE_NOTIFICATIONS__: { count: number } }).__STORE_NOTIFICATIONS__
        .count,
  );
}

export function pageObjects(page: Page): Promise<LayoutObject[]> {
  return page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().document.present.pages[0]?.objects ?? [];
  });
}

export function selectionIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().selection.ids;
  });
}

/** The group the selection has descended into; null at the top level. */
export function enteredGroupId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().selection.enteredGroupId;
  });
}

export async function doubleClickAt(page: Page, pt: DocPoint): Promise<void> {
  const p = await screenPoint(page, pt);
  await page.mouse.dblclick(p.x, p.y);
}

/** A frame object's centre — the point a rigid-body rotation orbits. */
export function centerOf(obj: { x: number; y: number; w: number; h: number }): DocPoint {
  return { x: obj.x + obj.w / 2, y: obj.y + obj.h / 2 };
}

export function shapeAt(objects: LayoutObject[], index: number): ShapeObject {
  const obj = objects[index];
  if (!obj || obj.type !== "shape") throw new Error(`expected shape at index ${index}`);
  return obj;
}

export function lineAt(objects: LayoutObject[], index: number): LineObject {
  const obj = objects[index];
  if (!obj || obj.type !== "line") throw new Error(`expected line at index ${index}`);
  return obj;
}

/** Dragged bounds land within ±0.01 in of the pointer's doc coordinates. */
export function expectNear(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.01);
}
