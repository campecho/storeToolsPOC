import { expect, test, type Page } from "@playwright/test";

/**
 * Photo editor shell (plan step PE1): the Photo Edit card opens `/photo`, the
 * Section-A shell renders, a real photo opens through the jailed intake to an
 * editable canvas, reload restores it, and the rail → panel → status state
 * machine matches the wire. Conventions borrowed from layout-editor.spec.ts and
 * pub-import.spec.ts: getByTestId throughout, a `data-hydrated="true"` wait
 * before touching persisted state, and (the 3cacdd0 lesson) waiting on the
 * canvas's settled fit-zoom readout rather than sleeping before asserting paint.
 */

/** The six tool tiles, their context-panel titles, and their status strings —
 *  copied verbatim from TaskRail/ContextPanel/StatusBar (do not paraphrase). */
const TOOLS = [
  { rail: "photo-rail-crop", title: "Crop & straighten", status: "Crop · drag the handles — rule-of-thirds shown" },
  { rail: "photo-rail-adjust", title: "Adjust", status: "Adjust · sliders preview live on the proxy" },
  { rail: "photo-rail-fixprint", title: "Fix for print", status: "Fix for print · trim and bleed guides shown" },
  { rail: "photo-rail-text", title: "Text & image", status: "Text & image · drag, scale, rotate on the image" },
  { rail: "photo-rail-cleanup", title: "Clean up", status: "Clean up · brush over the area to remove" },
  { rail: "photo-rail-export", title: "Export", status: "Export · full-res render is queued server-side" },
] as const;

const NO_TOOL_STATUS = "No tool active · drag to pan, pick a task on the left";
const NO_PHOTO_STATUS = "No photo open · drop a photo or browse to begin";

/**
 * Open the corpus demo photo through the real picker path: `setInputFiles` on
 * the no-photo state's file input drives the jailed `/api/photo/intake`
 * round-trip end to end. Waits for the document to land (filename) and for the
 * canvas's fit-on-mount to settle (a non-empty zoom readout) — the settled
 * signal every downstream assertion depends on, per commit 3cacdd0.
 */
async function openDemoPhoto(page: Page) {
  await page.goto("/photo");
  await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");
  await page.getByTestId("photo-open-input").setInputFiles("public/photo-demo.jpg");
  // The intake POST decodes a 12 MP JPEG through sharp; on a cold dev route the
  // first compile pads the round-trip, so allow generous headroom.
  await expect(page.getByTestId("photo-filename")).toHaveText("photo-demo.jpg", { timeout: 30_000 });
  await expect(page.getByTestId("photo-zoom")).toHaveText(/\d+%/, { timeout: 30_000 });
}

