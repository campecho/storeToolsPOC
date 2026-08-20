/**
 * Panel choice entry — the enum counterpart to NumberField.
 *
 * A choice has no continuous states to pass through, so there is no edit run
 * here: picking a value is one discrete commit and one history entry, the
 * same discipline the ±90°, reset and lock controls already follow.
 *
 * The picked value is matched back against `options` rather than cast, so
 * this hands the caller one of ITS OWN union members and a value the list
 * does not contain can never reach a reducer.
 */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onCommit,
  disabled = false,
}: {
  label: string;
  value: T;
  /** The schema enum's members, in the order they should read. */
  options: readonly T[];
  onCommit: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const picked = options.find((option) => option === e.target.value);
          if (picked !== undefined) onCommit(picked);
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
