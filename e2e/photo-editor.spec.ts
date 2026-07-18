import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

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

/**
 * Export spine (plan step PE3 done-when, docs/PHOTO_EDITOR_IMPLEMENTATION_PLAN.md
 * §4 PE3): the Export panel's LIVE JPG/PNG path — the recipe replays server-side
 * at full resolution and the encoded bytes land on the associate's disk. These
 * are the first tests in the suite that assert on real downloaded bytes, so they
 * decode the download with `sharp` (Playwright drives node, so the encoder runs
 * in-process here). Every case opens through the shared openDemoInCrop helper —
 * the demo master is 4032×3024, wrapped as IMG_4823.jpg by the deep link — builds
 * a recipe in the Crop tool, then drives Export.
 *
 * Wait discipline mirrors the house rule: openDemoInCrop already gates on the
 * settled fit-zoom readout, and each geometry op is confirmed through the print
 * strip (a store-backed signal) before Export is driven. The render route
 * compiles + spawns the sharp jail on first hit and a full-res 12 MP replay is
 * real work, so the block runs with extra headroom and downloads get 60 s.
 */
test.describe("Export spine (PE3)", () => {
  test.describe.configure({ timeout: 90_000 });

  /** Switch from the Crop tool to Export and confirm the panel mounted. */
  async function openExportPanel(page: Page) {
    await page.getByTestId("photo-rail-export").click();
    await expect(page.getByTestId("photo-export-panel")).toBeVisible();
  }

  test("export round-trip renders the recipe at full resolution (2688 × 4032 JPEG)", async ({
    page,
  }, testInfo) => {
    await openDemoInCrop(page);

    // Recipe: crop to 4 × 6 (landscape 4032×2688) then rotate right (portrait
    // 2688×4032) — the exact manual-verified done-when path.
    await page.getByTestId("crop-aspect-4x6").click();
    await page.getByTestId("crop-apply").click();
    await expect(stripDims(page)).toHaveText("4032 × 2688 px");
    await page.getByTestId("crop-rotate-right").click();
    await expect(stripDims(page)).toHaveText("2688 × 4032 px");

    await openExportPanel(page);

    // Arm a chip-visibility latch BEFORE the click. A MutationObserver records
    // the rendering chip's INSERTION (from the addedNodes, not a live query) so
    // the signal survives even if the render finishes fast enough that the node
    // is already gone by the time we poll.
    await page.evaluate(() => {
      const w = window as unknown as { __chipSeen?: boolean };
      const sel = '[data-testid="photo-rendering-chip"]';
      w.__chipSeen = document.querySelector(sel) != null;
      const obs = new MutationObserver((muts) => {
        for (const m of muts) {
          for (const node of Array.from(m.addedNodes)) {
            if (!(node instanceof Element)) continue;
            if (node.matches(sel) || node.querySelector(sel)) w.__chipSeen = true;
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByTestId("export-file").click(),
    ]);

    // Suggested name = the wire-pinned stem + "-edited" + the real extension.
    expect(download.suggestedFilename()).toBe("IMG_4823-edited.jpg");

    const out = testInfo.outputPath("export-roundtrip.jpg");
    await download.saveAs(out);

    // The whole point of PE3: full resolution, correctly oriented — EXACTLY
    // 2688 × 4032 JPEG bytes on disk.
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(2688);
    expect(meta.height).toBe(4032);

    // The rendering chip was visible at some point during the round-trip …
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __chipSeen?: boolean }).__chipSeen))
      .toBe(true);
    // … and it clears once the render resolves, with the button re-enabled.
    await expect(page.getByTestId("photo-rendering-chip")).toHaveCount(0);
    await expect(page.getByTestId("export-file")).toBeEnabled();
  });

  test("PNG export of a Circle crop carries alpha with a transparent corner", async ({
    page,
  }, testInfo) => {
    await openDemoInCrop(page);

    // Circle shape forces a centered 1:1 crop → 3024×3024 on the 4032×3024 master.
    await page.getByTestId("crop-shape-circle").click();
    await expect(page.getByTestId("crop-shape-circle")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("crop-apply").click();
    await expect(stripDims(page)).toHaveText("3024 × 3024 px");

    await openExportPanel(page);
    // PNG is lossless — selecting it hides Quality and switches the encoder.
    await page.getByTestId("export-format-png").click();
    await expect(page.getByTestId("export-format-png")).toHaveAttribute("aria-pressed", "true");

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByTestId("export-file").click(),
    ]);
    expect(download.suggestedFilename()).toBe("IMG_4823-edited.png");

    const out = testInfo.outputPath("export-circle.png");
    await download.saveAs(out);

    // 4-channel PNG (alpha survives the shaped crop).
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(3024);
    expect(meta.height).toBe(3024);
    expect(meta.channels).toBe(4);
    expect(meta.hasAlpha).toBe(true);

    // A corner sits OUTSIDE the inscribed circle → fully transparent; the center
    // sits inside → fully opaque. Read a 1×1 raw RGBA sample at each.
    const corner = await sharp(out).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer();
    expect(corner[3]).toBe(0);
    const center = await sharp(out)
      .extract({ left: 1512, top: 1512, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect(center[3]).toBe(255);
  });

  test("undo drops the redo tail from the render: only the applied crop ships", async ({
    page,
  }, testInfo) => {
    await openDemoInCrop(page);

    // crop 4 × 6 → rotate right → UNDO once. The rotate is now a redo tail; the
    // client renders recipe[0..cursor) only, so it must not reach the server.
    await page.getByTestId("crop-aspect-4x6").click();
    await page.getByTestId("crop-apply").click();
    await expect(stripDims(page)).toHaveText("4032 × 2688 px");
    await page.getByTestId("crop-rotate-right").click();
    await expect(stripDims(page)).toHaveText("2688 × 4032 px");
    await page.getByTestId("photo-undo").click();
    await expect(stripDims(page)).toHaveText("4032 × 2688 px");

    await openExportPanel(page);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByTestId("export-file").click(),
    ]);

    const out = testInfo.outputPath("export-redotail.jpg");
    await download.saveAs(out);

    // Crop applied, rotate NOT applied → landscape 4032×2688 (proves the redo
    // tail never rendered; a rendered rotate would be 2688×4032).
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(4032);
    expect(meta.height).toBe(2688);
  });

  test("client canvas and server render agree on geometry (tolerance parity)", async ({
    page,
  }, testInfo) => {
    await openDemoInCrop(page);

    // A crop + rotate recipe so both the app canvas and the server render carry
    // real geometry to compare.
    await page.getByTestId("crop-aspect-4x6").click();
    await page.getByTestId("crop-apply").click();
    await expect(stripDims(page)).toHaveText("4032 × 2688 px");
    await page.getByTestId("crop-rotate-right").click();
    await expect(stripDims(page)).toHaveText("2688 × 4032 px");

    await openExportPanel(page);
    // Settled zoom = the canvas has drawn the composed portrait geometry.
    await expect(page.getByTestId("photo-zoom")).toHaveText(/\d+%/);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByTestId("export-file").click(),
    ]);
    const out = testInfo.outputPath("export-parity.jpg");
    await download.saveAs(out);
    const exportB64 = (await readFile(out)).toString("base64");

    // In-page: fetch the exported full-res bytes back in, then compare a central
    // region of (a) the app canvas's drawn image box against (b) the exported
    // frame — both downscaled to the SAME N×N so resampler noise, not geometry,
    // dominates. The drawn box is reconstructed from PhotoCanvas' contain-fit
    // math: dispW/dispH depend only on the drawn image's aspect (the proxy/master
    // running-scale cancels), which is exactly the exported bitmap's aspect.
    const result = await page.evaluate(async (b64) => {
      const PAD = 24; // PhotoCanvas pasteboard margin
      const N = 220; // common sampling grid

      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));

      const canvas = document.querySelector('[data-testid="photo-canvas"]') as HTMLCanvasElement;
      const container = canvas.parentElement as HTMLElement;
      const dpr = window.devicePixelRatio || 1;
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;

      const aspect = bmp.width / bmp.height;
      const availW = Math.max(1, cssW - PAD * 2);
      const availH = Math.max(1, cssH - PAD * 2);
      const dispW = Math.min(availW, availH * aspect);
      const dispH = Math.min(availH, availW / aspect);
      const x = (cssW - dispW) / 2;
      const y = (cssH - dispH) / 2;

      const sample = (
        src: CanvasImageSource,
        sx: number,
        sy: number,
        sw: number,
        sh: number,
      ): Uint8ClampedArray => {
        const c = document.createElement("canvas");
        c.width = N;
        c.height = N;
        const ctx = c.getContext("2d")!;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(src, sx, sy, sw, sh, 0, 0, N, N);
        return ctx.getImageData(0, 0, N, N).data;
      };

      // App canvas image box addressed in DEVICE px; exported bitmap full frame.
      const app = sample(canvas, x * dpr, y * dpr, dispW * dpr, dispH * dpr);
      const exp = sample(bmp, 0, 0, bmp.width, bmp.height);

      // Mean-abs-diff over RGB across the central region — exclude a 15% margin
      // so the anti-aliased image edge and drop shadow never enter the compare.
      const lo = Math.floor(N * 0.15);
      const hi = Math.ceil(N * 0.85);
      let sum = 0;
      let count = 0;
      for (let yy = lo; yy < hi; yy++) {
        for (let xx = lo; xx < hi; xx++) {
          const i = (yy * N + xx) * 4;
          sum +=
            Math.abs(app[i] - exp[i]) +
            Math.abs(app[i + 1] - exp[i + 1]) +
            Math.abs(app[i + 2] - exp[i + 2]);
          count += 3;
        }
      }
      return { diff: sum / count, dpr, dispW: Math.round(dispW), dispH: Math.round(dispH) };
    }, exportB64);

    // eslint-disable-next-line no-console
    console.log(
      `[PE3 parity] mean-abs-diff=${result.diff.toFixed(3)} dpr=${result.dpr} disp=${result.dispW}x${result.dispH}`,
    );
    testInfo.annotations.push({ type: "parity-diff", description: result.diff.toFixed(3) });

    // Resampler + JPEG differences are expected (single digits); a geometry
    // misalignment (wrong crop window or orientation) would blow far past this.
    expect(result.diff).toBeLessThan(12);
  });

  test("a server error surfaces verbatim, clears the chip, and re-enables the button", async ({
    page,
  }) => {
    await openDemoInCrop(page);
    await openExportPanel(page);

    // Intercept the render POST with a typed 422 RenderError (the master-blob
    // load that precedes it reads a same-page object URL, never this route).
    await page.route("**/api/photo/render", async (route) => {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, code: "decode-failed", message: "Test error copy" }),
      });
    });

    await page.getByTestId("export-file").click();

    // The server's RenderError.message shows verbatim in the inline alert.
    await expect(page.getByTestId("export-error")).toBeVisible();
    await expect(
      page.getByTestId("export-error").getByText("Test error copy", { exact: true }),
    ).toBeVisible();

    // The finally ran: the chip cleared and the button is interactive again.
    await expect(page.getByTestId("photo-rendering-chip")).toHaveCount(0);
    await expect(page.getByTestId("export-file")).toBeEnabled();
  });
});

