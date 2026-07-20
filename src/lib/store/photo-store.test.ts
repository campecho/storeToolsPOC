import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  usePhotoStore,
  mergePhotoState,
  type PhotoTool,
} from "./photo-store";
import {
  PhotoDocumentSchema,
  type AdjustParam,
  type PhotoDocument,
  type PhotoOp,
  type PhotoSource,
  type PixelRect,
} from "@/lib/schema/photo";

/* ------------------------------------------------------------------ */
/* Fixtures — built through the real schema so they stay contract-true */
/* ------------------------------------------------------------------ */

function makeSource(): PhotoSource {
  return {
    assetId: "photo:master-1",
    proxyAssetId: "photo:proxy-1",
    masterMime: "image/jpeg",
    width: 4000,
    height: 3000,
    proxyWidth: 1600,
    proxyHeight: 1200,
    originalName: "vacation.jpg",
    colorSpace: "rgb",
    intakeNotes: ["Metadata removed when opened."],
  };
}

/** A minimal, schema-valid document. `cursor` defaults to the recipe end. */
function makeDoc(recipe: PhotoOp[] = [], cursor: number = recipe.length): PhotoDocument {
  return {
    version: 1,
    name: "vacation.jpg",
    source: makeSource(),
    target: { size: null, product: null, bleed: 0, intent: "srgb" },
    recipe,
    cursor,
  };
}

/** A labelled adjust op — the label makes recipe order easy to assert. */
function op(label: string): PhotoOp {
  return { op: "adjust", label, param: "brightness", value: 1 };
}

/** A param-specific adjust op — for the param-aware coalesce tests. */
function adjustOp(param: AdjustParam, value: number): PhotoOp {
  return { op: "adjust", label: `${param} ${value}`, param, value };
}

function cropOp(): PhotoOp {
  return {
    op: "crop",
    label: "Crop to 4 × 6",
    rect: { x: 0, y: 0, w: 100, h: 100 },
    ratio: "4×6",
    shape: "rect",
  };
}

function straightenOp(degrees: number): PhotoOp {
  return { op: "straighten", label: `Straighten ${degrees}`, degrees };
}

/** A schema-valid erase op — the PE9 preview-approve fixture. */
function eraseOp(id = "abc123"): PhotoOp {
  return {
    op: "erase",
    label: "Remove object",
    maskAssetId: `photo:${id}:mask`,
    patch: { id, assetId: `photo:${id}:patch`, rect: { x: 0, y: 0, w: 10, h: 10 } },
  };
}

function sampleDraft() {
  return {
    rect: { x: 10, y: 10, w: 200, h: 150 },
    ratioId: "4x6",
    shape: "rounded" as const,
  };
}

const s = () => usePhotoStore.getState();
const recipeLabels = () => s().doc?.recipe.map((o) => o.label) ?? [];

beforeEach(() => {
  usePhotoStore.setState(usePhotoStore.getInitialState(), true);
});

describe("photo store fixtures", () => {
  it("the local fixtures are valid against the real schema", () => {
    expect(PhotoDocumentSchema.safeParse(makeDoc()).success).toBe(true);
    expect(PhotoDocumentSchema.safeParse(makeDoc([cropOp(), op("a")])).success).toBe(true);
  });
});

describe("photo store defaults", () => {
  it("boots with no document, standard level, no tool, no return context", () => {
    expect(s().doc).toBeNull();
    expect(s().level).toBe("standard");
    expect(s().activeTool).toBe("none");
    expect(s().returnContext).toBeNull();
  });

  it("boots with no session gesture state", () => {
    expect(s().cropDraft).toBeNull();
    expect(s().previewOp).toBeNull();
    expect(s().comparing).toBe(false);
  });

  it("boots with no pending preview and the default clean-up brush size (PE9 §7)", () => {
    expect(s().pendingPreview).toBeNull();
    expect(s().cleanupBrushSize).toBe(40);
  });
});

