"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Image as ImageIcon } from "lucide-react";
import type { IntakeError } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";
import type { PhotoTool } from "@/lib/store/photo-store";
import { loadDemoPhoto, openPhotoFile, type OpenPhotoOutcome } from "@/lib/photo/client";
import { TitleBar } from "./TitleBar";
import { ActionBar } from "./ActionBar";
import { TaskRail } from "./TaskRail";
import { PrintStrip } from "./PrintStrip";
import { HistoryDock } from "./HistoryDock";
import { ContextPanel } from "./ContextPanel";
import { ReturnBanner } from "./ReturnBanner";
import { StatusBar } from "./StatusBar";
import { CapabilityBanner } from "./CapabilityBanner";
import { NoPhotoState } from "./NoPhotoState";
import { PhotoCanvas } from "./canvas/PhotoCanvas";
import { PreviewApproveBar } from "./canvas/PreviewApproveBar";

/** The wire's demo order context (deviation #4 — inert, shown only on the
    `/photo?demo=1` entry so the shell reads true to the Section-A wire). */
const DEMO_ORDER_CONTEXT = "From order #58291 · S. Mitchell";

/**
 * `/photo?demo=1` opens the corpus demo photo (plan §3.1). Rehydration runs
 * first (so a persisted document isn't clobbered by a late rehydrate), then the
 * demo loads and the query is cleaned off the URL — the layout editor's
 * DeepLinkInit posture. useSearchParams needs a Suspense boundary under a
 * static route.
 */
function DemoInit({ ready, onDemo }: { ready: boolean; onDemo: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (!ready || fired.current) return;
    if (params.get("demo") !== "1") return;
    fired.current = true;
    onDemo();
    router.replace("/photo");
  }, [ready, params, router, onDemo]);

  return null;
}

/**
 * The photo-editor frame (wire regions 1–7): title bar, action bar, three-column
 * work row (task rail · canvas + print strip · contextual panel), status bar.
 * Fills the viewport under the persistent suite header. Below `lg` it gates
 * honestly (deviation #8 — a precision raster canvas is a station tool). When no
 * document is open it shows the no-photo drop target (open question #5).
 */
