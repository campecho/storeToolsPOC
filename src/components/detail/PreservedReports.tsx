import type { DecoratedReport } from "@/lib/detail";

/**
 * Preserved per-store reports (wire) — each store's original words kept
 * verbatim; the viewing store's own report is highlighted. Merges aggregate
 * evidence, they never flatten it.
 */
export function PreservedReports({ backedLine, reports }: { backedLine: string; reports: DecoratedReport[] }) {
  return (
    <>
      <div className="mb-[11px] text-[11px] font-bold uppercase tracking-[.03em] text-[#5f5f5f]">{backedLine}</div>
      <div className="mb-[22px] flex flex-col gap-2">
        {reports.map((rep, idx) => (
          <div key={idx} className="rounded-[8px] border border-[#eee] px-[13px] py-[11px]" style={{ background: rep.bg }}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[12px] font-bold" style={{ color: rep.storeColor }}>
                Store {rep.store}
              </span>
              {rep.hasName && <span className="text-[11px] text-[#999]">· {rep.name}</span>}
              <span className="flex-1" />
              <span className="text-[11px] text-[#aaa]">{rep.when}</span>
            </div>
            <div className="text-[12px] leading-[1.45] text-[#666]">&ldquo;{rep.text}&rdquo;</div>
          </div>
        ))}
      </div>
    </>
  );
}