/**
 * Tone & colour (plan step PE4 done-when, docs/PHOTO_EDITOR_IMPLEMENTATION_PLAN.md
 * §4 PE4): the Adjust panel's LIVE bound sliders (absolute setpoints, param-aware
 * coalescing), the one-named-step Auto-enhance, the Compare click-vs-hold split
 * view, the hold-still peek that overrides split, and the server render honouring
 * an adjust recipe. Every case opens through openDemoInAdjust — the demo master is
 * 4032×3024, wrapped as IMG_4823.jpg by the `?demo=1` deep link.
 *
 * WAIT/SAMPLE DISCIPLINE (the house rule, commit 3cacdd0): openDemoInAdjust gates
 * on the settled fit-zoom readout; `settleCanvas` then waits for two identical
 * centre samples so the canvas has swapped the instant local preview for the
 * server proxy before any pixel is read (the proxy is the byte source undo/redo
 * must reproduce exactly). Slider drags are real boundingBox mouse gestures that
 * START on the current thumb (never fill()), so the down-move-up cycle fires the
 * live previews and the onPointerUp that commits one coalesced op.
 */

/** The demo master aspect (4032×3024). The proxy preserves it, so the contain-fit
    math that reconstructs the drawn-image box (PhotoCanvas' pad-24 model, shared
    with the PE3 parity test) only needs this ratio. */
const MASTER_ASPECT = 4032 / 3024;

/** The seven bound adjust sliders, by schema param (temperature reads "Warmth"). */
const ADJUST_PARAMS = [
  "brightness",
  "contrast",
  "exposure",
  "highlights",
  "shadows",
  "saturation",
  "temperature",
] as const;

/**
 * Open the demo through the `?demo=1` deep link (wire-pinned "IMG_4823.jpg") and
 * enter the Adjust tool — the shared setup for every PE4 case. Mirrors
 * openDemoInCrop: waits for the settled fit-zoom readout before driving.
 */
async function openDemoInAdjust(page: Page) {
  await page.goto("/photo?demo=1");
  await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByTestId("photo-filename")).toHaveText("IMG_4823.jpg", { timeout: 30_000 });
  await expect(page.getByTestId("photo-zoom")).toHaveText(/\d+%/, { timeout: 30_000 });
  await page.getByTestId("photo-rail-adjust").click();
  await expect(page.getByTestId("photo-adjust-panel")).toBeVisible();
}

/** Sum + raw bytes of a 16×16 block at the canvas backing-store centre. The sum
    detects change; the bytes prove an exact (byte-for-byte) undo/redo restore. */
async function sampleCentre(page: Page): Promise<{ sum: number; bytes: number[] }> {
  return page.getByTestId("photo-canvas").evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    const x = Math.floor(c.width * 0.5);
    const y = Math.floor(c.height * 0.5);
    const d = ctx.getImageData(x - 8, y - 8, 16, 16).data;
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i];
    return { sum, bytes: Array.from(d) };
  });
}

/** Wait until the canvas has settled (two identical centre samples) — the instant
    local preview has been replaced by the server proxy and no repaint is pending,
    so every downstream pixel read is stable. */
async function settleCanvas(page: Page): Promise<void> {
  let prev: number | null = null;
  await expect
    .poll(
      async () => {
        const cur = (await sampleCentre(page)).sum;
        const same = prev !== null && cur === prev;
        prev = cur;
        return same;
      },
      { timeout: 15_000, intervals: [150, 200, 300, 400, 600] },
    )
    .toBe(true);
}

/**
 * Reconstruct the drawn-image box (PhotoCanvas' contain-fit, pad 24) and sum a
 * 12×12 block at the far-left quarter (30%) and far-right quarter (70%) of the
 * image, both at mid-height. With the split divider at 50%, the left quarter is on
 * the BEFORE side and the right quarter on the AFTER side.
 */
async function sampleHalves(page: Page, aspect: number): Promise<{ left: number; right: number }> {
  return page.getByTestId("photo-canvas").evaluate((el, asp) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    const container = c.parentElement as HTMLElement;
    const PAD = 24;
    const dpr = window.devicePixelRatio || 1;
    const cssW = container.clientWidth;
    const cssH = container.clientHeight;
    const availW = Math.max(1, cssW - PAD * 2);
    const availH = Math.max(1, cssH - PAD * 2);
    const dispW = Math.min(availW, availH * asp);
    const dispH = Math.min(availH, availW / asp);
    const x = (cssW - dispW) / 2;
    const y = (cssH - dispH) / 2;
    const at = (fx: number, fy: number) => {
      const px = Math.round((x + dispW * fx) * dpr);
      const py = Math.round((y + dispH * fy) * dpr);
      const d = ctx.getImageData(px - 6, py - 6, 12, 12).data;
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i];
      return s;
    };
    return { left: at(0.3, 0.5), right: at(0.7, 0.5) };
  }, aspect);
}

/**
 * Drive a bound adjust slider with a real mouse drag. The drag STARTS on the
 * current thumb (computed from the bound value, −100..+100) so it grabs the thumb
 * wherever the recipe left it, then drags to `targetFrac` of the track. The
 * down-move-up cycle fires the live onChange previews and the onPointerUp that
 * commits exactly one coalesced op (fill() would bypass the pointer gestures the
 * coalesce rule hangs off).
 */
async function dragAdjust(page: Page, param: string, targetFrac: number) {
  const slider = page.getByTestId(`adjust-${param}`);
  const box = await slider.boundingBox();
  if (!box) throw new Error(`adjust-${param} slider has no bounding box`);
  const y = box.y + box.height / 2;
  const cur = Number(await slider.inputValue());
  const curFrac = (cur + 100) / 200;
  await page.mouse.move(box.x + curFrac * box.width, y);
  await page.mouse.down();
  await page.mouse.move(box.x + targetFrac * box.width, y, { steps: 8 });
  await page.mouse.up();
}

/** A quick Compare click (< COMPARE_HOLD_MS): down-then-up with no dwell toggles
    split view (a hold would peek). Manual gesture so the press duration is pinned. */
