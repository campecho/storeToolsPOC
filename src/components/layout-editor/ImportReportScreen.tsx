"use client";

import { CheckCircle2 } from "lucide-react";
import { useLayoutStore } from "@/store";
import { PillButton } from "@/components/ui/PillButton";
import { PageThumb } from "./pages/PageThumb";
import { ImportReportPane } from "./panel/ImportReportPane";

/**
 * Full-screen import report (redesign plan Phase 9 — figma
 * "publisher-import-report", decision of record #3): opens over the editor
 * after a `.pub` conversion (the store routes `insp: "import"` here) — left,
 * a preview of the converted document; right, the conversion status, the
 * stats card, and the detailed fidelity report (the same deep-linking report
 * body the old Review pane rendered — a card click closes the screen onto
 * the flagged object). Close returns to the editor with the report still
 * reachable from the banner's View report.
 */

/** Review-size preview tiles (Letter contain-fits ~260 × 336) — the pages
    pane's 88 × 114 navigator tile is too small to judge conversion fidelity. */
const PREVIEW_BUDGET = { w: 260, h: 336 };

export function ImportReportScreen() {
  const report = useLayoutStore((s) => s.importReport);
  const doc = useLayoutStore((s) => s.doc);
  const setInsp = useLayoutStore((s) => s.setInsp);
  const setActivePage = useLayoutStore((s) => s.setActivePage);
  const activePageId = useLayoutStore((s) => s.activePageId);

  if (!report) return null;

  const { converted, degraded, flagged } = report.fidelity;
  const errors = degraded;
  const warnings = flagged + report.overset.length;

  return (
    <div
      data-testid="import-report-screen"
      className="absolute inset-0 z-30 flex flex-col bg-[#f2f2f2]"
    >
      <div className="flex min-h-0 flex-1">
        {/* Converted preview */}
        <div className="flex min-w-0 flex-1 flex-col items-center gap-4 overflow-y-auto bg-[#eaeaea] p-6">
          <div className="text-[14px] text-[#555]">
            Converted Document Preview ({report.source.filename})
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            {doc.pages.map((p, i) => (
              <PageThumb
                key={p.id}
                doc={doc}
                page={p}
                index={i}
                active={p.id === activePageId}
                removable={false}
                onSelect={() => setActivePage(p.id)}
                onRemove={() => {}}
                budget={PREVIEW_BUDGET}
              />
            ))}
          </div>
        </div>

        {/* Report panel */}
        <div className="flex w-[480px] shrink-0 flex-col border-l border-[#ececec] bg-white">
          <div className="shrink-0 border-b border-[#efefef] p-4">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-ok">
              <CheckCircle2 size={18} strokeWidth={1.9} />
              Conversion Complete
            </div>
            <div className="mt-1 truncate text-[18px] font-bold text-[#111]">
              {report.source.filename}
            </div>
            <div
              data-testid="report-stats"
              className="mt-3 grid grid-cols-3 divide-x divide-[#ececec] rounded-[8px] border border-[#ececec] py-3 text-center"
            >
              <div>
                <div className="text-[20px] font-bold text-[#111]">{converted}</div>
                <div className="text-[11px] uppercase tracking-[.05em] text-[#6b6b6b]">
                  Converted
                </div>
              </div>
              <div>
                <div className="text-[20px] font-bold text-brand">{errors}</div>
                <div className="text-[11px] uppercase tracking-[.05em] text-[#6b6b6b]">
                  Degraded
                </div>
              </div>
              <div>
                <div className="text-[20px] font-bold text-warn">{warnings}</div>
                <div className="text-[11px] uppercase tracking-[.05em] text-[#6b6b6b]">
                  Warnings
                </div>
              </div>
            </div>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto p-4"
            onClick={(e) => {
              // a note deep-link locates its object (its own handler runs
              // first — this is the bubble phase) — then close the screen so
              // the selection is visible on the canvas beneath
              if ((e.target as HTMLElement).closest('[data-testid="import-note-link"]')) {
                setInsp("page");
              }
            }}
          >
            <ImportReportPane />
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-[#efefef] p-3">
            <PillButton data-testid="report-close" onClick={() => setInsp("page")}>
              Close
            </PillButton>
            <PillButton
              variant="primary"
              data-testid="report-continue"
              onClick={() => setInsp("page")}
            >
              Continue editing
            </PillButton>
          </div>
        </div>
      </div>
      <div className="flex h-[29px] shrink-0 items-center gap-3 border-t border-[#e0e0e0] bg-chrome-status px-3 text-[12px] text-[#555]">
        ◀ Document View ▶<span className="h-[14px] w-px bg-[#d4d4d4]" />
        Publisher file imported with conversion logs
      </div>
    </div>
  );
}
