import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { scanJpeg, wrapImagePdf } from "./pdf-wrap";

/**
 * pdf-wrap unit tests (plan §4 PE5 done-when, §5): the discipline is to PARSE
 * THE EMITTED BYTES BACK — the box numbers out of the page dict, the output
 * intent + ICC out of the object stream, and every xref offset seeked and
 * checked — never to trust that "we wrote it, so it must be there". `sharp`
 * ships with `npm install`, so the JPEGs are synthesized live in-test (a small
 * valid image is more honest than a committed binary — the render-host.test.ts
 * posture); the CMYK one exercises the Adobe-inversion path (mozjpeg writes the
 * APP14 marker).
 */

const GRACOL_PATH = join(process.cwd(), "src", "lib", "photo", "profiles", "GRACoL2013_CRPC6.icc");

async function rgbJpeg(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#3366aa" } })
    .jpeg()
    .toBuffer();
}

async function cmykJpeg(w: number, h: number): Promise<Buffer> {
  // .toColourspace('cmyk') → a 4-component JPEG; mozjpeg tags it with an Adobe
  // APP14 marker, the inverted-CMYK signal the writer keys /Decode off.
  return sharp({ create: { width: w, height: h, channels: 3, background: "#884422" } })
    .toColourspace("cmyk")
    .jpeg()
    .toBuffer();
}

// ── byte-parsers over the emitted PDF (no PDF library — that is the point) ────

/** The four box numbers for a named box in the page dict, e.g. boxOf(pdf,"MediaBox"). */
function boxOf(pdf: Buffer, name: string): number[] {
  const m = new RegExp(`/${name} \\[([-\\d. ]+)\\]`).exec(pdf.toString("latin1"));
  if (!m) throw new Error(`no /${name} in page`);
  return m[1].trim().split(/\s+/).map(Number);
}

interface XrefEntry {
  offset: number;
  gen: number;
  type: string;
}

/** Follow startxref → the classic xref table; return the parsed entries. */
function readXref(pdf: Buffer): { size: number; entries: XrefEntry[] } {
  const full = pdf.toString("latin1");
  const sx = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(full);
  if (!sx) throw new Error("no startxref/%%EOF trailer");
  const xrefStart = Number(sx[1]);
  const head = /^xref\n0 (\d+)\n/.exec(pdf.toString("latin1", xrefStart, xrefStart + 64));
  if (!head) throw new Error("xref does not start with `xref\\n0 N\\n`");
  const size = Number(head[1]);
  const entriesStart = xrefStart + head[0].length;
  const entries: XrefEntry[] = [];
  for (let i = 0; i < size; i++) {
    const at = entriesStart + i * 20; // every entry is exactly 20 bytes
    const raw = pdf.toString("latin1", at, at + 20);
    entries.push({ offset: Number(raw.slice(0, 10)), gen: Number(raw.slice(11, 16)), type: raw[17] });
  }
  return { size, entries };
}

/** The dict text of object `num` (up to `endobj`), located via the xref offset. */
function objText(pdf: Buffer, num: number): string {
  const { entries } = readXref(pdf);
  const off = entries[num].offset;
  const s = pdf.toString("latin1", off, off + 8192);
  const end = s.indexOf("endobj");
  return end >= 0 ? s.slice(0, end) : s;
}

/** Raw stream bytes of object `num`, sliced by its own /Length (binary-safe). */
function streamOf(pdf: Buffer, num: number): Buffer {
  const { entries } = readXref(pdf);
  const off = entries[num].offset;
  const dict = pdf.toString("latin1", off, off + 4096);
  const kw = dict.indexOf("stream\n");
  if (kw < 0) throw new Error(`object ${num} has no stream`);
  const lenM = /\/Length (\d+)/.exec(dict.slice(0, kw));
  if (!lenM) throw new Error(`object ${num} stream has no /Length`);
  const dataStart = off + kw + "stream\n".length;
  return pdf.subarray(dataStart, dataStart + Number(lenM[1]));
}

// ── box math (plan §5 worked examples) ───────────────────────────────────────