async function quickClickCompare(page: Page) {
  const box = await page.getByTestId("photo-compare").boundingBox();
  if (!box) throw new Error("compare button has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

/** `History · N` → N. */
async function historyCount(page: Page): Promise<number> {
  const t = (await page.getByTestId("photo-history").textContent()) ?? "";
  const m = t.match(/(\d+)/u);
  return m ? Number(m[1]) : NaN;
}

/** Open the history dock (idempotent) and return its step labels in order. */
async function historyStepLabels(page: Page): Promise<string[]> {
  const dock = page.getByTestId("photo-history-dock");
  if (!(await dock.isVisible())) {
    await page.getByTestId("photo-history").click();
    await expect(dock).toBeVisible();
  }
  return dock.locator("[data-testid^='history-step-']").allTextContents();
}

/** Close the history dock if open (Escape — the dock's own listener). */
async function closeHistoryDock(page: Page) {
  const dock = page.getByTestId("photo-history-dock");
  if (await dock.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(dock).toHaveCount(0);
  }
}

/**
 * Arm a latch on the Auto-enhance button BEFORE clicking it, so the async
 * (fetch proxy → decode → computeAutoEnhance → maybe push) can be waited on
 * deterministically. A MutationObserver records: the busy toggle (the button's
 * `disabled` attribute goes true then false — reliable even if fast, since the
 * two flips are separated by the fetch await), and whether the transient
 * "Already looks balanced" text ever appeared (caught even if it reverts before
 * the next poll). Same latch pattern as the PE3 rendering-chip observer.
 */
async function installEnhanceLatch(page: Page, testid: string) {
  await page.evaluate((id) => {
    const w = window as unknown as {
      __ae?: { sawBusy: boolean; busyEnded: boolean; balancedSeen: boolean };
      __aeObs?: MutationObserver;
    };
    const btn = document.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
    if (!btn) throw new Error("auto-enhance button not found");
    w.__aeObs?.disconnect();
    const st = { sawBusy: false, busyEnded: false, balancedSeen: false };
    w.__ae = st;
    const check = () => {
      if (btn.disabled) st.sawBusy = true;
      else if (st.sawBusy) st.busyEnded = true;
      if ((btn.textContent ?? "").includes("balanced")) st.balancedSeen = true;
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(btn, {
      attributes: true,
      attributeFilter: ["disabled"],
      childList: true,
      subtree: true,
      characterData: true,
    });
    w.__aeObs = obs;
  }, testid);
}

/** Wait for the armed Auto-enhance run to resolve (busy toggled back off, or the
    balanced flag flashed for the no-op branch). */
async function waitEnhanceSettled(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = (window as unknown as { __ae?: { busyEnded: boolean; balancedSeen: boolean } }).__ae;
          return !!s && (s.busyEnded || s.balancedSeen);
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
}

/** Did the Auto-enhance latch ever see the "Already looks balanced" state? */
async function enhanceBalancedSeen(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { __ae?: { balancedSeen: boolean } }).__ae?.balancedSeen ?? false,
  );
}

test.describe("Tone & color (PE4)", () => {
  test("slider chain: Brightness coalesces, Contrast is param-aware, the proxy repaints", async ({
    page,
  }) => {
    await openDemoInAdjust(page);
    await settleCanvas(page);
    const before = await sampleCentre(page);
    await expectHistory(page, 1);

    // First Brightness drag commits one adjust op → Open + Brightness = 2 steps.
    await dragAdjust(page, "brightness", 0.78);
    await expectHistory(page, 2);
    // A second, SEPARATE Brightness drag REPLACES the trailing same-param op in
    // place (the coalesce rule) — the count must not climb.
    await dragAdjust(page, "brightness", 0.86);
    await expectHistory(page, 2);

    // The dock confirms exactly one Brightness step, no stacking.
    const steps = await historyStepLabels(page);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toBe("Open IMG_4823.jpg");
    expect(steps[1]).toMatch(/^Brightness [+−]\d+$/u);
    await closeHistoryDock(page);

    // Contrast is a DIFFERENT param, so it APPENDS (param-aware coalesce never
    // swallows it) → History · 3 with a distinct Contrast step.
    await dragAdjust(page, "contrast", 0.7);
    await expectHistory(page, 3);
    const steps2 = await historyStepLabels(page);
    expect(steps2).toHaveLength(3);
    expect(steps2[1]).toMatch(/^Brightness [+−]\d+$/u);
    expect(steps2[2]).toMatch(/^Contrast [+−]\d+$/u);
    await closeHistoryDock(page);

    // The tone edits actually repainted the proxy: the centre moved off its
    // pre-drag value.
    await expect.poll(async () => (await sampleCentre(page)).sum !== before.sum).toBe(true);
  });

  test("auto-enhance is one coalesced named step (re-run never adds a second)", async ({ page }) => {
    await openDemoInAdjust(page);
    await expectHistory(page, 1);

    await installEnhanceLatch(page, "adjust-auto-enhance");
    await page.getByTestId("adjust-auto-enhance").click();
    await waitEnhanceSettled(page);

    const n1 = await historyCount(page);
    let autoCount1: number;
    if (n1 === 2) {
      // The demo carries a colour cast, so auto-enhance chooses real setpoints:
      // one "Auto-enhance" step lands and the bound sliders reflect the values.
      const steps = await historyStepLabels(page);
      expect(steps).toHaveLength(2);
      expect(steps[0]).toBe("Open IMG_4823.jpg");
      expect(steps[1]).toBe("Auto-enhance");
      autoCount1 = steps.filter((s) => s === "Auto-enhance").length;
      await closeHistoryDock(page);

      const readouts = await Promise.all(
        ADJUST_PARAMS.map((p) => page.getByTestId(`adjust-${p}`).inputValue()),
      );
      expect(readouts.some((v) => v !== "0")).toBe(true);
    } else {
      // Defensive branch: the proxy was already balanced — no step is pushed
      // (an identity op would be a dishonest history entry) and the transient
      // "Already looks balanced" state showed instead.
      expect(n1).toBe(1);
      expect(await enhanceBalancedSeen(page)).toBe(true);
      autoCount1 = 0;
    }

    // Run it again. Coalesce REPLACES the trailing auto-enhance (changed branch)
    // or it stays balanced — either way the count is unchanged and NO second
    // "Auto-enhance" step ever appears.
    await installEnhanceLatch(page, "adjust-auto-enhance");
    await page.getByTestId("adjust-auto-enhance").click();
    await waitEnhanceSettled(page);

    expect(await historyCount(page)).toBe(n1);
    const steps2 = await historyStepLabels(page);
    const autoCount2 = steps2.filter((s) => s === "Auto-enhance").length;
    expect(autoCount2).toBe(autoCount1);
    expect(autoCount2).toBeLessThanOrEqual(1);
    await closeHistoryDock(page);
  });

  test("undo restores the pre-adjust pixel exactly; redo re-applies it", async ({ page }) => {
    await openDemoInAdjust(page);
    await settleCanvas(page);
    const p0 = await sampleCentre(page);
    const p0key = JSON.stringify(p0.bytes);

    // Auto-enhance is the tone op under test (per the done-when). If the proxy
    // happened to be balanced, fall back to a manual Brightness so there is a
    // real op to undo — the invariant (exact restore) is identical either way.
    await installEnhanceLatch(page, "adjust-auto-enhance");
    await page.getByTestId("adjust-auto-enhance").click();
    await waitEnhanceSettled(page);
    if ((await historyCount(page)) !== 2) {
      await dragAdjust(page, "brightness", 0.85);
      await expectHistory(page, 2);
    }

    // The tone op moved the centre off its pre-adjust bytes.
    await expect.poll(async () => JSON.stringify((await sampleCentre(page)).bytes) !== p0key).toBe(true);
    const p1key = JSON.stringify((await sampleCentre(page)).bytes);

    // Undo → the integer LUT is deterministic, so the centre returns to its EXACT
    // pre-adjust bytes; redo re-applies them exactly.
    await page.getByTestId("photo-undo").click();
    await expect.poll(async () => JSON.stringify((await sampleCentre(page)).bytes)).toBe(p0key);
    await page.getByTestId("photo-redo").click();
    await expect.poll(async () => JSON.stringify((await sampleCentre(page)).bytes)).toBe(p1key);
  });

  test("Compare quick-click opens split view; before/after differ; divider drags; toggles off", async ({
    page,
  }) => {
    await openDemoInAdjust(page);
    await settleCanvas(page);

    // Original references at the two quarter points (before any adjust).
    const orig = await sampleHalves(page, MASTER_ASPECT);

    // A strong Brightness so the after side is unmistakably lifted.
    await dragAdjust(page, "brightness", 0.9);
    await expectHistory(page, 2);
    await expect
      .poll(async () => (await sampleHalves(page, MASTER_ASPECT)).right > orig.right + 1000)
      .toBe(true);

    // Quick-click Compare → split view on, chrome visible.
    await quickClickCompare(page);
    await expect(page.getByTestId("photo-compare")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("photo-split-divider")).toBeVisible();
    await expect(page.getByTestId("photo-split-before")).toBeVisible();
    await expect(page.getByTestId("photo-split-after")).toBeVisible();

    // Divider at 50%: right quarter is the AFTER side (brightened), left quarter
    // the BEFORE side (original). The after side is clearly lifted; the before
    // side tracks the original — the two halves genuinely differ.
    const split = await sampleHalves(page, MASTER_ASPECT);
    const brightShift = split.right - orig.right;
    expect(brightShift).toBeGreaterThan(1500);
    expect(Math.abs(split.left - orig.left)).toBeLessThan(brightShift * 0.3);

    // Drag the divider ~200px left → the handle box moves left.
    const box0 = await page.getByTestId("photo-split-divider").boundingBox();
    if (!box0) throw new Error("divider has no bounding box");
    const hx = box0.x + box0.width / 2;
    const hy = box0.y + box0.height / 2;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx - 200, hy, { steps: 10 });
    await page.mouse.up();
    const box1 = await page.getByTestId("photo-split-divider").boundingBox();
    if (!box1) throw new Error("divider has no bounding box after drag");
    expect(box1.x).toBeLessThan(box0.x - 50);

    // Quick-click Compare again → split off, divider gone.
    await quickClickCompare(page);
    await expect(page.getByTestId("photo-compare")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("photo-split-divider")).toHaveCount(0);
  });

  test("hold-still peek during split equalizes both halves; release restores after", async ({
    page,
  }) => {
    await openDemoInAdjust(page);
    await settleCanvas(page);
    const orig = await sampleHalves(page, MASTER_ASPECT);

    await dragAdjust(page, "brightness", 0.9);
    await expectHistory(page, 2);

    // Enter split view (quick click). The after side is now lifted vs original.
    await quickClickCompare(page);
    await expect(page.getByTestId("photo-split-divider")).toBeVisible();
    const split = await sampleHalves(page, MASTER_ASPECT);
    const adjDelta = split.right - orig.right;
    expect(adjDelta).toBeGreaterThan(1500);

    // Press-and-HOLD the Compare button: crossing COMPARE_HOLD_MS arms the peek,
    // which OVERRIDES split view — both halves paint the raw original. (Shipped
    // mechanism: the ActionBar Compare button pointer-hold, the PE4-specific path;
    // the canvas Space-peek is already covered by the PE2 compare test.)
    const cb = await page.getByTestId("photo-compare").boundingBox();
    if (!cb) throw new Error("compare button has no bounding box");
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await page.mouse.down();
    try {
      // While held: poll until the after side reverts to its original value
      // (the timer arms the peek at 300 ms; the poll only resolves once it has,
      // so the effective hold is well past the threshold).
      await expect
        .poll(async () => Math.abs((await sampleHalves(page, MASTER_ASPECT)).right - orig.right) < adjDelta * 0.25)
        .toBe(true);
      // Both halves now read raw original (equalized).
      const held = await sampleHalves(page, MASTER_ASPECT);
      expect(Math.abs(held.right - orig.right)).toBeLessThan(adjDelta * 0.25);
      expect(Math.abs(held.left - orig.left)).toBeLessThan(adjDelta * 0.25);
    } finally {
      await page.mouse.up();
    }

    // Release → split view resumes, the after side is lifted again.
    await expect
      .poll(async () => Math.abs((await sampleHalves(page, MASTER_ASPECT)).right - split.right) < adjDelta * 0.25)
      .toBe(true);
  });

  test("server export honors the adjust recipe: the exported centre is brighter", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await openDemoInAdjust(page);

    // Sum a 64×64 central block of an exported file (RGB, JPEG has no alpha).
    const centreSum = async (file: string): Promise<number> => {
      const meta = await sharp(file).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      const raw = await sharp(file)
        .extract({ left: Math.floor(w / 2) - 32, top: Math.floor(h / 2) - 32, width: 64, height: 64 })
        .raw()
        .toBuffer();
      let s = 0;
      for (let i = 0; i < raw.length; i++) s += raw[i];
      return s;
    };

    // Baseline export — an empty recipe (no tone ops).
    await page.getByTestId("photo-rail-export").click();
    await expect(page.getByTestId("photo-export-panel")).toBeVisible();
    const [dlBase] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByTestId("export-file").click(),
    ]);
    const baseFile = testInfo.outputPath("pe4-export-base.jpg");
    await dlBase.saveAs(baseFile);
    const baseSum = await centreSum(baseFile);

    // Apply a strong Brightness in the Adjust tool, then export again.
    await page.getByTestId("photo-rail-adjust").click();
    await expect(page.getByTestId("photo-adjust-panel")).toBeVisible();
    await dragAdjust(page, "brightness", 0.78);
    await expectHistory(page, 2);

    await page.getByTestId("photo-rail-export").click();
    await expect(page.getByTestId("photo-export-panel")).toBeVisible();
    const [dlBright] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByTestId("export-file").click(),
    ]);
    expect(dlBright.suggestedFilename()).toBe("IMG_4823-edited.jpg");
    const brightFile = testInfo.outputPath("pe4-export-bright.jpg");
    await dlBright.saveAs(brightFile);
    const brightSum = await centreSum(brightFile);

    // The server replayed the Brightness op → the same centre region is
    // measurably lighter (well beyond JPEG noise).
    expect(brightSum).toBeGreaterThan(baseSum + 5000);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Print correctness (PE5)                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Print correctness (plan step PE5 done-when, docs/PHOTO_EDITOR_IMPLEMENTATION_PLAN.md
 * §4 PE5): the print strip's live DPI chip (green/amber/red with the wire's
 * size-qualified copy, advisory NEVER blocking), the Fix-for-print panel's bleed /
 * fit-to-size / numeric-resize ops, the trim/bleed/safe guide chrome, the one-click
 * Convert-to-CMYK path, and the print-safe export pair (TIFF + PDF·print) carrying
 * the GRACoL separation and the MediaBox/TrimBox/BleedBox + GRACoL OutputIntent.
 *
 * These are the first tests that drive the STRIP as the primary surface, so they
 * open the demo through the `?demo=1` deep link (wire-pinned "IMG_4823.jpg", master
 * 4032×3024, an RGB arrival → intent defaults to sRGB) to the SETTLED fit-zoom
 * readout and then assert off store-backed signals: the strip's effective-dims
 * readout (`photo-strip-dims`) and the docked named-step history. Every expected
 * number is COMPUTED in-test from the same min-axis best-orientation arithmetic the
 * code derives (effectiveDpi / bleedPx / solveFit ports below) — only the
 * wire-pinned figures (672 DPI, the 306×450 MediaBox, the 9 pt bleed inset) are
 * asserted as literals, because those ARE the spec (plan §5, open question #7).
 *
 * Print exports are full-res 12 MP replays through the sharp jail (CMYK separates
 * through the committed GRACoL profile, ≈1.6 s per the v1.4 spike), so the block
 * runs with extra headroom and downloads get 60 s.
 */

/** effectiveDpi port (geometry.ts): the limiting axis of each orientation, the
    better of the two, floored — the strip's own DPI arithmetic, recomputed here so
    the expected number is derived from the live strip dims, never hardcoded. */
function computeDpi(px: { w: number; h: number }, inches: { w: number; h: number }): number {
  const upright = Math.min(px.w / inches.w, px.h / inches.h);
  const turned = Math.min(px.w / inches.h, px.h / inches.w);
  return Math.floor(Math.max(upright, turned));
}

/** dpiVerdict port (geometry.ts): ≥300 green, ≥100 amber, <100 red. */
function computeVerdict(dpi: number): "green" | "amber" | "red" {
  return dpi >= 300 ? "green" : dpi >= 100 ? "amber" : "red";
}

/** dpiChipCopy port (geometry.ts): green/amber NAME the size, red is size-agnostic. */
function computeChipCopy(dpi: number, verdict: "green" | "amber" | "red", sizeLabel: string): string {
  if (verdict === "green") return `${dpi} DPI — great at ${sizeLabel}`;
  if (verdict === "amber") return `${dpi} DPI — may look soft at ${sizeLabel}`;
  return `${dpi} DPI — too low at this size`;
}

/** Read the strip's live effective dims ("4032 × 3024 px") as integers. */
async function readStripDims(page: Page): Promise<{ w: number; h: number }> {
  const t = (await stripDims(page).textContent()) ?? "";
  const nums = t.match(/\d+/g) ?? [];
  if (nums.length < 2) throw new Error(`strip dims unreadable: "${t}"`);
  return { w: Number(nums[0]), h: Number(nums[1]) };
}

/** Open the corpus demo (`?demo=1` → IMG_4823.jpg) to the settled canvas, no tool
    active — the shared PE5 setup (mirrors openDemoInCrop's waits, but the strip,
    not a panel, is the surface under test). */
async function openDemoForPrint(page: Page) {
  await page.goto("/photo?demo=1");
  await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByTestId("photo-filename")).toHaveText("IMG_4823.jpg", { timeout: 30_000 });
  await expect(page.getByTestId("photo-zoom")).toHaveText(/\d+%/, { timeout: 30_000 });
}

