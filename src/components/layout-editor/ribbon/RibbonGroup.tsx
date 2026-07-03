/**
 * One ribbon command group (wire 2b, single-row redesign — plan §2,
 * deviation #5): the group's controls sit in one wrapping row, divided from
 * the next group on the right. The wire's 9.5px section title (Clipboard,
 * Font, …) is dropped — the controls are self-explanatory — but the name is
 * kept as the group's `aria-label` so the grouping survives for assistive
 * tech. On narrow viewports the controls wrap *within* the section (the group
 * can shrink below its content width), growing the band downward.
 */
export function RibbonGroup({
  label,
  last,
  wide,
  gap7,
  children,
}: {
  /** Section name — no longer shown; used as the group's accessible label. */
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
      role="group"
      aria-label={label}
      className={`flex min-w-0 flex-wrap content-center items-center justify-center py-[6px] ${
        gap7 ? "gap-[7px]" : "gap-x-[6px] gap-y-1"
      } ${wide ? "px-4" : "px-[14px]"} ${last ? "" : "border-r border-[#ececec]"}`}
    >
      {children}
    </div>
  );
}
