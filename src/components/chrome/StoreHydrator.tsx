"use client";

import { useEffect } from "react";
import { useFeedbackStore } from "@/store";

/**
 * Rehydrates the feedback store from localStorage after mount. Persistence is
 * deferred (skipHydration) so SSR markup and the first client render both use
 * the deterministic seed — no hydration mismatch.
 */
export function StoreHydrator() {
  useEffect(() => {
    void useFeedbackStore.persist.rehydrate();
  }, []);
  return null;
}
