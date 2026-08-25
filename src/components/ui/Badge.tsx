import type { ReactNode } from "react";

type BadgeProps = {
  children: ReactNode;
  /**
   * ok     = green bordered status pill ("Saved", conversion complete)
   * tag    = gray label chip ("Non-Print", "Locked Base")
   * error  = red family ("2" errors count pill)
   * warn   = amber family (warnings count pill)
   */
  variant: "ok" | "tag" | "error" | "warn";
  className?: string;
};

const VARIANT = {
  ok: "border border-ok bg-white text-ok",
  tag: "bg-[#d8d8d8] text-[#666]",
  error: "border border-[#dd1700] bg-err-tint text-[#dd1700]",
  warn: "border border-warn-border bg-warn-tint text-warn",
} as const;

/**
 * Status/label pill from the redesign frames (autosave badge, layer tags,
 * preflight section counts). Shared primitive per plan Phase 0.
 */
export function Badge({ children, variant, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-[1px] text-[10.5px] font-semibold ${VARIANT[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
