import type { LayoutObject } from "@/schema";
import { inToPx } from "@/lib/layout/geometry";
import { bboxOf, type HandleDir } from "@/lib/layout/objects";

/**
 * Selection chrome (plan §3.2): brand frame + 8 resize handles around a
 * frame's bbox, endpoint handles for a line. Handles are fixed-px chrome;
 * only they take pointer events — the frame itself lets drags fall through
 * to the object underneath.
 */

const HANDLE = 9;

const FRAME_HANDLES: { dir: HandleDir; fx: number; fy: number; cursor: string }[] = [
  { dir: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { dir: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { dir: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { dir: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { dir: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { dir: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { dir: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { dir: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];

export function SelectionOverlay({
  obj,
  zoom,
  onHandleDown,
  onEndpointDown,
}: {
  obj: LayoutObject;
  zoom: number;
  onHandleDown: (dir: HandleDir, e: React.PointerEvent) => void;
  onEndpointDown: (which: "p1" | "p2", e: React.PointerEvent) => void;
}) {
  if (obj.type === "line") {
    return (
      <>
        {(["p1", "p2"] as const).map((which) => (
          <div
            key={which}
            data-testid={`handle-${which}`}
            onPointerDown={(e) => onEndpointDown(which, e)}
            className="absolute rounded-full border border-brand bg-white"
            style={{
              width: HANDLE,
              height: HANDLE,
              left: inToPx(which === "p1" ? obj.x1 : obj.x2, zoom) - HANDLE / 2,
              top: inToPx(which === "p1" ? obj.y1 : obj.y2, zoom) - HANDLE / 2,
              cursor: "move",
            }}
          />
        ))}
      </>
    );
  }

  const b = bboxOf(obj);
  const x = inToPx(b.x, zoom);
  const y = inToPx(b.y, zoom);
  const w = inToPx(b.w, zoom);
  const h = inToPx(b.h, zoom);

  return (
    <div
      data-testid="selection-frame"
      className="pointer-events-none absolute"
      style={{ left: x - 1, top: y - 1, width: w + 2, height: h + 2 }}
    >
      <div className="absolute inset-0 border-[1.5px] border-brand" />
      {FRAME_HANDLES.map(({ dir, fx, fy, cursor }) => (
        <div
          key={dir}
          data-testid={`handle-${dir}`}
          onPointerDown={(e) => onHandleDown(dir, e)}
          className="pointer-events-auto absolute border border-brand bg-white"
          style={{
            width: HANDLE,
            height: HANDLE,
            left: fx * (w + 2) - HANDLE / 2,
            top: fy * (h + 2) - HANDLE / 2,
            cursor,
          }}
        />
      ))}
    </div>
  );
}
