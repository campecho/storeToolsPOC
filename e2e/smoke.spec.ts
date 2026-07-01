import { test, expect } from "@playwright/test";

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
    const backed = page.getByTestId("board-item-4");
    await expect(backed).toContainText("34 stores");
    await expect(backed).toHaveCSS("border-color", "rgb(204, 0, 0)");
    // the backed vote button is filled red
    await expect(page.getByTestId("upvote-4")).toHaveCSS("background-color", "rgb(204, 0, 0)");
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
    await expect(page.getByTestId("board-subline")).toHaveText(
      "12 open items · All stores · ranked by store votes",
    );

    await page.getByRole("button", { name: "Bugs" }).click();
    await expect(page.getByTestId("board-subline")).toContainText("7 open items");
    await expect(page.getByTestId("board-item-2")).toBeVisible();
    await expect(page.getByTestId("board-item-1")).toBeHidden(); // feature filtered out

    await page.getByRole("button", { name: "Shipped / Fixed" }).click();
    await expect(page.getByTestId("board-item-9")).toBeVisible();
    await expect(page.getByTestId("board-item-2")).toBeHidden(); // planned filtered out

    await page.getByRole("button", { name: "My store #1284" }).click();
    await expect(page.getByTestId("board-subline")).toContainText("2 open items · My store #1284");
    await expect(page.getByTestId("board-item-11")).toBeVisible();
    await expect(page.getByTestId("board-item-12")).toBeHidden(); // fixed, but not this store's
  });

  test("search matches title/area/description and always ranks by votes", async ({ page }) => {
    await page.goto("/feedback/board");

    await page.getByTestId("board-search").fill("publisher converter"); // area match
    await expect(page.getByTestId("board-subline")).toContainText("2 open items");
    await expect(page.getByTestId("board-item-5")).toBeVisible();
    await expect(page.getByTestId("board-item-12")).toBeVisible();

    await page.getByTestId("board-search").fill("");
    await expect(page.getByTestId("board-subline")).toContainText("12 open items");

    // votes-desc ranking: the 61-vote item leads the unfiltered list
    const first = page.locator('[data-testid^="board-item-"]').first();
    await expect(first).toContainText("Save a customer's brand colors to reuse next visit");
  });

  test("upvote toggles on the board row — one vote per store", async ({ page }) => {
    await page.goto("/feedback/board");
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

    await page.getByTestId("board-item-8").click(); // dark mode — declined
    await expect(page.getByTestId("detail-drawer")).toContainText("Why we're not doing this");
    await expect(page.getByTestId("detail-drawer")).toContainText("color-calibrated for accurate proofing");
    await page.keyboard.press("Escape").catch(() => {});
    // close via backdrop then open a shipped item
    await page.getByTestId("detail-drawer").isVisible();
    await page.mouse.click(200, 450); // backdrop
    await page.getByTestId("board-item-9").click(); // bleed fix — done bug
    await expect(page.getByTestId("detail-drawer")).toContainText("Fixed in v1.4");
    await page.getByTestId("detail-see-release").click();
    await expect(page).toHaveURL(/\/feedback\/releases/);
    await expect(page.getByTestId("detail-drawer")).toBeHidden();
  });
});

test.describe("Tracker navigation", () => {
  test("sub-bar tabs switch between board and releases; back returns home", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("open-board").click();
    await expect(page).toHaveURL(/\/feedback\/board/);
    await expect(page.getByText("What stores are asking for")).toBeVisible();

    await page.getByRole("link", { name: "What's new" }).click();
    await expect(page).toHaveURL(/\/feedback\/releases/);
    await expect(page.getByText("You asked, we delivered.")).toBeVisible();

    await page.getByRole("link", { name: "Back to Print Studio" }).click();
    await expect(page.getByText("Drop a customer file to start")).toBeVisible();
  });
});
