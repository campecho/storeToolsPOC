import type { Metadata } from "next";
import { EditorShell } from "@/components/layout-editor/EditorShell";

export const metadata: Metadata = {
  title: "Layout editor — Print Studio",
  description:
    "Freeform page-layout editor — the suite's Publisher replacement (POC, plan step L1).",
};

/**
 * /layout — the page-layout editor (Publisher replacement), reached from the
 * homepage's Layout quick-jump card. NB: this folder is the `/layout` route
 * segment; it is unrelated to the root src/app/layout.tsx layout file.
 */
export default function LayoutEditorPage() {
  return <EditorShell />;
}
