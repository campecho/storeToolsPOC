import type { Metadata } from "next";
import { PhotoEditorShell } from "@/components/photo-editor/PhotoEditorShell";

export const metadata: Metadata = {
  title: "Photo editor — Print Studio",
  description:
    "Raster quick-fix editor — the suite's Photoshop Elements replacement (POC, plan step PE1).",
};

/**
 * /photo — the photo editor, reached from the homepage's Photo Edit quick-jump
 * card. Deep-linkable: `/photo?demo=1` opens the corpus demo photo. The shell is
 * client-only and mounts its own Suspense boundary for useSearchParams.
 */
export default function PhotoEditorPage() {
  return <PhotoEditorShell />;
}
