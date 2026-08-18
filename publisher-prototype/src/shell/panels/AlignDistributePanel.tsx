import { useState } from "react";
import {
  alignBoxes,
  distributeBoxes,
  type AlignEdge,
  type DistributeAxis,
} from "../../core/geometry/align";
import { selectionAabb, type Rect } from "../../core/hittest";
import { effectivePageSetup } from "../../core/render/pageSetup";
import { objectResizeCommitted, selectDocument } from "../../core/store";
import { useAppDispatch, useAppSelector } from "../hooks";

/**
 * The live Align & distribute panel (PLAN.md §4.3 "align-distribute", §2.3;
 * Phase B Selection & transform group): each press computes absolute
 * geometry in core (core/geometry/align.ts) and commits it through the
 * panels' shared object/resizeCommitted vocabulary — one action, one
 * history entry, sizes untouched.
 *
 * The reference resolves the §2.3 target: the selection's own bounds, the
 * page, or the margin box. The "guides" reference renders disabled until
 * guide tooling lands (the options-bar honesty rule applied to a panel).
 * Alignment against the selection needs two objects to mean anything;
 * page/margins align a single object. Distribution spaces within the
 * selection's extent and needs three movable objects.
 */

type AlignReference = "selection" | "page" | "margins";

const ALIGN_BUTTONS: readonly { edge: AlignEdge; label: string }[] = [
  { edge: "left", label: "Align left" },
  { edge: "centerH", label: "Align center" },
  { edge: "right", label: "Align right" },
  { edge: "top", label: "Align top" },
  { edge: "middleV", label: "Align middle" },
  { edge: "bottom", label: "Align bottom" },
];

export function AlignDistributePanel({ pageIndex }: { pageIndex: number }) {
  const dispatch = useAppDispatch();
  const doc = useAppSelector(selectDocument);
  const selectedIds = useAppSelector((s) => s.selection.ids);
  const [reference, setReference] = useState<AlignReference>("selection");
  const objects = doc.pages[pageIndex]?.objects ?? [];
  const selected = objects.filter((o) => selectedIds.includes(o.id));
  const movable = selected.filter((o) => !o.locked);
  const setup = effectivePageSetup(doc, pageIndex);

  const targetRect = (): Rect | null => {
    if (reference === "page") return { x: 0, y: 0, w: setup.size.w, h: setup.size.h };
    if (reference === "margins") {
      const m = setup.margin;
      return { x: m, y: m, w: setup.size.w - 2 * m, h: setup.size.h - 2 * m };
    }
    return selectionAabb(selected);
  };

  const alignDisabled =
    movable.length < 1 || (reference === "selection" && selected.length < 2);
  const distributeDisabled = movable.length < 3;

  const align = (edge: AlignEdge): void => {
    const target = targetRect();
    if (target === null) return;
    dispatch(objectResizeCommitted({ pageIndex, boxes: alignBoxes(selected, edge, target) }));
  };

  const distribute = (axis: DistributeAxis): void => {
    const boxes = distributeBoxes(selected, axis);
    if (boxes === null) return;
    dispatch(objectResizeCommitted({ pageIndex, boxes }));
  };

  return (
    <div className="panel-live" data-testid="align-distribute-panel">
      <label className="field">
        Align to
        <select
          aria-label="Align to"
          value={reference}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "selection" || value === "page" || value === "margins") {
              setReference(value);
            }
          }}
        >
          <option value="selection">selection</option>
          <option value="page">page</option>
          <option value="margins">margins</option>
          <option value="guides" disabled>
            guides
          </option>
        </select>
      </label>
      <div className="field-row">
        {ALIGN_BUTTONS.map(({ edge, label }) => (
          <button key={edge} type="button" disabled={alignDisabled} onClick={() => align(edge)}>
            {label}
          </button>
        ))}
      </div>
      <div className="field-row">
        <button
          type="button"
          disabled={distributeDisabled}
          onClick={() => distribute("horizontal")}
        >
          Distribute horizontally
        </button>
        <button type="button" disabled={distributeDisabled} onClick={() => distribute("vertical")}>
          Distribute vertically
        </button>
      </div>
      {selected.length === 0 && <p className="panel-note">No selection.</p>}
    </div>
  );
}
