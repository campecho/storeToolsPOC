import { test, expect, type Page } from "@playwright/test";

/**
 * The first board landing per session auto-plays the celebrate queue (§5.6) —
 * dismiss it so the test can interact with the board underneath.
 */
async function dismissAutoCelebrate(page: Page) {
  await expect(page.getByTestId("celebrate-modal")).toBeVisible();
  await page.getByTestId("celebrate-dismiss").click();
  await expect(page.getByTestId("celebrate-modal")).toBeHidden();
}

test.describe("Home & file intake", () => {
  test("renders the header chrome and homepage sections", async ({ page }) => {
    await page.goto("/");

    // persistent header
    await expect(page.getByText("Print Studio", { exact: true })).toBeVisible();
    await expect(page.getByText("Store #1284")).toBeVisible();
    await expect(page.getByTestId("give-feedback")).toBeVisible();

    // homepage sections
    await expect(page.getByText("Bring in a file")).toBeVisible();
    await expect(page.getByText("Drop a customer file to start")).toBeVisible();
    await expect(page.getByText("Pick a product", { exact: true })).toBeVisible();
    await expect(page.getByText("Business cards", { exact: true })).toBeVisible();

    // recognition card with live impact tally
    await expect(page.getByText("7 improvements")).toBeVisible();

    // coachmark shows on first visit and dismisses
    const coachHeadline = page.getByText("Hit a snag or have an idea?", { exact: true });
    await expect(coachHeadline).toBeVisible();
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(coachHeadline).toBeHidden();
  });
});

test.describe("Report flow", () => {
  test("files a bug and lands highlighted on the board", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("give-feedback").click();

    await expect(page.getByText("One sentence from you — we capture the rest.")).toBeVisible();
    await page.getByTestId("choose-bug").click();

    // bug form with auto-captured context
    await expect(page.getByText("What went wrong?")).toBeVisible();
    await expect(page.getByText("We've already captured the context")).toBeVisible();
    await expect(page.getByText("Attach the customer file that misbehaved")).toBeVisible();

    await page.getByTestId("report-title").fill("Stapler icon overlaps the toolbar");
    await page.getByTestId("report-desc").fill("It broke mid-order.");
    await page.getByTestId("report-submit").click();

    await expect(page.getByText("Filed. Tracked to Store #1284.")).toBeVisible();
    await page.getByTestId("confirm-see-board").click();

    await expect(page).toHaveURL(/\/feedback\/board/);
    await dismissAutoCelebrate(page);
    const newItem = page.getByTestId("board-item-100");
    await expect(newItem).toBeVisible();
    await expect(newItem).toContainText("Stapler icon overlaps the toolbar");
    await expect(newItem).toContainText("Raised by your store");
    // red-ring highlight on the newly filed item
    await expect(newItem).toHaveCSS("border-color", "rgb(204, 0, 0)");
  });

  test("similar-items panel backs an existing item instead of filing a duplicate", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("give-feedback").click();
    await page.getByTestId("choose-bug").click();

    // Item 4 ("Barcodes render blurry below 600 dpi", 33 votes) is not yet
    // backed by this store — backing it must add the vote, not toggle it off.
    await page.getByTestId("report-title").fill("barcodes print blurry");
    const panel = page.getByTestId("similar-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Barcodes render blurry below 600 dpi");

    await panel.getByRole("button", { name: "Back this" }).first().click();
    await expect(page.getByText("Your store's backing is in.")).toBeVisible();
    await expect(page.getByText('"Barcodes render blurry below 600 dpi"')).toBeVisible();

    await page.getByRole("button", { name: "See it on the board" }).click();
    await expect(page).toHaveURL(/\/feedback\/board/);
    await dismissAutoCelebrate(page);
    const backed = page.getByTestId("board-item-4");
    await expect(backed).toContainText("34 stores");
    await expect(backed).toHaveCSS("border-color", "rgb(204, 0, 0)");
    // the backed vote button is filled red
    await expect(page.getByTestId("upvote-4")).toHaveCSS("background-color", "rgb(204, 0, 0)");

    // votes toggle on every surface: the same flow removes the standing vote,
    // with the button and confirmation reflecting the removal
    await page.getByTestId("give-feedback").click();
    await page.getByTestId("choose-bug").click();
    await page.getByTestId("report-title").fill("barcodes print blurry");
    // item 4 ranks first (highest overlap); item 2 also matches and is seed-backed
    await panel.getByRole("button", { name: "Remove backing" }).first().click();
    await expect(page.getByText("Your store's vote was removed.")).toBeVisible();

    await page.getByRole("button", { name: "See it on the board" }).click();
    await expect(page.getByTestId("upvote-4")).toContainText("33");
    await expect(page.getByTestId("upvote-4")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  });

  test("feature form shows the area auto-tag and files a request", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("give-feedback").click();
    await page.getByTestId("choose-feature").click();

    await expect(page.getByText("What do you want?")).toBeVisible();
    await expect(page.getByText("automatically — where you are right now.")).toBeVisible();

    await page.getByTestId("report-title").fill("Preset for laminated table tents");
    await page.getByTestId("report-submit").click();
    await expect(page.getByText("Filed. Tracked to Store #1284.")).toBeVisible();
  });
});

