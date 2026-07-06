"use client";

import { ArrowRight, ChevronRight, FileText } from "lucide-react";
import { useLayoutStore } from "@/store";
import { textContent } from "@/lib/layout/text";
import type { LayoutDocument } from "@/schema";

/**
 * Import report tab (plan §10.4): the P4 fidelity reader. A `.pub` import
 * stashes a structured report in the store; this pane turns it into a review
 * checklist — remapped fonts, text that may overflow, and simplified or
 * dropped elements — with every object-anchored item a deep link that selects
 * the frame and jumps to its page. Only the sections with something to review
 * render; a clean import says so rather than showing an empty panel. This reads
 * the report and never mutates it (overset arrives async from the P4 check).
 */

/** The page an imported object sits on — the deep-link resolver (notes prefer
    their own `pageId`, overset ids always resolve through here). */
function pageOf(doc: LayoutDocument, objectId: string): string | undefined {
  return doc.pages.find((p) => p.objects.some((o) => o.id === objectId))?.id;
}

/** A readable label for a reported frame — its text, else the generic name. */
function frameLabel(doc: LayoutDocument, objectId: string): string {
  for (const p of doc.pages) {
    const o = p.objects.find((x) => x.id === objectId);
    if (!o) continue;
    if (o.type === "text" && o.text) {
      const t = textContent(o.text).trim();
      if (t) return t.length > 24 ? `${t.slice(0, 24)}…` : t;
    }
    break;
  }
  return "Text frame";
}

/** 1-based page number for a frame, or 0 when it can't be found. */
function pageNumberOf(doc: LayoutDocument, objectId: string): number {
  return doc.pages.findIndex((p) => p.objects.some((o) => o.id === objectId)) + 1;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[.05em] text-[#9a9a9a]">
      {children}
    </div>
  );
}

