"use client";

import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from "lucide-react";
import { FONT_FAMILIES, FONT_SIZES, LINE_SPACINGS, TEXT_STYLES, matchTextStyle } from "@/lib/layout/text";
import { formatIn } from "@/lib/layout/presets";
import { FaceSelect } from "../FaceSelect";
import { useTextTarget } from "../useTextTarget";
import { SectionLabel } from "./Field";

/**
 * Text inspector tab (wire region 7): Character · Paragraph · Style — live
 * against the text target (plan L5). Without one it keeps the wire's at-rest
 * faces (left align shown active), disabled.
 */
export function TextTab() {
  const { target, summary, apply, applyStyle } = useTextTarget();
  const font = summary?.font;
  const align = summary?.align ?? "left";
  const styleKey = target ? matchTextStyle(target.text) : undefined;

  const fieldFace =
    "flex h-[30px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[12px] text-[#555]";

  const toggle = (active: boolean | undefined, disabled: boolean) =>
    `flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border bg-white text-[13px] text-[#555] ${
      active ? "border-brand bg-brand-tint" : "border-[#dcdcdc]"
    } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Character</SectionLabel>
        <div className="mb-2">
          <FaceSelect
            face={font?.family ?? "Motiva Sans"}
            value={font?.family ?? ""}
            options={FONT_FAMILIES.map((f) => ({ value: f.name, label: f.name }))}
            onChange={(v) => apply({ family: v })}
            disabled={!target}
            testId="tab-family"
            label="Font family"
            className={fieldFace}
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <FaceSelect
              face={`${font?.size ?? 11} pt`}
              value={String(font?.size ?? "")}
              options={FONT_SIZES.map((s) => ({ value: String(s), label: `${s} pt` }))}
              onChange={(v) => apply({ size: Number(v) })}
              disabled={!target}
              testId="tab-size"
              label="Font size"
              className={fieldFace}
            />
          </div>
          <div className="flex gap-[5px]">
            <button
              type="button"
              onClick={() => apply({ bold: !font?.bold })}
              disabled={!target}
              aria-pressed={font?.bold}
              data-testid="tab-bold"
              className={`${toggle(font?.bold, !target)} font-bold`}
            >
              B
            </button>
            <button
              type="button"
              onClick={() => apply({ italic: !font?.italic })}
              disabled={!target}
              aria-pressed={font?.italic}
              data-testid="tab-italic"
              className={`${toggle(font?.italic, !target)} italic`}
            >
              I
            </button>
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>Paragraph</SectionLabel>
        <div className="mb-2 flex gap-[5px]">
          {(
            [
              ["left", AlignLeft],
              ["center", AlignCenter],
              ["right", AlignRight],
              ["justify", AlignJustify],
            ] as const
          ).map(([value, Icon]) => {
            const active = align === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => apply({ align: value })}
                disabled={!target}
                aria-pressed={active}
                data-testid={`tab-align-${value}`}
                aria-label={`Align ${value}`}
                className={`flex h-[30px] flex-1 items-center justify-center rounded-[5px] border ${
                  active ? "border-brand bg-[#FBEBEB]" : "border-[#dcdcdc] bg-white"
                } ${target ? "cursor-pointer" : "cursor-not-allowed"}`}
              >
                <Icon
                  size={15}
                  strokeWidth={1.5}
                  className={active ? "text-[#9a1818]" : "text-[#777]"}
                />
              </button>
            );
          })}
        </div>
        <FaceSelect
          face={`Line spacing ${formatIn(summary?.lineSpacing ?? 1.2)}`}
          value={String(summary?.lineSpacing ?? "")}
          options={LINE_SPACINGS.map((v) => ({ value: String(v), label: String(v) }))}
          onChange={(v) => apply({ lineSpacing: Number(v) })}
          disabled={!target}
          testId="tab-line-spacing"
          label="Line spacing"
          className={fieldFace}
        />
      </div>

      <div>
        <SectionLabel>Style</SectionLabel>
        <FaceSelect
          face={target ? (styleKey ? TEXT_STYLES[styleKey].label : "Custom") : "Body · Normal"}
          value={styleKey ?? ""}
          options={[
            { value: "body", label: TEXT_STYLES.body.label },
            { value: "heading", label: TEXT_STYLES.heading.label },
          ]}
          onChange={(v) => applyStyle(v as "body" | "heading")}
          disabled={!target}
          testId="tab-style"
          label="Text style"
          className={fieldFace}
        />
      </div>
    </div>
  );
}
