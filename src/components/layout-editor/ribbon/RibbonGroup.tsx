/**
 * One ribbon command group (redesign plan §2.4 — figma ribbon band): the
 * group's controls sit in one wrapping row with the group's caption centered
 * beneath (Clipboard, Font, … — the figma shows the captions, reversing the
 * old wire's deviation #5). On narrow viewports the controls wrap *within*
 * the section, growing the band downward.
 */
export function RibbonGroup({
  label,
  last,
  wide,
  gap7,
  children,
}: {
  /** Section name — shown as the caption under the controls. */
  label: string;
  /** The band's final group drops its right divider. */
  last?: boolean;
  /** Insert groups pad 16px horizontally (Home groups pad 14px). */
  wide?: boolean;
  /** Insert's big-tile groups space controls 7px apart, not 6. */
  gap7?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex min-w-0 flex-col justify-between py-[6px] ${wide ? "px-4" : "px-[14px]"} ${
        last ? "" : "border-r border-[#ececec]"
      }`}
    >
      <div
        className={`flex min-w-0 flex-1 flex-wrap content-center items-center justify-center ${
          gap7 ? "gap-[7px]" : "gap-x-[6px] gap-y-1"
        }`}
      >
        {children}
      </div>
      <div className="mt-[5px] text-center text-[9.5px] leading-none text-[#4d4d4f]">{label}</div>
    </div>
  );
}
