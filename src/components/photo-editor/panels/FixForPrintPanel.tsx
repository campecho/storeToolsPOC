"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Sparkles } from "lucide-react";
import type { FitAnchor } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";
import { getAssetUrl } from "@/lib/assets/blob-store";
import {
  dpiChipCopy,
  dpiVerdict,
  effectiveDims,
  effectiveDpi,
  printSizeLabel,
  type DpiVerdict,
} from "@/lib/photo/geometry";
import { analyzeEdges, bleedPx, type EdgeAnalysis, type EdgeStrategy } from "@/lib/photo/bleed";
import { solveFit, type FitMode } from "@/lib/photo/fit";
import { PRINT_SIZES } from "@/lib/photo/sizes";

/**
 * Fix for print panel (wire Section B ~298–335, Section C ~735–807). Mounts in the
 * ContextPanel body while the Fix for print tool is active — PE5's differentiator.
 *
 * Groups, top→bottom:
 *   1. Target print size — the same PRINT_SIZES selector as the strip's Change ▾,
 *      plus the inert catalog link (dev #5);
 *   2. Effective-resolution card — the big DPI number + the strip's exact chip
 *      copy + verdict tint (mirrors the strip);
 *   3. Bleed — an "Expand to bleed" action with an Edge-fill override
 *      (Auto/Smear/Solid); Auto reads analyzeEdges on the proxy and shows its pick;
 *      Expand pushes a STORED-EXPLICIT bleedExpand op (px resolved at push time);
 *   4. Fit to size — Fit/Fill segmented + a 3×3 anchor grid → a stored-explicit
 *      fitToSize op (solveFit resolves the rect/pad);
 *   5. Numeric resize — the one-row Standard affordance (open question #4);
 *   6. Upscale placeholder (dev #3, disabled) + the inert 60-second-guide link.
 *
 * POC ASSUMPTION (documented): the Edge-fill "Auto" analysis runs on the RAW proxy
 * asset's border (the useAutoEnhance offscreen-decode pattern), NOT the current
 * effective image after crops — a fast, honest approximation for the auto pick;
 * the server render host re-derives the fill at full resolution regardless.
 */

const WF_H = "text-[11px] font-semibold uppercase tracking-[0.04em] text-[#5f5f5f]";

/** The 3×3 anchor grid, row-major — index 4 (center) is the default. */
const ANCHORS: FitAnchor[] = [
  "top-left", "top", "top-right",
  "left", "center", "right",
  "bottom-left", "bottom", "bottom-right",
];

interface ChipPalette {
  bg: string;
  border: string;
  text: string;
  dot: string;
}
const CHIP_PALETTE: Record<DpiVerdict, ChipPalette> = {
  green: { bg: "#EEF6EF", border: "#cfe3d2", text: "#357040", dot: "#4c9a5c" },
  amber: { bg: "#FCF3E6", border: "#ecd9b8", text: "#9a6a1a", dot: "#c98a2b" },
  red: { bg: "#FBEBEB", border: "#f0c9c9", text: "#9a1818", dot: "#CC0000" },
};

type EdgeFillChoice = "auto" | "smear" | "solid";

/** Inches without trailing zeros — 0.125 → "0.125". */
function fmtInches(n: number): string {
  return Number(n.toFixed(3)).toString();
}

