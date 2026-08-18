import { useState } from "react";
import {
  ArrowHeadSchema,
  ArrowHeadSizeSchema,
  LineDashSchema,
  type ArrowHead,
  type ArrowHeadSize,
  type LineDash,
  type Paint,
} from "../../core/model";
import { hexToColorValue, paintToCss, paintToHex } from "../../core/render/paint";
import {
  inEditRun,
  objectArrowHeadsCommitted,
  objectFillCommitted,
  objectLineDashCommitted,
  objectStrokePaintCommitted,
  objectStrokeWidthCommitted,
  selectDocument,
} from "../../core/store";
import { useAppDispatch, useAppSelector } from "../hooks";
import { NumberField } from "./NumberField";

/**
 * The live Colour & swatches panel (PLAN.md §4.3 "color-swatches"; Phase B
 * Layers & colour group, on-screen use): apply color to the selection's
 * fill or outline — a picked literal rgb color, a named document swatch
 * (kept as a swatch REFERENCE so later swatch edits restyle the document),
 * or none. Outline width edits per-object widths; outline color keeps them
 * (the strokePaint/strokeWidth commit split). Both apply as they are made —
 * the width field folds its run into one history entry (NumberField).
 *
 * A line's outline is more than colour and width, so the Outline target also
 * carries its dash pattern and end decorations when the selection holds
 * lines — the rest of what the line and arrow tools set before drawing.
 *
 * Which target a control edits is panel state, not document state. The
 * shown color/width read from the FIRST selected object; commits apply to
 * every selected object the reducer rules allow (lines take no fill and
 * never lose their stroke; locked objects are skipped).
 */

type Target = "fill" | "stroke";

export function ColorSwatchesPanel({ pageIndex }: { pageIndex: number }) {
  const dispatch = useAppDispatch();
  const doc = useAppSelector(selectDocument);
  const selectedIds = useAppSelector((s) => s.selection.ids);
  const [target, setTarget] = useState<Target>("fill");
  const objects = doc.pages[pageIndex]?.objects ?? [];
  const selected = objects.filter((o) => selectedIds.includes(o.id));

  // The objects this target can restyle at all, per the reducer rules.
  const applicable = selected.filter((o) => {
    if (o.locked) return false;
    return target === "fill" ? o.type !== "line" : true;
  });
  const disabled = applicable.length === 0;
  // Removing an outline only applies to frames — a line's stroke is
  // schema-required, so an all-line selection renders None disabled.
  const noneDisabled = disabled || (target === "stroke" && applicable.every((o) => o.type === "line"));

  const first = selected[0];
  const currentPaint: Paint | null =
    first === undefined
      ? null
      : target === "fill"
        ? first.type === "line"
          ? null
          : first.fill
        : (first.stroke?.paint ?? null);
  const firstStroked = selected.find((o) => o.stroke !== null);
  // Dash and end decorations describe a LINE's outline, so they show whenever
  // the selection holds lines and edit exactly the ones the reducer can touch
  // — a locked line's controls disable rather than vanish, like the width.
  const lines = selected.filter((o) => o.type === "line");
  const lineIds = applicable.filter((o) => o.type === "line").map((o) => o.id);
  const lineDisabled = lineIds.length === 0;

  const applyPaint = (paint: Paint | null): void => {
    const ids = applicable.map((o) => o.id);
    if (target === "fill") dispatch(objectFillCommitted({ pageIndex, ids, fill: paint }));
    else dispatch(objectStrokePaintCommitted({ pageIndex, ids, paint }));
  };

  return (
    <div className="panel-live" data-testid="color-swatches-panel">
      {selected.length === 0 && <p className="panel-note">No selection.</p>}
      <div className="field-row" role="radiogroup" aria-label="Apply to">
        <label className="field">
          <input
            type="radio"
            name="color-target"
            aria-label="Fill"
            checked={target === "fill"}
            onChange={() => setTarget("fill")}
          />
          Fill
        </label>
        <label className="field">
          <input
            type="radio"
            name="color-target"
            aria-label="Outline"
            checked={target === "stroke"}
            onChange={() => setTarget("stroke")}
          />
          Outline
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          Color
          <input
            type="color"
            aria-label="Color"
            value={currentPaint === null ? "#000000" : paintToHex(currentPaint, doc.swatches)}
            disabled={disabled}
            onChange={(e) =>
              applyPaint({ kind: "color", color: hexToColorValue(e.target.value) })
            }
          />
        </label>
        <button type="button" disabled={noneDisabled} onClick={() => applyPaint(null)}>
          None
        </button>
      </div>
      {target === "stroke" && lines.length > 0 && (
        <div className="field-row">
          <label className="field">
            Dash
            <select
              aria-label="Dash"
              value={lines[0]?.dash ?? "solid"}
              disabled={lineDisabled}
              onChange={(e) =>
                dispatch(
                  objectLineDashCommitted({
                    pageIndex,
                    ids: lineIds,
                    dash: e.target.value as LineDash,
                  }),
                )
              }
            >
              {LineDashSchema.options.map((dash) => (
                <option key={dash} value={dash}>
                  {dash}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["Start head", "headStart"],
              ["End head", "headEnd"],
            ] as const
          ).map(([label, field]) => (
            <label className="field" key={field}>
              {label}
              <select
                aria-label={label}
                value={lines[0]?.[field] ?? "none"}
                disabled={lineDisabled}
                onChange={(e) =>
                  dispatch(
                    objectArrowHeadsCommitted({
                      pageIndex,
                      ids: lineIds,
                      [field]: e.target.value as ArrowHead,
                    }),
                  )
                }
              >
                {ArrowHeadSchema.options.map((head) => (
                  <option key={head} value={head}>
                    {head}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="field">
            Head size
            <select
              aria-label="Head size"
              value={lines[0]?.headSize ?? "m"}
              disabled={lineDisabled}
              onChange={(e) =>
                dispatch(
                  objectArrowHeadsCommitted({
                    pageIndex,
                    ids: lineIds,
                    headSize: e.target.value as ArrowHeadSize,
                  }),
                )
              }
            >
              {ArrowHeadSizeSchema.options.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {target === "stroke" && (
        <NumberField
          label="Width"
          value={firstStroked?.stroke?.width ?? 1}
          min={0}
          step={0.25}
          unit="pt"
          disabled={disabled}
          onCommit={(width, editRun) =>
            dispatch(
              inEditRun(
                objectStrokeWidthCommitted({
                  pageIndex,
                  ids: applicable.map((o) => o.id),
                  width,
                }),
                editRun,
              ),
            )
          }
        />
      )}
      <div className="swatch-list" role="group" aria-label="Document swatches">
        {doc.swatches.length === 0 && <p className="panel-note">No document swatches.</p>}
        {doc.swatches.map((swatch) => (
          <button
            key={swatch.id}
            type="button"
            className="swatch"
            disabled={disabled}
            onClick={() => applyPaint({ kind: "swatch", swatchId: swatch.id })}
          >
            <span
              className="swatch-chip"
              style={{ background: paintToCss({ kind: "swatch", swatchId: swatch.id }, doc.swatches) }}
            />
            {swatch.name}
            {swatch.space !== "rgb" && <span className="swatch-space">{swatch.space}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
