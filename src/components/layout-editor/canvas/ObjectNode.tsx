import type { LayoutObject } from "@/schema";
import { inToPx } from "@/lib/layout/geometry";
import { bboxOf } from "@/lib/layout/objects";

/**
 * One document object at true scale (plan §3.2): rect / ellipse / picture
 * frames as positioned divs, lines as an SVG spanning their bbox. Stroke
 * widths scale with zoom (they're page ink, not chrome). The picture frame is
 * the gray placeholder with a mountain glyph — real image import is deferred.
 */
export function ObjectNode({
  obj,
  zoom,
  interactive,
  onPointerDown,
}: {
  obj: LayoutObject;
  zoom: number;
  /** True under the Select tool — the object takes pointer-downs and shows a move cursor. */
  interactive: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  if (obj.type === "line") {
    const b = bboxOf(obj);
    const strokePx = obj.stroke.width * zoom;
    const pad = strokePx / 2 + 5; // room for the stroke + a grabbable halo
    const w = inToPx(b.w, zoom);
    const h = inToPx(b.h, zoom);
    return (
      <svg
        data-testid="object-line"
        className={`absolute overflow-visible ${interactive ? "cursor-move" : "pointer-events-none"}`}
        style={{
          left: inToPx(b.x, zoom) - pad,
          top: inToPx(b.y, zoom) - pad,
          width: Math.max(w + pad * 2, 1),
          height: Math.max(h + pad * 2, 1),
        }}
        onPointerDown={interactive ? onPointerDown : undefined}
      >
        {/* wide invisible twin so a hairline is still grabbable */}
        <line
          x1={inToPx(obj.x1 - b.x, zoom) + pad}
          y1={inToPx(obj.y1 - b.y, zoom) + pad}
          x2={inToPx(obj.x2 - b.x, zoom) + pad}
          y2={inToPx(obj.y2 - b.y, zoom) + pad}
          stroke="transparent"
          strokeWidth={Math.max(10, strokePx)}
          pointerEvents={interactive ? "stroke" : "none"}
        />
        <line
          x1={inToPx(obj.x1 - b.x, zoom) + pad}
          y1={inToPx(obj.y1 - b.y, zoom) + pad}
          x2={inToPx(obj.x2 - b.x, zoom) + pad}
          y2={inToPx(obj.y2 - b.y, zoom) + pad}
          stroke={obj.stroke.color}
          strokeWidth={strokePx}
          pointerEvents="none"
        />
      </svg>
    );
  }

  const strokePx = obj.stroke ? obj.stroke.width * zoom : 0;
  return (
    <div
      data-testid={`object-${obj.type}`}
      className={`absolute ${obj.type === "ellipse" ? "rounded-full" : ""} ${
        interactive ? "cursor-move" : "pointer-events-none"
      }`}
      style={{
        left: inToPx(obj.x, zoom),
        top: inToPx(obj.y, zoom),
        width: inToPx(obj.w, zoom),
        height: inToPx(obj.h, zoom),
        backgroundColor: obj.fill ?? "transparent",
        border: obj.stroke ? `${strokePx}px solid ${obj.stroke.color}` : undefined,
        transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
      }}
      onPointerDown={interactive ? onPointerDown : undefined}
    >
      {obj.type === "picture" && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9a9a9a"
          strokeWidth="1.4"
          strokeLinejoin="round"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: Math.min(inToPx(obj.w, zoom), inToPx(obj.h, zoom)) * 0.35,
            height: Math.min(inToPx(obj.w, zoom), inToPx(obj.h, zoom)) * 0.35,
          }}
        >
          <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="M5 17l4.5-4 3.5 2.6 3-2.4 3 3" />
        </svg>
      )}
    </div>
  );
}