test.describe("Photo editor shell (PE1)", () => {
  test("the homepage Photo Edit card navigates to /photo", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("quickjump-photo-edit").click();
    await expect(page).toHaveURL(/\/photo$/);
    // Lands on the hydrated shell, no photo yet.
    await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");
    await expect(page.getByTestId("photo-no-photo")).toBeVisible();
  });

  test("/photo shows the no-photo state with the shell hydrated", async ({ page }) => {
    await page.goto("/photo");
    await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");

    // The drop target + browse affordance (open question #5's POC stand-in).
    const dropTarget = page.getByTestId("photo-no-photo");
    await expect(dropTarget).toBeVisible();
    await expect(dropTarget).toContainText("Drop a photo to start editing");
    await expect(dropTarget.getByRole("button", { name: "Browse files" })).toBeVisible();

    // The status bar prompts for a photo; no zoom readout without a document.
    await expect(page.getByTestId("photo-status")).toHaveText(NO_PHOTO_STATUS);
    await expect(page.getByTestId("photo-zoom")).toHaveCount(0);
  });

  test("opening the demo photo renders title, print strip, painted canvas and status", async ({
    page,
  }) => {
    await openDemoPhoto(page);

    // Title bar: filename + full-resolution dimensions/megapixels.
    await expect(page.getByTestId("photo-filename")).toHaveText("photo-demo.jpg");
    await expect(page.getByText("12.2 MP", { exact: false })).toBeVisible();

    // Print strip echoes the live pixel dimensions.
    await expect(page.getByTestId("photo-strip-dims")).toHaveText("4032 × 3024 px");

    // The canvas has actually painted: its backing store was sized to the
    // container (DPR-aware), so its width is well past the empty default.
    const backingWidth = await page
      .getByTestId("photo-canvas")
      .evaluate((el) => (el as HTMLCanvasElement).width);
    expect(backingWidth).toBeGreaterThan(300);

    // Status bar: the no-tool wire string + a settled fit-zoom percent. The
    // percent is viewport-dependent, so assert the shape, not a pinned value.
    await expect(page.getByTestId("photo-status")).toHaveText(NO_TOOL_STATUS);
    await expect(page.getByTestId("photo-zoom")).toHaveText(/\d+%/);
  });

  test("reload restores the open document and repaints the canvas", async ({ page }) => {
    await openDemoPhoto(page);

    await page.reload();
    await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");

    // The document is still open (filename) and the proxy repaints from the
    // blob store (zoom readout returns), proving persistence end to end.
    await expect(page.getByTestId("photo-filename")).toHaveText("photo-demo.jpg", { timeout: 30_000 });
    await expect(page.getByTestId("photo-zoom")).toHaveText(/\d+%/, { timeout: 30_000 });
    const backingWidth = await page
      .getByTestId("photo-canvas")
      .evaluate((el) => (el as HTMLCanvasElement).width);
    expect(backingWidth).toBeGreaterThan(300);
  });

  test("the rail → panel → status state machine holds for all six tools", async ({ page }) => {
    await openDemoPhoto(page);

    for (const tool of TOOLS) {
      // Activate: aria-pressed ring, panel opens with the wire title, status wire.
      await page.getByTestId(tool.rail).click();
      await expect(page.getByTestId(tool.rail)).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("photo-panel")).toContainText(tool.title);
      await expect(page.getByTestId("photo-status")).toHaveText(tool.status);

      // The panel ✕ returns to the no-tool state: panel gone, status reset,
      // tile released.
      await page.getByTestId("photo-panel-close").click();
      await expect(page.getByTestId("photo-panel")).toHaveCount(0);
      await expect(page.getByTestId("photo-status")).toHaveText(NO_TOOL_STATUS);
      await expect(page.getByTestId(tool.rail)).toHaveAttribute("aria-pressed", "false");
    }

    // Clicking the active tile a second time also returns to none.
    await page.getByTestId("photo-rail-crop").click();
    await expect(page.getByTestId("photo-panel")).toContainText("Crop & straighten");
    await page.getByTestId("photo-rail-crop").click();
    await expect(page.getByTestId("photo-panel")).toHaveCount(0);
    await expect(page.getByTestId("photo-rail-crop")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("photo-status")).toHaveText(NO_TOOL_STATUS);
  });

  test("the quick fixes navigate to their panels", async ({ page }) => {
    await openDemoPhoto(page);

    // Fix bleed → Fix for print.
    await page.getByTestId("photo-quick-fixbleed").click();
    await expect(page.getByTestId("photo-panel")).toContainText("Fix for print");
    await expect(page.getByTestId("photo-rail-fixprint")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("photo-status")).toHaveText(
      "Fix for print · trim and bleed guides shown",
    );

    // Fit to size → Fix for print (still).
    await page.getByTestId("photo-quick-fit").click();
    await expect(page.getByTestId("photo-panel")).toContainText("Fix for print");
    await expect(page.getByTestId("photo-rail-fixprint")).toHaveAttribute("aria-pressed", "true");

    // Convert format → Export.
    await page.getByTestId("photo-quick-convert").click();
    await expect(page.getByTestId("photo-panel")).toContainText("Export");
    await expect(page.getByTestId("photo-rail-export")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("photo-status")).toHaveText(
      "Export · full-res render is queued server-side",
    );
  });

  test("the Simple level shows only Crop + Export and closes the panel", async ({ page }) => {
    await openDemoPhoto(page);

    // Standard (default) shows all six tiles.
    for (const tool of TOOLS) {
      await expect(page.getByTestId(tool.rail)).toBeVisible();
    }

    // Open a tool so the panel-closing behavior is observable.
    await page.getByTestId("photo-rail-crop").click();
    await expect(page.getByTestId("photo-panel")).toBeVisible();

    // Switch to Simple: rail collapses to Crop + Export, the panel is gone.
    await page.getByTestId("photo-level-simple").click();
    await expect(page.getByTestId("photo-level-simple")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("photo-rail-crop")).toBeVisible();
    await expect(page.getByTestId("photo-rail-export")).toBeVisible();
    for (const rail of ["photo-rail-adjust", "photo-rail-fixprint", "photo-rail-text", "photo-rail-cleanup"]) {
      await expect(page.getByTestId(rail)).toHaveCount(0);
    }
    await expect(page.getByTestId("photo-panel")).toHaveCount(0);

    // Back to Standard restores all six.
    await page.getByTestId("photo-level-standard").click();
    for (const tool of TOOLS) {
      await expect(page.getByTestId(tool.rail)).toBeVisible();
    }
  });

  test("intake rejects a disguised non-image with friendly copy", async ({ page }) => {
    await page.goto("/photo");
    await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");

    // A ZIP (PK\x03\x04…) handed to the picker as image/jpeg — the content sniff
    // owns this, extensions and MIME are never trusted.
    const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00]);
    await page.getByTestId("photo-open-input").setInputFiles({
      name: "sneaky.jpg",
      mimeType: "image/jpeg",
      buffer: zipBytes,
    });

    const banner = page.getByTestId("photo-capability-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("That doesn't look like an image file");

    // No document opened — the no-photo state stays put.
    await expect(page.getByTestId("photo-filename")).toHaveCount(0);
    await expect(page.getByTestId("photo-no-photo")).toBeVisible();
  });

  test("below lg the editor gates to the bigger-screen card", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto("/photo");

    await expect(page.getByText("The photo editor needs a bigger screen")).toBeVisible();
    // The precision editor surface is gated out, not reflowed.
    await expect(page.getByTestId("photo-editor")).toBeHidden();
  });
});
