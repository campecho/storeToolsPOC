import { expect, test, type Page } from "@playwright/test";

/**
 * `.pub` import, P1 (plan §10.6's e2e): the picker's Quick Import tab
 * (Phase 11) converts a Publisher file, shows the conversion summary panel
 * in place, and Open in Editor lands the document in the editor with
 * correctly sized, correctly placed frames. The web server runs with
 * STP_IMPORT_FIXTURE=1 (playwright.config.ts), so conversion serves the
 * golden demo-flyer trace — the assertions below are pinned to
 * fixtures/pub-traces/demo-flyer.trace.
 */

const importDemoPub = async (page: Page, opts: { keepReport?: boolean } = {}) => {
  await page.goto("/?tab=import");
  await page.getByTestId("pub-file-input").setInputFiles("e2e/fixtures/demo.pub");
  // the conversion summary panel (Phase 11) renders in place for review
  await expect(page.getByTestId("quick-import-report")).toBeVisible();
  if (!opts.keepReport) {
    await page.getByTestId("report-continue").click();
    await page.waitForURL("**/layout");
    await expect(page.getByTestId("layout-editor")).toHaveAttribute("data-hydrated", "true");
  }
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
  test("converts from the Quick Import tab into correctly-placed frames", async ({ page }) => {
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
    await page.getByTestId("insp-layers").click();
    await page.getByTestId("layer-row-8").click();
    await page.getByTestId("insp-page").click();
    await expect(page.getByTestId("prop-x")).toHaveValue("0.5");
    await expect(page.getByTestId("prop-y")).toHaveValue("0.5");
    await expect(page.getByTestId("prop-w")).toHaveValue("7.5");
    await expect(page.getByTestId("prop-h")).toHaveValue("1.75");
    await expect(page.getByTestId("prop-rotation")).toHaveValue("0");

    // Rotation carries through unchanged (verified vs the pub2xhtml reference
    // render); z-order: the rotated accent is the 4th object → layers row 5.
    // Layers and properties now share the inspector, so switch back first.
    await page.getByTestId("insp-layers").click();
    await page.getByTestId("layer-row-5").click();
    await page.getByTestId("insp-page").click();
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
    await page.goto("/?tab=import");

    await page.getByTestId("pub-file-input").setInputFiles("e2e/fixtures/demo.pub");
    await expect(page.getByTestId("pub-import-note")).toContainText("replaces the open publication");

    // Cancel keeps the current document and returns the uploader to idle
    await page.getByTestId("pub-confirm-cancel").click();
    await expect(page.getByTestId("pub-import-note")).toHaveCount(0);
    await expect(page.getByTestId("quick-import-browse")).toHaveText("Browse files");

    // Replace & convert proceeds
    await page.getByTestId("pub-file-input").setInputFiles("e2e/fixtures/demo.pub");
    await page.getByTestId("pub-confirm-replace").click();
    await expect(page.getByTestId("quick-import-report")).toBeVisible();
    await page.getByTestId("report-continue").click();
    await page.waitForURL("**/layout");
    await expect(page.getByTestId("doc-name")).toHaveValue("demo");
  });

  test("content sniffing rejects a non-Publisher file with an honest note", async ({ page }) => {
    await page.goto("/?tab=import");
    // A PNG handed to the picker (extension filters don't gate setInputFiles —
    // exactly the never-trust-the-extension case the sniffer owns)
    await page.getByTestId("pub-file-input").setInputFiles("e2e/fixtures/photo.png");
    await expect(page.getByTestId("pub-import-note")).toContainText("doesn't look like a Publisher");
    // Still recoverable
    await expect(page.getByTestId("quick-import-browse")).toHaveText("Browse files");
  });
});

// The report panel (plan §10.4, P4 — hosted on the Quick Import tab since
// Phase 11). The golden demo flyer has a degraded rounded-rect (rounded
// corners dropped), so the review path is populated and its note deep-links
// to the object. Imports here are fixture mode, so the summary carries a
// "Demo mode" chip.
test.describe(".pub import — report panel (P4)", () => {
  test("the conversion shows the summary panel before the editor", async ({ page }) => {
    await importDemoPub(page, { keepReport: true });

    // The summary panel renders in place — review happens before the editor.
    await expect(page).toHaveURL(/\?tab=import/);
    await expect(page.getByTestId("quick-import-report")).toBeVisible();
    await expect(page.getByTestId("report-stats")).toBeVisible();
    await expect(page.getByTestId("quick-import-file-card")).toBeVisible();
    const pane = page.getByTestId("import-report-pane");
    await expect(pane).toBeVisible();
    await expect(pane).toContainText("demo.pub"); // the source filename
    await expect(page.getByTestId("import-report-fixture")).toBeVisible();
    await expect(page.getByTestId("import-report-summary")).toContainText("converted");
    await expect(page.getByTestId("import-report-summary")).toContainText("need review");
  });

  test("a note deep-links to its object and navigates to its page", async ({ page }) => {
    await importDemoPub(page);

    // Move to page 2 (so the deep link's navigation back is observable),
    // then reopen the report from the banner (it lands on Quick Import).
    await page.getByTestId("page-next").click();
    await expect(page.getByTestId("page-indicator")).toContainText("Page 2 of 2");
    await page.getByTestId("import-view-report").click();
    await expect(page).toHaveURL(/\?tab=import/);
    await expect(page.getByTestId("quick-import-report")).toBeVisible();

    // The first note link is the degraded rounded-rect (page 1). Clicking it
    // jumps to that page, selects the frame, and opens the editor.
    await page.getByTestId("import-note-link").first().click();
    await page.waitForURL("**/layout");
    await expect(page.getByTestId("page-indicator")).toContainText("Page 1 of 2");

    // Properties read back the rounded-rect's exact geometry — proof it's the
    // one now selected (0.75, 6.0, 7.0 × 2.0 in).
    await page.getByTestId("insp-page").click();
    await expect(page.getByTestId("prop-x")).toHaveValue("0.75");
    await expect(page.getByTestId("prop-w")).toHaveValue("7");
  });

  // NOTE: the blue `import-review-banner` and its "View report" button are a
  // LIVE-mode affordance. This webServer forces STP_IMPORT_FIXTURE=1, and a
  // file-upload POST response can't be rewritten to fake live mode
  // (Playwright's route.fetch can't replay the multipart file body), so
  // there's no honest fixture-mode e2e for that path. The panel it opens is
  // covered by the two tests above; the button is a one-line wrapper over the
  // same navigation the fixture banner's button uses. Covered live, not in CI.
});

// P4: `.puz` pack-and-go. e2e/fixtures/demo.puz is a stored CAB wrapping the
// same demo.pub (built deterministically). Conversion still runs in fixture
// mode (golden trace), but the upload exercises the real sniff → CAB-extract →
// re-sniff → accept path in the route before it hands off.
test.describe(".pub import — .puz pack-and-go (P4)", () => {
  test("uploading a .puz unpacks the inner .pub and opens the editor", async ({ page }) => {
    await page.goto("/?tab=import");
    await page.getByTestId("pub-file-input").setInputFiles("e2e/fixtures/demo.puz");
    await expect(page.getByTestId("quick-import-report")).toBeVisible();
    await page.getByTestId("report-continue").click();
    await page.waitForURL("**/layout");
    await expect(page.getByTestId("layout-editor")).toHaveAttribute("data-hydrated", "true");
    // Named from the outer .puz (its extension is stripped just like ".pub")
    await expect(page.getByTestId("doc-name")).toHaveValue("demo");
  });
});
