import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  usePhotoStore,
  mergePhotoState,
  type PhotoTool,
} from "./photo-store";
import {
  PhotoDocumentSchema,
  type PhotoDocument,
  type PhotoOp,
  type PhotoSource,
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
    s().setReturnContext({ originName: "Spring flyer", objectId: "obj-7" });
    expect(s().returnContext).toEqual({ originName: "Spring flyer", objectId: "obj-7" });
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
      returnContext: { originName: "Flyer", objectId: "obj-1" },
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
