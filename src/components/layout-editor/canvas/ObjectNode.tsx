import { useEffect, useRef, useState } from "react";
import type { FrameObject, LayoutObject } from "@/schema";
import { inToPx } from "@/lib/layout/geometry";
import { bboxOf } from "@/lib/layout/objects";
import { fontStack, isOverflowing, ptToPx } from "@/lib/layout/text";

/**
 * One document object at true scale (plan §3.2): rect / ellipse / picture /
 * text frames as positioned divs, lines as an SVG spanning their bbox.
 * Stroke widths and type scale with zoom (they're page ink, not chrome); the
 * picture frame is the gray placeholder with a mountain glyph. Text frames
 * clip like print frames and raise the red overflow badge (plan L5) when
 * content exceeds them; an empty frame shows a faint dashed affordance so
 * it stays findable.
 */

function TextFrameNode({
  obj,
  zoom,
  interactive,
  editing,
  onPointerDown,
  onDoubleClick,
}: {
  obj: FrameObject;
  zoom: number;
  interactive: boolean;
  editing: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onDoubleClick?: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const text = obj.text!;

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    setOverflow(isOverflowing(el.scrollHeight, el.clientHeight));
  }, [text, obj.w, obj.h, zoom]);

  const strokePx = obj.stroke ? obj.stroke.width * zoom : 0;
  return (
    <div
      data-testid="object-text"
      className={`absolute ${interactive ? "cursor-move" : "pointer-events-none"}`}
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
      onDoubleClick={interactive ? onDoubleClick : undefined}
    >
      {text.content === "" && !editing && (
        <div className="pointer-events-none absolute inset-0 border border-dashed border-[#c9c9c9]" />
      )}
      <div
        ref={contentRef}
        data-testid="text-content"
        className="h-full w-full overflow-hidden whitespace-pre-wrap break-words"
        style={{
          fontFamily: fontStack(text.font.family),
          fontSize: ptToPx(text.font.size, zoom),
          fontWeight: text.font.bold ? 700 : 400,
          fontStyle: text.font.italic ? "italic" : undefined,
          textDecoration: text.font.underline ? "underline" : undefined,
          textAlign: text.align,
          lineHeight: text.lineSpacing,
          color: "#111111", // v1 ink — per-run color is the schema-v2 delta (§9)
          visibility: editing ? "hidden" : undefined,
        }}
      >
        {text.content}
      </div>
      {overflow && !editing && (
        <div
          data-testid="overflow-badge"
          title="Text overflows the frame"
          className="pointer-events-none absolute z-10 flex h-4 w-4 items-center justify-center rounded-[3px] bg-brand text-[10px] font-bold leading-none text-white"
          // right of bottom-center so the selection's south handle never hides it
          style={{ bottom: -8, left: "calc(50% + 10px)" }}
        >
          ⋯
        </div>
      )}
    </div>
  );
}

export function ObjectNode({
  obj,
  zoom,
  interactive,
  editing = false,
  onPointerDown,
  onDoubleClick,
}: {
  obj: LayoutObject;
  zoom: number;
  /** True under the Select tool — the object takes pointer-downs and shows a move cursor. */
  interactive: boolean;
  /** This text frame has the edit overlay open — hide its static text. */
  editing?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  /** Text frames: open the contentEditable overlay (plan L5). */
  onDoubleClick?: () => void;
}) {
  if (obj.type === "text" && obj.text) {
    return (
      <TextFrameNode
        obj={obj}
        zoom={zoom}
        interactive={interactive}
        editing={editing}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      />
    );
  }
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
