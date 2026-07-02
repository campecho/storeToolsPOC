"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, PanelsTopLeft } from "lucide-react";
import { useLayoutStore } from "@/store";
import { useEditorKeyboard } from "./useEditorKeyboard";
import { TitleBar } from "./TitleBar";
import { RibbonTabs } from "./ribbon/RibbonTabs";
import { HomeBand } from "./ribbon/HomeBand";
import { InsertBand } from "./ribbon/InsertBand";
import { LayoutBand } from "./ribbon/LayoutBand";
import { TextBand } from "./ribbon/TextBand";
import { ToolPalette } from "./palette/ToolPalette";
import { PagesPane } from "./pages/PagesPane";
import { CanvasViewport } from "./canvas/CanvasViewport";
import { Inspector } from "./inspector/Inspector";
import { StatusBar } from "./StatusBar";

/**
 * Home deep links (plan L3): `/layout?preset=…` starts a fresh document at
 * that size; `/layout?custom=1` starts fresh with the Page tab's width field
 * focused. Rehydration runs first so the link wins over the saved document,
 * then the query is cleaned off the URL.
 */
function DeepLinkInit() {
  const router = useRouter();
  const params = useSearchParams();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    const preset = params.get("preset");
    const custom = params.get("custom");
    if (!preset && !custom) return;
    applied.current = true;
    void Promise.resolve(useLayoutStore.persist.rehydrate()).then(() => {
      const s = useLayoutStore.getState();
      s.resetDoc();
      if (preset) s.applyPreset(preset);
      if (custom) {
        s.setInsp("page");
        s.setFocusPageSize(true);
      }
      router.replace("/layout");
    });
  }, [params, router]);

  return null;
}

/**
 * The layout-editor frame (handoff regions 1–8): title bar, ribbon, work-area
 * row (tool palette · pages pane · canvas · inspector), status bar. Fills the
 * viewport under the persistent suite header; every fixed region is shrink-0
 * and the editor never scrolls the document body.
 */
export function EditorShell() {
  const ribbon = useLayoutStore((s) => s.ribbon);
  useEditorKeyboard();

  return (
    <>
      {/* useSearchParams requires a Suspense boundary under a static route */}
      <Suspense fallback={null}>
        <DeepLinkInit />
      </Suspense>

      {/* Desktop-minimum gate (plan §2, deviation 2): a precision canvas is a
          station tool — below lg we gate honestly instead of reflowing. */}
      <div className="flex flex-1 items-center justify-center p-6 lg:hidden">
        <div className="max-w-[360px] rounded-[10px] border border-[#e0e0e0] bg-white p-6 text-center shadow-[0_1px_4px_rgba(0,0,0,.12)]">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[9px] bg-[#f4f4f4]">
            <PanelsTopLeft size={21} strokeWidth={1.8} className="text-[#555]" />
          </div>
          <div className="mt-3 text-[15px] font-semibold text-[#333]">
            The layout editor needs a bigger screen
          </div>
          <div className="mt-2 text-[12px] leading-relaxed text-[#888]">
            Precise page layout is built for the in-store station. Open this in a desktop window
            (about 1024px or wider) to lay out a publication.
          </div>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-[5px] text-[12px] font-semibold text-brand hover:underline"
          >
            <ChevronLeft size={14} strokeWidth={2} />
            Back to Print Studio
          </Link>
        </div>
      </div>

      <div className="hidden min-h-0 flex-1 flex-col lg:flex" data-testid="layout-editor">
        <TitleBar />
        <RibbonTabs />
        {/* Command band (wire 2b) — content swaps with the active ribbon tab. */}
        <div
          data-testid={`band-${ribbon}`}
          className="flex h-[92px] shrink-0 items-stretch overflow-hidden border-b border-[#e6e6e6] bg-[#f7f7f7]"
        >
          {ribbon === "home" && <HomeBand />}
          {ribbon === "insert" && <InsertBand />}
          {ribbon === "layout" && <LayoutBand />}
          {ribbon === "text" && <TextBand />}
        </div>
        <div className="flex min-h-0 flex-1">
          <ToolPalette />
          <PagesPane />
          <CanvasViewport />
          <Inspector />
        </div>
        <StatusBar />
      </div>
    </>
  );
}
