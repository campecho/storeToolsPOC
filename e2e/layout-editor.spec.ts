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
    await expect(page.getByTestId("doc-name")).toHaveValue("Untitled publication");
    await expect(page.getByTestId("size-hint")).toHaveText("· Letter · 8.5 × 11 in");
    await expect(page.getByTestId("give-feedback")).toBeVisible();

    // experience switch shows Standard active (Simple disabled until L9; two levels since v1.3)
    await expect(page.getByTestId("experience-switch")).toContainText("Standard");
    await expect(page.getByTestId("experience-switch")).not.toContainText("Pro");

    // true-scale page + guide legend (the wire's pasteboard caption came out in L8)
    await expect(page.getByTestId("publication-page")).toBeVisible();
    await expect(page.getByText("Bleed 0.125 in")).toBeVisible();
    await expect(page.getByText("Margin 0.5 in")).toBeVisible();

    // Page inspector tab body (the default tab)
    await expect(page.getByText("Custom size — not bound to a SKU")).toBeVisible();
  });

  test("tool selection is single-select and drives the status bar", async ({ page }) => {
    await page.goto("/layout");
    await expect(page.getByTestId("status-tool")).toHaveText("Select tool · ready");

    await page.getByTestId("tool-rect").click();
    await expect(page.getByTestId("status-tool")).toHaveText("Rectangle tool · drag to draw");
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
    // .first(): the pill face — the text also appears in the picker's option list
    await expect(layout.getByText("Letter · 8.5 × 11 in").first()).toBeVisible();
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

/**
 * Document model & the true-scale page (plan step L3): page-setup edits
 * reflect live everywhere, zoom/pan are real, the document persists under
 * stp-layout-v1, and the homepage size tiles deep-link into fresh documents.
 */
test.describe("Document model & true-scale page (L3)", () => {
  test("page setup edits reflect live in page and hint", async ({ page }) => {
    await page.goto("/layout");

    // preset → Ledger (inspector Page tab is the default; the pasteboard
    // caption that also echoed this came out in L8)
    await page.getByTestId("preset-select").selectOption("ledger");
    await expect(page.getByTestId("size-hint")).toHaveText("· Ledger · 11 × 17 in");

    // the page is true-scale: aspect ratio follows the model
    await expect
      .poll(async () => {
        const box = await page.getByTestId("publication-page").boundingBox();
        return box ? box.height / box.width : 0;
      })
      .toBeCloseTo(17 / 11, 1);

    // orientation swaps the effective dimensions
    await page.getByTestId("orient-landscape").click();
    await expect(page.getByTestId("size-hint")).toHaveText("· Ledger · 17 × 11 in");

    // custom W/H — large-format sizes are legal (20 × 30 matches no preset)
    await page.getByTestId("page-w").fill("20");
    await page.getByTestId("page-w").press("Enter");
    await page.getByTestId("page-h").fill("30");
    await page.getByTestId("page-h").press("Enter");
    await expect(page.getByTestId("size-hint")).toHaveText("· Custom · 20 × 30 in");
  });

  test("bleed & margin edits reflect in the legend, from both surfaces", async ({ page }) => {
    await page.goto("/layout");

    await page.getByTestId("page-bleed").fill("0.25");
    await page.getByTestId("page-bleed").press("Enter");
    await expect(page.getByText("Bleed 0.25 in")).toBeVisible();

    await page.getByTestId("page-margin").fill("1");
    await page.getByTestId("page-margin").press("Enter");
    await expect(page.getByText("Margin 1 in")).toBeVisible();

    // the Layout band edits the same model
    await page.getByTestId("ribbon-layout").click();
    await page.getByTestId("band-bleed").selectOption("0.125");
    await expect(page.getByText("Bleed 0.125 in")).toBeVisible();
    await page.getByTestId("band-margins").selectOption("0.5");
    await expect(page.getByText("Margin 0.5 in")).toBeVisible();
  });

  test("columns render gutter guides; the Guides toggle governs them", async ({ page }) => {
    await page.goto("/layout");
    await page.getByTestId("ribbon-layout").click();

    await page.getByTestId("band-columns").selectOption("3");
    await expect(page.getByTestId("column-guide")).toHaveCount(4); // 2 gutters × 2 edges
    await expect(page.getByTestId("center-guide-v")).toBeHidden(); // yields to gutters

    await page.getByTestId("band-guides").click();
    await expect(page.getByTestId("column-guide")).toHaveCount(0);
    await expect(page.getByTestId("center-guide-h")).toBeHidden();

    await page.getByTestId("band-guides").click();
    await expect(page.getByTestId("column-guide")).toHaveCount(4);
  });

  test("zoom controls drive the true-scale page", async ({ page }) => {
    await page.goto("/layout");

    // slider → exactly 100%: Letter renders at 8.5in × 96dpi = 816px
    await page.getByTestId("zoom-slider").evaluate((el, value) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, "100");
    await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
    const box = await page.getByTestId("publication-page").boundingBox();
    expect(Math.abs((box?.width ?? 0) - 816)).toBeLessThan(2);

    // ± step through the zoom table
    await page.getByTestId("zoom-in").click();
    await expect(page.getByTestId("zoom-percent")).toHaveText("125%");
    await page.getByTestId("zoom-out").click();
    await expect(page.getByTestId("zoom-percent")).toHaveText("100%");

    // Zoom tool: click in, Alt-click out
    await page.getByTestId("tool-zoom").click();
    await page.getByTestId("pasteboard").click({ position: { x: 40, y: 40 } });
    await expect(page.getByTestId("zoom-percent")).toHaveText("125%");
    await page.getByTestId("pasteboard").click({ position: { x: 40, y: 40 }, modifiers: ["Alt"] });
    await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
  });

  test("document persists across reload; Reset restores pristine", async ({ page }) => {
    await page.goto("/layout");
    await page.getByTestId("doc-name").fill("Spring sale flyer");
    await page.getByTestId("preset-select").selectOption("legal");
    await expect(page.getByTestId("size-hint")).toHaveText("· Legal · 8.5 × 14 in");

    await page.reload();
    await expect(page.getByTestId("doc-name")).toHaveValue("Spring sale flyer");
    await expect(page.getByTestId("size-hint")).toHaveText("· Legal · 8.5 × 14 in");

    await page.getByTestId("editor-reset").click();
    await expect(page.getByTestId("doc-name")).toHaveValue("Untitled publication");
    await expect(page.getByTestId("size-hint")).toHaveText("· Letter · 8.5 × 11 in");

    await page.reload();
    await expect(page.getByTestId("size-hint")).toHaveText("· Letter · 8.5 × 11 in");
  });

  test("homepage size tiles deep-link into fresh documents", async ({ page }) => {
    // a saved document must not survive a deep link — the link wins
    await page.goto("/layout");
    await page.getByTestId("doc-name").fill("Old work");
    await page.getByTestId("editor-back").click();

    await page.getByTestId("size-tile-ledger").click();
    await expect(page.getByTestId("size-hint")).toHaveText("· Ledger · 11 × 17 in");
    await expect(page.getByTestId("doc-name")).toHaveValue("Untitled publication");
    await expect(page).toHaveURL(/\/layout$/); // query cleaned off

    // custom tile lands in the width field, ready to type
    await page.getByTestId("editor-back").click();
    await page.getByTestId("size-tile-custom").click();
    await expect(page.getByTestId("page-w")).toBeFocused();
    await expect(page).toHaveURL(/\/layout$/);

    // direct URL form works too
    await page.goto("/layout?preset=legal");
    await expect(page.getByTestId("size-hint")).toHaveText("· Legal · 8.5 × 14 in");
  });
});

/**
 * Objects: draw, select, transform (plan step L4): the draw → move → resize →
 * numeric-edit → undo chain, duplicate/delete/z-order via keyboard, fill
 * edits, persistence of drawn objects, and the honest Table status.
 */
test.describe("Objects: draw, select, transform (L4)", () => {
  /** Drag on the pasteboard from one page-relative point to another. */
  async function drag(
    page: import("@playwright/test").Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    const box = (await page.getByTestId("publication-page").boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
    await page.mouse.up();
  }

  test("the draw → move → resize → numeric-edit → undo chain holds", async ({ page }) => {
    await page.goto("/layout");

    // draw a rectangle
    await page.getByTestId("tool-rect").click();
    await expect(page.getByTestId("status-tool")).toHaveText("Rectangle tool · drag to draw");
    await drag(page, { x: 40, y: 40 }, { x: 190, y: 140 });

    // the tool returned to Select and the object is selected
    await expect(page.getByTestId("tool-select")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("status-tool")).toHaveText("Select tool · 1 object");
    await expect(page.getByTestId("object-rect")).toHaveCount(1);
    await expect(page.getByTestId("selection-frame")).toBeVisible();

    // Properties round-trip: W is the drawn width; set it numerically
    // (the inspector stays on its own tab — auto-follow is L8's Simple mode)
    await page.getByTestId("insp-props").click();
    const w0 = Number(await page.getByTestId("prop-w").inputValue());
    expect(w0).toBeGreaterThan(0);
    await page.getByTestId("prop-w").fill("2");
    await page.getByTestId("prop-w").press("Enter");
    await expect(page.getByTestId("prop-w")).toHaveValue("2");

    // drag-move the object; X/Y advance
    const x0 = Number(await page.getByTestId("prop-x").inputValue());
    const objBox = (await page.getByTestId("object-rect").boundingBox())!;
    await page.mouse.move(objBox.x + objBox.width / 2, objBox.y + objBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(objBox.x + objBox.width / 2 + 60, objBox.y + objBox.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    const x1 = Number(await page.getByTestId("prop-x").inputValue());
    expect(x1).toBeGreaterThan(x0);

    // resize via the se handle; W grows
    const se = (await page.getByTestId("handle-se").boundingBox())!;
    await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
    await page.mouse.down();
    await page.mouse.move(se.x + se.width / 2 + 50, se.y + se.height / 2 + 30, { steps: 6 });
    await page.mouse.up();
    const w1 = Number(await page.getByTestId("prop-w").inputValue());
    expect(w1).toBeGreaterThan(2);

    // undo unwinds resize → move → numeric edit, one gesture each
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByTestId("prop-w")).toHaveValue("2");
    await page.keyboard.press("ControlOrMeta+z"); // undo the move
    await expect(page.getByTestId("prop-x")).toHaveValue(String(x0));
    await page.keyboard.press("ControlOrMeta+z"); // undo the numeric W edit
    await expect(page.getByTestId("prop-w")).toHaveValue(String(w0));
    // redo brings the numeric edit back
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(page.getByTestId("prop-w")).toHaveValue("2");
  });

  test("duplicate, delete, and undo-restore via the keyboard", async ({ page }) => {
    await page.goto("/layout");
    await page.getByTestId("tool-ellipse").click();
    await drag(page, { x: 60, y: 60 }, { x: 160, y: 140 });
    await expect(page.getByTestId("object-ellipse")).toHaveCount(1);

    await page.keyboard.press("ControlOrMeta+d");
    await expect(page.getByTestId("object-ellipse")).toHaveCount(2);
    await expect(page.getByTestId("status-tool")).toHaveText("Select tool · 1 object");

    await page.keyboard.press("Delete");
    await expect(page.getByTestId("object-ellipse")).toHaveCount(1);
    await expect(page.getByTestId("status-tool")).toHaveText("Select tool · ready");

    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByTestId("object-ellipse")).toHaveCount(2);
  });

  test("lines draw and expose endpoint handles; Escape deselects", async ({ page }) => {
    await page.goto("/layout");
    await page.getByTestId("tool-line").click();
    await drag(page, { x: 40, y: 200 }, { x: 200, y: 260 });
    await expect(page.getByTestId("object-line")).toHaveCount(1);
    await expect(page.getByTestId("handle-p1")).toBeVisible();
    await expect(page.getByTestId("handle-p2")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("handle-p1")).toBeHidden();
    await expect(page.getByTestId("status-tool")).toHaveText("Select tool · ready");
  });

  test("fill swatches restyle the selection; drawn objects persist", async ({ page }) => {
    await page.goto("/layout");
    await page.getByTestId("tool-rect").click();
    await drag(page, { x: 40, y: 40 }, { x: 140, y: 120 });

    await page.getByTestId("insp-props").click();
    await page.getByTestId("fill-CC0000").click();
    await expect(page.getByTestId("object-rect")).toHaveCSS(
      "background-color",
      "rgb(204, 0, 0)",
    );

    await page.reload();
    await expect(page.getByTestId("object-rect")).toHaveCount(1);
    await expect(page.getByTestId("object-rect")).toHaveCSS(
      "background-color",
      "rgb(204, 0, 0)",
    );
  });

  test("Insert band arms tools; Table is honest about being deferred", async ({ page }) => {
    await page.goto("/layout");
    await page.getByTestId("ribbon-insert").click();
    await page.getByTestId("insert-picture").click();
    await expect(page.getByTestId("tool-pic")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("status-tool")).toHaveText("Picture tool · drag to draw");

    await page.getByTestId("tool-table").click();
    await expect(page.getByTestId("status-tool")).toHaveText(
      "Table tool · coming later in the beta",
    );
  });
});

/**
 * Text frames & typography (plan step L5): the novice promo sign end-to-end —
 * custom-size page, styled headline, body text — plus edit sessions as
 * single undo steps, the overflow badge, and the typography controls.
 */
test.describe("Text frames & typography (L5)", () => {
  async function dragOnPage(
    page: import("@playwright/test").Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    const box = (await page.getByTestId("publication-page").boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
    await page.mouse.up();
  }

  /** Draw a text frame and type into the auto-opened edit session. */
  async function typeFrame(
    page: import("@playwright/test").Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
    content: string,
  ) {
    await page.getByTestId("tool-text").click();
    await dragOnPage(page, from, to);
    await expect(page.getByTestId("text-edit-overlay")).toBeVisible();
    await page.keyboard.type(content);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("text-edit-overlay")).toBeHidden();
  }

  test("the novice promo sign: custom page, styled headline, body — persists", async ({
    page,
  }) => {
    await page.goto("/layout?custom=1");
    await expect(page.getByTestId("page-w")).toBeFocused();
    await page.getByTestId("page-w").fill("12");
    await page.getByTestId("page-w").press("Enter");
    await page.getByTestId("page-h").fill("18");
    await page.getByTestId("page-h").press("Enter");
    await expect(page.getByTestId("size-hint")).toHaveText("· Custom · 12 × 18 in");

    // headline, then style it with the Heading bundle from the Home band
    await typeFrame(page, { x: 30, y: 30 }, { x: 300, y: 80 }, "SPRING SALE");
    await expect(page.getByTestId("status-tool")).toHaveText("Select tool · 1 object");
    await page.getByTestId("style-heading").click();
    const headline = page.getByTestId("object-text").first().getByTestId("text-content");
    await expect(headline).toContainText("SPRING SALE");
    await expect(headline).toHaveCSS("font-weight", "700");

    // body copy, centered from the Text inspector tab
    await typeFrame(
      page,
      { x: 30, y: 120 },
      { x: 300, y: 240 },
      "Everything for the season — this week only.",
    );
    await page.getByTestId("insp-text").click();
    await page.getByTestId("tab-align-center").click();
    const body = page.getByTestId("object-text").nth(1).getByTestId("text-content");
    await expect(body).toHaveCSS("text-align", "center");

    // the whole sign survives a reload
    await page.reload();
    await expect(page.getByTestId("object-text")).toHaveCount(2);
    await expect(
      page.getByTestId("object-text").first().getByTestId("text-content"),
    ).toHaveCSS("font-weight", "700");
    await expect(page.getByTestId("object-text").nth(1)).toContainText("this week only");
  });

  test("double-click re-edits; each session is one undo step", async ({ page }) => {
    await page.goto("/layout");
    await typeFrame(page, { x: 40, y: 40 }, { x: 260, y: 110 }, "Hello");

    await page.getByTestId("object-text").dblclick();
    await expect(page.getByTestId("text-edit-overlay")).toBeVisible();
    await page.keyboard.type(" world");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("text-content")).toContainText("Hello world");

    await page.keyboard.press("ControlOrMeta+z"); // undo session 2
    await expect(page.getByTestId("text-content")).toContainText("Hello");
    await expect(page.getByTestId("text-content")).not.toContainText("world");
    await page.keyboard.press("ControlOrMeta+z"); // undo session 1 → empty frame
    await expect(page.getByTestId("text-content")).toHaveText("");
    await page.keyboard.press("ControlOrMeta+z"); // undo the draw
    await expect(page.getByTestId("object-text")).toHaveCount(0);
  });

  test("the overflow badge tracks frame size", async ({ page }) => {
    await page.goto("/layout");
    await typeFrame(
      page,
      { x: 40, y: 40 },
      { x: 280, y: 160 },
      "The quick brown fox jumps over the lazy dog. ".repeat(4).trim(),
    );

    await page.getByTestId("insp-props").click();
    await page.getByTestId("prop-h").fill("0.2");
    await page.getByTestId("prop-h").press("Enter");
    await expect(page.getByTestId("overflow-badge")).toBeVisible();

    await page.getByTestId("prop-h").fill("6");
    await page.getByTestId("prop-h").press("Enter");
    await expect(page.getByTestId("overflow-badge")).toBeHidden();
  });

  test("B/I/U, family, size, and line spacing restyle the target", async ({ page }) => {
    await page.goto("/layout");
    await typeFrame(page, { x: 40, y: 40 }, { x: 300, y: 140 }, "Style me");
    const content = page.getByTestId("text-content");

    await page.getByTestId("tog-bold").click();
    await expect(content).toHaveCSS("font-weight", "700");
    await page.getByTestId("tog-italic").click();
    await expect(content).toHaveCSS("font-style", "italic");
    await page.getByTestId("tog-underline").click();
    await expect(content).toHaveCSS("text-decoration-line", "underline");
    await page.getByTestId("font-family").selectOption("Georgia");
    await expect(content).toHaveCSS("font-family", /Georgia/);

    // exact metrics at a known zoom: 24 pt = 32 px, ×1.5 line = 48 px
    await page.getByTestId("zoom-slider").evaluate((el, value) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, "100");
    await page.getByTestId("font-size").selectOption("24");
    await expect(content).toHaveCSS("font-size", "32px");
    await page.getByTestId("ribbon-text").click();
    await page.getByTestId("text-band-line").selectOption("1.5");
    await expect(content).toHaveCSS("line-height", "48px");

    // undo unwinds the styling clicks one at a time — back to the 1.2 default
    await page.keyboard.press("ControlOrMeta+z");
    await expect(content).toHaveCSS("line-height", "38.4px");
  });

  test("typography controls disable without a text target", async ({ page }) => {
    await page.goto("/layout");
    await expect(page.getByTestId("tog-bold")).toBeDisabled();
    await expect(page.getByTestId("font-family")).toBeDisabled();
    await expect(page.getByTestId("style-heading")).toBeDisabled();

    // a rect selection is not a text target either
    await page.getByTestId("tool-rect").click();
    await dragOnPage(page, { x: 40, y: 40 }, { x: 160, y: 120 });
    await expect(page.getByTestId("tog-bold")).toBeDisabled();
  });
});

/**
 * Multi-page & masters (plan step L6): live thumbnails that track edits,
 * page switching via the pane and the status-bar nav, add/remove with the
 * last-page guard, master editing with propagation to every applied page,
 * per-page master binding, and multi-page persistence.
 */
test.describe("Multi-page & masters (L6)", () => {
  async function dragOnPage(
    page: import("@playwright/test").Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    const box = (await page.getByTestId("publication-page").boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
    await page.mouse.up();
  }

  test("pages hold separate objects; thumbnails, pane and status nav track", async ({ page }) => {
    await page.goto("/layout");
    await expect(page.getByTestId("page-indicator")).toHaveText("Page 1 of 1");
    await expect(page.getByTestId("page-prev")).toBeDisabled();
    await expect(page.getByTestId("page-next")).toBeDisabled();

    // add from the pane tile — the new page becomes active
    await page.getByTestId("page-add").click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Page 2 of 2");
    await expect(page.getByTestId("page-thumb-2")).toHaveAttribute("aria-current", "page");

    // draw a rectangle that lives on page 2 only
    await page.getByTestId("tool-rect").click();
    await dragOnPage(page, { x: 40, y: 40 }, { x: 180, y: 130 });
    await expect(page.getByTestId("object-rect")).toHaveCount(1);

    // switch to page 1 via its thumbnail: empty canvas, nav follows
    await page.getByTestId("page-thumb-1").click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Page 1 of 2");
    await expect(page.getByTestId("object-rect")).toHaveCount(0);

    // page 2's thumbnail mini-renders its rectangle (inline paint, no testid)
    await expect(
      page.getByTestId("page-thumb-2").locator("[style*='background-color']"),
    ).toHaveCount(1);

    // the status-bar ▶ walks back to page 2
    await page.getByTestId("page-next").click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Page 2 of 2");
    await expect(page.getByTestId("object-rect")).toHaveCount(1);
    await expect(page.getByTestId("page-next")).toBeDisabled();

    // the Insert band's Add page inserts after the active page
    await page.getByTestId("ribbon-insert").click();
    await page.getByTestId("insert-addpage").click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Page 3 of 3");
  });

  test("remove hands the slot to the neighbor; the last page is guarded; undo restores", async ({
    page,
  }) => {
    await page.goto("/layout");
    // a single page offers no remove affordance
    await page.getByTestId("page-thumb-1").hover();
    await expect(page.getByTestId("page-remove-1")).toHaveCount(0);

    await page.getByTestId("page-add").click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Page 2 of 2");
    await page.getByTestId("page-thumb-2").hover();
    await page.getByTestId("page-remove-2").click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Page 1 of 1");
    await expect(page.getByTestId("page-thumb-2")).toHaveCount(0);

    // removing a page is one undo step
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByTestId("page-indicator")).toHaveText("Page 1 of 2");
  });

  test("master edits propagate to every page that uses the master", async ({ page }) => {
    await page.goto("/layout");
    await page.getByTestId("page-add").click(); // two pages, both on master A

    // enter master editing from the Masters segment
    await page.getByTestId("pane-masters").click();
    await page.getByTestId("master-thumb-a").click();
    await expect(page.getByTestId("master-banner")).toContainText("Editing master A");
    await expect(page.getByTestId("page-indicator")).toHaveText("Master A");

    // draw the shared furniture — a footer bar on the master
    await page.getByTestId("tool-rect").click();
    await dragOnPage(page, { x: 40, y: 330 }, { x: 260, y: 360 });
    await expect(page.getByTestId("object-rect")).toHaveCount(1);

    // done: back on page 2, the furniture renders but can't be selected
    await page.getByTestId("master-done").click();
    await expect(page.getByTestId("master-banner")).toHaveCount(0);
    await expect(page.getByTestId("page-indicator")).toHaveText("Page 2 of 2");
    await expect(page.getByTestId("object-rect")).toHaveCount(1);
    await page.getByTestId("object-rect").click({ force: true });
    await expect(page.getByTestId("status-tool")).toHaveText("Select tool · ready");
    await expect(page.getByTestId("selection-frame")).toHaveCount(0);

    // page 1 shows the same furniture — the propagation contract
    await page.getByTestId("pane-pages").click();
    await page.getByTestId("page-thumb-1").click();
    await expect(page.getByTestId("object-rect")).toHaveCount(1);
  });

  test("masters bind per page: applying blank B clears A's furniture", async ({ page }) => {
    await page.goto("/layout");

    // furnish master A with an ellipse
    await page.getByTestId("pane-masters").click();
    await page.getByTestId("master-thumb-a").click();
    await page.getByTestId("tool-ellipse").click();
    await dragOnPage(page, { x: 100, y: 100 }, { x: 220, y: 200 });
    await page.getByTestId("master-done").click();
    await expect(page.getByTestId("object-ellipse")).toHaveCount(1);
    await expect(page.getByText("A · applied")).toBeVisible();

    // bind the page to blank master B instead
    await page.getByTestId("master-apply-b").click();
    await expect(page.getByText("B · applied")).toBeVisible();
    await expect(page.getByTestId("object-ellipse")).toHaveCount(0);

    // and back
    await page.getByTestId("master-apply-a").click();
    await expect(page.getByText("A · applied")).toBeVisible();
    await expect(page.getByTestId("object-ellipse")).toHaveCount(1);
  });

  test("+ New master creates a blank C and opens it for editing", async ({ page }) => {
    await page.goto("/layout");
    await page.getByTestId("pane-masters").click();
    await page.getByTestId("master-new").click();
    await expect(page.getByTestId("master-banner")).toContainText("Editing master C");
    await expect(page.getByTestId("page-indicator")).toHaveText("Master C");
    await expect(page.getByText("C · blank")).toBeVisible();
    await page.getByTestId("master-done").click();
    await expect(page.getByTestId("master-banner")).toHaveCount(0);
    await expect(page.getByTestId("page-indicator")).toHaveText("Page 1 of 1");
  });

  test("a multi-page publication with master furniture survives reload", async ({ page }) => {
    await page.goto("/layout");
    await page.getByTestId("page-add").click();
    await page.getByTestId("pane-masters").click();
    await page.getByTestId("master-thumb-a").click();
    await page.getByTestId("tool-rect").click();
    await dragOnPage(page, { x: 60, y: 300 }, { x: 280, y: 330 });
    await page.getByTestId("master-done").click();

    await page.reload();
    // rehydration lands on the first page of the restored two-page file
    await expect(page.getByTestId("page-indicator")).toHaveText("Page 1 of 2");
    await expect(page.getByTestId("page-thumb-2")).toBeVisible();
    await expect(page.getByTestId("object-rect")).toHaveCount(1);
  });
});

/**
 * Multi-select, align & snapping (plan step L7): shift-click and marquee
 * selection, group behavior, the live Align tab verified numerically, and
 * object-edge snapping with smart guides that appear mid-drag and clear.
 */
test.describe("Multi-select, align & snapping (L7)", () => {
  async function dragOnPage(
    page: import("@playwright/test").Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    const box = (await page.getByTestId("publication-page").boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
    await page.mouse.up();
  }

  async function drawRect(
    page: import("@playwright/test").Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    await page.getByTestId("tool-rect").click();
    await dragOnPage(page, from, to);
  }

  test("shift-click multi-selects; Align (relative to page) moves both — verified numerically", async ({
    page,
  }) => {
    await page.goto("/layout");
    await drawRect(page, { x: 40, y: 60 }, { x: 120, y: 120 });
    await drawRect(page, { x: 180, y: 150 }, { x: 260, y: 230 });

    // the second rect is selected; shift-click the first to grow the group
    await page.getByTestId("object-rect").first().click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("status-tool")).toHaveText("Select tool · 2 objects");
    await expect(page.getByTestId("multi-select-frame")).toHaveCount(2);

    await page.getByTestId("insp-align").click();
    await page.getByTestId("obj-align-top").click();

    // a dragless click on a member collapses the group to it — inspect each
    await page.getByTestId("insp-props").click();
    await page.getByTestId("object-rect").first().click();
    await expect(page.getByTestId("status-tool")).toHaveText("Select tool · 1 object");
    await expect(page.getByTestId("prop-y")).toHaveValue("0");
    await page.getByTestId("object-rect").nth(1).click();
    await expect(page.getByTestId("prop-y")).toHaveValue("0");

    // one undo restores both
    await page.keyboard.press("ControlOrMeta+z");
    await page.getByTestId("object-rect").nth(1).click();
    await expect(page.getByTestId("prop-y")).not.toHaveValue("0");
  });

  test("distribute equalizes gaps relative to the selection union", async ({ page }) => {
    await page.goto("/layout");
    // three rects, then pin their geometry numerically for an exact expectation
    const spots: [{ x: number; y: number }, { x: number; y: number }][] = [
      [{ x: 20, y: 40 }, { x: 70, y: 90 }],
      [{ x: 120, y: 40 }, { x: 170, y: 90 }],
      [{ x: 220, y: 40 }, { x: 270, y: 90 }],
    ];
    for (const [from, to] of spots) await drawRect(page, from, to);

    await page.getByTestId("insp-props").click();
    const geoms = [
      { x: "0", w: "1" },
      { x: "2", w: "1" },
      { x: "7", w: "1" },
    ];
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("object-rect").nth(i).click();
      await page.getByTestId("prop-x").fill(geoms[i].x);
      await page.getByTestId("prop-x").press("Enter");
      await page.getByTestId("prop-w").fill(geoms[i].w);
      await page.getByTestId("prop-w").press("Enter");
    }

    // select all three and distribute within the selection: 0 · 3.5 · 7
    await page.getByTestId("object-rect").first().click();
    await page.getByTestId("object-rect").nth(1).click({ modifiers: ["Shift"] });
    await page.getByTestId("object-rect").nth(2).click({ modifiers: ["Shift"] });
    await page.getByTestId("insp-align").click();
    await page.getByTestId("align-rel").selectOption("selection");
    await page.getByTestId("distribute-h").click();

    await page.getByTestId("insp-props").click();
    await page.getByTestId("object-rect").nth(1).click();
    await expect(page.getByTestId("prop-x")).toHaveValue("3.5");
    // the anchors stayed put
    await page.getByTestId("object-rect").first().click();
    await expect(page.getByTestId("prop-x")).toHaveValue("0");
    await page.getByTestId("object-rect").nth(2).click();
    await expect(page.getByTestId("prop-x")).toHaveValue("7");
  });

  test("a marquee from empty pasteboard rubber-bands a multi-selection", async ({ page }) => {
    await page.goto("/layout");
    await drawRect(page, { x: 60, y: 80 }, { x: 130, y: 140 });
    await drawRect(page, { x: 200, y: 180 }, { x: 270, y: 250 });

    const box = (await page.getByTestId("publication-page").boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 30); // empty page corner
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 270, { steps: 8 });
    await expect(page.getByTestId("marquee")).toBeVisible();
    await page.mouse.up();

    await expect(page.getByTestId("marquee")).toHaveCount(0);
    await expect(page.getByTestId("status-tool")).toHaveText("Select tool · 2 objects");
    await expect(page.getByTestId("multi-select-frame")).toHaveCount(2);
  });

  test("dragging near another object's edge snaps to it with smart guides", async ({ page }) => {
    await page.goto("/layout");
    // different rows, so the snapped rect never sits on top of the reference
    await drawRect(page, { x: 60, y: 100 }, { x: 140, y: 160 });
    await drawRect(page, { x: 260, y: 240 }, { x: 340, y: 300 });

    const a = (await page.getByTestId("object-rect").first().boundingBox())!;
    const b = (await page.getByTestId("object-rect").nth(1).boundingBox())!;

    // grab B and park its left edge 4px from A's left edge — inside the 6px radius
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + 4 + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await expect(page.getByTestId("smart-guide").first()).toBeVisible();
    await page.mouse.up();
    await expect(page.getByTestId("smart-guide")).toHaveCount(0);

    // left edges now agree exactly
    await page.getByTestId("insp-props").click();
    await page.getByTestId("object-rect").first().click();
    const ax = await page.getByTestId("prop-x").inputValue();
    await page.getByTestId("object-rect").nth(1).click();
    await expect(page.getByTestId("prop-x")).toHaveValue(ax);
  });
});

