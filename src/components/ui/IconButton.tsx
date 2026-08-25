import type { ButtonHTMLAttributes } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** required for icon-only buttons */
  "aria-label": string;
  /** selected/toggled state — red fill per the figma tool strip */
  active?: boolean;
};

/**
 * 32px square icon button from the redesign frames (ribbon toggles, floating
 * tool strip, menu-bar quick actions). Active state is the figma's red fill
 * with white glyph. Shared primitive per plan Phase 0.
 */
export function IconButton({ active = false, className = "", type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border disabled:cursor-default disabled:opacity-45 ${
        active
          ? "border-brand bg-brand text-white"
          : "border-[#cccccc] bg-white text-[#555] hover:bg-[#f6f6f6]"
      } ${className}`}
      {...rest}
    />
  );
}
