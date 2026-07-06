/**
 * Asset blob store (plan L8) — the bytes behind `doc.assets`.
 *
 * STUB: client-side IndexedDB is the POC's stand-in for a real asset service.
 * CONTRACT: bytes are keyed by the asset id in `doc.assets` (schema
 * `AssetSchema`); any backend implements the same id → bytes mapping and this
 * file is the only seam to swap.
 * PROD-TODO: a real asset service adds upload, dedupe, quotas, and garbage
 * collection of orphaned blobs (undoing a place, or removing a library entry,
 * leaves bytes behind here). Failed writes only log — production needs a
 * visible "asset not saved" state, same as the persist configs.
 */

const DB_NAME = "stp-assets-v1";
const STORE = "blobs";

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** SSR and unit tests have no IndexedDB — every operation degrades to a no-op. */
function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn("[assets] IndexedDB unavailable — assets won't survive reload", req.error);
        resolve(null);
      };
    });
  }
  return dbPromise;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
  const db = await openDb();
  return db ? db.transaction(STORE, mode).objectStore(STORE) : null;
}

export async function putAssetBlob(id: string, blob: Blob): Promise<void> {
  try {
    const s = await store("readwrite");
    if (s) await done(s.put(blob, id));
  } catch (err) {
    console.warn("[assets] blob write failed", err);
  }
}

export async function deleteAssetBlob(id: string): Promise<void> {
  dropAssetUrl(id);
  try {
    const s = await store("readwrite");
    if (s) await done(s.delete(id));
  } catch (err) {
    console.warn("[assets] blob delete failed", err);
  }
  // only after the bytes are really gone — notifying earlier would let a
  // re-resolve read the still-present blob and re-mint a live URL
  notifyBytes(id);
}

/**
 * Import seeding (P3): swap the whole library's bytes in one shot. Reuses the
 * clear semantics (drop cached URLs, notify the old ids so mounted pictures let
 * go of their now-dead object URLs), then writes each new blob and notifies its
 * id so a picture already mounted against that id re-resolves to the fresh bytes
 * — putAssetBlob stays silent for the L9 upload path, so the notify lives here.
 */
export async function replaceAssetBlobs(blobs: Record<string, Blob>): Promise<void> {
  await clearAssetBlobs();
  for (const [id, blob] of Object.entries(blobs)) {
    await putAssetBlob(id, blob);
    notifyBytes(id);
  }
}

/** Reset support: the library metadata resets with the document, so the bytes go too. */
export async function clearAssetBlobs(): Promise<void> {
  const ids = Array.from(urlCache.keys());
  for (const id of ids) dropAssetUrl(id);
  try {
    const s = await store("readwrite");
    if (s) await done(s.clear());
  } catch (err) {
    console.warn("[assets] blob clear failed", err);
  }
  for (const id of ids) notifyBytes(id);
}

// Object URLs are cached for the session — pictures re-render constantly
// (thumbnails, zoom) and must not mint a URL per render.
const urlCache = new Map<string, string>();

// Deleting bytes revokes the cached URL, so mounted pictures must re-resolve
// (to the missing state) instead of pointing an <img> at a dead object URL.
type BytesListener = (id: string) => void;
const bytesListeners = new Set<BytesListener>();

/** Subscribe to "the bytes behind this id changed" — returns the unsubscribe. */
export function onAssetBytesChanged(fn: BytesListener): () => void {
  bytesListeners.add(fn);
  return () => bytesListeners.delete(fn);
}

function notifyBytes(id: string): void {
  for (const fn of bytesListeners) fn(id);
}

/** Synchronous cache read — lets first paint skip the async round-trip. */
export function peekAssetUrl(id: string): string | undefined {
  return urlCache.get(id);
}

/** Resolve an asset id to an object URL, or null when the blob is gone. */
export async function getAssetUrl(id: string): Promise<string | null> {
  const hit = urlCache.get(id);
  if (hit) return hit;
  try {
    const s = await store("readonly");
    if (!s) return null;
    const blob = (await done(s.get(id))) as Blob | undefined;
    if (!blob) return null;
    // a concurrent resolve may have cached while we read — never double-mint
    const again = urlCache.get(id);
    if (again) return again;
    const url = URL.createObjectURL(blob);
    urlCache.set(id, url);
    return url;
  } catch (err) {
    console.warn("[assets] blob read failed", err);
    return null;
  }
}

function dropAssetUrl(id: string): void {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}
