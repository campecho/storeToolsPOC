"use client";

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Clipboard,
  Copy,
  List,
  Scissors,
  Search,
} from "lucide-react";
import { useLayoutStore } from "@/store";
import { FONT_FAMILIES, FONT_SIZES, TEXT_STYLES, matchTextStyle } from "@/lib/layout/text";
import { FaceSelect } from "../FaceSelect";
import { useTextTarget } from "../useTextTarget";
import { RibbonGroup } from "./RibbonGroup";

/**
 * Home command band (wire 2b · Home): Clipboard · Font · Paragraph · Styles ·
 * Editing. Clipboard is live (plan L13) — Paste/Cut/Copy act on the selection
 * and the session clipboard, with real enabled/disabled states. Font/
 * Paragraph/Styles are live against the text target (plan L5) — the frame
 * being edited or the selected text frame — and fall back to the wire's
 * at-rest faces, disabled, when there is none. Controls sit in one row per
 * group and wrap within it (plan §2, deviation #5) — the wire's big Paste
 * tile and stacked columns flatten to uniform pills.
 * PROTOTYPE-ONLY: the Editing group, the list/¶ controls, and Styles'
 * "+ New" are inert chrome for later slices (plan §6).
 */

/** Static command pill — icon + label chrome (the Editing group). */
function Cmd({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-6 items-center gap-[5px] whitespace-nowrap rounded-[5px] border border-[#e0e0e0] bg-white px-[7px] text-[10.5px] text-[#666]">
      {icon}
      {children}
    </div>
  );
}

/** Clickable command pill with a disabled state (the live Clipboard group, L13). */
function CmdBtn({
  icon,
  children,
  onClick,
  disabled,
  testId,
  label,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-testid={testId}
      className={`flex h-6 items-center gap-[5px] whitespace-nowrap rounded-[5px] border border-[#e0e0e0] bg-white px-[7px] text-[10.5px] text-[#666] ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[#c9c9c9]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/** 26×24 white icon button — static chrome or a live toggle. */
function IconBtn({
  children,
  wide,
  active,
  disabled,
  onClick,
  testId,
  label,
}: {
  children: React.ReactNode;
  wide?: boolean;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  testId?: string;
  label?: string;
}) {
  const base = `flex h-6 items-center justify-center rounded-[5px] border bg-white ${
    wide ? "w-[30px]" : "w-[26px]"
  } ${active ? "border-brand bg-brand-tint" : "border-[#dcdcdc]"}`;
  if (!onClick) {
    return <div className={`${base} text-[#555]`}>{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      data-testid={testId}
      className={`${base} text-[#555] ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}

export function HomeBand() {
  const { target, summary, apply, applyStyle } = useTextTarget();
  const font = summary?.font;
  const styleKey = target ? matchTextStyle(target.text) : undefined;

  // Clipboard (plan L13): Copy/Cut track the selection, Paste tracks the clipboard
  const hasSelection = useLayoutStore((s) => s.selectedIds.length > 0);
  const hasClipboard = useLayoutStore((s) => s.clipboard.length > 0);
  const copySelection = useLayoutStore((s) => s.copySelection);
  const cutSelection = useLayoutStore((s) => s.cutSelection);
  const pasteClipboard = useLayoutStore((s) => s.pasteClipboard);

  return (
    <>
      <RibbonGroup label="Clipboard">
        <CmdBtn
          icon={<Clipboard size={12} strokeWidth={1.7} className="text-[#777]" />}
          onClick={pasteClipboard}
          disabled={!hasClipboard}
          testId="clip-paste"
          label="Paste"
        >
          Paste
        </CmdBtn>
        <CmdBtn
          icon={<Scissors size={12} strokeWidth={1.7} className="text-[#777]" />}
          onClick={cutSelection}
          disabled={!hasSelection}
          testId="clip-cut"
          label="Cut"
        >
          Cut
        </CmdBtn>
        <CmdBtn
          icon={<Copy size={12} strokeWidth={1.7} className="text-[#777]" />}
          onClick={copySelection}
          disabled={!hasSelection}
          testId="clip-copy"
          label="Copy"
        >
          Copy
        </CmdBtn>
      </RibbonGroup>

      <RibbonGroup label="Font">
        <FaceSelect
          face={font?.family ?? "Motiva Sans"}
          value={font?.family ?? ""}
          options={FONT_FAMILIES.map((f) => ({ value: f.name, label: f.name }))}
          onChange={(v) => apply({ family: v })}
          disabled={!target}
          testId="font-family"
          label="Font family"
          className="flex h-6 w-[118px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-2 text-[11px] text-[#555]"
        />
        <FaceSelect
          face={String(font?.size ?? 11)}
          value={String(font?.size ?? "")}
          options={FONT_SIZES.map((s) => ({ value: String(s), label: String(s) }))}
          onChange={(v) => apply({ size: Number(v) })}
          disabled={!target}
          testId="font-size"
          label="Font size"
          className="flex h-6 w-11 items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[7px] text-[11px] text-[#555]"
        />
        <IconBtn
          active={font?.bold}
          disabled={!target}
          onClick={() => apply({ bold: !font?.bold })}
          testId="tog-bold"
          label="Bold"
        >
          <span className="text-[12px] font-bold">B</span>
        </IconBtn>
        <IconBtn
          active={font?.italic}
          disabled={!target}
          onClick={() => apply({ italic: !font?.italic })}
          testId="tog-italic"
          label="Italic"
        >
          <span className="text-[12px] italic">I</span>
        </IconBtn>
        <IconBtn
          active={font?.underline}
          disabled={!target}
          onClick={() => apply({ underline: !font?.underline })}
          testId="tog-underline"
          label="Underline"
        >
          <span className="text-[12px] underline">U</span>
        </IconBtn>
        {/* Font color — the swatch reads the frame's dominant ink (schema v2
            renders per-run color); a picker UI is a later slice. */}
        <IconBtn wide>
          <span className="flex flex-col items-center leading-none">
            <span className="text-[11px] font-bold">A</span>
            <span
              className="mt-[1px] h-[3px] w-[15px] rounded-[1px]"
              style={{ backgroundColor: summary?.color ?? "var(--color-brand)" }}
            />
          </span>
        </IconBtn>
      </RibbonGroup>

      <RibbonGroup label="Paragraph">
        {(
          [
            ["left", AlignLeft],
            ["center", AlignCenter],
            ["right", AlignRight],
            ["justify", AlignJustify],
          ] as const
        ).map(([align, Icon]) => (
          <IconBtn
            key={align}
            active={summary?.align === align}
            disabled={!target}
            onClick={() => apply({ align })}
            testId={`align-${align}`}
            label={`Align ${align}`}
          >
            <Icon size={15} strokeWidth={1.5} className="text-[#666]" />
          </IconBtn>
        ))}
        <IconBtn>
          <List size={15} strokeWidth={1.5} className="text-[#666]" />
        </IconBtn>
        <IconBtn>
          <span className="text-[9px] font-bold text-[#666]">1.</span>
        </IconBtn>
        <IconBtn>
          <span className="text-[12px] text-[#666]">¶</span>
        </IconBtn>
      </RibbonGroup>

      <RibbonGroup label="Styles">
        <FaceSelect
          face={target ? (styleKey ? TEXT_STYLES[styleKey].label : "Custom") : "Body · Normal"}
          value={styleKey ?? ""}
          options={[
            { value: "body", label: TEXT_STYLES.body.label },
            { value: "heading", label: TEXT_STYLES.heading.label },
          ]}
          onChange={(v) => applyStyle(v as "body" | "heading")}
          disabled={!target}
          testId="style-select"
          label="Text style"
          className="flex h-6 w-[130px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[11px] text-[#555]"
        />
        <button
          type="button"
          onClick={() => applyStyle("heading")}
          disabled={!target}
          data-testid="style-heading"
          className={`flex h-6 items-center whitespace-nowrap rounded-[5px] border border-[#e0e0e0] bg-white px-2 text-[11px] font-bold text-[#555] ${
            target ? "cursor-pointer hover:border-[#c9c9c9]" : "cursor-not-allowed opacity-60"
          }`}
        >
          Heading
        </button>
        <div className="flex h-6 items-center whitespace-nowrap rounded-[5px] border border-[#e0e0e0] bg-white px-2 text-[10px] text-[#888]">
          + New
        </div>
      </RibbonGroup>

      <RibbonGroup label="Editing" last>
        <Cmd icon={<Search size={12} strokeWidth={1.8} className="text-[#777]" />}>Find</Cmd>
        <Cmd>Replace…</Cmd>
      </RibbonGroup>
    </>
  );
}
