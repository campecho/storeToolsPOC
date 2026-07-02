/** Inspector section label — the wire's `.wf-h` style. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-bold uppercase tracking-[.04em] text-[#5f5f5f]">
      {children}
    </div>
  );
}

/**
 * Inspector input row: 10px label over a 30px field. Display-only in L1;
 * becomes an editable, unit-aware numeric input when the document model
 * lands (L3).
 */
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1">
      <div className="mb-[3px] text-[10px] text-[#999]">{label}</div>
      <div className="flex h-[30px] items-center rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[12px] text-[#444]">
        {value}
      </div>
    </div>
  );
}
