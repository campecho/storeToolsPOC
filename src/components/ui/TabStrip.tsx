export type TabStripItem<T extends string> = {
  id: T;
  label: string;
  /** issue-count badge (red circle), shown when > 0 — e.g. Preflight */
  badge?: number;
};

type TabStripProps<T extends string> = {
  tabs: TabStripItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  /** data-testid becomes `${testIdPrefix}-${tab.id}` */
  testIdPrefix: string;
  /** equal-width tabs (inspector) vs content-width tabs (menu bar) */
  stretch?: boolean;
  className?: string;
};

/**
 * Horizontal tab strip with the redesign's red active underline and optional
 * count badge. Shared primitive per plan Phase 0 — replaces the four
 * independent tab-strip implementations (ribbon, inspector, side panel,
 * feedback nav) as each surface is rebuilt.
 */
export function TabStrip<T extends string>({
  tabs,
  active,
  onSelect,
  testIdPrefix,
  stretch = false,
  className = "",
}: TabStripProps<T>) {
  return (
    <div className={`flex items-stretch ${className}`}>
      {tabs.map(({ id, label, badge }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          aria-pressed={active === id}
          data-testid={`${testIdPrefix}-${id}`}
          className={`relative flex cursor-pointer items-center justify-center gap-[6px] px-[14px] text-[12px] ${
            stretch ? "flex-1" : ""
          } ${active === id ? "font-semibold text-brand" : "text-[#3d3d3d]"}`}
        >
          {label}
          {badge !== undefined && badge > 0 && (
            <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
              {badge}
            </span>
          )}
          {active === id && <div className="absolute bottom-0 left-3 right-3 h-[3px] bg-brand" />}
        </button>
      ))}
    </div>
  );
}
