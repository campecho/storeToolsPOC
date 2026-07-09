"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { usePhotoStore } from "@/lib/store/photo-store";
import { downloadBlob, isRenderError, renderPhoto } from "@/lib/photo/client";

/**
 * Export panel (wire Section B "Export", ~lines 397–434). Mounts in the
 * ContextPanel body while the Export tool is active.
 *
 * PE3 scope: the JPG/PNG + Quality path is LIVE — this is the first tranche
 * where a recipe replays server-side at full resolution and the bytes come back
 * to the associate's disk (plan §4 PE3). Everything else the wire draws is
 * rendered "drawn-but-honest" per the house pattern: TIFF / PDF·print tiles, the
 * CMYK·GRACoL intent, save-back, and the send-to links are all visibly present
 * but disabled, each with a tooltip naming the tranche it goes live with — so
 * the ceiling reads as reachable rather than silently missing.
 *
 * The export flow is fire-and-forget from the UI's point of view: setRendering
 * flips a session flag (status-bar chip + this button's guard), the fetch runs
 * async, and the canvas/shell stay fully interactive throughout — nothing here
 * disables the rest of the editor.
 */

type ExportFormat = "jpeg" | "png";

const WF_H = "text-[11px] font-semibold uppercase tracking-[0.04em] text-[#5f5f5f]";

/** Quality slider bounds (JPG only) — matches the contract default of 90. */
const QUALITY_MIN = 60;
const QUALITY_MAX = 100;
const QUALITY_DEFAULT = 90;

export function ExportPanel() {
  const doc = usePhotoStore((s) => s.doc);
  const rendering = usePhotoStore((s) => s.rendering);
  const setRendering = usePhotoStore((s) => s.setRendering);

  const [format, setFormat] = useState<ExportFormat>("jpeg");
  const [quality, setQuality] = useState(QUALITY_DEFAULT);
  const [error, setError] = useState<string | null>(null);

  if (!doc) return null;

  // PNG is lossless — Quality only applies to JPG (plan: "Selecting PNG
  // hides/disables Quality").
  const qualityVisible = format === "jpeg";

  async function onExport() {
    // Double-click guard: the button is also disabled while rendering, this is
    // belt-and-suspenders against a queued second click.
    if (rendering) return;
    setError(null);
    setRendering(true);
    try {
      const { blob, suggestedName } = await renderPhoto(doc!, {
        format,
        quality: format === "jpeg" ? quality : undefined,
      });
      // The one save-to-disk seam in the repo (see client.downloadBlob).
      downloadBlob(blob, suggestedName);
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

  return (
    <div data-testid="photo-export-panel" className="flex-1 overflow-y-auto p-4">
      <div className="flex flex-col gap-[15px]">
        {/* FORMAT — 2×2 tile grid. JPG active default · PNG live; TIFF + PDF drawn disabled. */}
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
            <FormatTile testId="export-format-tiff" label="TIFF" disabledReason="Lands with PE7" />
            <FormatTile testId="export-format-pdf" label="PDF · print" disabledReason="Lands with PE7" />
          </div>
          <div className="mt-[6px] text-[10.5px] text-[#999]">
            PDF carries correct trim + bleed boxes. HEIC always converts on the way in.
          </div>
        </div>

        {/* SETTINGS — Quality (JPG only) + intent segment. */}
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
              PNG is lossless — there&rsquo;s no quality setting.
            </div>
          )}

          {/* Intent — sRGB selected; CMYK · GRACoL drawn disabled (deviation #6). */}
          <div className="flex rounded-[6px] bg-[#ececec] p-[2px] text-[11px]">
            <button
              type="button"
              data-testid="export-intent-srgb"
              aria-pressed
              className="flex-1 cursor-default rounded-[5px] py-1 text-center text-[#333] shadow-[0_1px_2px_rgba(0,0,0,.12)] bg-white"
            >
              sRGB
            </button>
            <button
              type="button"
              data-testid="export-intent-cmyk"
              disabled
              title="Goes live with PE5"
              className="flex-1 cursor-not-allowed rounded-[5px] py-1 text-center text-[#aaa]"
            >
              CMYK · GRACoL
            </button>
          </div>
          <div className="mt-[6px] text-[10.5px] text-[#999]">
            CMYK-intent matches press color — fixes the royal-blue surprise.
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

        {/* SEND TO ANOTHER TOOL — both inert (dev #7 / dev #9). */}
        <div>
          <div className={`${WF_H} mb-2`}>Send to another tool</div>
          <div className="flex flex-col gap-[6px]">
            <SendToLink testId="export-send-layout" label="Open in Layout Editor" reason="Lands with PE7" />
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

/** A 30px format tile. Live tiles select; drawn-disabled tiles carry a tooltip
    naming the tranche they land with. */
function FormatTile({
  testId,
  label,
  active,
  onClick,
  disabledReason,
}: {
  testId: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabledReason?: string;
}) {
  if (disabledReason) {
    return (
      <button
        type="button"
        data-testid={testId}
        disabled
        title={disabledReason}
        className="flex h-[30px] cursor-not-allowed items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white text-[11.5px] text-[#999] opacity-70"
      >
        {label}
      </button>
    );
  }
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
