/**
 * One ribbon command group (wire 2b): a centered vertical stack of
 * [controls] + [9.5px label], divided from the next group on the right.
 */
export function RibbonGroup({
  label,
  last,
  wide,
  gap7,
  children,
}: {
  label: string;
  /** The band's final group drops its right divider. */
  last?: boolean;
  /** Insert/Layout groups pad 16px horizontally (Home/Text pad 14px). */
  wide?: boolean;
  /** Insert's big-tile groups space controls and label 7px apart, not 6. */
  gap7?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-[6px] ${
        gap7 ? "gap-[7px]" : "gap-[6px]"
      } ${wide ? "px-4" : "px-[14px]"} ${last ? "" : "border-r border-[#ececec]"}`}
    >
      {children}
      <div className="text-[9.5px] text-[#a6a6a6]">{label}</div>
    </div>
  );
}
