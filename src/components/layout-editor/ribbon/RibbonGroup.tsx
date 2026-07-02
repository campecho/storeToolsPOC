/**
 * One ribbon command group (wire 2b): a centered vertical stack of
 * [controls] + [9.5px label], divided from the next group on the right.
 */
export function RibbonGroup({
  label,
  last,
  children,
}: {
  label: string;
  /** The band's final group drops its right divider. */
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-[6px] px-[14px] py-[6px] ${
        last ? "" : "border-r border-[#ececec]"
      }`}
    >
      {children}
      <div className="text-[9.5px] text-[#a6a6a6]">{label}</div>
    </div>
  );
}