/** Set the print target to a PRINT_SIZES sku through the strip's `Change ▾`
    dropdown (a document mutation — no history op). */
async function pickTargetViaStrip(page: Page, sku: string) {
  await page.getByTestId("photo-target-change").click();
  await expect(page.getByTestId("photo-target-menu")).toBeVisible();
  await page.getByTestId(`photo-target-size-${sku}`).click();
  await expect(page.getByTestId("photo-target-menu")).toHaveCount(0);
}

/** Drive the Fix-for-print numeric resize to exact dims and confirm the strip
    lands on them (the deterministic way to shrink effective pixels — a handle-drag
    crop can't hit a precise DPI band across canvas sizes; the DPI verdict logic is
    identical whichever geometry op shrank the raster). */
async function resizeVia(page: Page, w: number, h: number) {
  await page.getByTestId("fixprint-resize-w").fill(String(w));
  await page.getByTestId("fixprint-resize-h").fill(String(h));
  await page.getByTestId("fixprint-resize-apply").click();
  await expect(stripDims(page)).toHaveText(`${w} × ${h} px`);
}

/** Click Export file, save the download, return the on-disk path. */
async function exportAndSave(
  page: Page,
  testInfo: import("@playwright/test").TestInfo,
  filename: string,
): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByTestId("export-file").click(),
  ]);
  const out = testInfo.outputPath(filename);
  await download.saveAs(out);
  // The render resolved (the download fired) → the button re-enables; wait for it
  // so a follow-up export in the same test never races the rendering guard.
  await expect(page.getByTestId("export-file")).toBeEnabled();
  return out;
}