test.describe("The board", () => {
  test("filters compose: type, status, and store-hierarchy scope", async ({ page }) => {
    await page.goto("/feedback/board");
    await dismissAutoCelebrate(page);
    await expect(page.getByTestId("board-subline")).toHaveText(
      "7 open items · All stores · ranked by store votes",
    );
    // delivered items live in the Recently shipped band, not the ranked list
    await expect(page.getByTestId("board-item-9")).toBeHidden();
    await expect(page.getByTestId("shipped-row-9")).toBeVisible();
    // and there is no shipped status filter anymore
    await expect(page.getByRole("button", { name: "Shipped / Fixed" })).toBeHidden();

    await page.getByRole("button", { name: "Bugs" }).click();
    await expect(page.getByTestId("board-subline")).toContainText("4 open items");
    await expect(page.getByTestId("board-item-2")).toBeVisible();
    await expect(page.getByTestId("board-item-1")).toBeHidden(); // feature filtered out

    await page.getByRole("button", { name: "Planned", exact: true }).click();
    await expect(page.getByTestId("board-subline")).toContainText("1 open item ·");
    await expect(page.getByTestId("board-item-2")).toBeVisible();
    await expect(page.getByTestId("board-item-4")).toBeHidden(); // new filtered out

    await page.getByRole("button", { name: "My store #1284" }).click();
    await expect(page.getByTestId("board-subline")).toContainText("1 open item · My store #1284");
    await expect(page.getByTestId("board-item-2")).toBeVisible();

    // declined / closed items have their own filter row
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.getByRole("button", { name: "All stores (chain)" }).click();
    await page.getByRole("button", { name: "Declined / closed" }).click();
    await expect(page.getByTestId("board-subline")).toContainText("1 closed item");
    await expect(page.getByTestId("board-item-8")).toBeVisible();
    await expect(page.getByTestId("board-item-2")).toBeHidden();
  });

  test("search matches title/area/description and always ranks by votes", async ({ page }) => {
    await page.goto("/feedback/board");
    await dismissAutoCelebrate(page);

    await page.getByTestId("board-search").fill("publisher converter"); // area match
    await expect(page.getByTestId("board-subline")).toContainText("1 open item");
    await expect(page.getByTestId("board-item-5")).toBeVisible();
    // item 12 also matches but is delivered — never in the ranked list
    await expect(page.getByTestId("board-item-12")).toBeHidden();

    // no matches → empty state with a one-tap reset
    await page.getByTestId("board-search").fill("zzz nothing matches this");
    await expect(page.getByTestId("board-empty")).toBeVisible();
    await page.getByRole("button", { name: "Clear search & filters" }).click();
    await expect(page.getByTestId("board-subline")).toContainText("7 open items");

    // votes-desc ranking: the 61-vote item leads the unfiltered list
    const first = page.locator('[data-testid^="board-item-"]').first();
    await expect(first).toContainText("Save a customer's brand colors to reuse next visit");
  });

  test("upvote toggles on the board row — one vote per store", async ({ page }) => {
    await page.goto("/feedback/board");
    await dismissAutoCelebrate(page);
    const vote = page.getByTestId("upvote-1");

    await expect(vote).toContainText("61");
    await vote.click();
    await expect(vote).toContainText("62");
    await expect(vote).toHaveCSS("background-color", "rgb(204, 0, 0)");

    await vote.click(); // second tap removes the store's vote, not another tally
    await expect(vote).toContainText("61");
    await expect(vote).toHaveCSS("background-color", "rgb(255, 255, 255)");
  });
});

