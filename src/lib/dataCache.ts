/**
 * Client-side data cache.
 *
 * Two jobs:
 *
 * 1. Make the second visit fast. A GET that has been seen before is answered
 *    from memory (this tab) or sessionStorage (this tab, across reloads) and the
 *    network copy is fetched in the background. The page paints immediately and
 *    updates a moment later — "stale while revalidate".
 *
 * 2. Never lose data when the cache is cleared. Clearing is now a version bump,
 *    not a wipe of stored content: the server keeps a cache version number in
 *    the database (GET /api/cache-version), and every cache key is namespaced
 *    with it. Bumping the version on the server makes every stored entry
 *    unreachable — so everyone gets fresh data on their next request — while the
 *    real data stays exactly where it is, in the database. Nothing in the
 *    backend is deleted, and no visitor is logged out.
 *
 * Only GETs are cached, and anything under /api/admin or /api/pos is skipped:
 * the dashboard must always see the live row it is about to edit.
 */

import { readBoot } from './boot.ts';

const MEMORY = new Map<string, { at: number; data: any }>();
const INFLIGHT = new Map<string, Promise<any>>();

const VERSION_STORAGE = 'pharma:cache-version';
const PREFIX = 'pharma:cache:';
/** How long a cached entry may be served without a background refresh */
const DEFAULT_TTL = 60_000;
/** sessionStorage entries bigger than this are kept in memory only */
const MAX_STORED_BYTES = 180_000;

let version = readStoredVersion();
let versionChecked = 0;

/**
 * Pricing tier of the signed-in shopper: '' for everyone, 'w' for an approved
 * wholesale customer. Product responses differ per tier, so the tier is part
 * of every cache key — a wholesale price can never be served from cache to a
 * regular visitor on the same device, or the other way round.
 */
const TIER_STORAGE = 'pharma:price-tier';
let tier = readStoredTier();

function readStoredTier(): string {
  try {
    return localStorage.getItem(TIER_STORAGE) === 'w' ? 'w' : '';
  } catch {
    return '';
  }
}

export function getCacheTier(): string {
  return tier;
}

/** Switch tier after sign-in / sign-out / approval. Returns true when it changed. */
export function setCacheTier(next: string): boolean {
  const clean = next === 'w' ? 'w' : '';
  if (clean === tier) return false;
  tier = clean;
  try {
    if (clean) localStorage.setItem(TIER_STORAGE, clean);
    else localStorage.removeItem(TIER_STORAGE);
  } catch {
    /* storage unavailable */
  }
  dropAllCachedResponses();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pharma:tier-changed', { detail: clean }));
  }
  return true;
}

function readStoredVersion(): number {
  try {
    const raw = Number(sessionStorage.getItem(VERSION_STORAGE));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  } catch {
    return 1;
  }
}

function keyFor(url: string): string {
  return `${PREFIX}v${version}:${tier}:${url}`;
}

/** Entries from an older version are unreachable; sweep them so storage stays small. */
function dropOtherVersions(): void {
  try {
    const current = `${PREFIX}v${version}:`;
    const stale: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key && key.startsWith(PREFIX) && !key.startsWith(current)) stale.push(key);
    }
    stale.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    /* storage unavailable */
  }
  for (const key of Array.from(MEMORY.keys())) {
    if (!key.startsWith(`${PREFIX}v${version}:`)) MEMORY.delete(key);
  }
}

/**
 * Reads the server's cache version. When it has moved, every cached entry is
 * left behind and the next read of each URL goes to the network.
 */
export async function syncCacheVersion(force = false): Promise<number> {
  if (!force && Date.now() - versionChecked < 30_000) return version;
  versionChecked = Date.now();
  try {
    const res = await fetch('/api/cache-version', { cache: 'no-store' });
    if (!res.ok) return version;
    const data = await res.json();
    const next = Number(data?.version) || 1;
    if (next !== version) {
      version = next;
      try {
        sessionStorage.setItem(VERSION_STORAGE, String(version));
      } catch {
        /* ignored */
      }
      dropOtherVersions();
      window.dispatchEvent(new CustomEvent('pharma:cache-version-changed', { detail: version }));
    }
  } catch {
    /* offline — carry on with what is cached */
  }
  return version;
}

export function currentCacheVersion(): number {
  return version;
}

function isCacheable(url: string): boolean {
  if (!url.startsWith('/api/')) return false;
  if (url.startsWith('/api/admin') || url.startsWith('/api/pos')) return false;
  if (url.startsWith('/api/auth') || url.startsWith('/api/account')) return false;
  if (url.startsWith('/api/cache-version')) return false;
  return true;
}

function readEntry(url: string): { at: number; data: any } | null {
  const key = keyFor(url);
  const memory = MEMORY.get(key);
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== 'number') return null;
    MEMORY.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeEntry(url: string, data: any): void {
  const key = keyFor(url);
  const entry = { at: Date.now(), data };
  MEMORY.set(key, entry);
  try {
    const serialised = JSON.stringify(entry);
    if (serialised.length <= MAX_STORED_BYTES) sessionStorage.setItem(key, serialised);
  } catch {
    // Storage full or blocked. The memory copy still serves this tab, and a
    // quota error must never break the page, so it is swallowed on purpose.
  }
}

