import { useEffect, useRef, useState } from "react";
import type { FrameObject, LayoutObject, PathSeg } from "@/schema";
import { inToPx } from "@/lib/layout/geometry";
import { bboxOf } from "@/lib/layout/objects";
import { isOverflowing, textContent } from "@/lib/layout/text";
import { useLayoutStore } from "@/store";
import { paraCss, runCss } from "./rich-text-dom";
import { useAssetUrl } from "@/lib/assets/use-asset-url";

/**
 * One document object at true scale (plan §3.2): rect / ellipse / picture /
 * text frames as positioned divs, lines as an SVG spanning their bbox.
 * Stroke widths and type scale with zoom (they're page ink, not chrome); a
 * picture frame renders its bound asset (L8) or the gray placeholder with a
 * mountain glyph — and a visible missing-asset state when the bytes are gone.
 * Text frames clip like print frames and raise the red overflow badge (plan
 * L5) when content exceeds them; an empty frame shows a faint dashed
 * affordance so it stays findable. The pane thumbnails reuse this component
 * with `withTestId={false}` so mini-renders never duplicate canvas testids.
 */

/** Normalized (0–1) path segments → SVG path data at pixel size (schema v2). */
function pathData(segs: PathSeg[], w: number, h: number): string {
  const n = (v: number) => Math.round(v * 1000) / 1000;
  return segs
    .map((s) => {
      if (s.c === "Z") return "Z";
      if (s.c === "C")
        return `C ${n(s.x1 * w)} ${n(s.y1 * h)}, ${n(s.x2 * w)} ${n(s.y2 * h)}, ${n(s.x * w)} ${n(s.y * h)}`;
      return `${s.c} ${n(s.x * w)} ${n(s.y * h)}`;
    })
    .join(" ");
}

function MountainGlyph({ px }: { px: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9a9a9a"
      strokeWidth="1.4"
      strokeLinejoin="round"
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: px, height: px }}
    >
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M5 17l4.5-4 3.5 2.6 3-2.4 3 3" />
    </svg>
  );
}

/**
 * Picture frame content (L8): the bound image fit to the frame — cover by
 * default (the L8 upload default), or the frame's `fit` mode when set (imports
 * emit "stretch") — the placeholder glyph when unbound, or the missing-asset
 * state when the id has no bytes behind it.
 */
