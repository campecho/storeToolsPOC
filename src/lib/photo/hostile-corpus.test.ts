import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sniffImageMime } from "@/lib/import/image-meta";
import { POST } from "@/app/api/photo/intake/route";
import { intakeImage } from "./render-host";

/**
 * The committed hostile corpus, driven against the REAL caps (photo plan §4
 * PE10c, §5 "hostile set"). Every file under fixtures/photo-corpus/hostile/ is a
 * tiny deterministic artifact written by scripts/make-hostile-fixtures.mjs; this
 * suite reads those bytes and asserts each is refused at the layer that owns its
 * defense — the pre-jail byte-sniff / capability gate, or the jailed decode's
 * pixel cap and libvips/libxml2 hardening. It turns the "librsvg's defaults
 * already refuse external <image href> and XXE entities" claim in
 * photo-worker.mjs:75-76 from a comment into asserted behavior.
 *
 * The core decode path is always live (sharp ships with npm), so the SVG and
 * PNG cases spawn the real jail. HEIC needs heif-convert, so the truncated-HEIC
 * assertion accepts either the capability reject (no binary) or the transcode
 * failure (binary present).
 */

const HOSTILE = join(process.cwd(), "fixtures", "photo-corpus", "hostile");
const read = (name: string): Buffer => readFileSync(join(HOSTILE, name));

function post(bytes: Buffer, filename: string): Promise<Response> {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(bytes)], filename));
  return POST(new Request("http://test/api/photo/intake", { method: "POST", body: fd }));
}

describe("hostile corpus — pre-jail gates (sniff / capability)", () => {
  it("polyglot-zip.jpg: a ZIP disguised as .jpg fails the byte-sniff, never the extension", async () => {
    const bytes = read("polyglot-zip.jpg");
    // The sniff owns the gate: the .jpg name is ignored, the PK magic wins.
    expect(sniffImageMime(bytes)).toBeUndefined();
    const res = await post(bytes, "photo.jpg");
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ ok: false, code: "not-an-image" });
  });

  it("truncated.heic: a valid heic brand with no payload is refused (capability or transcode)", async () => {
    const bytes = read("truncated.heic");
    // A real HEIC-branded artifact — it sniffs heic and routes to the HEIC path.
    expect(sniffImageMime(bytes)).toBe("image/heic");
    const res = await post(bytes, "clip.heic");
    const body = await res.json();
    expect(body.ok).toBe(false);
    // No heif-convert → unsupported-here; heif-convert present → the transcode
    // dies on the empty payload → decode-failed (timeout is the kill backstop).
    expect(["unsupported-here", "decode-failed", "timeout"]).toContain(body.code);
  }, 15_000);
});

describe("hostile corpus — jailed decode caps (intakeImage)", () => {
  it("truncated.jpg: a valid SOI then nothing dies in the jail as decode-failed", async () => {
    const bytes = read("truncated.jpg");
    expect(sniffImageMime(bytes)).toBe("image/jpeg");
    const out = await intakeImage(bytes, "image/jpeg");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("decode-failed");
  }, 15_000);

  it("pixel-bomb.png: 68 bytes declaring 2.5 Gpx is refused at the DEFAULT cap before allocation", async () => {
    const bytes = read("pixel-bomb.png");
    // A genuine artifact — no env-shrunk ceiling. libvips reads the IHDR dims
    // and refuses at the 80 MP default, before decompressing a single scanline.
    expect(sniffImageMime(bytes)).toBe("image/png");
    expect(bytes.length).toBeLessThan(1024);
    const out = await intakeImage(bytes, "image/png");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("too-many-pixels");
  }, 15_000);

  it("svg-script.svg: a <script> element rasterizes as inert vector art (no JS engine)", async () => {
    const bytes = read("svg-script.svg");
    expect(sniffImageMime(bytes)).toBe("image/svg+xml");
    const out = await intakeImage(bytes, "image/svg+xml");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // The script is inert decoration: intake succeeds at the SVG's own bounded
    // size and reports the rasterization honestly.
    expect(out.master.width).toBeGreaterThan(0);
    expect(out.master.height).toBeGreaterThan(0);
    expect(Math.max(out.master.width, out.master.height)).toBeLessThanOrEqual(4096);
    expect(out.notes).toContain("Vector artwork rasterized to a bitmap when it was opened");
  }, 15_000);

  it("svg-external-ref.svg: file:// and http:// image refs are not resolved (no SSRF, no local read)", async () => {
    const bytes = read("svg-external-ref.svg");
    const out = await intakeImage(bytes, "image/svg+xml");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // The raster stays the SVG's own declared size — the external resources did
    // not contribute dimensions or bytes. /etc/passwd embedded (or a fetched
    // image composited) would balloon the master far past a blank 120×90 PNG.
    expect(Math.max(out.master.width, out.master.height)).toBeLessThanOrEqual(4096);
    expect(out.master.bytes.length).toBeLessThan(20_000);
  }, 15_000);

  it("svg-xxe-entity.svg: an external-entity XXE is refused by libxml2 → decode-failed", async () => {
    const bytes = read("svg-xxe-entity.svg");
    const out = await intakeImage(bytes, "image/svg+xml");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("decode-failed");
  }, 15_000);

  it("svg-billion-laughs.svg: nested entity amplification trips libxml2's cap → decode-failed, no hang", async () => {
    const bytes = read("svg-billion-laughs.svg");
    const t0 = performance.now();
    const out = await intakeImage(bytes, "image/svg+xml");
    // The amplification cap fires at parse — a bounded finding, never an OOM/hang
    // (the case timeout is the backstop; this asserts it returned promptly).
    expect(performance.now() - t0).toBeLessThan(10_000);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("decode-failed");
  }, 15_000);
});
