import {
  CalloutTailAnchorSchema,
  FlowchartSymbolSchema,
  type CalloutTailAnchor,
  type FlowchartSymbol,
  type ShapeObject,
} from "../../core/model";
import {
  calloutTailCommitted,
  flowchartSymbolCommitted,
  inEditRun,
  objectPathClosedCommitted,
  roundedRectCornerRadiusCommitted,
  starPolygonInnerRadiusCommitted,
  starPolygonPointsCommitted,
} from "../../core/store";
import { useAppDispatch } from "../hooks";
import { NumberField } from "./NumberField";

/**
 * The shape's own geometry parameters — the Transform panel's per-kind group.
 *
 * Every option a shape tool offers before drawing is editable here after: the
 * parameters are stored on the object (SHAPE_GEOMETRY_FIELDS), so the panel
 * and the canvas adjust handles drive the SAME value through the same commit
 * action. Only the selected kind's own fields render; a rect has nothing to
 * parameterize and shows none.
 *
 * A path's closed state is the odd one out — it lives in `d`, not a
 * parameter — but it is the placed counterpart of the pen's autoClose option,
 * so it belongs with them rather than nowhere.
 */

/** Whether a path shape's segments close the ring. */
function isClosedPath(shape: ShapeObject): boolean {
  return shape.d?.[shape.d.length - 1]?.c === "Z";
}

export function ShapeFields({
  pageIndex,
  shape,
  disabled,
}: {
  pageIndex: number;
  shape: ShapeObject;
  /** Locked objects disable every geometry control (§5.3). */
  disabled: boolean;
}) {
  const dispatch = useAppDispatch();
  const ids = [shape.id];

  switch (shape.shape) {
    case "roundedRect":
      return (
        <NumberField
          label="Corner radius"
          value={shape.cornerRadius ?? 0}
          min={0}
          step={0.05}
          unit="in"
          disabled={disabled}
          onCommit={(radius, editRun) =>
            dispatch(
              inEditRun(roundedRectCornerRadiusCommitted({ pageIndex, ids, radius }), editRun),
            )
          }
        />
      );
    case "starPolygon":
      return (
        <div className="field-row">
          <NumberField
            label="Points"
            value={shape.points ?? 5}
            min={3}
            step={1}
            disabled={disabled}
            onCommit={(points, editRun) =>
              dispatch(inEditRun(starPolygonPointsCommitted({ pageIndex, ids, points }), editRun))
            }
          />
          <NumberField
            label="Inner radius"
            value={shape.innerRadiusRatio ?? 0.5}
            min={0}
            step={0.05}
            disabled={disabled}
            onCommit={(innerRadiusRatio, editRun) =>
              dispatch(
                inEditRun(
                  starPolygonInnerRadiusCommitted({ pageIndex, ids, innerRadiusRatio }),
                  editRun,
                ),
              )
            }
          />
        </div>
      );
    case "callout":
      return (
        <label className="field">
          Tail anchor
          <select
            aria-label="Tail anchor"
            value={shape.tailAnchor ?? "bottom-left"}
            disabled={disabled}
            onChange={(e) =>
              dispatch(
                calloutTailCommitted({
                  pageIndex,
                  ids,
                  tailAnchor: e.target.value as CalloutTailAnchor,
                }),
              )
            }
          >
            {CalloutTailAnchorSchema.options.map((anchor) => (
              <option key={anchor} value={anchor}>
                {anchor}
              </option>
            ))}
          </select>
        </label>
      );
    case "flowchart":
      return (
        <label className="field">
          Symbol
          <select
            aria-label="Symbol"
            value={shape.symbol ?? "process"}
            disabled={disabled}
            onChange={(e) =>
              dispatch(
                flowchartSymbolCommitted({
                  pageIndex,
                  ids,
                  symbol: e.target.value as FlowchartSymbol,
                }),
              )
            }
          >
            {FlowchartSymbolSchema.options.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
        </label>
      );
    case "path":
      return (
        <label className="field">
          <input
            type="checkbox"
            aria-label="Closed path"
            checked={isClosedPath(shape)}
            disabled={disabled}
            onChange={(e) =>
              dispatch(
                objectPathClosedCommitted({ pageIndex, ids, closed: e.target.checked }),
              )
            }
          />
          Closed path
        </label>
      );
    default:
      // rect and ellipse are their frame — nothing to parameterize.
      return null;
  }
}
