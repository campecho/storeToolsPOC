import { expect, test } from "@playwright/test";
import { dockTool } from "./helpers";

/**
 * The Phase A tool surface (PLAN.md §7): every tool visible in both docks
 * with its complete option set and written contract, nothing drawing yet.
 * All renderings come from the registry; these specs assert the surface, on
 * DOM this time — dock, options bar, and control panel are HTML, not canvas.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dock")).toBeVisible();
});

test("layout dock renders all 23 tools from the registry", async ({ page }) => {
  await expect(page.getByTestId("dock").locator(".dock-tool")).toHaveCount(23);
});

test("photo mode swaps to the photo dock and panel set", async ({ page }) => {
  // A layout-only tool cannot stay active across the switch: activate
  // Rectangle, switch modes, and the active tool falls back to Pan.
  await dockTool(page, "Rectangle").click();
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await expect(page.getByTestId("dock").locator(".dock-tool")).toHaveCount(9);
  await expect(page.getByTestId("control-panel").locator(".panel")).toHaveCount(6);
  await expect(dockTool(page, "Pan")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("options-bar")).toContainText("Pan");
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await expect(page.getByTestId("dock").locator(".dock-tool")).toHaveCount(23);
});

test("selecting a contracted tool shows its options and not-wired status", async ({ page }) => {
  await dockTool(page, "Text frame").click();
  const bar = page.getByTestId("options-bar");
  await expect(bar).toContainText("Text frame");
  await expect(bar.getByText("not wired yet")).toBeVisible();
  await expect(bar.locator(".option").first()).toBeVisible();
});

test("wired tools drop the chip and enable exactly their consumed options", async ({ page }) => {
  await dockTool(page, "Rectangle").click();
  const bar = page.getByTestId("options-bar");
  await expect(bar).toContainText("Rectangle");
  await expect(bar.getByText("not wired yet")).toHaveCount(0);
  await expect(bar.getByLabel("Fill", { exact: true })).toBeEnabled();
  await expect(bar.getByLabel("Stroke", { exact: true })).toBeEnabled();
  await expect(bar.getByLabel("Stroke width", { exact: true })).toBeEnabled();
  // Wired tools' options nothing consumes yet stay disabled (honest surface):
  // select consumes only nudgeIncrement.
  await dockTool(page, "Select").click();
  await expect(bar.getByLabel("Nudge", { exact: true })).toBeEnabled();
  await expect(bar.getByLabel("Show coordinates", { exact: true })).toBeDisabled();
  await expect(bar.getByLabel("Position relative to", { exact: true })).toBeDisabled();
});

test("registry shortcuts activate tools in the current mode", async ({ page }) => {
  await page.getByTestId("canvas-area").click();
  await page.keyboard.press("r");
  await expect(dockTool(page, "Rectangle")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("h");
  await expect(dockTool(page, "Pan")).toHaveAttribute("aria-pressed", "true");
});

test("control panel lists the layout panel set with tier chips", async ({ page }) => {
  const panels = page.getByTestId("control-panel").locator(".panel");
  await expect(panels).toHaveCount(26);
  await expect(page.getByTestId("control-panel").locator(".tier-chip").first()).toBeVisible();
});
