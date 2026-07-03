"use client";

import { useLayoutStore, type PanelTab } from "@/store";
import { PagesPane } from "../pages/PagesPane";
import { AssetsPane } from "./AssetsPane";
import { LayersPane } from "./LayersPane";

/**
 * Left side panel (plan L8): a vertical tab strip — Pages / Assets / Layers,
 * titles rotated 90° clockwise — beside a collapsible content column. Clicking
 * a tab opens the panel to it; clicking the open tab collapses the panel to
 * just the strip. Session state, not persisted.
 */

const TABS: { id: PanelTab; label: string }[] = [
  { id: "pages", label: "Pages" },
  { id: "assets", label: "Assets" },
  { id: "layers", label: "Layers" },
];

export function SidePanel() {
  const panelTab = useLayoutStore((s) => s.panelTab);
  const panelOpen = useLayoutStore((s) => s.panelOpen);
  const togglePanelTab = useLayoutStore((s) => s.togglePanelTab);

  return (
    <div className="flex shrink-0 border-r border-[#ececec]">
      <div
        data-testid="panel-tabs"
        className="flex w-[27px] shrink-0 flex-col items-center gap-[6px] border-r border-[#ececec] bg-[#fafafa] pt-[10px]"
      >
        {TABS.map((t) => {
          const active = panelOpen && panelTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`panel-tab-${t.id}`}
              aria-pressed={active}
              title={active ? `Collapse the ${t.label.toLowerCase()} panel` : t.label}
              onClick={() => togglePanelTab(t.id)}
              className={`cursor-pointer rounded-[5px] px-[3px] py-[10px] text-[10px] font-bold uppercase tracking-[.05em] ${
                active
                  ? "bg-brand-tint text-brand"
                  : "text-[#8a8a8a] hover:bg-[#efefef] hover:text-[#555]"
              }`}
              style={{ writingMode: "vertical-rl" }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {panelOpen && (
        <div data-testid="side-panel" className="flex w-[188px] min-w-0 flex-col">
          {panelTab === "pages" && <PagesPane />}
          {panelTab === "assets" && <AssetsPane />}
          {panelTab === "layers" && <LayersPane />}
        </div>
      )}
    </div>
  );
}