describe("open / close", () => {
  it("openDocument validates, lands the document, and resets the active tool", () => {
    s().setActiveTool("crop");
    s().openDocument(makeDoc([op("a")]));
    expect(s().doc).not.toBeNull();
    expect(s().doc?.name).toBe("vacation.jpg");
    expect(s().doc?.recipe).toHaveLength(1);
    expect(s().activeTool).toBe("none");
  });

  it("openDocument refuses a structurally invalid document (no-op)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    s().openDocument(makeDoc([op("a")]));
    const good = s().doc;
    // missing source/target/recipe/cursor — fails the schema
    s().openDocument({ version: 1, name: "broken" } as unknown as PhotoDocument);
    expect(s().doc).toBe(good); // unchanged
    // a bad op inside an otherwise-valid shell is rejected too
    const bad = { ...makeDoc(), recipe: [{ op: "nope" }] } as unknown as PhotoDocument;
    s().openDocument(bad);
    expect(s().doc).toBe(good);
    warn.mockRestore();
  });

  it("closeDocument clears the document and the active tool", () => {
    s().openDocument(makeDoc([op("a")]));
    s().setActiveTool("adjust");
    s().closeDocument();
    expect(s().doc).toBeNull();
    expect(s().activeTool).toBe("none");
  });

  it("resetDemo returns the whole editor to its pristine defaults (PE10f)", () => {
    s().openDocument(makeDoc([op("a")]));
    s().setLevel("simple");
    s().setActiveTool("adjust");
    s().setCleanupBrushSize(90);
    s().setReturnContext({ originName: "flyer", objectId: "f1", originalAssetId: "photo:x" });

    s().resetDemo();

    expect(s().doc).toBeNull();
    expect(s().level).toBe("standard");
    expect(s().activeTool).toBe("none");
    expect(s().cleanupBrushSize).toBe(40);
    expect(s().returnContext).toBeNull();
    expect(s().pendingPreview).toBeNull();
    expect(s().cropDraft).toBeNull();
  });
});

describe("level & tool", () => {
  it("level toggles between simple and standard", () => {
    s().setLevel("simple");
    expect(s().level).toBe("simple");
    s().setLevel("standard");
    expect(s().level).toBe("standard");
  });

  it("activeTool accepts all six tools and none", () => {
    const tools: PhotoTool[] = [
      "crop",
      "adjust",
      "fixprint",
      "text",
      "cleanup",
      "export",
      "none",
    ];
    for (const tool of tools) {
      s().setActiveTool(tool);
      expect(s().activeTool).toBe(tool);
    }
  });

  it("setReturnContext sets and clears the PE8 hand-off", () => {
    s().setReturnContext({ originName: "Spring flyer", objectId: "obj-7", originalAssetId: "photo:test:orig" });
    expect(s().returnContext).toEqual({ originName: "Spring flyer", objectId: "obj-7", originalAssetId: "photo:test:orig" });
    s().setReturnContext(null);
    expect(s().returnContext).toBeNull();
  });
});

describe("recipe cursor — pushOp / undo / redo / setCursor", () => {
  it("pushOp appends and advances the cursor to the recipe end", () => {
    s().openDocument(makeDoc());
    s().pushOp(op("a"));
    expect(recipeLabels()).toEqual(["a"]);
    expect(s().doc?.cursor).toBe(1);
    s().pushOp(op("b"));
    expect(recipeLabels()).toEqual(["a", "b"]);
    expect(s().doc?.cursor).toBe(2);
  });

  it("pushOp mid-history truncates the redo tail before appending", () => {
    s().openDocument(makeDoc([op("a"), op("b"), op("c")])); // cursor 3
    s().undo();
    s().undo(); // cursor 1 — [a] applied, [b, c] is the redo tail
    expect(s().doc?.cursor).toBe(1);
    s().pushOp(op("d"));
    expect(recipeLabels()).toEqual(["a", "d"]); // b, c dropped
    expect(s().doc?.cursor).toBe(2);
  });

  it("undo/redo move the cursor and clamp at both bounds", () => {
    s().openDocument(makeDoc([op("a"), op("b")])); // cursor 2
    s().undo();
    expect(s().doc?.cursor).toBe(1);
    s().undo();
    expect(s().doc?.cursor).toBe(0);
    s().undo(); // already at the floor
    expect(s().doc?.cursor).toBe(0);
    s().redo();
    expect(s().doc?.cursor).toBe(1);
    s().redo();
    expect(s().doc?.cursor).toBe(2);
    s().redo(); // already at the ceiling
    expect(s().doc?.cursor).toBe(2);
  });

  it("setCursor clamps into [0, recipe.length]", () => {
    s().openDocument(makeDoc([op("a"), op("b")]));
    s().setCursor(99);
    expect(s().doc?.cursor).toBe(2);
    s().setCursor(-5);
    expect(s().doc?.cursor).toBe(0);
    s().setCursor(1);
    expect(s().doc?.cursor).toBe(1);
  });

  it("pushOp / undo / redo / setCursor are safe no-ops with no document", () => {
    expect(s().doc).toBeNull();
    expect(() => {
      s().pushOp(op("a"));
      s().undo();
      s().redo();
      s().setCursor(3);
    }).not.toThrow();
    expect(s().doc).toBeNull();
  });
});

