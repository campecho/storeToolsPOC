import type { LayoutDocument, LayoutObject, LayoutPage } from "@/schema";
import { effectivePageSize, inToPx } from "@/lib/layout/geometry";
import { flattenPage } from "@/lib/layout/layers";
import { ObjectNode } from "../canvas/ObjectNode";

/**
 * Live pages-pane thumbnails (plan L6): a true mini-render of the page model
 * — the same ObjectNode tree the canvas draws, laid out at reference zoom 1
 * and CSS-scaled into the tile, so the thumbnail can't drift from the page.
 * Tiles contain-fit an 88 × 114 budget by default (the wire's tile is exactly
 * Letter at that fit); surfaces that need a bigger read — the import report's
 * review preview — pass their own budget. The active page carries the wire's
 * red border and numeral. The tile is sized from the page's *effective* size
 * (plan L12), so an overridden page reads true-shape in the navigator.
 */

export const THUMB_MAX_W = 88;
export const THUMB_MAX_H = 114;

export function thumbScale(
  size: { w: number; h: number },
  budget: { w: number; h: number } = { w: THUMB_MAX_W, h: THUMB_MAX_H },
): number {
  return Math.min(budget.w / inToPx(size.w, 1), budget.h / inToPx(size.h, 1));
}

/** Objects at zoom 1, scaled down as one layer. `withTestId={false}` keeps
 *  mini-render nodes out of the canvas testid namespace. */
export function MiniRender({
  size,
  objects,
  budget,
}: {
  /** The page's effective size in inches (plan L12). */
  size: { w: number; h: number };
  objects: LayoutObject[];
  /** Contain-fit budget in px; defaults to the pages-pane tile. */
  budget?: { w: number; h: number };
}) {
  const scale = thumbScale(size, budget);
  return (
    <div
      className="pointer-events-none relative overflow-hidden bg-white"
      style={{ width: inToPx(size.w, 1) * scale, height: inToPx(size.h, 1) * scale }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `scale(${scale})`,
          width: inToPx(size.w, 1),
          height: inToPx(size.h, 1),
        }}
      >
        {objects.map((o) => (
          <ObjectNode key={o.id} obj={o} zoom={1} interactive={false} withTestId={false} />
        ))}
      </div>
    </div>
  );
}

export function PageThumb({
  doc,
  page,
  index,
  active,
  removable,
  onSelect,
  onRemove,
  budget,
}: {
  doc: LayoutDocument;
  page: LayoutPage;
  /** Zero-based position — shown (and test-addressed) one-based. */
  index: number;
  active: boolean;
  /** False on the last remaining page — a publication keeps at least one. */
  removable: boolean;
  onSelect: () => void;
  onRemove: () => void;
  /** Contain-fit budget in px; defaults to the pages-pane tile. */
  budget?: { w: number; h: number };
}) {
  const master = page.masterId ? doc.masters.find((m) => m.id === page.masterId) : undefined;
  // master furniture beneath page objects — the same stacking as the canvas
  const objects = [...(master?.objects ?? []), ...flattenPage(page)];
  const size = effectivePageSize(doc, page);

  return (
    <div className="group relative flex flex-col items-center gap-[5px]">
      <button
        type="button"
        data-testid={`page-thumb-${index + 1}`}
        aria-current={active ? "page" : undefined}
        aria-label={`Page ${index + 1}`}
        onClick={onSelect}
        className={`cursor-pointer overflow-hidden rounded-[3px] bg-white ${
          active
            ? "border-[1.5px] border-brand shadow-[0_1px_3px_rgba(0,0,0,.14)]"
            : "border border-[#dcdcdc] hover:border-[#b8b8b8]"
        }`}
      >
        <MiniRender size={size} objects={objects} budget={budget} />
      </button>
      {removable && (
        <button
          type="button"
          data-testid={`page-remove-${index + 1}`}
          aria-label={`Remove page ${index + 1}`}
          title="Remove page"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -right-[6px] -top-[6px] z-10 hidden h-[15px] w-[15px] cursor-pointer items-center justify-center rounded-full border border-[#cfcfcf] bg-white text-[9px] leading-none text-[#888] hover:border-brand hover:text-brand group-hover:flex"
        >
          ✕
        </button>
      )}
      <div
        className={`${budget && budget.w > THUMB_MAX_W ? "text-[14px]" : "text-[11px]"} ${
          active ? "font-semibold text-brand" : "text-[#6b6b6b]"
        }`}
      >
        {index + 1}
      </div>
    </div>
  );
}