describe("box math", () => {
  it("business card 3.5×2in + 0.125 bleed → MediaBox/BleedBox [0 0 270 162], TrimBox [9 9 261 153]", async () => {
    const pdf = wrapImagePdf({
      jpeg: await rgbJpeg(120, 70),
      width: 120,
      height: 70,
      colorSpace: "rgb",
      page: { kind: "print", trimW: 3.5, trimH: 2, bleed: 0.125 },
    });
    expect(boxOf(pdf, "MediaBox")).toEqual([0, 0, 270, 162]);
    expect(boxOf(pdf, "BleedBox")).toEqual([0, 0, 270, 162]);
    expect(boxOf(pdf, "TrimBox")).toEqual([9, 9, 261, 153]);
  });

  it("image page 800×600 @ 300dpi → all three boxes [0 0 192 144]", async () => {
    const pdf = wrapImagePdf({
      jpeg: await rgbJpeg(80, 60),
      width: 800,
      height: 600,
      colorSpace: "rgb",
      page: { kind: "image", dpi: 300 },
    });
    expect(boxOf(pdf, "MediaBox")).toEqual([0, 0, 192, 144]);
    expect(boxOf(pdf, "TrimBox")).toEqual([0, 0, 192, 144]);
    expect(boxOf(pdf, "BleedBox")).toEqual([0, 0, 192, 144]);
  });

  it("content stream scales the image to fill the MediaBox exactly (cm matrix)", async () => {
    const pdf = wrapImagePdf({
      jpeg: await rgbJpeg(120, 70),
      width: 120,
      height: 70,
      colorSpace: "rgb",
      page: { kind: "print", trimW: 3.5, trimH: 2, bleed: 0.125 },
    });
    expect(pdf.toString("latin1")).toContain("270 0 0 162 0 0 cm");
  });
});

// ── OutputIntent round-trip (plan §4 PE5: "the intent parses back out") ───────

describe("OutputIntent", () => {
  it("omitted → no /OutputIntents, exactly 5 objects", async () => {
    const pdf = wrapImagePdf({
      jpeg: await rgbJpeg(64, 64),
      width: 64,
      height: 64,
      colorSpace: "rgb",
      page: { kind: "image", dpi: 72 },
    });
    expect(pdf.toString("latin1")).not.toContain("/OutputIntents");
    expect(readXref(pdf).size).toBe(6); // free entry + objects 1..5
  });

  it("fake 1KB ICC → GTS_PDFX intent, /N 4, FlateDecode round-trips byte-equal", async () => {
    // A synthetic profile whose header at offset 16 is NOT a colour-space
    // signature, so /N falls back to the colour-space-derived count (cmyk → 4).
    const fakeIcc = Buffer.from(Array.from({ length: 1024 }, (_, i) => (i * 7 + 3) & 0xff));
    const pdf = wrapImagePdf({
      jpeg: await cmykJpeg(40, 30),
      width: 40,
      height: 30,
      colorSpace: "cmyk",
      page: { kind: "print", trimW: 2, trimH: 3.5, bleed: 0.125 },
      outputIntent: { iccBytes: fakeIcc, identifier: "Test-CMYK-Condition", info: "synthetic unit-test profile" },
    });

    // catalog → /OutputIntents [6 0 R]
    expect(objText(pdf, 1)).toContain("/OutputIntents [6 0 R]");
    // the intent dict
    const oi = objText(pdf, 6);
    expect(oi).toContain("/Type /OutputIntent");
    expect(oi).toContain("/S /GTS_PDFX");
    expect(oi).toContain("/OutputConditionIdentifier (Test-CMYK-Condition)");
    expect(oi).toContain("/Info (synthetic unit-test profile)");
    expect(oi).toContain("/DestOutputProfile 7 0 R");
    // the ICC stream: /N 4, Flate, and inflate === input
    const prof = objText(pdf, 7);
    expect(prof).toContain("/N 4");
    expect(prof).toContain("/Filter /FlateDecode");
    expect(inflateSync(streamOf(pdf, 7)).equals(fakeIcc)).toBe(true);
  });

  it.skipIf(!existsSync(GRACOL_PATH))(
    "real GRACoL2013_CRPC6.icc → /N 4, inflate byte-equal to the committed profile, identifier round-trips",
    async () => {
      const icc = readFileSync(GRACOL_PATH);
      const identifier = "GRACoL2013_CRPC6";
      const pdf = wrapImagePdf({
        jpeg: await cmykJpeg(48, 36),
        width: 48,
        height: 36,
        colorSpace: "cmyk",
        page: { kind: "print", trimW: 6, trimH: 4, bleed: 0.125 },
        outputIntent: { iccBytes: icc, identifier },
      });
      const prof = objText(pdf, 7);
      expect(prof).toContain("/N 4"); // GRACoL header data-colour-space === "CMYK"
      expect(prof).toContain("/Filter /FlateDecode");
      // the whole 3.4 MB profile survives Flate → inflate byte-for-byte
      expect(inflateSync(streamOf(pdf, 7)).equals(icc)).toBe(true);
      const idM = /\/OutputConditionIdentifier \(([^)]*)\)/.exec(objText(pdf, 6));
      expect(idM?.[1]).toBe(identifier);
    },
    20_000,
  );

  it("escapes parens and backslashes in the identifier string", async () => {
    const pdf = wrapImagePdf({
      jpeg: await rgbJpeg(16, 16),
      width: 16,
      height: 16,
      colorSpace: "rgb",
      page: { kind: "image", dpi: 72 },
      outputIntent: { iccBytes: Buffer.alloc(64, 0xab), identifier: "Cond (v1) \\ok" },
    });
    // ( ) and \ are backslash-escaped inside the literal string
    expect(objText(pdf, 6)).toContain("/OutputConditionIdentifier (Cond \\(v1\\) \\\\ok)");
  });
});

