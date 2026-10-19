/**
 * Response cache for the busy public reads (settings, banners, categories,
 * product lists and pages, blog, landing pages, sitemap).
 *
 * • Redis when REDIS_URL is set — shared by every app instance, survives a
 *   restart. Without it (or while Redis is unreachable) an in-memory LRU is
 *   used, so the shop never depends on Redis being up.
 * • Every Redis call has a short timeout. A slow or dead Redis is treated as
 *   a cache miss, never as an error the visitor sees.
 * • Invalidation is by "generation": any successful write in the dashboard or
 *   the POS bumps one number and every cached answer from before it is simply
 *   never read again (it expires on its own). No key scanning, no stale page
 *   after a save.
 * • Many visitors asking for the same uncached page at the same moment cause
 *   ONE database read; the others wait for it (request coalescing).
 */
import type express from 'express';

type Stored = { t: string; b: string; h?: Record<string, string> };
type Rule = { test: RegExp; ttl: number };

export interface CacheOptions {
  url?: string;
  prefix?: string;
  /** In-memory budget in bytes (default 64 MB) */
  maxBytes?: number;
  /** Is this request's answer the same for everyone? (no wholesale price, no preview…) */
  isShareable: (req: express.Request) => boolean | Promise<boolean>;
}

const REDIS_TIMEOUT_MS = 250;

