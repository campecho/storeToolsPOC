"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { TabStrip, type TabStripItem } from "@/components/ui/TabStrip";
import { TemplatesTab } from "./TemplatesTab";
import { QuickImportTab } from "./QuickImportTab";

/**
 * The picker at `/` (redesign plan Phase 11, decision of record #9): the
 * suite's main page — Templates and Quick Import as sibling tabs of one
 * full-screen surface (the figma frames share one "Tabs / Horizontal"
 * component atop the left column, so the strip renders there via tabsSlot).
 * `/?tab=import` deep-links the Quick Import tab — the editor's import
 * banner "View report" lands there.
 */

type PickerTab = "templates" | "import";

const TABS: TabStripItem<PickerTab>[] = [
  { id: "templates", label: "Templates" },
  { id: "import", label: "Quick Import" },
];

export function PickerScreen() {
  const params = useSearchParams();
  const [tab, setTab] = useState<PickerTab>(
    params.get("tab") === "import" ? "import" : "templates",
  );

  const tabsSlot = (
    <TabStrip
      tabs={TABS}
      active={tab}
      onSelect={setTab}
      testIdPrefix="picker"
      stretch
      className="h-[40px] shrink-0 border-b border-[#ececec]"
    />
  );

  return tab === "templates" ? (
    <TemplatesTab tabsSlot={tabsSlot} />
  ) : (
    <QuickImportTab tabsSlot={tabsSlot} />
  );
}
