"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importPubFile } from "@/lib/import/client";
import { useLayoutStore } from "@/store";

/**
 * The homepage `.pub` callout, live since P1 (plan §10.6 e2e flow): pick a
 * Publisher file → /api/import via the client module → the converted document
 * opens in the layout editor. Replacing a working document that has content
 * asks first (plan §7.3's confirm, applied to the import path).
 */

type Phase =
  | { kind: "idle" }
  | { kind: "confirm"; file: File; docName: string }
  | { kind: "busy" }
  | { kind: "error"; message: string };

function docHasContent(): boolean {
  const doc = useLayoutStore.getState().doc;
  return doc.pages.some((p) => p.objects.length > 0) || doc.masters.some((m) => m.objects.length > 0);
}

export function PubConvertCallout() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const convert = async (file: File) => {
    setPhase({ kind: "busy" });
    const outcome = await importPubFile(file);
    if (!outcome.ok) {
      setPhase({ kind: "error", message: outcome.message });
      return;
    }
    useLayoutStore.getState().openImportedDocument(outcome.doc, outcome.report, outcome.blobs);
    router.push("/layout");
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
    <div className="flex items-center gap-3 rounded-[8px] border border-brand-border bg-brand-tint p-[13px]">
      <input
        ref={inputRef}
        type="file"
        accept=".pub,.puz"
        className="hidden"
        data-testid="pub-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // re-picking the same file re-fires (AssetsPane pattern)
          if (file) void onPick(file);
        }}
      />
      <div className="h-[34px] w-[34px] shrink-0 rounded-[6px] border border-[#e6b9b9] bg-white" />
      <div className="flex-1">
        <div className="text-[13px] font-semibold text-brand-deep">Got an old .pub file?</div>
        {phase.kind === "error" ? (
          <div className="text-[12px] text-brand" data-testid="pub-import-note">
            {phase.message}
          </div>
        ) : phase.kind === "confirm" ? (
          <div className="text-[12px] text-brand-muted" data-testid="pub-import-note">
            Converting replaces the open publication &ldquo;{phase.docName}&rdquo;.
          </div>
        ) : (
          <div className="text-[12px] text-brand-muted">
            Convert your Publisher file — we&rsquo;ll recover the layout.
          </div>
        )}
      </div>
      {phase.kind === "confirm" ? (
        <div className="flex shrink-0 items-center gap-3">
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
      ) : (
        <button
          type="button"
          data-testid="pub-convert-button"
          disabled={phase.kind === "busy"}
          className="cursor-pointer text-[12px] font-semibold text-brand hover:underline disabled:cursor-default disabled:opacity-60"
          onClick={() => inputRef.current?.click()}
        >
          {phase.kind === "busy" ? "Converting…" : "Convert →"}
        </button>
      )}
    </div>
  );
}