test.describe("Print correctness (PE5)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("the worked example: 672 green at 4×6, then amber and red as dims shrink — advisory never blocks export", async ({
    page,
  }, testInfo) => {
    await openDemoForPrint(page);
    const chip = page.getByTestId("photo-dpi-chip");

    // Before a target: the neutral prompt, no verdict.
    await expect(chip).toHaveAttribute("data-verdict", "none");
    await expect(chip).toHaveText("Pick a print size to check DPI");

    // Pick 4 × 6 → the wire-pinned worked example: 4032×3024 @ 4×6 = 672 DPI, green,
    // copy verbatim (672 is spec, asserted as a literal).
    await pickTargetViaStrip(page, "4x6");
    await expect(stripDims(page)).toHaveText("4032 × 3024 px");
    await expect(chip).toHaveAttribute("data-verdict", "green");
    await expect(chip).toHaveText("672 DPI — great at 4 × 6");
    // Sanity: the strip's arithmetic reproduces 672 from the live dims.
    expect(computeDpi(await readStripDims(page), { w: 4, h: 6 })).toBe(672);

    // Enter Fix for print to reach the numeric resize (shrinks effective px
    // deterministically — see resizeVia's note).
    await page.getByTestId("photo-rail-fixprint").click();
    await expect(page.getByTestId("photo-fixprint-panel")).toBeVisible();

    // ── AMBER ── shrink until 100 ≤ DPI < 300. Compute the expected verdict + copy
    // from the resulting strip dims (never hardcode the derived DPI).
    await resizeVia(page, 1200, 900);
    {
      const dims = await readStripDims(page);
      const dpi = computeDpi(dims, { w: 4, h: 6 });
      const verdict = computeVerdict(dpi);
      expect(verdict).toBe("amber"); // guards the test's own choice of dims
      // Close the panel so the chip's click-through is tested from the no-tool
      // state (a real navigation, not a no-op while already in Fix for print).
      await page.getByTestId("photo-panel-close").click();
      await expect(page.getByTestId("photo-fixprint-panel")).toHaveCount(0);
      await expect(chip).toHaveAttribute("data-verdict", "amber");
      await expect(chip).toContainText(computeChipCopy(dpi, verdict, "4 × 6"));
      await expect(page.getByTestId("photo-dpi-fix")).toHaveText("Fix →");
      // Amber "Fix →" navigates to Fix for print.
      await page.getByTestId("photo-dpi-fix").click();
      await expect(page.getByTestId("photo-fixprint-panel")).toBeVisible();
    }

    // ── RED ── shrink further to DPI < 100. Copy is size-agnostic ("too low at
    // this size"), action becomes "Upscale →".
    await resizeVia(page, 500, 375);
    {
      const dims = await readStripDims(page);
      const dpi = computeDpi(dims, { w: 4, h: 6 });
      const verdict = computeVerdict(dpi);
      expect(verdict).toBe("red");
      await page.getByTestId("photo-panel-close").click();
      await expect(page.getByTestId("photo-fixprint-panel")).toHaveCount(0);
      await expect(chip).toHaveAttribute("data-verdict", "red");
      await expect(chip).toContainText(computeChipCopy(dpi, verdict, "4 × 6"));
      await expect(page.getByTestId("photo-dpi-fix")).toHaveText("Upscale →");
      await page.getByTestId("photo-dpi-fix").click();
      await expect(page.getByTestId("photo-fixprint-panel")).toBeVisible();
    }

    // NO EXPORT BLOCKING: a red chip is advisory — a JPG export still succeeds,
    // shipping the shrunk raster (500 × 375) to disk.
    await page.getByTestId("photo-rail-export").click();
    await expect(page.getByTestId("photo-export-panel")).toBeVisible();
    const out = await exportAndSave(page, testInfo, "pe5-red-export.jpg");
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(500);
    expect(meta.height).toBe(375);
  });

  test("bleed chain: not-set → Add → Apply pushes one 'Expand bleed 0.125 in' step, the strip flips, dims grow 2×84 px, guides render", async ({
    page,
  }) => {
    await openDemoForPrint(page);
    await pickTargetViaStrip(page, "4x6");

    // Guides render whenever a target is set and Crop isn't active (here: no tool).
    await expect(page.getByTestId("photo-guide-chrome")).toBeVisible();
    await expect(page.getByTestId("photo-guide-legend")).toBeVisible();

    // Bleed is "not set" with an Add affordance; history sits at the Open step.
    await expect(page.getByTestId("photo-print-strip")).toContainText("Bleed: not set");
    await expect(page.getByTestId("photo-bleed-add")).toBeVisible();
    await expectHistory(page, 1);

    // Add → opens Fix for print; Expand to bleed pushes exactly one step.
    await page.getByTestId("photo-bleed-add").click();
    await expect(page.getByTestId("photo-fixprint-panel")).toBeVisible();
    await page.getByTestId("fixprint-bleed-apply").click();

    // Effective dims grow by 2 × bleedPx(0.125 in) per axis. bleedPx =
    // round(0.125 × effectiveDpi) = round(0.125 × 672) = 84 → 4032×3024 → 4200×3192.
    const src = { w: 4032, h: 3024 };
    const px = Math.max(1, Math.round(0.125 * computeDpi(src, { w: 4, h: 6 })));
    expect(px).toBe(84);
    await expect(stripDims(page)).toHaveText(`${src.w + 2 * px} × ${src.h + 2 * px} px`);
    await expect(stripDims(page)).toHaveText("4200 × 3192 px");

    // Exactly one new history step, wire-pinned label; strip flips to the ✓ state.
    await expectHistory(page, 2);
    const labels = await historyStepLabels(page);
    expect(labels).toEqual(["Open IMG_4823.jpg", "Expand bleed 0.125 in"]);
    await closeHistoryDock(page);

    await expect(page.getByTestId("photo-bleed-state")).toBeVisible();
    await expect(page.getByTestId("photo-bleed-state")).toContainText("0.125 in");
    await expect(page.getByTestId("photo-bleed-add")).toHaveCount(0);

    // Guides still render after the bleed applies (target set, Fix-for-print active).
    await expect(page.getByTestId("photo-guide-chrome")).toBeVisible();
  });

  test("fit to size: fill + an off-center anchor is one 'Fit to size · fill' step matching the stored crop; undo restores", async ({
    page,
  }) => {
    await openDemoForPrint(page);
    await pickTargetViaStrip(page, "4x6");
    await page.getByTestId("photo-rail-fixprint").click();
    await expect(page.getByTestId("photo-fixprint-panel")).toBeVisible();

    const eff0 = await readStripDims(page); // 4032 × 3024
    await expectHistory(page, 1);

    // Fill mode + an off-center (top-left) anchor.
    await page.getByTestId("fixprint-fit-fill").click();
    await expect(page.getByTestId("fixprint-fit-fill")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("fixprint-anchor-0").click();
    await expect(page.getByTestId("fixprint-anchor-0")).toHaveAttribute("aria-pressed", "true");

    // Expected fill crop = solveFit port: the panel orients 4×6 to the image
    // (landscape → aspect 1.5), then fill = the largest 1.5-aspect rect inside the
    // image. Anchor only shifts x/y, so the stored rect's DIMS are anchor-independent.
    const baseA = 4 / 6;
    const imgA = eff0.w / eff0.h;
    const targetA = Math.abs(baseA - imgA) <= Math.abs(1 / baseA - imgA) ? baseA : 1 / baseA;
    const rw = Math.min(eff0.w, eff0.h * targetA);
    const fw = Math.min(eff0.w, Math.max(1, Math.round(rw)));
    const fh = Math.min(eff0.h, Math.max(1, Math.round(rw / targetA)));
    expect({ w: fw, h: fh }).toEqual({ w: 4032, h: 2688 }); // guards the port

    await page.getByTestId("fixprint-fit-apply").click();
    await expect(stripDims(page)).toHaveText(`${fw} × ${fh} px`);
    await expectHistory(page, 2);
    const labels = await historyStepLabels(page);
    expect(labels).toEqual(["Open IMG_4823.jpg", "Fit to size · fill"]);
    await closeHistoryDock(page);

    // Undo restores the pre-fit raster and the cursor.
    await page.getByTestId("photo-undo").click();
    await expect(stripDims(page)).toHaveText(`${eff0.w} × ${eff0.h} px`);
    await expectHistory(page, 1);
  });

  test("numeric resize: Apply matches the strip and labels the step 'Resize to W × H px'", async ({
    page,
  }) => {
    await openDemoForPrint(page);
    await page.getByTestId("photo-rail-fixprint").click();
    await expect(page.getByTestId("photo-fixprint-panel")).toBeVisible();
    await expectHistory(page, 1);

    // Enter exact dims; the strip lands on them and the step is wire-labelled.
    await resizeVia(page, 1600, 1200);
    await expectHistory(page, 2);
    const labels = await historyStepLabels(page);
    expect(labels).toEqual(["Open IMG_4823.jpg", "Resize to 1600 × 1200 px"]);
    await closeHistoryDock(page);
  });

  test("one-click CMYK + TIFF export: cmyk TIFF is 4-channel with an ICC profile; sRGB TIFF is 3-channel", async ({
    page,
  }, testInfo) => {
    await openDemoForPrint(page);

    // The RGB arrival starts on sRGB intent with the one-click convert affordance.
    await expect(page.getByTestId("photo-print-strip")).toContainText("sRGB · converted for press at export");
    await expect(page.getByTestId("photo-convert-cmyk")).toBeVisible();

    // One click flips the intent → the strip note reads CMYK.
    await page.getByTestId("photo-convert-cmyk").click();
    await expect(page.getByTestId("photo-print-strip")).toContainText("CMYK · GRACoL at export");

    // The Export panel's intent segment reflects the document.
    await page.getByTestId("photo-rail-export").click();
    await expect(page.getByTestId("photo-export-panel")).toBeVisible();
    await expect(page.getByTestId("export-intent-cmyk")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("export-intent-srgb")).toHaveAttribute("aria-pressed", "false");

    // TIFF export → separated through GRACoL: 4-channel CMYK with the profile embedded.
    await page.getByTestId("export-format-tiff").click();
    await expect(page.getByTestId("export-format-tiff")).toHaveAttribute("aria-pressed", "true");
    const cmykOut = await exportAndSave(page, testInfo, "pe5-cmyk.tif");
    const cmykMeta = await sharp(cmykOut).metadata();
    expect(cmykMeta.format).toBe("tiff");
    expect(cmykMeta.space).toBe("cmyk");
    expect(cmykMeta.channels).toBe(4);
    expect(Buffer.isBuffer(cmykMeta.icc)).toBe(true);
    expect((cmykMeta.icc as Buffer).length).toBeGreaterThan(0);

    // Switch back to sRGB via the segment → a 3-channel sRGB TIFF.
    await page.getByTestId("export-intent-srgb").click();
    await expect(page.getByTestId("export-intent-srgb")).toHaveAttribute("aria-pressed", "true");
    const srgbOut = await exportAndSave(page, testInfo, "pe5-srgb.tif");
    const srgbMeta = await sharp(srgbOut).metadata();
    expect(srgbMeta.format).toBe("tiff");
    expect(srgbMeta.space).toBe("srgb");
    expect(srgbMeta.channels).toBe(3);
  });

  test("PDF boxes from the UI: 4×6 + bleed + CMYK → MediaBox/TrimBox/BleedBox, GRACoL OutputIntent, DeviceCMYK", async ({
    page,
  }, testInfo) => {
    await openDemoForPrint(page);
    await pickTargetViaStrip(page, "4x6");
    await page.getByTestId("photo-rail-fixprint").click();
    await expect(page.getByTestId("photo-fixprint-panel")).toBeVisible();

    // FULL-RESOLUTION on purpose — this is the regression test for the PE5 e2e
    // finding: the 13.4 MP bleed-expanded CMYK JPEG encode used to exhaust the
    // render host's RLIMIT_AS ("VipsJpeg: Insufficient memory (case 4)" —
    // mozjpeg buffers the whole image for CMYK). Fixed by dropping mozjpeg for
    // CMYK encodes in photo-worker.mjs + a 4 GiB AS ceiling in limits.ts; if
    // either regresses, this download fails as a decode-failed render error.

    // Apply bleed (the fixprint panel's Expand-to-bleed) — "bleed applied".
    await page.getByTestId("fixprint-bleed-apply").click();
    await expect(page.getByTestId("photo-bleed-state")).toContainText("0.125 in");

    // Convert to CMYK so the PDF carries a DeviceCMYK image + the GRACoL intent.
    await page.getByTestId("photo-convert-cmyk").click();
    await expect(page.getByTestId("photo-print-strip")).toContainText("CMYK · GRACoL at export");

    // Export the PDF·print.
    await page.getByTestId("photo-rail-export").click();
    await expect(page.getByTestId("photo-export-panel")).toBeVisible();
    await page.getByTestId("export-format-pdf").click();
    await expect(page.getByTestId("export-format-pdf")).toHaveAttribute("aria-pressed", "true");

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByTestId("export-file").click(),
    ]);
    expect(download.suggestedFilename()).toBe("IMG_4823-edited.pdf");
    const out = testInfo.outputPath("pe5-boxes.pdf");
    await download.saveAs(out);

    // Read the PDF bytes and assert the print geometry the RIP reads. 4×6 trim +
    // 0.125 in bleed at 72 pt/in → MediaBox/BleedBox = (4.25×6.25)·72 = 306×450;
    // TrimBox inset by 0.125·72 = 9 → [9 9 297 441]. These are wire-pinned.
    const text = (await readFile(out)).toString("latin1");
    expect(text).toMatch(/\/MediaBox\s*\[0 0 306 450\]/);
    expect(text).toMatch(/\/TrimBox\s*\[9 9 297 441\]/);
    expect(text).toMatch(/\/BleedBox\s*\[0 0 306 450\]/); // BleedBox == MediaBox
    expect(text).toMatch(/\/GTS_PDFX/); // the GRACoL OutputIntent subtype
    expect(text).toMatch(/\/DeviceCMYK/); // cmyk intent → DeviceCMYK image
  });

  test("PNG downgrade honesty: cmyk intent + PNG export notes the sRGB downgrade and ships a 3-channel sRGB PNG", async ({
    page,
  }, testInfo) => {
    await openDemoForPrint(page);

    // Convert to CMYK, then choose PNG (which can't carry CMYK).
    await page.getByTestId("photo-convert-cmyk").click();
    await expect(page.getByTestId("photo-print-strip")).toContainText("CMYK · GRACoL at export");

    await page.getByTestId("photo-rail-export").click();
    await expect(page.getByTestId("photo-export-panel")).toBeVisible();
    await page.getByTestId("export-format-png").click();
    await expect(page.getByTestId("export-format-png")).toHaveAttribute("aria-pressed", "true");

    const out = await exportAndSave(page, testInfo, "pe5-downgrade.png");

    // The post-export note (the intentDowngraded surface) appears, verbatim.
    await expect(page.getByTestId("export-note")).toBeVisible();
    await expect(page.getByTestId("export-note")).toHaveText(
      "Exported in sRGB — this format can't carry CMYK.",
    );

    // The bytes confirm the honest downgrade: 3-channel sRGB PNG.
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect(meta.space).toBe("srgb");
    expect(meta.channels).toBe(3);
  });
});

