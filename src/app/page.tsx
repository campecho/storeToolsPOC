import { Suspense } from "react";
import { PickerScreen } from "@/components/picker/PickerScreen";

/**
 * The main page is the picker (redesign plan Phase 11, decision of record
 * #9): Templates + Quick Import replace the old Home/intake wires. The
 * Suspense boundary covers PickerScreen's useSearchParams (`/?tab=import`).
 */
export default function HomePage() {
  return (
    <Suspense>
      <PickerScreen />
    </Suspense>
  );
}