function PictureFill({
  assetId,
  fit,
  glyphPx,
  withTestId,
}: {
  assetId?: string;
  fit?: FrameObject["fit"];
  glyphPx: number;
  withTestId: boolean;
}) {
  const url = useAssetUrl(assetId);
  // absent/"cover" fills and crops (the default); "stretch" distorts to the
  // frame exactly (Publisher's scaling); "contain" fits without cropping.
  const objectFit =
    fit === "stretch" ? "object-fill" : fit === "contain" ? "object-contain" : "object-cover";
  if (!assetId) return <MountainGlyph px={glyphPx} />;
  if (url === undefined) return null; // resolving — never flash the placeholder
  if (url === null) {
    return (
      <div
        data-testid={withTestId ? "picture-missing" : undefined}
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#f3f3f3]"
      >
        <div className="relative" style={{ width: glyphPx, height: glyphPx }}>
          <MountainGlyph px={glyphPx} />
        </div>
        <span className="text-[9px] text-[#9a9a9a]">Image missing</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- object URLs can't go through next/image
    <img
      src={url}
      alt=""
      draggable={false}
      data-testid={withTestId ? "picture-image" : undefined}
      className={`pointer-events-none absolute inset-0 h-full w-full ${objectFit}`}
    />
  );
}

function TextFrameNode({
  obj,
  zoom,
  interactive,
  editing,
  withTestId,
  onPointerDown,
  onDoubleClick,
}: {
  obj: FrameObject;
  zoom: number;
  interactive: boolean;
  editing: boolean;
  withTestId: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onDoubleClick?: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const text = obj.text!;
  // Webfonts land after first paint — the shell bumps this when new faces
  // finish loading (§10.5), so overflow re-measures with real metrics.
  const fontsTick = useLayoutStore((s) => s.fontsTick);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    setOverflow(isOverflowing(el.scrollHeight, el.clientHeight));
  }, [text, obj.w, obj.h, zoom, fontsTick]);

  const strokePx = obj.stroke ? obj.stroke.width * zoom : 0;
  const insetPx = (v: number | undefined) => (v ? inToPx(v, zoom) : 0);
  const vJustify =
    text.vAlign === "middle" ? "center" : text.vAlign === "bottom" ? "flex-end" : "flex-start";
  return (
    <div
      data-testid={withTestId ? "object-text" : undefined}
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
      {textContent(text) === "" && !editing && (
        <div className="pointer-events-none absolute inset-0 border border-dashed border-[#c9c9c9]" />
      )}
      <div
        className="flex h-full w-full flex-col overflow-hidden"
        style={{
          paddingLeft: insetPx(text.inset?.l),
          paddingRight: insetPx(text.inset?.r),
          paddingTop: insetPx(text.inset?.t),
          paddingBottom: insetPx(text.inset?.b),
          justifyContent: vJustify,
          visibility: editing ? "hidden" : undefined,
        }}
      >
        <div
          ref={contentRef}
          data-testid={withTestId ? "text-content" : undefined}
          className="max-h-full whitespace-pre-wrap break-words"
        >
          {text.paragraphs.map((p, pi) => (
            // the div carries its first run's size so empty lines keep height
            <div key={pi} style={{ ...paraCss(p, zoom), fontSize: runCss(p.runs[0], zoom).fontSize }}>
              {p.runs.map((r, ri) => (
                <span key={ri} style={runCss(r, zoom)}>
                  {r.text}
                </span>
              ))}
              {/* an empty paragraph still occupies its line */}
              {p.runs.every((r) => r.text === "") && <br />}
            </div>
          ))}
        </div>
      </div>
      {overflow && !editing && (
        <div
          data-testid={withTestId ? "overflow-badge" : undefined}
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
  withTestId = true,
  onPointerDown,
  onDoubleClick,
}: {
  obj: LayoutObject;
  zoom: number;
  /** True under the Select tool — the object takes pointer-downs and shows a move cursor. */
  interactive: boolean;
  /** This text frame has the edit overlay open — hide its static text. */
  editing?: boolean;
  /** False in pane thumbnails, so mini-renders don't duplicate canvas testids (L6). */
  withTestId?: boolean;
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
        withTestId={withTestId}
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
        data-testid={withTestId ? "object-line" : undefined}
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

  if (obj.type === "path" && obj.d) {
    const w = Math.max(inToPx(obj.w, zoom), 1);
    const h = Math.max(inToPx(obj.h, zoom), 1);
    const d = pathData(obj.d, w, h);
    const strokeW = obj.stroke ? obj.stroke.width * zoom : 0;
    return (
      <div
        data-testid={withTestId ? "object-path" : undefined}
        className={`absolute ${interactive ? "cursor-move" : "pointer-events-none"}`}
        style={{
          left: inToPx(obj.x, zoom),
          top: inToPx(obj.y, zoom),
          width: w,
          height: h,
          transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
        }}
        onPointerDown={interactive ? onPointerDown : undefined}
      >
        <svg width={w} height={h} className="overflow-visible">
          <path
            d={d}
            fill={obj.fill ?? "none"}
            fillRule="evenodd"
            stroke={obj.stroke?.color}
            strokeWidth={strokeW || undefined}
          />
        </svg>
      </div>
    );
  }

  const strokePx = obj.stroke ? obj.stroke.width * zoom : 0;
  return (
    <div
      data-testid={withTestId ? `object-${obj.type}` : undefined}
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
        <PictureFill
          assetId={obj.assetId}
          fit={obj.fit}
          glyphPx={Math.min(inToPx(obj.w, zoom), inToPx(obj.h, zoom)) * 0.35}
          withTestId={withTestId}
        />
      )}
    </div>
  );
}