describe("session gesture fields — setters", () => {
  it("setCropDraft / setPreviewOp / setComparing round-trip", () => {
    s().openDocument(makeDoc());
    s().setCropDraft(sampleDraft());
    expect(s().cropDraft).toEqual(sampleDraft());
    s().setPreviewOp(straightenOp(-1.2));
    expect(s().previewOp).toEqual(straightenOp(-1.2));
    s().setComparing(true);
    expect(s().comparing).toBe(true);

    s().setCropDraft(null);
    s().setPreviewOp(null);
    s().setComparing(false);
    expect(s().cropDraft).toBeNull();
    expect(s().previewOp).toBeNull();
    expect(s().comparing).toBe(false);
  });
});

describe("pushOp coalesce — the straighten-slider anti-spam rule", () => {
  it("replaces the trailing same-tag op in place, cursor unchanged", () => {
    s().openDocument(makeDoc());
    s().pushOp(straightenOp(1));
    expect(s().doc?.cursor).toBe(1);
    s().pushOp(straightenOp(2), { coalesce: true });
    s().pushOp(straightenOp(3.5), { coalesce: true });
    // one op, updated label + value, cursor never grew
    expect(s().doc?.recipe).toHaveLength(1);
    expect(s().doc?.cursor).toBe(1);
    const only = s().doc?.recipe[0];
    expect(only?.op).toBe("straighten");
    expect((only as { degrees: number }).degrees).toBe(3.5);
    expect(only?.label).toBe("Straighten 3.5");
  });

  it("appends when the trailing op has a different tag, even with coalesce", () => {
    s().openDocument(makeDoc([straightenOp(1)]));
    s().pushOp(cropOp(), { coalesce: true });
    expect(recipeLabels()).toEqual(["Straighten 1", "Crop to 4 × 6"]);
    expect(s().doc?.cursor).toBe(2);
  });

  it("appends when the recipe is empty (nothing to coalesce onto)", () => {
    s().openDocument(makeDoc());
    s().pushOp(straightenOp(2), { coalesce: true });
    expect(s().doc?.recipe).toHaveLength(1);
    expect(s().doc?.cursor).toBe(1);
  });

  it("coalesce drops any redo tail beyond the cursor, like every commit", () => {
    s().openDocument(makeDoc([straightenOp(1), op("b"), op("c")])); // cursor 3
    s().undo();
    s().undo(); // cursor 1 — [straighten] applied, [b, c] the redo tail
    expect(s().doc?.cursor).toBe(1);
    s().pushOp(straightenOp(9), { coalesce: true });
    expect(recipeLabels()).toEqual(["Straighten 9"]); // b, c dropped, replaced in place
    expect(s().doc?.cursor).toBe(1);
  });

  it("pushOp without coalesce still appends a same-tag op (no accidental merge)", () => {
    s().openDocument(makeDoc([straightenOp(1)]));
    s().pushOp(straightenOp(2)); // no opts
    expect(s().doc?.recipe).toHaveLength(2);
    expect(s().doc?.cursor).toBe(2);
  });
});

describe("pushOp coalesce — PARAM-AWARE for adjust", () => {
  it("brightness dragged twice collapses to one step (same param coalesces)", () => {
    s().openDocument(makeDoc());
    s().pushOp(adjustOp("brightness", 5));
    s().pushOp(adjustOp("brightness", 12), { coalesce: true });
    expect(s().doc?.recipe).toHaveLength(1);
    expect(s().doc?.cursor).toBe(1);
    const only = s().doc?.recipe[0];
    expect((only as { param: string }).param).toBe("brightness");
    expect((only as { value: number }).value).toBe(12);
  });

  it("brightness THEN contrast makes two steps (Brightness must not swallow Contrast)", () => {
    s().openDocument(makeDoc());
    s().pushOp(adjustOp("brightness", 5));
    s().pushOp(adjustOp("contrast", 20), { coalesce: true }); // different param
    expect(s().doc?.recipe).toHaveLength(2);
    expect(s().doc?.cursor).toBe(2);
    expect(recipeLabels()).toEqual(["brightness 5", "contrast 20"]);
  });

  it("a contrast drag after the brightness+contrast pair coalesces onto contrast only", () => {
    s().openDocument(makeDoc());
    s().pushOp(adjustOp("brightness", 5));
    s().pushOp(adjustOp("contrast", 20));
    s().pushOp(adjustOp("contrast", 35), { coalesce: true }); // same param as trailing
    expect(s().doc?.recipe).toHaveLength(2);
    const [b, c] = s().doc!.recipe;
    expect((b as { value: number }).value).toBe(5);
    expect((c as { value: number }).value).toBe(35);
  });

  it("straighten coalesce (non-adjust tag) still collapses on the tag alone", () => {
    s().openDocument(makeDoc());
    s().pushOp(straightenOp(1));
    s().pushOp(straightenOp(2.5), { coalesce: true });
    expect(s().doc?.recipe).toHaveLength(1);
    expect((s().doc?.recipe[0] as { degrees: number }).degrees).toBe(2.5);
  });
});

