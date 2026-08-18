import { useState } from "react";

/**
 * Panel numeric entry with the panels' commit discipline: typing edits a
 * local draft; Enter or blur commits ONCE (so one dispatch = one history
 * entry); Escape reverts the draft. A non-finite or below-minimum entry
 * reverts instead of committing — panels never dispatch a value the
 * document would reject.
 */

/** Displayed precision: 3 decimals, float noise and trailing zeros dropped. */
function formatValue(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function NumberField({
  label,
  value,
  onCommit,
  disabled = false,
  min,
  step,
  unit,
}: {
  label: string;
  value: number;
  onCommit: (next: number) => void;
  disabled?: boolean;
  min?: number;
  step?: number;
  unit?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (): void => {
    if (draft === null) return;
    setDraft(null);
    const next = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(next)) return;
    if (min !== undefined && next < min) return;
    if (next === Number(formatValue(value))) return;
    onCommit(next);
  };

  return (
    <label className="field">
      {label}
      <input
        type="number"
        aria-label={label}
        value={draft ?? formatValue(value)}
        min={min}
        step={step}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
      />
      {unit !== undefined && <span className="field-unit">{unit}</span>}
    </label>
  );
}