export function PhotoEditorShell() {
  const doc = usePhotoStore((s) => s.doc);
  const level = usePhotoStore((s) => s.level);
  const activeTool = usePhotoStore((s) => s.activeTool);
  const returnContext = usePhotoStore((s) => s.returnContext);
  const openDocument = usePhotoStore((s) => s.openDocument);
  const setActiveTool = usePhotoStore((s) => s.setActiveTool);
  const setLevel = usePhotoStore((s) => s.setLevel);
  const undo = usePhotoStore((s) => s.undo);
  const redo = usePhotoStore((s) => s.redo);

  // F2 (PE8): while editing a placed picture, Export is hidden and Done replaces
  // it. If the Export panel was open when the round-trip arrives, fall back to
  // the no-tool state so a now-hidden tool never stays active.
  const returnActive = returnContext != null;
  useEffect(() => {
    if (returnActive && activeTool === "export") setActiveTool("none");
  }, [returnActive, activeTool, setActiveTool]);

  // Persisted store uses the skipHydration pattern — rehydrate on mount, then
  // expose readiness (tests wait on data-hydrated; the demo load waits on it so
  // it doesn't race a late rehydrate).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.resolve(usePhotoStore.persist.rehydrate()).then(() => {
      if (alive) setHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const [banner, setBanner] = useState<IntakeError | null>(null);
  const [opening, setOpening] = useState(false);
  const [orderContext, setOrderContext] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImageBitmap | null>(null);
  const [zoomPct, setZoomPct] = useState<number | null>(null);
  // History dock open state lives here so the print-strip button can toggle it
  // and the dock renders anchored under the strip.
  const [historyOpen, setHistoryOpen] = useState(false);

  // Keyboard undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y). Ignored
  // while typing in a field. undo/redo are stable store actions, so this installs
  // once; the cleanup keeps it StrictMode-safe (no duplicate listener).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Instant local preview — close the previous bitmap when a new open replaces
  // it so decoded frames don't accumulate across opens.
  const handlePreview = useCallback((bitmap: ImageBitmap) => {
    setPreview((prev) => {
      prev?.close?.();
      return bitmap;
    });
  }, []);

  const apply = useCallback(
    (outcome: OpenPhotoOutcome, order: string | null) => {
      if (outcome.ok) {
        openDocument(outcome.doc);
        setOrderContext(order);
        setBanner(null);
      } else {
        setBanner(outcome.error);
      }
    },
    [openDocument],
  );

  const handleOpenFile = useCallback(
    async (file: File) => {
      setBanner(null);
      setOpening(true);
      try {
        apply(await openPhotoFile(file, handlePreview), null);
      } finally {
        setOpening(false);
      }
    },
    [apply, handlePreview],
  );

  const handleOpenDemo = useCallback(async () => {
    setBanner(null);
    setOpening(true);
    try {
      apply(await loadDemoPhoto(handlePreview), DEMO_ORDER_CONTEXT);
    } finally {
      setOpening(false);
    }
  }, [apply, handlePreview]);

  // Rail tiles toggle; clicking the active tile returns to the no-tool state.
  const handleToggleTool = useCallback(
    (tool: PhotoTool) => {
      setActiveTool(activeTool === tool ? "none" : tool);
    },
    [activeTool, setActiveTool],
  );

  const showWorkArea = doc != null || opening;

  return (
    <>
      <Suspense fallback={null}>
        <DemoInit ready={hydrated} onDemo={handleOpenDemo} />
      </Suspense>

      {/* Desktop-minimum gate (deviation #8) — same honest card as the layout
          editor; below lg we gate instead of reflowing a precision canvas. */}
      <div className="flex flex-1 items-center justify-center p-6 lg:hidden">
        <div className="max-w-[360px] rounded-[10px] border border-[#e0e0e0] bg-white p-6 text-center shadow-[0_1px_4px_rgba(0,0,0,.12)]">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[9px] bg-[#f4f4f4]">
            <ImageIcon size={21} strokeWidth={1.8} className="text-[#555]" />
          </div>
          <div className="mt-3 text-[15px] font-semibold text-[#333]">The photo editor needs a bigger screen</div>
          <div className="mt-2 text-[12px] leading-relaxed text-[#888]">
            Precise photo work is built for the in-store station. Open this in a desktop window (about 1024px or wider)
            to edit a photo.
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

      <div
        className="hidden min-h-0 flex-1 flex-col lg:flex"
        data-testid="photo-editor"
        data-hydrated={hydrated ? "true" : "false"}
      >
        <TitleBar doc={doc} orderContext={orderContext} level={level} onSetLevel={setLevel} />
        <CapabilityBanner error={banner} onDismiss={() => setBanner(null)} />
        {doc && (
          <ActionBar
            doc={doc}
            onUndo={undo}
            onRedo={redo}
            onSelectTool={setActiveTool}
            returnActive={returnActive}
          />
        )}

        <div className="flex min-h-0 flex-1">
          {showWorkArea ? (
            <>
              {doc && (
                <TaskRail
                  level={level}
                  activeTool={activeTool}
                  onSelect={handleToggleTool}
                  returnActive={returnActive}
                />
              )}
              <div className="relative flex min-w-0 flex-1 flex-col">
                <ReturnBanner doc={doc} />
                {doc && (
                  <PrintStrip
                    doc={doc}
                    historyOpen={historyOpen}
                    onToggleHistory={() => setHistoryOpen((v) => !v)}
                  />
                )}
                <PhotoCanvas doc={doc} previewBitmap={preview} onZoom={setZoomPct} />
                {doc && <PreviewApproveBar />}
                {doc && (
                  <HistoryDock doc={doc} open={historyOpen} onClose={() => setHistoryOpen(false)} />
                )}
              </div>
              {doc && level !== "simple" && (
                <ContextPanel activeTool={activeTool} onClose={() => setActiveTool("none")} />
              )}
            </>
          ) : (
            <NoPhotoState onFile={handleOpenFile} />
          )}
        </div>

        <StatusBar activeTool={activeTool} opening={opening} zoomPct={zoomPct} hasDoc={doc != null} />
      </div>
    </>
  );
}
