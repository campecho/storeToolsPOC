import { expect, test } from "@playwright/test";

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

test("layout dock renders all 24 tools from the registry", async ({ page }) => {
  await expect(page.getByTestId("dock").locator(".dock-tool")).toHaveCount(24);
});

test("photo mode swaps to the photo dock and panel set", async ({ page }) => {
  // A layout-only tool cannot stay active across the switch: activate
  // Rectangle, switch modes, and the active tool falls back to Pan.
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await expect(page.getByTestId("dock").locator(".dock-tool")).toHaveCount(9);
  await expect(page.getByTestId("control-panel").locator(".panel")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Pan", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("options-bar")).toContainText("Pan");
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await expect(page.getByTestId("dock").locator(".dock-tool")).toHaveCount(24);
});

test("shape presentation toggles between individual slots and one flyout slot", async ({ page }) => {
  await expect(page.getByTestId("shape-flyout")).toHaveCount(0);
  await page.getByLabel("shape flyout").check();
  await expect(page.getByTestId("shape-flyout")).toBeVisible();
  await expect(page.getByTestId("dock").locator(".dock-tool")).toHaveCount(24 - 10 + 1);
  await page.getByRole("button", { name: "More shape tools" }).click();
  await expect(page.getByTestId("shape-flyout").locator(".dock-flyout-menu .dock-tool")).toHaveCount(10);
});

test("selecting a contracted tool shows its options and not-wired status", async ({ page }) => {
  await page.getByRole("button", { name: "Rounded rectangle", exact: true }).click();
  const bar = page.getByTestId("options-bar");
  await expect(bar).toContainText("Rounded rectangle");
  await expect(bar.getByText("not wired yet")).toBeVisible();
  await expect(bar.locator(".option").first()).toBeVisible();
});

test("wired tools drop the chip and enable exactly their consumed options", async ({ page }) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const bar = page.getByTestId("options-bar");
  await expect(bar).toContainText("Rectangle");
  await expect(bar.getByText("not wired yet")).toHaveCount(0);
  await expect(bar.getByLabel("Fill", { exact: true })).toBeEnabled();
  await expect(bar.getByLabel("Stroke", { exact: true })).toBeEnabled();
  await expect(bar.getByLabel("Stroke width", { exact: true })).toBeEnabled();
  // Wired tools' options nothing consumes yet stay disabled (honest surface):
  // select consumes only nudgeIncrement.
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(bar.getByLabel("Nudge", { exact: true })).toBeEnabled();
  await expect(bar.getByLabel("Show coordinates", { exact: true })).toBeDisabled();
  await expect(bar.getByLabel("Position relative to", { exact: true })).toBeDisabled();
});

test("registry shortcuts activate tools in the current mode", async ({ page }) => {
  await page.getByTestId("canvas-area").click();
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: "Rectangle", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("h");
  await expect(page.getByRole("button", { name: "Pan", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("control panel lists the layout panel set with tier chips", async ({ page }) => {
  const panels = page.getByTestId("control-panel").locator(".panel");
  await expect(panels).toHaveCount(26);
  await expect(page.getByTestId("control-panel").locator(".tier-chip").first()).toBeVisible();
});
