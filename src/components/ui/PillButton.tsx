import type { ButtonHTMLAttributes } from "react";

type PillButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary = solid Staples red; secondary = white with gray border */
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
};

const VARIANT = {
  primary: "bg-brand text-white hover:bg-brand-press",
  secondary: "border border-[#cccccc] bg-white text-[#4d4d4f] hover:bg-[#f6f6f6]",
} as const;

const SIZE = {
  sm: "px-3 py-[3px] text-[12px]",
  md: "px-[14px] py-[6px] text-[12.5px]",
} as const;

/**
 * Rounded pill button from the redesign frames (primary red / secondary
 * outline pairs — Orientation toggles, panel CTAs, dialog footers).
 * Shared primitive per plan Phase 0: the figma repeats this pair on every
 * surface, so it lives once here instead of per-surface markup.
 */
export function PillButton({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: PillButtonProps) {
  return (
    <button
      type={type}
      className={`cursor-pointer rounded-full font-semibold disabled:cursor-default disabled:opacity-45 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    />
  );
}
