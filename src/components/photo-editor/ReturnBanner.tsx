"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { PhotoDocument } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";
import { cancelReturnTrip, finishReturnTrip } from "@/lib/photo/return-trip";

/**
 * F2 return banner (PE8). Rendered above the print strip ONLY while the editor
 * was entered from a layout picture (`returnContext` present + a document open).
 * The red print-check tint from the wires is preserved exactly (bg #FBEBEB /
 * border #f0c9c9 / ink #9a1818). "Done" replaces Export — it renders the recipe
 * and lands it back on the page as one revertable layout step; "Cancel" is a
 * true no-op on the layout document. A render failure shows inline; `rendering`
 * guards a double-submit.
 */
export function ReturnBanner({ doc }: { doc: PhotoDocument | null }) {
  const router = useRouter();
  const returnContext = usePhotoStore((s) => s.returnContext);
  const rendering = usePhotoStore((s) => s.rendering);
  const [error, setError] = useState<string | null>(null);

  // Mounts only when the round-trip is live (returnContext && doc).
  if (!returnContext || !doc) return null;

  const onDone = async () => {
    setError(null);
    const res = await finishReturnTrip(doc, returnContext, router);
    if (!res.ok) setError(res.message);
  };

  return (
    <div
      data-testid="photo-return-banner"
      className="flex shrink-0 flex-col border-b border-[#f0c9c9] bg-[#FBEBEB]"
    >
      <div className="flex h-8 items-center gap-2 px-[10px]">
        <span aria-hidden className="shrink-0 text-[10px] leading-none text-[#9a1818]">
          ◀
        </span>
        <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-[#9a1818]">
          Editing picture from “{returnContext.originName}”
        </span>
        <span className="shrink-0 whitespace-nowrap text-[11px] text-[#c98a8a]">
          returns as one step
        </span>

        <div className="flex-1" />

        <button
          type="button"
          data-testid="return-done"
          onClick={onDone}
          disabled={rendering}
          title="Apply the edit and return to the page as one step"
          className={`flex h-[22px] shrink-0 items-center gap-[6px] rounded-[4px] bg-brand px-[11px] text-[11px] font-semibold text-white ${
            rendering ? "cursor-wait opacity-80" : "cursor-pointer hover:bg-[#b30000]"
          }`}
        >
          {rendering && <Loader2 size={11} strokeWidth={2.4} className="animate-spin" />}
          {rendering ? "Applying…" : "Done"}
        </button>
        <button
          type="button"
          data-testid="return-cancel"
          onClick={() => cancelReturnTrip(router)}
          disabled={rendering}
          title="Discard and return to the page unchanged"
          className={`flex h-[22px] shrink-0 items-center rounded-[4px] border border-[#d9a5a5] bg-white px-[11px] text-[11px] text-[#9a1818] ${
            rendering ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-[#fdf4f4]"
          }`}
        >
          Cancel
        </button>
      </div>

      {error && (
        <div
          data-testid="return-error"
          className="border-t border-[#f0c9c9] px-[10px] pb-[6px] pt-[5px] text-[11px] text-[#9a1818]"
        >
          {error}
        </div>
      )}
    </div>
  );
}
