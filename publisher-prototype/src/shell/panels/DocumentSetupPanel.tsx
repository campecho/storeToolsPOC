import { objectAabb } from "../../core/hittest";
import type { Orientation } from "../../core/model";
import { effectivePageSetup } from "../../core/render/pageSetup";
import {
  documentSetupCommitted,
  pageSizeOverrideCommitted,
  selectDocument,
} from "../../core/store";
import { useAppDispatch, useAppSelector } from "../hooks";
import { NumberField } from "./NumberField";

/**
 * The live Document setup panel — the §1.4 page-size core (Phase B Document
 * structure group, first slice): document-level trim size, orientation,
 * bleed/margin/slug/columns, and the current page's size override, over the
 * panel commit discipline (one dispatch, one history entry).
 *
 * Orientation and size stay consistent both ways: committing a dimension
 * recomputes the orientation flag (square keeps the current one), and the
 * orientation toggle swaps the dimensions — each as ONE action, which is why
 * DocumentSetupCommit is a partial.
 *
 * Not wired in this slice, still specified by the registry card: units
 * beyond inches, size presets and Staples product sizes (seam), page
 * rotation, per-edge margins. The layout-impact warning (§1.4) is a live
 * count of objects extending past the current page's trim — continuous
 * rather than commit-time, so it also answers "did my resize strand
 * anything?" after undo/redo.
 */

/** Smallest committable page extent, inches — same floor as object W/H. */
const MIN_PAGE_EXTENT_IN = 0.001;

function orientationFor(w: number, h: number, current: Orientation): Orientation {
  if (w === h) return current;
  return w > h ? "landscape" : "portrait";
}

export function DocumentSetupPanel({ pageIndex }: { pageIndex: number }) {
  const dispatch = useAppDispatch();
  const doc = useAppSelector(selectDocument);
  const setup = effectivePageSetup(doc, pageIndex);
  const page = doc.pages[pageIndex];
  const hasOverride = page?.sizeOverride !== undefined;

  const commitDocSize = (w: number, h: number): void => {
    dispatch(
      documentSetupCommitted({
        size: { w, h },
        orientation: orientationFor(w, h, doc.orientation),
      }),
    );
  };

  const commitOverride = (w: number, h: number): void => {
    dispatch(pageSizeOverrideCommitted({ pageIndex, sizeOverride: { w, h } }));
  };

  /* §1.4 "warn when resizing may affect existing layout": objects whose
     rotation-aware bounds extend past the current page's trim box. */
  const outside = (page?.objects ?? []).filter((o) => {
    const box = objectAabb(o);
    return box.x < 0 || box.y < 0 || box.x + box.w > setup.size.w || box.y + box.h > setup.size.h;
  }).length;

  return (
    <div className="panel-live" data-testid="document-setup-panel">
      <div className="field-row">
        <NumberField
          label="Width"
          value={doc.size.w}
          min={MIN_PAGE_EXTENT_IN}
          step={0.125}
          unit="in"
          onCommit={(w) => commitDocSize(w, doc.size.h)}
        />
        <NumberField
          label="Height"
          value={doc.size.h}
          min={MIN_PAGE_EXTENT_IN}
          step={0.125}
          unit="in"
          onCommit={(h) => commitDocSize(doc.size.w, h)}
        />
      </div>
      <div className="field-row" role="radiogroup" aria-label="Orientation">
        {(["portrait", "landscape"] as const).map((o) => (
          <label key={o} className="field">
            <input
              type="radio"
              name="doc-orientation"
              checked={doc.orientation === o}
              onChange={() => {
                if (doc.orientation === o) return;
                /* One action: the flag and the swapped dimensions together. */
                dispatch(
                  documentSetupCommitted({
                    orientation: o,
                    size: { w: doc.size.h, h: doc.size.w },
                  }),
                );
              }}
            />
            {o}
          </label>
        ))}
      </div>
      <div className="field-row">
        <NumberField
          label="Bleed"
          value={doc.bleed}
          min={0}
          step={0.0625}
          unit="in"
          onCommit={(bleed) => dispatch(documentSetupCommitted({ bleed }))}
        />
        <NumberField
          label="Slug"
          value={doc.slug}
          min={0}
          step={0.0625}
          unit="in"
          onCommit={(slug) => dispatch(documentSetupCommitted({ slug }))}
        />
      </div>
      <div className="field-row">
        <NumberField
          label="Margin"
          value={doc.margin}
          min={0}
          step={0.0625}
          unit="in"
          onCommit={(margin) => dispatch(documentSetupCommitted({ margin }))}
        />
        <NumberField
          label="Columns"
          value={doc.columns}
          min={1}
          step={1}
          onCommit={(columns) => dispatch(documentSetupCommitted({ columns: Math.round(columns) }))}
        />
      </div>

      <p className="panel-note">
        This page {hasOverride ? "(size overridden)" : "(document size)"}
      </p>
      <div className="field-row">
        <NumberField
          label="Page width"
          value={setup.size.w}
          min={MIN_PAGE_EXTENT_IN}
          step={0.125}
          unit="in"
          onCommit={(w) => commitOverride(w, setup.size.h)}
        />
        <NumberField
          label="Page height"
          value={setup.size.h}
          min={MIN_PAGE_EXTENT_IN}
          step={0.125}
          unit="in"
          onCommit={(h) => commitOverride(setup.size.w, h)}
        />
      </div>
      {hasOverride && (
        <div className="field-row">
          <button
            type="button"
            onClick={() => dispatch(pageSizeOverrideCommitted({ pageIndex, sizeOverride: null }))}
          >
            Use document size
          </button>
        </div>
      )}
      {outside > 0 && (
        <p className="panel-note" role="status">
          {outside} object{outside === 1 ? "" : "s"} extend
          {outside === 1 ? "s" : ""} beyond the page — check layout after resizing.
        </p>
      )}
    </div>
  );
}
