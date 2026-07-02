import { useLayoutStore } from "@/store";
import { PageThumb } from "./PageThumb";
import { MasterThumb } from "./MasterThumb";

/**
 * Pages navigator (wire region 4): PAGES header + Pages / Master pages
 * segmented control over the matching list — live from L6. Pages view:
 * mini-render thumbnails (click to switch, hover ✕ to remove, red active
 * border) + the Add-page tile. Masters view: each master's mini-render
 * (click to edit on the canvas, "Apply to this page" to bind it) and
 * "+ New master". The wire's caption grammar is kept: "A · applied",
 * "B · blank".
 */
export function PagesPane() {
  const view = useLayoutStore((s) => s.pages);
  const setPages = useLayoutStore((s) => s.setPages);
  const doc = useLayoutStore((s) => s.doc);
  const activePageId = useLayoutStore((s) => s.activePageId);
  const masterEditingId = useLayoutStore((s) => s.masterEditingId);
  const setActivePage = useLayoutStore((s) => s.setActivePage);
  const addPage = useLayoutStore((s) => s.addPage);
  const removePage = useLayoutStore((s) => s.removePage);
  const setMasterEditing = useLayoutStore((s) => s.setMasterEditing);
  const addMaster = useLayoutStore((s) => s.addMaster);
  const applyMaster = useLayoutStore((s) => s.applyMaster);

  const activePage = doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];

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
            aria-pressed={view === "pages"}
            data-testid="pane-pages"
            className={seg(view === "pages")}
          >
            Pages
          </button>
          <button
            type="button"
            onClick={() => setPages("masters")}
            aria-pressed={view === "masters"}
            data-testid="pane-masters"
            className={seg(view === "masters")}
          >
            Master pages
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-[14px]">
        {view === "pages" && (
          <div className="flex flex-col items-center gap-[10px]">
            {doc.pages.map((p, i) => (
              <PageThumb
                key={p.id}
                doc={doc}
                page={p}
                index={i}
                active={!masterEditingId && p.id === activePageId}
                removable={doc.pages.length > 1}
                onSelect={() => setActivePage(p.id)}
                onRemove={() => removePage(p.id)}
              />
            ))}
            <button
              type="button"
              data-testid="page-add"
              aria-label="Add page"
              onClick={addPage}
              className="mt-[6px] flex h-[114px] w-[88px] cursor-pointer items-center justify-center rounded-[3px] border-[1.5px] border-dashed border-[#cfcfcf] text-[20px] text-[#b0b0b0] hover:border-[#b0b0b0] hover:text-[#888]"
            >
              +
            </button>
            <div className="text-[10px] text-[#a0a0a0]">Add page</div>
          </div>
        )}
        {view === "masters" && (
          <div className="flex flex-col items-center gap-[14px]">
            {doc.masters.map((m) => (
              <MasterThumb
                key={m.id}
                doc={doc}
                master={m}
                applied={activePage.masterId === m.id}
                editing={masterEditingId === m.id}
                onEdit={() => setMasterEditing(m.id)}
                onApply={() => applyMaster(activePage.id, m.id)}
              />
            ))}
            <button
              type="button"
              data-testid="master-new"
              onClick={addMaster}
              className="cursor-pointer text-[10px] text-[#a0a0a0] hover:text-brand"
            >
              + New master
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
