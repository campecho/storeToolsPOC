/**
 * Left column of Home — "Bring in a file": dropzone, actions, .pub callout,
 * and the new-document size tiles. All placeholder affordances per the wires.
 */

const FILE_CHIPS = ["JPG", "PNG", "HEIC", "SVG", "PDF", "DOCX", "XLSX", "PPTX"];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-[.05em] text-[#5f5f5f]">{children}</div>
  );
}

export function IntakeColumn() {
  return (
    <div className="flex w-full shrink-0 flex-col gap-4 border-b border-[#ececec] p-5 sm:p-[26px] lg:w-[520px] lg:border-b-0 lg:border-r">
      <SectionLabel>Bring in a file</SectionLabel>

      {/* dropzone */}
      <div className="flex h-[196px] flex-col items-center justify-center gap-[11px] rounded-[10px] border-2 border-dashed border-[#c4c4c4] bg-[#fafafa]">
        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-[9px] border-2 border-[#c0c0c0]">
          <div className="h-0 w-0 border-b-[14px] border-l-[9px] border-r-[9px] border-b-[#b4b4b4] border-l-transparent border-r-transparent" />
        </div>
        <div className="text-[15px] font-medium text-[#444]">Drop a customer file to start</div>
        <div className="text-[12px] text-[#8c8c8c]">We detect the type — no need to pick a tool</div>
        <div className="mt-[2px] flex max-w-[400px] flex-wrap justify-center gap-[6px]">
          {FILE_CHIPS.map((chip) => (
            <span key={chip} className="rounded-[4px] border border-[#ddd] px-[7px] py-[2px] text-[11px] text-[#777]">
              {chip}
            </span>
          ))}
          <span className="rounded-[4px] bg-brand px-[7px] py-[2px] text-[11px] text-white">.PUB</span>
          <span className="rounded-[4px] border border-[#ddd] px-[7px] py-[2px] text-[11px] text-[#777]">ZIP</span>
        </div>
      </div>

      {/* actions */}
      <div className="flex gap-[10px]">
        <div className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[6px] bg-brand text-[13px] font-medium text-white hover:bg-brand-press">
          Browse files
        </div>
        <div className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[6px] border border-[#cfcfcf] bg-white text-[13px] font-medium text-[#444] hover:bg-[#f6f6f6]">
          Fetch from an order
        </div>
      </div>

      {/* .pub callout */}
      <div className="flex items-center gap-3 rounded-[8px] border border-brand-border bg-brand-tint p-[13px]">
        <div className="h-[34px] w-[34px] shrink-0 rounded-[6px] border border-[#e6b9b9] bg-white" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-brand-deep">Got an old .pub file?</div>
          <div className="text-[12px] text-brand-muted">Convert your Publisher file — we'll recover the layout.</div>
        </div>
        <div className="cursor-pointer text-[12px] font-semibold text-brand">Convert →</div>
      </div>

      <div className="h-px bg-[#eee]" />

      <SectionLabel>Start a new document or print layout</SectionLabel>

      {/* size tiles */}
      <div className="grid grid-cols-2 gap-[10px]">
        <div className="flex items-center gap-[11px] rounded-[8px] border border-[#e0e0e0] p-3">
          <div className="h-[34px] w-[26px] rounded-[2px] border-[1.5px] border-[#c4c4c4] bg-white" />
          <div>
            <div className="text-[13px] font-semibold text-[#3a3a3a]">Letter</div>
            <div className="text-[11px] text-[#999]">8.5 × 11 in</div>
          </div>
        </div>
        <div className="flex items-center gap-[11px] rounded-[8px] border border-[#e0e0e0] p-3">
          <div className="h-[38px] w-[25px] rounded-[2px] border-[1.5px] border-[#c4c4c4] bg-white" />
          <div>
            <div className="text-[13px] font-semibold text-[#3a3a3a]">Legal</div>
            <div className="text-[11px] text-[#999]">8.5 × 14 in</div>
          </div>
        </div>
        <div className="flex items-center gap-[11px] rounded-[8px] border border-[#e0e0e0] p-3">
          <div className="h-[40px] w-[28px] rounded-[2px] border-[1.5px] border-[#c4c4c4] bg-white" />
          <div>
            <div className="text-[13px] font-semibold text-[#3a3a3a]">Ledger</div>
            <div className="text-[11px] text-[#999]">11 × 17 in</div>
          </div>
        </div>
        <div className="flex cursor-pointer items-center gap-[11px] rounded-[8px] border-[1.5px] border-dashed border-brand bg-brand-tint p-3">
          <div className="flex h-[34px] w-[28px] items-center justify-center rounded-[3px] border-[1.5px] border-dashed border-brand text-[17px] text-brand">
            +
          </div>
          <div>
            <div className="text-[13px] font-semibold text-brand-deep">Custom size</div>
            <div className="text-[11px] text-brand-muted">Define the canvas</div>
          </div>
        </div>
      </div>
    </div>
  );
}
