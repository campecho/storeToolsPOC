import { useRef, useState } from "react";

/**
 * Panel numeric entry. Every change applies to the document AS IT IS MADE —
 * typing, arrow-stepping, the lot — so the canvas shows the value the field
 * shows, with no deselect or blur needed to see it.
 *
 * The panels' commit discipline survives that as an EDIT RUN: one visit to
 * the field is one run, every commit within it carries the same run id, and
 * history folds them into a single entry (core/store/history.ts). One edit
 * is still one undo step; it is simply live along the way. The run ends when
 * the field is left or Enter is pressed, so a second edit is a second step.
 *
 * Typing passes through states that are not values — "", "-", "1e" — and a
 * below-minimum entry is one the document would reject. Those commit
 * nothing; the draft still shows what was typed, so the digits stay put
 * while the shape waits for something committable.
 *
 * Escape reverts to the value the run began at, dispatched inside that same
 * run — so an abandoned edit still costs exactly one history entry, one
 * whose snapshot and present now agree. Undoing it changes nothing visible;
 * that is the price of applying live and reverting in one step, and it is
 * cheaper than the alternative of a value the canvas would not show.
 */

/** Displayed precision: 3 decimals, float noise and trailing zeros dropped. */
function formatValue(value: number): string {
  return Number(value.toFixed(3)).toString();
}

/**
 * A fresh run id per run — never per field instance. A field that unmounts
 * and remounts (the colour panel switching target, the selection changing)
 * must not hand out an id an earlier run already used, or its first commit
 * would fold into that run's entry instead of opening its own. Randomness at
 * the shell edge, like createObjectId.
 */
function createEditRunId(): string {
  return crypto.randomUUID();
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
  /** `editRun` groups this field's continuous edits into one history entry —
      pass it to `inEditRun` on the action the commit dispatches. */
  onCommit: (next: number, editRun: string) => void;
  disabled?: boolean;
  min?: number;
  step?: number;
  unit?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // The open run and the value it began at: null between runs. A ref, not
  // state — an in-flight run must not be a render behind the keystroke that
  // continues it.
  const runRef = useRef<{ id: string; startValue: number } | null>(null);

  /** The run this edit belongs to, opened on the first commit of a visit. */
  const openRun = (): { id: string; startValue: number } => {
    const open = runRef.current;
    if (open !== null) return open;
    const started = { id: createEditRunId(), startValue: value };
    runRef.current = started;
    return started;
  };

  const commit = (next: number): void => {
    if (next === Number(formatValue(value))) return;
    onCommit(next, openRun().id);
  };

  const change = (text: string): void => {
    setDraft(text);
    const next = Number(text);
    if (text.trim() === "" || !Number.isFinite(next)) return;
    if (min !== undefined && next < min) return;
    commit(next);
  };

  /** Leaving the field, or Enter: the next edit starts its own history entry. */
  const endRun = (): void => {
    setDraft(null);
    runRef.current = null;
  };

  const revert = (): void => {
    const open = runRef.current;
    if (open !== null) commit(open.startValue);
    endRun();
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
        onChange={(e) => change(e.target.value)}
        onBlur={endRun}
        onKeyDown={(e) => {
          if (e.key === "Enter") endRun();
          if (e.key === "Escape") revert();
        }}
      />
      {unit !== undefined && <span className="field-unit">{unit}</span>}
    </label>
  );
}