/**
 * Text & image (plan step PE6): overlay ops fold last-wins-per-id with one
 * coalesced history step per overlay session; the layer list round-trips
 * selection/removal; the export sidecar carries client-rendered rasters that
 * land in the full-res file. Pixel thresholds mirror the integrator's manual
 * verification (dark glyphs ≈4% in-band on the demo sunset; <0.2% without).
 */
test.describe("Text & image (PE6)", () => {
  test.describe.configure({ timeout: 90_000 });

  async function addText(page: Page, content?: string) {
    await page.getByTestId("photo-rail-text").click();
    await expect(page.getByTestId("photo-text-panel")).toBeVisible();
    await page.getByTestId("text-add-text").click();
    await expect(page.getByTestId("overlay-box")).toBeVisible();
    if (content !== undefined) {
      await page.getByTestId("text-content").fill(content);
    }
  }

  test("add text is one step; content edits and moves coalesce; the layer list shows it", async ({
    page,
  }) => {
    await openDemoPhoto(page);
    await addText(page, "SUMMER SALE");
    await expectHistory(page, 2); // Open + Add text — the fill coalesced

    // Drag the box: still the same coalesced step.
    const box = await page.getByTestId("overlay-box").boundingBox();
    if (!box) throw new Error("no overlay box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 6 });
    await page.mouse.up();
    await expectHistory(page, 2);
    const moved = await page.getByTestId("overlay-box").boundingBox();
    expect(Math.abs((moved?.x ?? 0) - box.x)).toBeGreaterThan(80);

    await expect(page.getByTestId("text-layer-0")).toContainText("SUMMER SALE");
  });

  test("corner handle scales the box and the font size together", async ({ page }) => {
    await openDemoPhoto(page);
    await addText(page);
    const sizeBefore = Number(await page.getByTestId("text-size").inputValue());
    const box = await page.getByTestId("overlay-box").boundingBox();
    if (!box) throw new Error("no overlay box");
    const handle = await page.getByTestId("overlay-handle-se").boundingBox();
    if (!handle) throw new Error("no se handle");
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 90, handle.y + 90, { steps: 6 });
    await page.mouse.up();
    const after = await page.getByTestId("overlay-box").boundingBox();
    expect((after?.width ?? 0)).toBeGreaterThan(box.width + 40);
    const sizeAfter = Number(await page.getByTestId("text-size").inputValue());
    expect(sizeAfter).toBeGreaterThan(sizeBefore);
    await expectHistory(page, 2); // the whole scale session coalesced
  });

  test("layer remove is one step; undo restores the overlay", async ({ page }) => {
    await openDemoPhoto(page);
    await addText(page, "SUMMER SALE");
    await expectHistory(page, 2);
    await page.getByTestId("text-layer-remove-0").click();
    await expectHistory(page, 3); // the hidden-tombstone step
    await expect(page.getByTestId("text-layer-0")).toHaveCount(0);
    await page.getByTestId("photo-undo").click();
    await expectHistory(page, 2);
    await expect(page.getByTestId("text-layer-0")).toContainText("SUMMER SALE");
  });

  test("the export carries the text raster; undoing the overlay removes it", async ({
    page,
  }, testInfo) => {
    await openDemoPhoto(page);
    await addText(page, "SUMMER SALE");

    // The default text box sits centered — the manual verification band.
    const darkShare = async (file: string) => {
      const img = sharp(file);
      const meta = await img.metadata();
      const raw = await img
        .extract({
          left: Math.floor((meta.width ?? 0) * 0.3),
          top: Math.floor((meta.height ?? 0) * 0.38),
          width: Math.floor((meta.width ?? 0) * 0.45),
          height: Math.floor((meta.height ?? 0) * 0.2),
        })
        .resize(120, 50)
        .raw()
        .toBuffer();
      let dark = 0;
      for (let i = 0; i < raw.length; i += 3)
        if (raw[i] < 70 && raw[i + 1] < 70 && raw[i + 2] < 70) dark++;
      return dark / (raw.length / 3);
    };

    const exportJpg = async (name: string) => {
      // The rail tile toggles — don't click it closed if Export is already open.
      const rail = page.getByTestId("photo-rail-export");
      if ((await rail.getAttribute("aria-pressed")) !== "true") await rail.click();
      await expect(page.getByTestId("photo-export-panel")).toBeVisible();
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        page.getByTestId("export-file").click(),
      ]);
      const path = testInfo.outputPath(name);
      await download.saveAs(path);
      return path;
    };

    const withOverlay = await exportJpg("with-overlay.jpg");
    expect(await darkShare(withOverlay)).toBeGreaterThan(0.005);

    await page.getByTestId("photo-undo").click(); // drop the Add text step
    await expectHistory(page, 1);
    const withoutOverlay = await exportJpg("without-overlay.jpg");
    expect(await darkShare(withoutOverlay)).toBeLessThan(0.002);
  });
});

/**
 * Placed-picture round-trip (plan step PE8, Section F2): a layout picture opens
 * in the Photo Editor with the red return banner, Done lands the edit back as
 * ONE revertable layout step, Cancel is a true no-op, and Export is suppressed
 * for the whole trip. Image identity is asserted by mean luminance of the
 * rendered frame (object URLs are re-minted per mount, so src strings can't be
 * compared): a brightness edit raises it, revert restores it.
 */
test.describe("Placed-picture round-trip (PE8)", () => {
  test.describe.configure({ timeout: 120_000 });

  /** Import photo.png into the layout assets and place it (the L8 pattern). */
  async function placePicture(page: Page) {
    await page.goto("/layout");
    await page.getByTestId("panel-tab-assets").click();
    await page.getByTestId("asset-file-input").setInputFiles("e2e/fixtures/photo.png");
    await expect(page.getByTestId("asset-tile-0")).toContainText("photo.png");
    await page.getByTestId("asset-tile-0").click();
    await expect(page.getByTestId("object-picture")).toHaveCount(1);
    await expect(page.getByTestId("picture-image")).toBeVisible();
  }

  /** Mean luminance of the rendered picture frame, via an element screenshot. */
  async function pictureLuma(page: Page) {
    const shot = await page.getByTestId("picture-image").screenshot();
    const stats = await sharp(shot).stats();
    const [r, g, b] = stats.channels;
    return 0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean;
  }

  /** Select the placed picture and enter the round-trip via the inspector. */
  async function enterRoundTrip(page: Page) {
    await page.getByTestId("insp-props").click();
    await page.getByTestId("object-picture").click();
    await page.getByTestId("layout-edit-in-photo").click();
    await expect(page.getByTestId("photo-return-banner")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("photo-return-banner")).toContainText("Editing picture from");
    await expect(page.getByTestId("photo-zoom")).toHaveText(/\d+%/, { timeout: 30_000 });
  }

  /** Push brightness well up so the returned render is measurably lighter. */
  async function brighten(page: Page) {
    await page.getByTestId("photo-rail-adjust").click();
    const slider = page.getByTestId("adjust-brightness");
    const box = await slider.boundingBox();
    if (!box) throw new Error("no brightness slider");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.95, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
  }

  test("the loop: edit → Done lands one revertable layout step; Export suppressed inside", async ({
    page,
  }) => {
    await placePicture(page);
    const before = await pictureLuma(page);

    await enterRoundTrip(page);
    // F2's suppression rule: no Export tile, Convert format disabled.
    await expect(page.getByTestId("photo-rail-export")).toHaveCount(0);
    await expect(page.getByTestId("photo-quick-convert")).toBeDisabled();

    await brighten(page);
    await page.getByTestId("return-done").click();
    await expect(page.getByTestId("picture-image")).toBeVisible({ timeout: 60_000 });
    const after = await pictureLuma(page);
    expect(after).toBeGreaterThan(before + 8); // visibly brighter render landed

    // One revertable step: the inspector offers Revert photo edits; using it
    // restores the original asset and clears the offer.
    await page.getByTestId("insp-props").click();
    await page.getByTestId("object-picture").click();
    await expect(page.getByTestId("layout-revert-photo-edits")).toBeVisible();
    await page.getByTestId("layout-revert-photo-edits").click();
    await expect(page.getByTestId("layout-revert-photo-edits")).toHaveCount(0);
    const reverted = await pictureLuma(page);
    expect(Math.abs(reverted - before)).toBeLessThan(3);

    // And the revert itself is one undoable step: undo brings the edit back.
    await page.keyboard.press("ControlOrMeta+z");
    const undone = await pictureLuma(page);
    expect(undone).toBeGreaterThan(before + 8);
  });

  test("Cancel is a true no-op: frame untouched, no revert offer, no photo doc", async ({
    page,
  }) => {
    await placePicture(page);
    const before = await pictureLuma(page);

    await enterRoundTrip(page);
    await brighten(page);
    await page.getByTestId("return-cancel").click();
    await expect(page.getByTestId("picture-image")).toBeVisible({ timeout: 30_000 });
    const after = await pictureLuma(page);
    expect(Math.abs(after - before)).toBeLessThan(3);

    await page.getByTestId("insp-props").click();
    await page.getByTestId("object-picture").click();
    await expect(page.getByTestId("layout-revert-photo-edits")).toHaveCount(0);

    // The photo editor holds no document after a cancel.
    await page.goto("/photo");
    await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");
    await expect(page.getByTestId("photo-open-input")).toBeAttached();
  });
});

/**
 * Conversion & handoffs (plan step PE7): HEIC opens end-to-end through the
 * jailed heif-convert lane; files that must not open here (multi-page PDFs,
 * over-ceiling pixel counts) get a typed reject with a route-away to the
 * Layout Editor; and "Open in Layout Editor" flattens the recipe into a placed
 * picture as one undoable layout step. The HEIC case needs heif-convert on the
 * server host — the CI e2e lane installs libheif-examples for exactly this.
 */