interface CachedGetOptions {
  /** ms an entry may be reused before it is refetched in the background */
  ttl?: number;
  /** called when a background refresh brings back newer data */
  onFresh?: (data: any) => void;
  /** skip the cache entirely for this call */
  force?: boolean;
}

/**
 * A GET that answers from cache when it can.
 *
 * Returns the cached value immediately if there is one; when that value is
 * older than the TTL a refresh runs in the background and `onFresh` fires with
 * the new data. Identical in-flight requests are shared, so ten components
 * asking for the same endpoint on first paint make one request.
 */
export async function cachedGet<T = any>(url: string, options: CachedGetOptions = {}): Promise<T> {
  const { ttl = DEFAULT_TTL, onFresh, force } = options;

  if (!isCacheable(url) || force) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    const data = await res.json();
    if (isCacheable(url)) writeEntry(url, data);
    return data as T;
  }

  const entry = readEntry(url);
  const fresh = entry && Date.now() - entry.at < ttl;

  const fetchNow = (): Promise<T> => {
    const existing = INFLIGHT.get(url);
    if (existing) return existing as Promise<T>;

    const request = fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data = await res.json();
        writeEntry(url, data);
        return data;
      })
      .finally(() => INFLIGHT.delete(url));

    INFLIGHT.set(url, request);
    return request as Promise<T>;
  };

  if (entry) {
    if (!fresh) {
      // Serve what we have, then quietly bring it up to date.
      fetchNow()
        .then((data) => onFresh?.(data))
        .catch(() => {
          /* the cached copy stays on screen */
        });
    }
    return entry.data as T;
  }

  return fetchNow();
}

/** Forget one URL (or every URL starting with a prefix) after a write. */
export function invalidate(urlOrPrefix: string): void {
  const target = keyFor(urlOrPrefix);
  for (const key of Array.from(MEMORY.keys())) {
    if (key === target || key.startsWith(target)) MEMORY.delete(key);
  }
  try {
    const stale: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key && (key === target || key.startsWith(target))) stale.push(key);
    }
    stale.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    /* ignored */
  }
}

/**
 * Drops every cached response in this browser. Used by Clear Cache alongside
 * the server-side version bump. It only removes cached COPIES — the data itself
 * lives in the database and is untouched, and the session token is left alone so
 * nobody is signed out.
 */
export function dropAllCachedResponses(): void {
  MEMORY.clear();
  INFLIGHT.clear();
  try {
    const stale: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key && key.startsWith(PREFIX)) stale.push(key);
    }
    stale.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    /* ignored */
  }
}

/** Warm the cache for endpoints the next page is about to need. */
export function prefetch(urls: string[]): void {
  urls.forEach((url) => {
    if (!isCacheable(url) || readEntry(url)) return;
    cachedGet(url).catch(() => {
      /* a failed prefetch is not an error the user should see */
    });
  });
}

/**
 * The server writes the current cache version into every page it sends
 * (window.__PHARMA_CV__), and moves it on every dashboard save. Adopting it
 * before the first request means a plain reload after an edit shows the edit
 * — the older copy in this tab is never painted.
 */
function adoptVersion(next: number): boolean {
  if (!Number.isFinite(next) || next <= 0 || next === version) return false;
  version = next;
  try {
    sessionStorage.setItem(VERSION_STORAGE, String(version));
  } catch {
    /* ignored */
  }
  dropOtherVersions();
  return true;
}

/** Tells other tabs of this browser that the dashboard just changed something */
let channel: BroadcastChannel | null = null;
export function announceDataChange(): void {
  try {
    channel?.postMessage({ type: 'changed', at: Date.now() });
  } catch {
    /* ignored */
  }
}

// Check the version once on load, and again whenever the tab comes back to the
// foreground — that is when another device's change is most likely to be waiting.
if (typeof window !== 'undefined') {
  const injected = Number((window as any).__PHARMA_CV__);
  if (Number.isFinite(injected) && injected > 0) {
    adoptVersion(injected);
    versionChecked = Date.now();
  } else {
    void syncCacheVersion(true);
  }
  // Settings and banners arrived with the page: no second request for them
  const boot = readBoot();
  if (boot?.settings) writeEntry('/api/settings', boot.settings);
  if (Array.isArray(boot?.banners)) writeEntry('/api/banners', boot.banners);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncCacheVersion();
  });
  // A save in a dashboard tab of this same browser: pick it up straight away
  try {
    channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pharma-cache') : null;
    channel?.addEventListener('message', (event: MessageEvent) => {
      if (event?.data?.type !== 'changed') return;
      window.setTimeout(() => void syncCacheVersion(true), 400);
    });
  } catch {
    channel = null;
  }
}
