"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { RenderFormat } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";
import { useLayoutStore } from "@/store";
import { downloadBlob, isRenderError, renderPhoto } from "@/lib/photo/client";
import { openInLayoutEditor } from "@/lib/photo/layout-handoff";

/**
 * Export panel (wire Section B "Export", ~lines 397–434). Mounts in the
 * ContextPanel body while the Export tool is active.
 *
 * PE5 scope: the full format grid is LIVE — JPG/PNG (screen) and TIFF/PDF·print
 * (the print pair, which carry the print-colour + MediaBox/TrimBox/BleedBox math).
 * The intent segment is LIVE and reflects the document (dev #6): sRGB / CMYK·GRACoL
 * both flip `target.intent` via setIntent; for an RGB arrival still on sRGB intent
 * with a print format selected, a prominent one-click "Convert to CMYK (GRACoL) →"
 * line appears (the same affordance the strip carries). PNG can't carry CMYK, so
 * PNG + CMYK-intent shows an honest note. Save-back (dev #4) and the imposition
 * send-to (dev #9) stay drawn-but-inert.
 *
 * "Open in Layout Editor" is LIVE (PE7): it flattens the applied recipe to a PNG,
 * registers + places it as a layout asset, and navigates — with an inline confirm
 * gate (never a browser dialog) when the layout document already has content, so a
 * photo is never dropped onto a busy page unannounced (PubConvertCallout pattern).
 *
 * The export flow is fire-and-forget from the UI's point of view: setRendering
 * flips a session flag (status-bar chip + this button's guard), the fetch runs
 * async, and the canvas/shell stay fully interactive throughout.
 */

const WF_H = "text-[11px] font-semibold uppercase tracking-[0.04em] text-[#5f5f5f]";

/** Layout document carries placed content on any page or master — mirrors
    PubConvertCallout's gate. The handoff lands the photo on the current page, so
    a non-empty layout document earns a confirm first. */
function layoutDocHasContent(): boolean {
  const doc = useLayoutStore.getState().doc;
  return doc.pages.some((p) => p.objects.length > 0) || doc.masters.some((m) => m.objects.length > 0);
}

/** Inline state for the "Open in Layout Editor" handoff (PubConvertCallout phases,
    kept in-panel rather than a browser dialog). */
type HandoffPhase =
  | { kind: "idle" }
  | { kind: "confirm"; docName: string }
  | { kind: "busy" }
  | { kind: "error"; message: string };

/** Quality slider bounds (JPG only) — matches the contract default of 90. */
const QUALITY_MIN = 60;
const QUALITY_MAX = 100;
const QUALITY_DEFAULT = 90;

