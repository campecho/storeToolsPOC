import { describe, expect, it } from "vitest";
import type { LayoutObject } from "../model";
import { clipboardCopyCommitted, clipboardSlice, type ClipboardState } from "./clipboardSlice";
import { objectPasteCommitted } from "./documentActions";

/**
 * Clipboard contract (document.ctrl-c / ctrl-x / ctrl-v): app state holding
 * what a copy or cut took, plus the count that makes successive pastes
 * cascade instead of stacking.
 */

const { reducer } = clipboardSlice;

function shape(id: string): LayoutObject {
  return {
    id,
    type: "shape",
    shape: "rect",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    rotation: 0,
    locked: false,
    fill: null,
    stroke: null,
  };
}

const empty: ClipboardState = { objects: [], groups: [], pastes: 0 };

describe("clipboardSlice", () => {
  it("starts empty", () => {
    expect(reducer(undefined, { type: "@@init" })).toEqual(empty);
  });

  it("holds what a copy took, groups included", () => {
    const next = reducer(
      empty,
      clipboardCopyCommitted({ objects: [shape("a")], groups: [{ id: "g" }] }),
    );
    expect(next.objects.map((o) => o.id)).toEqual(["a"]);
    expect(next.groups).toEqual([{ id: "g" }]);
  });

  it("counts pastes so each one cascades further than the last", () => {
    const copied = reducer(empty, clipboardCopyCommitted({ objects: [shape("a")], groups: [] }));
    expect(copied.pastes).toBe(0);
    const once = reducer(copied, objectPasteCommitted({ pageIndex: 0, objects: [], groups: [] }));
    const twice = reducer(once, objectPasteCommitted({ pageIndex: 0, objects: [], groups: [] }));
    expect([once.pastes, twice.pastes]).toEqual([1, 2]);
  });

  it("resets the cascade when the contents change", () => {
    const pasted = reducer(
      reducer(empty, clipboardCopyCommitted({ objects: [shape("a")], groups: [] })),
      objectPasteCommitted({ pageIndex: 0, objects: [], groups: [] }),
    );
    expect(pasted.pastes).toBe(1);
    const recopied = reducer(
      pasted,
      clipboardCopyCommitted({ objects: [shape("b")], groups: [] }),
    );
    expect(recopied.pastes).toBe(0);
    expect(recopied.objects.map((o) => o.id)).toEqual(["b"]);
  });

  it("keeps its contents through a paste — pasting twice is two independent sets", () => {
    const copied = reducer(empty, clipboardCopyCommitted({ objects: [shape("a")], groups: [] }));
    const after = reducer(copied, objectPasteCommitted({ pageIndex: 0, objects: [], groups: [] }));
    expect(after.objects.map((o) => o.id)).toEqual(["a"]);
  });
});