describe("session gesture fields — cleared on tool + history moves", () => {
  function seedGestures() {
    s().setCropDraft(sampleDraft());
    s().setPreviewOp(straightenOp(-1.2));
    s().setComparing(true);
  }

  it("setActiveTool clears cropDraft + previewOp and ends the compare peek", () => {
    s().openDocument(makeDoc([op("a")]));
    seedGestures();
    s().setActiveTool("adjust");
    expect(s().cropDraft).toBeNull();
    expect(s().previewOp).toBeNull();
    expect(s().comparing).toBe(false);
  });

  it("undo / redo clear cropDraft + previewOp (stale once history moves)", () => {
    s().openDocument(makeDoc([op("a"), op("b")])); // cursor 2
    seedGestures();
    s().undo();
    expect(s().cropDraft).toBeNull();
    expect(s().previewOp).toBeNull();
    seedGestures();
    s().redo();
    expect(s().cropDraft).toBeNull();
    expect(s().previewOp).toBeNull();
  });

  it("setCursor clears cropDraft + previewOp", () => {
    s().openDocument(makeDoc([op("a"), op("b")]));
    seedGestures();
    s().setCursor(0);
    expect(s().cropDraft).toBeNull();
    expect(s().previewOp).toBeNull();
  });

  it("pushOp clears cropDraft + previewOp (the gesture committed)", () => {
    s().openDocument(makeDoc());
    seedGestures();
    s().pushOp(cropOp());
    expect(s().cropDraft).toBeNull();
    expect(s().previewOp).toBeNull();
  });

  it("openDocument clears all three session fields", () => {
    s().openDocument(makeDoc());
    seedGestures();
    s().openDocument(makeDoc([op("a")]));
    expect(s().cropDraft).toBeNull();
    expect(s().previewOp).toBeNull();
    expect(s().comparing).toBe(false);
  });

  it("closeDocument clears all three session fields", () => {
    s().openDocument(makeDoc());
    seedGestures();
    s().closeDocument();
    expect(s().cropDraft).toBeNull();
    expect(s().previewOp).toBeNull();
    expect(s().comparing).toBe(false);
  });
});

describe("rendering flag — session-only (PE3 export)", () => {
  it("defaults false and setRendering toggles it", () => {
    expect(s().rendering).toBe(false);
    s().setRendering(true);
    expect(s().rendering).toBe(true);
    s().setRendering(false);
    expect(s().rendering).toBe(false);
  });

  it("closeDocument clears an in-flight rendering flag", () => {
    s().openDocument(makeDoc());
    s().setRendering(true);
    s().closeDocument();
    expect(s().rendering).toBe(false);
  });

  it("stays out of partialize (never persisted)", () => {
    const partialize = usePhotoStore.persist.getOptions().partialize!;
    usePhotoStore.setState({ doc: makeDoc([op("a")]), level: "simple", rendering: true });
    const persisted = partialize(usePhotoStore.getState()) as Record<string, unknown>;
    expect("rendering" in persisted).toBe(false);
    expect(Object.keys(persisted).sort()).toEqual(["doc", "level"]);
  });
});

describe("splitView — Adjust before/after slider (session-only, Section D)", () => {
  it("defaults false and setSplitView toggles it", () => {
    expect(s().splitView).toBe(false);
    s().setSplitView(true);
    expect(s().splitView).toBe(true);
    s().setSplitView(false);
    expect(s().splitView).toBe(false);
  });

  it("closeDocument clears an active split-view", () => {
    s().openDocument(makeDoc());
    s().setSplitView(true);
    s().closeDocument();
    expect(s().splitView).toBe(false);
  });

  it("stays out of partialize (never persisted)", () => {
    const partialize = usePhotoStore.persist.getOptions().partialize!;
    usePhotoStore.setState({ doc: makeDoc([op("a")]), level: "simple", splitView: true });
    const persisted = partialize(usePhotoStore.getState()) as Record<string, unknown>;
    expect("splitView" in persisted).toBe(false);
    expect(Object.keys(persisted).sort()).toEqual(["doc", "level"]);
  });
});

