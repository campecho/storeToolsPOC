import type { EscherShapeTransform } from "./escher";
import type { MapResult } from "./mapper";
import type { ImportNote } from "./report";

/**
 * Flip correction (plan §10, the flip slice) — the second half of the fix
 * whose evidence escher.ts reads from the `.pub`. The conversion toolchain
 * folds a mirrored text box into a bare `librevenge:rotate: 180` (it keeps the
 * rotation component of rotation∘flips and drops the mirror), so those frames
 * arrive upside down while Publisher shows them upright. Here we correlate each
 * such frame back to its Escher shape by geometry and restore the box's TRUE
 * rotation, annotating the report so nothing changes silently (§10.3).
 *
 * This is a CORRECTION, not a degradation: fidelity counts are untouched, and
 * every restored frame gets one `kind: "corrected"` note. Correlation is
 * many-to-one on purpose — Publisher inherits a handful of master shapes across
 * dozens of pages, so many frames share one shape's geometry; we match each
 * frame independently and never consume a shape.
 *
 * HONEST FALLBACK: if escher.ts couldn't decode anchors, the shapes carry no
 * bbox, nothing correlates, and the result is returned unchanged — we never
 * guess a correction. The route also skips this entirely in fixture mode (the
 * demo trace is unrelated to the uploaded bytes).
 */

/** A frame is a fold candidate when its rotation sits on the 180° signature. */
const FOLD_ROTATION = 180;
const FOLD_EPSILON = 0.01;

/** Geometry-match tolerance for correlating a frame to an Escher shape (in). */
const BBOX_TOLERANCE = 0.05;

const CORRECTION_MESSAGE =
  "Mirrored text box restored upright — Publisher renders text in flipped boxes right-side up.";

/** Match the mapper's rotation normalization: [0, 360) rounded to 2 places. */
function normalizeDeg(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360;
  return Math.round(wrapped * 100) / 100;
}

/**
 * Restore mirrored text frames the conversion folded into a 180° rotation,
 * using the flip flags + anchor geometry read from the source `.pub`. Frames
 * with a real authored 180° rotation (tent cards) have no correlated flipped
 * shape and are left untouched; non-text objects are never modified.
 */
export function applyFlipCorrections(result: MapResult, shapes: EscherShapeTransform[]): MapResult {
  // Only mirrored shapes with a decodable anchor can anchor a correction.
  const flipped = shapes.filter((s) => (s.flipH || s.flipV) && s.bbox);
  if (flipped.length === 0) return result;

  // Escher anchors are page-center-relative (escher.ts); the mapped frame's
  // x/y are absolute page inches, so shift them to the same origin before
  // comparing. The page size the mapper derived from the trace is authoritative.
  const halfW = result.doc.size.w / 2;
  const halfH = result.doc.size.h / 2;

  const correlate = (fx: number, fy: number, fw: number, fh: number): EscherShapeTransform | undefined => {
    const cx = fx - halfW;
    const cy = fy - halfH;
    return flipped.find((s) => {
      const b = s.bbox!;
      return (
        Math.abs(cx - b.x) <= BBOX_TOLERANCE &&
        Math.abs(cy - b.y) <= BBOX_TOLERANCE &&
        Math.abs(fw - b.w) <= BBOX_TOLERANCE &&
        Math.abs(fh - b.h) <= BBOX_TOLERANCE
      );
    });
  };

  const newNotes: ImportNote[] = [];
  const pages = result.doc.pages.map((page) => {
    let pageChanged = false;
    const objects = page.objects.map((obj) => {
      if (obj.type !== "text") return obj; // lines + non-text frames never fold
      if (Math.abs(obj.rotation - FOLD_ROTATION) >= FOLD_EPSILON) return obj;
      const shape = correlate(obj.x, obj.y, obj.w, obj.h);
      if (!shape) return obj; // authored 180° with no mirror — leave it
      pageChanged = true;
      newNotes.push({
        kind: "corrected",
        tier: 2,
        objectId: obj.id,
        pageId: page.id,
        message: CORRECTION_MESSAGE,
      });
      return { ...obj, rotation: normalizeDeg(shape.rotationDeg) };
    });
    return pageChanged ? { ...page, objects } : page;
  });

  if (newNotes.length === 0) return result;
  return {
    ...result,
    doc: { ...result.doc, pages },
    notes: [...result.notes, ...newNotes],
  };
}
