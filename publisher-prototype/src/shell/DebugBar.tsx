import { useEffect, useRef, useState } from "react";
import { clampZoom, fitZoom, zoomInStep, zoomOutStep, type Size } from "../core/geometry/viewport";
import { deserializeDocument, serializeDocument } from "../core/model";
import { effectivePageSetup } from "../core/render/pageSetup";
import {
  documentLoadedCommitted,
  penAnchorRetracted,
  redoCommitted,
  selectDocument,
  stressFixtureCleared,
  stressFixtureLoaded,
  undoCommitted,
  zoomFitCommitted,
  zoomSetCommitted,
  zoomStepCommitted,
} from "../core/store";
import type { AppMode } from "./App";
import { buildStressFixture } from "./debug/stressFixture";
import { useFps } from "./debug/useFps";
import { useAppDispatch, useAppSelector } from "./hooks";
import kitchenSinkRaw from "../../fixtures/kitchen-sink.json?raw";
import minimalRaw from "../../fixtures/minimal.json?raw";
import photoSingleImageRaw from "../../fixtures/photo-single-image.json?raw";

/**
 * The debug bar (PLAN.md §6.6): model-development controls that are not
 * part of the specified surface — the mode switch, the §6.6 JSON round-trip
 * (export/import/fixtures), undo/redo, page stepping, and the viewport
 * controls, alignment probe, and §6.2 spike-gate stress fixture with its FPS
 * readout. Deliberately plain.
 *
 * Every load path — import and fixtures alike — goes through
 * deserializeDocument, the model's one migrate-on-read door; parse errors
 * surface inline in the bar.
 */
export function DebugBar({
  mode,
  onModeChange,
  showProbe,
  onProbeChange,
  vpSize,
  pageIndex,
  onPageIndexChange,
}: {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  showProbe: boolean;
  onProbeChange: (show: boolean) => void;
  vpSize: Size;
  pageIndex: number;
  onPageIndexChange: (pageIndex: number) => void;
}) {
  const dispatch = useAppDispatch();
  const viewport = useAppSelector((s) => s.viewport);
  const doc = useAppSelector(selectDocument);
  // While a pen draft is active, undo retracts one anchor per press (the
  // pen contract's per-gesture rule) and leaves document history alone;
  // redo is unavailable — retracted anchors are gone.
  const penDrafting = useAppSelector((s) => s.pen.anchors.length > 0);
  const canUndo = useAppSelector((s) => s.document.past.length > 0) || penDrafting;
  const canRedo = useAppSelector((s) => s.document.future.length > 0) && !penDrafting;
  // The stress fixture is a page-0 debug tool; its button and FPS probe key
  // off the first page's objects regardless of the rendered page.
  const stressCount = doc.pages[0]?.objects.length ?? 0;
  const fps = useFps(stressCount > 0);
  const pageCount = doc.pages.length;
  const setup = effectivePageSetup(doc, pageIndex);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoomText, setZoomText] = useState("");
  const zoomPercent = `${Math.round(viewport.zoom * 100)}%`;
  useEffect(() => setZoomText(zoomPercent), [zoomPercent]);

  const commitZoomText = () => {
    const parsed = Number.parseFloat(zoomText.replace("%", ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      const zoom = clampZoom(parsed / 100);
      dispatch(zoomSetCommitted({ zoom, pan: viewport.pan }));
      // Re-sync explicitly: the effect below only fires when the rounded
      // percent changes, which typed input ("100.4", "63") need not do.
      setZoomText(`${Math.round(zoom * 100)}%`);
    } else {
      setZoomText(zoomPercent);
    }
  };

  const loadDocumentText = (text: string) => {
    try {
      dispatch(documentLoadedCommitted(deserializeDocument(text)));
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  };

  const exportDocument = () => {
    const blob = new Blob([serializeDocument(doc)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${doc.name || "document"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="debug-bar">
      <span className="debug-group" role="group" aria-label="Mode">
        <button aria-pressed={mode === "layout"} onClick={() => onModeChange("layout")}>
          Layout
        </button>
        <button aria-pressed={mode === "photo"} onClick={() => onModeChange("photo")}>
          Photo
        </button>
      </span>
      <span className="debug-group" role="group" aria-label="Zoom">
        <button
          aria-label="Zoom out"
          onClick={() =>
            dispatch(zoomStepCommitted({ zoom: zoomOutStep(viewport.zoom), pan: viewport.pan }))
          }
        >
          −
        </button>
        <input
          aria-label="Zoom percent"
          size={5}
          value={zoomText}
          onChange={(e) => setZoomText(e.target.value)}
          onBlur={commitZoomText}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitZoomText();
          }}
        />
        <button
          aria-label="Zoom in"
          onClick={() =>
            dispatch(zoomStepCommitted({ zoom: zoomInStep(viewport.zoom), pan: viewport.pan }))
          }
        >
          +
        </button>
        <button
          onClick={() =>
            dispatch(
              zoomFitCommitted({
                zoom: fitZoom(setup.size.w, setup.size.h, setup.bleed, vpSize.w, vpSize.h),
                pan: { x: 0, y: 0 },
              }),
            )
          }
        >
          Fit
        </button>
      </span>
      <span className="debug-group" role="group" aria-label="Page">
        <button
          aria-label="Previous page"
          disabled={pageIndex <= 0}
          onClick={() => onPageIndexChange(pageIndex - 1)}
        >
          ‹
        </button>
        <span data-testid="page-indicator">
          page {pageIndex + 1}/{pageCount}
        </span>
        <button
          aria-label="Next page"
          disabled={pageIndex >= pageCount - 1}
          onClick={() => onPageIndexChange(pageIndex + 1)}
        >
          ›
        </button>
      </span>
      <span className="debug-group" role="group" aria-label="History">
        <button
          disabled={!canUndo}
          onClick={() => dispatch(penDrafting ? penAnchorRetracted() : undoCommitted())}
        >
          Undo
        </button>
        <button disabled={!canRedo} onClick={() => dispatch(redoCommitted())}>
          Redo
        </button>
      </span>
      <span className="debug-group" role="group" aria-label="Document round-trip">
        <button onClick={exportDocument}>Export</button>
        <button onClick={() => fileInputRef.current?.click()}>Import</button>
        <input
          ref={fileInputRef}
          aria-label="Import document file"
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            void file.text().then(loadDocumentText, (error: unknown) => {
              setLoadError(error instanceof Error ? error.message : String(error));
            });
          }}
        />
        <button onClick={() => loadDocumentText(minimalRaw)}>Minimal</button>
        <button onClick={() => loadDocumentText(kitchenSinkRaw)}>Kitchen sink</button>
        <button onClick={() => loadDocumentText(photoSingleImageRaw)}>Photo image</button>
        {loadError !== null && (
          <span className="debug-error" role="alert">
            {loadError}
            <button aria-label="Dismiss load error" onClick={() => setLoadError(null)}>
              ×
            </button>
          </span>
        )}
      </span>
      <label className="debug-group">
        <input type="checkbox" checked={showProbe} onChange={(e) => onProbeChange(e.target.checked)} />
        overlay probe
      </label>
      <span className="debug-group" role="group" aria-label="Stress fixture">
        {stressCount === 0 ? (
          <button onClick={() => dispatch(stressFixtureLoaded(buildStressFixture()))}>
            Load stress fixture
          </button>
        ) : (
          <button onClick={() => dispatch(stressFixtureCleared())}>
            Clear stress fixture ({stressCount})
          </button>
        )}
        {fps !== null && <span data-testid="fps">{fps} fps</span>}
      </span>
    </div>
  );
}
