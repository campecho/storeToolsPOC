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

    // experience switch shows Standard active (Simple/Pro disabled until L8)
    await expect(page.getByTestId("experience-switch")).toContainText("Standard");

    // true-scale page + pasteboard caption (zoom = computed fit) + guide legend
    await expect(page.getByTestId("publication-page")).toBeVisible();
    await expect(page.getByText(/Untitled publication · Letter 8\.5 × 11 in · \d+%/)).toBeVisible();
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
  test("page setup edits reflect live in page, hint, and caption", async ({ page }) => {
    await page.goto("/layout");

    // preset → Ledger (inspector Page tab is the default)
    await page.getByTestId("preset-select").selectOption("ledger");
    await expect(page.getByTestId("size-hint")).toHaveText("· Ledger · 11 × 17 in");
    await expect(page.getByText(/· Ledger 11 × 17 in · \d+%/)).toBeVisible();

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
