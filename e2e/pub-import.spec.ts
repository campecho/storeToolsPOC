import { expect, test, type Page } from "@playwright/test";

/**
 * `.pub` import, P1 (plan §10.6's e2e): the homepage callout converts a
 * Publisher file and the document opens in the editor with correctly sized,
 * correctly placed frames. The web server runs with STP_IMPORT_FIXTURE=1
 * (playwright.config.ts), so conversion serves the golden demo-flyer trace —
 * the assertions below are pinned to fixtures/pub-traces/demo-flyer.trace.
 */

const importDemoPub = async (page: Page) => {
  await page.goto("/");
  await page.getByTestId("pub-file-input").setInputFiles("e2e/fixtures/demo.pub");
  await page.waitForURL("**/layout");
  await expect(page.getByTestId("layout-editor")).toHaveAttribute("data-hydrated", "true");
};

// The Playwright web server runs with STP_IMPORT_FIXTURE=1 (playwright.config.ts),
// so every import here is fixture mode — which is exactly the state that must
// be visible, not silent.
test.describe(".pub import — demo-mode is visible (P1 follow-up)", () => {
  test("fixture-mode import shows the unmissable demo banner", async ({ page }) => {
    await importDemoPub(page);
    const banner = page.getByTestId("import-fixture-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("this is sample content, not your file");
    await expect(banner).toContainText("libmspub-tools");
    // dismissible
    await page.getByTestId("import-banner-dismiss").click();
    await expect(banner).toBeHidden();
  });

  test("GET /api/import reports why it's in fixture mode", async ({ request }) => {
    const res = await request.get("/api/import");
    expect(res.ok()).toBe(true);
    const diag = await res.json();
    expect(diag.mode).toBe("fixture");
    expect(diag.fixtureForced).toBe(true);
    expect(diag.reason).toContain("STP_IMPORT_FIXTURE");
  });
});

test.describe(".pub import (P1)", () => {
  test("converts from the homepage callout into correctly-placed frames", async ({ page }) => {
    await importDemoPub(page);

    // Named after the uploaded file, sized from the source page
    await expect(page.getByTestId("doc-name")).toHaveValue("demo");
    await expect(page.getByTestId("page-indicator")).toContainText("of 2");

    // Page 1 of the demo flyer: 3 rects (banner + rotated + rounded), 2 REAL
    // vector paths since P2 (the star polygon and the bezier leaf), 2 text
    // frames, the divider line, and the picture frame — nothing dropped.
    await expect(page.getByTestId("object-rect")).toHaveCount(3);
    await expect(page.getByTestId("object-path")).toHaveCount(2);
    await expect(page.getByTestId("object-text")).toHaveCount(2);
    await expect(page.getByTestId("object-line")).toHaveCount(1);
    await expect(page.getByTestId("object-picture")).toHaveCount(1);

    // P3: the picture frame carries the extracted image bytes now — the <img>
    // renders (not the placeholder glyph, not the missing state), still exactly
    // one picture on the page. (Depends on the golden trace's real PNG payload.)
    await expect(page.getByTestId("picture-image")).toBeVisible();
    await expect(page.getByTestId("picture-missing")).toHaveCount(0);

    // Text landed with its content, per-run style, and the source ink color
    const headline = page.getByTestId("text-content").first();
    await expect(headline).toContainText("GRAND OPENING");
    await expect(headline.locator("span").first()).toHaveCSS("color", "rgb(255, 255, 255)");

    // Geometry accuracy (the Milestone-1 bar): the banner rect is exactly
    // 0.5,0.5 7.5×1.75 in. Select it from the Layers list (bottom of the
    // z-order = last row) and read the Properties transform.
    await page.getByTestId("panel-tab-layers").click();
    await page.getByTestId("layer-row-8").click();
    await page.getByTestId("insp-props").click();
    await expect(page.getByTestId("prop-x")).toHaveValue("0.5");
    await expect(page.getByTestId("prop-y")).toHaveValue("0.5");
    await expect(page.getByTestId("prop-w")).toHaveValue("7.5");
    await expect(page.getByTestId("prop-h")).toHaveValue("1.75");
    await expect(page.getByTestId("prop-rotation")).toHaveValue("0");

    // Rotation carries through unchanged (verified vs the pub2xhtml reference
    // render); z-order: the rotated accent is the 4th object → layers row 5.
    await page.getByTestId("layer-row-5").click();
    await expect(page.getByTestId("prop-rotation")).toHaveValue("15");

    // Page 2 renders its own content
    await page.getByTestId("page-next").click();
    await expect(page.getByTestId("object-rect")).toHaveCount(1);
    await expect(page.getByTestId("text-content")).toContainText("123 Main Street");

    // The import persists like any document
    await page.reload();
    await expect(page.getByTestId("layout-editor")).toHaveAttribute("data-hydrated", "true");
    await expect(page.getByTestId("doc-name")).toHaveValue("demo");
  });

  test("replacing a publication with content asks first", async ({ page }) => {
    await importDemoPub(page); // leaves a doc with content behind
    await page.goto("/");

    await page.getByTestId("pub-file-input").setInputFiles("e2e/fixtures/demo.pub");
    await expect(page.getByTestId("pub-import-note")).toContainText("replaces the open publication");

    // Cancel keeps the current document and returns the callout to idle
    await page.getByTestId("pub-confirm-cancel").click();
    await expect(page.getByTestId("pub-convert-button")).toBeVisible();
    await expect(page).toHaveURL("/");

    // Replace & convert proceeds
    await page.getByTestId("pub-file-input").setInputFiles("e2e/fixtures/demo.pub");
    await page.getByTestId("pub-confirm-replace").click();
    await page.waitForURL("**/layout");
    await expect(page.getByTestId("doc-name")).toHaveValue("demo");
  });

  test("content sniffing rejects a non-Publisher file with an honest note", async ({ page }) => {
    await page.goto("/");
    // A PNG handed to the picker (extension filters don't gate setInputFiles —
    // exactly the never-trust-the-extension case the sniffer owns)
    await page.getByTestId("pub-file-input").setInputFiles("e2e/fixtures/photo.png");
    await expect(page.getByTestId("pub-import-note")).toContainText("doesn't look like a Publisher");
    // Still recoverable
    await expect(page.getByTestId("pub-convert-button")).toBeVisible();
  });
});
