import { describe, expect, it } from "vitest";
import { assetIdFor, decodeBase64, imageDimensions, isRenderableImage, sniffImageMime } from "./image-meta";

/**
 * Unit coverage for the P3 image byte helpers (image-meta.ts). Hand-built
 * magic-number arrays — just enough header for each sniff/dimension path,
 * padded where a reader indexes past the signature.
 */

/** Build a Uint8Array from byte values, zero-padded to `len`. */
const bytes = (vals: number[], len = vals.length): Uint8Array => {
  const b = new Uint8Array(Math.max(len, vals.length));
  b.set(vals);
  return b;
};

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("decodeBase64", () => {
  it("round-trips ASCII bytes", () => {
    // "PNG" → 50 4e 47
    expect(Array.from(decodeBase64("UE5H"))).toEqual([0x50, 0x4e, 0x47]);
  });

  it("decodes the PNG signature", () => {
    const b = decodeBase64("iVBORw0KGgo=");
    expect(Array.from(b)).toEqual(PNG_SIG);
  });
});

describe("sniffImageMime", () => {
  it("recognizes PNG", () => {
    expect(sniffImageMime(bytes(PNG_SIG))).toBe("image/png");
  });

  it("recognizes JPEG", () => {
    expect(sniffImageMime(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });

  it("recognizes GIF", () => {
    expect(sniffImageMime(bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
  });

  it("recognizes BMP", () => {
    expect(sniffImageMime(bytes([0x42, 0x4d, 0x00, 0x00]))).toBe("image/bmp");
  });

  it("recognizes WEBP (RIFF…WEBP)", () => {
    // "RIFF" + 4 size bytes + "WEBP"
    expect(sniffImageMime(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });

  it("recognizes TIFF, both byte orders", () => {
    expect(sniffImageMime(bytes([0x49, 0x49, 0x2a, 0x00]))).toBe("image/tiff");
    expect(sniffImageMime(bytes([0x4d, 0x4d, 0x00, 0x2a]))).toBe("image/tiff");
  });

  it("recognizes EMF by the ' EMF' signature at byte 40 (not the ambiguous prefix)", () => {
    const emf = bytes([0x01, 0x00, 0x00, 0x00], 44);
    emf.set([0x20, 0x45, 0x4d, 0x46], 40);
    expect(sniffImageMime(emf)).toBe("image/emf");
  });

  it("recognizes WMF (placeable magic and bare header)", () => {
    expect(sniffImageMime(bytes([0xd7, 0xcd, 0xc6, 0x9a]))).toBe("image/wmf");
    expect(sniffImageMime(bytes([0x01, 0x00, 0x09, 0x00]))).toBe("image/wmf");
  });

  // ISO-BMFF `ftyp` (v1.4): [size u32][ 'ftyp' ][major brand][minor u32][compat…].
  const ftyp = (major: string, compat: string[] = []): Uint8Array => {
    const brands = [major, "0000", ...compat]; // minor-version slot is filler
    const size = 8 + brands.length * 4;
    const b = new Uint8Array(size);
    b.set([(size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff], 0);
    b.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
    brands.forEach((brand, k) => {
      for (let j = 0; j < 4; j++) b[8 + k * 4 + j] = brand.charCodeAt(j);
    });
    return b;
  };

  it("recognizes HEIC by the major brand", () => {
    for (const brand of ["heic", "heix", "hevc", "heif", "mif1", "msf1"])
      expect(sniffImageMime(ftyp(brand)), brand).toBe("image/heic");
  });

  it("recognizes HEIC by a compatible brand (iPhone stills carry mif1 in the list)", () => {
    expect(sniffImageMime(ftyp("mp42", ["mif1", "heic"]))).toBe("image/heic");
  });

  it("does not mistake a non-HEIC ISO-BMFF (avif/mp4) for HEIC", () => {
    expect(sniffImageMime(ftyp("avif", ["avis"]))).toBeUndefined();
    expect(sniffImageMime(ftyp("isom", ["mp41"]))).toBeUndefined();
  });

  it("recognizes SVG after a leading whitespace/BOM prefix", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(sniffImageMime(enc("<svg xmlns='...'></svg>"))).toBe("image/svg+xml");
    expect(sniffImageMime(enc("<?xml version='1.0'?><svg/>"))).toBe("image/svg+xml");
    expect(sniffImageMime(enc("  \n\t <svg/>"))).toBe("image/svg+xml");
    // UTF-8 BOM then <?xml
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc("<?xml ?>")]);
    expect(sniffImageMime(bom)).toBe("image/svg+xml");
  });

  it("does not treat arbitrary leading '<' text as SVG", () => {
    expect(sniffImageMime(new TextEncoder().encode("<html><body>no</body>"))).toBeUndefined();
  });

  it("returns undefined for unknown bytes", () => {
    expect(sniffImageMime(bytes([0x00, 0x01, 0x02, 0x03]))).toBeUndefined();
  });
});

describe("imageDimensions", () => {
  it("reads the PNG IHDR width/height (bytes 16..24, big-endian)", () => {
    const png = bytes(PNG_SIG, 24);
    png.set([0, 0, 0, 8], 16); // width 8
    png.set([0, 0, 0, 8], 20); // height 8
    expect(imageDimensions(png, "image/png")).toEqual({ width: 8, height: 8 });
  });

  it("scans JPEG to the first SOF marker", () => {
    // SOI, SOF0(len 17), precision, height=16, width=32
    const jpg = bytes([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20]);
    expect(imageDimensions(jpg, "image/jpeg")).toEqual({ width: 32, height: 16 });
  });

  it("skips an APP0 segment before reaching the JPEG SOF", () => {
    const jpg = bytes([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x04, 0xaa, 0xbb, // APP0 len 4 (2 payload bytes)
      0xff, 0xc2, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x60, // SOF2 h=64 w=96
    ]);
    expect(imageDimensions(jpg, "image/jpeg")).toEqual({ width: 96, height: 64 });
  });

  it("reads the GIF logical screen descriptor (little-endian)", () => {
    const gif = bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x04, 0x00, 0x06, 0x00]);
    expect(imageDimensions(gif, "image/gif")).toEqual({ width: 4, height: 6 });
  });

  it("returns undefined for formats it can't measure", () => {
    expect(imageDimensions(bytes([0x42, 0x4d]), "image/bmp")).toBeUndefined();
    expect(imageDimensions(bytes(PNG_SIG), "image/png")).toBeUndefined(); // too short for IHDR
  });
});

describe("isRenderableImage", () => {
  it("passes browser-renderable rasters, fails metafiles and tiff", () => {
    for (const m of ["image/png", "image/jpeg", "image/gif", "image/bmp", "image/webp"])
      expect(isRenderableImage(m)).toBe(true);
    for (const m of ["image/wmf", "image/emf", "image/tiff", "application/octet-stream"])
      expect(isRenderableImage(m)).toBe(false);
  });
});

describe("assetIdFor", () => {
  it("is deterministic and shaped imp-a-<hex8>-<len>", () => {
    const id = assetIdFor("iVBORw0KGgo=");
    expect(id).toMatch(/^imp-a-[0-9a-f]{8}-12$/);
    expect(assetIdFor("iVBORw0KGgo=")).toBe(id);
  });

  it("dedupes identical payloads and separates different ones", () => {
    expect(assetIdFor("AAAA")).toBe(assetIdFor("AAAA"));
    expect(assetIdFor("AAAA")).not.toBe(assetIdFor("BBBB"));
  });
});
