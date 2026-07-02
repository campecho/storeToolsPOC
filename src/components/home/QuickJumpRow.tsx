import Link from "next/link";
import type { Route } from "next";
import { FileText, PanelsTopLeft, Wrench, Image, Printer } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Quick-jump shortcuts into the suite's main tools. Layout is wired to the
 * page-layout editor (plan step L1); the rest stay placeholder affordances
 * until their Track B vertical slices mount here.
 */
const TOOLS: { icon: LucideIcon; label: string; desc: string; href?: Route }[] = [
  { icon: FileText, label: "Document", desc: "Word, PDF & text" },
  { icon: PanelsTopLeft, label: "Layout", desc: "Design & arrange", href: "/layout" },
  { icon: Wrench, label: "Quick Fix", desc: "Auto-repair file content" },
  { icon: Image, label: "Photo Edit", desc: "Crop, retouch, color" },
  { icon: Printer, label: "Print Setup", desc: "Size, bleed & imposition" },
];

const CARD_CLASS =
  "flex w-[188px] shrink-0 cursor-pointer items-center gap-3 rounded-[10px] border border-[#e6e6e6] bg-white px-[15px] py-[13px] hover:border-brand hover:shadow-[0_2px_10px_rgba(0,0,0,.06)] lg:w-auto lg:flex-1";

function CardBody({ icon: Icon, label, desc }: { icon: LucideIcon; label: string; desc: string }) {
  return (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-[#f4f4f4]">
        <Icon size={21} strokeWidth={1.8} className="text-[#555]" />
      </div>
      <div>
        <div className="text-[14px] font-bold text-[#2a2a2a]">{label}</div>
        <div className="mt-[2px] text-[11px] text-[#999]">{desc}</div>
      </div>
    </>
  );
}

export function QuickJumpRow() {
  return (
    // Equal-width row on desktop; below lg the tiles keep their size and scroll
    // horizontally so the shortcuts stay legible on narrow screens.
    <div className="no-scrollbar flex gap-[14px] overflow-x-auto border-b border-[#ececec] px-4 py-4 sm:px-[26px] lg:overflow-x-visible">
      {TOOLS.map(({ icon, label, desc, href }) =>
        href ? (
          <Link
            key={label}
            href={href}
            data-testid={`quickjump-${label.toLowerCase().replace(/\s+/g, "-")}`}
            className={CARD_CLASS}
          >
            <CardBody icon={icon} label={label} desc={desc} />
          </Link>
        ) : (
          <div key={label} className={CARD_CLASS}>
            <CardBody icon={icon} label={label} desc={desc} />
          </div>
        ),
      )}
    </div>
  );
}
