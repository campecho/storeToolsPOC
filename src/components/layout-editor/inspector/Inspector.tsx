import { useLayoutStore, type InspectorTab } from "@/store";
import { AlignTab } from "./AlignTab";
import { PageTab } from "./PageTab";
import { PropertiesTab } from "./PropertiesTab";
import { TextTab } from "./TextTab";

const TABS: { id: InspectorTab; label: string }[] = [
  { id: "props", label: "Properties" },
  { id: "text", label: "Text" },
  { id: "align", label: "Align" },
  { id: "page", label: "Page" },
];

/**
 * Affinity-style inspector (wire region 7): 4 equal tabs, body swaps per tab.
 * All four bodies are static chrome through L2; they go live against the
 * document model / a selection in L3 (Page), L4 (Properties), L5 (Text),
 * and L7 (Align).
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
        {insp === "props" && <PropertiesTab />}
        {insp === "text" && <TextTab />}
        {insp === "align" && <AlignTab />}
        {insp === "page" && <PageTab />}
      </div>
    </div>
  );
}
