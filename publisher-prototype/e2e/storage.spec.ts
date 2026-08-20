import { expect, test, type Page } from "@playwright/test";

/**
 * .staples open/save end to end (PLAN.md §6.9), driven on the fallback tier
 * (?storage=fallback): Playwright cannot operate native pickers, and the
 * fallback runs the identical container through download/upload — the FSA
 * tier's picker/permission/handle logic is unit-tested over fakes instead
 * (src/shell/storage/fsaProvider.test.ts).
 */

type DocumentSummary = { pages: number; objects: number; name: string };

function documentSummary(page: Page): Promise<DocumentSummary> {
  return page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    const doc = store.getState().document.present;
    return {
      pages: doc.pages.length,
      objects: doc.pages.reduce((count, p) => count + p.objects.length, 0),
      name: doc.name,
    };
  });
}

/** A real document edit from the keyboardless side: the Document setup
    panel's commit action, the same one its margin field dispatches. */
function commitMarginEdit(page: Page, margin: number): Promise<void> {
  return page.evaluate((value) => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    store.dispatch({ type: "document/setupCommitted", payload: { margin: value } });
  }, margin);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?storage=fallback");
  await expect(page.getByTestId("canvas-area")).toBeVisible();
});

test("a document saves to .staples and reopens identically", async ({ page }) => {
  await page.getByRole("button", { name: "Kitchen sink" }).click();
  await expect.poll(async () => (await documentSummary(page)).pages).toBe(2);
  const saved = await documentSummary(page);

  // Fallback tier: Save is honest about being a download.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save (downloads)" }).click();
  const download = await downloadPromise;
  // The download tier trades the em dash for a dash (downloadSafeName) —
  // headless Chromium drops non-ASCII download names wholesale.
  expect(download.suggestedFilename()).toBe(
    "Harborline Newsletter - schema v3 kitchen sink.staples",
  );
  // Re-materialize under the real name: download.path() is a UUID temp file,
  // and the reopen below reads the uploaded file's own name.
  const savedPath = test.info().outputPath("Harborline roundtrip.staples");
  await download.saveAs(savedPath);

  // The save named the file and cleared any dirty state.
  await expect(page.getByTestId("file-name")).toContainText(".staples");
  await expect(page.getByTestId("file-dirty")).toHaveCount(0);

  // Swap to a different document so the reopen provably applies.
  await page.getByRole("button", { name: "Minimal", exact: true }).click();
  await expect.poll(async () => (await documentSummary(page)).objects).toBe(0);
  // A fixture load detaches the file: back to Untitled.
  await expect(page.getByTestId("file-name")).toHaveText("Untitled");

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open…" }).click();
  await (await chooserPromise).setFiles(savedPath);

  await expect.poll(async () => await documentSummary(page)).toEqual(saved);
  await expect(page.getByTestId("file-name")).toContainText(".staples");
  // Loads reset history: undo stays disabled after a reopen.
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("the dirty dot tracks edits, undo, and save", async ({ page }) => {
  await page.getByRole("button", { name: "Kitchen sink" }).click();
  await expect.poll(async () => (await documentSummary(page)).pages).toBe(2);
  await expect(page.getByTestId("file-dirty")).toHaveCount(0);

  await commitMarginEdit(page, 0.75);
  await expect(page.getByTestId("file-dirty")).toBeVisible();

  // Undoing the only edit returns to the loaded baseline: clean again.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("file-dirty")).toHaveCount(0);

  // Edit again and save: the baseline moves to the saved document.
  await commitMarginEdit(page, 1);
  await expect(page.getByTestId("file-dirty")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save (downloads)" }).click();
  await downloadPromise;
  await expect(page.getByTestId("file-dirty")).toHaveCount(0);
});

test("a wrong file fails with an actionable error and leaves the document alone", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Kitchen sink" }).click();
  await expect.poll(async () => (await documentSummary(page)).pages).toBe(2);
  const before = await documentSummary(page);

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open…" }).click();
  await (await chooserPromise).setFiles({
    name: "not-a-container.staples",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("this is not a zip"),
  });

  await expect(page.getByRole("alert")).toContainText("not a ZIP archive");
  expect(await documentSummary(page)).toEqual(before);

  await page.getByRole("button", { name: "Dismiss file error" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
