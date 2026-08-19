import type { UnknownAction } from "@reduxjs/toolkit";
import {
  FlowchartSymbolSchema,
  tailTipFor,
  type FlowchartSymbol,
  type LayoutObject,
  type LineObject,
  type ShapeObject,
} from "../../core/model";
import {
  calloutTailCommitted,
  flowchartSymbolCommitted,
  inEditRun,
  objectLockCommitted,
  objectPathClosedCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  roundedRectCornerRadiusCommitted,
  selectDocument,
  starPolygonInnerRadiusCommitted,
  starPolygonPointsCommitted,
  type FrameBox,
  type LineEndpoints,
} from "../../core/store";
import { useAppDispatch, useAppSelector } from "../hooks";
import { CALLOUT_TIP_MAX, CALLOUT_TIP_MIN } from "../../core/geometry/shapePaths";
import { NumberField } from "./NumberField";
import { SelectField } from "./SelectField";

/**
 * The live Transform panel (PLAN.md §4.3 "transform"; Phase B Selection &
 * transform group): precise numeric geometry entry over the same commit
 * vocabulary the canvas gestures use — X/Y/W/H through
 * object/resizeCommitted, angle (entry, ±90°, reset) through
 * object/rotateCommitted. Fields apply as they are typed and fold into one
 * history entry per visit (the NumberField edit run); the buttons are
 * discrete commits, one entry each.
 *
 * Numeric entry binds to a SINGLE selected object, in that object's OWN
 * geometry vocabulary: a frame shows X/Y/W/H, a line shows its two points as
 * X1/Y1/X2/Y2 — the same thing its canvas chrome says. Squeezing a line into
 * a bounding box made a vertical one un-editable along X, since a degenerate
 * extent cannot be scaled. Rotation is about the frame center (decision of
 * record in SEAMS.md); lines carry no rotation and show the angle controls
 * disabled. Locking (§5.3) disables every geometry control except the lock
 * checkbox itself — the door out.
 *
 * The Shape group is the numeric home for whatever parameter shapes the
 * selected kind — corner radius, star points and inner radius, callout tail,
 * flowchart symbol, a path's closed state. Each appears only for the kind
 * that stores it (SHAPE_GEOMETRY_FIELDS), and where a canvas adjust handle
 * sets the same parameter, both surfaces dispatch the one action.
 */

type Box = { x: number; y: number; w: number; h: number };

/** Every object that carries a frame box — everything the union holds except
    a line, which carries two points instead. */
type FrameLike = Exclude<LayoutObject, LineObject>;

/** A frame object's position and size. Its own four numbers, unlike a line's,
    which is why the two get different fields rather than one shared bbox. */
function FrameGeometry({
  object,
  locked,
  onCommit,
}: {
  object: FrameLike;
  locked: boolean;
  onCommit: (next: Box, editRun?: string) => void;
}) {
  const box: Box = { x: object.x, y: object.y, w: object.w, h: object.h };
  return (
    <>
      <div className="field-row">
        <NumberField
          label="X"
          value={box.x}
          step={0.05}
          unit="in"
          disabled={locked}
          onCommit={(x, editRun) => onCommit({ ...box, x }, editRun)}
        />
        <NumberField
          label="Y"
          value={box.y}
          step={0.05}
          unit="in"
          disabled={locked}
          onCommit={(y, editRun) => onCommit({ ...box, y }, editRun)}
        />
      </div>
      <div className="field-row">
        <NumberField
          label="W"
          value={box.w}
          min={MIN_EXTENT_IN}
          step={0.05}
          unit="in"
          disabled={locked}
          onCommit={(w, editRun) => onCommit({ ...box, w }, editRun)}
        />
        <NumberField
          label="H"
          value={box.h}
          min={MIN_EXTENT_IN}
          step={0.05}
          unit="in"
          disabled={locked}
          onCommit={(h, editRun) => onCommit({ ...box, h }, editRun)}
        />
      </div>
    </>
  );
}

/** Angle entry and buttons normalize into [0, 360) so the field always
    reads one canonical form regardless of how the value was reached. */
function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Smallest committable extent, inches — W/H entry never commits a
    degenerate frame the resize gesture itself would refuse to produce. */
const MIN_EXTENT_IN = 0.001;

