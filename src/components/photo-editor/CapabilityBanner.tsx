"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import type { IntakeError } from "@/lib/schema/photo";

/**
 * Capability / intake-error banner (the ImportBanner pattern). Shown when an
 * open attempt returns a typed error — the server's friendly `message` is shown
 * verbatim. For `unsupported-here` (HEIC/SVG without the server codec, raw BMP)
 * an extra line explains the server-capability angle: the codec ships in the
 * Docker image, or the associate can convert the file first. For files that must
 * not open here at all — `too-many-pixels` (over the pixel ceiling) and
 * `multi-page` (PDFs and other multi-page files) — it adds a route-away line and
 * a button to the Layout Editor, which handles big and multi-page files.
 * Parent-controlled and dismissible.
 */
export function CapabilityBanner({ error, onDismiss }: { error: IntakeError | null; onDismiss: () => void }) {
  const router = useRouter();
  if (!error) return null;

  // Widen to string so the compare holds against the CURRENT schema union too:
  // `multi-page` only joins IntakeErrorCode when the server sibling's edit lands,
  // and this file must compile before then.
  const code = error.code as string;
  const routeAway = code === "too-many-pixels" || code === "multi-page";

  return (
    <div
      data-testid="photo-capability-banner"
      className="flex shrink-0 items-start gap-2 border-b border-[#e5c07b] bg-[#fdf6e3] px-4 py-2 text-[12px] text-[#7a5b00]"
    >
      <AlertTriangle size={15} strokeWidth={2} className="mt-[1px] shrink-0 text-[#b8860b]" />
      <div className="flex-1 leading-relaxed">
        <span className="font-semibold">Couldn&rsquo;t open that file.</span> {error.message}
        {error.code === "unsupported-here" && (
          <div className="mt-[2px] text-[#9a7b2a]">
            This station&rsquo;s photo service doesn&rsquo;t have that format&rsquo;s codec installed. The Docker image
            bundles it — or convert the file to JPG or PNG and open that.
          </div>
        )}
        {routeAway && (
          <>
            <div className="mt-[2px] text-[#9a7b2a]">
              The Layout Editor handles large and multi-page files — bring this one in there instead.
            </div>
            <button
              type="button"
              data-testid="photo-banner-route-layout"
              onClick={() => router.push("/layout")}
              className="mt-[7px] flex h-[28px] cursor-pointer items-center justify-center rounded-[6px] border border-[#d8b24a] bg-white px-[12px] text-[11.5px] font-semibold text-[#7a5b00] hover:bg-[#f7edcf]"
            >
              Open the Layout Editor →
            </button>
          </>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        data-testid="photo-banner-dismiss"
        onClick={onDismiss}
        className="shrink-0 rounded p-[2px] text-[#b8860b] hover:bg-[#f2e6c4]"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