// ── xref integrity (plan §4 PE5: "byte-exact offsets") ───────────────────────

describe("xref integrity", () => {
  async function bothPdfs(): Promise<Buffer[]> {
    const noOi = wrapImagePdf({
      jpeg: await rgbJpeg(64, 48),
      width: 64,
      height: 48,
      colorSpace: "rgb",
      page: { kind: "image", dpi: 150 },
    });
    const withOi = wrapImagePdf({
      jpeg: await cmykJpeg(40, 30),
      width: 40,
      height: 30,
      colorSpace: "cmyk",
      page: { kind: "print", trimW: 3.5, trimH: 2, bleed: 0.125 },
      outputIntent: { iccBytes: Buffer.alloc(2048, 0x5a), identifier: "id" },
    });
    return [noOi, withOi];
  }

  it("every xref offset seeks to the start of the right `N 0 obj` (structural, not textual)", async () => {
    for (const pdf of await bothPdfs()) {
      const { size, entries } = readXref(pdf);
      // entry 0 is the free-list head
      expect(entries[0]).toEqual({ offset: 0, gen: 65535, type: "f" });
      for (let n = 1; n < size; n++) {
        expect(entries[n].type).toBe("n");
        const at = pdf.toString("latin1", entries[n].offset, entries[n].offset + 16);
        expect(at.startsWith(`${n} 0 obj\n`)).toBe(true);
      }
      // trailer /Size matches the table size
      expect(pdf.toString("latin1")).toContain(`/Size ${size}`);
    }
  });

  it("xref entries are exactly 20 bytes and startxref points at the `xref` keyword", async () => {
    const [pdf] = await bothPdfs();
    const full = pdf.toString("latin1");
    const xrefStart = Number(/startxref\s+(\d+)\s+%%EOF/.exec(full)![1]);
    expect(pdf.toString("latin1", xrefStart, xrefStart + 5)).toBe("xref\n");
    // header `0 N\n` then N×20-byte entries land exactly on `trailer`
    const head = /^xref\n0 (\d+)\n/.exec(pdf.toString("latin1", xrefStart, xrefStart + 64))!;
    const trailerAt = xrefStart + head[0].length + Number(head[1]) * 20;
    expect(pdf.toString("latin1", trailerAt, trailerAt + 7)).toBe("trailer");
  });
});

// ── Adobe CMYK inversion (plan §3.2, §4 PE5) ─────────────────────────────────

