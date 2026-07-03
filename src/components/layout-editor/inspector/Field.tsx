"use client";

import { useRef, useState } from "react";
import { useLayoutStore } from "@/store";
import { formatLen, parseLen } from "@/lib/layout/units";

/** Inspector section label — the wire's `.wf-h` style. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-bold uppercase tracking-[.04em] text-[#5f5f5f]">
      {children}
    </div>
  );
}

/**
 * Display-only inspector row: 10px label over a 30px field — used where the
 * value isn't editable yet (Properties · Transform until L4).
 */
export function Field({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  /** Disabled look (Properties · Transform before anything is selected). */
  muted?: boolean;
}) {
  return (
    <div className="flex-1">
      <div className="mb-[3px] text-[10px] text-[#999]">{label}</div>
      <div
        className={`flex h-[30px] items-center rounded-[5px] border bg-white px-[9px] text-[12px] ${
          muted ? "border-[#dcdcdc] text-[#999]" : "border-[#d6d6d6] text-[#444]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Editable numeric inspector row. Shows the model value until the user types;
 * commits on Enter/blur (Escape reverts). Clamping is the store action's job —
 * the committed value re-renders as clamped.
 *
 * Length fields (the default) are **unit-aware** (plan L11): the model value is
 * always inches, but the row displays and parses the active display unit. Pass
 * `raw` for a non-length value (e.g. rotation degrees) with its own
 * `suffix`/`format`/`ariaUnit`.
 */
export function NumberField({
  label,
  value,
  onCommit,
  testId,
  inputRef,
  raw = false,
  suffix,
  ariaUnit,
  format,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  testId?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Non-length field — skip unit conversion, use the props below verbatim. */
  raw?: boolean;
  /** Unit shown at the row's right edge (raw fields only). */
  suffix?: string;
  /** Unit word for the aria-label (raw fields only). */
  ariaUnit?: string;
  /** Display formatter for the model value (raw fields only). */
  format?: (v: number) => string;
}) {
  const unit = useLayoutStore((s) => s.unit);
  const [draft, setDraft] = useState<string | null>(null);
  // Escape blurs before the cleared draft re-renders — the flag stops the
  // blur-commit from reading the stale draft.
  const escaped = useRef(false);

  // length fields convert inches↔unit; raw fields pass the value through
  const display = raw ? (format ?? String)(value) : formatLen(value, unit);
  const unitSuffix = raw ? (suffix ?? "") : unit;
  const unitWord = raw ? (ariaUnit ?? "") : unit;

  const commit = () => {
    if (escaped.current) {
      escaped.current = false;
      return;
    }
    if (draft === null) return;
    const v = raw ? Number(draft) : parseLen(draft, unit);
    if (Number.isFinite(v)) onCommit(v);
    setDraft(null);
  };

  return (
    <div className="flex-1">
      <div className="mb-[3px] text-[10px] text-[#999]">{label}</div>
      <div className="flex h-[30px] items-center rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[12px] text-[#444] focus-within:border-[#b0b0b0]">
        <input
          ref={inputRef}
          value={draft ?? display}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              escaped.current = true;
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
          inputMode="decimal"
          aria-label={unitWord ? `${label} (${unitWord})` : label}
          data-testid={testId}
          className="w-full min-w-0 bg-transparent outline-none"
        />
        <span className="pl-1 text-[#999]">{unitSuffix}</span>
      </div>
    </div>
  );
}
