/**
 * One ribbon command group (wire 2b, single-row redesign — plan §2,
 * deviation #5): the group's controls sit in one row above the 9.5px label,
 * divided from the next group on the right. On narrow viewports the controls
 * wrap *within* the section (the group can shrink below its content width),
 * growing the band downward instead of clipping.
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
  /** Insert's big-tile groups space controls 7px apart, not 6. */
  gap7?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col items-center py-[6px] ${wide ? "px-4" : "px-[14px]"} ${
        last ? "" : "border-r border-[#ececec]"
      }`}
    >
      <div
        className={`flex flex-1 flex-wrap content-center items-center justify-center ${
          gap7 ? "gap-[7px]" : "gap-x-[6px] gap-y-1"
        }`}
      >
        {children}
      </div>
      <div className="pt-[5px] text-[9.5px] text-[#a6a6a6]">{label}</div>
    </div>
  );
}
