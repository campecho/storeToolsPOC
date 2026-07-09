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

/**
 * Open the corpus demo through the `/photo?demo=1` deep link (the DemoInit path)
 * and enter the Crop tool — the one shared setup for every PE2 case. The deep
 * link is deliberate: it wraps the demo bytes as `IMG_4823.jpg`, so the history
 * dock's first step is the wire-pinned "Open IMG_4823.jpg" (the picker path in
 * openDemoPhoto names it "photo-demo.jpg" instead). Waits mirror the house
 * stability rule (commit 3cacdd0): the settled fit-zoom readout (`photo-zoom`
 * matching /\d+%/) is the signal every geometry assertion depends on, so nothing
 * is driven before it lands. Intake gets 30 s of headroom on a cold route.
 */
async function openDemoInCrop(page: Page) {
  await page.goto("/photo?demo=1");
  await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByTestId("photo-filename")).toHaveText("IMG_4823.jpg", { timeout: 30_000 });
  await expect(page.getByTestId("photo-zoom")).toHaveText(/\d+%/, { timeout: 30_000 });
  await page.getByTestId("photo-rail-crop").click();
  await expect(page.getByTestId("photo-crop-panel")).toBeVisible();
}

/** The `History · N` strip button, N = cursor + 1 (the Open step counts). */
async function expectHistory(page: Page, n: number) {
  await expect(page.getByTestId("photo-history")).toHaveText(`History · ${n}`);
}

/** Read the print strip's live pixel dims ("4032 × 3024 px"). */
function stripDims(page: Page) {
  return page.getByTestId("photo-strip-dims");
}

/**
 * Drive the straighten slider with a real mouse drag from centre to a fraction of
 * its track (fill() bypasses the pointer gestures the coalesce rule hangs off).
 * A down-move-up cycle fires the live onChange previews and the onPointerUp that
 * commits exactly one (coalesced) straighten op — computed off the boundingBox
 * like the manual drive.
 */
async function dragStraighten(page: Page, frac: number) {
  const box = await page.getByTestId("crop-straighten-slider").boundingBox();
  if (!box) throw new Error("straighten slider has no bounding box");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + frac * box.width, y, { steps: 6 });
  await page.mouse.up();
}

/**
 * Geometry & history (plan step PE2 done-when, docs/PHOTO_EDITOR_IMPLEMENTATION_PLAN.md
 * §4 PE2): the Crop & straighten panel, the recipe-cursor undo/redo, the docked
 * named-step history, mid-recipe persistence, and the press-and-hold compare
 * peek — pinned against the exact values from the manual drive (the demo is
 * 4032×3024). Every case opens through the shared openDemoInCrop helper.
 */
