import { describe, it, expect, beforeEach } from "vitest";
import {
  useLayoutStore,
  TOOL_LABELS,
  createDefaultDocument,
  type EditorTool,
} from "./layout-store";
import { LayoutDocumentSchema } from "@/schema";
import { MAX_PAGE_IN } from "@/lib/layout/geometry";

beforeEach(() => {
  useLayoutStore.setState(useLayoutStore.getInitialState(), true);
});

describe("layout editor UI state", () => {
  it("boots with the prototype defaults: Home ribbon, Select tool, Page tab, Pages view", () => {
    const s = useLayoutStore.getState();
    expect(s.ribbon).toBe("home");
    expect(s.tool).toBe("select");
    expect(s.insp).toBe("page");
    expect(s.pages).toBe("pages");
  });

  it("switches each UI surface independently", () => {
    const s = useLayoutStore.getState();
    s.setRibbon("insert");
    s.setTool("rect");
    s.setInsp("props");
    s.setPages("masters");

    const after = useLayoutStore.getState();
    expect(after.ribbon).toBe("insert");
    expect(after.tool).toBe("rect");
    expect(after.insp).toBe("props");
    expect(after.pages).toBe("masters");
  });

  it("tools are single-select — picking one replaces the last", () => {
    const s = useLayoutStore.getState();
    s.setTool("ellipse");
    s.setTool("zoom");
    expect(useLayoutStore.getState().tool).toBe("zoom");
  });

  it("has a status-bar label for every tool", () => {
    const tools: EditorTool[] = [
      "select",
      "text",
      "rect",
      "ellipse",
      "line",
      "pic",
      "table",
      "zoom",
      "move",
    ];
    for (const tool of tools) {
      expect(TOOL_LABELS[tool]).toMatch(/ tool$/);
    }
  });
});

describe("document model", () => {
  it("boots with the pristine Letter document, valid against the schema", () => {
    const { doc } = useLayoutStore.getState();
    expect(LayoutDocumentSchema.parse(doc)).toEqual(createDefaultDocument());
    expect(doc.size).toEqual({ w: 8.5, h: 11 });
    expect(doc.bleed).toBe(0.125);
    expect(doc.margin).toBe(0.5);
    expect(doc.columns).toBe(1);
    expect(doc.pages[0].masterId).toBe("master-a");
    expect(doc.masters.map((m) => m.label)).toEqual(["A", "B"]);
  });

  it("applyPreset keeps the current orientation", () => {
    const s = useLayoutStore.getState();
    s.setOrientation("landscape");
    s.applyPreset("ledger");
    const { doc } = useLayoutStore.getState();
    expect(doc.size).toEqual({ w: 17, h: 11 });
    expect(doc.orientation).toBe("landscape");
  });

  it("applyPreset ignores unknown ids (bad deep links stay harmless)", () => {
    useLayoutStore.getState().applyPreset("nonsense");
    expect(useLayoutStore.getState().doc.size).toEqual({ w: 8.5, h: 11 });
  });

  it("setPageSize clamps to the large-format bounds and derives orientation", () => {
    const s = useLayoutStore.getState();
    s.setPageSize(18, 24);
    expect(useLayoutStore.getState().doc.orientation).toBe("portrait");
    s.setPageSize(24, 18);
    expect(useLayoutStore.getState().doc.orientation).toBe("landscape");
    s.setPageSize(999, 0.2);
    expect(useLayoutStore.getState().doc.size).toEqual({ w: MAX_PAGE_IN, h: 1 });
  });

  it("setOrientation swaps the effective dimensions once", () => {
    const s = useLayoutStore.getState();
    s.setOrientation("landscape");
    expect(useLayoutStore.getState().doc.size).toEqual({ w: 11, h: 8.5 });
    s.setOrientation("landscape"); // no-op — already landscape
    expect(useLayoutStore.getState().doc.size).toEqual({ w: 11, h: 8.5 });
    s.setOrientation("portrait");
    expect(useLayoutStore.getState().doc.size).toEqual({ w: 8.5, h: 11 });
  });

  it("clamps bleed, margin, and columns to sane print ranges", () => {
    const s = useLayoutStore.getState();
    s.setBleed(3);
    s.setMargin(99);
    s.setColumns(42);
    const { doc } = useLayoutStore.getState();
    expect(doc.bleed).toBe(0.5);
    expect(doc.margin).toBe(8.5 / 2); // half the short edge
    expect(doc.columns).toBe(6);
    s.setColumns(0);
    expect(useLayoutStore.getState().doc.columns).toBe(1);
  });

  it("page-geometry changes bump fitRequestId; cosmetic ones don't", () => {
    const before = useLayoutStore.getState().fitRequestId;
    const s = useLayoutStore.getState();
    s.applyPreset("legal");
    s.setOrientation("landscape");
    s.setPageSize(20, 30);
    expect(useLayoutStore.getState().fitRequestId).toBe(before + 3);
    s.setName("Renamed");
    s.setBleed(0.25);
    expect(useLayoutStore.getState().fitRequestId).toBe(before + 3);
  });

  it("resetDoc restores the pristine document and re-fits", () => {
    const s = useLayoutStore.getState();
    s.setName("Spring sale flyer");
    s.setPageSize(18, 24);
    s.setColumns(3);
    s.toggleGuides();
    const fitBefore = useLayoutStore.getState().fitRequestId;
    s.resetDoc();
    const after = useLayoutStore.getState();
    expect(after.doc).toEqual(createDefaultDocument());
    expect(after.guidesVisible).toBe(true);
    expect(after.pan).toEqual({ x: 0, y: 0 });
    expect(after.fitRequestId).toBe(fitBefore + 1);
  });
});

describe("viewport", () => {
  it("zoom steps through the table and clamps", () => {
    const s = useLayoutStore.getState();
    s.setZoom(1);
    s.zoomIn();
    expect(useLayoutStore.getState().zoom).toBe(1.25);
    s.zoomOut();
    s.zoomOut();
    expect(useLayoutStore.getState().zoom).toBe(0.75);
    s.setZoom(99);
    expect(useLayoutStore.getState().zoom).toBe(4);
  });

  it("guides toggle flips visibility", () => {
    const s = useLayoutStore.getState();
    expect(useLayoutStore.getState().guidesVisible).toBe(true);
    s.toggleGuides();
    expect(useLayoutStore.getState().guidesVisible).toBe(false);
  });
});

describe("persisted-state validation (the merge guard)", () => {
  it("accepts a valid stored document", () => {
    const doc = createDefaultDocument();
    doc.name = "From storage";
    expect(LayoutDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("rejects corrupt shapes so the editor falls back to pristine", () => {
    expect(LayoutDocumentSchema.safeParse({ version: 1, name: "broken" }).success).toBe(false);
    expect(LayoutDocumentSchema.safeParse(null).success).toBe(false);
    const noPages = { ...createDefaultDocument(), pages: [] };
    expect(LayoutDocumentSchema.safeParse(noPages).success).toBe(false);
  });
});
