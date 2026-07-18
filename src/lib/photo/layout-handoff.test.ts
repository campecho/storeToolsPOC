import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  openInLayoutEditor,
  readPngSize,
  layoutAssetName,
} from "./layout-handoff";
import { renderPhoto } from "@/lib/photo/client";
import { putAssetBlob } from "@/lib/assets/blob-store";
import { usePhotoStore } from "@/lib/store/photo-store";
import { useLayoutStore } from "@/lib/store/layout-store";
import type { PhotoDocument } from "@/lib/schema/photo";

// The orchestration seam only — the render/blob/store/router deps are stubbed so
// the test exercises the wiring (asset shape, placement, navigation, guards)
// without a browser. The pure helpers (readPngSize, layoutAssetName) run for real.
vi.mock("@/lib/photo/client", () => ({
  renderPhoto: vi.fn(),
  isRenderError: (e: unknown) =>
    !!e && typeof e === "object" && (e as { ok?: unknown }).ok === false && "code" in (e as object),
}));
vi.mock("@/lib/assets/blob-store", () => ({ putAssetBlob: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/store/photo-store", () => ({ usePhotoStore: { getState: vi.fn() } }));
vi.mock("@/lib/store/layout-store", () => ({ useLayoutStore: { getState: vi.fn() } }));

/** An 8-byte PNG signature + IHDR carrying `w`×`h` (big-endian u32 at 16/20). */
function pngBytes(w: number, h: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const dv = new DataView(b.buffer);
  dv.setUint32(8, 13); // IHDR length
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}

function fakeBlob(bytes: Uint8Array): Blob {
  return {
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Blob;
}

const DOC: PhotoDocument = {
  version: 1,
  name: "IMG_4823.jpg",
  source: {
    assetId: "photo:abc:master",
    proxyAssetId: "photo:abc:proxy",
    masterMime: "image/jpeg",
    width: 4032,
    height: 3024,
    proxyWidth: 2048,
    proxyHeight: 1536,
    originalName: "IMG_4823.jpg",
    colorSpace: "rgb",
    intakeNotes: [],
  },
  target: { size: null, product: null, bleed: 0, intent: "srgb" },
  recipe: [],
  cursor: 0,
} as unknown as PhotoDocument;

describe("readPngSize", () => {
  it("reads width/height from a PNG IHDR", () => {
    expect(readPngSize(pngBytes(800, 600))).toEqual({ width: 800, height: 600 });
  });
  it("returns null for non-PNG bytes", () => {
    expect(readPngSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBeNull();
  });
  it("returns null for a truncated buffer", () => {
    expect(readPngSize(new Uint8Array(10))).toBeNull();
  });
});

describe("layoutAssetName", () => {
  it("re-stems the filename to .png", () => {
    expect(layoutAssetName("IMG_4823.jpg")).toBe("IMG_4823.png");
    expect(layoutAssetName("scan.tiff")).toBe("scan.png");
  });
  it("appends .png when there is no extension", () => {
    expect(layoutAssetName("holiday")).toBe("holiday.png");
  });
  it("falls back for an empty name", () => {
    expect(layoutAssetName("   ")).toBe("photo.png");
  });
});

describe("openInLayoutEditor", () => {
  let addAsset: Mock;
  let placeAsset: Mock;
  let setRendering: Mock;
  let push: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    addAsset = vi.fn();
    placeAsset = vi.fn();
    setRendering = vi.fn();
    push = vi.fn();
    (useLayoutStore.getState as Mock).mockReturnValue({ addAsset, placeAsset });
    (usePhotoStore.getState as Mock).mockReturnValue({ setRendering });
    (putAssetBlob as Mock).mockResolvedValue(undefined);
  });

  it("renders, registers an image asset, places it, and navigates", async () => {
    const blob = fakeBlob(pngBytes(1200, 900));
    (renderPhoto as Mock).mockResolvedValue({ blob, suggestedName: "IMG_4823-edited.png" });

    const res = await openInLayoutEditor(DOC, { push });

    expect(res).toEqual({ ok: true });
    expect(renderPhoto).toHaveBeenCalledWith(DOC, { format: "png" });

    // blob stored under the same id the asset is registered with
    const storedId = (putAssetBlob as Mock).mock.calls[0][0] as string;
    expect(storedId).toMatch(/^photo:.*:layout$/);
    expect((putAssetBlob as Mock).mock.calls[0][1]).toBe(blob);

    expect(addAsset).toHaveBeenCalledWith({
      id: storedId,
      name: "IMG_4823.png",
      kind: "image",
      mime: "image/png",
      width: 1200,
      height: 900,
      bytes: blob.size,
    });
    expect(placeAsset).toHaveBeenCalledWith(storedId);
    expect(push).toHaveBeenCalledWith("/layout");

    // render guard raised then always cleared
    expect(setRendering).toHaveBeenNthCalledWith(1, true);
    expect(setRendering).toHaveBeenLastCalledWith(false);
  });

  it("still registers the asset (undefined dims) when the render is not a PNG", async () => {
    const blob = fakeBlob(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])); // JPEG-ish
    (renderPhoto as Mock).mockResolvedValue({ blob, suggestedName: "x.png" });

    const res = await openInLayoutEditor(DOC, { push });

    expect(res).toEqual({ ok: true });
    expect(addAsset).toHaveBeenCalledWith(
      expect.objectContaining({ width: undefined, height: undefined, kind: "image" }),
    );
    expect(placeAsset).toHaveBeenCalled();
  });

  it("returns the RenderError message and does not navigate on failure", async () => {
    (renderPhoto as Mock).mockRejectedValue({
      ok: false,
      code: "engine-error",
      message: "The render service is unreachable — check your connection and try again.",
    });

    const res = await openInLayoutEditor(DOC, { push });

    expect(res).toEqual({
      ok: false,
      message: "The render service is unreachable — check your connection and try again.",
    });
    expect(putAssetBlob).not.toHaveBeenCalled();
    expect(addAsset).not.toHaveBeenCalled();
    expect(placeAsset).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    // guard cleared even on the error path
    expect(setRendering).toHaveBeenLastCalledWith(false);
  });

  it("gives a generic message for a non-typed throw", async () => {
    (renderPhoto as Mock).mockRejectedValue(new Error("boom"));

    const res = await openInLayoutEditor(DOC, { push });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toBe("Couldn't prepare the picture for the Layout Editor — try again.");
    }
  });
});
