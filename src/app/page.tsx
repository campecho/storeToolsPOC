import { QuickJumpRow } from "@/components/home/QuickJumpRow";
import { IntakeColumn } from "@/components/home/IntakeColumn";
import { ProductColumn } from "@/components/home/ProductColumn";
import { Coachmark } from "@/components/chrome/Coachmark";

/**
 * Home & file intake — the suite homepage placeholder (wire view 1).
 * The tool the associate is already in; shows how they reach the tracker.
 */
export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <QuickJumpRow />
      {/* Side-by-side on desktop; stacks to a single column below lg. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <IntakeColumn />
        <ProductColumn />
      </div>
      <Coachmark />
    </div>
  );
}
