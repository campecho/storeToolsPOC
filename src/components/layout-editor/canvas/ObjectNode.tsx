import { useEffect, useRef, useState } from "react";
import type { FrameObject, LayoutObject, PathSeg } from "@/schema";
import { inToPx } from "@/lib/layout/geometry";
import { bboxOf } from "@/lib/layout/objects";
import {
  arrowheadShape,
  dashPatternIn,
  headInsetIn,
  headLengthIn,
  trimmedSegment,
} from "@/lib/layout/line-decor";
import {
  isParametricShape,
  outlineOvershoot,
  shadedFill,
  shapeOutline,
  shapeShading,
} from "@/lib/layout/shape-paths";
import { isOverflowing, textContent } from "@/lib/layout/text";
import { useLayoutStore } from "@/store";
import { paraCss, runCss } from "./rich-text-dom";
import { useAssetUrl } from "@/lib/assets/use-asset-url";

/**
 * One document object at true scale (plan §3.2): rect / ellipse / picture /
 * text frames as positioned divs, lines as an SVG spanning their bbox, and
 * the parametric shape kinds merged from the publisher prototype (rounded
 * rect / star / callout / banner) as SVG outlines from `shapeOutline`.
 * Stroke widths and type scale with zoom (they're page ink, not chrome); a
 * picture frame renders its bound asset (L8) or the gray placeholder with a
 * mountain glyph — and a visible missing-asset state when the bytes are gone.
 * Text frames clip like print frames and raise the red overflow badge (plan
 * L5) when content exceeds them; an empty frame shows a faint dashed
 * affordance so it stays findable. The pane thumbnails reuse this component
 * with `withTestId={false}` so mini-renders never duplicate canvas testids.
 *
 * Parametric shapes take pointer events on the OUTLINE (fill region +
 * stroke), not the frame box — a star's empty corners and the space beside a
 * callout tail let clicks fall through to what's beneath, matching the
 * prototype's outline hit-testing. Lines render their merged decorations:
 * dash pattern, arrow/circle/diamond heads, and the stroke trimmed back so
 * it meets a pointed head instead of spilling past it.
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
  // Import-autofit render scale (schema text.fontScale): mirrors Publisher's
  // shrink-on-overflow. Declared run sizes stay the source of truth — this
  // scales rendered px only, so every runCss below takes it as the 3rd arg.
  const scale = text.fontScale ?? 1;
  // Webfonts land after first paint — the shell bumps this when new faces
  // finish loading (§10.5), so overflow re-measures with real metrics.
  const fontsTick = useLayoutStore((s) => s.fontsTick);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    // Reads the RENDERED contentRef, so the autofit scale is already baked
    // into scrollHeight — the badge stays consistent with no separate term.
    // The cushion scales with zoom (plus int-rounding allowance): a borderline
    // frame the import check accepted at zoom 1 must not sprout a badge at
    // 247% just because its subpixel line-box spill scaled past a fixed 1px.
    setOverflow(isOverflowing(el.scrollHeight, el.clientHeight, 2 + 2 * zoom));
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
            // the div carries its first run's (scaled) size so empty lines keep height
            <div key={pi} style={{ ...paraCss(p, zoom), fontSize: runCss(p.runs[0], zoom, scale).fontSize }}>
              {p.runs.map((r, ri) => (
                <span key={ri} style={runCss(r, zoom, scale)}>
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
  /** Text frames: open the contentEditable overlay (plan L5). Picture frames:
      round-trip into the Photo Editor (PE8, F2). */
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
    // Decorations (merged from the prototype): head geometry is in page
    // inches; the stroke width feeds it in px-at-zoom-1 (the schema's unit).
    const headLen = headLengthIn(obj.headSize, obj.stroke.width);
    const angleEnd = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
    const startHead = arrowheadShape(
      obj.headStart,
      { x: obj.x1, y: obj.y1 },
      angleEnd + Math.PI,
      headLen,
    );
    const endHead = arrowheadShape(obj.headEnd, { x: obj.x2, y: obj.y2 }, angleEnd, headLen);
    const [t1, t2] = trimmedSegment(
      { x: obj.x1, y: obj.y1 },
      { x: obj.x2, y: obj.y2 },
      headInsetIn(obj.headStart, headLen),
      headInsetIn(obj.headEnd, headLen),
    );
    const dashIn = dashPatternIn(obj.dash, obj.stroke.width);
    const headPad = startHead || endHead ? inToPx(headLen, zoom) : 0;
    const pad = strokePx / 2 + 5 + headPad; // stroke + grabbable halo + head room
    const w = inToPx(b.w, zoom);
    const h = inToPx(b.h, zoom);
    // page inches → this svg's local px
    const lx = (v: number) => inToPx(v - b.x, zoom) + pad;
    const ly = (v: number) => inToPx(v - b.y, zoom) + pad;
    const heads = [
      { head: startHead, key: "start" },
      { head: endHead, key: "end" },
    ];
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
          x1={lx(obj.x1)}
          y1={ly(obj.y1)}
          x2={lx(obj.x2)}
          y2={ly(obj.y2)}
          stroke="transparent"
          strokeWidth={Math.max(10, strokePx)}
          pointerEvents={interactive ? "stroke" : "none"}
        />
        <line
          x1={lx(t1.x)}
          y1={ly(t1.y)}
          x2={lx(t2.x)}
          y2={ly(t2.y)}
          stroke={obj.stroke.color}
          strokeWidth={strokePx}
          strokeDasharray={dashIn?.map((v) => inToPx(v, zoom)).join(" ")}
          pointerEvents="none"
        />
        {heads.map(({ head, key }) =>
          head === null ? null : head.kind === "circle" ? (
            <circle
              key={key}
              data-testid={withTestId ? `line-head-${key}` : undefined}
              cx={lx(head.center.x)}
              cy={ly(head.center.y)}
              r={inToPx(head.radius, zoom)}
              fill={obj.stroke.color}
              pointerEvents="none"
            />
          ) : (
            <polygon
              key={key}
              data-testid={withTestId ? `line-head-${key}` : undefined}
              points={head.points.map((p) => `${lx(p.x)},${ly(p.y)}`).join(" ")}
              fill={obj.stroke.color}
              pointerEvents="none"
            />
          ),
        )}
      </svg>
    );
  }

  if (isParametricShape(obj)) {
    const w = Math.max(inToPx(obj.w, zoom), 1);
    const h = Math.max(inToPx(obj.h, zoom), 1);
    // The callout's tail reaches outside the frame box — extend the svg
    // canvas over the overshoot so the tail both renders AND takes clicks.
    const overshoot = outlineOvershoot(obj);
    const ex0 = Math.min(0, ...overshoot.map((p) => p.x));
    const ey0 = Math.min(0, ...overshoot.map((p) => p.y));
    const ex1 = Math.max(1, ...overshoot.map((p) => p.x));
    const ey1 = Math.max(1, ...overshoot.map((p) => p.y));
    const strokeW = obj.stroke ? obj.stroke.width * zoom : 0;
    const outline = pathData(shapeOutline(obj, obj.w, obj.h), w, h);
    const shading = obj.fill ? pathData(shapeShading(obj, obj.w, obj.h), w, h) : "";
    return (
      <div
        data-testid={withTestId ? `object-${obj.type}` : undefined}
        className="pointer-events-none absolute"
        style={{
          left: inToPx(obj.x, zoom),
          top: inToPx(obj.y, zoom),
          width: w,
          height: h,
          transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
        }}
      >
        <svg
          className="absolute overflow-visible"
          style={{
            left: ex0 * w,
            top: ey0 * h,
            width: (ex1 - ex0) * w,
            height: (ey1 - ey0) * h,
          }}
        >
          <g transform={`translate(${-ex0 * w}, ${-ey0 * h})`}>
            <path
              d={outline}
              fill={obj.fill ?? "none"}
              fillRule="evenodd"
              stroke={obj.stroke?.color}
              strokeWidth={strokeW || undefined}
              className={interactive ? "cursor-move" : undefined}
              pointerEvents={interactive ? "visiblePainted" : "none"}
              onPointerDown={interactive ? onPointerDown : undefined}
              onDoubleClick={interactive ? onDoubleClick : undefined}
            />
            {shading && (
              <path
                d={shading}
                fill={shadedFill(obj.fill!)}
                fillRule="evenodd"
                stroke={obj.stroke?.color}
                strokeWidth={strokeW || undefined}
                pointerEvents="none"
              />
            )}
          </g>
        </svg>
      </div>
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
      // Picture frames double-click into the Photo Editor (PE8, F2); the handler
      // no-ops for rect/ellipse, so wiring it here is harmless for those.
      onDoubleClick={interactive ? onDoubleClick : undefined}
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
