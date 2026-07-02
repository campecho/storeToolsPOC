import { test, expect } from "@playwright/test";

/**
 * Layout editor shell (plan step L1): the editor opens from the homepage's
 * Layout card, the chrome renders, and the shell's toggles work — tool
 * selection with the status-bar readout, and ribbon-tab switching.
 */
test.describe("Layout editor shell (L1)", () => {
  test("opens from the homepage Layout card with the editor chrome", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("quickjump-layout").click();
    await expect(page).toHaveURL(/\/layout$/);

    // editor title bar + suite header coexist ("one shared surface")
    await expect(page.getByText("Untitled publication", { exact: true })).toBeVisible();
    await expect(page.getByText("· Letter · 8.5 × 11 in", { exact: true })).toBeVisible();
    await expect(page.getByTestId("give-feedback")).toBeVisible();

    // experience switch shows Standard active (Simple/Pro disabled until L8)
    await expect(page.getByTestId("experience-switch")).toContainText("Standard");

    // page proxy + pasteboard caption + guide legend
    await expect(page.getByTestId("publication-page")).toBeVisible();
    await expect(
      page.getByText("Untitled publication · Letter 8.5 × 11 in · 100%"),
    ).toBeVisible();
    await expect(page.getByText("Bleed 0.125 in")).toBeVisible();
    await expect(page.getByText("Margin 0.5 in")).toBeVisible();

    // Page inspector tab body (the default tab)
    await expect(page.getByText("Custom size — not bound to a SKU")).toBeVisible();
  });

  test("tool selection is single-select and drives the status bar", async ({ page }) => {
    await page.goto("/layout");
    await expect(page.getByTestId("status-tool")).toHaveText("Select tool · ready");

    await page.getByTestId("tool-rect").click();
    await expect(page.getByTestId("status-tool")).toHaveText("Rectangle tool · ready");
    await expect(page.getByTestId("tool-rect")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("tool-select")).toHaveAttribute("aria-pressed", "false");

    await page.getByTestId("tool-zoom").click();
    await expect(page.getByTestId("status-tool")).toHaveText("Zoom tool · ready");
    await expect(page.getByTestId("tool-rect")).toHaveAttribute("aria-pressed", "false");
  });

  test("ribbon tabs switch the command band", async ({ page }) => {
    await page.goto("/layout");
    await expect(page.getByText("Paste")).toBeVisible();

    await page.getByTestId("ribbon-insert").click();
    await expect(page.getByTestId("ribbon-insert")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Paste")).toBeHidden();

    await page.getByTestId("ribbon-home").click();
    await expect(page.getByText("Paste")).toBeVisible();
  });

  test("back link returns to Print Studio home", async ({ page }) => {
    await page.goto("/layout");
    await page.getByTestId("editor-back").click();
    await expect(page.getByText("Bring in a file")).toBeVisible();
  });
});

/**
 * Shell completion (plan step L2): every ribbon band, every inspector tab
 * body, and both pages-pane views render their prototype content — full
 * at-rest parity with the offline handoff.
 */
test.describe("Layout editor shell (L2)", () => {
  test("every ribbon tab renders its command band", async ({ page }) => {
    await page.goto("/layout");

    await page.getByTestId("ribbon-insert").click();
    const insert = page.getByTestId("band-insert");
    await expect(insert.getByText("Add page")).toBeVisible();
    await expect(insert.getByText("Text & media")).toBeVisible();
    await expect(insert.getByText("Hyperlink")).toBeVisible();

    await page.getByTestId("ribbon-layout").click();
    const layout = page.getByTestId("band-layout");
    await expect(layout.getByText("Letter · 8.5 × 11 in")).toBeVisible();
    await expect(layout.getByText("Bleed 0.125")).toBeVisible();
    await expect(layout.getByText("Guides", { exact: true })).toBeVisible();

    await page.getByTestId("ribbon-text").click();
    const text = page.getByTestId("band-text");
    await expect(text.getByText("Paragraph · Normal")).toBeVisible();
    await expect(text.getByText("Link boxes")).toBeVisible();

    await page.getByTestId("ribbon-home").click();
    await expect(page.getByTestId("band-home").getByText("Paste")).toBeVisible();
  });

  test("inspector tabs swap their bodies", async ({ page }) => {
    await page.goto("/layout");
    // Page is the default tab
    await expect(page.getByText("Custom size — not bound to a SKU")).toBeVisible();

    await page.getByTestId("insp-props").click();
    await expect(page.getByTestId("insp-props")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Nothing selected")).toBeVisible();
    await expect(page.getByText("Transform")).toBeVisible();

    await page.getByTestId("insp-text").click();
    await expect(page.getByText("Line spacing 1.2")).toBeVisible();
    await expect(page.getByText("Nothing selected")).toBeHidden();

    await page.getByTestId("insp-align").click();
    await expect(page.getByText("Distribute")).toBeVisible();
    await expect(page.getByText("Relative to")).toBeVisible();

    await page.getByTestId("insp-page").click();
    await expect(page.getByText("Custom size — not bound to a SKU")).toBeVisible();
  });

  test("pages pane toggles between the Pages and Masters views", async ({ page }) => {
    await page.goto("/layout");
    await expect(page.getByText("Add page")).toBeVisible();

    await page.getByTestId("pane-masters").click();
    await expect(page.getByTestId("pane-masters")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("A · applied")).toBeVisible();
    await expect(page.getByText("B · blank")).toBeVisible();
    await expect(page.getByText("+ New master")).toBeVisible();

    await page.getByTestId("pane-pages").click();
    await expect(page.getByTestId("pane-pages")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Add page")).toBeVisible();
    await expect(page.getByText("A · applied")).toBeHidden();
  });
});
