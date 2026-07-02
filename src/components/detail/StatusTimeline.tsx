import type { TrailNode } from "@/lib/detail";

/** Status timeline (wire): dots + labels, connector lines between nodes. */
export function StatusTimeline({ trail }: { trail: TrailNode[] }) {
  return (
    <div className="no-scrollbar mb-[18px] flex items-center overflow-x-auto">
      {trail.map((t, idx) => (
        <div key={idx} className="flex shrink-0 items-center">
          <div className="flex flex-col items-center gap-[5px] px-1">
            <span
              className="h-[13px] w-[13px] rounded-full border-2 border-white"
              style={{ background: t.dot, boxShadow: `0 0 0 1px ${t.dot}` }}
            />
            <span className="text-[10px] font-semibold text-[#666]">{t.label}</span>
          </div>
          {t.line && <div className="mb-[15px] h-[2px] w-[26px] shrink-0 bg-[#e2e2e2] sm:w-[38px]" />}
        </div>
      ))}
    </div>
  );
}
