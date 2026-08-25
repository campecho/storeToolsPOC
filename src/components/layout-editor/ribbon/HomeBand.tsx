"use client";

import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  BringToFront,
  Clipboard,
  Copy,
  List,
  RotateCcw,
  RotateCw,
  Scissors,
  Search,
  SendToBack,
} from "lucide-react";
import { useState } from "react";
import { useLayoutStore } from "@/store";
import { FindReplaceDialog } from "../FindReplaceDialog";
import type { AlignKind } from "@/lib/layout/align";
import { FONT_FAMILIES, FONT_SIZES, TEXT_STYLES, matchTextStyle } from "@/lib/layout/text";
import { FaceSelect } from "../FaceSelect";
import { useTextTarget } from "../useTextTarget";
import { RibbonGroup } from "./RibbonGroup";

/**
 * Home command band (redesign plan §2.4 — figma Home ribbon): Clipboard ·
 * Font · Paragraph · Styles · Align · Arrange · Editing. Clipboard is live
 * (plan L13); Font/Paragraph/Styles are live against the text target (plan
 * L5) and fall back to at-rest faces, disabled, when there is none. Align
 * and Arrange carry the object actions from the retired Arrange tab (plan
 * L7/L10) — selection alignment, z-order, and rotation — per decision of
 * record #1: the old tab's functions rehome rather than drop.
 * The Editing group opens Find & Replace (Phase 7).
 * PROTOTYPE-ONLY: the list/¶ controls and Styles' "+ New" are inert chrome.
 */

const OBJECT_ALIGNS: { kind: AlignKind; label: string; testId: string; Icon: typeof AlignStartVertical }[] = [
  { kind: "left", label: "Align left edges", testId: "arrange-align-left", Icon: AlignStartVertical },
  { kind: "centerH", label: "Align horizontal centers", testId: "arrange-align-centerh", Icon: AlignCenterVertical },
  { kind: "right", label: "Align right edges", testId: "arrange-align-right", Icon: AlignEndVertical },
  { kind: "top", label: "Align top edges", testId: "arrange-align-top", Icon: AlignStartHorizontal },
  { kind: "centerV", label: "Align vertical centers", testId: "arrange-align-centerv", Icon: AlignCenterHorizontal },
  { kind: "bottom", label: "Align bottom edges", testId: "arrange-align-bottom", Icon: AlignEndHorizontal },
];

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
  const [findOpen, setFindOpen] = useState(false);
  const { target, summary, apply, applyStyle } = useTextTarget();
  const font = summary?.font;
  const styleKey = target ? matchTextStyle(target.text) : undefined;

  // Clipboard (plan L13): Copy/Cut track the selection, Paste tracks the clipboard
  const hasSelection = useLayoutStore((s) => s.selectedIds.length > 0);
  const hasClipboard = useLayoutStore((s) => s.clipboard.length > 0);
  const copySelection = useLayoutStore((s) => s.copySelection);
  const cutSelection = useLayoutStore((s) => s.cutSelection);
  const pasteClipboard = useLayoutStore((s) => s.pasteClipboard);

  // Align/Arrange (rehomed from the retired Arrange tab + Align inspector
  // tab, plan L7/L10 — decision of record #1: functions move, never drop)
  const selectedCount = useLayoutStore((s) => s.selectedIds.length);
  const alignRel = useLayoutStore((s) => s.alignRel);
  const setAlignRel = useLayoutStore((s) => s.setAlignRel);
  const reorder = useLayoutStore((s) => s.reorder);
  const rotateSelection = useLayoutStore((s) => s.rotateSelection);
  const alignSelection = useLayoutStore((s) => s.alignSelection);
  const distributeSelection = useLayoutStore((s) => s.distributeSelection);
  const none = selectedCount === 0;
  const alignDisabled = selectedCount < (alignRel === "selection" ? 2 : 1);
  const distributeDisabled = selectedCount < 3;

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

      <RibbonGroup label="Align">
        {OBJECT_ALIGNS.map(({ kind, label, testId, Icon }) => (
          <IconBtn
            key={kind}
            wide
            onClick={() => alignSelection(kind)}
            disabled={alignDisabled}
            testId={testId}
            label={label}
          >
            <Icon size={15} strokeWidth={1.6} className="text-[#666]" />
          </IconBtn>
        ))}
        <CmdBtn
          onClick={() => distributeSelection("h")}
          disabled={distributeDisabled}
          testId="distribute-h"
          label="Distribute horizontally"
        >
          Dist H
        </CmdBtn>
        <CmdBtn
          onClick={() => distributeSelection("v")}
          disabled={distributeDisabled}
          testId="distribute-v"
          label="Distribute vertically"
        >
          Dist V
        </CmdBtn>
        <FaceSelect
          face={alignRel === "page" ? "To page" : "To selection"}
          value={alignRel}
          options={[
            { value: "page", label: "Page" },
            { value: "selection", label: "Selection" },
          ]}
          onChange={(v) => setAlignRel(v as "page" | "selection")}
          testId="align-rel"
          label="Align relative to"
          className="flex h-6 items-center justify-between gap-1 rounded-[5px] border border-[#d6d6d6] bg-white px-[7px] text-[10.5px] text-[#555]"
        />
      </RibbonGroup>

      <RibbonGroup label="Arrange">
        <IconBtn wide onClick={() => reorder("front")} disabled={none} testId="arrange-front" label="Bring to front">
          <BringToFront size={15} strokeWidth={1.6} />
        </IconBtn>
        <IconBtn wide onClick={() => reorder("forward")} disabled={none} testId="arrange-forward" label="Bring forward">
          <ArrowUp size={15} strokeWidth={1.6} />
        </IconBtn>
        <IconBtn wide onClick={() => reorder("backward")} disabled={none} testId="arrange-backward" label="Send backward">
          <ArrowDown size={15} strokeWidth={1.6} />
        </IconBtn>
        <IconBtn wide onClick={() => reorder("back")} disabled={none} testId="arrange-back" label="Send to back">
          <SendToBack size={15} strokeWidth={1.6} />
        </IconBtn>
        <IconBtn wide onClick={() => rotateSelection("left")} disabled={none} testId="arrange-rotate-left" label="Rotate 90° left">
          <RotateCcw size={15} strokeWidth={1.6} />
        </IconBtn>
        <IconBtn wide onClick={() => rotateSelection("right")} disabled={none} testId="arrange-rotate-right" label="Rotate 90° right">
          <RotateCw size={15} strokeWidth={1.6} />
        </IconBtn>
        <CmdBtn onClick={() => rotateSelection("reset")} disabled={none} testId="arrange-rotate-reset" label="Reset rotation">
          0°
        </CmdBtn>
      </RibbonGroup>

      <RibbonGroup label="Editing" last>
        <CmdBtn
          icon={<Search size={12} strokeWidth={1.8} className="text-[#777]" />}
          onClick={() => setFindOpen(true)}
          testId="editing-find"
          label="Find"
        >
          Find
        </CmdBtn>
        <CmdBtn onClick={() => setFindOpen(true)} testId="editing-replace" label="Replace">
          Replace…
        </CmdBtn>
      </RibbonGroup>
      {findOpen && <FindReplaceDialog onClose={() => setFindOpen(false)} />}
    </>
  );
}
