import { test, expect } from "@playwright/test";

/**
 * .staples open/save in the layout editor (docs/STORAGE_PLAN.md P1), driven
 * on the fallback tier (?storage=fallback) because Playwright cannot operate
 * native pickers — the File System Access tier's picker/permission/handle
 * logic is unit-tested over fakes (src/lib/storage/fsa-provider.test.ts).
 */
test.describe("Local device storage (.staples)", () => {
  test("File menu saves the document and reopens it identically", async ({ page }) => {
    await page.goto("/layout?storage=fallback");
    await expect(page.getByTestId("doc-name")).toHaveValue("Untitled publication");

    // Give the document a recognizable name and an edit worth carrying.
    await page.getByTestId("doc-name").fill("Roundtrip flyer");
    await page.getByTestId("tool-rect").click();
    const pageBox = await page.getByTestId("publication-page").boundingBox();
    if (!pageBox) throw new Error("page not laid out");
    await page.mouse.move(pageBox.x + 60, pageBox.y + 60);
    await page.mouse.down();
    await page.mouse.move(pageBox.x + 200, pageBox.y + 160);
    await page.mouse.up();

    // Save through the File menu — the fallback tier downloads.
    await page.getByTestId("ribbon-file").click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /^Save \(downloads\)/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("Roundtrip flyer.staples");
    const savedPath = test.info().outputPath("Roundtrip flyer.staples");
    await download.saveAs(savedPath);

    // Start over so the reopen provably applies.
    await page.getByTestId("ribbon-file").click();
    await expect(page.getByTestId("file-menu-name")).toContainText("Roundtrip flyer.staples");
    // Close via the backdrop, then reset the working session entirely.
    await page.mouse.click(700, 500);
    await page.evaluate(() => {
      window.localStorage.removeItem("stp-layout-v1");
    });
    await page.reload();
    await expect(page.getByTestId("doc-name")).toHaveValue("Untitled publication");

    // Reopen via the File menu on the fallback tier's file input.
    await page.getByTestId("ribbon-file").click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /^Open…/ }).click();
    await (await chooserPromise).setFiles(savedPath);

    await expect(page.getByTestId("doc-name")).toHaveValue("Roundtrip flyer");
    await page.getByTestId("ribbon-file").click();
    await expect(page.getByTestId("file-menu-name")).toContainText("Roundtrip flyer.staples");
  });

  test("a wrong file surfaces an actionable error and leaves the document alone", async ({
    page,
  }) => {
    await page.goto("/layout?storage=fallback");
    await expect(page.getByTestId("doc-name")).toHaveValue("Untitled publication");

    await page.getByTestId("ribbon-file").click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /^Open…/ }).click();
    await (await chooserPromise).setFiles({
      name: "not-a-container.staples",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("this is not a zip"),
    });

    await expect(page.getByTestId("file-error")).toContainText("not a ZIP archive");
    await expect(page.getByTestId("doc-name")).toHaveValue("Untitled publication");
    await page.getByRole("button", { name: "Dismiss file error" }).click();
    await expect(page.getByTestId("file-error")).toHaveCount(0);
  });
});
