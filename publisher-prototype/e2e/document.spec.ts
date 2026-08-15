import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * The JSON round trip through the debug bar (PLAN.md §6.6). The unit tests
 * prove the model round-trips; this proves the surface exposing it does too —
 * a document imported from a file and exported again comes back byte-identical.
 */

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/store-flyer.v3.json",
);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas-area")).toBeVisible();
});

test("imports an authored document and reports its name", async ({ page }) => {
  await expect(page.getByTestId("doc-name")).toHaveText("Untitled");

  await page.locator('input[type="file"]').setInputFiles(fixturePath);

  await expect(page.getByTestId("doc-name")).toHaveText("Spring Sale Flyer");
  const pageCount = await page.evaluate(() => {
    const store = window.__PROTOTYPE_STORE__;
    if (!store) throw new Error("dev store handle missing");
    return store.getState().document.pages.length;
  });
  expect(pageCount).toBe(2);
});

test("exports what it imported, byte for byte", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(page.getByTestId("doc-name")).toHaveText("Spring Sale Flyer");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);

  expect(Buffer.concat(chunks).toString("utf8")).toBe(readFileSync(fixturePath, "utf8"));
});

test("reports why a bad document was rejected, and keeps the current one", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version": 99}'),
  });

  await expect(page.getByTestId("import-error")).toContainText("newer version");
  await expect(page.getByTestId("doc-name")).toHaveText("Untitled");
});
