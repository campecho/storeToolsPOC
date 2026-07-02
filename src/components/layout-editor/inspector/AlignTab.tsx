"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
} from "lucide-react";
import { useLayoutStore } from "@/store";
import type { AlignKind, DistributeAxis } from "@/lib/layout/align";
import { FaceSelect } from "../FaceSelect";
import { SectionLabel } from "./Field";

/**
 * Align inspector tab (wire region 7), live per plan L7: the six object
 * aligns, Distribute H/V, and "Relative to" Page / Selection. Align enables
 * with a selection (two objects when relative to the selection — one object
 * can't align to itself); Distribute needs three. Buttons keep the wire's
 * tile chrome, dimming to the at-rest face when they can't apply.
 */

const ALIGNS: { kind: AlignKind; label: string; Icon: typeof AlignStartVertical }[] = [
  { kind: "left", label: "Align left edges", Icon: AlignStartVertical },
  { kind: "centerH", label: "Align horizontal centers", Icon: AlignCenterVertical },
  { kind: "right", label: "Align right edges", Icon: AlignEndVertical },
  { kind: "top", label: "Align top edges", Icon: AlignStartHorizontal },
  { kind: "centerV", label: "Align vertical centers", Icon: AlignCenterHorizontal },
  { kind: "bottom", label: "Align bottom edges", Icon: AlignEndHorizontal },
];

function AlignBtn({
  onClick,
  disabled,
  label,
  testId,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={`flex h-8 flex-1 items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white ${
        disabled ? "opacity-60" : "cursor-pointer hover:border-[#b8b8b8] hover:bg-[#fafafa]"
      }`}
    >
      {children}
    </button>
  );
}

export function AlignTab() {
  const selectedCount = useLayoutStore((s) => s.selectedIds.length);
  const alignRel = useLayoutStore((s) => s.alignRel);
  const setAlignRel = useLayoutStore((s) => s.setAlignRel);
  const alignSelection = useLayoutStore((s) => s.alignSelection);
  const distributeSelection = useLayoutStore((s) => s.distributeSelection);

  const alignDisabled = selectedCount < (alignRel === "selection" ? 2 : 1);
  const distributeDisabled = selectedCount < 3;
  const icon = { size: 16, strokeWidth: 1.6, className: "text-[#666]" };

  const testIdFor: Record<AlignKind, string> = {
    left: "obj-align-left",
    centerH: "obj-align-centerh",
    right: "obj-align-right",
    top: "obj-align-top",
    centerV: "obj-align-centerv",
    bottom: "obj-align-bottom",
  };

  const distBtn = (axis: DistributeAxis, label: string) => (
    <button
      type="button"
      onClick={() => distributeSelection(axis)}
      disabled={distributeDisabled}
      data-testid={`distribute-${axis}`}
      title={distributeDisabled ? "Select three or more objects to distribute" : undefined}
      className={`flex h-8 flex-1 items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white text-[11px] text-[#777] ${
        distributeDisabled ? "opacity-60" : "cursor-pointer hover:border-[#b8b8b8] hover:bg-[#fafafa]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Align</SectionLabel>
        <div className="mb-[5px] flex gap-[5px]">
          {ALIGNS.slice(0, 3).map(({ kind, label, Icon }) => (
            <AlignBtn
              key={kind}
              onClick={() => alignSelection(kind)}
              disabled={alignDisabled}
              label={label}
              testId={testIdFor[kind]}
            >
              <Icon {...icon} />
            </AlignBtn>
          ))}
        </div>
        <div className="flex gap-[5px]">
          {ALIGNS.slice(3).map(({ kind, label, Icon }) => (
            <AlignBtn
              key={kind}
              onClick={() => alignSelection(kind)}
              disabled={alignDisabled}
              label={label}
              testId={testIdFor[kind]}
            >
              <Icon {...icon} />
            </AlignBtn>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Distribute</SectionLabel>
        <div className="flex gap-[5px]">
          {distBtn("h", "Horizontal")}
          {distBtn("v", "Vertical")}
        </div>
      </div>

      <div>
        <SectionLabel>Relative to</SectionLabel>
        <FaceSelect
          face={alignRel === "page" ? "Page" : "Selection"}
          value={alignRel}
          options={[
            { value: "page", label: "Page" },
            { value: "selection", label: "Selection" },
          ]}
          onChange={(v) => setAlignRel(v as "page" | "selection")}
          testId="align-rel"
          label="Align relative to"
          className="flex h-[30px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[12px] text-[#555]"
        />
      </div>
    </div>
  );
}
