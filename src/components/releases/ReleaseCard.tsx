"use client";

import { useRouter } from "next/navigation";
import { useFeedbackStore } from "@/store";
import { creditLine } from "@/lib/releases";
import type { DeliveredItem, Release } from "@/schema";

/**
 * One release card (wire): version chip, date, Latest / "Your store asked"
 * badges, title, plain-language summary, and the delivered items — features
 * and fixes — each credited to the stores that asked, with "View →"
 * cross-linking back to the board item where one exists.
 */

function DeliveredItemRow({ item }: { item: DeliveredItem }) {
  const router = useRouter();
  const openDetail = useFeedbackStore((s) => s.openDetail);
  const credit = creditLine(item);
  const hasLink = item.id != null;

  const open = () => {
    if (item.id == null) return;
    openDetail(item.id);
    router.push("/feedback/board");
  };

  return (
    <div
      onClick={open}
      className="flex items-center gap-[11px] rounded-[8px] border border-[#eee] px-3 py-[10px] hover:border-[#dcdcdc]"
      style={{ cursor: hasLink ? "pointer" : "default" }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
      <span className="flex-1 text-[13px] font-medium text-[#333]">{item.title}</span>
      {credit.text && (
        <span className="text-[11px] font-semibold" style={{ color: credit.color }}>
          {credit.text}
        </span>
      )}
      {hasLink && <span className="text-[12px] text-info">View →</span>}
    </div>
  );
}

export function ReleaseCard({ release }: { release: Release }) {
  return (
    <div
      data-testid={`release-${release.version}`}
      className="mb-4 rounded-[12px] border bg-white px-6 py-[22px]"
      style={{
        borderColor: release.latest ? "#e6cfcf" : "#eaeaea",
        boxShadow: release.latest ? "0 4px 16px rgba(0,0,0,.07)" : "0 1px 3px rgba(0,0,0,.04)",
      }}
    >
      <div className="mb-1 flex items-center gap-3">
        <span className="rounded-[6px] bg-ink px-[10px] py-1 text-[13px] font-bold text-white">{release.version}</span>
        <span className="text-[12px] text-[#999]">{release.date}</span>
        {release.latest && (
          <span className="rounded-[5px] bg-[#e8f5ea] px-2 py-[3px] text-[10px] font-bold uppercase tracking-[.04em] text-success">
            Latest
          </span>
        )}
        {release.yourStore && (
          <span className="rounded-[5px] bg-brand-tint px-2 py-[3px] text-[10px] font-bold uppercase tracking-[.04em] text-brand">
            Your store asked
          </span>
        )}
      </div>

      <div className="mt-2 text-[18px] font-bold text-ink">{release.title}</div>
      <div className="mt-[6px] text-[13px] leading-[1.55] text-[#666]">{release.summary}</div>

      {release.features.length > 0 && (
        <div className="mt-[18px]">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.04em] text-[#5f5f5f]">New features</div>
          <div className="flex flex-col gap-[7px]">
            {release.features.map((f, idx) => (
              <DeliveredItemRow key={idx} item={f} />
            ))}
          </div>
        </div>
      )}

      {release.fixes.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.04em] text-[#5f5f5f]">Fixes</div>
          <div className="flex flex-col gap-[7px]">
            {release.fixes.map((f, idx) => (
              <DeliveredItemRow key={idx} item={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
