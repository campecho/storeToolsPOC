import { useLayoutStore, type InspectorTab } from "@/store";
import { TabStrip, type TabStripItem } from "@/components/ui/TabStrip";
import { LayersPane } from "../panel/LayersPane";
import { MasterPropertiesTab } from "./MasterPropertiesTab";
import { PageTab } from "./PageTab";
import { PreflightTab } from "./PreflightTab";
import { PropertiesTab } from "./PropertiesTab";
import { TextTab } from "./TextTab";

/**
 * Right inspector (redesign plan §2.5, 288px): Page · Text · Layers ·
 * Preflight on the shared TabStrip (decision of record #7); the import
 * report lives on the Quick Import surface at `/` (Phase 11). The
 * Page tab is the properties
 * surface — page setup at rest, object properties with a selection — so the
 * old Properties tab's functions live on without a fifth permanent tab. The
 * old Align tab's actions moved to the Home band's Align group in Phase 3.
 * The Preflight badge counts the live check's issues (Phase 6).
 */
export function Inspector() {
  const insp = useLayoutStore((s) => s.insp);
  const setInsp = useLayoutStore((s) => s.setInsp);
  const hasSelection = useLayoutStore((s) => s.selectedIds.length > 0);
  const masterEditing = useLayoutStore((s) => s.masterEditingId !== null);
  const issueCount = useLayoutStore((s) => s.preflightIssues.length);

  const tabs: TabStripItem<InspectorTab>[] = [
    { id: "page", label: "Page" },
    { id: "text", label: "Text" },
    { id: "layers", label: "Layers" },
    { id: "preflight", label: "Preflight", badge: issueCount },
  ];

  const active = insp;

  return (
    <div className="flex w-[288px] shrink-0 flex-col border-l border-[#ececec] bg-white">
      <TabStrip
        tabs={tabs}
        active={active}
        onSelect={setInsp}
        testIdPrefix="insp"
        stretch
        className="h-[42px] shrink-0 border-b border-[#ececec]"
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {active === "page" &&
          (hasSelection ? (
            <PropertiesTab />
          ) : masterEditing ? (
            <MasterPropertiesTab />
          ) : (
            <PageTab />
          ))}
        {active === "text" && <TextTab />}
        {active === "layers" && <LayersPane />}
        {active === "preflight" && <PreflightTab />}
      </div>
    </div>
  );
}