export function ImportReportPane() {
  const report = useLayoutStore((s) => s.importReport);
  const doc = useLayoutStore((s) => s.doc);
  const setActivePage = useLayoutStore((s) => s.setActivePage);
  const setSelection = useLayoutStore((s) => s.setSelection);

  // Rendered only after an import (the tab itself is conditional), but stay
  // honest if the report cleared out from under us.
  if (!report) return null;

  const { converted, degraded, flagged } = report.fidelity;

  // A font counts as remapped only when its family name actually changed —
  // metric-compatible stand-ins keep the source name (there's no numeric tier
  // on fonts; the story lives in `reason`), so those aren't remap noise.
  const remapped = report.fonts.filter((f) => f.mappedTo !== f.source);
  const matched = report.fonts.length - remapped.length;

  // Notes group by tier: 3 = not converted (flag-only), 2 = simplified.
  const notConverted = report.notes.filter((n) => n.tier === 3);
  const simplified = report.notes.filter((n) => n.tier === 2);

  const hasReview =
    remapped.length > 0 ||
    report.overset.length > 0 ||
    notConverted.length > 0 ||
    simplified.length > 0;

  // Deep link: land on the object's page first (clears the old selection),
  // then select the frame — one entry point for notes and overset rows.
  const deepLink = (objectId: string, pageId?: string) => {
    const page = pageId ?? pageOf(doc, objectId);
    if (page) setActivePage(page);
    setSelection([objectId]);
  };

  const summary = [
    `${converted} converted`,
    ...(degraded > 0 ? [`${degraded} need review`] : []),
    ...(flagged > 0 ? [`${flagged} not converted`] : []),
  ].join(" · ");

  const noteRow = (n: (typeof report.notes)[number], key: string) =>
    n.objectId ? (
      <button
        key={key}
        type="button"
        data-testid="import-note-link"
        onClick={() => deepLink(n.objectId!, n.pageId)}
        className="flex w-full cursor-pointer items-start gap-[6px] rounded-[5px] px-2 py-[6px] text-left text-[10.5px] leading-relaxed text-[#555] hover:bg-[#f2f2f2]"
      >
        <span className="min-w-0 flex-1">{n.message}</span>
        <ChevronRight size={13} strokeWidth={1.8} className="mt-[1px] shrink-0 text-[#b6b6b6]" />
      </button>
    ) : (
      <div
        key={key}
        className="rounded-[5px] px-2 py-[6px] text-[10.5px] leading-relaxed text-[#777]"
      >
        {n.message}
      </div>
    );

  return (
    <div data-testid="import-report-pane" className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[#efefef] px-3 pb-[10px] pt-3">
        <div className="flex items-start gap-[6px]">
          <FileText size={13} strokeWidth={1.7} className="mt-[1px] shrink-0 text-[#9a9a9a]" />
          <div className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#555]">
            {report.source.filename}
          </div>
          {report.mode === "fixture" && (
            <span
              data-testid="import-report-fixture"
              className="shrink-0 rounded-[4px] border border-[#e5c07b] bg-[#fdf6e3] px-[5px] py-[1px] text-[9px] font-semibold text-[#7a5b00]"
            >
              Demo mode
            </span>
          )}
        </div>
        <div data-testid="import-report-summary" className="mt-[5px] text-[10px] text-[#9a9a9a]">
          {summary}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {hasReview ? (
          <>
            {report.fonts.length > 0 && (
              <div className="border-b border-[#f2f2f2] px-3 py-[10px]">
                <SectionHeading>Fonts</SectionHeading>
                <div className="flex flex-col gap-[2px]">
                  {remapped.map((f) => (
                    <div key={f.source} className="rounded-[5px] px-2 py-[5px]">
                      <div className="flex items-center gap-[5px] text-[10.5px] text-[#555]">
                        <span className="min-w-0 truncate">{f.source}</span>
                        <ArrowRight size={11} strokeWidth={1.8} className="shrink-0 text-[#b6b6b6]" />
                        <span className="min-w-0 truncate font-medium">{f.mappedTo}</span>
                      </div>
                      <div className="text-[9.5px] leading-relaxed text-[#a4a4a4]">{f.reason}</div>
                    </div>
                  ))}
                  {matched > 0 && (
                    <div className="px-2 py-[3px] text-[9.5px] text-[#a8a8a8]">
                      {matched} font{matched > 1 ? "s" : ""} matched exactly.
                    </div>
                  )}
                </div>
              </div>
            )}

            {report.overset.length > 0 && (
              <div className="border-b border-[#f2f2f2] px-3 py-[10px]">
                <SectionHeading>
                  {report.overset.length} text frame{report.overset.length > 1 ? "s" : ""} may
                  overflow {report.overset.length > 1 ? "their" : "its"} box
                </SectionHeading>
                <div className="flex flex-col gap-[2px]">
                  {report.overset.map((id) => {
                    const n = pageNumberOf(doc, id);
                    return (
                      <button
                        key={id}
                        type="button"
                        data-testid="import-overset-link"
                        onClick={() => deepLink(id)}
                        className="flex w-full cursor-pointer items-center gap-[6px] rounded-[5px] px-2 py-[6px] text-left hover:bg-[#f2f2f2]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10.5px] text-[#555]">
                            {frameLabel(doc, id)}
                          </span>
                          {n > 0 && <span className="block text-[9.5px] text-[#a4a4a4]">Page {n}</span>}
                        </span>
                        <ChevronRight size={13} strokeWidth={1.8} className="shrink-0 text-[#b6b6b6]" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {notConverted.length > 0 && (
              <div className="border-b border-[#f2f2f2] px-3 py-[10px]">
                <SectionHeading>Not converted</SectionHeading>
                <div className="flex flex-col gap-[2px]">
                  {notConverted.map((n, i) => noteRow(n, `t3-${i}`))}
                </div>
              </div>
            )}

            {simplified.length > 0 && (
              <div className="border-b border-[#f2f2f2] px-3 py-[10px]">
                <SectionHeading>Simplified</SectionHeading>
                <div className="flex flex-col gap-[2px]">
                  {simplified.map((n, i) => noteRow(n, `t2-${i}`))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div
            data-testid="import-report-clean"
            className="px-3 py-3 text-[10px] leading-relaxed text-[#a0a0a0]"
          >
            Imported cleanly — nothing needs review.
          </div>
        )}
      </div>
    </div>
  );
}