describe("persist merge guard", () => {
  const current = () => usePhotoStore.getInitialState();

  it("restores a valid persisted document and level, preserving the actions", () => {
    const merged = mergePhotoState({ doc: makeDoc([op("a")]), level: "simple" }, current());
    expect(merged.doc?.recipe).toHaveLength(1);
    expect(merged.level).toBe("simple");
    expect(typeof merged.pushOp).toBe("function"); // action functions carried forward
  });

  it("degrades a corrupt document to null, keeping a valid persisted level", () => {
    const merged = mergePhotoState({ doc: { garbage: true }, level: "simple" }, current());
    expect(merged.doc).toBeNull();
    expect(merged.level).toBe("simple");
  });

  it("falls back to the default level when the persisted level is bogus", () => {
    const merged = mergePhotoState({ doc: makeDoc([op("a")]), level: "pro" }, current());
    expect(merged.level).toBe("standard"); // current/default
    expect(merged.doc).not.toBeNull();
  });

  it("clamps an out-of-range persisted cursor (hand-edited storage)", () => {
    const merged = mergePhotoState({ doc: makeDoc([op("a"), op("b")], 99) }, current());
    expect(merged.doc?.cursor).toBe(2);
  });

  it("a missing / undefined payload yields the default document and level", () => {
    const merged = mergePhotoState(undefined, current());
    expect(merged.doc).toBeNull();
    expect(merged.level).toBe("standard");
  });
});

describe("partialize — only the document + level persist", () => {
  it("excludes activeTool, returnContext, and every session gesture field", () => {
    const partialize = usePhotoStore.persist.getOptions().partialize!;
    // A fully-populated live state, gesture fields included.
    usePhotoStore.setState({
      doc: makeDoc([op("a")]),
      level: "simple",
      activeTool: "crop",
      returnContext: { originName: "Flyer", objectId: "obj-1", originalAssetId: "photo:test:orig" },
      cropDraft: sampleDraft(),
      previewOp: straightenOp(-1.2),
      comparing: true,
    });
    const persisted = partialize(usePhotoStore.getState()) as Record<string, unknown>;
    expect(Object.keys(persisted).sort()).toEqual(["doc", "level"]);
    expect("cropDraft" in persisted).toBe(false);
    expect("previewOp" in persisted).toBe(false);
    expect("comparing" in persisted).toBe(false);
    expect(persisted.level).toBe("simple");
  });
});

/* ================================================================== */
/* setTarget / setIntent — print metadata, NOT history ops (PE5)       */
/* ================================================================== */

describe("setTarget — whole-target replace (document mutation, not a history op)", () => {
  it("replaces size / product / bleed, preserving intent", () => {
    s().openDocument(makeDoc());
    s().setTarget({ size: { w: 4, h: 6 }, product: { sku: "4x6", label: "4 × 6" }, bleed: 0.125 });
    expect(s().doc?.target).toEqual({
      size: { w: 4, h: 6 },
      product: { sku: "4x6", label: "4 × 6" },
      bleed: 0.125,
      intent: "srgb", // preserved — setTarget never touches intent
    });
  });

  it("preserves an already-flipped intent across a target change", () => {
    s().openDocument(makeDoc());
    s().setIntent("cmyk");
    s().setTarget({ size: { w: 5, h: 7 }, product: null, bleed: 0.125 });
    expect(s().doc?.target.intent).toBe("cmyk");
  });

  it("does NOT move the cursor or change the recipe (target is not an image edit)", () => {
    // A recipe with the cursor parked mid-history (one op undone).
    s().openDocument(makeDoc([op("a"), op("b"), op("c")], 2));
    const before = s().doc!;
    s().setTarget({ size: { w: 8, h: 10 }, product: null, bleed: 0.125 });
    expect(recipeLabels()).toEqual(["a", "b", "c"]); // recipe intact, tail not truncated
    expect(s().doc?.cursor).toBe(2); // cursor unmoved
    expect(s().doc?.recipe).toBe(before.recipe); // same array reference — untouched
  });

  it("does NOT clear a half-composed crop draft (not a history move)", () => {
    s().openDocument(makeDoc());
    s().setCropDraft(sampleDraft());
    s().setComparing(true);
    s().setTarget({ size: { w: 4, h: 6 }, product: null, bleed: 0.125 });
    expect(s().cropDraft).not.toBeNull();
    expect(s().comparing).toBe(true);
  });

  it("clears the print size back to null (whole-target replace)", () => {
    s().openDocument(makeDoc());
    s().setTarget({ size: { w: 4, h: 6 }, product: null, bleed: 0.125 });
    s().setTarget({ size: null, product: null, bleed: 0 });
    expect(s().doc?.target.size).toBeNull();
    expect(s().doc?.target.bleed).toBe(0);
  });

  it("no-ops with no document", () => {
    s().setTarget({ size: { w: 4, h: 6 }, product: null, bleed: 0.125 });
    expect(s().doc).toBeNull();
  });

  it("persists via partialize (the target rides the doc)", () => {
    const partialize = usePhotoStore.persist.getOptions().partialize!;
    s().openDocument(makeDoc());
    s().setTarget({ size: { w: 4, h: 6 }, product: null, bleed: 0.125 });
    const persisted = partialize(usePhotoStore.getState()) as { doc: PhotoDocument };
    expect(persisted.doc.target.size).toEqual({ w: 4, h: 6 });
  });
});