export function FixForPrintPanel() {
  const doc = usePhotoStore((s) => s.doc);
  const setTarget = usePhotoStore((s) => s.setTarget);
  const pushOp = usePhotoStore((s) => s.pushOp);

  const [edgeFill, setEdgeFill] = useState<EdgeFillChoice>("auto");
  const [analysis, setAnalysis] = useState<EdgeAnalysis | null>(null);
  const [fitMode, setFitMode] = useState<FitMode>("fit");
  const [anchorIdx, setAnchorIdx] = useState(4);
  const [resizeW, setResizeW] = useState("");
  const [resizeH, setResizeH] = useState("");
  const [upscaleDismissed, setUpscaleDismissed] = useState(false);

  // Effective image = master + applied recipe (ops[0..cursor)) — the space every
  // stored-explicit op resolves against.
  const eff = useMemo(() => {
    if (!doc) return { w: 0, h: 0 };
    return effectiveDims(
      { w: doc.source.width, h: doc.source.height },
      doc.recipe.slice(0, doc.cursor),
    );
  }, [doc]);

  // Prefill the resize inputs from the effective dims, re-syncing when the
  // geometry changes (a crop/bleed applied here or elsewhere).
  const lastEff = useRef<string>("");
  useEffect(() => {
    const key = `${eff.w}x${eff.h}`;
    if (lastEff.current !== key) {
      lastEff.current = key;
      setResizeW(String(eff.w));
      setResizeH(String(eff.h));
    }
  }, [eff.w, eff.h]);

  // Auto edge-fill analysis — offscreen-decode the proxy asset and sample its
  // border (best-effort; on any failure Auto falls back to mirror). Runs once per
  // proxy asset (the POC approximation noted in the header).
  useEffect(() => {
    const proxyId = doc?.source.proxyAssetId;
    if (!proxyId) return;
    let alive = true;
    void (async () => {
      try {
        const url = await getAssetUrl(proxyId);
        if (!url) return;
        const res = await fetch(url);
        const blob = await res.blob();
        const bmp = await createImageBitmap(blob);
        let picked: EdgeAnalysis | null = null;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = bmp.width;
          canvas.height = bmp.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(bmp, 0, 0);
            const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
            picked = analyzeEdges(img.data, img.width, img.height);
          }
        } finally {
          bmp.close?.();
        }
        if (picked && alive) setAnalysis(picked);
      } catch {
        // best-effort — Auto stays at the mirror fallback.
      }
    })();
    return () => {
      alive = false;
    };
  }, [doc?.source.proxyAssetId]);

  if (!doc) return null;

  const { target } = doc;
  const hasTarget = target.size != null;

  // The auto strategy the analysis chose (mirror | solid); mirror until analysed.
  const autoStrategy: EdgeStrategy = analysis?.strategy ?? "mirror";

  // Applied bleed op (Section C's after-state).
  const appliedOps = doc.recipe.slice(0, doc.cursor);
  const bleedOp = [...appliedOps].reverse().find((o) => o.op === "bleedExpand");
  const bleedApplied = bleedOp?.op === "bleedExpand" ? bleedOp : null;

  const dpi = hasTarget ? effectiveDpi(eff, target.size!) : null;
  const verdict = dpi != null ? dpiVerdict(dpi) : null;

  function onExpandBleed() {
    if (!doc || !target.size) return;
    const resolved: EdgeStrategy | "smear" = edgeFill === "auto" ? autoStrategy : edgeFill;
    const px = bleedPx(target.bleed, eff, target.size);
    const color = resolved === "solid" ? (analysis?.color ?? "#ffffff") : undefined;
    pushOp({
      op: "bleedExpand",
      strategy: resolved,
      amount: target.bleed,
      px,
      ...(color ? { color } : {}),
      label: `Expand bleed ${fmtInches(target.bleed)} in`,
    });
  }

  function onApplyFit() {
    if (!doc || !target.size) return;
    const anchor = ANCHORS[anchorIdx];
    // solveFit does NOT auto-orient — orient the target aspect to the image here
    // so "4 × 6" lands landscape on a landscape photo, portrait on a portrait one.
    const baseAspect = target.size.w / target.size.h;
    const imgAspect = eff.h > 0 ? eff.w / eff.h : baseAspect;
    const targetAspect =
      Math.abs(baseAspect - imgAspect) <= Math.abs(1 / baseAspect - imgAspect)
        ? baseAspect
        : 1 / baseAspect;
    const solved = solveFit(eff, targetAspect, fitMode, anchor);
    pushOp({
      op: "fitToSize",
      mode: fitMode,
      anchor,
      ...(solved.kind === "crop" ? { rect: solved.rect } : { pad: solved.pad }),
      label: `Fit to size · ${fitMode}`,
    });
  }

  const resizeWNum = Math.round(Number(resizeW));
  const resizeHNum = Math.round(Number(resizeH));
  const resizeValid =
    Number.isFinite(resizeWNum) &&
    Number.isFinite(resizeHNum) &&
    resizeWNum >= 1 &&
    resizeHNum >= 1;
  const resizeChanged = resizeWNum !== eff.w || resizeHNum !== eff.h;

  function onApplyResize() {
    if (!doc || !resizeValid || !resizeChanged) return;
    pushOp({
      op: "resize",
      mode: "px",
      px: { width: resizeWNum, height: resizeHNum },
      targetPx: { width: resizeWNum, height: resizeHNum },
      label: `Resize to ${resizeWNum} × ${resizeHNum} px`,
    });
  }

  return (
    <div data-testid="photo-fixprint-panel" className="flex-1 overflow-y-auto p-4">
      <div className="flex flex-col gap-[15px]">
        {/* 1 · TARGET PRINT SIZE */}
        <div>
          <div className={`${WF_H} mb-2`}>Target print size</div>
          <div className="grid grid-cols-2 gap-[6px]">
            {PRINT_SIZES.map((preset) => {
              const active = target.product?.sku === preset.sku;
              return (
                <button
                  key={preset.sku}
                  type="button"
                  data-testid={`fixprint-size-${preset.sku}`}
                  aria-pressed={active}
                  onClick={() =>
                    setTarget({
                      size: preset.inches,
                      product: { sku: preset.sku, label: preset.label },
                      bleed: preset.bleed,
                    })
                  }
                  className={`flex h-7 cursor-pointer items-center justify-center rounded-[5px] text-[11.5px] ${
                    active
                      ? "border-[1.5px] border-brand bg-brand-tint font-semibold text-brand-deep"
                      : "border border-[#dcdcdc] bg-white text-[#555] hover:border-[#c8c8c8]"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          {hasTarget && (
            <button
              type="button"
              data-testid="fixprint-size-none"
              onClick={() => setTarget({ size: null, product: null, bleed: 0 })}
              className="mt-[6px] cursor-pointer text-[11px] text-[#086DD2] hover:text-brand"
            >
              Clear target size
            </button>
          )}
          {/* Catalog picker — inert (dev #5). */}
          <div
            data-testid="fixprint-catalog"
            title="Catalog products arrive with the spec-sync slice"
            className="mt-[6px] cursor-not-allowed text-[11px] text-[#086DD2] opacity-60"
          >
            Pick a catalog product →
          </div>
        </div>

        {/* 2 · EFFECTIVE RESOLUTION CARD */}
        <div className="rounded-[7px] border border-[#ececec] p-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#777]">Effective resolution</span>
            {dpi != null && verdict ? (
              <span
                data-testid="fixprint-resolution-chip"
                data-verdict={verdict}
                className="flex items-center gap-[5px] rounded-[10px] border px-[8px] py-[2px] text-[10.5px] font-semibold"
                style={{
                  background: CHIP_PALETTE[verdict].bg,
                  borderColor: CHIP_PALETTE[verdict].border,
                  color: CHIP_PALETTE[verdict].text,
                }}
              >
                <span
                  aria-hidden
                  className="h-[6px] w-[6px] rounded-full"
                  style={{ background: CHIP_PALETTE[verdict].dot }}
                />
                {dpi} DPI
              </span>
            ) : (
              <span className="rounded-[10px] border border-[#e0e0e0] bg-[#f4f4f4] px-[8px] py-[2px] text-[10.5px] font-semibold text-[#999]">
                —
              </span>
            )}
          </div>
          <div className="mt-[7px] text-[10.5px] text-[#999]">
            {dpi != null && verdict
              ? dpiChipCopy(dpi, verdict, printSizeLabel(target.size!))
              : "Pick a print size first to check the effective resolution."}
          </div>
        </div>

        {/* 3 · BLEED */}
        <div>
          <div className={`${WF_H} mb-2`}>Bleed</div>
          {bleedApplied ? (
            <div
              data-testid="fixprint-bleed-applied"
              className="flex items-center gap-[7px] rounded-[6px] border border-[#cfe3d2] bg-[#EEF6EF] px-[10px] py-[8px] text-[11.5px] font-semibold text-[#357040]"
            >
              <span aria-hidden>✓</span>
              Edges extended {fmtInches(bleedApplied.amount)} in — passes the cut check
            </div>
          ) : (
            <>
              <button
                type="button"
                data-testid="fixprint-bleed-apply"
                onClick={onExpandBleed}
                disabled={!hasTarget}
                title={hasTarget ? undefined : "Pick a print size first"}
                className={`flex h-8 w-full items-center justify-center gap-[7px] rounded-[6px] text-[12.5px] font-semibold ${
                  hasTarget
                    ? "cursor-pointer border-[1.5px] border-brand bg-brand-tint text-brand-deep hover:bg-[#f7dede]"
                    : "cursor-not-allowed border border-[#e0c8c8] bg-[#f7f0f0] text-[#c08a8a]"
                }`}
              >
                <Maximize2 size={13} strokeWidth={1.8} />
                Expand to bleed · {hasTarget ? fmtInches(target.bleed) : "0.125"} in
              </button>
              <label className="mt-[6px] flex h-7 items-center justify-between rounded-[5px] border border-[#dcdcdc] bg-white px-[9px] text-[11px] text-[#666]">
                <span className="text-[#888]">Edge fill</span>
                <select
                  data-testid="fixprint-edgefill"
                  value={edgeFill}
                  onChange={(e) => setEdgeFill(e.target.value as EdgeFillChoice)}
                  disabled={!hasTarget}
                  aria-label="Edge fill"
                  className="cursor-pointer bg-transparent text-right text-[11px] text-[#555] outline-none disabled:cursor-not-allowed disabled:text-[#aaa]"
                >
                  <option value="auto">Auto ({autoStrategy})</option>
                  <option value="smear">Smear</option>
                  <option value="solid">Solid</option>
                </select>
              </label>
              <div className="mt-[5px] text-[10.5px] text-[#999]">
                {hasTarget
                  ? "Mirror, smear, or solid fill — picked automatically, override anytime."
                  : "Pick a print size first."}
              </div>
            </>
          )}
        </div>

        {/* 4 · FIT TO SIZE */}
        <div>
          <div className={`${WF_H} mb-2`}>Fit to size</div>
          <div className="flex items-center gap-[10px]">
            <div className="flex flex-1 rounded-[6px] bg-[#ececec] p-[2px] text-[11px]">
              {(["fit", "fill"] as const).map((mode) => {
                const active = fitMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    data-testid={`fixprint-fit-${mode}`}
                    aria-pressed={active}
                    onClick={() => setFitMode(mode)}
                    className={`flex-1 cursor-pointer rounded-[5px] py-1 text-center capitalize ${
                      active
                        ? "bg-white text-[#333] shadow-[0_1px_2px_rgba(0,0,0,.12)]"
                        : "text-[#777] hover:text-[#555]"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-3 grid-rows-3 gap-[3px]">
              {ANCHORS.map((anchor, i) => {
                const active = anchorIdx === i;
                return (
                  <button
                    key={anchor}
                    type="button"
                    data-testid={`fixprint-anchor-${i}`}
                    aria-label={`Anchor ${anchor}`}
                    aria-pressed={active}
                    onClick={() => setAnchorIdx(i)}
                    className="h-4 w-4 cursor-pointer rounded-[2px]"
                    style={
                      active
                        ? { border: "1.5px solid #CC0000", background: "#FBEBEB" }
                        : { border: "1px solid #dcdcdc", background: "#fff" }
                    }
                  />
                );
              })}
            </div>
          </div>
          <div className="mt-[5px] flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-[#999]">
              Same Fit / Fill / anchor controls as the Resize surface.
            </span>
            <button
              type="button"
              data-testid="fixprint-fit-apply"
              onClick={onApplyFit}
              disabled={!hasTarget}
              title={hasTarget ? undefined : "Pick a print size first"}
              className={`h-7 shrink-0 rounded-[6px] px-[12px] text-[11.5px] font-medium ${
                hasTarget
                  ? "cursor-pointer bg-brand text-white hover:bg-brand-press"
                  : "cursor-not-allowed bg-[#e6b3b3] text-white opacity-60"
              }`}
            >
              Apply
            </button>
          </div>
        </div>

        {/* 5 · NUMERIC RESIZE (open question #4 — the minimal Standard affordance). */}
        <div>
          <div className={`${WF_H} mb-2`}>Resize</div>
          <div className="flex items-center gap-[6px]">
            <input
              type="number"
              min={1}
              data-testid="fixprint-resize-w"
              value={resizeW}
              onChange={(e) => setResizeW(e.target.value)}
              aria-label="Resize width (px)"
              className="h-7 w-full min-w-0 rounded-[5px] border border-[#dcdcdc] bg-white px-[8px] text-[11.5px] text-[#555] outline-none focus:border-[#c8c8c8]"
            />
            <span className="shrink-0 text-[11px] text-[#999]">×</span>
            <input
              type="number"
              min={1}
              data-testid="fixprint-resize-h"
              value={resizeH}
              onChange={(e) => setResizeH(e.target.value)}
              aria-label="Resize height (px)"
              className="h-7 w-full min-w-0 rounded-[5px] border border-[#dcdcdc] bg-white px-[8px] text-[11.5px] text-[#555] outline-none focus:border-[#c8c8c8]"
            />
            <span className="shrink-0 text-[11px] text-[#999]">px</span>
            <button
              type="button"
              data-testid="fixprint-resize-apply"
              onClick={onApplyResize}
              disabled={!resizeValid || !resizeChanged}
              className={`h-7 shrink-0 rounded-[6px] px-[12px] text-[11.5px] font-medium ${
                resizeValid && resizeChanged
                  ? "cursor-pointer bg-brand text-white hover:bg-brand-press"
                  : "cursor-not-allowed bg-[#e6b3b3] text-white opacity-60"
              }`}
            >
              Apply
            </button>
          </div>
        </div>

        {/* 6 · UPSCALE PLACEHOLDER (dev #3) — the honest low-res rescue offer. */}
        {!upscaleDismissed && (
          <div
            data-testid="fixprint-upscale"
            className="rounded-[7px] border border-dashed border-[#d8d8d8] bg-[#fafafa] p-[10px]"
          >
            <div className="flex items-center gap-[6px] text-[11.5px] font-semibold text-[#666]">
              <Sparkles size={13} strokeWidth={1.7} className="text-[#999]" />
              Upscale on the server — about 10 seconds
            </div>
            <div className="mt-[3px] text-[10.5px] text-[#999]">
              Improves smoothness. It cannot invent detail that isn&rsquo;t there.
            </div>
            <div className="mt-[8px] flex gap-[6px]">
              <button
                type="button"
                data-testid="fixprint-upscale-run"
                disabled
                title="Coming with the model service"
                className="flex h-[26px] cursor-not-allowed items-center rounded-[5px] bg-[#e6b3b3] px-[11px] text-[11px] font-semibold text-white opacity-70"
              >
                Upscale to ~300 DPI
              </button>
              <button
                type="button"
                data-testid="fixprint-print-asis"
                onClick={() => setUpscaleDismissed(true)}
                className="flex h-[26px] cursor-pointer items-center rounded-[5px] border border-[#cfcfcf] bg-white px-[11px] text-[11px] text-[#666] hover:bg-[#f4f4f4]"
              >
                Print as-is
              </button>
            </div>
          </div>
        )}

        {/* Inert quick-guide link. */}
        <div
          data-testid="fixprint-guide"
          title="Guide content lands with the help pass"
          className="cursor-not-allowed text-[11px] text-[#086DD2] opacity-70"
        >
          New to bleed? 60-second guide →
        </div>
      </div>
    </div>
  );
}
