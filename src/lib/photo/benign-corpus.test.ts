import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sniffImageMime } from "@/lib/import/image-meta";
import { intakeImage } from "./render-host";

/**
 * The benign corpus finalizers, opened through the REAL jail (photo plan §4
 * PE10d, §5). Each file under fixtures/photo-corpus/ named below is a synthetic
 * intake-robustness case written by scripts/make-benign-fixtures.mjs; this suite
 * proves each opens (or, for the oversize case, is refused) the way the pipeline
 * intends. The core decode path is always live (sharp ships with npm), so every
 * case spawns the real photo-worker.mjs.
 */

const CORPUS = join(process.cwd(), "fixtures", "photo-corpus");
const read = (name: string): Buffer => readFileSync(join(CORPUS, name));

describe("benign corpus — intake robustness (intakeImage)", () => {
  it("phone-photo.jpg: an EXIF Orientation=6 tag drives auto-orient — the master comes back portrait", async () => {
    const bytes = read("phone-photo.jpg");
    expect(sniffImageMime(bytes)).toBe("image/jpeg");
    const out = await intakeImage(bytes, "image/jpeg");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Stored 1024×768 landscape + Orientation=6 → intake's .rotate() applies it,
    // so the working master is 768×1024 portrait. This is the only corpus file
    // that exercises the orient step end-to-end through the jail.
    expect(out.master.width).toBe(768);
    expect(out.master.height).toBe(1024);
    expect(out.notes).toContain("EXIF orientation applied");
    expect(out.notes).toContain("Metadata removed when the file was opened");
  }, 15_000);

  it("oversize.tiff: 81.9 MP is refused at the ceiling → too-many-pixels (the route-away trigger)", async () => {
    const bytes = read("oversize.tiff");
    expect(sniffImageMime(bytes)).toBe("image/tiff");
    // ~256 KB on disk (deflate) but 9100×9000 declared — libvips refuses at the
    // header, at the DEFAULT cap, before allocation. The route maps this to the
    // CapabilityBanner's route-away line (covered in the e2e).
    expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
    const out = await intakeImage(bytes, "image/tiff");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("too-many-pixels");
  }, 15_000);

  it("screenshot.png: a crisp UI capture opens to an opaque JPEG master", async () => {
    const bytes = read("screenshot.png");
    expect(sniffImageMime(bytes)).toBe("image/png");
    const out = await intakeImage(bytes, "image/png");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.master.width).toBe(1200);
    expect(out.master.height).toBe(800);
    // Opaque source → JPEG master (the v1.4 codec choice).
    expect(out.master.mime).toBe("image/jpeg");
  }, 15_000);

  it("ai-art.png: the AI-art stand-in opens with sane dimensions", async () => {
    const bytes = read("ai-art.png");
    const out = await intakeImage(bytes, "image/png");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.master.width).toBe(1024);
    expect(out.master.height).toBe(1024);
    expect(out.master.mime).toBe("image/jpeg");
    expect(Math.max(out.proxy.width, out.proxy.height)).toBeLessThanOrEqual(2048);
  }, 15_000);

  it("scanned-doc.jpg: a scanned-document page opens through the jail", async () => {
    const bytes = read("scanned-doc.jpg");
    expect(sniffImageMime(bytes)).toBe("image/jpeg");
    const out = await intakeImage(bytes, "image/jpeg");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.master.width).toBe(1240);
    expect(out.master.height).toBe(1754);
    expect(out.colorSpace).toBe("rgb");
  }, 15_000);
});
