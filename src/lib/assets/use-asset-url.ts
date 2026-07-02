"use client";

import { useEffect, useState } from "react";
import { getAssetUrl, onAssetBytesChanged, peekAssetUrl } from "./blob-store";

/**
 * Resolve an asset id to a renderable object URL (plan L8).
 * Returns `undefined` while the blob store is being read, `null` when the
 * asset has no bytes (deleted, other browser, cleared storage) — callers
 * render the visible missing-asset state, never a silent blank. Re-resolves
 * when the bytes behind the id change (e.g. the asset is removed mid-session).
 */
export function useAssetUrl(assetId: string | undefined): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(() =>
    assetId ? peekAssetUrl(assetId) : null,
  );

  useEffect(() => {
    if (!assetId) {
      setUrl(null);
      return;
    }
    let alive = true;
    const resolve = () => {
      const cached = peekAssetUrl(assetId);
      if (cached) {
        setUrl(cached);
        return;
      }
      setUrl(undefined);
      void getAssetUrl(assetId).then((u) => {
        if (alive) setUrl(u);
      });
    };
    resolve();
    const off = onAssetBytesChanged((id) => {
      if (id === assetId) resolve();
    });
    return () => {
      alive = false;
      off();
    };
  }, [assetId]);

  return assetId ? url : null;
}
