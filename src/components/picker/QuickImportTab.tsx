"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import { importPubFile } from "@/lib/import/client";
import { useLayoutStore } from "@/store";
import { PillButton } from "@/components/ui/PillButton";
import { PageThumb } from "@/components/layout-editor/pages/PageThumb";
import { ImportReportPane } from "@/components/layout-editor/panel/ImportReportPane";

/**
 * Quick Import tab of the picker at `/` (redesign plan Phase 11 — figma
 * "Publisher - Quick Import", both states): the home of publisher file
 * import, absorbing the old Home dropzone and `.pub` callout. Left, the
 * uploader (drag & drop or browse — the conversion pipeline sniffs the type
 * and answers honestly for non-Publisher files); after a conversion, the
 * uploaded-file card, the converted-document preview, and the conversion
 * summary panel — the review surface of record (decision of record #11, the
 * Phase 9 full-screen report retired into this panel). Deep-link rows locate
 * their object and land in the editor; Open in Editor continues to /layout.
 * Replacing a working document that has content asks first (plan §7.3's
 * confirm, applied to the import path).
 */

const FILE_CHIPS = ["JPG", "PNG", "HEIC", "SVG", "PDF", "DOCX", "XLSX", "PPTX"];

/** Review-size preview tiles (Letter contain-fits ~260 × 336) — the pages
    pane's 88 × 114 navigator tile is too small to judge conversion fidelity. */
const PREVIEW_BUDGET = { w: 260, h: 336 };

const DEEP_LINK_TESTIDS = [
  "import-note-link",
  "import-overset-link",
  "import-autofit-link",
  "import-corrected-link",
]
  .map((id) => `[data-testid="${id}"]`)
  .join(",");

type Phase =
  | { kind: "idle" }
  | { kind: "confirm"; file: File; docName: string }
  | { kind: "busy"; filename: string }
  | { kind: "error"; message: string };

function docHasContent(): boolean {
  const doc = useLayoutStore.getState().doc;
  return (
    doc.pages.some((p) => p.layers.some((l) => l.objects.length > 0)) ||
    doc.masters.some((m) => m.objects.length > 0)
  );
}

