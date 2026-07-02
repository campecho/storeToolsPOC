"use client";

import { useFeedbackStore } from "@/store";
import { ReleaseBanner } from "@/components/releases/ReleaseBanner";
import { ReleaseCard } from "@/components/releases/ReleaseCard";

/**
 * What's new / Releases (wire view 5) — the version history and the public
 * "you asked, we delivered" changelog: reverse-chronological release cards,
 * each listing the features shipped and bugs fixed with store credits.
 */
export default function ReleasesPage() {
  const releases = useFeedbackStore((s) => s.releases);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-[860px] px-4 pb-11 pt-[26px] sm:px-[30px]">
        <ReleaseBanner />
        {releases.map((r) => (
          <ReleaseCard key={r.version} release={r} />
        ))}
      </div>
    </div>
  );
}
