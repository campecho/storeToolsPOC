import { useLayoutStore, type InspectorTab } from "@/store";
import { PageTab } from "./PageTab";

const TABS: { id: InspectorTab; label: string }[] = [
  { id: "props", label: "Properties" },
  { id: "text", label: "Text" },
  { id: "align", label: "Align" },
  { id: "page", label: "Page" },
];

/**
 * Affinity-style inspector (wire region 7): 4 equal tabs, body swaps per tab.
 * L1 ships the Page tab body (the default); Properties / Text / Align bodies
 * land in L2 and go live against a selection in L4/L5/L7.
 */
export function Inspector() {
  const insp = useLayoutStore((s) => s.insp);
  const setInsp = useLayoutStore((s) => s.setInsp);

  return (
    <div className="flex w-[268px] shrink-0 flex-col border-l border-[#ececec]">
      <div className="flex h-[38px] shrink-0 items-stretch border-b border-[#ececec] text-[11.5px]">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setInsp(id)}
            aria-pressed={insp === id}
            data-testid={`insp-${id}`}
            className="relative flex flex-1 cursor-pointer items-center justify-center text-[#555]"
          >
            {label}
            {insp === id && (
              <div className="absolute bottom-0 left-[14px] right-[14px] h-[2px] bg-brand" />
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden p-4">
        {insp === "page" && <PageTab />}
        {/* Properties / Text / Align bodies land in L2. */}
      </div>
    </div>
  );
}
