import { useLayoutStore, type RibbonTab } from "@/store";

const INTERACTIVE_TABS: { id: RibbonTab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "layout", label: "Layout" },
  { id: "text", label: "Text" },
];

/**
 * Ribbon tab strip (wire region 2a). Home/Insert/Layout/Text switch the
 * command band.
 * PROTOTYPE-ONLY: File (open/save/export lands with the print-production
 * slice) and Arrange/View/Help (plan §6) are inert, static-by-design labels.
 */
export function RibbonTabs() {
  const ribbon = useLayoutStore((s) => s.ribbon);
  const setRibbon = useLayoutStore((s) => s.setRibbon);

  return (
    <div className="flex h-8 shrink-0 items-end gap-[2px] border-b border-[#e4e4e4] bg-[#f0f0f0] px-[6px]">
      <div className="px-[15px] pb-2 pt-[7px] text-[12px] font-semibold text-brand">File</div>
      {INTERACTIVE_TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => setRibbon(id)}
          aria-pressed={ribbon === id}
          data-testid={`ribbon-${id}`}
          className="relative cursor-pointer px-[14px] pb-2 pt-[7px] text-[12px] text-[#3d3d3d]"
        >
          {label}
          {ribbon === id && <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-brand" />}
        </button>
      ))}
      {["Arrange", "View", "Help"].map((label) => (
        <div key={label} className="px-[14px] pb-2 pt-[7px] text-[12px] text-[#8f8f8f]">
          {label}
        </div>
      ))}
    </div>
  );
}
