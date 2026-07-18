"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { PhotoDocument } from "@/lib/schema/photo";
import type { PhotoLevel } from "@/lib/store/photo-store";

/**
 * Photo-editor title bar (wire region 1). Deviation #1 (plan §2): the wire's
 * `— ▢ ✕` window chrome is prototype-only and dropped, a `← Back` affordance is
 * added (same as the layout editor and proof station). The Staples badge,
 * filename + dims/MP metadata, the (inert) order-context chip, the two-segment
 * level control, store label, and help glyph stay per the wire.
 */
export function TitleBar({
  doc,
  orderContext,
  level,
  onSetLevel,
  onResetDemo,
}: {
  doc: PhotoDocument | null;
  orderContext: string | null;
  level: PhotoLevel;
  onSetLevel: (level: PhotoLevel) => void;
  onResetDemo: () => void;
}) {
  const megapixels = doc ? ((doc.source.width * doc.source.height) / 1_000_000).toFixed(1) : null;

  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-[#e0e0e0] bg-[#f0f0f0] px-[14px]">
      <Link
        href="/"
        data-testid="photo-back"
        className="flex shrink-0 items-center gap-[5px] text-[12px] font-medium text-[#666] hover:text-brand"
      >
        <ChevronLeft size={15} strokeWidth={2} />
        Back
      </Link>
      <div className="h-5 w-px shrink-0 bg-[#dcdcdc]" />

      <div className="flex min-w-0 items-center gap-[9px]">
        <span className="rounded-[3px] bg-brand px-[6px] py-[3px] text-[11px] font-bold text-white">Staples</span>
        {doc && (
          <>
            <span data-testid="photo-filename" className="truncate text-[13px] font-semibold text-[#333]">
              {doc.name}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[12px] text-[#9a9a9a]">
              · {doc.source.width} × {doc.source.height} px · {megapixels} MP
            </span>
            {orderContext && (
              // PROTOTYPE-ONLY: deviation #4 — order integration renders inert (no
              // order model in the POC); the demo photo carries context so it reads
              // true. Goes live with the backbone write-path (STUBS.md, plan §6).
              <div
                data-testid="photo-order-chip"
                title="Order integration is coming with the backbone write-path"
                aria-disabled="true"
                className="flex shrink-0 items-center gap-[6px] rounded-[4px] border border-[#ddd] bg-[#f7f7f7] px-[8px] py-[2px] opacity-70"
              >
                <span className="whitespace-nowrap text-[11px] text-[#777]">{orderContext}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex-1" />

      {/* Experience levels (design §3.3) — surface density only, never the file.
          Two segments since plan v1.3 (Pro dropped, deviation #2). */}
      <div
        data-testid="photo-level"
        className="flex shrink-0 items-center rounded-[6px] bg-[#e7e7e7] p-[2px] text-[11px] text-[#777]"
      >
        {(["simple", "standard"] as const).map((lv) => (
          <button
            key={lv}
            type="button"
            data-testid={`photo-level-${lv}`}
            aria-pressed={level === lv}
            onClick={() => onSetLevel(lv)}
            className={
              level === lv
                ? "rounded-[4px] bg-white px-[11px] py-[3px] text-[#333] shadow-[0_1px_2px_rgba(0,0,0,.12)]"
                : "cursor-pointer rounded-[4px] px-[11px] py-[3px] hover:text-[#555]"
            }
          >
            {lv === "simple" ? "Simple" : "Standard"}
          </button>
        ))}
      </div>

      <span className="shrink-0 text-[12px] text-[#8a8a8a]">Store #1284</span>

      {/* PROTOTYPE-ONLY: help glyph is inert — help content is a later beta pass. */}
      <div
        title="Help is coming later in the beta"
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#b6b6b6] text-[11px] text-[#9a9a9a]"
      >
        ?
      </div>

      {/* PROTOTYPE-ONLY: "Reset demo photo" — a demo control, not a wire element
          (the feedback tracker's "Reset demo data" precedent). Drops all edits and
          reopens the fresh demo photo. */}
      <button
        type="button"
        onClick={onResetDemo}
        data-testid="photo-reset-demo"
        className="shrink-0 cursor-pointer whitespace-nowrap text-[11px] text-[#c2c2c2] hover:text-[#888]"
      >
        Reset demo photo
      </button>
    </div>
  );
}