describe("setIntent — export colour intent (document mutation, not a history op)", () => {
  it("flips the intent without moving the cursor or changing the recipe", () => {
    s().openDocument(makeDoc([op("a"), op("b")], 1));
    s().setIntent("cmyk");
    expect(s().doc?.target.intent).toBe("cmyk");
    expect(s().doc?.cursor).toBe(1);
    expect(recipeLabels()).toEqual(["a", "b"]);
  });

  it("is independent of source.colorSpace (never mutates the arrival fact)", () => {
    s().openDocument(makeDoc()); // colorSpace: "rgb"
    s().setIntent("cmyk");
    expect(s().doc?.target.intent).toBe("cmyk");
    expect(s().doc?.source.colorSpace).toBe("rgb"); // untouched
  });

  it("is a no-op when the intent is already set (no needless doc churn)", () => {
    s().openDocument(makeDoc());
    const before = s().doc;
    s().setIntent("srgb"); // already srgb
    expect(s().doc).toBe(before); // same reference — nothing changed
  });

  it("no-ops with no document", () => {
    s().setIntent("cmyk");
    expect(s().doc).toBeNull();
  });

  it("persists via partialize (the intent rides the doc)", () => {
    const partialize = usePhotoStore.persist.getOptions().partialize!;
    s().openDocument(makeDoc());
    s().setIntent("cmyk");
    const persisted = partialize(usePhotoStore.getState()) as { doc: PhotoDocument };
    expect(persisted.doc.target.intent).toBe("cmyk");
  });
});

/* ================================================================== */
/* Text & image overlays (PE6) — add actions, coalesce, selection      */
/* ================================================================== */

/** A text/logo overlay op with a fixed id — for the coalesce + selection tests. */
function textOverlayOp(
  id: string,
  label = "Add text",
  box: PixelRect = { x: 0, y: 0, w: 100, h: 40 },
): PhotoOp {
  return {
    op: "textOverlay",
    label,
    id,
    text: "New text",
    font: { family: "Motiva Sans", size: 40, bold: false, italic: false },
    color: "#1a1a1a",
    align: "left",
    box,
    rotation: 0,
  };
}
function logoOverlayOp(id: string, label = "Add image"): PhotoOp {
  return {
    op: "logoOverlay",
    label,
    id,
    assetId: `photo:${id}:overlay`,
    box: { x: 0, y: 0, w: 80, h: 60 },
    rotation: 0,
  };
}

describe("overlay defaults", () => {
  it("boots with no overlay selected", () => {
    expect(s().selectedOverlayId).toBeNull();
  });
});

describe("addTextOverlay / addLogoOverlay", () => {
  it("addTextOverlay appends one text op, selects it, and lands the cursor at the end", () => {
    s().openDocument(makeDoc());
    s().addTextOverlay();
    const doc = s().doc!;
    expect(doc.recipe).toHaveLength(1);
    const op = doc.recipe[0];
    expect(op.op).toBe("textOverlay");
    expect(op.label).toBe("Add text");
    expect((op as { text: string }).text).toBe("New text");
    expect((op as { font: { family: string } }).font.family).toBe("Motiva Sans");
    expect(doc.cursor).toBe(1);
    // selected the new id
    expect(s().selectedOverlayId).toBe((op as { id: string }).id);
  });

  it("sizes the default text from the effective height (≈ h/12) and centers the box", () => {
    // source 4000×3000, no ops → eff 3000 tall → size ≈ 250 px.
    s().openDocument(makeDoc());
    s().addTextOverlay();
    const op = s().doc!.recipe[0] as { font: { size: number }; box: { x: number; w: number } };
    expect(op.font.size).toBe(250);
    // centered horizontally: box width 0.6·4000 = 2400, x = (4000-2400)/2 = 800
    expect(op.box.w).toBe(2400);
    expect(op.box.x).toBe(800);
  });

  it("addLogoOverlay appends one logo op bound to the asset, selects it", () => {
    s().openDocument(makeDoc());
    s().addLogoOverlay("photo:abc:overlay", 200, 100);
    const doc = s().doc!;
    expect(doc.recipe).toHaveLength(1);
    const op = doc.recipe[0] as { op: string; assetId: string; box: { w: number; h: number } };
    expect(op.op).toBe("logoOverlay");
    expect(op.assetId).toBe("photo:abc:overlay");
    // aspect 2:1 → boxW 0.3·4000 = 1200, boxH 600
    expect(op.box.w).toBe(1200);
    expect(op.box.h).toBe(600);
    expect(s().doc!.recipe[0].label).toBe("Add image");
    expect(s().selectedOverlayId).toBe((op as { id?: string }).id ?? s().selectedOverlayId);
  });

  it("add actions drop the redo tail (a fresh overlay truncates like any commit)", () => {
    s().openDocument(makeDoc([op("a"), op("b"), op("c")])); // cursor 3
    s().undo();
    s().undo(); // cursor 1
    s().addTextOverlay();
    expect(s().doc!.recipe).toHaveLength(2); // [a, textOverlay] — b, c dropped
    expect(s().doc!.recipe[1].op).toBe("textOverlay");
    expect(s().doc!.cursor).toBe(2);
  });

  it("add actions are safe no-ops with no document", () => {
    expect(() => {
      s().addTextOverlay();
      s().addLogoOverlay("photo:x:overlay", 10, 10);
    }).not.toThrow();
    expect(s().doc).toBeNull();
  });
});

