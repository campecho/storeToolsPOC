import { useLayoutStore } from "@/store";

/**
 * Pages navigator (wire region 4): PAGES header + Pages / Master pages
 * segmented control over the matching list. Both views are static in L2
 * (single-page thumb + Add-page tile; masters A · applied and B · blank +
 * New-master affordance); live page/master management lands in L6.
 */
export function PagesPane() {
  const pages = useLayoutStore((s) => s.pages);
  const setPages = useLayoutStore((s) => s.setPages);

  const seg = (active: boolean) =>
    `flex-1 cursor-pointer rounded-[5px] py-1 text-center text-[#555] ${
      active ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,.12)]" : ""
    }`;

  return (
    <div className="flex w-[188px] shrink-0 flex-col border-r border-[#ececec]">
      <div className="flex shrink-0 flex-col gap-[10px] border-b border-[#efefef] px-3 pb-[10px] pt-3">
        <div className="text-[11px] font-bold uppercase tracking-[.04em] text-[#5f5f5f]">Pages</div>
        <div className="flex rounded-[6px] bg-[#ececec] p-[2px] text-[11px]">
          <button
            type="button"
            onClick={() => setPages("pages")}
            aria-pressed={pages === "pages"}
            data-testid="pane-pages"
            className={seg(pages === "pages")}
          >
            Pages
          </button>
          <button
            type="button"
            onClick={() => setPages("masters")}
            aria-pressed={pages === "masters"}
            data-testid="pane-masters"
            className={seg(pages === "masters")}
          >
            Master pages
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-3 py-[14px]">
        {pages === "pages" && (
          <div className="flex flex-col items-center gap-[5px]">
            <div className="w-[88px]">
              <div className="h-[114px] w-[88px] rounded-[3px] border-[1.5px] border-brand bg-white shadow-[0_1px_3px_rgba(0,0,0,.14)]" />
              <div className="mt-1 text-center text-[11px] font-semibold text-brand">1</div>
            </div>
            <div className="mt-[6px] flex h-[114px] w-[88px] cursor-pointer items-center justify-center rounded-[3px] border-[1.5px] border-dashed border-[#cfcfcf] text-[20px] text-[#b0b0b0]">
              +
            </div>
            <div className="text-[10px] text-[#a0a0a0]">Add page</div>
          </div>
        )}
        {pages === "masters" && (
          <div className="flex flex-col items-center gap-[14px]">
            <div className="w-[88px]">
              {/* A — applied to page 1 (mini master proxy: dashed frame + footer bar) */}
              <div className="relative h-[114px] w-[88px] rounded-[3px] border-[1.5px] border-brand bg-white shadow-[0_1px_3px_rgba(0,0,0,.14)]">
                <div className="absolute inset-2 border border-dashed border-[#cdcdcd]" />
                <div className="absolute bottom-[6px] left-2 right-2 h-[6px] bg-[#eee]" />
              </div>
              <div className="mt-1 text-center text-[11px] text-[#666]">A · applied</div>
            </div>
            <div className="w-[88px]">
              <div className="relative h-[114px] w-[88px] rounded-[3px] border border-[#dcdcdc] bg-white">
                <div className="absolute inset-2 border border-dashed border-[#dcdcdc]" />
              </div>
              <div className="mt-1 text-center text-[11px] text-[#999]">B · blank</div>
            </div>
            <div className="cursor-pointer text-[10px] text-[#a0a0a0]">+ New master</div>
          </div>
        )}
      </div>
    </div>
  );
}