test.describe("Geometry & history (PE2)", () => {
  test("crop chain: aspect 4×6 → ratio-locked handle drag → Apply shrinks the strip", async ({
    page,
  }) => {
    await openDemoInCrop(page);

    // A fresh open sits at the Open step with the full-res strip.
    await expect(stripDims(page)).toHaveText("4032 × 3024 px");
    await expectHistory(page, 1);

    // Aspect 4×6 frames the canonical centered crop (max-area landscape at 1.5).
    await page.getByTestId("crop-aspect-4x6").click();
    await expect(page.getByTestId("crop-aspect-4x6")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("crop-chip")).toHaveText("4032 × 2688 px");

    // Drag the SE handle ~120px inward; the ratio lock holds 1.500 within rounding.
    const se = await page.getByTestId("crop-handle-se").boundingBox();
    if (!se) throw new Error("SE crop handle has no bounding box");
    const cx = se.x + se.width / 2;
    const cy = se.y + se.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 120, cy - 80, { steps: 8 });
    await page.mouse.up();

    const chip = await page.getByTestId("crop-chip").textContent();
    const nums = chip?.match(/\d+/g) ?? [];
    expect(nums.length).toBe(2);
    const [w, h] = nums.map(Number);
    expect(Math.abs(w / h - 1.5)).toBeLessThan(0.01);

    // Apply commits the crop: the strip shrinks to exactly the chip's value, the
    // history advances to two steps (Open + Crop).
    await page.getByTestId("crop-apply").click();
    await expect(stripDims(page)).toHaveText(chip!.trim());
    await expectHistory(page, 2);
  });

  test("straighten coalesces: two drags stay one history step", async ({ page }) => {
    await openDemoInCrop(page);

    // First drag commits one straighten op → Open + Straighten = two steps.
    await dragStraighten(page, 0.68);
    await expectHistory(page, 2);

    // A second, separate drag REPLACES the trailing straighten in place (the
    // anti-spam coalesce rule) — the count must not climb.
    await dragStraighten(page, 0.74);
    await expectHistory(page, 2);

    // The dock confirms a single Straighten step, no stacking.
    await page.getByTestId("photo-history").click();
    const dock = page.getByTestId("photo-history-dock");
    await expect(dock).toBeVisible();
    const steps = await dock.locator("[data-testid^='history-step-']").allTextContents();
    expect(steps.length).toBe(2);
    expect(steps[0]).toBe("Open IMG_4823.jpg");
    expect(steps[1]).toMatch(/^Straighten [−+]\d+\.\d°$/u);
  });

  test("rotate right swaps the strip dims and advances history", async ({ page }) => {
    await openDemoInCrop(page);
    await expect(stripDims(page)).toHaveText("4032 × 3024 px");

    // A quarter turn swaps w×h → h×w and lands one more history step.
    await page.getByTestId("crop-rotate-right").click();
    await expect(stripDims(page)).toHaveText("3024 × 4032 px");
    await expectHistory(page, 2);
  });

  test("undo/redo walk the strip dims and history back and forth", async ({ page }) => {
    await openDemoInCrop(page);

    // Build a two-op recipe: crop 4×6 (4032×2688) then rotate right (2688×4032).
    await page.getByTestId("crop-aspect-4x6").click();
    await page.getByTestId("crop-apply").click();
    await expect(stripDims(page)).toHaveText("4032 × 2688 px");
    await expectHistory(page, 2);
    await page.getByTestId("crop-rotate-right").click();
    await expect(stripDims(page)).toHaveText("2688 × 4032 px");
    await expectHistory(page, 3);

    // Undo (buttons, for stability) walks the cursor back to the Open step.
    await page.getByTestId("photo-undo").click();
    await expect(stripDims(page)).toHaveText("4032 × 2688 px");
    await expectHistory(page, 2);
    await page.getByTestId("photo-undo").click();
    await expect(stripDims(page)).toHaveText("4032 × 3024 px");
    await expectHistory(page, 1);
    // At the base, undo is disabled (cursor floor).
    await expect(page.getByTestId("photo-undo")).toBeDisabled();

    // Redo walks the same steps forward.
    await page.getByTestId("photo-redo").click();
    await expect(stripDims(page)).toHaveText("4032 × 2688 px");
    await expectHistory(page, 2);
    await page.getByTestId("photo-redo").click();
    await expect(stripDims(page)).toHaveText("2688 × 4032 px");
    await expectHistory(page, 3);
    await expect(page.getByTestId("photo-redo")).toBeDisabled();
  });

  test("history dock: canonical step names + click-to-revert", async ({ page }) => {
    await openDemoInCrop(page);

    // Recipe: Crop to 4 × 6 · Straighten <±n>° · Rotate 90° right.
    await page.getByTestId("crop-aspect-4x6").click();
    await page.getByTestId("crop-apply").click();
    await dragStraighten(page, 0.68);
    await page.getByTestId("crop-rotate-right").click();
    await expectHistory(page, 4);

    // Open the dock from the strip's History button.
    await page.getByTestId("photo-history").click();
    const dock = page.getByTestId("photo-history-dock");
    await expect(dock).toBeVisible();

    // Step 0 and the crop step are wire-pinned canonical strings (verbatim); the
    // straighten value depends on the drag, so its shape is asserted.
    await expect(page.getByTestId("history-step-0")).toHaveText("Open IMG_4823.jpg");
    await expect(page.getByTestId("history-step-1")).toHaveText("Crop to 4 × 6");
    await expect(page.getByTestId("history-step-2")).toHaveText(/^Straighten [−+]\d+\.\d°$/u);
    await expect(page.getByTestId("history-step-3")).toHaveText("Rotate 90° right");

    // Click the Open step → cursor 0: the full-res image returns, History · 1.
    await page.getByTestId("history-step-0").click();
    await expect(stripDims(page)).toHaveText("4032 × 3024 px");
    await expectHistory(page, 1);

    // Click the last step → cursor at the recipe end, History · 4 (the dock stays
    // open across step clicks — they are inside the docked card).
    await page.getByTestId("history-step-3").click();
    await expectHistory(page, 4);
  });

  test("mid-recipe cursor survives a reload", async ({ page }) => {
    await openDemoInCrop(page);

    // crop 4×6 → rotate right → undo once leaves the cursor mid-recipe (the
    // rotate is a redo tail; the crop is still applied).
    await page.getByTestId("crop-aspect-4x6").click();
    await page.getByTestId("crop-apply").click();
    await page.getByTestId("crop-rotate-right").click();
    await page.getByTestId("photo-undo").click();
    await expect(stripDims(page)).toHaveText("4032 × 2688 px");
    await expectHistory(page, 2);

    // Reload: the recipe + cursor rehydrate from persistence, the proxy repaints
    // from the blob store (zoom returns), and neither the dims nor the count move.
    await page.reload();
    await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");
    await expect(page.getByTestId("photo-filename")).toHaveText("IMG_4823.jpg", { timeout: 30_000 });
    await expect(page.getByTestId("photo-zoom")).toHaveText(/\d+%/, { timeout: 30_000 });
    await expect(stripDims(page)).toHaveText("4032 × 2688 px");
    await expectHistory(page, 2);
  });

  test("compare peek: hold Space swaps the original in, releasing restores", async ({ page }) => {
    await openDemoInCrop(page);

    // Apply a geometry op so the edited pixels differ from the original.
    await page.getByTestId("crop-rotate-right").click();
    await expect(stripDims(page)).toHaveText("3024 × 4032 px");

    // Sum a 20×20 block at a deterministic off-centre point (50%w / 20%h) of the
    // canvas backing store — an off-centre sample so a pure rotate visibly moves it.
    const sampleBlock = () =>
      page.getByTestId("photo-canvas").evaluate((el) => {
        const c = el as HTMLCanvasElement;
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        const x = Math.floor(c.width * 0.5);
        const y = Math.floor(c.height * 0.2);
        const d = ctx.getImageData(x - 10, y - 10, 20, 20).data;
        let sum = 0;
        for (let i = 0; i < d.length; i++) sum += d[i];
        return sum;
      });

    // Drop focus off the rotate button so Space peeks rather than re-activating it.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const before = await sampleBlock();
    await page.keyboard.down("Space");
    await page.waitForTimeout(300);
    const during = await sampleBlock();
    await page.keyboard.up("Space");
    await page.waitForTimeout(200);
    const after = await sampleBlock();

    // The peek visibly changed the pixels, and release restored them exactly.
    expect(Math.abs(before - during)).toBeGreaterThan(2000);
    expect(after).toBe(before);
    // The peek is display-only: it never mutated the recipe (no accidental rotate).
    await expect(stripDims(page)).toHaveText("3024 × 4032 px");
    await expectHistory(page, 2);
  });
});