export function QuickImportTab({ tabsSlot }: { tabsSlot?: React.ReactNode }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const report = useLayoutStore((s) => s.importReport);
  const doc = useLayoutStore((s) => s.doc);
  const activePageId = useLayoutStore((s) => s.activePageId);
  const setActivePage = useLayoutStore((s) => s.setActivePage);
  const resetDoc = useLayoutStore((s) => s.resetDoc);

  const convert = async (file: File) => {
    setPhase({ kind: "busy", filename: file.name });
    const outcome = await importPubFile(file);
    if (!outcome.ok) {
      setPhase({ kind: "error", message: outcome.message });
      return;
    }
    useLayoutStore.getState().openImportedDocument(outcome.doc, outcome.report, outcome.blobs);
    // Stay here: the converted preview and summary panel render from the
    // store's importReport — the user reviews first, then opens the editor.
    setPhase({ kind: "idle" });
  };

  const onPick = async (file: File) => {
    // The saved document only exists in the store after rehydration (the
    // store skips auto-hydration); await it so the confirm sees the real doc.
    await Promise.resolve(useLayoutStore.persist.rehydrate());
    if (docHasContent()) {
      setPhase({ kind: "confirm", file, docName: useLayoutStore.getState().doc.name });
      return;
    }
    await convert(file);
  };

  return (
    <div className="flex min-h-0 flex-1 gap-4 bg-[#ededed] p-4">
      {/* Uploader */}
      <div className="flex w-[280px] shrink-0 flex-col gap-3 self-start rounded-[4px] border border-[#dddddd] bg-white p-4">
        {tabsSlot}
        <div className="text-[14px] font-bold text-[#111]">Quick Import</div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          data-testid="pub-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // re-picking the same file re-fires (AssetsPane pattern)
            if (file) void onPick(file);
          }}
        />
        <button
          type="button"
          data-testid="quick-import-dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void onPick(file);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-[9px] rounded-[10px] border-2 border-dashed border-[#c4c4c4] bg-[#fafafa] px-3 py-6 hover:border-[#a8a8a8]"
        >
          <Upload size={26} strokeWidth={1.6} className="text-[#b4b4b4]" />
          <div className="text-[13px] font-medium text-[#444]">Drop a customer file to start</div>
          <div className="text-[11.5px] text-[#8c8c8c]">
            We detect the type — no need to pick a tool
          </div>
          <div className="mt-[2px] flex flex-wrap justify-center gap-[5px]">
            <span className="rounded-[4px] bg-brand px-[6px] py-[2px] text-[10.5px] text-white">.PUB</span>
            {FILE_CHIPS.map((chip) => (
              <span
                key={chip}
                className="rounded-[4px] border border-[#ddd] px-[6px] py-[2px] text-[10.5px] text-[#777]"
              >
                {chip}
              </span>
            ))}
          </div>
        </button>

        {phase.kind === "error" && (
          <div className="text-[12px] text-brand" data-testid="pub-import-note">
            {phase.message}
          </div>
        )}
        {phase.kind === "confirm" && (
          <div className="flex flex-col gap-2 rounded-[8px] border border-brand-border bg-brand-tint p-3">
            <div className="text-[12px] text-brand-muted" data-testid="pub-import-note">
              Converting replaces the open publication &ldquo;{phase.docName}&rdquo;.
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="pub-confirm-replace"
                className="cursor-pointer text-[12px] font-semibold text-brand hover:underline"
                onClick={() => void convert(phase.file)}
              >
                Replace &amp; convert
              </button>
              <button
                type="button"
                data-testid="pub-confirm-cancel"
                className="cursor-pointer text-[12px] font-medium text-brand-muted hover:underline"
                onClick={() => setPhase({ kind: "idle" })}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-[10px]">
          <PillButton
            variant="primary"
            data-testid="quick-import-browse"
            disabled={phase.kind === "busy"}
            onClick={() => inputRef.current?.click()}
            className="flex-1"
          >
            {phase.kind === "busy" ? "Converting…" : "Browse files"}
          </PillButton>
          {/* PROTOTYPE-ONLY: order fetch is a future suite surface (kept from
              the old Home wires as an inert affordance). */}
          <PillButton disabled className="flex-1">
            Fetch from an order
          </PillButton>
        </div>

        {(phase.kind === "busy" || report) && (
          <div>
            <div className="pb-1 text-[10px] font-semibold uppercase tracking-[.04em] text-[#757575]">
              Uploaded file
            </div>
            {phase.kind === "busy" ? (
              <div
                data-testid="quick-import-progress"
                className="flex flex-col gap-2 rounded-[6px] border border-[#e0e0e0] p-3"
              >
                <div className="flex items-center gap-2 text-[12px] text-[#444]">
                  <FileText size={14} strokeWidth={1.7} className="shrink-0 text-[#757575]" />
                  <span className="min-w-0 truncate">{phase.filename}</span>
                </div>
                <div className="h-[6px] overflow-hidden rounded-full bg-[#eeeeee]">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-brand" />
                </div>
              </div>
            ) : (
              report && (
                <div
                  data-testid="quick-import-file-card"
                  className="flex items-center gap-2 rounded-[6px] border border-[#e0e0e0] p-3"
                >
                  <FileText size={14} strokeWidth={1.7} className="shrink-0 text-[#757575]" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[#444]">
                    {report.source.filename}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-ok">
                    <CheckCircle2 size={13} strokeWidth={2} />
                    Converted
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {report ? (
        <>
          {/* Converted preview */}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-4 overflow-y-auto rounded-[4px] border border-[#dddddd] bg-white p-5">
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

          {/* Conversion summary panel */}
          <div
            data-testid="quick-import-report"
            className="flex w-[380px] shrink-0 flex-col rounded-[4px] border border-[#dddddd] bg-white"
          >
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
                  <div className="text-[20px] font-bold text-[#111]">{report.fidelity.converted}</div>
                  <div className="text-[11px] uppercase tracking-[.05em] text-[#6b6b6b]">
                    Converted
                  </div>
                </div>
                <div>
                  <div className="text-[20px] font-bold text-brand">{report.fidelity.degraded}</div>
                  <div className="text-[11px] uppercase tracking-[.05em] text-[#6b6b6b]">
                    Degraded
                  </div>
                </div>
                <div>
                  <div className="text-[20px] font-bold text-warn">
                    {report.fidelity.flagged + report.overset.length}
                  </div>
                  <div className="text-[11px] uppercase tracking-[.05em] text-[#6b6b6b]">
                    Warnings
                  </div>
                </div>
              </div>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto p-4"
              onClick={(e) => {
                // a deep-link row locates its object (its own handler runs
                // first — this is the bubble phase) — then open the editor so
                // the selection is visible on the canvas
                if ((e.target as HTMLElement).closest(DEEP_LINK_TESTIDS)) {
                  router.push("/layout");
                }
              }}
            >
              <ImportReportPane />
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-[#efefef] p-3">
              <PillButton data-testid="report-discard" onClick={resetDoc}>
                Discard conversion
              </PillButton>
              <PillButton
                variant="primary"
                data-testid="report-continue"
                onClick={() => router.push("/layout")}
              >
                Open in Editor
              </PillButton>
            </div>
          </div>
        </>
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-[4px] border border-[#dddddd] bg-white p-5">
          <div data-testid="quick-import-empty" className="max-w-[400px] text-center">
            <div className="text-[15px] font-semibold text-[#444]">No conversion yet</div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-[#8c8c8c]">
              Drop a Publisher file on the left — the converted document preview and its
              conversion report appear here for review before you open the editor.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