export function ExportPanel() {
  const router = useRouter();
  const doc = usePhotoStore((s) => s.doc);
  const rendering = usePhotoStore((s) => s.rendering);
  const setRendering = usePhotoStore((s) => s.setRendering);
  const setIntent = usePhotoStore((s) => s.setIntent);

  const [format, setFormat] = useState<RenderFormat>("jpeg");
  const [quality, setQuality] = useState(QUALITY_DEFAULT);
  const [error, setError] = useState<string | null>(null);
  const [postNote, setPostNote] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<HandoffPhase>({ kind: "idle" });

  if (!doc) return null;

  const intent = doc.target.intent;
  // PNG is lossless — Quality only applies to JPG (plan: "Selecting PNG
  // hides/disables Quality"); TIFF/PDF ignore it too (schema: JPEG-only).
  const qualityVisible = format === "jpeg";
  const isPrintFormat = format === "tiff" || format === "pdf";
  // The one-click convert appears only where it applies: an RGB arrival still on
  // sRGB intent, exporting a print format (dev #6).
  const showConvert = doc.source.colorSpace === "rgb" && intent === "srgb" && isPrintFormat;
  // PNG can't carry CMYK — say so honestly instead of silently downgrading.
  const showPngCmykNote = format === "png" && intent === "cmyk";

  async function onExport() {
    // Double-click guard: the button is also disabled while rendering, this is
    // belt-and-suspenders against a queued second click.
    if (rendering) return;
    setError(null);
    setPostNote(null);
    setRendering(true);
    try {
      const result = await renderPhoto(doc!, {
        format,
        quality: format === "jpeg" ? quality : undefined,
        // The document's export intent rides the render (dev #6); the print
        // target (inches) rides only when a size is set — for the PDF box math.
        intent: doc!.target.intent,
        printTarget: doc!.target.size
          ? { w: doc!.target.size.w, h: doc!.target.size.h, bleed: doc!.target.bleed }
          : undefined,
      });
      // The one save-to-disk seam in the repo (see client.downloadBlob).
      downloadBlob(result.blob, result.suggestedName);
      // Advisory colour-path notes surfaced from the render's response headers
      // (only if the sibling render route shipped them — false otherwise).
      if (result.intentDowngraded) {
        setPostNote("Exported in sRGB — this format can't carry CMYK.");
      } else if (result.reseparated) {
        setPostNote("Re-separated to CMYK through the GRACoL profile.");
      }
    } catch (err) {
      // The server's friendly RenderError.message shows verbatim; anything
      // unexpected falls back to a generic, counter-ready line.
      setError(
        isRenderError(err)
          ? err.message
          : "Something went wrong preparing the file. Try exporting again.",
      );
    } finally {
      setRendering(false);
    }
  }

  // Render + place + navigate. openInLayoutEditor owns the render guard and never
  // throws — a failure comes back as a typed message to surface inline. On success
  // it navigates, so this component unmounts before the phase is read again.
  async function runHandoff() {
    setHandoff({ kind: "busy" });
    const outcome = await openInLayoutEditor(doc!, router);
    if (!outcome.ok) setHandoff({ kind: "error", message: outcome.message });
  }

  async function onOpenLayout() {
    // Belt-and-suspenders against a click while any full-res render is in flight.
    if (rendering) return;
    setHandoff({ kind: "idle" });
    // The saved layout document only exists after rehydration (its store skips
    // auto-hydration), so await it before the confirm reads the real content.
    await Promise.resolve(useLayoutStore.persist.rehydrate());
    if (layoutDocHasContent()) {
      setHandoff({ kind: "confirm", docName: useLayoutStore.getState().doc.name });
      return;
    }
    await runHandoff();
  }

  return (
    <div data-testid="photo-export-panel" className="flex-1 overflow-y-auto p-4">
      <div className="flex flex-col gap-[15px]">
        {/* FORMAT — 2×2 tile grid. JPG/PNG (screen) + TIFF/PDF·print, all live. */}
        <div>
          <div className={`${WF_H} mb-2`}>Format</div>
          <div className="grid grid-cols-2 gap-[6px]">
            <FormatTile
              testId="export-format-jpg"
              label="JPG"
              active={format === "jpeg"}
              onClick={() => setFormat("jpeg")}
            />
            <FormatTile
              testId="export-format-png"
              label="PNG"
              active={format === "png"}
              onClick={() => setFormat("png")}
            />
            <FormatTile
              testId="export-format-tiff"
              label="TIFF"
              active={format === "tiff"}
              onClick={() => setFormat("tiff")}
            />
            <FormatTile
              testId="export-format-pdf"
              label="PDF · print"
              active={format === "pdf"}
              onClick={() => setFormat("pdf")}
            />
          </div>
          <div className="mt-[6px] text-[10.5px] text-[#999]">
            PDF carries correct trim + bleed boxes. HEIC always converts on the way in.
          </div>
        </div>

        {/* SETTINGS — Quality (JPG only) + live intent segment. */}
        <div>
          <div className={`${WF_H} mb-2`}>Settings</div>

          {qualityVisible ? (
            <div className="mb-3">
              <div className="mb-[9px] flex items-baseline justify-between">
                <div className="text-[11.5px] text-[#555]">Quality</div>
                <span className="text-[11px] text-[#999]">{quality}</span>
              </div>
              <input
                type="range"
                data-testid="export-quality"
                min={QUALITY_MIN}
                max={QUALITY_MAX}
                step={1}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                aria-label="Quality"
                className="h-1 w-full cursor-pointer accent-brand"
              />
            </div>
          ) : (
            <div className="mb-3 text-[10.5px] text-[#999]">
              {format === "png"
                ? "PNG is lossless — there’s no quality setting."
                : "Print formats encode at full fidelity — no quality setting."}
            </div>
          )}

          {/* Intent — both segments live; reflects doc.target.intent (dev #6). */}
          <div className="flex rounded-[6px] bg-[#ececec] p-[2px] text-[11px]">
            <IntentSegment
              testId="export-intent-srgb"
              label="sRGB"
              active={intent === "srgb"}
              onClick={() => setIntent("srgb")}
            />
            <IntentSegment
              testId="export-intent-cmyk"
              label="CMYK · GRACoL"
              active={intent === "cmyk"}
              onClick={() => setIntent("cmyk")}
            />
          </div>

          {showConvert && (
            <button
              type="button"
              data-testid="export-convert-cmyk"
              onClick={() => setIntent("cmyk")}
              className="mt-[8px] flex h-[30px] w-full cursor-pointer items-center justify-center rounded-[6px] border-[1.5px] border-brand bg-brand-tint text-[11.5px] font-semibold text-brand-deep hover:bg-[#f7dede]"
            >
              Convert to CMYK (GRACoL) →
            </button>
          )}

          <div className="mt-[6px] text-[10.5px] text-[#999]">
            {showPngCmykNote
              ? "PNG exports sRGB — CMYK rides JPG/TIFF/PDF."
              : "CMYK-intent matches press color — fixes the royal-blue surprise."}
          </div>
        </div>

        {/* STRIP METADATA — locked ON (deviation #7): intake already strips it. */}
        <div
          className="flex items-center justify-between"
          title="Metadata was removed when the file was opened"
        >
          <span className="text-[11.5px] text-[#555]">Strip photo metadata</span>
          <div
            role="switch"
            aria-checked
            aria-disabled
            aria-label="Strip photo metadata (locked on)"
            data-testid="export-strip-metadata"
            className="relative h-4 w-7 shrink-0 cursor-not-allowed rounded-[8px] border border-brand bg-brand-tint"
          >
            <div className="absolute right-[2px] top-[2px] h-3 w-3 rounded-full bg-brand" />
          </div>
        </div>

        {/* PRIMARY ACTIONS — Export file (live) + Save back to order (inert, dev #4). */}
        <div className="flex flex-col gap-[7px]">
          <button
            type="button"
            data-testid="export-file"
            onClick={() => void onExport()}
            disabled={rendering}
            className={`flex h-[34px] items-center justify-center gap-[6px] rounded-[6px] text-[12.5px] font-medium ${
              rendering
                ? "cursor-not-allowed bg-[#e6b3b3] text-white"
                : "cursor-pointer bg-brand text-white hover:bg-brand-press"
            }`}
          >
            {rendering ? (
              <>
                <Loader2 size={13} strokeWidth={2.2} className="animate-spin" />
                Rendering…
              </>
            ) : (
              "Export file"
            )}
          </button>
          <button
            type="button"
            data-testid="export-save-order"
            disabled
            title="Order write-back arrives with the backbone"
            className="flex h-[30px] cursor-not-allowed items-center justify-center rounded-[6px] border border-[#cfcfcf] bg-white text-[12px] text-[#999] opacity-70"
          >
            Save back to order #58291
          </button>
        </div>

        {/* Post-export advisory note — the render's colour-path headers, if any. */}
        {postNote && (
          <div
            data-testid="export-note"
            className="rounded-[6px] border border-[#e0e0e0] bg-[#fafafa] px-[10px] py-2 text-[11px] leading-relaxed text-[#666]"
          >
            {postNote}
          </div>
        )}

        {/* Inline error — the server's RenderError.message, verbatim (dev-honest copy). */}
        {error && (
          <div
            data-testid="export-error"
            role="alert"
            className="flex items-start gap-[6px] rounded-[6px] border border-brand-border bg-brand-tint px-[10px] py-2 text-[11.5px] leading-relaxed text-brand-deep"
          >
            <AlertTriangle size={13} strokeWidth={2} className="mt-[1px] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* SEND TO ANOTHER TOOL — layout handoff live (PE7); imposition inert (dev #9). */}
        <div>
          <div className={`${WF_H} mb-2`}>Send to another tool</div>
          <div className="flex flex-col gap-[6px]">
            {/* Open in Layout Editor — flatten → asset → place → navigate. */}
            <button
              type="button"
              data-testid="export-send-layout"
              onClick={() => void onOpenLayout()}
              disabled={rendering || handoff.kind === "busy"}
              className={`flex h-8 items-center justify-between rounded-[6px] border px-[10px] text-[12px] ${
                rendering || handoff.kind === "busy"
                  ? "cursor-not-allowed border-[#e0e0e0] bg-white text-[#999]"
                  : "cursor-pointer border-[#d8d8d8] bg-white text-[#444] hover:border-brand hover:bg-brand-tint hover:text-brand-deep"
              }`}
            >
              {handoff.kind === "busy" ? (
                <span className="flex items-center gap-[6px]">
                  <Loader2 size={12} strokeWidth={2.2} className="animate-spin" />
                  Preparing…
                </span>
              ) : (
                <>
                  Open in Layout Editor
                  <span className="text-brand">→</span>
                </>
              )}
            </button>

            {/* Inline confirm — the layout doc already has content (dev-honest, no
                browser dialog); the photo lands on the current page as one step. */}
            {handoff.kind === "confirm" && (
              <div
                data-testid="handoff-confirm"
                className="flex flex-col gap-[7px] rounded-[6px] border border-brand-border bg-brand-tint px-[10px] py-2 text-[11.5px] leading-relaxed text-brand-deep"
              >
                <span>
                  Add this photo to &ldquo;{handoff.docName}&rdquo;? It lands on the current page as one
                  undoable step.
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    data-testid="handoff-confirm-place"
                    onClick={() => void runHandoff()}
                    className="cursor-pointer text-[11.5px] font-semibold text-brand hover:underline"
                  >
                    Place on page
                  </button>
                  <button
                    type="button"
                    data-testid="handoff-confirm-cancel"
                    onClick={() => setHandoff({ kind: "idle" })}
                    className="cursor-pointer text-[11.5px] font-medium text-brand-muted hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Inline handoff failure — same affordance as the export error. */}
            {handoff.kind === "error" && (
              <div
                data-testid="handoff-error"
                role="alert"
                className="flex items-start gap-[6px] rounded-[6px] border border-brand-border bg-brand-tint px-[10px] py-2 text-[11.5px] leading-relaxed text-brand-deep"
              >
                <AlertTriangle size={13} strokeWidth={2} className="mt-[1px] shrink-0" />
                <span>{handoff.message}</span>
              </div>
            )}

            <SendToLink
              testId="export-send-imposition"
              label="Resize & imposition · N-up"
              reason="The Print Setup surface is coming"
            />
          </div>
        </div>

        <div className="text-[10.5px] text-[#999]">
          Full-resolution render happens server-side — keep working while it queues.
        </div>
      </div>
    </div>
  );
}

/** A 30px live format tile — selecting sets the export container. */
function FormatTile({
  testId,
  label,
  active,
  onClick,
}: {
  testId: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-[30px] cursor-pointer items-center justify-center rounded-[5px] text-[11.5px] ${
        active
          ? "border-[1.5px] border-brand bg-brand-tint font-semibold text-brand-deep"
          : "border border-[#dcdcdc] bg-white text-[#555] hover:border-[#c8c8c8]"
      }`}
    >
      {label}
    </button>
  );
}

/** One live segment of the sRGB / CMYK intent control. */
function IntentSegment({
  testId,
  label,
  active,
  onClick,
}: {
  testId: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={`flex-1 cursor-pointer rounded-[5px] py-1 text-center ${
        active
          ? "bg-white text-[#333] shadow-[0_1px_2px_rgba(0,0,0,.12)]"
          : "text-[#777] hover:text-[#555]"
      }`}
    >
      {label}
    </button>
  );
}

/** A disabled "send to another tool" row (the handoff surfaces don't exist yet). */
function SendToLink({ testId, label, reason }: { testId: string; label: string; reason: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled
      title={reason}
      className="flex h-8 cursor-not-allowed items-center justify-between rounded-[6px] border border-[#e0e0e0] bg-white px-[10px] text-[12px] text-[#999] opacity-70"
    >
      {label}
      <span className="text-[#bbb]">→</span>
    </button>
  );
}