describe("overlay coalesce — same tag AND same id", () => {
  it("edits to the SAME overlay id collapse to one history step", () => {
    s().openDocument(makeDoc([textOverlayOp("t1")])); // one Add-text step
    s().pushOp(textOverlayOp("t1", "Move text", { x: 5, y: 5, w: 100, h: 40 }), { coalesce: true });
    s().pushOp(textOverlayOp("t1", "Move text", { x: 9, y: 9, w: 100, h: 40 }), { coalesce: true });
    expect(s().doc!.recipe).toHaveLength(1);
    expect(s().doc!.recipe[0].label).toBe("Move text");
    expect((s().doc!.recipe[0] as { box: { x: number } }).box.x).toBe(9);
  });

  it("editing a DIFFERENT overlay id appends its own step (no cross-id merge)", () => {
    s().openDocument(makeDoc([textOverlayOp("t1")]));
    s().pushOp(logoOverlayOp("g1", "Move image"), { coalesce: true }); // different tag+id
    expect(s().doc!.recipe).toHaveLength(2);
    s().pushOp(textOverlayOp("t1", "Edit text"), { coalesce: true }); // trailing is g1 → appends
    expect(s().doc!.recipe).toHaveLength(3);
    expect(recipeLabels()).toEqual(["Add text", "Move image", "Edit text"]);
  });

  it("two text overlays with different ids never coalesce onto each other", () => {
    s().openDocument(makeDoc());
    s().pushOp(textOverlayOp("t1"));
    s().pushOp(textOverlayOp("t2"), { coalesce: true }); // trailing t1, different id
    expect(s().doc!.recipe).toHaveLength(2);
  });
});

describe("selectedOverlayId — lifecycle", () => {
  it("setter round-trips and clears", () => {
    s().setSelectedOverlayId("ov-1");
    expect(s().selectedOverlayId).toBe("ov-1");
    s().setSelectedOverlayId(null);
    expect(s().selectedOverlayId).toBeNull();
  });

  it("survives pushOp and history moves (editing keeps the overlay selected)", () => {
    s().openDocument(makeDoc([op("a"), op("b")]));
    s().setSelectedOverlayId("ov-keep");
    s().pushOp(op("c"));
    expect(s().selectedOverlayId).toBe("ov-keep");
    s().undo();
    expect(s().selectedOverlayId).toBe("ov-keep");
    s().redo();
    expect(s().selectedOverlayId).toBe("ov-keep");
  });

  it("clears on tool change and on doc open/close", () => {
    s().openDocument(makeDoc());
    s().setActiveTool("text");
    s().setSelectedOverlayId("ov-1");
    s().setActiveTool("adjust");
    expect(s().selectedOverlayId).toBeNull();

    s().setSelectedOverlayId("ov-2");
    s().openDocument(makeDoc([op("a")]));
    expect(s().selectedOverlayId).toBeNull();

    s().setSelectedOverlayId("ov-3");
    s().closeDocument();
    expect(s().selectedOverlayId).toBeNull();
  });

  it("stays out of partialize (session-only)", () => {
    const partialize = usePhotoStore.persist.getOptions().partialize!;
    usePhotoStore.setState({ doc: makeDoc([op("a")]), level: "simple", selectedOverlayId: "ov-1" });
    const persisted = partialize(usePhotoStore.getState()) as Record<string, unknown>;
    expect("selectedOverlayId" in persisted).toBe(false);
    expect(Object.keys(persisted).sort()).toEqual(["doc", "level"]);
  });
});

/* ================================================================== */
/* pendingPreview + cleanupBrushSize — the PE9 preview-approve loop §7 */
/* ================================================================== */