function withTimeout<T>(promise: Promise<T>, ms = REDIS_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('redis timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

class MemoryLru {
  private map = new Map<string, { value: string; expires: number; size: number }>();
  private bytes = 0;
  constructor(private maxBytes: number, private maxEntries = 5000) {}

  get(key: string): string | null {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
      this.delete(key);
      return null;
    }
    // Most recently used goes to the end
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: string, ttlSeconds: number) {
    const size = value.length * 2 + key.length * 2;
    if (size > this.maxBytes / 8) return; // one huge answer must not flush everything else
    this.delete(key);
    this.map.set(key, { value, expires: Date.now() + ttlSeconds * 1000, size });
    this.bytes += size;
    while ((this.bytes > this.maxBytes || this.map.size > this.maxEntries) && this.map.size > 0) {
      const oldest = this.map.keys().next().value as string;
      this.delete(oldest);
    }
  }

  delete(key: string) {
    const hit = this.map.get(key);
    if (!hit) return;
    this.bytes -= hit.size;
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
    this.bytes = 0;
  }

  stats() {
    return { entries: this.map.size, bytes: this.bytes };
  }
}

export function createCache(options: CacheOptions) {
  const prefix = options.prefix || 'pos';
  const memory = new MemoryLru(options.maxBytes || 64 * 1024 * 1024);
  const counters = { hits: 0, misses: 0, coalesced: 0, stores: 0, invalidations: 0 };
  let redis: any = null;
  let redisReady = false;
  let redisError = '';
  let lastErrorLog = 0;

  let generation = 1;
  let generationCheckedAt = 0;

  if (options.url) {
    // Loaded lazily so a store without Redis never needs the package at all
    import('redis')
      .then(({ createClient }) => {
        redis = createClient({
          url: options.url,
          socket: {
            connectTimeout: 3000,
            reconnectStrategy: (retries: number) => Math.min(500 + retries * 500, 15000),
          },
        });
        redis.on('ready', () => {
          redisReady = true;
          redisError = '';
          generationCheckedAt = 0;
          console.log('[cache] Redis connected');
        });
        redis.on('end', () => {
          redisReady = false;
        });
        redis.on('error', (error: any) => {
          redisReady = false;
          redisError = String(error?.message || error).slice(0, 200);
          if (Date.now() - lastErrorLog > 60_000) {
            lastErrorLog = Date.now();
            console.error('[cache] Redis unavailable, using memory cache:', redisError);
          }
        });
        redis.connect().catch(() => undefined);
      })
      .catch((error: any) => {
        redisError = 'The "redis" package is not installed';
        console.error('[cache] Redis client could not load, using memory cache:', error?.message || error);
      });
  }

  const genKey = `${prefix}:gen`;

  async function currentGeneration(): Promise<number> {
    if (!redisReady || Date.now() - generationCheckedAt < 1000) return generation;
    generationCheckedAt = Date.now();
    try {
      const value = Number(await withTimeout(redis.get(genKey)));
      if (Number.isFinite(value) && value > 0 && value !== generation) {
        generation = value;
        memory.clear();
      }
    } catch {
      /* keep the local number */
    }
    return generation;
  }

  async function invalidate() {
    counters.invalidations += 1;
    generation += 1;
    memory.clear();
    if (redisReady) {
      try {
        const value = Number(await withTimeout(redis.incr(genKey)));
        if (Number.isFinite(value) && value > generation) generation = value;
        generationCheckedAt = Date.now();
      } catch {
        /* other instances catch up when their entries expire */
      }
    }
  }

  async function get(key: string): Promise<string | null> {
    const gen = await currentGeneration();
    const full = `${prefix}:c:${gen}:${key}`;
    const local = memory.get(full);
    if (local != null) return local;
    if (!redisReady) return null;
    try {
      const value = await withTimeout(redis.get(full));
      if (typeof value === 'string') {
        memory.set(full, value, 5);
        return value;
      }
    } catch {
      /* miss */
    }
    return null;
  }

  async function set(key: string, value: string, ttlSeconds: number) {
    const gen = await currentGeneration();
    const full = `${prefix}:c:${gen}:${key}`;
    counters.stores += 1;
    memory.set(full, value, ttlSeconds);
    if (redisReady) {
      try {
        await withTimeout(redis.set(full, value, { EX: ttlSeconds }));
      } catch {
        /* memory copy is enough */
      }
    }
  }

  /** Cache any async value (used by the server for its own settings reads) */
  const pendingValues = new Map<string, Promise<any>>();
  async function wrap<T>(key: string, ttlSeconds: number, produce: () => Promise<T>): Promise<T> {
    const cached = await get(`v:${key}`);
    if (cached != null) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        /* recompute */
      }
    }
    const running = pendingValues.get(key);
    if (running) return running;
    const task = (async () => {
      try {
        const value = await produce();
        await set(`v:${key}`, JSON.stringify(value), ttlSeconds);
        return value;
      } finally {
        pendingValues.delete(key);
      }
    })();
    pendingValues.set(key, task);
    return task;
  }

  /** Response cache for the listed GET routes */
  function middleware(rules: Rule[]): express.RequestHandler {
    const inflight = new Map<string, Promise<Stored | null>>();

    const send = (res: express.Response, stored: Stored, state: 'HIT' | 'WAIT') => {
      res.setHeader('X-Cache', state);
      for (const [name, value] of Object.entries(stored.h || {})) res.setHeader(name, value);
      if (stored.t) res.setHeader('Content-Type', stored.t);
      res.send(stored.b);
    };

    return async (req, res, next) => {
      if (req.method !== 'GET') return next();
      const rule = rules.find((item) => item.test.test(req.path));
      if (!rule) return next();
      const key = `r:${req.originalUrl}`;
      if (key.length > 600 || req.query.nocache !== undefined) return next();
      let shareable = false;
      try {
        shareable = await options.isShareable(req);
      } catch {
        shareable = false;
      }
      if (!shareable) return next();

      try {
        const hit = await get(key);
        if (hit != null) {
          counters.hits += 1;
          return send(res, JSON.parse(hit), 'HIT');
        }
      } catch {
        /* treat as a miss */
      }

      const waiting = inflight.get(key);
      if (waiting) {
        counters.coalesced += 1;
        const stored = await Promise.race([waiting, new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))]);
        if (stored && !res.headersSent) return send(res, stored, 'WAIT');
        return next();
      }

      counters.misses += 1;
      let settle: (value: Stored | null) => void = () => undefined;
      inflight.set(
        key,
        new Promise<Stored | null>((resolve) => {
          settle = resolve;
        })
      );
      const finish = (value: Stored | null) => {
        settle(value);
        inflight.delete(key);
      };

      res.setHeader('X-Cache', 'MISS');
      const originalSend = res.send.bind(res);
      (res as any).send = (body: any) => {
        try {
          if (res.statusCode === 200 && (typeof body === 'string' || Buffer.isBuffer(body))) {
            const headers: Record<string, string> = {};
            for (const name of ['Cache-Control', 'Vary']) {
              const value = res.getHeader(name);
              if (value) headers[name] = String(value);
            }
            const stored: Stored = {
              t: String(res.getHeader('Content-Type') || 'application/json; charset=utf-8'),
              b: Buffer.isBuffer(body) ? body.toString('utf8') : body,
              h: headers,
            };
            finish(stored);
            void set(key, JSON.stringify(stored), rule.ttl);
          } else {
            finish(null);
          }
        } catch {
          finish(null);
        }
        (res as any).send = originalSend;
        return originalSend(body);
      };
      res.on('close', () => finish(null));
      next();
    };
  }

  /** Any successful write under these prefixes makes every cached answer stale */
  function invalidateOnWrite(prefixes: RegExp[], except: RegExp[] = []): express.RequestHandler {
    return (req, res, next) => {
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
      if (!prefixes.some((re) => re.test(req.path)) || except.some((re) => re.test(req.path))) return next();
      res.on('finish', () => {
        if (res.statusCode < 400) void invalidate();
      });
      next();
    };
  }

  function status() {
    const mem = memory.stats();
    const total = counters.hits + counters.misses;
    return {
      mode: redisReady ? 'redis' : 'memory',
      redisConfigured: Boolean(options.url),
      redisConnected: redisReady,
      redisError: redisReady ? '' : redisError,
      generation,
      hitRate: total ? Math.round((counters.hits / total) * 1000) / 10 : 0,
      ...counters,
      memoryEntries: mem.entries,
      memoryBytes: mem.bytes,
    };
  }

  async function close() {
    try {
      if (redis) await redis.quit();
    } catch {
      /* closing anyway */
    }
  }

  return { get, set, wrap, invalidate, middleware, invalidateOnWrite, status, close };
}

export type AppCache = ReturnType<typeof createCache>;