test.describe("Conversion & handoffs (PE7)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("a HEIC photo opens end-to-end through the jailed conversion", async ({ page }) => {
    await page.goto("/photo");
    await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("photo-open-input").setInputFiles("fixtures/photo-corpus/iphone-still.heic");
    await expect(page.getByTestId("photo-filename")).toHaveText("iphone-still.heic", { timeout: 30_000 });
    await expect(page.getByTestId("photo-zoom")).toHaveText(/\d+%/, { timeout: 30_000 });
    await expectHistory(page, 1);
  });

  test("a PDF never opens here — typed multi-page reject routes to the Layout Editor", async ({
    page,
  }) => {
    await page.goto("/photo");
    await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("photo-open-input").setInputFiles({
      name: "brochure.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n"),
    });
    const banner = page.getByTestId("photo-capability-banner");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner).toContainText("multi-page files don't open here");
    await page.getByTestId("photo-banner-route-layout").click();
    await expect(page).toHaveURL(/\/layout/);
  });

  test("an over-ceiling image routes away instead of opening", async ({ page }) => {
    // The committed corpus fixture: fixtures/photo-corpus/oversize.tiff is
    // 9100 × 9000 = 81.9 MP, past the 80 MP ceiling the engine enforces at the
    // header read (deflate keeps it ~256 KB on disk). The PE10d huge-TIFF case
    // doubles as this route-away fixture — its too-many-pixels unit assertion
    // is in benign-corpus.test.ts.
    const oversize = "fixtures/photo-corpus/oversize.tiff";

    await page.goto("/photo");
    await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("photo-open-input").setInputFiles(oversize);
    const banner = page.getByTestId("photo-capability-banner");
    await expect(banner).toBeVisible({ timeout: 60_000 });
    await expect(banner).toContainText("MP limit");
    await expect(page.getByTestId("photo-banner-route-layout")).toBeVisible();
    // It never opened: no document, the open input is still the empty state's.
    await expect(page.getByTestId("photo-filename")).toHaveCount(0);
  });

  test("Open in Layout Editor lands the flattened photo as one undoable placed step", async ({
    page,
  }) => {
    await openDemoPhoto(page);
    await page.getByTestId("photo-rail-export").click();
    await expect(page.getByTestId("photo-export-panel")).toBeVisible();
    // Fresh storage → the layout document is empty → no confirm gate.
    await page.getByTestId("export-send-layout").click();
    await expect(page).toHaveURL(/\/layout/, { timeout: 60_000 });
    await expect(page.getByTestId("object-picture")).toHaveCount(1);
    await expect(page.getByTestId("picture-image")).toBeVisible();
    // One undoable layout step: undo removes the placed picture.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByTestId("object-picture")).toHaveCount(0);
  });

  test("the confirm gate asks before landing on a layout document with content", async ({
    page,
  }) => {
    // Give the layout document content first (the L8 asset-placement flow).
    await page.goto("/layout");
    await page.getByTestId("panel-tab-assets").click();
    await page.getByTestId("asset-file-input").setInputFiles("e2e/fixtures/photo.png");
    await expect(page.getByTestId("asset-tile-0")).toContainText("photo.png");
    await page.getByTestId("asset-tile-0").click();
    await expect(page.getByTestId("object-picture")).toHaveCount(1);

    await openDemoPhoto(page);
    await page.getByTestId("photo-rail-export").click();
    await expect(page.getByTestId("photo-export-panel")).toBeVisible();
    await page.getByTestId("export-send-layout").click();
    const confirm = page.getByTestId("handoff-confirm");
    await expect(confirm).toBeVisible();

    // Cancel is a no-op — still in the export panel, nothing placed.
    await page.getByTestId("handoff-confirm-cancel").click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId("photo-export-panel")).toBeVisible();

    // Place lands it alongside the existing object.
    await page.getByTestId("export-send-layout").click();
    await page.getByTestId("handoff-confirm-place").click();
    await expect(page).toHaveURL(/\/layout/, { timeout: 60_000 });
    await expect(page.getByTestId("object-picture")).toHaveCount(2);
  });
});

/**
 * Clean up (plan step PE9 done-when, docs/PHOTO_EDITOR_IMPLEMENTATION_PLAN.md §4
 * PE9): the brush → server classical-fill → preview-approve loop. One live tool
 * (Remove object) beside honestly model-gated siblings; a brushed stroke runs the
 * fill ONCE server-side and lands a pendingPreview the associate must Apply or
 * Discard (suggest-never-auto-apply); Apply is ONE named "Remove object" history
 * step whose undo/redo is byte-exact on the canvas; the export ships the approved
 * patch as its `erase:<id>` part (a missing part is a 400 — the download event IS
 * the proof it rode along).
 *
 * TARGET FEATURE: the demo sunset's seagull mark at master (1831–1888, 967–984)
 * px — a dark object on smooth sky, measured from public/photo-demo.jpg — so
 * "object removed" is a real, pixel-assertable claim: the fill replaces the dark
 * mark with surround-sky and the sampled block visibly lightens.
 *
 * ECHO RULE (CleanupBrushOverlay): once a stroke's fill lands as a pendingPreview
 * the red stroke TINT stops echoing (the canvas now shows the actual filled
 * pixels the associate must judge — a tint would obscure them), while the
 * "Brushed area" badge stays. Asserted directly off the overlay's echo canvas.
 *
 * WAIT DISCIPLINE (the house rule, commit 3cacdd0): open to the settled fit-zoom
 * readout, `settleCanvas` before any pixel sample, and event/testid waits only —
 * the preview bar's appearance IS the fill-complete signal (a cold erase route
 * compiles + spawns the jail, so it gets 40 s). Pixel samples use the PE4 image-
 * box reconstruction (pad 24 + MASTER_ASPECT); byte-exact restore assertions ride
 * the same determinism the PE4 undo test pins (raw-base and compose paths are
 * deterministic redraws).
 */

/** The demo seagull mark, fractions of the effective image (master 1860, 976). */
const BIRD = { fx: 0.4612, fy: 0.3226 };

/** Open the demo through `?demo=1` (wire-pinned IMG_4823.jpg) and enter Clean up. */
async function openDemoInCleanup(page: Page) {
  await page.goto("/photo?demo=1");
  await expect(page.getByTestId("photo-editor")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByTestId("photo-filename")).toHaveText("IMG_4823.jpg", { timeout: 30_000 });
  await expect(page.getByTestId("photo-zoom")).toHaveText(/\d+%/, { timeout: 30_000 });
  await page.getByTestId("photo-rail-cleanup").click();
  await expect(page.getByTestId("photo-cleanup-panel")).toBeVisible();
}

/** Screen coords of an image-fraction point — the PE3/PE4 contain-fit
    reconstruction (pad 24, MASTER_ASPECT) over the live canvas bounding box. */
async function imagePointOnScreen(page: Page, fx: number, fy: number) {
  const box = await page.getByTestId("photo-canvas").boundingBox();
  if (!box) throw new Error("photo canvas has no bounding box");
  const PAD = 24;
  const availW = Math.max(1, box.width - PAD * 2);
  const availH = Math.max(1, box.height - PAD * 2);
  const dispW = Math.min(availW, availH * MASTER_ASPECT);
  const dispH = Math.min(availH, availW / MASTER_ASPECT);
  const x = box.x + (box.width - dispW) / 2;
  const y = box.y + (box.height - dispH) / 2;
  return { x: x + dispW * fx, y: y + dispH * fy };
}

/** Sum + raw bytes of a 16×16 block at an image-fraction point (the sampleCentre
    pattern, aimed): change detection via the sum, byte-exact undo/redo via bytes. */
async function sampleImagePoint(
  page: Page,
  fx: number,
  fy: number,
): Promise<{ sum: number; bytes: number[] }> {
  return page.getByTestId("photo-canvas").evaluate(
    (el, args) => {
      const c = el as HTMLCanvasElement;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      const container = c.parentElement as HTMLElement;
      const PAD = 24;
      const dpr = window.devicePixelRatio || 1;
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;
      const availW = Math.max(1, cssW - PAD * 2);
      const availH = Math.max(1, cssH - PAD * 2);
      const dispW = Math.min(availW, availH * args.aspect);
      const dispH = Math.min(availH, availW / args.aspect);
      const x = (cssW - dispW) / 2;
      const y = (cssH - dispH) / 2;
      const px = Math.round((x + dispW * args.fx) * dpr);
      const py = Math.round((y + dispH * args.fy) * dpr);
      const d = ctx.getImageData(px - 8, py - 8, 16, 16).data;
      let sum = 0;
      for (let i = 0; i < d.length; i++) sum += d[i];
      return { sum, bytes: Array.from(d) };
    },
    { fx, fy, aspect: MASTER_ASPECT },
  );
}

/** Drag a brush stroke between two image-fraction points (real pointer gesture —
    the mask + fill hang off pointer capture and the pointerup commit). */
async function brushStroke(
  page: Page,
  from: { fx: number; fy: number },
  to: { fx: number; fy: number },
) {
  const a = await imagePointOnScreen(page, from.fx, from.fy);
  const b = await imagePointOnScreen(page, to.fx, to.fy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

/** Max out the brush (120 px) with a real thumb drag clamped past the track end —
    a fat brush swallows the seagull in one stroke, keeping the fill deterministic. */
async function setBrushToMax(page: Page) {
  const slider = page.getByTestId("photo-cleanup-brush-size");
  const box = await slider.boundingBox();
  if (!box) throw new Error("brush slider has no bounding box");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 30, y, { steps: 3 });
  await page.mouse.up();
  await expect(slider).toHaveValue("120");
}

/** The fill-complete signal: the PreviewApproveBar with its generic-op label. */
async function waitForPreviewBar(page: Page) {
  const bar = page.getByTestId("photo-preview-bar");
  await expect(bar).toBeVisible({ timeout: 40_000 });
  await expect(bar).toContainText("Preview · object removed");
}

/** Count non-transparent pixels on the brush overlay's ECHO canvas — >0 while
    fresh strokes echo, 0 once their fill landed as a preview (the echo rule). */
async function echoTintPixelCount(page: Page): Promise<number> {
  return page
    .getByTestId("photo-cleanup-overlay")
    .locator("canvas")
    .evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const ctx = c.getContext("2d");
      if (!ctx) return -1;
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
}

/** Arm a latch that records the "Working…" chip's INSERTION (the PE3 rendering-
    chip observer pattern) — the fill may resolve before a poll would catch it. */
async function armWorkingChipLatch(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __cleanupChipSeen?: boolean };
    const sel = '[data-testid="photo-cleanup-working"]';
    w.__cleanupChipSeen = document.querySelector(sel) != null;
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of Array.from(m.addedNodes)) {
          if (!(node instanceof Element)) continue;
          if (node.matches(sel) || node.querySelector(sel)) w.__cleanupChipSeen = true;
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
}