describe("pendingPreview — the model-op preview (PE9 §7)", () => {
  it("setPendingPreview round-trips and clears", () => {
    s().openDocument(makeDoc());
    s().setPendingPreview(eraseOp());
    expect(s().pendingPreview).toEqual(eraseOp());
    s().setPendingPreview(null);
    expect(s().pendingPreview).toBeNull();
  });

  it("Apply = pushOp(pendingPreview) appends exactly one op and clears the pending state", () => {
    s().openDocument(makeDoc([op("a")])); // cursor 1
    const preview = eraseOp();
    s().setPendingPreview(preview);
    // Apply is a plain pushOp of the pending op.
    s().pushOp(s().pendingPreview!);
    expect(s().doc!.recipe).toHaveLength(2);
    expect(s().doc!.recipe[1]).toEqual(preview);
    expect(s().doc!.recipe[1].label).toBe("Remove object");
    expect(s().doc!.cursor).toBe(2);
    // pushOp clears the pending preview via CLEAR_DRAFT (atomic with the commit).
    expect(s().pendingPreview).toBeNull();
  });

  it("Discard = setPendingPreview(null) leaves the recipe and cursor untouched", () => {
    // Park the cursor mid-history so an accidental truncation would show.
    s().openDocument(makeDoc([op("a"), op("b"), op("c")], 2));
    const before = s().doc!;
    s().setPendingPreview(eraseOp());
    s().setPendingPreview(null); // Discard
    expect(s().pendingPreview).toBeNull();
    expect(recipeLabels()).toEqual(["a", "b", "c"]); // tail intact
    expect(s().doc?.cursor).toBe(2); // cursor unmoved
    expect(s().doc?.recipe).toBe(before.recipe); // same array reference — untouched
  });

  it("is cleared by CLEAR_DRAFT — pushOp, undo, redo, setCursor (a history move stales it)", () => {
    s().openDocument(makeDoc([op("a"), op("b")])); // cursor 2

    s().setPendingPreview(eraseOp());
    s().pushOp(op("c"));
    expect(s().pendingPreview).toBeNull();

    s().setPendingPreview(eraseOp());
    s().undo();
    expect(s().pendingPreview).toBeNull();

    s().setPendingPreview(eraseOp());
    s().redo();
    expect(s().pendingPreview).toBeNull();

    s().setPendingPreview(eraseOp());
    s().setCursor(0);
    expect(s().pendingPreview).toBeNull();
  });

  it("is cleared by CLEAR_GESTURES — tool switch, doc open, doc close", () => {
    s().openDocument(makeDoc([op("a")]));

    s().setPendingPreview(eraseOp());
    s().setActiveTool("adjust");
    expect(s().pendingPreview).toBeNull();

    s().setPendingPreview(eraseOp());
    s().openDocument(makeDoc([op("a")]));
    expect(s().pendingPreview).toBeNull();

    s().setPendingPreview(eraseOp());
    s().closeDocument();
    expect(s().pendingPreview).toBeNull();
  });

  it("stays out of partialize (session-only, never persisted)", () => {
    const partialize = usePhotoStore.persist.getOptions().partialize!;
    usePhotoStore.setState({ doc: makeDoc([op("a")]), level: "simple", pendingPreview: eraseOp() });
    const persisted = partialize(usePhotoStore.getState()) as Record<string, unknown>;
    expect("pendingPreview" in persisted).toBe(false);
    expect(Object.keys(persisted).sort()).toEqual(["doc", "level"]);
  });
});

describe("cleanupBrushSize — the clean-up brush slider (PE9 §7)", () => {
  it("defaults to 40 and setCleanupBrushSize round-trips", () => {
    expect(s().cleanupBrushSize).toBe(40);
    s().setCleanupBrushSize(88);
    expect(s().cleanupBrushSize).toBe(88);
  });

  it("survives history moves and tool switches (session preference, not a gesture)", () => {
    s().openDocument(makeDoc([op("a")]));
    s().setCleanupBrushSize(16);
    s().pushOp(op("b"));
    s().undo();
    s().setActiveTool("cleanup");
    expect(s().cleanupBrushSize).toBe(16);
  });

  it("stays out of partialize (session-only, never persisted)", () => {
    const partialize = usePhotoStore.persist.getOptions().partialize!;
    usePhotoStore.setState({ doc: makeDoc([op("a")]), level: "simple", cleanupBrushSize: 100 });
    const persisted = partialize(usePhotoStore.getState()) as Record<string, unknown>;
    expect("cleanupBrushSize" in persisted).toBe(false);
    expect(Object.keys(persisted).sort()).toEqual(["doc", "level"]);
  });
});
