import { describe, it, expect, beforeEach } from "vitest";
import { useLayoutStore, TOOL_LABELS, type EditorTool } from "./layout-store";

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
