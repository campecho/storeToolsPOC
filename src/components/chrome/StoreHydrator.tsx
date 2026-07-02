"use client";

import { useEffect } from "react";
import { useFeedbackStore, useLayoutStore } from "@/store";

/**
 * Rehydrates the persisted stores from localStorage after mount. Persistence
 * is deferred (skipHydration) so SSR markup and the first client render both
 * use the deterministic seed — no hydration mismatch.
 */
export function StoreHydrator() {
  useEffect(() => {
    void useFeedbackStore.persist.rehydrate();
    void useLayoutStore.persist.rehydrate();
  }, []);
  return null;
}
