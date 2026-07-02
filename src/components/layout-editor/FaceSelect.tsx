"use client";

/**
 * Wire-face dropdown: the handoff's pill/field face with an invisible native
 * select layered on top — live behavior without breaking at-rest parity.
 * When the current value isn't in the options (or there's no target yet), a
 * disabled fallback option keeps the select valid.
 */
export function FaceSelect({
  face,
  value,
  options,
  onChange,
  disabled,
  testId,
  label,
  className,
}: {
  face: React.ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  testId?: string;
  label: string;
  /** The visible face's classes — size/border/typography per surface. */
  className: string;
}) {
  return (
    <div className={`relative ${disabled ? "opacity-60" : ""}`}>
      <div className={className}>
        <span className="truncate">{face}</span> <span className="text-[#b0b0b0]">▾</span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        data-testid={testId}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      >
        {!options.some((o) => o.value === value) && (
          <option value={value} disabled>
            {value || "—"}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