test.describe("Clean up (PE9)", () => {
  test.describe.configure({ timeout: 90_000 });

  test("the rail tile opens the panel: Remove object live, siblings + AI-file card model-gated, brush slider bound", async ({
    page,
  }) => {
    await openDemoInCleanup(page);

    // Status wire string (the same one the PE1 state machine pins).
    await expect(page.getByTestId("photo-status")).toHaveText(
      "Clean up · brush over the area to remove",
    );

    // Remove object is the single LIVE tool, pre-selected.
    const remove = page.getByTestId("photo-cleanup-tool-remove");
    await expect(remove).toBeEnabled();
    await expect(remove).toHaveAttribute("aria-pressed", "true");

    // The three siblings + the AI-file card are drawn-but-inert, honestly labelled.
    for (const id of [
      "photo-cleanup-tool-spot",
      "photo-cleanup-tool-redeye",
      "photo-cleanup-tool-background",
      "photo-cleanup-fix-ai",
    ]) {
      await expect(page.getByTestId(id)).toBeDisabled();
      await expect(page.getByTestId(id)).toHaveAttribute("title", "Coming with the model service");
    }

    // The honest copy: preview-before-apply + the classical stand-in line.
    const panel = page.getByTestId("photo-cleanup-panel");
    await expect(panel).toContainText("You always see a preview before it applies.");
    await expect(panel).toContainText("a smarter fixer is coming");

    // Brush slider: contract range 8–120 step 2, default 40, live readout.
    const slider = page.getByTestId("photo-cleanup-brush-size");
    await expect(slider).toHaveValue("40");
    await expect(slider).toHaveAttribute("min", "8");
    await expect(slider).toHaveAttribute("max", "120");
    await expect(slider).toHaveAttribute("step", "2");
    await setBrushToMax(page);
    await expect(panel).toContainText("120 px");
  });

  test("brush → server fill preview: badge + working chip, tint clears once previewed; Discard is a no-op", async ({
    page,
  }) => {
    await openDemoInCleanup(page);
    await settleCanvas(page);
    await setBrushToMax(page);

    // Pre-brush reference at the seagull — the byte key proves the exact restore.
    const p0 = await sampleImagePoint(page, BIRD.fx, BIRD.fy);
    const p0key = JSON.stringify(p0.bytes);
    await expectHistory(page, 1);

    // Stroke horizontally through the seagull. The chip latch is armed BEFORE the
    // pointerup that starts the fill (its lifetime can be shorter than a poll).
    await armWorkingChipLatch(page);
    await brushStroke(page, { fx: 0.44, fy: BIRD.fy }, { fx: 0.48, fy: BIRD.fy });

    // The brushed-area badge appears at once; the fresh stroke echoes as tint
    // until its fill lands (the network round-trip bounds this from below).
    await expect(page.getByTestId("photo-cleanup-badge")).toBeVisible();
    expect(await echoTintPixelCount(page)).toBeGreaterThan(0);

    // The server fill lands as a pending preview (never auto-applied).
    await waitForPreviewBar(page);
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __cleanupChipSeen?: boolean }).__cleanupChipSeen),
      )
      .toBe(true);

    // ECHO RULE: the previewed strokes stop tinting (the canvas now shows the
    // actual filled pixels being judged) — but the badge remains.
    await expect.poll(() => echoTintPixelCount(page)).toBe(0);
    await expect(page.getByTestId("photo-cleanup-badge")).toBeVisible();

    // The fill visibly changed the brushed region (the dark mark went sky).
    await expect
      .poll(async () => Math.abs((await sampleImagePoint(page, BIRD.fx, BIRD.fy)).sum - p0.sum))
      .toBeGreaterThan(1000);

    // DISCARD: bar + badge go, history/cursor untouched, pixels restore EXACTLY
    // (both sides of the discard draw the same raw-base path).
    await page.getByTestId("photo-preview-discard").click();
    await expect(page.getByTestId("photo-preview-bar")).toHaveCount(0);
    await expect(page.getByTestId("photo-cleanup-badge")).toHaveCount(0);
    await expectHistory(page, 1);
    await expect(page.getByTestId("photo-undo")).toBeDisabled();
    await expect(page.getByTestId("photo-redo")).toBeDisabled();
    await expect
      .poll(async () => JSON.stringify((await sampleImagePoint(page, BIRD.fx, BIRD.fy)).bytes))
      .toBe(p0key);
  });

  test("Apply is one 'Remove object' step with exact undo/redo; the export ships the approved patch", async ({
    page,
  }, testInfo) => {
    // Two full-res renders + a jailed fill ride this test — PE4's export headroom.
    test.setTimeout(120_000);
    await openDemoInCleanup(page);
    await settleCanvas(page);

    // BASELINE export (empty recipe) — the byte reference the erased export is
    // diffed against: outside the fill rect the two renders must agree, at the
    // seagull they must not.
    await page.getByTestId("photo-rail-export").click();
    await expect(page.getByTestId("photo-export-panel")).toBeVisible();
    await page.getByTestId("export-format-png").click();
    await expect(page.getByTestId("export-format-png")).toHaveAttribute("aria-pressed", "true");
    const baseOut = await exportAndSave(page, testInfo, "pe9-base.png");

    // Back to Clean up: brush through the seagull and wait for the fill preview.
    await page.getByTestId("photo-rail-cleanup").click();
    await expect(page.getByTestId("photo-cleanup-panel")).toBeVisible();
    await setBrushToMax(page);
    const p0 = await sampleImagePoint(page, BIRD.fx, BIRD.fy);
    const p0key = JSON.stringify(p0.bytes);
    await brushStroke(page, { fx: 0.44, fy: BIRD.fy }, { fx: 0.48, fy: BIRD.fy });
    await waitForPreviewBar(page);

    // APPLY → exactly one wire-labelled history step; the bar clears.
    await page.getByTestId("photo-preview-apply").click();
    await expect(page.getByTestId("photo-preview-bar")).toHaveCount(0);
    await expectHistory(page, 2);
    const labels = await historyStepLabels(page);
    expect(labels).toEqual(["Open IMG_4823.jpg", "Remove object"]);
    await closeHistoryDock(page);

    // The committed patch stays composited (the seagull is still gone post-Apply).
    await expect
      .poll(async () => Math.abs((await sampleImagePoint(page, BIRD.fx, BIRD.fy)).sum - p0.sum))
      .toBeGreaterThan(1000);
    const p1key = JSON.stringify((await sampleImagePoint(page, BIRD.fx, BIRD.fy)).bytes);

    // UNDO → the pre-brush bytes return EXACTLY (raw-base determinism, the PE4
    // rule) and the cursor steps back; REDO re-composites the patch exactly.
    await page.getByTestId("photo-undo").click();
    await expect
      .poll(async () => JSON.stringify((await sampleImagePoint(page, BIRD.fx, BIRD.fy)).bytes))
      .toBe(p0key);
    await expectHistory(page, 1);
    // The undone step stays listed (redo tail), the cursor sits on the Open step.
    expect(await historyStepLabels(page)).toEqual(["Open IMG_4823.jpg", "Remove object"]);
    await expect(page.getByTestId("history-step-0")).toHaveAttribute("aria-current", "step");
    await closeHistoryDock(page);
    await page.getByTestId("photo-redo").click();
    await expect
      .poll(async () => JSON.stringify((await sampleImagePoint(page, BIRD.fx, BIRD.fy)).bytes))
      .toBe(p1key);
    await expectHistory(page, 2);

    // EXPORT with the applied erase: the client must attach the `erase:<id>`
    // patch part — the render route 400s a missing part, so the download firing
    // IS the integration proof. PNG keeps the byte compare lossless.
    await page.getByTestId("photo-rail-export").click();
    await expect(page.getByTestId("photo-export-panel")).toBeVisible();
    // Format is panel-local state — the remount reset it to JPG; re-pick PNG.
    await page.getByTestId("export-format-png").click();
    await expect(page.getByTestId("export-format-png")).toHaveAttribute("aria-pressed", "true");
    const erasedOut = await exportAndSave(page, testInfo, "pe9-erased.png");

    // Full resolution, dims unchanged (erase is not a geometry op).
    for (const file of [baseOut, erasedOut]) {
      const meta = await sharp(file).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBe(4032);
      expect(meta.height).toBe(3024);
    }

    // Region diff, mean |Δ| per channel-byte: the seagull's bbox (master
    // 1831–1888 × 967–984, padded a hair) differs strongly — the server
    // composited the approved fill — while a control patch far outside the fill
    // rect is untouched (same master, same pipeline, lossless container).
    const regionDiff = async (left: number, top: number, width: number, height: number) => {
      const opts = { left, top, width, height };
      const a = await sharp(baseOut).extract(opts).raw().toBuffer();
      const b = await sharp(erasedOut).extract(opts).raw().toBuffer();
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
      return sum / a.length;
    };
    expect(await regionDiff(1826, 962, 68, 28)).toBeGreaterThan(4); // seagull erased
    expect(await regionDiff(300, 2500, 200, 200)).toBeLessThan(1); // far sand untouched
  });

  test("switching tools discards the pending preview — suggest, never auto-apply", async ({
    page,
  }) => {
    await openDemoInCleanup(page);
    await settleCanvas(page);
    await setBrushToMax(page);
    const p0key = JSON.stringify((await sampleImagePoint(page, BIRD.fx, BIRD.fy)).bytes);

    await brushStroke(page, { fx: 0.44, fy: BIRD.fy }, { fx: 0.48, fy: BIRD.fy });
    await waitForPreviewBar(page);

    // Leave for Crop: the tool switch clears the pending preview (CLEAR_GESTURES)
    // — the un-approved suggestion must not survive its tool.
    await page.getByTestId("photo-rail-crop").click();
    await expect(page.getByTestId("photo-crop-panel")).toBeVisible();
    await expect(page.getByTestId("photo-preview-bar")).toHaveCount(0);

    // Back in Clean up: nothing pending, nothing brushed, history untouched, and
    // the canvas is byte-identical to the pre-brush state.
    await page.getByTestId("photo-rail-cleanup").click();
    await expect(page.getByTestId("photo-cleanup-panel")).toBeVisible();
    await expect(page.getByTestId("photo-preview-bar")).toHaveCount(0);
    await expect(page.getByTestId("photo-cleanup-badge")).toHaveCount(0);
    await expectHistory(page, 1);
    await expect(page.getByTestId("photo-undo")).toBeDisabled();
    await expect
      .poll(async () => JSON.stringify((await sampleImagePoint(page, BIRD.fx, BIRD.fy)).bytes))
      .toBe(p0key);
  });
});
