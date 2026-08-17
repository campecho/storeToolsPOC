import { expect, test, type Page } from "@playwright/test";

/**
 * Debug-bar document round-trip (PLAN.md §6.6): fixtures and imports enter
 * the store through the one parse door, export downloads what the store
 * holds, and history starts empty. Konva renders to canvas, so assertions
 * run against store state via the dev handle.
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

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas-area")).toBeVisible();
});

test("kitchen-sink fixture loads a 2-page document and round-trips through export/import", async ({
  page,
}) => {
  // History starts empty: undo is disabled before any gesture commits.
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Kitchen sink" }).click();
  await expect.poll(async () => (await documentSummary(page)).pages).toBe(2);
  const loaded = await documentSummary(page);
  expect(loaded.objects).toBeGreaterThan(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  const exportedPath = await download.path();

  // Swap to a different document so the import provably applies.
  await page.getByRole("button", { name: "Minimal", exact: true }).click();
  await expect.poll(async () => (await documentSummary(page)).objects).toBe(0);

  await page.getByLabel("Import document file").setInputFiles(exportedPath);
  await expect.poll(async () => await documentSummary(page)).toEqual(loaded);

  // Loads replace the document and reset history — undo stays disabled.
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});
