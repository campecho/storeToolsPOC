import { Fragment } from "react";
import type { LayoutDocument } from "@/schema";
import { columnGuides, inToPx } from "@/lib/layout/geometry";

/**
 * The true-scale publication page (plan §3.5): a white sheet sized
 * `inches × 96 × zoom`, with the bleed outline offset by `bleed × scale`, the
 * margin box inset by `margin × scale`, and center/column guides derived from
 * the model. Objects render inside it from L4. Dash weights stay fixed-px
 * chrome — they mark positions, they aren't page geometry. (The wire's four
 * bleed corner marks came out in the L8 declutter.)
 */
export function PageSurface({
  doc,
  zoom,
  guidesVisible,
  children,
}: {
  doc: LayoutDocument;
  zoom: number;
  guidesVisible: boolean;
  /** The object layer + selection chrome, positioned in page coordinates. */
  children?: React.ReactNode;
}) {
  const w = inToPx(doc.size.w, zoom);
  const h = inToPx(doc.size.h, zoom);
  const bleedPx = inToPx(doc.bleed, zoom);
  const marginPx = inToPx(doc.margin, zoom);
  const gutters = columnGuides(doc);

  return (
    <div
      data-testid="publication-page"
      className="relative bg-white shadow-[0_3px_16px_rgba(0,0,0,.22)]"
      style={{
        width: w,
        height: h,
        outline: "1.5px dashed var(--color-brand)",
        outlineOffset: bleedPx,
      }}
    >
      {/* margin / safe area */}
      <div
        data-testid="margin-box"
        className="pointer-events-none absolute border border-dashed border-guide"
        style={{ inset: marginPx }}
      />

      {guidesVisible && (
        <>
          {/* center guides — the vertical one yields to column gutters at 2+ columns */}
          {doc.columns < 2 && (
            <div
              data-testid="center-guide-v"
              className="pointer-events-none absolute w-px bg-guide opacity-50"
              style={{ left: w / 2, top: marginPx, bottom: marginPx }}
            />
          )}
          <div
            data-testid="center-guide-h"
            className="pointer-events-none absolute h-px bg-guide opacity-[.35]"
            style={{ top: h / 2, left: marginPx, right: marginPx }}
          />
          {gutters.map(([left, right], i) => (
            <Fragment key={i}>
              <div
                data-testid="column-guide"
                className="pointer-events-none absolute w-px bg-guide opacity-50"
                style={{ left: inToPx(left, zoom), top: marginPx, bottom: marginPx }}
              />
              <div
                data-testid="column-guide"
                className="pointer-events-none absolute w-px bg-guide opacity-50"
                style={{ left: inToPx(right, zoom), top: marginPx, bottom: marginPx }}
              />
            </Fragment>
          ))}
        </>
      )}

      {children}
    </div>
  );
}