/**
 * Side panel, assets & layers (plan step L8): the collapsible vertical-tab
 * panel, image/PDF import with honest states, click-to-place with real
 * rendering and reload persistence, and the drag-reorderable layers list.
 */
test.describe("Side panel, assets & layers (L8)", () => {
  async function dragOnPage(
    page: import("@playwright/test").Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    const box = (await page.getByTestId("publication-page").boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
    await page.mouse.up();
  }

  test("the side panel collapses to its tab strip and switches tabs", async ({ page }) => {
    await page.goto("/layout");
    // Pages tab open by default — the L6 navigator is intact inside it
    await expect(page.getByTestId("side-panel")).toBeVisible();
    await expect(page.getByTestId("pane-pages")).toBeVisible();
    await expect(page.getByTestId("panel-tab-pages")).toHaveAttribute("aria-pressed", "true");

    // clicking the active tab collapses the panel; the strip stays
    await page.getByTestId("panel-tab-pages").click();
    await expect(page.getByTestId("side-panel")).toHaveCount(0);
    await expect(page.getByTestId("panel-tabs")).toBeVisible();

    // clicking any tab reopens to it; switching while open keeps it open
    await page.getByTestId("panel-tab-assets").click();
    await expect(page.getByTestId("asset-import")).toBeVisible();
    await page.getByTestId("panel-tab-layers").click();
    await expect(page.getByTestId("layers-empty")).toBeVisible();

    // the wire's name/size/zoom caption above the page came out in L8
    await expect(page.getByText(/Untitled publication · Letter/)).toHaveCount(0);
  });

  test("an imported image places at natural size, renders, and survives reload", async ({
    page,
  }) => {
    await page.goto("/layout");
    await page.getByTestId("panel-tab-assets").click();
    await page.getByTestId("asset-file-input").setInputFiles("e2e/fixtures/photo.png");
    await expect(page.getByTestId("asset-tile-0")).toContainText("photo.png");
    await expect(page.getByTestId("asset-tile-0")).toContainText("48 × 24 px");

    await page.getByTestId("asset-tile-0").click();
    await expect(page.getByTestId("object-picture")).toHaveCount(1);
    await expect(page.getByTestId("picture-image")).toBeVisible();

    // 48×24 px at 96 DPI is 0.5×0.25 in → scaled to the 2 in working minimum,
    // centered on Letter: x (8.5−2)/2, y (11−1)/2 — verified numerically
    await page.getByTestId("insp-props").click();
    await page.getByTestId("object-picture").click();
    await expect(page.getByTestId("prop-w")).toHaveValue("2");
    await expect(page.getByTestId("prop-h")).toHaveValue("1");
    await expect(page.getByTestId("prop-x")).toHaveValue("3.25");
    await expect(page.getByTestId("prop-y")).toHaveValue("5");

    // document metadata (localStorage) + bytes (IndexedDB) both persist
    await page.reload();
    await expect(page.getByTestId("picture-image")).toBeVisible();
    await page.getByTestId("panel-tab-assets").click();
    await expect(page.getByTestId("asset-tile-0")).toContainText("photo.png");
  });

  test("a PDF joins the library but stays honestly un-placeable", async ({ page }) => {
    await page.goto("/layout");
    await page.getByTestId("panel-tab-assets").click();
    await page.getByTestId("asset-file-input").setInputFiles("e2e/fixtures/flyer.pdf");
    await expect(page.getByTestId("asset-tile-0")).toContainText("flyer.pdf");
    await expect(page.getByTestId("asset-tile-0")).toContainText("library only");
    await expect(page.getByTestId("asset-tile-0")).toBeDisabled();
    await expect(page.getByTestId("object-picture")).toHaveCount(0);
  });

  test("clicking an asset with a picture frame selected fills that frame", async ({ page }) => {
    await page.goto("/layout");
    await page.getByTestId("tool-pic").click();
    await dragOnPage(page, { x: 60, y: 80 }, { x: 220, y: 200 });
    await expect(page.getByTestId("object-picture")).toHaveCount(1);

    // the freshly drawn frame is still selected — the click binds, not places
    await page.getByTestId("panel-tab-assets").click();
    await page.getByTestId("asset-file-input").setInputFiles("e2e/fixtures/photo.png");
    await page.getByTestId("asset-tile-0").click();
    await expect(page.getByTestId("object-picture")).toHaveCount(1);
    await expect(page.getByTestId("picture-image")).toBeVisible();
  });

  test("removing an asset leaves placed pictures in a visible missing state", async ({ page }) => {
    await page.goto("/layout");
    await page.getByTestId("panel-tab-assets").click();
    await page.getByTestId("asset-file-input").setInputFiles("e2e/fixtures/photo.png");
    await page.getByTestId("asset-tile-0").click();
    await expect(page.getByTestId("picture-image")).toBeVisible();

    await page.getByTestId("asset-tile-0").hover();
    await page.getByTestId("asset-remove-0").click();
    await expect(page.getByTestId("asset-tile-0")).toHaveCount(0);
    await expect(page.getByTestId("picture-missing")).toBeVisible();
    await expect(page.getByTestId("picture-missing")).toContainText("Image missing");
  });

  test("the layers list mirrors z-order, selects on click, and drag restacks", async ({
    page,
  }) => {
    await page.goto("/layout");
    await page.getByTestId("tool-rect").click();
    await dragOnPage(page, { x: 40, y: 60 }, { x: 120, y: 120 }); // bottom
    await page.getByTestId("tool-ellipse").click();
    await dragOnPage(page, { x: 160, y: 60 }, { x: 240, y: 120 }); // middle
    await page.getByTestId("tool-rect").click();
    await dragOnPage(page, { x: 280, y: 60 }, { x: 360, y: 120 }); // top

    await page.getByTestId("panel-tab-layers").click();
    await expect(page.getByTestId("layers-surface")).toContainText("Page 1");
    // topmost first — the reverse of draw order
    await expect(page.getByTestId("layer-row-0")).toContainText("Rectangle");
    await expect(page.getByTestId("layer-row-1")).toContainText("Ellipse");
    await expect(page.getByTestId("layer-row-2")).toContainText("Rectangle");

    // clicking a row selects the object on the canvas
    await page.getByTestId("layer-row-1").click();
    await expect(page.getByTestId("status-tool")).toHaveText("Select tool · 1 object");

    // drag the top row two slots down (28px rows) → it becomes the bottom object
    const row = (await page.getByTestId("layer-row-0").boundingBox())!;
    await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2);
    await page.mouse.down();
    await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2 + 56, { steps: 6 });
    await page.mouse.up();

    await expect(page.getByTestId("layer-row-0")).toContainText("Ellipse");
    // canvas paint order agrees: array is now [top rect, bottom rect, ellipse]
    const inked = page.locator('[data-testid="publication-page"] [data-testid^="object-"]');
    await expect(inked.nth(1)).toHaveAttribute("data-testid", "object-rect");
    await expect(inked.nth(2)).toHaveAttribute("data-testid", "object-ellipse");

    // the restack is one undo step
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByTestId("layer-row-0")).toContainText("Rectangle");
    await expect(inked.nth(1)).toHaveAttribute("data-testid", "object-ellipse");
  });
});