export function TransformPanel({
  pageIndex,
  nudgeIncrement,
  onNudgeIncrementChange,
}: {
  pageIndex: number;
  /** The select tool's live nudgeIncrement option — one value, two surfaces
      (options bar and panel), both editing the same App state. */
  nudgeIncrement: number;
  onNudgeIncrementChange: (value: number) => void;
}) {
  const dispatch = useAppDispatch();
  const doc = useAppSelector(selectDocument);
  const selectedIds = useAppSelector((s) => s.selection.ids);
  const objects = doc.pages[pageIndex]?.objects ?? [];
  const selected = objects.filter((o) => selectedIds.includes(o.id));
  const single = selected.length === 1 ? selected[0] : undefined;

  const nudgeField = (
    <NumberField
      label="Nudge increment"
      value={nudgeIncrement}
      min={0.01}
      step={0.01}
      unit="in"
      onCommit={onNudgeIncrementChange}
    />
  );

  if (single === undefined) {
    return (
      <div className="panel-live" data-testid="transform-panel">
        <p className="panel-note">
          {selected.length === 0
            ? "No selection."
            : `${selected.length} objects selected — numeric entry binds to a single selection.`}
        </p>
        {nudgeField}
      </div>
    );
  }

  const isLine = single.type === "line";
  const rotation = isLine ? 0 : single.rotation;
  const locked = single.locked;

  // One commit for both vocabularies — object/resizeCommitted already takes
  // a frame box or a line's endpoints and applies whichever matches.
  // `editRun` is the field's continuous-edit group; the ±90° and reset
  // buttons pass none, so each of those stays its own history entry.
  const commitGeometry = (next: FrameBox | LineEndpoints, editRun?: string): void => {
    dispatch(
      inEditRun(objectResizeCommitted({ pageIndex, boxes: { [single.id]: next } }), editRun),
    );
  };

  /** Every shape-parameter commit takes the same shape: this one object's
      id, optionally inside the field's edit run. */
  const commitShapeParam = (action: UnknownAction, editRun?: string): void => {
    dispatch(inEditRun(action, editRun));
  };
  const shapeIds = { pageIndex, ids: [single.id] };

  const commitRotation = (deg: number, editRun?: string): void => {
    dispatch(
      inEditRun(
        objectRotateCommitted({ pageIndex, rotations: { [single.id]: normalizeDegrees(deg) } }),
        editRun,
      ),
    );
  };

  /**
   * The controls for whatever shapes this kind — the panel face of
   * SHAPE_GEOMETRY_FIELDS. Each kind's parameters appear only for that kind,
   * because a kind that stores nothing has nothing to edit here, and the
   * bounds are the drawing tools' own contract ranges so a placed shape can
   * be driven exactly as far as it could be drawn.
   *
   * Star inner radius, callout tail and corner radius each have a canvas
   * adjust handle setting the SAME action — one commit vocabulary, two
   * surfaces, as the roundedRect precedent established.
   */
  const shapeFields = (shape: ShapeObject) => {
    switch (shape.shape) {
      case "roundedRect":
        return (
          <NumberField
            label="Corner radius"
            // No upper bound, unlike the tool option's: the stored radius is
            // deliberately unclamped (ShapeObjectSchema), so a big frame can
            // carry a big radius and a shrunk one keeps what it had.
            value={shape.cornerRadius ?? 0}
            min={0}
            step={0.05}
            unit="in"
            disabled={locked}
            onCommit={(radius, editRun) =>
              commitShapeParam(roundedRectCornerRadiusCommitted({ ...shapeIds, radius }), editRun)
            }
          />
        );
      case "starPolygon":
        return (
          <>
            <NumberField
              label="Points"
              value={shape.points ?? 5}
              min={3}
              max={24}
              step={1}
              disabled={locked}
              onCommit={(points, editRun) =>
                commitShapeParam(starPolygonPointsCommitted({ ...shapeIds, points }), editRun)
              }
            />
            <NumberField
              label="Inner radius"
              value={shape.innerRadiusRatio ?? 0.5}
              min={0.1}
              max={0.9}
              step={0.05}
              disabled={locked}
              onCommit={(innerRadiusRatio, editRun) =>
                commitShapeParam(
                  starPolygonInnerRadiusCommitted({ ...shapeIds, innerRadiusRatio }),
                  editRun,
                )
              }
            />
          </>
        );
      case "callout": {
        // The tip in unit-box coordinates — the numeric face of the yellow
        // handle. Outside 0–1 is normal and useful: that is the tail reaching
        // past the body, which is where a callout usually points.
        const tip = shape.tailTip ?? tailTipFor("bottom-left");
        return (
          <>
            <NumberField
              label="Tail X"
              value={tip.x}
              min={CALLOUT_TIP_MIN}
              max={CALLOUT_TIP_MAX}
              step={0.05}
              disabled={locked}
              onCommit={(x, editRun) =>
                commitShapeParam(calloutTailCommitted({ ...shapeIds, tailTip: { ...tip, x } }), editRun)
              }
            />
            <NumberField
              label="Tail Y"
              value={tip.y}
              min={CALLOUT_TIP_MIN}
              max={CALLOUT_TIP_MAX}
              step={0.05}
              disabled={locked}
              onCommit={(y, editRun) =>
                commitShapeParam(calloutTailCommitted({ ...shapeIds, tailTip: { ...tip, y } }), editRun)
              }
            />
          </>
        );
      }
      case "flowchart":
        return (
          <SelectField<FlowchartSymbol>
            label="Symbol"
            value={shape.symbol ?? "process"}
            options={FlowchartSymbolSchema.options}
            disabled={locked}
            onCommit={(symbol) =>
              commitShapeParam(flowchartSymbolCommitted({ ...shapeIds, symbol }))
            }
          />
        );
      case "path":
        return (
          <label className="field">
            <input
              type="checkbox"
              aria-label="Closed"
              checked={(shape.d ?? []).at(-1)?.c === "Z"}
              disabled={locked}
              onChange={(e) =>
                commitShapeParam(
                  objectPathClosedCommitted({ ...shapeIds, closed: e.target.checked }),
                )
              }
            />
            Closed
          </label>
        );
      // rect and ellipse are shaped by their frame box alone.
      case "rect":
      case "ellipse":
        return null;
    }
  };

  const shapeGroup = (shape: ShapeObject) => {
    const fields = shapeFields(shape);
    if (fields === null) return null;
    return (
      <div className="field-row" role="group" aria-label="Shape">
        {fields}
      </div>
    );
  };

  return (
    <div className="panel-live" data-testid="transform-panel">
      {single.type === "line" ? (
        <>
          <div className="field-row">
            <NumberField
              label="X1"
              value={single.x1}
              step={0.05}
              unit="in"
              disabled={locked}
              onCommit={(x1, editRun) =>
                commitGeometry({ x1, y1: single.y1, x2: single.x2, y2: single.y2 }, editRun)
              }
            />
            <NumberField
              label="Y1"
              value={single.y1}
              step={0.05}
              unit="in"
              disabled={locked}
              onCommit={(y1, editRun) =>
                commitGeometry({ x1: single.x1, y1, x2: single.x2, y2: single.y2 }, editRun)
              }
            />
          </div>
          <div className="field-row">
            <NumberField
              label="X2"
              value={single.x2}
              step={0.05}
              unit="in"
              disabled={locked}
              onCommit={(x2, editRun) =>
                commitGeometry({ x1: single.x1, y1: single.y1, x2, y2: single.y2 }, editRun)
              }
            />
            <NumberField
              label="Y2"
              value={single.y2}
              step={0.05}
              unit="in"
              disabled={locked}
              onCommit={(y2, editRun) =>
                commitGeometry({ x1: single.x1, y1: single.y1, x2: single.x2, y2 }, editRun)
              }
            />
          </div>
        </>
      ) : (
        <FrameGeometry object={single} locked={locked} onCommit={commitGeometry} />
      )}
      <div className="field-row">
        <NumberField
          label="Angle"
          value={rotation}
          step={1}
          unit="°"
          disabled={locked || isLine}
          onCommit={commitRotation}
        />
        <button
          type="button"
          aria-label="Rotate 90° CCW"
          disabled={locked || isLine}
          onClick={() => commitRotation(rotation - 90)}
        >
          ⟲ 90°
        </button>
        <button
          type="button"
          aria-label="Rotate 90° CW"
          disabled={locked || isLine}
          onClick={() => commitRotation(rotation + 90)}
        >
          ⟳ 90°
        </button>
        <button
          type="button"
          disabled={locked || isLine || rotation === 0}
          onClick={() => commitRotation(0)}
        >
          Reset rotation
        </button>
      </div>
      {single.type === "shape" && shapeGroup(single)}
      <label className="field">
        <input
          type="checkbox"
          aria-label="Locked"
          checked={locked}
          onChange={(e) =>
            dispatch(objectLockCommitted({ pageIndex, ids: [single.id], locked: e.target.checked }))
          }
        />
        Locked
      </label>
      {nudgeField}
    </div>
  );
}
