"use client";

import { useMemo, useState } from "react";
import { useLayoutStore } from "@/store";
import { Modal } from "@/components/ui/Modal";
import { PillButton } from "@/components/ui/PillButton";
import { findMatches } from "@/lib/layout/find-replace";

/**
 * Find & Replace (redesign plan Phase 7 — figma dialog on "Home - Page Tab"
 * v2): live results as you type, Match case checkbox, the GREP toggle
 * (decision of record #6 — a real RegExp with invalid patterns reported),
 * result rows that locate their frame, and Replace All as one undo step.
 * Matching runs within styled runs, so a hit spanning two styles is out of
 * scope for the POC — the footnote says so.
 */
export function FindReplaceDialog({ onClose }: { onClose: () => void }) {
  const doc = useLayoutStore((s) => s.doc);
  const setActivePage = useLayoutStore((s) => s.setActivePage);
  const setSelection = useLayoutStore((s) => s.setSelection);
  const setMasterEditing = useLayoutStore((s) => s.setMasterEditing);
  const replaceAllText = useLayoutStore((s) => s.replaceAllText);

  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [regex, setRegex] = useState(false);
  const [lastReplaced, setLastReplaced] = useState<number | null>(null);

  const result = useMemo(
    () => findMatches(doc, query, { matchCase, regex }),
    [doc, query, matchCase, regex],
  );

  const locate = (m: (typeof result.matches)[number]) => {
    if (m.pageNo === 0) {
      setMasterEditing(m.pageId); // master hits open that master for editing
    } else {
      setMasterEditing(null);
      setActivePage(m.pageId);
    }
    setSelection([m.objectId]);
  };

  const field =
    "w-full rounded-[4px] border px-2 py-[6px] text-[12px] text-[#111] outline-none focus:border-info";

  return (
    <Modal title="Find & Replace" onClose={onClose} testId="find-replace">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[.04em] text-[#757575]">
            Find
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLastReplaced(null);
            }}
            data-testid="find-input"
            className={`${field} border-[#cccccc]`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[.04em] text-[#757575]">
            Replace with
          </span>
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            data-testid="replace-input"
            className={`${field} border-[#cccccc]`}
          />
        </label>

        <div className="flex items-center gap-4 text-[11.5px] text-[#333]">
          <label className="flex cursor-pointer items-center gap-[6px]">
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
              data-testid="find-match-case"
            />
            Match case
          </label>
          <label className="flex cursor-pointer items-center gap-[6px]">
            <input
              type="checkbox"
              checked={regex}
              onChange={(e) => setRegex(e.target.checked)}
              data-testid="find-grep"
            />
            Use GREP Regular Expressions
          </label>
        </div>

        <div className="flex flex-col gap-[6px]">
          <span
            className="text-[10px] font-semibold uppercase tracking-[.04em] text-[#757575]"
            data-testid="find-results-heading"
          >
            {result.error
              ? "Invalid pattern"
              : `Results (${result.total} instance${result.total === 1 ? "" : "s"} found)`}
          </span>
          {result.error && (
            <div className="rounded-[6px] bg-err-tint px-2 py-[6px] text-[11px] text-[#a30000]">
              {result.error}
            </div>
          )}
          <div className="flex max-h-[150px] flex-col gap-[4px] overflow-y-auto">
            {result.matches.map((m) => (
              <button
                key={m.objectId}
                type="button"
                onClick={() => locate(m)}
                data-testid="find-result-row"
                className="cursor-pointer rounded-[6px] bg-[#f9f9f9] px-2 py-[6px] text-left text-[11px] text-[#333] hover:bg-[#ecf4fd]"
              >
                {m.where}: &ldquo;{m.snippet}&rdquo;
                {m.count > 1 && <span className="text-[#8f8f8f]"> · {m.count}×</span>}
              </button>
            ))}
          </div>
          <span className="text-[9.5px] leading-relaxed text-[#a8a8a8]">
            Matches within one text style — a hit spanning two styles isn&rsquo;t found.
          </span>
        </div>

        {lastReplaced !== null && (
          <div
            data-testid="replace-done"
            className="rounded-[6px] bg-ok-tint px-2 py-[6px] text-[11px] text-ok"
          >
            Replaced {lastReplaced} instance{lastReplaced === 1 ? "" : "s"}.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <PillButton size="sm" onClick={onClose}>
            Cancel
          </PillButton>
          <PillButton
            size="sm"
            variant="primary"
            disabled={result.total === 0}
            data-testid="replace-all"
            onClick={() => {
              const n = result.total;
              replaceAllText(query, replacement, { matchCase, regex });
              setLastReplaced(n);
            }}
          >
            Replace All
          </PillButton>
        </div>
      </div>
    </Modal>
  );
}
