"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFeedbackStore } from "@/store";
import { useOverlayTransition } from "@/lib/use-overlay-transition";
import { SparkStar } from "@/components/ui/SparkStar";

/**
 * Celebrate "shipped" moment (wire view 7) — the one place a small celebratory
 * flourish is spent: pulsing ring pair, star pop, the delivered item, its
 * release pill, the store's running tally, and queue controls when multiple
 * items shipped. Content is keyed by queue position so stepping the queue
 * replays the star pop and fades the new item in.
 */
export function CelebrateModal() {
  const router = useRouter();
  const open = useFeedbackStore((s) => s.celebrateOpen);
  const queue = useFeedbackStore((s) => s.celebrateQueue);
  const index = useFeedbackStore((s) => s.celebrateIndex);
  const items = useFeedbackStore((s) => s.items);
  const impact = useFeedbackStore((s) => s.impact);
  const closeCelebrate = useFeedbackStore((s) => s.closeCelebrate);
  const celebratePrev = useFeedbackStore((s) => s.celebratePrev);
  const celebrateNext = useFeedbackStore((s) => s.celebrateNext);

  const phase = useOverlayTransition(open, 190);
  const closing = phase === "closing";

  const current = queue[index];
  const item = current ? items.find((i) => i.id === current.itemId) : undefined;
  if (phase === "closed" || !current || !item) return null;

  const isBug = item.type === "bug";
  const hasMultiple = queue.length > 1;

  const seeWhatsNew = () => {
    closeCelebrate();
    router.push("/feedback/releases");
  };

  const arrow =
    "flex h-[34px] w-[34px] items-center justify-center rounded-full border border-[#e0e0e0] bg-white";

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] bg-[rgba(20,20,20,.4)] ${closing ? "pointer-events-none animate-fade-out" : "animate-fade-in"}`}
        onClick={closeCelebrate}
      />
      <div
        data-testid="celebrate-modal"
        className={`fixed left-1/2 top-1/2 z-[61] w-[520px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[16px] bg-white text-center shadow-[0_28px_70px_rgba(0,0,0,.32)] ${
          closing ? "pointer-events-none animate-pop-out" : "animate-pop-in"
        }`}
      >
        {/* top band: pulsing rings behind the star disc */}
        <div className="relative flex h-[150px] items-center justify-center bg-gradient-to-b from-brand-tint to-white">
          <div className="absolute h-24 w-24 rounded-full border-2 border-brand" style={{ animation: "ringExpand 1.4s ease-out infinite" }} />
          <div className="absolute h-24 w-24 rounded-full border-2 border-brand" style={{ animation: "ringExpand 1.4s ease-out .5s infinite" }} />
          <div className="relative z-[2] flex h-[74px] w-[74px] items-center justify-center rounded-full bg-white shadow-[0_4px_16px_rgba(204,0,0,.22)]">
            {/* keyed by queue position so the pop replays on prev/next */}
            <SparkStar key={index} size={38} className="text-brand" style={{ animation: "starPop .5s ease-out" }} />
          </div>
        </div>

        <div className="px-[34px] pb-8 pt-[6px]">
          <div className="text-[11px] font-bold uppercase tracking-[.08em] text-brand">You asked, we delivered</div>

          {/* keyed by queue position so stepping the queue fades the item in */}
          <div key={index} className="animate-fade-in">
            <div className="mt-[10px] text-[20px] font-bold leading-[1.3] text-ink">{item.title}</div>
            <div className="mt-[10px] text-[13px] leading-[1.55] text-[#777]">
              {isBug
                ? "The bug your store reported is gone — here's the version that carried the fix."
                : "The idea your store backed is live for every store."}
            </div>

            <div className="mt-4 inline-flex items-center gap-2 rounded-[20px] border border-success-border bg-success-tint px-[14px] py-[6px]">
              <span className="h-2 w-2 rounded-full bg-success" />
              <span className="text-[12px] font-bold text-success-deep">
                {isBug ? "Fixed" : "Shipped"} in {current.release}
              </span>
            </div>
          </div>

          <div className="mt-4 text-[12px] text-[#999]">
            That brings your store's shipped-from-feedback tally to <span className="font-bold text-brand">{impact}</span>.
          </div>

          {hasMultiple && (
            <div className="mt-5 flex items-center justify-center gap-[14px]">
              <button
                type="button"
                aria-label="Previous"
                data-testid="celebrate-prev"
                onClick={celebratePrev}
                className={arrow}
                style={index > 0 ? { cursor: "pointer" } : { opacity: 0.35, cursor: "default" }}
              >
                <ChevronLeft size={16} strokeWidth={2} className="text-[#555]" />
              </button>
              <span data-testid="celebrate-counter" className="min-w-[48px] text-center text-[12px] font-semibold text-[#999]">
                {index + 1} of {queue.length}
              </span>
              <button
                type="button"
                aria-label="Next"
                data-testid="celebrate-next"
                onClick={celebrateNext}
                className={arrow}
                style={index < queue.length - 1 ? { cursor: "pointer" } : { opacity: 0.35, cursor: "default" }}
              >
                <ChevronRight size={16} strokeWidth={2} className="text-[#555]" />
              </button>
            </div>
          )}

          <div className="mt-[18px] flex justify-center gap-3">
            <button
              type="button"
              data-testid="celebrate-dismiss"
              onClick={closeCelebrate}
              className="flex h-[42px] cursor-pointer items-center rounded-[8px] border border-[#d4d4d4] px-[18px] text-[13px] font-semibold text-[#555] hover:bg-[#f5f5f5]"
            >
              {hasMultiple ? "Dismiss all" : "Nice"}
            </button>
            <button
              type="button"
              data-testid="celebrate-see-releases"
              onClick={seeWhatsNew}
              className="flex h-[42px] cursor-pointer items-center rounded-[8px] bg-brand px-[22px] text-[13px] font-semibold text-white hover:bg-brand-press"
            >
              See what's new
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
