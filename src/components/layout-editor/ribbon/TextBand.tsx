"use client";

import { FONT_FAMILIES, FONT_SIZES, LINE_SPACINGS, TEXT_STYLES, matchTextStyle } from "@/lib/layout/text";
import { formatIn } from "@/lib/layout/presets";
import { FaceSelect } from "../FaceSelect";
import { useTextTarget } from "../useTextTarget";
import { RibbonGroup } from "./RibbonGroup";

/**
 * Text command band (wire 2b · Text): Character · Styles · Spacing ·
 * Text flow. Character, Styles, and line spacing are live against the text
 * target (plan L5).
 * PROTOTYPE-ONLY: paragraph Space and the Text-flow group (Link boxes / Wrap)
 * are inert placeholders for the deferred story-threading slice (plan §6).
 */

/** 26px white pill — static chrome. */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[26px] items-center whitespace-nowrap rounded-[5px] border border-[#e0e0e0] bg-white px-[9px] text-[11px] text-[#666]">
      {children}
    </div>
  );
}

export function TextBand() {
  const { target, apply, applyStyle } = useTextTarget();
  const font = target?.text.font;
  const styleKey = target ? matchTextStyle(target.text) : undefined;

  return (
    <>
      <RibbonGroup label="Character">
        <FaceSelect
          face={font?.family ?? "Motiva Sans"}
          value={font?.family ?? ""}
          options={FONT_FAMILIES.map((f) => ({ value: f.name, label: f.name }))}
          onChange={(v) => apply({ family: v })}
          disabled={!target}
          testId="text-band-family"
          label="Font family"
          className="flex h-6 w-[118px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-2 text-[11px] text-[#555]"
        />
        <FaceSelect
          face={String(font?.size ?? 11)}
          value={String(font?.size ?? "")}
          options={FONT_SIZES.map((s) => ({ value: String(s), label: String(s) }))}
          onChange={(v) => apply({ size: Number(v) })}
          disabled={!target}
          testId="text-band-size"
          label="Font size"
          className="flex h-6 w-11 items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[7px] text-[11px] text-[#555]"
        />
      </RibbonGroup>

      <RibbonGroup label="Styles">
        <FaceSelect
          face={target ? (styleKey ? TEXT_STYLES[styleKey].label : "Custom") : "Paragraph · Normal"}
          value={styleKey ?? ""}
          options={[
            { value: "body", label: TEXT_STYLES.body.label },
            { value: "heading", label: TEXT_STYLES.heading.label },
          ]}
          onChange={(v) => applyStyle(v as "body" | "heading")}
          disabled={!target}
          testId="text-band-style"
          label="Text style"
          className="flex h-[26px] w-[150px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[11px] text-[#555]"
        />
      </RibbonGroup>

      <RibbonGroup label="Spacing">
        <FaceSelect
          face={`Line ${formatIn(target?.text.lineSpacing ?? 1.2)}`}
          value={String(target?.text.lineSpacing ?? "")}
          options={LINE_SPACINGS.map((v) => ({ value: String(v), label: String(v) }))}
          onChange={(v) => apply({ lineSpacing: Number(v) })}
          disabled={!target}
          testId="text-band-line"
          label="Line spacing"
          className="flex h-[26px] items-center rounded-[5px] border border-[#e0e0e0] bg-white px-[9px] text-[11px] text-[#666]"
        />
        <Pill>Space ▾</Pill>
      </RibbonGroup>

      <RibbonGroup label="Text flow" last>
        <div className="flex h-[26px] items-center gap-[6px] whitespace-nowrap rounded-[5px] border border-[#e0e0e0] bg-white px-[9px] text-[11px] text-[#666]">
          Link boxes <span className="text-[#999]">⟶</span>
        </div>
        <Pill>Wrap ▾</Pill>
      </RibbonGroup>
    </>
  );
}