test.describe("Item detail drawer", () => {
  test("opens from a row, shows timeline + preserved reports, and vote/follow stay in sync", async ({ page }) => {
    await page.goto("/feedback/board");
    await dismissAutoCelebrate(page);

    // Open the large-format resize bug (id 2): planned, backed by this store.
    await page.getByTestId("board-item-2").click();
    const drawer = page.getByTestId("detail-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Large-format resize crashes when the file is over ~200 MB");

    // status timeline
    await expect(drawer.getByText("New", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Planned", { exact: true })).toBeVisible();

    // preserved reports: this store's own words are kept
    await expect(drawer).toContainText("47 stores across 9 districts back this");
    await expect(drawer).toContainText("App freezes resizing large banners over 200MB.");

    // follow toggles
    const follow = page.getByTestId("detail-follow");
    await expect(follow).toHaveText("Following");
    await follow.click();
    await expect(follow).toHaveText("Follow");

    // unvote in the drawer reflects on the board row underneath
    await expect(page.getByTestId("detail-upvote")).toContainText("Backed by your store");
    await page.getByTestId("detail-upvote").click();
    await expect(page.getByTestId("detail-upvote")).toContainText("Add your store's vote");
    await expect(page.getByTestId("upvote-2")).toContainText("46"); // 47 → 46
  });

  test("declined item shows the honest reason; shipped item cross-links to releases", async ({ page }) => {
    await page.goto("/feedback/board");
    await dismissAutoCelebrate(page);

    // declined items sit behind their own filter now
    await page.getByRole("button", { name: "Declined / closed" }).click();
    await page.getByTestId("board-item-8").click(); // dark mode — declined
    await expect(page.getByTestId("detail-drawer")).toContainText("Why we're not doing this");
    await expect(page.getByTestId("detail-drawer")).toContainText("color-calibrated for accurate proofing");

    // Escape closes the drawer (keyboard counterpart of the backdrop click)
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("detail-drawer")).toBeHidden();

    // a delivered item opens from the Recently shipped band
    await page.getByTestId("shipped-row-9").click(); // bleed fix — done bug
    await expect(page.getByTestId("detail-drawer")).toContainText("Fixed in v1.4");
    await page.getByTestId("detail-see-release").click();
    await expect(page).toHaveURL(/\/feedback\/releases/);
    await expect(page.getByTestId("detail-drawer")).toBeHidden();
  });
});

test.describe("What's new / Releases", () => {
  test("release cards render badges, credits, and delivered items", async ({ page }) => {
    await page.goto("/feedback/releases");

    await expect(page.getByText("You asked, we delivered.")).toBeVisible();
    await expect(page.getByText("7 improvements")).toBeVisible();

    const latest = page.getByTestId("release-v1.4");
    await expect(latest.getByText("Latest")).toBeVisible();
    await expect(latest.getByText("Your store asked")).toBeVisible();
    await expect(latest.getByText("Cleaner edges, straighter cuts, faster proofs.")).toBeVisible();

    // credits: red when this store backed it, gray otherwise
    await expect(latest.getByText("Your store + 8 asked")).toHaveCSS("color", "rgb(204, 0, 0)");
    await expect(latest.getByText("10 stores asked")).toHaveCSS("color", "rgb(153, 153, 153)");

    // v1.0 launch row: no stores recorded → no credit, no View link
    const launch = page.getByTestId("release-v1.0");
    await expect(launch.getByText("Unified file intake and product picker")).toBeVisible();
    await expect(launch.getByText("View →")).toBeHidden();
    await expect(launch.getByText("asked", { exact: false })).toHaveCount(0); // no credit line renders
  });

  test("View → cross-links a delivered item back to its board detail", async ({ page }) => {
    // Land on the board first so the session's auto-celebrate is spent —
    // on the very first landing the celebrate moment wins over any drawer.
    await page.goto("/feedback/board");
    await dismissAutoCelebrate(page);
    await page.getByRole("link", { name: "What's new" }).click();

    await page.getByTestId("release-v1.4").getByText("One-click proof PDF").click();
    await expect(page).toHaveURL(/\/feedback\/board/);
    const drawer = page.getByTestId("detail-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("One-click proof PDF I can text to the customer");
    await expect(drawer).toContainText("Shipped in v1.4");
  });
});

test.describe("Notifications & celebrate", () => {
  test("first board landing auto-plays the shipped queue with working controls", async ({ page }) => {
    await page.goto("/feedback/board");

    const modal = page.getByTestId("celebrate-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("You asked, we delivered");
    await expect(modal).toContainText("Cut template is off-center on the right guillotine");
    await expect(modal).toContainText("Fixed in v1.4");
    await expect(page.getByTestId("celebrate-counter")).toHaveText("1 of 2");
    await expect(page.getByTestId("celebrate-prev")).toHaveCSS("opacity", "0.35"); // dimmed at the start

    await page.getByTestId("celebrate-next").click();
    await expect(page.getByTestId("celebrate-counter")).toHaveText("2 of 2");
    await expect(modal).toContainText("Background doesn't extend to the bleed on imported PDFs");
    await expect(page.getByTestId("celebrate-next")).toHaveCSS("opacity", "0.35"); // dimmed at the end

    await expect(page.getByTestId("celebrate-dismiss")).toHaveText("Dismiss all");
    await page.getByTestId("celebrate-dismiss").click();
    await expect(modal).toBeHidden();

    // once per session: leaving and returning does not re-fire
    await page.getByRole("link", { name: "Back to Print Studio" }).click();
    await page.getByTestId("open-board").click();
    await expect(page).toHaveURL(/\/feedback\/board/);
    await expect(modal).toBeHidden();
  });

  test("bell dropdown routes a status notification to the item and marks it read", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("notif-bell").click();

    const dropdown = page.getByTestId("notif-dropdown");
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toContainText("3 unread");

    await page.getByTestId("notif-n3").click(); // status: "moved to Planned"
    await expect(page).toHaveURL(/\/feedback\/board/);
    // notification routing shows the item detail — the celebration doesn't clobber it
    await expect(page.getByTestId("celebrate-modal")).toBeHidden();
    const drawer = page.getByTestId("detail-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Large-format resize crashes when the file is over ~200 MB");

    // marked read: badge drops 3 → 2
    await expect(page.getByTestId("notif-bell")).toContainText("2");
  });

  test("shipped notification fires the celebrate moment and links to what's new", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("notif-bell").click();
    await page.getByTestId("notif-n1").click(); // shipped: guillotine fix

    const modal = page.getByTestId("celebrate-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Cut template is off-center on the right guillotine");
    await expect(page.getByTestId("celebrate-counter")).toBeHidden(); // single item — no queue controls
    await expect(page.getByTestId("celebrate-dismiss")).toHaveText("Nice");

    await page.getByTestId("celebrate-see-releases").click();
    await expect(page).toHaveURL(/\/feedback\/releases/);
    await expect(page.getByTestId("release-v1.4")).toBeVisible();
  });
});

test.describe("Persistence", () => {
  test("filed reports survive a reload; reset restores the demo", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("give-feedback").click();
    await page.getByTestId("choose-bug").click();
    await page.getByTestId("report-title").fill("Persistence check item");
    await page.getByTestId("report-submit").click();
    await page.getByRole("button", { name: "Back to my work" }).click();

    await page.goto("/feedback/board");
    await dismissAutoCelebrate(page);
    await expect(page.getByTestId("board-item-100")).toContainText("Persistence check item");

    // survives a full reload — and the already-played celebration must NOT
    // replay, since the shipped notifications' read-state persisted
    await page.reload();
    await expect(page.getByTestId("board-item-100")).toContainText("Persistence check item");
    await expect(page.getByTestId("celebrate-modal")).toBeHidden();
    await expect(page.getByTestId("board-subline")).toContainText("8 open items");

    // reset restores the pristine seed
    await page.getByTestId("reset-demo").click();
    await expect(page.getByTestId("board-item-100")).toBeHidden();
    await expect(page.getByTestId("board-subline")).toContainText("7 open items");
  });
});