describe("Adobe CMYK /Decode inversion", () => {
  it("CMYK JPEG (Adobe APP14, 4 components) → DeviceCMYK + inverting /Decode", async () => {
    const jpeg = await cmykJpeg(40, 30);
    const scan = scanJpeg(jpeg);
    expect(scan.components).toBe(4);
    expect(scan.adobeApp14).toBe(true);

    const pdf = wrapImagePdf({
      jpeg,
      width: 40,
      height: 30,
      colorSpace: "cmyk",
      page: { kind: "image", dpi: 72 },
    });
    const s = pdf.toString("latin1");
    expect(s).toContain("/ColorSpace /DeviceCMYK");
    expect(s).toContain("/Decode [1 0 1 0 1 0 1 0]");
  });

  it("RGB JPEG (no Adobe marker, 3 components) → DeviceRGB, no /Decode", async () => {
    const jpeg = await rgbJpeg(40, 30);
    const scan = scanJpeg(jpeg);
    expect(scan.components).toBe(3);
    expect(scan.adobeApp14).toBe(false);

    const pdf = wrapImagePdf({
      jpeg,
      width: 40,
      height: 30,
      colorSpace: "rgb",
      page: { kind: "image", dpi: 72 },
    });
    const s = pdf.toString("latin1");
    expect(s).toContain("/ColorSpace /DeviceRGB");
    expect(s).not.toContain("/Decode");
  });
});

// ── scanJpeg (bounds-checked, cab.ts discipline) ─────────────────────────────

describe("scanJpeg", () => {
  it("reads SOF dimensions and component count", async () => {
    expect(scanJpeg(await rgbJpeg(123, 45))).toMatchObject({ width: 123, height: 45, components: 3 });
    expect(scanJpeg(await cmykJpeg(64, 32))).toMatchObject({ width: 64, height: 32, components: 4 });
  });

  it("throws on a non-JPEG (missing SOI)", () => {
    expect(() => scanJpeg(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toThrow(/not a JPEG/);
  });

  it("never overruns on a truncated stream (best-effort, no throw)", () => {
    // SOI, then an APP0 marker with a length byte cut off mid-field.
    const trunc = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(() => scanJpeg(trunc)).not.toThrow();
    expect(scanJpeg(trunc)).toEqual({ width: 0, height: 0, components: 0, adobeApp14: false });
  });
});

// ── determinism (plan §4 PE5, §5) ────────────────────────────────────────────

describe("determinism", () => {
  it("two calls with equal inputs are byte-identical", async () => {
    const jpeg = await cmykJpeg(50, 40);
    const opts = {
      jpeg,
      width: 50,
      height: 40,
      colorSpace: "cmyk" as const,
      page: { kind: "print" as const, trimW: 3.5, trimH: 2, bleed: 0.125 },
      outputIntent: { iccBytes: Buffer.alloc(1500, 0x33), identifier: "det" },
    };
    expect(wrapImagePdf(opts).equals(wrapImagePdf(opts))).toBe(true);
  });
});

// ── external-viewer proxy (plan §4 PE5: "preflights clean in an external
// viewer"). Poppler is the closest thing available in CI; skip when absent. ──

function poppler(): boolean {
  try {
    execFileSync("pdfinfo", ["-v"], { stdio: "ignore" });
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const HAVE_POPPLER = poppler();

describe.skipIf(!HAVE_POPPLER)("external viewer (poppler)", () => {
  it("pdfinfo reads the page size and pdftoppm rasterizes without error", async () => {
    const pdf = wrapImagePdf({
      jpeg: await rgbJpeg(300, 180),
      width: 300,
      height: 180,
      colorSpace: "rgb",
      page: { kind: "print", trimW: 3.5, trimH: 2, bleed: 0.125 },
      outputIntent: { iccBytes: readFileSync(GRACOL_PATH), identifier: "GRACoL2013_CRPC6" },
    });
    const dir = mkdtempSync(join(tmpdir(), "pdfwrap-"));
    try {
      const file = join(dir, "card.pdf");
      writeFileSync(file, pdf);
      const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
      const size = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
      expect(size).not.toBeNull();
      expect(Math.round(Number(size![1]))).toBe(270);
      expect(Math.round(Number(size![2]))).toBe(162);
      // rasterize page 1 → a PPM; a non-zero exit throws and fails the test
      execFileSync("pdftoppm", ["-r", "72", "-f", "1", "-l", "1", file, join(dir, "out")], {
        stdio: "ignore",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
