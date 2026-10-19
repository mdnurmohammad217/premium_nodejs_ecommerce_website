/**
 * Keeping the shop up under load and under bad input.
 *
 *  • Async route errors: Express 4 does not catch a rejected promise from an
 *    async handler — the request hangs until the browser gives up and the
 *    error escapes as an "unhandled rejection". Every handler is patched so a
 *    thrown/rejected error becomes a normal 500 JSON answer.
 *  • One final error handler: bad JSON → 400, oversized body → 413, anything
 *    else → 500, always JSON for API calls, never a stack trace to the visitor.
 *  • Process guards: an unexpected error is logged; it does not take the whole
 *    shop down for every other customer.
 *  • A small in-memory rate limiter for the public write endpoints.
 */
import type express from 'express';

export function patchAsyncErrors(app: express.Express): boolean {
  const anyApp = app as any;
  if (typeof anyApp.lazyrouter === 'function') anyApp.lazyrouter();
  const layer = anyApp._router?.stack?.[0];
  if (!layer) return false;
  const proto = Object.getPrototypeOf(layer);
  if (proto.__asyncPatched) return true;
  proto.handle_request = function handle(req: any, res: any, next: any) {
    const fn = this.handle;
    if (fn.length > 3) return next();
    try {
      const result = fn(req, res, next);
      if (result && typeof result.then === 'function' && typeof result.catch === 'function') {
        result.catch((error: any) => next(error || new Error('Request failed')));
      }
    } catch (error) {
      next(error);
    }
  };
  proto.__asyncPatched = true;
  return true;
}

export function errorHandler(): express.ErrorRequestHandler {
  return (error: any, req, res, next) => {
    if (res.headersSent) return next(error);
    const isApi = req.path.startsWith('/api/');
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'The request could not be read. Please try again.' });
    }
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'That upload is too large.' });
    }
    console.error(`[error] ${req.method} ${req.originalUrl}:`, error?.stack || error?.message || error);
    if (isApi) return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
    res.status(500).type('text').send('Something went wrong. Please refresh the page.');
  };
}

export function installProcessGuards() {
  let recent = 0;
  let windowStart = Date.now();
  const note = (kind: string, error: any) => {
    if (Date.now() - windowStart > 60_000) {
      windowStart = Date.now();
      recent = 0;
    }
    recent += 1;
    if (recent <= 20) console.error(`[process] ${kind}:`, error?.stack || error?.message || error);
    else if (recent === 21) console.error('[process] more errors in the last minute were not logged');
  };
  process.on('unhandledRejection', (reason) => note('unhandled rejection', reason));
  process.on('uncaughtException', (error) => note('uncaught exception', error));
}

/**
 * Sliding-window limiter keyed by client IP (or any key). Mobile networks in
 * Bangladesh put many customers behind one address, so limits are generous:
 * they stop scripts, not shoppers.
 */
export function rateLimit(options: { windowMs: number; max: number; key: (req: express.Request) => string; message?: string }): express.RequestHandler {
  const hits = new Map<string, number[]>();
  setInterval(() => {
    const now = Date.now();
    for (const [key, times] of hits) {
      const fresh = times.filter((at) => now - at < options.windowMs);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }, Math.max(30_000, options.windowMs)).unref?.();
  return (req, res, next) => {
    const key = options.key(req) || 'unknown';
    const now = Date.now();
    const times = (hits.get(key) || []).filter((at) => now - at < options.windowMs);
    if (times.length >= options.max) {
      res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
      return res.status(429).json({ error: options.message || 'Too many requests. Please wait a moment and try again.' });
    }
    times.push(now);
    hits.set(key, times);
    if (hits.size > 50_000) hits.clear();
    next();
  };
}
