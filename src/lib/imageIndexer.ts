/**
 * v3.11 — keeps the search-by-photo index up to date, from the dashboard.
 *
 * The fingerprint of every product picture is made here, in the admin's
 * browser (no image library is needed on the server). Pictures on the shop's
 * own domain are read directly; pictures hosted elsewhere come through
 * /api/admin/image-index/proxy, because a browser may not read the pixels of
 * another site's image.
 */
import { fingerprintImage, loadImage, type ImageFingerprint } from './imageFingerprint.ts';

export interface IndexStatus {
  version: number;
  total: number;
  indexed: number;
  noImage: number;
  pending: Array<{ id: number; name: string; image: string }>;
}

export interface IndexProgress {
  done: number;
  total: number;
  failed: number;
  current?: string;
}

export async function fetchIndexStatus(): Promise<IndexStatus> {
  const res = await fetch('/api/admin/image-index');
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Could not read the photo index.');
  return data as IndexStatus;
}

const sameOrigin = (url: string) => {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
};

async function fingerprintOf(imageUrl: string): Promise<ImageFingerprint> {
  const absolute = new URL(imageUrl, window.location.href).href;
  if (sameOrigin(absolute)) {
    return fingerprintImage(await loadImage(absolute));
  }
  const res = await fetch(`/api/admin/image-index/proxy?url=${encodeURIComponent(absolute)}`);
  if (!res.ok) throw new Error('picture not reachable');
  return fingerprintImage(await loadImage(await res.blob()));
}

/**
 * Fingerprints the pending products and saves them in batches.
 * `shouldStop` lets the screen cancel; progress is reported after each picture.
 */
export async function buildImageIndex(
  pending: IndexStatus['pending'],
  onProgress: (progress: IndexProgress) => void,
  shouldStop: () => boolean = () => false
): Promise<IndexProgress> {
  const progress: IndexProgress = { done: 0, total: pending.length, failed: 0 };
  let batch: Array<{ productId: number; imageUrl: string; fingerprint: ImageFingerprint }> = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const entries = batch;
    batch = [];
    const res = await fetch('/api/admin/image-index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'Could not save the photo index.');
    }
  };

  for (const item of pending) {
    if (shouldStop()) break;
    progress.current = item.name;
    try {
      const fingerprint = await fingerprintOf(item.image);
      batch.push({ productId: item.id, imageUrl: item.image, fingerprint });
    } catch {
      progress.failed += 1;
    }
    progress.done += 1;
    onProgress({ ...progress });
    if (batch.length >= 20) await flush();
    // Let the page breathe between pictures
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await flush();
  progress.current = undefined;
  onProgress({ ...progress });
  return progress;
}

/** Whether search by photo is switched on (read from the public settings, kept for a minute) */
let switchCache: { at: number; on: Promise<boolean> } | null = null;
function photoSearchOn(): Promise<boolean> {
  if (switchCache && Date.now() - switchCache.at < 60_000) return switchCache.on;
  const on = fetch('/api/settings')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => Boolean(data?.search_config?.imageSearchEnabled))
    .catch(() => false);
  switchCache = { at: Date.now(), on };
  return on;
}

/**
 * After a product is saved: index its (new) picture quietly in the background —
 * only while search by photo is switched on (Website → Search & Shop).
 */
export function indexProductQuietly(product: { id: number; image?: string | null }) {
  if (!product?.id || !product.image) return;
  const image = product.image;
  void photoSearchOn()
    .then((on) => (on ? buildImageIndex([{ id: product.id, name: '', image }], () => undefined) : null))
    .catch(() => undefined);
}