test.describe("Recently shipped", () => {
  test("band groups the week's deliveries; Got it / Clear all acknowledge and persist", async ({ page }) => {
    await page.goto("/feedback/board");
    await dismissAutoCelebrate(page);

    const band = page.getByTestId("shipped-group");
    await expect(band).toBeVisible();
    await expect(band).toContainText("Recently shipped");

    // most recent first, each with its release + age
    const rows = band.locator('[data-testid^="shipped-row-"]');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Cut template is off-center on the right guillotine");
    await expect(rows.nth(0)).toContainText("Fixed in v1.4 · 2 days ago");
    await expect(rows.nth(2)).toContainText("One-click proof PDF I can text to the customer");
    await expect(rows.nth(2)).toContainText("Shipped in v1.4 · 6 days ago");
    // v1.3's fix (43 days old) fell off the 7-day window
    await expect(band).not.toContainText("Fonts substitute silently");

    // a band row opens the item's detail like any board row
    await rows.nth(0).click();
    await expect(page.getByTestId("detail-drawer")).toContainText("Cut template is off-center");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("detail-drawer")).toBeHidden();

    // Got it clears one entry — and the acknowledgment survives a reload
    await page.getByTestId("shipped-got-it-11").click();
    await expect(rows).toHaveCount(2);
    await page.reload();
    await expect(page.getByTestId("celebrate-modal")).toBeHidden(); // read-state persisted too
    await expect(page.getByTestId("shipped-group").locator('[data-testid^="shipped-row-"]')).toHaveCount(2);

    // Clear all empties and hides the band
    await page.getByTestId("shipped-clear-all").click();
    await expect(page.getByTestId("shipped-group")).toBeHidden();
  });
});

test.describe("Tracker navigation", () => {
  test("sub-bar tabs switch between board and releases; back returns home", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("open-board").click();
    await expect(page).toHaveURL(/\/feedback\/board/);
    await dismissAutoCelebrate(page);
    await expect(page.getByText("What stores are asking for")).toBeVisible();

    await page.getByRole("link", { name: "What's new" }).click();
    await expect(page).toHaveURL(/\/feedback\/releases/);
    await expect(page.getByText("You asked, we delivered.")).toBeVisible();

    await page.getByRole("link", { name: "Back to Print Studio" }).click();
    await expect(page.getByText("Drop a customer file to start")).toBeVisible();
  });
});
