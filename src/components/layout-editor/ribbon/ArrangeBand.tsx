"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  BringToFront,
  RotateCcw,
  RotateCw,
  SendToBack,
} from "lucide-react";
import { useLayoutStore } from "@/store";
import type { AlignKind } from "@/lib/layout/align";
import { RibbonGroup } from "./RibbonGroup";

/**
 * Arrange command band (wire 2a · Arrange), live per plan L10: Order (z-order
 * jumps + steps), Rotate (90° left/right/reset), and Align (the L7 actions,
 * reused). Everything targets the current selection; controls dim to the
 * wire's at-rest face when nothing (or too little) is selected. Grouping and
 * effects stay in the §6 backlog.
 */

function ArrangeBtn({
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
      className={`flex h-6 w-[30px] items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white text-[#555] ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[#c9c9c9] hover:bg-[#fafafa]"
      }`}
    >
      {children}
    </button>
  );
}

const ALIGNS: { kind: AlignKind; label: string; testId: string; Icon: typeof AlignStartVertical }[] = [
  { kind: "left", label: "Align left edges", testId: "arrange-align-left", Icon: AlignStartVertical },
  { kind: "centerH", label: "Align horizontal centers", testId: "arrange-align-centerh", Icon: AlignCenterVertical },
  { kind: "right", label: "Align right edges", testId: "arrange-align-right", Icon: AlignEndVertical },
  { kind: "top", label: "Align top edges", testId: "arrange-align-top", Icon: AlignStartHorizontal },
  { kind: "centerV", label: "Align vertical centers", testId: "arrange-align-centerv", Icon: AlignCenterHorizontal },
  { kind: "bottom", label: "Align bottom edges", testId: "arrange-align-bottom", Icon: AlignEndHorizontal },
];

export function ArrangeBand() {
  const selectedCount = useLayoutStore((s) => s.selectedIds.length);
  const alignRel = useLayoutStore((s) => s.alignRel);
  const reorder = useLayoutStore((s) => s.reorder);
  const rotateSelection = useLayoutStore((s) => s.rotateSelection);
  const alignSelection = useLayoutStore((s) => s.alignSelection);

  const none = selectedCount === 0;
  const alignDisabled = selectedCount < (alignRel === "selection" ? 2 : 1);
  const icon = { size: 15, strokeWidth: 1.6 };

  return (
    <>
      <RibbonGroup label="Order">
        <ArrangeBtn onClick={() => reorder("front")} disabled={none} label="Bring to front" testId="arrange-front">
          <BringToFront {...icon} />
        </ArrangeBtn>
        <ArrangeBtn onClick={() => reorder("forward")} disabled={none} label="Bring forward" testId="arrange-forward">
          <ArrowUp {...icon} />
        </ArrangeBtn>
        <ArrangeBtn onClick={() => reorder("backward")} disabled={none} label="Send backward" testId="arrange-backward">
          <ArrowDown {...icon} />
        </ArrangeBtn>
        <ArrangeBtn onClick={() => reorder("back")} disabled={none} label="Send to back" testId="arrange-back">
          <SendToBack {...icon} />
        </ArrangeBtn>
      </RibbonGroup>

      <RibbonGroup label="Rotate">
        <ArrangeBtn onClick={() => rotateSelection("left")} disabled={none} label="Rotate 90° left" testId="arrange-rotate-left">
          <RotateCcw {...icon} />
        </ArrangeBtn>
        <ArrangeBtn onClick={() => rotateSelection("right")} disabled={none} label="Rotate 90° right" testId="arrange-rotate-right">
          <RotateCw {...icon} />
        </ArrangeBtn>
        <button
          type="button"
          onClick={() => rotateSelection("reset")}
          disabled={none}
          title="Reset rotation"
          data-testid="arrange-rotate-reset"
          className={`flex h-6 items-center rounded-[5px] border border-[#dcdcdc] bg-white px-2 text-[10.5px] text-[#555] ${
            none ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[#c9c9c9] hover:bg-[#fafafa]"
          }`}
        >
          0°
        </button>
      </RibbonGroup>

      <RibbonGroup label="Align" last>
        {ALIGNS.map(({ kind, label, testId, Icon }) => (
          <ArrangeBtn key={kind} onClick={() => alignSelection(kind)} disabled={alignDisabled} label={label} testId={testId}>
            <Icon {...icon} className="text-[#666]" />
          </ArrangeBtn>
        ))}
      </RibbonGroup>
    </>
  );
}
