// Load .env before anything reads process.env (the DB pool builds at import time).
import './src/server/env.ts';
import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { db, createPool } from './src/db/index.ts';
import { insertReturning, updateReturning, deleteReturning } from './src/db/mysql-helpers.ts';
import {
  products,
  categories,
  brands,
  orders,
  orderItems,
  customers,
  suppliers,
  purchases,
  purchaseItems,
  inventoryTransactions,
  coupons,
  heroBanners,
  siteSettings,
  reviews,
  users,
  expenses,
  counterSessions,
  customerPayments,
  supplierPayments,
  purchaseReturns,
  purchaseReturnItems,
  generics,
  manufacturers,
  productGroups,
  preOrders,
  productIssues,
  salaries,
  attributes,
  productAttributes,
  blockedIps,
  productVariations,
  abandonedCheckouts,
  passwordResets,
  adminNotifications,
} from './src/db/schema.ts';
import { getTableColumns } from 'drizzle-orm';
import { eq, like, or, and, desc, asc, sql, lte, gte, inArray } from 'drizzle-orm';
import { createLicenseService, LICENSE_TABLES } from './src/server/license.ts';
import { SCHEMA_COLUMNS, SCHEMA_INDEXES, SCHEMA_TABLES } from './src/server/schema-upgrades.ts';
import { BASE_TABLES } from './src/server/base-schema.ts';
import { LOADED_ENV_FILES, APP_DIR } from './src/server/env.ts';
import { readableOnWhite, textOnColor } from './src/lib/contrast.ts';
import { fontConfigOf, fontHeadHtml } from './src/lib/fonts.ts';
import {
  authorizeUrl,
  fetchProfile,
  isClientNonce,
  makeState,
  publicSocialLogin,
  readState,
  safeReturnPath,
  SOCIAL_PROVIDERS,
  type SocialLoginConfig,
  type SocialProfile,
  type SocialProvider,
} from './src/server/social-login.ts';
import { trackingBodyTags, trackingHeadTags } from './src/server/tracking-loader.ts';
import { fallbackDescription, renderJsonLd, renderSnapshot, type SeoInput } from './src/server/seo.ts';
import { createImageResizer, loadSharp, uploadedImageSize, uploadSized, uploadSrcSet } from './src/server/image-resize.ts';
import { createMediaStore, mimeForFile } from './src/server/media-store.ts';
import { paymentMethodLabel } from './src/lib/paymentLabels.ts';
import { createCache } from './src/server/cache.ts';
import { registerPayments, publicGateways, enabledGatewayIds, GATEWAY_IDS } from './src/server/payments.ts';
import { registerContent, loadLandingForOrder, countLandingOrder, readJsonSetting, recalcProductRating } from './src/server/content.ts';
import { computeShipping, parseCharges, type FreeShippingRules } from './src/lib/shipping.ts';
import { cleanGeoConfig, DEFAULT_CHECKOUT_GEO, zoneForPlace } from './src/lib/geoShipping.ts';
import { productImageCss } from './src/lib/productImage.ts';
import { cleanFingerprint, compareFingerprints, FINGERPRINT_VERSION, type ImageFingerprint } from './src/lib/imageFingerprint.ts';
import { PERMISSION_MODULES, staffMayCall, hasModule, hasDashboardAccess, settingKeyModules, canOpenTab } from './src/lib/permissions.ts';
import {
  readImportFile,
  toCsv,
  OUR_CSV_COLUMNS,
  productToCsvRow,
  absoluteUrl as absoluteLink,
  absolutiseHtml,
  imageLinksInHtml,
  downloadImage,
  type ImportProduct,
  type ImportCategoryStep,
  type ImportSource,
  type ImportVariation,
} from './src/server/productTransfer.ts';
import { findDistrict, districtHasThana } from './src/lib/bdGeo.ts';
import { patchAsyncErrors, errorHandler, installProcessGuards, rateLimit } from './src/server/hardening.ts';
import { registerPasswordResetRoutes } from './src/server/routes/passwordReset.ts';
import { registerBulkActionRoutes } from './src/server/routes/bulkActions.ts';
import { registerIncompleteOrderRoutes } from './src/server/routes/incompleteOrders.ts';
import { registerProductImportExportRoutes } from './src/server/routes/productImportExport.ts';
import { registerCourierRoutes } from './src/server/routes/couriers.ts';
import { registerGenericRoutes } from './src/server/routes/generics.ts';
import { registerContactRoutes } from './src/server/routes/contactMessages.ts';
import { registerLiveChatRoutes } from './src/server/routes/liveChat.ts';
import { utcIso } from './src/server/utcDate.ts';
import { registerMetaCatalogRoutes } from './src/server/routes/metaCatalog.ts';
import { registerMaintenanceRoutes } from './src/server/routes/maintenance.ts';
import { registerReturnRoutes } from './src/server/routes/returns.ts';
import { registerFraudCheckerRoutes } from './src/server/routes/fraudChecker.ts';
import { registerEmailRoutes } from './src/server/routes/email.ts';
import { registerSmsRoutes } from './src/server/routes/sms.ts';
import { registerWholesaleAccountRoutes } from './src/server/routes/wholesaleAccounts.ts';
import { registerMediaLibraryRoutes } from './src/server/routes/mediaLibrary.ts';
import { registerExpenseRoutes } from './src/server/routes/expenses.ts';

/** Shown in System Configuration → Database */
export const APP_VERSION: string = '3.15.0';

/** The shop's own time zone — days, invoice dates and "today" are counted in it */
const SHOP_TZ = String(process.env.REPORT_TIMEZONE || 'Asia/Dhaka');
/** YYYY-MM-DD of a moment in the shop's time zone (default: now) */
export function shopDay(value?: Date | string | number | null): string {
  const date = value === undefined || value === null ? new Date() : new Date(value as any);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
/** First moment of a shop day (YYYY-MM-DD) as a UTC instant */
function shopDayStart(day: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? zonedDayStart(day) : new Date(day);
}
/** Last moment of a shop day (YYYY-MM-DD) as a UTC instant */
function shopDayEnd(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Date(day);
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return new Date(zonedDayStart(next.toISOString().slice(0, 10)).getTime() - 1);
}

export const app = express();
export const PORT = Number(process.env.PORT) || 3000;
// A failing request answers with an error instead of hanging; an unexpected
// error is logged instead of stopping the shop for everyone.
installProcessGuards();
patchAsyncErrors(app);
/**
 * Lets the dashboard place an order through the normal order route (same
 * stock, price and shipping rules) — e.g. converting an incomplete checkout.
 * Random per process, never sent to a browser.
 */
export const INTERNAL_ORDER_KEY = crypto.randomBytes(24).toString('hex');

// Don't advertise the stack — it is free reconnaissance for an attacker.
app.disable('x-powered-by');

// gzip every text response. On shared hosting this is the single biggest
// win for time-to-first-paint, and it costs nothing for already-compressed
// images because compression skips them by content type.
app.use(compression());

/**
 * Security headers. No extra dependency — these are the handful that actually
 * matter for an app that serves its own SPA and talks only to its own API.
 * A CSP is deliberately not set here: the dashboard injects the GTM / Meta
 * pixel snippets at runtime, and a wrong CSP silently breaks tracking.
 */
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0'); // modern browsers: the legacy auditor causes bugs
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// 12 MB is enough for a large product photo; 50 MB let a single request tie up
// the whole process on shared hosting.
// Generous enough for a multi-image upload batch; each file is still checked
// individually against MEDIA_MAX_BYTES below.
app.use(express.json({ limit: '40mb' }));
// API answers are always revalidated by browsers and proxies (the server has
// its own cache); a route that needs stricter rules sets its own header.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET') res.setHeader('Cache-Control', 'no-cache');
  next();
});
app.use(express.urlencoded({ extended: true, limit: '40mb' }));

/**
 * Login throttle. Five failures from one IP inside fifteen minutes and that IP
 * waits — enough to stop credential stuffing without locking out a real user
 * who fat-fingered their password twice.
 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map<string, { count: number; first: number }>();

export function loginThrottle(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = clientIp(req) || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (entry && now - entry.first > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
  }

  const current = loginAttempts.get(key);
  if (current && current.count >= LOGIN_MAX_ATTEMPTS) {
    const waitMinutes = Math.ceil((LOGIN_WINDOW_MS - (now - current.first)) / 60000);
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${waitMinutes} min.`,
    });
  }
  next();
}

export function noteLoginFailure(req: express.Request) {
  const key = clientIp(req) || 'unknown';
  const entry = loginAttempts.get(key);
  if (entry) entry.count += 1;
  else loginAttempts.set(key, { count: 1, first: Date.now() });
}

export function clearLoginFailures(req: express.Request) {
  loginAttempts.delete(clientIp(req) || 'unknown');
}

// Keep the throttle map from growing without bound on a long-running process
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now - entry.first > LOGIN_WINDOW_MS) loginAttempts.delete(key);
  }
}, LOGIN_WINDOW_MS).unref();

// ---------------------------------------------------------------------------
// UPLOADED IMAGES — kept OUTSIDE the app folder
// They used to live in <app>/public/uploads, so replacing the app with a new
// version deleted every uploaded logo and product photo. Now:
//   UPLOADS_DIR=/home/you/shop-uploads   (absolute path, recommended), or
//   by default a folder beside the app: <parent>/<app-folder>-uploads
//   (falls back to <app>/storage/uploads if the parent is not writable).
// Files still in the old folders are copied over on start, and are still
// served from there as a fallback, so no existing link breaks.
// ---------------------------------------------------------------------------
function resolveUploadsDir(): string {
  const tryDir = (dir: string) => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  };
  const configured = String(process.env.UPLOADS_DIR || '').trim();
  if (configured) {
    const dir = path.resolve(APP_DIR, configured);
    if (tryDir(dir)) return dir;
    console.error(`[uploads] UPLOADS_DIR "${dir}" is not writable — using the default folder instead.`);
  }
  const appDir = APP_DIR;
  const sibling = path.join(path.dirname(appDir), `${path.basename(appDir)}-uploads`);
  if (path.dirname(appDir) !== appDir && tryDir(sibling)) return sibling;
  const inside = path.join(appDir, 'storage', 'uploads');
  tryDir(inside);
  return inside;
}

export const uploadsDir = resolveUploadsDir();
const LEGACY_UPLOAD_DIRS = [path.join(APP_DIR, 'public', 'uploads'), path.join(APP_DIR, 'dist', 'uploads')].filter(
  (dir) => path.resolve(dir) !== path.resolve(uploadsDir)
);

/** One-time copy of files left in the old folders (never deletes anything) */
function migrateLegacyUploads() {
  let copied = 0;
  for (const dir of LEGACY_UPLOAD_DIRS) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const from = path.join(dir, name);
      const to = path.join(uploadsDir, name);
      try {
        if (!fs.statSync(from).isFile() || fs.existsSync(to)) continue;
        fs.copyFileSync(from, to);
        copied += 1;
      } catch {
        /* skip unreadable files */
      }
    }
  }
  if (copied > 0) console.log(`[uploads] copied ${copied} file(s) from the old uploads folder to ${uploadsDir}`);
}
migrateLegacyUploads();
console.log(`[uploads] images are stored in ${uploadsDir}`);

/**
 * v3.7 — every upload is also copied into the database (media_files), and a
 * file missing from disk is written back from there on its first request.
 * See src/server/media-store.ts. MEDIA_DB_BACKUP=off keeps disk only.
 */
export const mediaStore = createMediaStore({
  db,
  uploadsDir,
  legacyDirs: LEGACY_UPLOAD_DIRS,
  enabled: !/^(off|false|0|no)$/i.test(String(process.env.MEDIA_DB_BACKUP || '').trim()),
});

const imageResizer = createImageResizer({ uploadsDir, extraDirs: LEGACY_UPLOAD_DIRS });
void loadSharp().then((sharp) => sharp && console.log('[images] pictures are resized for each screen (WebP)'));

/** Saves an uploaded file (disk + database copy) and returns its public path */
export async function saveUploadedFile(fileName: string, buffer: Buffer): Promise<string> {
  await fs.promises.mkdir(uploadsDir, { recursive: true });
  await fs.promises.writeFile(path.join(uploadsDir, fileName), buffer);
  await mediaStore.save(fileName, buffer, mimeForFile(fileName));
  return `/uploads/${fileName}`;
}

// Uploaded media is content-addressed by filename, so it caches for a week
// Opened directly in a tab, an uploaded file (an SVG can carry script) is
// sandboxed: it still shows as a picture everywhere, but can run nothing and
// reach nothing on this site.
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!/\.(jpe?g|png|webp|gif|avif|ico|pdf)$/i.test(req.path)) {
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  }
  next();
});
// v3.12 — `?w=400` sends a WebP copy made for that width (src/server/image-resize.ts)
app.use('/uploads', imageResizer.middleware);
// Every upload gets a unique name (time + random), so a file never changes:
// browsers and Cloudflare may keep it for a year
app.use('/uploads', express.static(uploadsDir, { maxAge: '365d', immutable: true, fallthrough: true }));
for (const dir of LEGACY_UPLOAD_DIRS) app.use('/uploads', express.static(dir, { maxAge: '365d', immutable: true, fallthrough: true }));
// Not on disk any more (redeploy, new version, moved folder): serve the database copy
app.use('/uploads', mediaStore.restoreMiddleware());
// A missing image is a 404, never the storefront page (an HTML answer for an
// <img> used to be cached by browsers as a broken picture)
app.use('/uploads', (_req, res) => {
  res.status(404).setHeader('Cache-Control', 'no-cache');
  res.type('text/plain').send('Not found');
});

/**
 * Real client IP. Hostinger / Cloudflare put the visitor address in
 * X-Forwarded-For (left-most entry) or CF-Connecting-IP; req.ip would otherwise
 * report the proxy. IPv4-mapped IPv6 (::ffff:1.2.3.4) is normalised.
 */
export function clientIp(req: express.Request): string {
  const cf = req.headers['cf-connecting-ip'];
  const real = req.headers['x-real-ip'];
  const fwd = req.headers['x-forwarded-for'];
  let ip =
    (typeof cf === 'string' && cf) ||
    (typeof real === 'string' && real) ||
    (typeof fwd === 'string' ? fwd.split(',')[0] : Array.isArray(fwd) ? fwd[0] : '') ||
    req.socket.remoteAddress ||
    '';
  ip = String(ip).trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}


// ---------------------------------------------------------------------------
// IP BLOCKING — enforced site-wide, not just at checkout
// ---------------------------------------------------------------------------
/**
 * Blocking used to be checked only inside POST /api/orders, so a blocked
 * visitor could still browse, add to cart and reach the last step before being
 * refused — and nothing stopped them using any other endpoint.
 *
 * The list is now held in memory (one small query, refreshed when the admin
 * changes it or every 30s) and checked on every public storefront request, so
 * the block is immediate and costs no extra query per page view.
 *
 * Entries may be an exact address or a trailing-wildcard prefix such as
 * `103.120.5.*`, which covers a whole subnet — a visitor on a dynamic IP could
 * previously come straight back with the next address in their range.
 */
const blockState = {
  exact: new Set<string>(),
  prefixes: [] as string[],
  notes: new Map<string, string>(),
  loadedAt: 0,
};

async function refreshBlockedIps(force = false): Promise<void> {
  if (!force && Date.now() - blockState.loadedAt < 30_000) return;
  try {
    const rows = await db.select().from(blockedIps);
    const exact = new Set<string>();
    const prefixes: string[] = [];
    const notes = new Map<string, string>();
    for (const row of rows) {
      const value = String(row.ip || '').trim();
      if (!value) continue;
      notes.set(value, row.note || '');
      if (value.endsWith('*')) prefixes.push(value.slice(0, -1));
      else exact.add(value);
    }
    blockState.exact = exact;
    blockState.prefixes = prefixes;
    blockState.notes = notes;
    blockState.loadedAt = Date.now();
  } catch (err) {
    // Never let a transient DB hiccup lock every visitor out.
    console.error('Could not refresh the IP block list:', err);
    blockState.loadedAt = Date.now();
  }
}

/** Returns the matching block entry, or null when the address is allowed. */
function matchBlockedIp(ip: string): { entry: string; reason: string } | null {
  if (!ip) return null;
  if (blockState.exact.has(ip)) {
    return { entry: ip, reason: blockState.notes.get(ip) || '' };
  }
  for (const prefix of blockState.prefixes) {
    if (ip.startsWith(prefix)) {
      return { entry: `${prefix}*`, reason: blockState.notes.get(`${prefix}*`) || '' };
    }
  }
  return null;
}

const BLOCK_MESSAGE = 'Sorry, access to this site has been blocked from your device.';

/**
 * Paths a blocked visitor may still reach. The admin dashboard and the login
 * endpoints are deliberately exempt: an owner whose own office IP ended up on
 * the list must still be able to sign in and remove it.
 */
function isBlockExempt(pathName: string): boolean {
  return (
    pathName.startsWith('/api/admin') ||
    pathName.startsWith('/api/pos') ||
    pathName.startsWith('/api/auth') ||
    pathName === '/api/health' ||
    pathName === '/api/settings' ||
    pathName === '/api/cache-version' ||
    // The storefront must be able to READ its own block status to show the
    // notice; the gate above would otherwise answer with a bare 403.
    pathName === '/api/access-check'
  );
}

app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/') || isBlockExempt(req.path)) return next();

  await refreshBlockedIps();
  if (blockState.exact.size === 0 && blockState.prefixes.length === 0) return next();

  const hit = matchBlockedIp(clientIp(req));
  if (!hit) return next();

  // A signed-in staff member is never locked out by an IP rule (the account
  // must still be active — a token alone is not enough).
  const token = readSession(getBearer(req));
  const session = token && (token.role === 'admin' || token.role === 'staff') ? await resolveLiveSession(token).catch(() => null) : null;
  if (session?.role === 'admin' || session?.role === 'staff') return next();

  return res.status(403).json({ error: BLOCK_MESSAGE, blocked: true, reason: hit.reason || null });
});

// ---------------------------------------------------------------------------
// LICENSE — License Server v2 (see src/server/license.ts)
// The gate sits in front of every route below, so every back-office API —
// and any added later — needs a valid license. It is enforced here on the
// server; hiding screens in the dashboard is only a convenience on top.
// ---------------------------------------------------------------------------
const license = createLicenseService({
  db,
  readSession: (token) => readSession(token),
  getBearer: (req) => getBearer(req),
  requireRole: (...roles) => requireRole(...roles) as any,
  clientIp: (req) => clientIp(req),
  appVersion: APP_VERSION,
  internalOrderKey: INTERNAL_ORDER_KEY,
  get secret() {
    return SESSION_SECRET;
  },
  notifyAdmin: (type, title, body, linkTab) => notifyAdmin(type, title, body, linkTab),
});
app.use(license.gate);
license.register(app);

// ---------------------------------------------------------------------------
// RESPONSE CACHE (Redis when REDIS_URL is set, memory otherwise)
// The busiest public reads are answered from the cache; any successful write
// in the dashboard or POS makes every cached answer stale at once. See
// src/server/cache.ts.
// ---------------------------------------------------------------------------
/** Approved wholesale buyers see other prices, so their pages are never shared */
export let wholesaleIdsCache: { at: number; ids: Set<number> } = { at: 0, ids: new Set() };
async function approvedWholesaleIds(): Promise<Set<number>> {
  if (Date.now() - wholesaleIdsCache.at < 30_000) return wholesaleIdsCache.ids;
  try {
    const result: any = await db.execute(
      sql`SELECT id FROM customers WHERE customer_type = 'wholesale' AND wholesale_status = 'approved'`
    );
    const rows = Array.isArray(result?.[0]) ? result[0] : [];
    wholesaleIdsCache = { at: Date.now(), ids: new Set(rows.map((row: any) => Number(row.id))) };
  } catch {
    wholesaleIdsCache = { at: Date.now(), ids: wholesaleIdsCache.ids };
  }
  return wholesaleIdsCache.ids;
}

async function isShareableRequest(req: express.Request): Promise<boolean> {
  const token = getBearer(req);
  if (!token) return true;
  const session = readSession(token);
  if (!session) return true; // an expired token is answered as a guest anyway
  if (session.role !== 'customer') return false;
  const id = Number(String(session.sub).replace('customer_', '')) || 0;
  return !(await approvedWholesaleIds()).has(id);
}

export const cache = createCache({
  url: process.env.REDIS_URL || '',
  prefix: process.env.REDIS_PREFIX || 'pharma',
  maxBytes: (Number(process.env.CACHE_MEMORY_MB) || 64) * 1024 * 1024,
  isShareable: isShareableRequest,
});

app.use(
  cache.invalidateOnWrite(
    [/^\/api\/admin/, /^\/api\/pos/, /^\/api\/settings/, /^\/api\/media/, /^\/api\/reviews/, /^\/api\/dashboard/],
    // v3.15 — writes that never change what the shop shows keep the cache:
    // live chat replies, notifications, the POS drawer log, held bills, abandoned-checkout notes
    [/^\/api\/admin\/(live-chat|notifications|search|pixel)(\/|$)/, /^\/api\/pos\/(drawer-events|held-orders)(\/|$)/]
  )
);
app.use((req, res, next) => {
  // Dashboard writes move the browsers' cache version (see scheduleCacheVersionBump)
  if (
    req.method !== 'GET' &&
    req.method !== 'HEAD' &&
    req.method !== 'OPTIONS' &&
    /^\/api\/(admin|settings|media)(\/|$)/.test(req.path) &&
    !req.path.startsWith('/api/admin/cache/flush') &&
    // v3.15 — chat replies and notifications do not change the shop
    !/^\/api\/admin\/(live-chat|notifications|search)(\/|$)/.test(req.path)
  ) {
    res.on('finish', () => {
      if (res.statusCode < 400) scheduleCacheVersionBump();
    });
  }
  next();
});
app.use((req, _res, next) => {
  // A wholesale approval must reach the buyer's next page view at once
  if (req.method !== 'GET' && req.path.startsWith('/api/admin/wholesale')) wholesaleIdsCache.at = 0;
  next();
});
// Public write endpoints: generous limits that stop scripts, not shoppers
const orderLimiter = rateLimit({ windowMs: 10 * 60_000, max: 40, key: (req) => clientIp(req), message: 'Too many orders from this network. Please wait a few minutes.' });
const paymentLimiter = rateLimit({ windowMs: 10 * 60_000, max: 40, key: (req) => clientIp(req) });
const trackLimiter = rateLimit({ windowMs: 60_000, max: 120, key: (req) => clientIp(req) });
app.use('/api/orders', (req, res, next) => (req.method === 'POST' && req.path === '/' ? orderLimiter(req, res, next) : next()));
app.use('/api/payments', (req, res, next) => (req.method === 'POST' && req.path.endsWith('/init') ? paymentLimiter(req, res, next) : next()));
app.use('/api/checkout/track', (req, res, next) => (req.method === 'POST' ? trackLimiter(req, res, next) : next()));

app.use(
  cache.middleware([
    { test: /^\/api\/settings$/, ttl: 300 },
    { test: /^\/api\/banners$/, ttl: 300 },
    { test: /^\/api\/categories$/, ttl: 300 },
    { test: /^\/api\/brands$/, ttl: 300 },
    { test: /^\/api\/generics$/, ttl: 300 },
    { test: /^\/api\/products$/, ttl: 60 },
    { test: /^\/api\/products\/[^/]+$/, ttl: 60 },
    { test: /^\/api\/blog(\/[^/]+)?$/, ttl: 300 },
    { test: /^\/api\/lp\/[^/]+$/, ttl: 120 },
    { test: /^\/api\/size-guides\/\d+$/, ttl: 600 },
    { test: /^\/sitemap\.xml$/, ttl: 900 },
    { test: /^\/robots\.txt$/, ttl: 900 },
    { test: /^\/feeds\//, ttl: 900 },
  ])
);

/**
 * The storefront calls this on first paint to decide whether to show the
 * "access blocked" screen, so a blocked visitor is told immediately instead of
 * watching requests fail one by one.
 */
app.get('/api/access-check', async (req, res) => {
  await refreshBlockedIps();
  const ip = clientIp(req);
  const hit = matchBlockedIp(ip);
  res.json({
    ip,
    blocked: Boolean(hit),
    reason: hit?.reason || null,
    message: hit ? BLOCK_MESSAGE : null,
  });
});

/**
 * Health check — v3.11 also proves the database is reachable.
 *
 *   200 {"status":"ok", "database":{"status":"connected", …}}
 *   503 {"status":"error", "database":{"status":"disconnected", "error":…, "hint":…}}
 *
 * Uptime monitors can watch the status code. Nothing secret is shown: no host,
 * user or password — only whether the connection works, how fast it answers,
 * whether every table is there, and a plain hint when it does not work.
 */
const DB_ERROR_HINTS: Array<[RegExp, string]> = [
  // Checked first: "Access denied … to database" is a missing permission, not a wrong password
  [/ER_DBACCESS_DENIED|Access denied for user [^ ]+ to database/i, 'The user name and password are right, but this user has no access to DB_NAME. In your hosting panel add the user to the database with ALL PRIVILEGES (cPanel: MySQL Databases → Add User To Database), and check DB_NAME.'],
  [/ER_ACCESS_DENIED|Access denied/i, 'The database user name or password is wrong. Check DB_USER and DB_PASSWORD in .env (copy them from the hosting panel; if a value has a # in it, put it in quotes). Variables set in the hosting panel override .env.'],
  [/ER_BAD_DB_ERROR|Unknown database/i, 'The database does not exist. Check DB_NAME in .env (on Hostinger it looks like u123456789_name).'],
  [/ECONNREFUSED/i, 'Nothing is answering on DB_HOST / DB_PORT. Is MySQL running? On Hostinger DB_HOST is usually localhost.'],
  [/ENOTFOUND|EAI_AGAIN/i, 'DB_HOST could not be found. Check the host name in .env.'],
  [/ETIMEDOUT|timed out/i, 'The database did not answer in time. Check DB_HOST / DB_PORT and that remote access is allowed.'],
  [/Too many connections|ER_CON_COUNT/i, 'The database has too many open connections. Lower DB_POOL_LIMIT in .env or restart the app.'],
  [/No database selected/i, 'DB_NAME is empty. Set DB_NAME in .env.'],
];

function databaseHint(message: string): string {
  if (!process.env.DB_NAME && !process.env.SQL_DB_NAME) return 'DB_NAME is not set — the .env file was not found or is empty. Put .env next to package.json.';
  return DB_ERROR_HINTS.find(([re]) => re.test(message))?.[1] || 'Check DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD in .env.';
}

/** One quick round trip to MySQL, with a time limit so a hung server cannot hang the check */
async function probeDatabase(timeoutMs = 5000): Promise<{
  connected: boolean;
  latencyMs: number;
  tables?: number;
  missingTables?: string[];
  error?: string;
  code?: string;
}> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const query = (async () => {
      const pool = createPool();
      const [rows]: any = await pool.query(
        'SELECT DATABASE() AS name, (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()) AS n'
      );
      const name = rows?.[0]?.name;
      if (!name) throw Object.assign(new Error('No database selected'), { code: 'ER_NO_DB_ERROR' });
      const latencyMs = Date.now() - started;
      const [tableRows]: any = await pool.query('SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
      const present = new Set((tableRows as any[]).map((row) => String(row.t)));
      const missing = BASE_TABLES.map((table) => table.name).filter((table) => !present.has(table));
      return { connected: true, latencyMs, tables: Number(rows?.[0]?.n) || present.size, missingTables: missing };
    })();
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Database check timed out'), { code: 'ETIMEDOUT' })), timeoutMs);
    });
    return await Promise.race([query, limit]);
  } catch (error: any) {
    return {
      connected: false,
      latencyMs: Date.now() - started,
      error: String(error?.sqlMessage || error?.message || error).slice(0, 200),
      code: error?.code ? String(error.code) : undefined,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let healthMemo: { at: number; body: any; code: number } | null = null;
app.get('/api/health', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  // Monitors poll every few seconds; one database round trip per 3 s is plenty
  if (healthMemo && Date.now() - healthMemo.at < 3000) return res.status(healthMemo.code).json(healthMemo.body);
  const probe = await probeDatabase();
  const ready = probe.connected && (probe.missingTables || []).length === 0;
  const body = {
    status: probe.connected ? 'ok' : 'error',
    time: new Date().toISOString(),
    version: APP_VERSION,
    uptimeSeconds: Math.round(process.uptime()),
    database: probe.connected
      ? {
          status: 'connected',
          latencyMs: probe.latencyMs,
          tables: probe.tables,
          schema: ready ? (schemaReport.ok ? 'up to date' : 'needs attention') : 'tables missing',
          ...(probe.missingTables && probe.missingTables.length > 0 ? { missingTables: probe.missingTables.slice(0, 20) } : {}),
        }
      : {
          status: 'disconnected',
          error: probe.code || 'DB_ERROR',
          hint: databaseHint(`${probe.code || ''} ${probe.error || ''}`),
        },
    env: LOADED_ENV_FILES.length > 0 ? 'loaded' : 'not found',
  };
  const code = probe.connected ? 200 : 503;
  healthMemo = { at: Date.now(), body, code };
  res.status(code).json(body);
});

// This build ships with NO demo or sample catalogue data. The only rows
// created automatically are the ones bootstrapDefaults() writes: the owner
// account, the empty setting rows and the starter coupon/attribute lists.
// Import database/database.sql for the schema, then add your own catalogue.

// ==========================================
// 1. PUBLIC STORE APIS
// ==========================================

function hashPassword(pass: string): string {
  // Legacy (unsalted) hash. Kept ONLY to verify credentials saved by older builds.
  return crypto.createHash('sha256').update(pass).digest('hex');
}

// ==========================================
// PASSWORD HASHING (salted PBKDF2) + SESSION TOKENS
// ==========================================
const PBKDF2_ITERATIONS = 120_000;

export function makePasswordRecord(pass: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto
    .pbkdf2Sync(pass, salt, PBKDF2_ITERATIONS, 32, 'sha256')
    .toString('hex');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${derived}`;
}

function verifyPassword(pass: string, stored: string): { ok: boolean; needsUpgrade: boolean } {
  if (!stored) return { ok: false, needsUpgrade: false };

  if (stored.startsWith('pbkdf2$')) {
    const [, iterStr, salt, expected] = stored.split('$');
    const derived = crypto
      .pbkdf2Sync(pass, salt, Number(iterStr) || PBKDF2_ITERATIONS, 32, 'sha256')
      .toString('hex');
    const a = Buffer.from(derived, 'hex');
    const b = Buffer.from(expected, 'hex');
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    return { ok, needsUpgrade: false };
  }

  // Legacy sha256 hash -> verify, then transparently upgrade on success
  const legacy = hashPassword(pass);
  const a = Buffer.from(legacy, 'hex');
  const b = Buffer.from(stored, 'hex');
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, needsUpgrade: ok };
}

export const SESSION_SECRET =
  process.env.SESSION_SECRET || process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.SESSION_SECRET && !process.env.JWT_SECRET) {
  console.warn(
    '[security] SESSION_SECRET is not set. A random secret was generated for this process, ' +
      'so all sessions will be invalidated on restart. Set SESSION_SECRET in .env for production.'
  );
}

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  role: 'admin' | 'staff' | 'customer';
  /** Module keys a staff account may touch. Admins are unrestricted. */
  permissions?: string[];
  jobRole?: string;
  exp: number;
  /** Issued-at (ms). Tokens signed before a password reset stop working. */
  iat?: number;
}

/** Every module a staff account can be granted. Keep in sync with the dashboard. */

export function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify({ iat: Date.now(), ...payload })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readSession(token?: string | null): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

interface AuthedRequest extends express.Request {
  session?: SessionPayload;
}

/** v3.14 — the signed-in session of a request, if any, without requiring one (live chat) */
export function peekSession(req: express.Request): SessionPayload | null {
  return readSession(getBearer(req));
}

function getBearer(req: express.Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Session tokens are stateless (12 h), so a staff account that is deactivated or
 * has a permission revoked would otherwise keep working until the token expired.
 * For any `staff_*` subject we therefore re-read the users row on every request
 * and use the *live* status + permissions, not the ones baked into the token.
 */
async function resolveLiveSession(session: SessionPayload): Promise<SessionPayload | null> {
  // A password reset signs the account out everywhere: any token issued
  // before the reset is refused from then on.
  const changedAt = await passwordChangedAt(session.sub);
  if (changedAt && sessionIssuedAt(session) < changedAt) return null;
  if (!session.sub.startsWith('staff_')) return session;
  const id = Number(session.sub.slice('staff_'.length));
  if (!Number.isFinite(id)) return null;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.status !== 'active') return null;
  let perms: string[] = [];
  try {
    perms = row.permissions ? JSON.parse(row.permissions) : [];
  } catch {
    perms = [];
  }
  return {
    ...session,
    name: row.name,
    email: row.email,
    role: row.role === 'admin' ? 'admin' : 'staff',
    jobRole: row.jobRole || undefined,
    permissions: Array.isArray(perms) ? perms : [],
  };
}

/**
 * When each account's password was last reset (ms since epoch; 0 = never).
 * Stored as a number, not a DATETIME, so the database's time zone can never
 * make an old session look newer than the reset. Cached for a minute so the
 * check costs nothing on busy pages; a reset updates the cache immediately.
 */
export const passwordChangedCache = new Map<string, { at: number; value: number }>();

async function passwordChangedAt(sub: string): Promise<number> {
  const hit = passwordChangedCache.get(sub);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  let value = 0;
  try {
    if (sub === 'admin_root') {
      const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'admin_auth')).limit(1);
      value = rows.length > 0 ? Number(JSON.parse(rows[0].value)?.passwordChangedAt) || 0 : 0;
    } else if (sub.startsWith('staff_')) {
      const result: any = await db.execute(sql`SELECT password_changed_at AS v FROM users WHERE id = ${Number(sub.slice(6)) || 0}`);
      value = Number((Array.isArray(result?.[0]) ? result[0] : [])[0]?.v) || 0;
    } else if (sub.startsWith('customer_')) {
      const result: any = await db.execute(sql`SELECT password_changed_at AS v FROM customers WHERE id = ${Number(sub.slice(9)) || 0}`);
      value = Number((Array.isArray(result?.[0]) ? result[0] : [])[0]?.v) || 0;
    }
  } catch {
    value = 0; // column not there yet: never lock anyone out because of it
  }
  passwordChangedCache.set(sub, { at: Date.now(), value });
  if (passwordChangedCache.size > 5000) passwordChangedCache.clear();
  return value;
}

const sessionIssuedAt = (session: SessionPayload) => Number(session.iat) || Number(session.exp) - SESSION_TTL_MS;

export function requireRole(...roles: Array<'admin' | 'staff' | 'customer'>) {
  return async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
    const raw = readSession(getBearer(req));
    if (!raw) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }
    let session: SessionPayload | null;
    try {
      session = await resolveLiveSession(raw);
    } catch {
      return res.status(500).json({ error: 'Could not verify your session.' });
    }
    if (!session) {
      return res.status(401).json({ error: 'Your session has ended. Please sign in again.' });
    }
    if (roles.length > 0 && !roles.includes(session.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    req.session = session;
    next();
  };
}

/** Gate one module. Admins pass; staff need the key in their live permission list. */
function requirePermission(permission: string) {
  return (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
    const session = req.session;
    if (!session) return res.status(401).json({ error: 'Authentication required.' });
    if (session.role === 'admin') return next();
    if ((session.permissions || []).includes(permission)) return next();
    return res.status(403).json({ error: 'You do not have access to this module.' });
  };
}

/** Any one of several modules opens the route */
function requireAnyPermission(...permissions: string[]) {
  return (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
    const session = req.session;
    if (!session) return res.status(401).json({ error: 'Authentication required.' });
    if (session.role === 'admin') return next();
    if (permissions.some((permission) => (session.permissions || []).includes(permission))) return next();
    return res.status(403).json({ error: 'You do not have access to this module.' });
  };
}

const requireAdmin = requireRole('admin');
const requireStaff = requireRole('admin', 'staff');
/** Admin or any signed-in staff member (module gate applied separately) */
const requireBackoffice = requireRole('admin', 'staff');

/**
 * v3.10 — the website dashboard for staff. Administrators pass. A staff
 * account passes only when the modules ticked for it (Staff & Access) cover
 * this exact route — see src/lib/permissions.ts. Read live on every request,
 * so a change in Staff & Access applies at once, even to an open session.
 */
const NO_MODULE = 'Your account does not have access to this part of the dashboard. Ask the owner to turn it on in Staff & Access.';
const requireDashboard: express.RequestHandler = (req: any, res, next) =>
  requireBackoffice(req, res, () => {
    const session = req.session as SessionPayload;
    if (session.role === 'admin') return next();
    const path = String(req.originalUrl || '').split('?')[0];
    if (staffMayCall(session, req.method, path)) return next();
    return res.status(403).json({ error: NO_MODULE, code: 'NO_PERMISSION' });
  });

/** The POS counter: administrators, and staff with the "POS Terminal" module */
const requirePos: express.RequestHandler = (req: any, res, next) =>
  requireStaff(req, res, () => {
    if (hasModule(req.session, 'pos')) return next();
    return res.status(403).json({ error: 'Your account does not have access to the POS. Ask the owner to turn it on in Staff & Access.', code: 'NO_PERMISSION' });
  });

const DEFAULT_NAVIGATION_MENU = [
  { id: 'home', title: 'Home', url: 'home', icon: 'Home', sortOrder: 1, isActive: true },
  { id: 'shop', title: 'All Products', url: 'shop', icon: 'ShoppingBag', sortOrder: 2, isActive: true },
  { id: 'medicines', title: 'Medicines', url: 'shop?category=otc-medicines', icon: 'Pill', sortOrder: 3, isActive: true },
  { id: 'offers', title: "Today's Offers", url: 'offers', icon: 'Zap', sortOrder: 4, isActive: true },
  { id: 'about', title: 'About Us', url: 'page/about', icon: 'Info', sortOrder: 5, isActive: true },
  { id: 'contact', title: 'Contact', url: 'page/contact', icon: 'Phone', sortOrder: 6, isActive: true },
  { id: 'faq', title: 'FAQ', url: 'page/faq', icon: 'HelpCircle', sortOrder: 7, isActive: true },
  { id: 'track', title: 'Track Order', url: 'track', icon: 'Compass', sortOrder: 8, isActive: true },
];

const DEFAULT_CMS_PAGES = [
  { id: 'about', title: 'About Us', slug: 'about', content: '', isPublished: false },
  { id: 'contact', title: 'Contact', slug: 'contact', content: '', isPublished: false },
  { id: 'faq', title: 'FAQ', slug: 'faq', content: '', isPublished: false },
  { id: 'delivery', title: 'Delivery Information', slug: 'delivery', content: '', isPublished: false },
  { id: 'terms', title: 'Terms & Conditions', slug: 'terms', content: '', isPublished: false },
  { id: 'return', title: 'Return & Refund Policy', slug: 'return', content: '', isPublished: false },
];

const DEFAULT_OFFERS_CONFIG = {
  heading: "Today's Offers",
  viewAllLink: 'shop?flashSale=true',
  badgeText: '',
  /** Empty = show whatever products are actually on offer. */
  selectedProductIds: [] as number[],
  discountPercentOverride: 0,
  isEnabled: true,
};

/** Neutral operating defaults. Store identity is entered by the owner. */
const DEFAULT_GENERAL_CONFIG = {
  storeName: '',
  tagline: '',
  email: '',
  phone: '',
  whatsapp: '',
  address: '',
  currency: '৳',
  currencyCode: 'BDT',
  orderPrefix: 'ORD',
  posPrefix: 'POS',
  requirePrescriptionWarning: false,
};

const DEFAULT_LOGO_CONFIG = {
  desktopLogoUrl: '',
  mobileLogoUrl: '',
  pharmacyName: '',
};

/**
 * The mobile bottom navigation bar (Dashboard → Website → Mobile Nav).
 * Up to five slots; each one's icon, label, link and visibility is editable,
 * and `highlight` lifts a slot into the raised centre button.
 */
const DEFAULT_MOBILE_NAV_CONFIG = {
  isEnabled: true,
  showLabels: true,
  items: [
    { id: 'm1', icon: 'Home', label: 'Home', url: 'home', isActive: true, highlight: false },
    { id: 'm2', icon: 'LayoutGrid', label: 'Categories', url: 'categories', isActive: true, highlight: false },
    { id: 'm3', icon: 'ShoppingCart', label: 'Cart', url: 'cart', isActive: true, highlight: true },
    { id: 'm4', icon: 'Compass', label: 'Track', url: 'track', isActive: true, highlight: false },
    { id: 'm5', icon: 'User', label: 'Account', url: 'account', isActive: true, highlight: false },
  ],
};

const DEFAULT_HOMEPAGE_SECTIONS = [
  { id: 'hero', name: 'Hero Slider', isEnabled: true, sortOrder: 1 },
  { id: 'features', name: 'Service Features & Guarantees', isEnabled: true, sortOrder: 2 },
  { id: 'offers', name: "Today's Offers", isEnabled: true, sortOrder: 3 },
  { id: 'categories', name: 'Category Grid', isEnabled: true, sortOrder: 4 },
  { id: 'products', name: 'Essential Medicines & Products', isEnabled: true, sortOrder: 5 },
  { id: 'trust', name: 'Pharmacy License & Trust Banner', isEnabled: true, sortOrder: 6 },
];

/**
 * Owner (root admin) login.
 *
 * v3.11:
 *  • First run: ADMIN_EMAIL / ADMIN_PASSWORD from .env; when they are not set
 *    the default is admin@nomail.com / password (the dashboard then shows a
 *    "change the default password" warning until it is changed).
 *  • .env always works as a recovery key: when ADMIN_EMAIL and ADMIN_PASSWORD
 *    are set and differ from the pair applied last time, signing in with them
 *    succeeds and they become the owner login (every other session of the
 *    owner is signed out). Once the owner changes the password from the
 *    dashboard, the same unchanged .env pair stops working — put a NEW
 *    password in .env (and restart) to recover again.
 *    Earlier versions silently ignored .env as soon as a login was saved in
 *    the database, which is why "the .env email and password do not work".
 */
const FALLBACK_ADMIN_EMAIL = 'admin@nomail.com';
const FALLBACK_ADMIN_PASSWORD = 'password';
const ENV_ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ENV_ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
/** Both set in .env (or the hosting panel) — only then can they override a saved login */
const ENV_ADMIN_SET = Boolean(ENV_ADMIN_EMAIL && ENV_ADMIN_PASSWORD);
const FIRST_RUN_EMAIL = ENV_ADMIN_EMAIL || FALLBACK_ADMIN_EMAIL;
const FIRST_RUN_PASSWORD = ENV_ADMIN_PASSWORD || FALLBACK_ADMIN_PASSWORD;

export const DEFAULT_ADMIN_AUTH: Record<string, any> = {
  email: FIRST_RUN_EMAIL,
  passwordHash: makePasswordRecord(FIRST_RUN_PASSWORD),
  mustChangePassword: FIRST_RUN_PASSWORD === FALLBACK_ADMIN_PASSWORD,
};

if (!ENV_ADMIN_PASSWORD) {
  console.warn(
    `[security] ADMIN_PASSWORD is not set — first sign-in is ${FIRST_RUN_EMAIL} / ${FALLBACK_ADMIN_PASSWORD}. Change it from Dashboard → Admin Account & Security.`
  );
}

/** Constant-time text comparison */
function sameText(a: string, b: string): boolean {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

/** The pair that .env holds right now, as one string for the "already applied?" check */
const envPairText = () => `${ENV_ADMIN_EMAIL}\n${ENV_ADMIN_PASSWORD}`;

/**
 * Signing in with the .env pair. Returns the (new) owner record when the
 * pair is accepted, or null when it is not an .env sign-in.
 */
async function applyEnvOwnerLogin(email: string, password: string, saved: Record<string, any> | null): Promise<Record<string, any> | null> {
  if (!ENV_ADMIN_SET) return null;
  if (!sameText(email, ENV_ADMIN_EMAIL) || !sameText(password, ENV_ADMIN_PASSWORD)) return null;
  // This exact .env pair was applied before and the owner has since chosen
  // another password from the dashboard: the old pair is not a key any more
  if (saved && saved.envApplied && verifyPassword(envPairText(), String(saved.envApplied)).ok) {
    return verifyPassword(password, String(saved.passwordHash || '')).ok && String(saved.email || '').toLowerCase() === email ? saved : null;
  }
  // A store upgraded from an older version whose saved login already IS this
  // pair: only remember that it was applied — nothing is reset, nobody is
  // signed out, and after a later password change the pair stops working
  if (
    saved &&
    !saved.envApplied &&
    String(saved.email || '').toLowerCase() === ENV_ADMIN_EMAIL &&
    verifyPassword(ENV_ADMIN_PASSWORD, String(saved.passwordHash || '')).ok
  ) {
    const marked = { ...saved, envApplied: makePasswordRecord(envPairText()) };
    const markedValue = JSON.stringify(marked);
    await db.insert(siteSettings).values({ key: 'admin_auth', value: markedValue }).onDuplicateKeyUpdate({ set: { value: markedValue } });
    return marked;
  }
  const stamp = Date.now();
  const next = {
    ...(saved || {}),
    email: ENV_ADMIN_EMAIL,
    passwordHash: makePasswordRecord(ENV_ADMIN_PASSWORD),
    envApplied: makePasswordRecord(envPairText()),
    mustChangePassword: ENV_ADMIN_PASSWORD === FALLBACK_ADMIN_PASSWORD,
    // A recovery is a reset: every older session of the owner ends (also
    // ones opened with the built-in first-run login); this sign-in stays
    passwordChangedAt: stamp - 1,
    updatedAt: new Date(stamp).toISOString(),
  };
  const value = JSON.stringify(next);
  await db.insert(siteSettings).values({ key: 'admin_auth', value }).onDuplicateKeyUpdate({ set: { value } });
  passwordChangedCache.set('admin_root', { at: Date.now(), value: stamp - 1 });
  if (saved) {
    console.log('[auth] owner login reset from ADMIN_EMAIL / ADMIN_PASSWORD in .env');
    // The owner sees it on the dashboard bell, in case it was not them
    void notifyAdmin(
      'security',
      'Owner login was reset from .env',
      'Someone signed in with ADMIN_EMAIL / ADMIN_PASSWORD from .env, so the saved owner login was replaced and other owner sessions were signed out. If this was not you, change the password now (Account & Security) and change ADMIN_PASSWORD in .env.',
      'account'
    );
  }
  return next;
}

/** Friendly message for a sign-in that failed because of the database */
function signInErrorMessage(error: any): { status: number; message: string } {
  // Drizzle wraps the driver's error ("Failed query: …") — read the cause too
  const cause = error?.cause || {};
  const text = `${error?.code || ''} ${error?.sqlMessage || error?.message || ''} ${cause?.code || ''} ${cause?.sqlMessage || cause?.message || ''}`;
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ER_ACCESS_DENIED|ER_BAD_DB_ERROR|ER_DBACCESS_DENIED|Too many connections|PROTOCOL_CONNECTION_LOST|No database selected|connect/i.test(text)) {
    return { status: 503, message: 'The database is not connected, so sign-in is not possible. Open /api/health to see why (check DB_HOST, DB_NAME, DB_USER and DB_PASSWORD in .env).' };
  }
  if (/ER_NO_SUCH_TABLE|doesn't exist|ER_BAD_FIELD_ERROR|Unknown column/i.test(text)) {
    return { status: 503, message: 'The database tables are not ready yet. Restart the app once (it creates them by itself), or import database/database.sql.' };
  }
  return { status: 500, message: 'Could not sign in right now. Please try again.' };
}

const DEFAULT_PRODUCT_CARD_CONFIG = {
  /** One of the card designs offered in Dashboard → Product Card */
  cardStyle: 'classic' as 'classic' | 'modern' | 'minimal' | 'compact',
  /** Button captions — editable from Dashboard → Product Card */
  addToCartLabel: 'Add to Cart',
  buyNowLabel: 'Buy Now',
  /** The same two buttons on the single product page */
  productPageAddToCartLabel: 'Add to Cart',
  productPageBuyNowLabel: 'Buy Now',
  showAddToCart: true,
  showBuyNow: true,
  showWishlist: true,
  showPrice: true,
  showOldPrice: true,
  showDiscount: true,
  showCategory: false,
  showBrand: false,
  showGenericName: false,
  showDescription: false,
  showStockText: false,
};


/** v3.6 — single product page switches (Dashboard → Product Page) */
const DEFAULT_PRODUCT_PAGE_CONFIG = {
  showSpecifications: true,
  showReviews: true,
  allowReviews: true,
  reviewsRequireApproval: false,
  stickyBuyBar: true,
  showVideo: true,
  showRelated: true,
  showSizeGuide: true,
};

/** v3.6 — blog section above the footer and the /blog pages */
const DEFAULT_BLOG_CONFIG = {
  isEnabled: true,
  showOnHome: true,
  homeTitle: 'From Our Blog',
  homeSubtitle: 'Tips, guides and news from our team',
  homeCount: 5,
  pageTitle: 'Blog',
  pageSubtitle: 'Tips, guides and news from our team',
};

/** v3.6 — customer review screenshots section (above the blog) */
const DEFAULT_REVIEW_IMAGES_CONFIG = {
  isEnabled: true,
  title: 'What Our Customers Say',
  subtitle: 'Real messages and photos shared by our customers',
  images: [] as Array<{ id: string; url: string; caption?: string }>,
};

/** v3.6 — store-wide free delivery rules (System Configuration → Shipping) */
const DEFAULT_FREE_SHIPPING_CONFIG: FreeShippingRules = {
  enabled: false,
  minSubtotal: null,
  minQuantity: null,
  zones: [],
  excludeWholesale: true,
  showProgress: true,
};

/**
 * Attention animation on the Buy Now and Place Order buttons
 * (Dashboard → Product Card → Button animation). See src/lib/ctaAnimation.ts.
 */
const DEFAULT_CTA_ANIMATION_CONFIG = {
  buyNow: 'shake',
  placeOrder: 'shake',
  addToCart: 'none',
  interval: 3.2,
  intensity: 'normal',
};

/** Browser tab title, meta tags and favicon — Dashboard → Website → Branding */
const DEFAULT_SEO_CONFIG = {
  /** Blank on a fresh install — the store name is used until the owner sets these. */
  siteTitle: '',
  titleSuffix: '',
  metaDescription: '',
  metaKeywords: '',
  faviconUrl: '',
  ogImageUrl: '',
};

/** Invoice header/footer text and print options — Dashboard → Orders → Invoice */
const DEFAULT_INVOICE_CONFIG = {
  businessName: '',
  tagline: '',
  logoUrl: '',
  address: '',
  phone: '',
  email: '',
  drugLicense: '',
  vatRegistration: '',
  invoicePrefix: 'INV-',
  footerNote: '',
  termsNote: '',
  showLogo: true,
  showSignature: true,
  signatureLabel: 'Authorized Signature',
  defaultSize: 'a4' as 'a4' | 'mm80' | 'mm58',
};

/** The four trust cards that sit just above the footer */
const DEFAULT_SERVICE_FEATURES = {
  isEnabled: false,
  items: [] as Array<{
    id: string;
    icon: string;
    title: string;
    description: string;
    isActive: boolean;
  }>,
};

/** Today's Flash Sale strip — on/off plus copy */
const DEFAULT_FLASH_SALE_CONFIG = {
  isEnabled: false,
  heading: '',
  subheading: '',
  badgeText: '',
  countdownHours: 12,
  maxProducts: 8,
};

const DEFAULT_FOOTER_CONFIG = {
  /**
   * Footer colour scheme (Dashboard → Website → Footer). 'brand-dark' is a
   * deep navy tinted with the brand colour, so it always matches the theme.
   * 'custom' uses backgroundColor / textColor below.
   */
  colorPreset: 'brand-dark',
  backgroundColor: '',
  textColor: '',
  autoUseHeaderLogo: true,
  description: '',
  address: '',
  phone: '',
  email: '',
  drugLicense: '',
  copyrightText: '',
  companyCredit: '',
  websiteCredit: '',
  developerName: '',
  creditUrl: '',
  enableCredit: false,
  quickLinksTitle: 'Quick Links',
  quickLinks: [
    { id: '1', label: 'Home', url: '/', isActive: true, sortOrder: 1 },
    { id: '2', label: 'All Medicines & Products', url: '/products', isActive: true, sortOrder: 2 },
    { id: '3', label: 'Medicines', url: '/medicine', isActive: true, sortOrder: 3 },
    { id: '4', label: "Today's Offers", url: '/offers', isActive: true, sortOrder: 4 },
    { id: '5', label: 'Track Order', url: '/order-tracking', isActive: true, sortOrder: 5 },
    { id: '6', label: 'Wishlist', url: '/wishlist', isActive: true, sortOrder: 6 },
  ],
  policyLinksTitle: 'Policies & Support',
  policyLinks: [
    { id: 'p1', label: 'About Us', url: '/about', isActive: true, sortOrder: 1 },
    { id: 'p2', label: 'Contact & Location', url: '/contact', isActive: true, sortOrder: 2 },
    { id: 'p3', label: 'Terms & Conditions', url: '/terms', isActive: true, sortOrder: 3 },
    { id: 'p4', label: 'Privacy Policy', url: '/privacy', isActive: true, sortOrder: 4 },
    { id: 'p5', label: 'Return & Refund Policy', url: '/refund', isActive: true, sortOrder: 5 },
    { id: 'p6', label: 'FAQ', url: '/faq', isActive: true, sortOrder: 6 },
  ],
  showLicenseSection: true,
  showPaymentMethods: true,
};


// ==========================================
// BASE64 IMAGE EXTRACTION FOR SETTINGS
// ==========================================
/**
 * Several admin panels read a picked file with FileReader and send it as a
 * `data:image/...;base64,...` string (logo, banners, category image, gateway
 * logo). Stored verbatim that blows past MySQL's TEXT limit, so the whole
 * settings save failed with "Data too long for column 'value'" and the upload
 * silently never applied — and nothing showed in another browser.
 *
 * Every data URL is now written to the uploads folder and replaced by its path, so
 * settings stay small and the file is served to every visitor from disk.
 */
const PASTED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};
async function persistDataUrl(dataUrl: string): Promise<string> {
  const matches = dataUrl.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/);
  if (!matches) return dataUrl;

  const ext = PASTED_IMAGE_TYPES[matches[1].toLowerCase()];
  if (!ext) return '';
  const buffer = Buffer.from(matches[2], 'base64');
  const fileName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  return saveUploadedFile(fileName, buffer);
}

async function externalizeDataUrls(value: any): Promise<any> {
  if (typeof value === 'string') {
    return value.startsWith('data:image/') ? await persistDataUrl(value) : value;
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => externalizeDataUrls(item)));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = await externalizeDataUrls(item);
    }
    return out;
  }
  return value;
}

// Settings keys that hold secrets. The PUBLIC endpoint strips them; an
// authenticated admin reads them back through /api/admin/settings.
/** Settings with a dedicated save endpoint; never read or written in bulk */
/**
 * Bookkeeping rows the server writes itself. A settings screen must never
 * write them back: the dashboard holds the copy it loaded when it opened, and
 * saving that stale copy is exactly how uploaded images used to disappear
 * from the media library (and a Clear Cache got undone).
 */
const INTERNAL_SETTING_KEYS = ['media_library', 'media_library_removed', 'cache_version', 'demo_data', 'custom_code', 'staff_access_version'];
const OWN_ENDPOINT_SETTING_KEYS = ['order_number_config', 'sms_config', 'fraud_config', 'catalog_config', 'wholesale_config', 'email_config', 'contact_page', 'payment_gateways', 'social_login_config', ...INTERNAL_SETTING_KEYS];
const SECRET_SETTING_KEYS = ['courier_config', 'admin_auth', 'pathao_token', 'sms_config', 'fraud_config', 'catalog_config', 'email_config', 'payment_gateways', 'social_login_config'];

function stripSecrets(settingsMap: Record<string, any>) {
  const safe: Record<string, any> = {};
  for (const [key, value] of Object.entries(settingsMap)) {
    if (SECRET_SETTING_KEYS.includes(key) || INTERNAL_SETTING_KEYS.includes(key)) continue;

    if (key === 'marketing' && value && typeof value === 'object') {
      // The pixel ID has to reach the browser; the Conversions API token must not.
      const { metaConversionsToken, ...publicMarketing } = value as Record<string, any>;
      // The storefront needs to know whether to mirror events server-side, but
      // must never receive the token itself.
      (publicMarketing as any).capiEnabled = Boolean(metaConversionsToken);
      safe[key] = publicMarketing;
      continue;
    }

    safe[key] = value;
  }
  return safe;
}

/** Fills the v3.6 settings a store has never saved, so every editor opens with real values */
function applyV36Defaults(settingsMap: Record<string, any>) {
  settingsMap.product_page_config = { ...DEFAULT_PRODUCT_PAGE_CONFIG, ...(settingsMap.product_page_config || {}) };
  settingsMap.blog_config = { ...DEFAULT_BLOG_CONFIG, ...(settingsMap.blog_config || {}) };
  settingsMap.review_images_config = { ...DEFAULT_REVIEW_IMAGES_CONFIG, ...(settingsMap.review_images_config || {}) };
  settingsMap.free_shipping_config = { ...DEFAULT_FREE_SHIPPING_CONFIG, ...(settingsMap.free_shipping_config || {}) };
}

/** The settings every visitor may read (secrets and bookkeeping rows removed) */
async function buildPublicSettings(): Promise<Record<string, any>> {
    const rows = await db.select().from(siteSettings);
    const settingsMap: Record<string, any> = {};
    for (const r of rows) {
      try {
        settingsMap[r.key] = JSON.parse(r.value);
      } catch {
        settingsMap[r.key] = r.value;
      }
    }

    // Apply defaults if missing
    if (!settingsMap.navigation_menu) settingsMap.navigation_menu = DEFAULT_NAVIGATION_MENU;
    if (!settingsMap.pages) settingsMap.pages = DEFAULT_CMS_PAGES;
    if (!settingsMap.offers_config) settingsMap.offers_config = DEFAULT_OFFERS_CONFIG;
    if (!settingsMap.logo_config) settingsMap.logo_config = DEFAULT_LOGO_CONFIG;
    if (!settingsMap.product_card_config) settingsMap.product_card_config = DEFAULT_PRODUCT_CARD_CONFIG;
    if (!settingsMap.footer_config) settingsMap.footer_config = DEFAULT_FOOTER_CONFIG;
    if (!settingsMap.seo_config) settingsMap.seo_config = DEFAULT_SEO_CONFIG;
    if (!settingsMap.invoice_config) settingsMap.invoice_config = DEFAULT_INVOICE_CONFIG;
    if (!settingsMap.service_features) settingsMap.service_features = DEFAULT_SERVICE_FEATURES;
    if (!settingsMap.flash_sale_config) settingsMap.flash_sale_config = DEFAULT_FLASH_SALE_CONFIG;
    settingsMap.product_card_config = { ...DEFAULT_PRODUCT_CARD_CONFIG, ...settingsMap.product_card_config };
    settingsMap.cta_animation_config = { ...DEFAULT_CTA_ANIMATION_CONFIG, ...(settingsMap.cta_animation_config || {}) };
    settingsMap.footer_config = { ...DEFAULT_FOOTER_CONFIG, ...(settingsMap.footer_config || {}) };
    if (!settingsMap.homepage_sections) settingsMap.homepage_sections = DEFAULT_HOMEPAGE_SECTIONS;
    if (!settingsMap.mobile_nav_config) settingsMap.mobile_nav_config = DEFAULT_MOBILE_NAV_CONFIG;
    // No invented store identity: only the neutral operating defaults, so a
    // fresh install never shows another shop's name, address or phone.
    if (!settingsMap.general) settingsMap.general = DEFAULT_GENERAL_CONFIG;
    applyV36Defaults(settingsMap);
    // Online gateways the checkout may offer — names only, never credentials
    settingsMap.online_payments = await publicGateways().catch(() => []);
    // v3.12 — which "Continue with …" buttons to show (never the keys)
    settingsMap.social_login = publicSocialLogin(settingsMap.social_login_config);

    return stripSecrets(settingsMap);
}

// Get site settings with intelligent fallbacks
app.get('/api/settings', async (_req, res) => {
  try {
    res.json(await buildPublicSettings());
  } catch (error: any) {
    console.error('Failed to get settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update site settings (Admin)
/** Keys no settings screen may write: the owner's sign-in, server bookkeeping, keys with their own endpoint */
/**
 * The table compares keys without regard to letter case or trailing spaces, so
 * "Admin_Auth" would land on the admin_auth row. Only plain lower-case names
 * are accepted; anything else is refused before it reaches the checks below.
 */
const isSettingKeyName = (key: string) => /^[a-z0-9_]{1,100}$/.test(key);
const isProtectedSettingKey = (key: string) =>
  key === 'pathao_token' || key === 'admin_auth' || key === 'online_payments' || key === 'social_login' || OWN_ENDPOINT_SETTING_KEYS.includes(key);
/** v3.10 — staff save only the settings their modules own (website design, chat widget, system configuration) */
const maySaveSetting = (session: SessionPayload | undefined, key: string) =>
  Boolean(session && (session.role === 'admin' || hasModule(session, ...settingKeyModules(key))));

app.post('/api/settings', requireBackoffice, async (req: any, res) => {
  try {
    const incoming = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const badKey = Object.keys(incoming).find((key) => !isSettingKeyName(key));
    if (badKey !== undefined) return res.status(400).json({ error: `"${String(badKey).slice(0, 60)}" is not a valid setting name.` });
    const refused = Object.keys(incoming).filter((key) => !isProtectedSettingKey(key) && !maySaveSetting(req.session, key));
    if (refused.length > 0) return res.status(403).json({ error: NO_MODULE, code: 'NO_PERMISSION' });
    const payload = await externalizeDataUrls(incoming);
    // Every key is saved on its own. One oversized key used to abort the whole
    // save part-way, silently dropping every setting after it (the dashboard
    // still said "saved"). The column is MEDIUMTEXT (16 MB); 2 MB per key is
    // a generous, safe ceiling.
    const MAX_SETTING_BYTES = 2 * 1024 * 1024;
    const tooLarge: string[] = [];
    for (const [key, val] of Object.entries(payload)) {
      // online_payments is computed for the storefront, never stored
      if (isProtectedSettingKey(key)) continue;
      const value = typeof val === 'string' ? val : JSON.stringify(val);
      if (Buffer.byteLength(value, 'utf8') > MAX_SETTING_BYTES) {
        tooLarge.push(key);
        continue;
      }
      await db
        .insert(siteSettings)
        .values({ key, value })
        .onDuplicateKeyUpdate({ set: {value } });
    }
    invalidateMaintenanceCache();
    if ('chat_config' in payload) forgetLiveChatSettings();
    if ('marketing' in payload) forgetMarketingSettings();
    if (tooLarge.length > 0) {
      return res.status(413).json({
        error: `Saved everything except: ${tooLarge.join(', ')} (too large). Add images from the media library instead of embedding them.`,
        partial: true,
      });
    }
    res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Failed to update all settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.post('/api/settings/:key', requireBackoffice, async (req: any, res) => {
  try {
    const { key } = req.params;
    if (!isSettingKeyName(key)) return res.status(400).json({ error: 'This is not a valid setting name.' });
    if (isProtectedSettingKey(key)) return res.status(400).json({ error: 'This setting is saved from its own page.' });
    if (!maySaveSetting(req.session, key)) return res.status(403).json({ error: NO_MODULE, code: 'NO_PERMISSION' });
    const payload = await externalizeDataUrls(req.body);
    const value = JSON.stringify(payload);

    if (Buffer.byteLength(value, 'utf8') > 2 * 1024 * 1024) {
      return res.status(413).json({
        error: `The '${key}' setting is too large (${Math.round(value.length / 1024)}KB).`,
      });
    }

    await db
      .insert(siteSettings)
      .values({ key, value })
      .onDuplicateKeyUpdate({ set: {value } });
    invalidateMaintenanceCache();
    if (key === 'chat_config') forgetLiveChatSettings();
    if (key === 'marketing') forgetMarketingSettings();
    res.json({ success: true, key, data: payload });
  } catch (error: any) {
    console.error('Failed to update settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Authentication: Admin Login
type AuthOutcome =
  | { kind: 'ok'; user: Record<string, any>; token: string }
  | { kind: 'inactive' }
  | { kind: 'none' };

/**
 * Owner (root admin) and staff accounts. Staff live in the `users` table and
 * sign in with an email address; the owner's credentials are the `admin_auth`
 * setting. Returns 'none' when the details match neither.
 */
async function authenticateStaffOrOwner(emailRaw: string, password: string): Promise<AuthOutcome> {
  const email = String(emailRaw || '').toLowerCase().trim();
  if (!email || !password) return { kind: 'none' };

  const row = await db.select().from(siteSettings).where(eq(siteSettings.key, 'admin_auth'));
  let saved: Record<string, any> | null = null;
  if (row.length > 0) {
    try {
      const parsed = JSON.parse(row[0].value);
      if (parsed && typeof parsed === 'object' && parsed.passwordHash) saved = parsed;
    } catch {
      // unreadable row: treated as "no login saved yet"
    }
  }
  let adminAuth: Record<string, any> = saved || DEFAULT_ADMIN_AUTH;

  // .env pair (first run, or a recovery after it was changed)
  const fromEnv = await applyEnvOwnerLogin(email, password, saved);
  if (fromEnv) adminAuth = fromEnv;

  if (email === String(adminAuth.email || '').toLowerCase().trim()) {
    const check = fromEnv ? { ok: true, needsUpgrade: false } : verifyPassword(password, adminAuth.passwordHash);
    if (check.ok) {
      // Transparently migrate an old unsalted hash to PBKDF2
      if (check.needsUpgrade) {
        const upgraded = { ...adminAuth, passwordHash: makePasswordRecord(password) };
        await db
          .insert(siteSettings)
          .values({ key: 'admin_auth', value: JSON.stringify(upgraded) })
          .onDuplicateKeyUpdate({ set: { value: JSON.stringify(upgraded) } });
      }
      const user = { id: 1, uid: 'admin_root', name: 'Admin', email: adminAuth.email, role: 'admin' as const };
      const token = signSession({
        sub: user.uid,
        email: user.email,
        name: user.name,
        role: 'admin',
        exp: Date.now() + SESSION_TTL_MS,
      });
      return { kind: 'ok', user, token };
    }
  }

  let staffRows: any[] = [];
  try {
    staffRows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  } catch (error: any) {
    // A staff table that is still being upgraded must not block the owner or
    // a customer with the same email: log it and carry on as "no staff"
    console.error('[auth] staff lookup failed:', error?.message || error);
    const why = `${error?.message || ''} ${error?.cause?.code || ''} ${error?.cause?.message || ''}`;
    if (/connect|ECONN|ENOTFOUND|ETIMEDOUT|Access denied|ER_ACCESS_DENIED|ER_BAD_DB/i.test(why)) throw error;
    return { kind: 'none' };
  }
  const staff = staffRows[0];
  if (!staff || !staff.passwordHash) return { kind: 'none' };

  const check = verifyPassword(password, staff.passwordHash);
  if (!check.ok) return { kind: 'none' };
  if (staff.status !== 'active') return { kind: 'inactive' };

  if (check.needsUpgrade) {
    await db.update(users).set({ passwordHash: makePasswordRecord(password) }).where(eq(users.id, staff.id));
  }

  let perms: string[] = [];
  try {
    perms = staff.permissions ? JSON.parse(staff.permissions) : [];
  } catch {
    perms = [];
  }
  const staffRole = staff.role === 'admin' ? ('admin' as const) : ('staff' as const);
  const user = {
    id: staff.id,
    uid: `staff_${staff.id}`,
    name: staff.name,
    email: staff.email,
    role: staffRole,
    jobRole: staff.jobRole || '',
    permissions: perms,
  };
  const token = signSession({
    sub: `staff_${staff.id}`,
    email: staff.email,
    name: staff.name,
    role: staffRole,
    permissions: perms,
    jobRole: staff.jobRole || undefined,
    exp: Date.now() + SESSION_TTL_MS,
  });
  return { kind: 'ok', user, token };
}

/** Customer accounts: phone number or email plus password. */
async function authenticateCustomer(identifierRaw: string, password: string): Promise<AuthOutcome> {
  const identifier = String(identifierRaw || '').trim();
  if (!identifier || !password) return { kind: 'none' };

  const cleanId = identifier.replace(/[\s-]+/g, '');
  const rows = await db
    .select()
    .from(customers)
    // Emails saved by older builds kept their original case, so match both
    .where(
      or(
        eq(customers.phone, cleanId),
        eq(customers.email, identifier),
        eq(customers.email, identifier.toLowerCase())
      )
    )
    // v3.12 — an account with a password first (a Google / Facebook account may share the e-mail)
    .orderBy(sql`(${customers.passwordHash} IS NULL)`, asc(customers.id))
    .limit(1);

  const customer = rows[0];
  if (!customer?.passwordHash) return { kind: 'none' };
  const check = verifyPassword(String(password), customer.passwordHash);
  if (!check.ok) return { kind: 'none' };
  if (customer.status === 'blocked') return { kind: 'inactive' };

  if (check.needsUpgrade) {
    await db
      .update(customers)
      .set({ passwordHash: makePasswordRecord(String(password)) })
      .where(eq(customers.id, customer.id));
  }

  const token = signSession({
    sub: `customer_${customer.id}`,
    email: customer.email || '',
    name: customer.name,
    role: 'customer',
    exp: Date.now() + SESSION_TTL_MS,
  });
  return {
    kind: 'ok',
    token,
    user: {
      id: customer.id,
      uid: `customer_${customer.id}`,
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone,
      role: 'customer',
      customerType: customer.customerType || 'regular',
      wholesaleStatus: customer.customerType === 'wholesale' ? customer.wholesaleStatus || 'pending' : null,
    },
  };
}

const WRONG_CREDENTIALS = 'Incorrect email/phone or password.';
const ACCOUNT_DISABLED = 'This account has been disabled. Please contact the store.';

/**
 * One sign-in for everyone. The same login form serves shoppers, staff and the
 * owner: the owner's email and password open the dashboard, a staff account
 * opens its permitted screens, and anything else is checked against customer
 * accounts. A miss counts once toward the rate limit — trying two endpoints in
 * a row used to count every wrong password twice.
 */
app.post('/api/auth/signin', loginThrottle, async (req, res) => {
  try {
    const identifier = String(req.body?.identifier ?? req.body?.email ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Enter your email or phone number and password.' });
    }

    let outcome: AuthOutcome = { kind: 'none' };
    if (identifier.includes('@')) outcome = await authenticateStaffOrOwner(identifier, password);
    if (outcome.kind === 'none') outcome = await authenticateCustomer(identifier, password);

    if (outcome.kind === 'inactive') return res.status(403).json({ error: ACCOUNT_DISABLED });
    if (outcome.kind === 'none') {
      noteLoginFailure(req);
      return res.status(401).json({ error: WRONG_CREDENTIALS });
    }

    clearLoginFailures(req);
    res.json({ success: true, user: outcome.user, token: outcome.token });
  } catch (error: any) {
    console.error('Sign-in failed:', error);
    const failure = signInErrorMessage(error);
    res.status(failure.status).json({ error: failure.message });
  }
});

/** Owner / staff sign-in (kept for existing integrations; the UI uses /signin). */
app.post('/api/auth/login', loginThrottle, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const outcome = await authenticateStaffOrOwner(email, password);
    if (outcome.kind === 'inactive') return res.status(403).json({ error: ACCOUNT_DISABLED });
    if (outcome.kind === 'none') {
      // Same message either way so the endpoint cannot be used to find accounts
      noteLoginFailure(req);
      return res.status(401).json({ error: WRONG_CREDENTIALS });
    }
    clearLoginFailures(req);
    res.json({ success: true, user: outcome.user, token: outcome.token });
  } catch (error: any) {
    console.error('Login error:', error);
    const failure = signInErrorMessage(error);
    res.status(failure.status).json({ error: failure.message });
  }
});

// ==========================================
// CUSTOMER ACCOUNTS (self sign-up)
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, email, password, address } = req.body || {};

    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Please enter your name.' });

    const cleanPhone = String(phone || '').replace(/[\s-]+/g, '');
    if (!/^01[3-9]\d{8}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Enter a valid 11-digit mobile number (013-019).' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const existing = await db
      .select()
      .from(customers)
      .where(eq(customers.phone, cleanPhone))
      .limit(1);

    // A guest/POS customer row may already exist for this number — claim it
    // instead of creating a duplicate, but never overwrite a real account.
    // v3.12 — an account made with Google / Facebook has no password either,
    // but it is a real account: it can never be "claimed" with a new password
    if (existing.length > 0 && (existing[0].passwordHash || (await hasSocialLogin(existing[0].id)))) {
      return res.status(409).json({ error: 'An account with this number already exists. Please sign in.' });
    }

    const passwordHash = makePasswordRecord(String(password));
    let customer;

    if (existing.length > 0) {
      const updated = await updateReturning(
        db,
        customers,
        {
          name: String(name).trim(),
          email: email || existing[0].email,
          address: address || existing[0].address,
          passwordHash,
        },
        eq(customers.id, existing[0].id)
      );
      customer = updated[0];
    } else {
      const inserted = await insertReturning(db, customers, {
        name: String(name).trim(),
        phone: cleanPhone,
        email: email || null,
        address: address || null,
        passwordHash,
      });
      customer = inserted[0];
    }

    const token = signSession({
      sub: `customer_${customer.id}`,
      email: customer.email || '',
      name: customer.name,
      role: 'customer',
      exp: Date.now() + SESSION_TTL_MS,
    });

    res.json({
      success: true,
      token,
      user: {
        id: customer.id,
        uid: `customer_${customer.id}`,
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone,
        role: 'customer',
      },
    });
  } catch (error: any) {
    console.error('Customer registration failed:', error);
    res.status(500).json({ error: 'Could not complete registration.' });
  }
});

// Customer login by phone or email
/** Customer sign-in by phone or email (kept for existing integrations). */
app.post('/api/auth/customer-login', loginThrottle, async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Enter your email or phone number and password.' });
    }
    const outcome = await authenticateCustomer(identifier, password);
    if (outcome.kind === 'inactive') return res.status(403).json({ error: ACCOUNT_DISABLED });
    if (outcome.kind === 'none') {
      noteLoginFailure(req);
      return res.status(401).json({ error: WRONG_CREDENTIALS });
    }
    clearLoginFailures(req);
    res.json({ success: true, token: outcome.token, user: outcome.user });
  } catch (error: any) {
    console.error('Customer login failed:', error);
    res.status(500).json({ error: 'Could not sign in right now. Please try again.' });
  }
});

// ===========================================================================
// v3.12 — "Continue with Google / Facebook" (customers only)
// Dashboard → System Configuration → Social Login: master switch, one switch
// per provider and the keys from Google Cloud / Meta for Developers.
// See src/server/social-login.ts for the flow and its safety checks.
// ===========================================================================
const SOCIAL_LOGIN_KEY = 'social_login_config';

/** Is this customer account linked to Google or Facebook? (false on a database without the columns) */
export async function hasSocialLogin(customerId: number): Promise<boolean> {
  try {
    const result: any = await db.execute(sql`SELECT google_id, facebook_id FROM customers WHERE id = ${customerId} LIMIT 1`);
    const row = (Array.isArray(result?.[0]) ? result[0] : [])[0];
    return Boolean(row && (row.google_id || row.facebook_id));
  } catch {
    return false;
  }
}
const OAUTH_COOKIE = 'shop_oauth';

async function readSocialLogin(): Promise<SocialLoginConfig> {
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, SOCIAL_LOGIN_KEY)).limit(1);
    const value = rows[0] ? JSON.parse(rows[0].value) : {};
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/** The address Google / Facebook send the visitor back to (must match their console exactly) */
function oauthCallbackUrl(req: express.Request, provider: SocialProvider): string {
  const configured = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwarded || (req.secure ? 'https' : req.protocol);
  const base = configured || `${proto}://${req.get('host')}`;
  return `${base}/api/auth/oauth/${provider}/callback`;
}

const oauthFail = (res: express.Response, message: string) =>
  res.redirect(302, `/login#oauth_error=${encodeURIComponent(message.slice(0, 200))}`);

app.get('/api/auth/oauth/:provider/start', loginThrottle, async (req, res) => {
  const provider = String(req.params.provider) as SocialProvider;
  if (!SOCIAL_PROVIDERS.includes(provider)) return res.status(404).send('Not found');
  const config = await readSocialLogin();
  if (!publicSocialLogin(config)[provider]) return oauthFail(res, 'This sign-in option is turned off.');
  // The page that pressed the button made a random value and kept it; the
  // session is only accepted back by that same browser tab (login CSRF guard)
  const clientNonce = String(req.query.cn || '');
  if (!isClientNonce(clientNonce)) return oauthFail(res, 'Please reload the page and try again.');
  const nonce = crypto.randomBytes(16).toString('hex');
  const returnTo = safeReturnPath(req.query.return);
  const state = makeState(SESSION_SECRET, { provider, returnTo, nonce, clientNonce });
  const secure = String(req.headers['x-forwarded-proto'] || req.protocol).startsWith('https');
  // Lax: the cookie comes back on the provider's top-level redirect to us
  res.setHeader(
    'Set-Cookie',
    `${OAUTH_COOKIE}=${nonce}; Path=/api/auth/oauth; Max-Age=600; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, authorizeUrl(provider, config, oauthCallbackUrl(req, provider), state));
});

app.get('/api/auth/oauth/:provider/callback', loginThrottle, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const provider = String(req.params.provider) as SocialProvider;
  if (!SOCIAL_PROVIDERS.includes(provider)) return res.status(404).send('Not found');
  const label = provider === 'google' ? 'Google' : 'Facebook';
  // The visitor closed the provider's window or said no
  if (req.query.error) return oauthFail(res, `${label} sign-in was cancelled.`);

  const state = readState(SESSION_SECRET, String(req.query.state || ''));
  const cookieNonce = readCookie(req, OAUTH_COOKIE);
  res.setHeader('Set-Cookie', `${OAUTH_COOKIE}=; Path=/api/auth/oauth; Max-Age=0; HttpOnly; SameSite=Lax`);
  if (!state || state.provider !== provider || !cookieNonce || cookieNonce !== state.nonce) {
    noteLoginFailure(req);
    return oauthFail(res, 'The sign-in link expired. Please try again.');
  }
  const code = String(req.query.code || '');
  if (!code || code.length > 2048) return oauthFail(res, `${label} did not finish the sign-in. Please try again.`);

  const config = await readSocialLogin();
  if (!publicSocialLogin(config)[provider]) return oauthFail(res, 'This sign-in option is turned off.');

  let profile: SocialProfile;
  try {
    profile = await fetchProfile(provider, config, oauthCallbackUrl(req, provider), code);
  } catch (error: any) {
    console.error(`[social-login] ${provider}:`, error?.message || error);
    return oauthFail(res, `Could not sign in with ${label}. Please try again.`);
  }

  try {
    const column = provider === 'google' ? 'google_id' : 'facebook_id';
    const rowsOf = (result: any): any[] => (Array.isArray(result?.[0]) ? result[0] : []);
    // 1) This provider account was used here before
    let row = rowsOf(
      await db.execute(sql`SELECT id FROM customers WHERE ${sql.raw(column)} = ${profile.id} LIMIT 1`)
    )[0];
    // 2) A customer account with the same e-mail. E-mails typed at sign-up are
    //    never confirmed here, so an account that has a password is NOT linked
    //    (someone could have registered another person's address in advance):
    //    its owner signs in with the password instead. An account without a
    //    password (made with the other button, or by the shop) is linked —
    //    Google / Facebook have confirmed this person owns the address.
    if (!row && profile.email && profile.emailVerified) {
      const sameEmail = rowsOf(
        await db.execute(
          sql`SELECT id, password_hash FROM customers WHERE LOWER(email) = ${profile.email} ORDER BY (password_hash IS NULL) DESC, id ASC LIMIT 5`
        )
      );
      const open = sameEmail.find((item) => !item.password_hash);
      if (open) {
        row = open;
        await db.execute(sql`UPDATE customers SET ${sql.raw(column)} = ${profile.id} WHERE id = ${row.id}`);
      } else if (sameEmail.length > 0) {
        return oauthFail(
          res,
          `An account with ${profile.email} already exists. Please sign in with your phone number or e-mail and password.`
        );
      }
    }
    // 3) New customer
    if (!row) {
      const name = profile.name || (profile.email ? profile.email.split('@')[0] : `${label} customer`);
      const inserted = await insertReturning(db, customers, {
        name: name.slice(0, 191),
        phone: '',
        email: profile.email || null,
        passwordHash: null,
      });
      row = { id: inserted[0].id };
      await db.execute(sql`UPDATE customers SET ${sql.raw(column)} = ${profile.id} WHERE id = ${row.id}`);
    }

    const found = await db.select().from(customers).where(eq(customers.id, Number(row.id))).limit(1);
    const customer = found[0];
    if (!customer) return oauthFail(res, `Could not sign in with ${label}. Please try again.`);
    if (customer.status === 'blocked') return oauthFail(res, ACCOUNT_DISABLED);

    const token = signSession({
      sub: `customer_${customer.id}`,
      email: customer.email || '',
      name: customer.name,
      role: 'customer',
      exp: Date.now() + SESSION_TTL_MS,
    });
    clearLoginFailures(req);
    // The token travels in the #fragment: browsers never send it to any server
    // and the website removes it from the address bar at once
    res.redirect(302, `${state.returnTo}#oauth_token=${encodeURIComponent(token)}&oauth_cn=${encodeURIComponent(state.clientNonce)}`);
  } catch (error: any) {
    console.error('[social-login] account:', error?.message || error);
    oauthFail(res, `Could not sign in with ${label}. Please try again.`);
  }
});

/** Dashboard: the settings (secrets are never sent back, only whether one is saved) */
// Registered before the general /api/admin guard, so it carries the guard itself
app.get('/api/admin/social-login', requireDashboard, async (req, res) => {
  const config = await readSocialLogin();
  privateResponse(res);
  res.json({
    enabled: Boolean(config.enabled),
    google: {
      enabled: config.google?.enabled !== false,
      clientId: config.google?.clientId || '',
      hasSecret: Boolean(config.google?.clientSecret),
    },
    facebook: {
      enabled: config.facebook?.enabled !== false,
      appId: config.facebook?.appId || '',
      hasSecret: Boolean(config.facebook?.appSecret),
    },
    callbacks: { google: oauthCallbackUrl(req, 'google'), facebook: oauthCallbackUrl(req, 'facebook') },
    live: publicSocialLogin(config),
  });
});

app.post('/api/admin/social-login', requireDashboard, async (req, res) => {
  try {
    const body = req.body || {};
    const current = await readSocialLogin();
    const text = (value: any, max = 300) => String(value ?? '').trim().slice(0, max);
    const next: SocialLoginConfig = {
      enabled: Boolean(body.enabled),
      google: {
        enabled: body.google?.enabled !== false,
        clientId: text(body.google?.clientId),
        // A blank secret keeps the saved one; "clear" removes it
        clientSecret: body.google?.clearSecret ? '' : text(body.google?.clientSecret) || current.google?.clientSecret || '',
      },
      facebook: {
        enabled: body.facebook?.enabled !== false,
        appId: text(body.facebook?.appId, 64),
        appSecret: body.facebook?.clearSecret ? '' : text(body.facebook?.appSecret) || current.facebook?.appSecret || '',
      },
    };
    if (next.google?.clientId && !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(next.google.clientId)) {
      return res.status(400).json({ error: 'The Google Client ID ends with .apps.googleusercontent.com — please check it.' });
    }
    if (next.facebook?.appId && !/^\d{5,25}$/.test(next.facebook.appId)) {
      return res.status(400).json({ error: 'The Facebook App ID contains digits only — please check it.' });
    }
    const value = JSON.stringify(next);
    await db.insert(siteSettings).values({ key: SOCIAL_LOGIN_KEY, value }).onDuplicateKeyUpdate({ set: { value } });
    await cache.invalidate();
    res.json({ success: true, live: publicSocialLogin(next) });
  } catch (error: any) {
    console.error('social login save failed:', error);
    res.status(500).json({ error: 'Could not save the social login settings.' });
  }
});

// A customer's own profile + order history
app.get('/api/account/me', requireRole('customer', 'admin'), async (req: any, res) => {
  try {
    // Only a customer session maps to a customer row. An admin or staff member
    // opening /account is not an error — they simply have no shopper profile.
    const sub = String(req.session.sub || '');
    if (!sub.startsWith('customer_')) {
      return res.json({ profile: null, orders: [], staffAccount: true });
    }

    const customerId = Number(sub.replace('customer_', ''));
    if (!customerId) return res.status(400).json({ error: 'Invalid session' });

    const rows = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found.' });

    const { passwordHash, ...profile } = rows[0];
    // Orders of this account, plus orders placed with the account's own phone
    // number while signed out (or before the account was created)
    const accountPhone = String(rows[0].phone || '').replace(/[\s-]+/g, '');
    const history = await db
      .select()
      .from(orders)
      .where(
        /^01[3-9]\d{8}$/.test(accountPhone)
          ? or(eq(orders.customerId, customerId), eq(orders.customerPhone, accountPhone))
          : eq(orders.customerId, customerId)
      )
      .orderBy(desc(orders.createdAt))
      .limit(200);

    res.json({ profile, orders: history });
  } catch (error: any) {
    console.error('Failed to load account:', error);
    res.status(500).json({ error: 'Could not load account.' });
  }
});

// Customer updates their own profile
app.put('/api/account/me', requireRole('customer'), async (req: any, res) => {
  try {
    const customerId = Number(String(req.session.sub).replace('customer_', ''));
    const { name, email, address, currentPassword, newPassword } = req.body || {};

    const rows = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found.' });

    const patch: Record<string, any> = {};
    if (name) patch.name = String(name).trim();
    if (email !== undefined) patch.email = email || null;
    if (address !== undefined) patch.address = address || null;

    if (newPassword) {
      if (!rows[0].passwordHash || !verifyPassword(String(currentPassword || ''), rows[0].passwordHash).ok) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
      if (String(newPassword).length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters.' });
      }
      patch.passwordHash = makePasswordRecord(String(newPassword));
    }

    await db.update(customers).set(patch).where(eq(customers.id, customerId));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Failed to update account:', error);
    res.status(500).json({ error: 'Could not complete the update.' });
  }
});

// Authentication: current session
app.get('/api/auth/me', async (req, res) => {
  const raw = readSession(getBearer(req));
  const session = raw ? await resolveLiveSession(raw).catch(() => null) : null;
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  privateResponse(res);

  // Customers: the wholesale status is read live, so an approval (or a
  // suspension) shows up on the storefront without signing in again.
  if (session.role === 'customer') {
    const customer = await sessionCustomer(req).catch(() => null);
    if (!customer) return res.status(401).json({ error: 'Unauthorized' });
    if (customer.status === 'blocked') return res.status(401).json({ error: ACCOUNT_DISABLED });
    return res.json({ user: customerSessionUser(customer) });
  }

  res.json({
    user: {
      id: 1,
      uid: session.sub,
      name: session.name,
      email: session.email,
      role: session.role,
      jobRole: session.jobRole || '',
      permissions: session.permissions || [],
    },
  });
});

// The owner's login email and recovery phone, for Account & Security
app.get('/api/auth/owner-profile', requireAdmin, async (req: any, res) => {
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'admin_auth')).limit(1);
    const auth: any = rows.length > 0 ? JSON.parse(rows[0].value) : DEFAULT_ADMIN_AUTH;
    privateResponse(res);
    // v3.11 — the dashboard warns while the well-known default password works
    const usingDefaultPassword = verifyPassword(FALLBACK_ADMIN_PASSWORD, String(auth.passwordHash || '')).ok;
    res.json({
      email: auth.email || '',
      recoveryPhone: auth.recoveryPhone || '',
      isOwner: req.session?.sub === 'admin_root',
      passwordChangedAt: Number(auth.passwordChangedAt) || null,
      usingDefaultPassword,
      envRecovery: ENV_ADMIN_SET,
    });
  } catch {
    res.status(500).json({ error: 'Could not load your account.' });
  }
});

// Authentication: Change Admin Credentials
app.post('/api/auth/change-credentials', requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newEmail, newPassword, recoveryPhone } = req.body;
    if (!currentPassword) {
      return res.status(400).json({ error: 'Please enter your current password.' });
    }

    const row = await db.select().from(siteSettings).where(eq(siteSettings.key, 'admin_auth'));
    let adminAuth: Record<string, any> = DEFAULT_ADMIN_AUTH;
    if (row.length > 0) {
      try {
        const parsed = JSON.parse(row[0].value);
        if (parsed && parsed.passwordHash) adminAuth = parsed;
      } catch (e) {
        // use default
      }
    }

    if (!verifyPassword(currentPassword, adminAuth.passwordHash).ok) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    if (newPassword && String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    if (newPassword && String(newPassword).toLowerCase() === FALLBACK_ADMIN_PASSWORD) {
      return res.status(400).json({ error: 'Choose a password other than the default one.' });
    }
    if (newEmail !== undefined && String(newEmail).trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(newEmail).trim())) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }

    let recovery = (adminAuth as any).recoveryPhone || '';
    if (recoveryPhone !== undefined) {
      recovery = String(recoveryPhone || '').trim() ? bdMobile(recoveryPhone) : '';
      if (String(recoveryPhone || '').trim() && !recovery) {
        return res.status(400).json({ error: 'Enter a valid 11-digit mobile number for password recovery.' });
      }
    }

    // Keep everything else stored with the login (recovery phone, reset stamp)
    const stamp = Date.now();
    const updatedAuth = {
      ...adminAuth,
      email: newEmail && String(newEmail).trim() ? String(newEmail).trim().toLowerCase() : adminAuth.email,
      passwordHash: newPassword ? makePasswordRecord(newPassword) : adminAuth.passwordHash,
      recoveryPhone: recovery,
      mustChangePassword: newPassword ? false : (adminAuth as any).mustChangePassword,
      // v3.11 — a new password signs the owner out everywhere else (e.g. a
      // session someone opened with the default password); this one continues
      ...(newPassword ? { passwordChangedAt: stamp - 1 } : {}),
      updatedAt: new Date(stamp).toISOString(),
    };

    await db
      .insert(siteSettings)
      .values({ key: 'admin_auth', value: JSON.stringify(updatedAuth) })
      .onDuplicateKeyUpdate({ set: {value: JSON.stringify(updatedAuth) } });

    let token: string | undefined;
    if (newPassword) {
      passwordChangedCache.set('admin_root', { at: Date.now(), value: stamp - 1 });
      if ((req as any).session?.sub === 'admin_root') {
        token = signSession({
          sub: 'admin_root',
          email: updatedAuth.email,
          name: 'Admin',
          role: 'admin',
          exp: Date.now() + SESSION_TTL_MS,
        });
      }
    }

    res.json({
      success: true,
      message: 'Admin details updated.',
      email: updatedAuth.email,
      recoveryPhone: updatedAuth.recoveryPhone,
      ...(token ? { token } : {}),
    });
  } catch (error: any) {
    console.error('Change credentials error:', error);
    res.status(500).json({ error: 'Could not update the details.' });
  }
});

// ==========================================
// ROUTE GUARDS (registered before the routes they protect)
// ==========================================
app.use('/api/admin', requireDashboard);

// Full settings, secrets included — admin session required (guarded above).
app.get('/api/admin/settings', async (req: any, res) => {
  try {
    const rows = await db.select().from(siteSettings);
    let settingsMap: Record<string, any> = {};
    for (const r of rows) {
      try {
        settingsMap[r.key] = JSON.parse(r.value);
      } catch {
        settingsMap[r.key] = r.value;
      }
    }
    // Never hand back the password hash, not even to an admin UI. The Pathao
    // token is server-only too: the dashboard saves the whole settings object
    // back, which would otherwise overwrite a freshly refreshed token.
    delete settingsMap.admin_auth;
    delete settingsMap.pathao_token;
    // Saved through their own screens/endpoints — kept out of the bulk settings
    // object so an older copy can never be written back over them
    for (const key of OWN_ENDPOINT_SETTING_KEYS) delete settingsMap[key];

    // The admin editors need the same defaults the storefront gets, otherwise a
    // never-saved section would open with empty fields and then save blanks.
    if (!settingsMap.navigation_menu) settingsMap.navigation_menu = DEFAULT_NAVIGATION_MENU;
    if (!settingsMap.pages) settingsMap.pages = DEFAULT_CMS_PAGES;
    if (!settingsMap.offers_config) settingsMap.offers_config = DEFAULT_OFFERS_CONFIG;
    if (!settingsMap.logo_config) settingsMap.logo_config = DEFAULT_LOGO_CONFIG;
    if (!settingsMap.footer_config) settingsMap.footer_config = DEFAULT_FOOTER_CONFIG;
    if (!settingsMap.homepage_sections) settingsMap.homepage_sections = DEFAULT_HOMEPAGE_SECTIONS;
    if (!settingsMap.seo_config) settingsMap.seo_config = DEFAULT_SEO_CONFIG;
    if (!settingsMap.invoice_config) settingsMap.invoice_config = DEFAULT_INVOICE_CONFIG;
    if (!settingsMap.service_features) settingsMap.service_features = DEFAULT_SERVICE_FEATURES;
    if (!settingsMap.flash_sale_config) settingsMap.flash_sale_config = DEFAULT_FLASH_SALE_CONFIG;
    settingsMap.product_card_config = {
      ...DEFAULT_PRODUCT_CARD_CONFIG,
      ...settingsMap.product_card_config,
    };
    settingsMap.cta_animation_config = {
      ...DEFAULT_CTA_ANIMATION_CONFIG,
      ...(settingsMap.cta_animation_config || {}),
    };
    settingsMap.footer_config = { ...DEFAULT_FOOTER_CONFIG, ...(settingsMap.footer_config || {}) };
    if (!settingsMap.mobile_nav_config) settingsMap.mobile_nav_config = DEFAULT_MOBILE_NAV_CONFIG;
    applyV36Defaults(settingsMap);
    // v3.10 — API keys and tokens are only for accounts that manage System Configuration
    if (req.session?.role !== 'admin' && !hasModule(req.session, 'settings')) settingsMap = stripSecrets(settingsMap);

    res.json(settingsMap);
  } catch (error: any) {
    console.error('Failed to get admin settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});
app.use('/api/dashboard', requireDashboard);
app.use('/api/media', requireDashboard);
// POS counter routes are usable by admin + staff, never by an anonymous visitor
app.use('/api/pos', requirePos);

// v3.6 — size guides, review moderation, blog, landing pages (src/server/content.ts)
registerContent(app, {
  requireAdmin: requireDashboard,
  clientIp: (req) => clientIp(req),
  readSession: (token) => readSession(token),
  getBearer: (req) => getBearer(req),
});

// v3.6 — SSLCommerz, bKash and Nagad (src/server/payments.ts)
registerPayments(app, {
  requireAdmin: requireDashboard,
  clientIp: (req) => clientIp(req),
  publicOrigin: (req) => publicOrigin(req),
  notifyAdmin: (type, title, body, linkTab) => notifyAdmin(type, title, body, linkTab),
});

/** Response cache status for System Configuration → Database */
app.get('/api/admin/cache/status', (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(cache.status());
});

// Get Categories
app.get('/api/categories', async (req, res) => {
  try {
    const data = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    // `?tree=1` nests subcategories under their parent (3 levels) and adds the
    // product count per category, which the dashboard manager and the home
    // page sections both need.
    if (req.query.tree === '1') {
      const counts = await db
        .select({ categoryId: products.categoryId, total: sql<number>`count(*)` })
        .from(products)
        .where(eq(products.status, 'active'))
        .groupBy(products.categoryId);

      const countMap = new Map(counts.map((c) => [c.categoryId, Number(c.total)]));
      const byId = new Map(
        data.map((c) => [c.id, { ...c, productCount: countMap.get(c.id) || 0, children: [] as any[] }])
      );

      const roots: any[] = [];
      for (const node of byId.values()) {
        const parent = node.parentId ? byId.get(node.parentId) : null;
        if (parent) parent.children.push(node);
        else roots.push(node);
      }
      return res.json(roots);
    }

    res.json(data);
  } catch (error: any) {
    console.error('Failed to get categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get Brands
app.get('/api/brands', async (_req, res) => {
  try {
    const data = await db.select().from(brands).orderBy(asc(brands.name));
    // Active product count per brand, so the home brand strip can skip empty brands
    const counts = await db
      .select({ brandId: products.brandId, count: sql<number>`count(*)` })
      .from(products)
      .where(eq(products.status, 'active'))
      .groupBy(products.brandId);
    const byBrand = new Map(counts.map((row) => [row.brandId, Number(row.count)]));
    res.json(data.map((brand) => ({ ...brand, productCount: byBrand.get(brand.id) || 0 })));
  } catch (error: any) {
    console.error('Failed to get brands:', error);
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
});

// Get Hero Banners
async function listPublicBanners() {
  const rows = await db.select().from(heroBanners).where(eq(heroBanners.status, 'active')).orderBy(asc(heroBanners.sortOrder));
  // v3.12 — each banner's real shape, so the slider opens at the right height
  // (no jump when the picture arrives) and the first screen can show it at once
  const dirs = [uploadsDir, ...LEGACY_UPLOAD_DIRS];
  return Promise.all(
    rows.map(async (row) => {
      const [desktop, mobile] = await Promise.all([
        uploadedImageSize(row.imageUrl, dirs).catch(() => null),
        row.mobileImageUrl ? uploadedImageSize(row.mobileImageUrl, dirs).catch(() => null) : Promise.resolve(null),
      ]);
      return {
        ...row,
        ratio: desktop ? Number((desktop.width / desktop.height).toFixed(4)) : null,
        mobileRatio: mobile ? Number((mobile.width / mobile.height).toFixed(4)) : null,
        width: desktop?.width || null,
        height: desktop?.height || null,
        mobileWidth: mobile?.width || null,
        mobileHeight: mobile?.height || null,
      };
    })
  );
}

app.get('/api/banners', async (_req, res) => {
  try {
    res.json(await listPublicBanners());
  } catch (error: any) {
    console.error('Failed to get banners:', error);
    res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

// Admin: list every banner (active + inactive) for management
app.get('/api/admin/banners', async (_req, res) => {
  try {
    const data = await db.select().from(heroBanners).orderBy(asc(heroBanners.sortOrder));
    res.json(data);
  } catch (error: any) {
    console.error('Failed to get banners (admin):', error);
    res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

// Get Products (with rich filter, search, sort, pagination)

// ==========================================
// WHOLESALE — who is a wholesale buyer, and what they may see
// ==========================================
/**
 * The ONLY place a request is recognised as coming from an approved wholesale
 * customer. It reads the signed session token and re-reads the customer row
 * on every call, so approving, rejecting or suspending an account takes effect
 * on the very next request. Nothing the browser sends (hidden fields, query
 * strings, prices) can switch wholesale pricing on.
 */
export type CustomerRow = typeof customers.$inferSelect;

async function sessionCustomer(req: express.Request): Promise<CustomerRow | null> {
  const session = readSession(getBearer(req));
  if (!session || session.role !== 'customer') return null;
  const id = Number(String(session.sub || '').replace('customer_', ''));
  if (!Number.isFinite(id) || id <= 0) return null;
  const changedAt = await passwordChangedAt(session.sub);
  if (changedAt && sessionIssuedAt(session) < changedAt) return null;
  const rows = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return rows[0] || null;
}

export const isApprovedWholesale = (customer: CustomerRow | null | undefined): boolean =>
  Boolean(
    customer &&
      customer.customerType === 'wholesale' &&
      customer.wholesaleStatus === 'approved' &&
      customer.status !== 'blocked'
  );

async function wholesaleBuyer(req: express.Request): Promise<CustomerRow | null> {
  try {
    const customer = await sessionCustomer(req);
    return isApprovedWholesale(customer) ? customer : null;
  } catch {
    return null;
  }
}

/** A product that can actually be sold wholesale: switched on AND priced */
const isWholesaleProduct = (row: any): boolean =>
  Boolean(row?.wholesaleEnabled) && Number(row?.wholesalePrice) > 0;

/**
 * What a shopper is allowed to see of a product row.
 *
 * - Everyone: never the cost price.
 * - Regular shoppers: exactly what they saw before; wholesale fields removed.
 * - Approved wholesale buyers: the wholesale price takes the place of the
 *   regular/sale price, so every existing page, the cart and the checkout
 *   show it without special cases, and the regular prices are not sent at all.
 */
export function publicProduct<T extends Record<string, any>>(row: T, wholesale: boolean): T {
  const {
    costPrice,
    wholesalePrice,
    wholesaleEnabled,
    wholesaleMinQty,
    wholesaleMaxQty,
    ...rest
  } = row as any;
  if (!wholesale) return rest as T;
  return {
    ...rest,
    price: wholesalePrice,
    salePrice: null,
    isWholesale: true,
    wholesaleMinQty: wholesaleMinQty ?? null,
    wholesaleMaxQty: wholesaleMaxQty ?? null,
  } as T;
}

/** Headers for any response whose content depends on who is asking */
export function privateResponse(res: express.Response) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
}

// Get Products (Public)
/** A category's id plus every sub and sub-sub category below it (cached briefly) */
let categoryTreeCache: { at: number; rows: Array<{ id: number; parentId: number | null }> } = { at: 0, rows: [] };
export async function categoryAndDescendants(rootId: number): Promise<number[]> {
  if (Date.now() - categoryTreeCache.at > 30_000) {
    const rows = await db.select({ id: categories.id, parentId: categories.parentId }).from(categories);
    categoryTreeCache = { at: Date.now(), rows: rows.map((row) => ({ id: row.id, parentId: row.parentId ?? null })) };
  }
  const ids = [rootId];
  for (let index = 0; index < ids.length && index < 500; index += 1) {
    for (const row of categoryTreeCache.rows) if (row.parentId === ids[index] && !ids.includes(row.id)) ids.push(row.id);
  }
  return ids;
}

app.get('/api/products', async (req, res) => {
  try {
    const {
      search,
      category,
      brand,
      generic,
      flashSale,
      bestSeller,
      newArrival,
      featured,
      sort,
      limit = '50',
      offset = '0',
    } = req.query;

    const conditions: any[] = [eq(products.status, 'active')];

    // Approved wholesale buyers see the wholesale catalogue only
    const buyer = await wholesaleBuyer(req);
    if (buyer) {
      conditions.push(eq(products.wholesaleEnabled, true));
      conditions.push(sql`${products.wholesalePrice} > 0`);
    }

    // Generic-name page: every product sharing one generic (e.g. Paracetamol)
    if (generic && typeof generic === 'string' && generic.trim()) {
      conditions.push(eq(products.genericName, generic.trim()));
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          like(products.name, q),
          like(products.genericName, q),
          // v3.15 — product tags are searchable too
          like(products.tags, q),
          like(products.sku, q),
          like(products.barcode, q)
        )
      );
    }

    if (category) {
      // A parent category shows everything filed under its sub and sub-sub categories too
      const catId = Number(category);
      let rootId: number | null = null;
      if (!isNaN(catId)) rootId = catId;
      else {
        const catObj = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, String(category))).limit(1);
        if (catObj.length > 0) rootId = catObj[0].id;
      }
      if (rootId !== null) {
        const ids = await categoryAndDescendants(rootId);
        conditions.push(ids.length > 1 ? inArray(products.categoryId, ids) : eq(products.categoryId, rootId));
      } else {
        conditions.push(sql`1 = 0`);
      }
    }

    if (brand) {
      const brandId = Number(brand);
      if (!isNaN(brandId)) {
        conditions.push(eq(products.brandId, brandId));
      } else {
        const brandObj = await db.select().from(brands).where(eq(brands.slug, String(brand))).limit(1);
        if (brandObj.length > 0) {
          conditions.push(eq(products.brandId, brandObj[0].id));
        }
      }
    }

    if (flashSale === 'true') {
      conditions.push(eq(products.isFlashSale, true));
    }
    if (bestSeller === 'true') {
      conditions.push(eq(products.isBestSeller, true));
    }
    if (newArrival === 'true') {
      conditions.push(eq(products.isNewArrival, true));
    }
    if (featured === 'true') {
      conditions.push(eq(products.featured, true));
    }
    // v3.14 — Offers page and Flash Sale: every discounted product, not only
    // those among the newest 100 the storefront keeps in memory
    if (req.query.onSale === 'true') {
      conditions.push(
        or(eq(products.isFlashSale, true), sql`(${products.salePrice} > 0 AND ${products.salePrice} < ${products.price})`)
      );
    }

    // Shop page price slider — compares against the effective (sale) price
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);
    if (Number.isFinite(minPrice) && minPrice > 0) {
      conditions.push(sql`COALESCE(${products.salePrice}, ${products.price}) >= ${minPrice}`);
    }
    if (Number.isFinite(maxPrice) && maxPrice > 0) {
      conditions.push(sql`COALESCE(${products.salePrice}, ${products.price}) <= ${maxPrice}`);
    }

    // Newest upload first. The id always grows, while created_at can tie
    // (products saved in the same second), which is how a new product used to
    // land somewhere in the middle of the list.
    let orderByClause: any = desc(products.id);
    if (sort === 'price_asc') {
      orderByClause = asc(products.price);
    } else if (sort === 'price_desc') {
      orderByClause = desc(products.price);
    } else if (sort === 'rating') {
      orderByClause = desc(products.rating);
    } else if (sort === 'name') {
      orderByClause = asc(products.name);
    }

    const data = await db
      .select({
        product: products,
        category: categories,
        brand: brands,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(and(...conditions))
      .orderBy(orderByClause)
      .limit(Math.min(Number(limit), 100))
      .offset(Number(offset));

    const formatted = data.map((item) => ({
      ...publicProduct(item.product, Boolean(buyer)),
      categoryName: item.category?.name || 'General',
      categorySlug: item.category?.slug || 'general',
      brandName: item.brand?.name || '',
      brandSlug: item.brand?.slug || '',
      brandLogo: item.brand?.logo || '',
    }));

    privateResponse(res);
    res.json(formatted);
  } catch (error: any) {
    console.error('Failed to get products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * v3.11 — the shop page, one page at a time.
 *
 *   GET /api/products/browse?page=2&pageSize=20&category=…&brand=…&search=…
 *       &rx=1|0&flashSale=1&inStock=1&minPrice=&maxPrice=&sort=popular|price-low|price-high|name
 *   → { items, total, page, pageSize, pages, facets: { categories, brands, price } }
 *
 * Earlier the shop loaded at most 100 products into the browser and filtered
 * them there, so a bigger catalogue was cut off. Now MySQL filters, counts and
 * returns exactly one page (20 by default), and the numbered pages below the
 * grid reach every product.
 */
/**
 * One page of the shop (filters, count, facets). Shared by the API and (v3.12)
 * by the server, which sends the first page with a /shop link opened directly.
 */
async function browsePayload(q: Record<string, string | undefined>, buyer: any) {
    const pageSize = Math.min(60, Math.max(4, Math.floor(Number(q.pageSize)) || 20));
    const requestedPage = Math.max(1, Math.floor(Number(q.page)) || 1);

    const base: any[] = [eq(products.status, 'active')];
    if (buyer) {
      base.push(eq(products.wholesaleEnabled, true));
      base.push(sql`${products.wholesalePrice} > 0`);
    }
    // Brand / generic pages are a fixed set (the facets count inside it)
    let brandId: number | null = null;
    const brandRaw = String(q.brand || '').trim();
    if (brandRaw && brandRaw !== 'all') {
      const asNumber = Number(brandRaw);
      if (Number.isInteger(asNumber) && asNumber > 0) brandId = asNumber;
      else {
        const found = await db.select({ id: brands.id }).from(brands).where(eq(brands.slug, brandRaw)).limit(1);
        brandId = found[0]?.id ?? -1;
      }
    }
    const generic = String(q.generic || '').trim();
    if (generic) base.push(eq(products.genericName, generic.slice(0, 191)));
    if (q.scope === 'brand' && brandId !== null) base.push(eq(products.brandId, brandId));

    const effectivePrice = buyer
      ? sql`${products.wholesalePrice}`
      : sql`COALESCE(NULLIF(${products.salePrice}, 0), ${products.price})`;

    const filters: any[] = [...base];
    const categoryRaw = String(q.category || '').trim();
    if (categoryRaw && categoryRaw !== 'all') {
      const asNumber = Number(categoryRaw);
      let rootId: number | null = Number.isInteger(asNumber) && asNumber > 0 ? asNumber : null;
      if (rootId === null) {
        const found = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, categoryRaw)).limit(1);
        rootId = found[0]?.id ?? null;
      }
      if (rootId === null) filters.push(sql`1 = 0`);
      else {
        const ids = await categoryAndDescendants(rootId);
        filters.push(ids.length > 1 ? inArray(products.categoryId, ids) : eq(products.categoryId, rootId));
      }
    }
    if (brandId !== null && q.scope !== 'brand') filters.push(eq(products.brandId, brandId));
    if (q.rx === '1') filters.push(eq(products.requiresPrescription, true));
    if (q.rx === '0') filters.push(sql`COALESCE(${products.requiresPrescription}, 0) = 0`);
    if (q.flashSale === '1' || q.flashSale === 'true') filters.push(eq(products.isFlashSale, true));
    // v3.12 — the home page's New Arrival "View All"
    if (q.newArrival === '1' || q.newArrival === 'true') filters.push(eq(products.isNewArrival, true));
    if (q.inStock === '1') {
      filters.push(
        sql`(${products.stock} > 0 OR EXISTS (SELECT 1 FROM product_variations v WHERE v.product_id = ${products.id} AND v.status = 'active' AND v.stock > 0))`
      );
    }
    const minPrice = Number(q.minPrice);
    const maxPrice = Number(q.maxPrice);
    if (Number.isFinite(minPrice) && minPrice > 0) filters.push(sql`${effectivePrice} >= ${minPrice}`);
    if (Number.isFinite(maxPrice) && maxPrice > 0) filters.push(sql`${effectivePrice} <= ${maxPrice}`);
    const search = String(q.search || '').trim().slice(0, 100);
    if (search) {
      const like_ = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      filters.push(
        or(
          like(products.name, like_),
          like(products.genericName, like_),
          // v3.15 — product tags are searchable too
          like(products.tags, like_),
          like(products.sku, like_),
          like(products.barcode, like_),
          like(brands.name, like_),
          like(categories.name, like_)
        )
      );
    }

    const orderBy =
      q.sort === 'price-low'
        ? [asc(effectivePrice), desc(products.id)]
        : q.sort === 'price-high'
        ? [desc(effectivePrice), desc(products.id)]
        : q.sort === 'name'
        ? [asc(products.name), desc(products.id)]
        : [desc(products.id)];

    const where = and(...filters);
    const countRows = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(where);
    const total = Number(countRows[0]?.n) || 0;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pages);

    const rows = await db
      .select({ product: products, category: categories, brand: brands })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // Products with options: the card shows "choose an option" instead of "out of stock"
    const ids = rows.map((row) => row.product.id);
    const withOptions = new Set<number>();
    if (ids.length > 0) {
      const optionRows = await db
        .select({ productId: productVariations.productId })
        .from(productVariations)
        .where(and(inArray(productVariations.productId, ids), eq(productVariations.status, 'active')));
      optionRows.forEach((row) => withOptions.add(row.productId));
    }

    const items = rows.map((item) => ({
      ...publicProduct(item.product, Boolean(buyer)),
      hasVariations: withOptions.has(item.product.id) || undefined,
      categoryName: item.category?.name || 'General',
      categorySlug: item.category?.slug || 'general',
      brandName: item.brand?.name || '',
      brandSlug: item.brand?.slug || '',
      brandLogo: item.brand?.logo || '',
    }));

    // Facets: how many products each category and brand has (inside a brand /
    // generic page, only that page's products), and the price range
    const baseWhere = and(...base);
    const [categoryCounts, brandCounts, priceRange] = await Promise.all([
      db.select({ id: products.categoryId, n: sql<number>`COUNT(*)` }).from(products).where(baseWhere).groupBy(products.categoryId),
      db.select({ id: products.brandId, n: sql<number>`COUNT(*)` }).from(products).where(baseWhere).groupBy(products.brandId),
      db.select({ min: sql<number>`MIN(${effectivePrice})`, max: sql<number>`MAX(${effectivePrice})` }).from(products).where(baseWhere),
    ]);
    const toMap = (list: Array<{ id: number | null; n: number }>) => {
      const out: Record<string, number> = {};
      list.forEach((row) => {
        if (row.id != null) out[String(row.id)] = Number(row.n) || 0;
      });
      return out;
    };

    return {
      items,
      total,
      page,
      pageSize,
      pages,
      facets: {
        total: categoryCounts.reduce((sum, row) => sum + (Number(row.n) || 0), 0),
        categories: toMap(categoryCounts),
        brands: toMap(brandCounts),
        price: { min: Math.floor(Number(priceRange[0]?.min) || 0), max: Math.ceil(Number(priceRange[0]?.max) || 0) },
      },
    };
}

app.get('/api/products/browse', async (req, res) => {
  try {
    const buyer = await wholesaleBuyer(req);
    const result = await browsePayload(req.query as Record<string, string | undefined>, buyer);
    privateResponse(res);
    res.json(result);
  } catch (error: any) {
    console.error('Failed to browse products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/* ===========================================================================
 * v3.11 — SEARCH BY PHOTO
 * The shopper's photo never reaches the server: the browser sends only a
 * numeric fingerprint (src/lib/imageFingerprint.ts). It is compared with the
 * fingerprints of the product images in memory and thrown away — nothing about
 * a search is stored or logged.
 * ======================================================================== */
const DEFAULT_SEARCH_CONFIG = {
  placeholder: 'Search products.....',
  typingEnabled: true,
  typingPhrases: [] as string[],
  typingSpeed: 'normal',
  imageSearchEnabled: false,
  imageSearchTitle: 'Search by photo',
  imageSearchMinScore: 0.62,
};

async function readSearchConfig() {
  const saved = await readJsonSetting<any>('search_config', {});
  return { ...DEFAULT_SEARCH_CONFIG, ...(saved && typeof saved === 'object' ? saved : {}) };
}

let imageIndexCache: { at: number; entries: Array<{ productId: number; fp: ImageFingerprint }> } | null = null;
const dropImageIndexCache = () => {
  imageIndexCache = null;
};

async function loadImageIndex() {
  if (imageIndexCache && Date.now() - imageIndexCache.at < 2 * 60_000) return imageIndexCache.entries;
  const rows = sqlRows(
    await db.execute(sql`SELECT i.product_id AS productId, i.descriptor, i.image_url AS imageUrl, p.image AS image
                         FROM product_image_index i JOIN products p ON p.id = i.product_id
                         WHERE p.status = 'active' AND i.version = ${FINGERPRINT_VERSION}`)
  );
  const entries: Array<{ productId: number; fp: ImageFingerprint }> = [];
  for (const row of rows as any[]) {
    // A product whose picture changed since it was indexed is left out until re-indexed
    if (String(row.imageUrl || '') !== String(row.image || '')) continue;
    try {
      const fp = cleanFingerprint(JSON.parse(row.descriptor));
      if (fp) entries.push({ productId: Number(row.productId), fp });
    } catch {
      /* skip a damaged row */
    }
  }
  imageIndexCache = { at: Date.now(), entries };
  return entries;
}

const imageSearchLimiter = rateLimit({ windowMs: 60_000, max: 20, key: (req) => clientIp(req), message: 'Too many photo searches. Please wait a minute.' });

app.post('/api/image-search', imageSearchLimiter, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const cfg = await readSearchConfig();
    if (!cfg.imageSearchEnabled) return res.status(404).json({ error: 'Search by photo is switched off.' });
    const fp = cleanFingerprint(req.body?.fingerprint);
    if (!fp) return res.status(400).json({ error: 'The picture could not be read. Please try another photo.' });

    const index = await loadImageIndex();
    const minScore = Math.min(0.95, Math.max(0.3, Number(cfg.imageSearchMinScore) || DEFAULT_SEARCH_CONFIG.imageSearchMinScore));
    const scored = index
      .map((entry) => ({ productId: entry.productId, score: compareFingerprints(fp, entry.fp) }))
      .sort((a, b) => b.score - a.score);
    // The best matches above the bar; if nothing clears it, the closest few are still shown as "similar"
    let picked = scored.filter((item) => item.score >= minScore).slice(0, 24);
    const exact = picked.length > 0;
    if (!exact) picked = scored.slice(0, 8);
    if (picked.length === 0) return res.json({ results: [], exact: false, indexed: index.length });

    const buyer = await wholesaleBuyer(req);
    const ids = picked.map((item) => item.productId);
    const conditions: any[] = [inArray(products.id, ids), eq(products.status, 'active')];
    if (buyer) {
      conditions.push(eq(products.wholesaleEnabled, true));
      conditions.push(sql`${products.wholesalePrice} > 0`);
    }
    const rows = await db
      .select({ product: products, category: categories, brand: brands })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(and(...conditions));
    const byId = new Map(rows.map((row) => [row.product.id, row]));
    const results = picked
      .map((item) => {
        const row = byId.get(item.productId);
        if (!row) return null;
        return {
          ...publicProduct(row.product, Boolean(buyer)),
          categoryName: row.category?.name || 'General',
          categorySlug: row.category?.slug || 'general',
          brandName: row.brand?.name || '',
          brandSlug: row.brand?.slug || '',
          match: Math.round(item.score * 100),
        };
      })
      .filter(Boolean);
    privateResponse(res);
    res.json({ results, exact, indexed: index.length });
  } catch (error: any) {
    console.error('image search:', error?.message || error);
    res.status(500).json({ error: 'Search by photo is not available right now.' });
  }
});

/** Dashboard: which product pictures are in the photo-search index */
app.get('/api/admin/image-index', async (_req, res) => {
  try {
    privateResponse(res);
    const rows = sqlRows(
      await db.execute(sql`SELECT p.id, p.name, p.image, i.image_url AS indexedUrl, i.version
                           FROM products p LEFT JOIN product_image_index i ON i.product_id = p.id
                           WHERE p.status = 'active' ORDER BY p.id DESC`)
    );
    const list = (rows as any[]).map((row) => ({
      id: Number(row.id),
      name: String(row.name || ''),
      image: row.image ? String(row.image) : '',
      indexed: Boolean(row.indexedUrl) && String(row.indexedUrl) === String(row.image || '') && Number(row.version) === FINGERPRINT_VERSION,
    }));
    const withImage = list.filter((item) => item.image);
    res.json({
      version: FINGERPRINT_VERSION,
      total: withImage.length,
      indexed: withImage.filter((item) => item.indexed).length,
      noImage: list.length - withImage.length,
      pending: withImage.filter((item) => !item.indexed).map(({ id, name, image }) => ({ id, name, image })),
    });
  } catch (error: any) {
    console.error('image index status:', error?.message || error);
    res.status(500).json({ error: 'Could not read the photo index.' });
  }
});

/** Dashboard: save fingerprints made in the browser (up to 50 at a time) */
app.post('/api/admin/image-index', async (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, 50) : [];
    let saved = 0;
    for (const entry of entries) {
      const productId = Number(entry?.productId);
      const fp = cleanFingerprint(entry?.fingerprint);
      const imageUrl = String(entry?.imageUrl || '').slice(0, 1000);
      if (!Number.isInteger(productId) || productId <= 0 || !fp || !imageUrl) continue;
      const product = await db.select({ image: products.image }).from(products).where(eq(products.id, productId)).limit(1);
      // Only the picture the product really has (not any picture the caller likes)
      if (!product[0] || String(product[0].image || '') !== imageUrl) continue;
      const descriptor = JSON.stringify(fp);
      await db.execute(
        sql`INSERT INTO product_image_index (product_id, image_url, descriptor, version, updated_at)
            VALUES (${productId}, ${imageUrl}, ${descriptor}, ${FINGERPRINT_VERSION}, NOW())
            ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), descriptor = VALUES(descriptor), version = VALUES(version), updated_at = NOW()`
      );
      saved += 1;
    }
    dropImageIndexCache();
    res.json({ success: true, saved });
  } catch (error: any) {
    console.error('image index save:', error?.message || error);
    res.status(500).json({ error: 'Could not save the photo index.' });
  }
});

app.delete('/api/admin/image-index', async (_req, res) => {
  try {
    await db.execute(sql`DELETE FROM product_image_index`);
    dropImageIndexCache();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Could not clear the photo index.' });
  }
});

/**
 * Dashboard: a product picture hosted on another website, passed through so
 * the browser may read its pixels (another site's picture cannot be measured
 * directly). Public addresses only, pictures only, 6 MB at most.
 */
app.get('/api/admin/image-index/proxy', async (req, res) => {
  try {
    const link = String(req.query.url || '');
    if (!/^https?:\/\//i.test(link)) return res.status(400).json({ error: 'Not a picture link.' });
    const file = await downloadImage(link, 6 * 1024 * 1024);
    if (!/^image\/(jpeg|png|webp|gif|avif)$/i.test(file.mime)) return res.status(415).json({ error: 'Not a supported picture.' });
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.buffer);
  } catch (error: any) {
    res.status(502).json({ error: `Could not fetch the picture (${String(error?.message || error).slice(0, 120)}).` });
  }
});

// Single Product by slug or ID
/**
 * One product with everything its page needs. Shared by the API and (v3.12)
 * by the server, which sends a retail visitor's copy along with a product
 * page so it shows without waiting for a second request.
 */
async function productPagePayload(slugOrId: string, buyer: any): Promise<{ status: number; body: any }> {
    const isNum = !isNaN(Number(slugOrId));

    const condition = isNum ? eq(products.id, Number(slugOrId)) : eq(products.slug, slugOrId);

    const data = await db
      .select({
        product: products,
        category: categories,
        brand: brands,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(condition)
      .limit(1);

    if (data.length === 0) {
      return { status: 404, body: { error: 'Product not found' } };
    }

    const item = data[0];
    if (buyer && !isWholesaleProduct(item.product)) {
      return {
        status: 404,
        body: {
          error: 'This product is not part of the wholesale catalogue.',
          wholesaleOnly: true,
        },
      };
    }

    const product = {
      ...publicProduct(item.product, Boolean(buyer)),
      categoryName: item.category?.name || 'General',
      categorySlug: item.category?.slug || 'general',
      brandName: item.brand?.name || '',
      brandSlug: item.brand?.slug || '',
      brandLogo: item.brand?.logo || '',
    } as any;

    // Related products: same category, active, newest first. A wholesale
    // buyer only ever gets wholesale products back.
    let related: any[] = [];
    if (product.categoryId) {
      const relConditions: any[] = [
        eq(products.categoryId, product.categoryId),
        eq(products.status, 'active'),
        sql`${products.id} != ${product.id}`,
      ];
      if (buyer) {
        relConditions.push(eq(products.wholesaleEnabled, true));
        relConditions.push(sql`${products.wholesalePrice} > 0`);
      }
      const relData = await db
        .select()
        .from(products)
        .where(and(...relConditions))
        .orderBy(desc(products.id))
        .limit(10);
      related = relData.map((row) => publicProduct(row, Boolean(buyer)));
    }

    // Approved reviews (newest 100) with the star breakdown of all of them
    const reviewRows = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.productId, product.id), eq(reviews.status, 'approved')))
      .orderBy(desc(reviews.createdAt))
      .limit(100);
    const prodReviews = reviewRows.map((row) => ({
      id: row.id,
      customerName: row.userName,
      rating: row.rating,
      comment: row.comment,
      reply: row.reply || '',
      createdAt: row.createdAt,
    }));
    const breakdownResult: any = await db.execute(
      sql`SELECT rating, COUNT(*) AS n FROM reviews WHERE product_id = ${product.id} AND status = 'approved' GROUP BY rating`
    );
    const ratingBreakdown: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const row of Array.isArray(breakdownResult?.[0]) ? breakdownResult[0] : []) ratingBreakdown[String(row.rating)] = Number(row.n) || 0;

    // Size chart, sent with the product so the button shows at once
    let sizeGuide: any = null;
    if (item.product.sizeGuideId) {
      const guideRows: any = await db.execute(
        sql`SELECT id, name, description, \`columns\`, \`rows\`, image, note FROM size_guides WHERE id = ${item.product.sizeGuideId} AND status = 'active' LIMIT 1`
      );
      const guide = (Array.isArray(guideRows?.[0]) ? guideRows[0] : [])[0];
      if (guide) {
        const parse = (value: any) => {
          try {
            return JSON.parse(value) || [];
          } catch {
            return [];
          }
        };
        sizeGuide = { id: guide.id, name: guide.name, description: guide.description || '', columns: parse(guide.columns), rows: parse(guide.rows), image: guide.image || '', note: guide.note || '' };
      }
    }

    // Attributes attached to this product (Dashboard → Attributes)
    const attrRows = await db
      .select()
      .from(productAttributes)
      .where(eq(productAttributes.productId, product.id));
    const productAttrs = attrRows.map((row) => {
      let values: string[] = [];
      try {
        const parsed = JSON.parse(row.value);
        values = Array.isArray(parsed) ? parsed : [String(row.value)];
      } catch {
        values = [String(row.value)];
      }
      return { id: row.id, name: row.attributeName, values };
    });

    // Variations (Dashboard → Product → Variations). Each row carries its own
    // stock, so the storefront picker can disable what is sold out.
    const variationRows = await db
      .select()
      .from(productVariations)
      .where(and(eq(productVariations.productId, product.id), eq(productVariations.status, 'active')))
      .orderBy(productVariations.sortOrder, productVariations.id);

    // A wholesale buyer pays the option's own wholesale price, or the
    // product's wholesale price when the option has none (v3.7)
    const productWholesale = buyer ? Number(item.product.wholesalePrice) : null;
    const variations = variationRows.map((row) => {
      const wholesaleUnit =
        productWholesale == null ? null : Number(row.wholesalePrice) > 0 ? Number(row.wholesalePrice) : productWholesale;
      let combination: Record<string, string> = {};
      try {
        const parsed = JSON.parse(row.combination);
        if (parsed && typeof parsed === 'object') combination = parsed;
      } catch {
        /* a malformed row still renders from its label */
      }
      return {
        id: row.id,
        label: row.label,
        combination,
        sku: row.sku || '',
        price: wholesaleUnit != null ? wholesaleUnit : row.price != null ? Number(row.price) : null,
        salePrice: wholesaleUnit != null ? null : row.salePrice != null ? Number(row.salePrice) : null,
        stock: Number(row.stock || 0),
        image: row.image || '',
      };
    });

    return {
      status: 200,
      body: {
        product,
        related,
        reviews: prodReviews,
        ratingBreakdown,
        sizeGuide,
        attributes: productAttrs,
        variations,
        hasVariations: variations.length > 0,
      },
    };
}

app.get('/api/products/:slugOrId', async (req, res) => {
  try {
    const buyer = await wholesaleBuyer(req);
    privateResponse(res);
    const result = await productPagePayload(String(req.params.slugOrId), buyer);
    res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error('Failed to get product details:', error);
    res.status(500).json({ error: 'Failed to fetch product details' });
  }
});

/**
 * v3.12 — Home Sections → Videos: the title of a pasted YouTube link, read
 * from YouTube's public oEmbed page (no API key). Only YouTube addresses are
 * looked up, so this can never be used to reach any other site.
 */
/**
 * v3.12 — Home Sections → New Arrival: add / remove one product. Its own
 * route so whoever may edit the home page (Website module) can use it,
 * without the right to edit products.
 */
app.post('/api/admin/new-arrivals', async (req, res) => {
  const id = Number(req.body?.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Choose a product.' });
  try {
    const found = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
    if (!found[0]) return res.status(404).json({ error: 'Product not found.' });
    await db.update(products).set({ isNewArrival: Boolean(req.body?.value) }).where(eq(products.id, id));
    res.json({ success: true });
  } catch (error: any) {
    console.error('new arrival update failed:', error);
    res.status(500).json({ error: 'Could not save.' });
  }
});

app.get('/api/admin/video-info', async (req, res) => {
  const url = String(req.query.url || '').trim();
  const id =
    url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i)?.[1] ||
    url.match(/youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})/i)?.[1] ||
    (/^[A-Za-z0-9_-]{11}$/.test(url) ? url : '');
  if (!id) return res.status(400).json({ error: 'This is not a YouTube video link.' });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
      { signal: controller.signal }
    ).finally(() => clearTimeout(timer));
    if (!response.ok) return res.json({ id, title: '', found: false });
    const data: any = await response.json().catch(() => ({}));
    res.json({ id, found: true, title: String(data?.title || '').slice(0, 200), author: String(data?.author_name || '').slice(0, 120) });
  } catch {
    res.json({ id, title: '', found: false });
  }
});

// Validate Coupon
/**
 * v3.11 — one set of coupon rules for the checkout preview and for the order
 * itself. Earlier versions checked only "active" and the minimum order: an
 * expired coupon kept working, and the usage limit was never counted.
 */
type CouponRow = typeof coupons.$inferSelect;

/** The last moment a coupon works: the end of its expiry day, Bangladesh time */
function couponEndsAt(expiresAt: string | null | undefined): number | null {
  const text = String(expiresAt || '').trim();
  if (!text) return null;
  // A plain date (or a date + time without a zone) is the shop's own clock
  // (REPORT_TIMEZONE, Asia/Dhaka by default), whatever zone the server runs in
  const day = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (day) {
    const wall = day[4]
      ? Date.UTC(+day[1], +day[2] - 1, +day[3], +day[4], +day[5], +(day[6] || 0))
      : Date.UTC(+day[1], +day[2] - 1, +day[3], 23, 59, 59, 999);
    if (!Number.isFinite(wall)) return null;
    return wall - shopOffsetMinutes(new Date(wall)) * 60_000;
  }
  const at = Date.parse(text);
  return Number.isFinite(at) ? at : null;
}

function couponProblem(coupon: CouponRow, subtotal: number): string | null {
  if (String(coupon.status || 'active') !== 'active') return `Coupon ${coupon.code} is not active.`;
  const ends = couponEndsAt(coupon.expiresAt);
  if (ends !== null && Date.now() > ends) return `Coupon ${coupon.code} has expired.`;
  const limit = Number(coupon.usageLimit) || 0;
  if (limit > 0 && (Number(coupon.usedCount) || 0) >= limit) return `Coupon ${coupon.code} has already been used the maximum number of times.`;
  const minOrder = Number(coupon.minOrder) || 0;
  if (subtotal < minOrder) return `Minimum order of ৳${minOrder} required to use coupon ${coupon.code}`;
  return null;
}

function couponDiscount(coupon: CouponRow, subtotal: number): number {
  let amount = 0;
  if (coupon.type === 'percentage') {
    amount = (subtotal * Number(coupon.value)) / 100;
    if (coupon.maxDiscount && Number(coupon.maxDiscount) > 0 && amount > Number(coupon.maxDiscount)) amount = Number(coupon.maxDiscount);
  } else {
    amount = Number(coupon.value);
  }
  if (!Number.isFinite(amount) || amount < 0) amount = 0;
  // Never more than the products cost
  return Math.round(Math.min(amount, subtotal) * 100) / 100;
}

/**
 * Inside the order's transaction: takes one use of the coupon (the row is
 * locked, so two orders cannot both take the last use) and remembers which
 * order used it, so a cancelled or deleted order can give the use back.
 */
async function redeemCoupon(tx: any, coupon: CouponRow, order: { id: number; orderNumber: string; phone: string; discount: number }) {
  const result: any = await tx.execute(
    sql`UPDATE coupons SET used_count = COALESCE(used_count, 0) + 1
        WHERE id = ${coupon.id} AND (usage_limit IS NULL OR usage_limit <= 0 OR COALESCE(used_count, 0) < usage_limit)`
  );
  const affected = Number(result?.[0]?.affectedRows ?? result?.affectedRows ?? 0);
  if (affected < 1) throw new Error(`Coupon ${coupon.code} has already been used the maximum number of times.`);
  try {
    await tx.execute(
      sql`INSERT INTO coupon_usages (coupon_id, coupon_code, order_id, order_number, customer_phone, discount)
          VALUES (${coupon.id}, ${coupon.code}, ${order.id}, ${order.orderNumber}, ${order.phone || null}, ${order.discount.toFixed(2)})`
    );
  } catch (error: any) {
    // The usage log is a record, not a gate: a missing table never blocks an order
    console.error('[coupon] usage log:', error?.message || error);
  }
}

/** Gives a coupon use back (order cancelled / deleted) or takes it again (re-opened) */
async function setCouponReleased(tx: any, orderId: number, released: boolean) {
  try {
    const result: any = await tx.execute(
      sql`SELECT id, coupon_id AS couponId, released FROM coupon_usages WHERE order_id = ${orderId} LIMIT 1 FOR UPDATE`
    );
    const row = sqlRows(result)[0];
    if (!row || Boolean(Number(row.released)) === released) return;
    if (released) {
      await tx.execute(sql`UPDATE coupons SET used_count = GREATEST(0, COALESCE(used_count, 0) - 1) WHERE id = ${row.couponId}`);
    } else {
      await tx.execute(sql`UPDATE coupons SET used_count = COALESCE(used_count, 0) + 1 WHERE id = ${row.couponId}`);
    }
    await tx.execute(sql`UPDATE coupon_usages SET released = ${released ? 1 : 0} WHERE id = ${row.id}`);
  } catch (error: any) {
    console.error('[coupon] release:', error?.message || error);
  }
}

app.post('/api/coupons/validate', async (req, res) => {
  try {
    const { code, subtotal } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Coupon code is required' });
    }

    const found = await db
      .select()
      .from(coupons)
      .where(eq(coupons.code, code.toUpperCase().trim().slice(0, 64)))
      .limit(1);

    if (found.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired coupon code' });
    }

    const coupon = found[0];
    const numSubtotal = Math.max(0, Number(subtotal) || 0);
    const problem = couponProblem(coupon, numSubtotal);
    if (problem) return res.status(400).json({ error: problem });

    res.json({
      valid: true,
      code: coupon.code,
      discount: couponDiscount(coupon, numSubtotal),
      type: coupon.type,
      value: coupon.value,
      minOrder: Number(coupon.minOrder) || 0,
      maxDiscount: coupon.maxDiscount ? Number(coupon.maxDiscount) : null,
    });
  } catch (error: any) {
    console.error('Failed to validate coupon:', error);
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
});

// Place Order (Public eCommerce Checkout with DB Transaction & Server-side validation)
/**
 * v3.9 — locks every product row an order touches, always in id order, before
 * the stock is read. Two orders for the same products then queue one after the
 * other instead of overwriting each other's stock (or deadlocking).
 */
export async function lockProductRows(tx: any, ids: any[]) {
  const list = Array.from(new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))).sort((a, b) => a - b);
  if (list.length === 0) return;
  await tx.select({ id: products.id }).from(products).where(inArray(products.id, list)).orderBy(asc(products.id)).for('update');
}

app.post('/api/orders', async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      paymentMethod,
      transactionId,
      senderNumber,
      notes,
      items, // array of { productId, quantity }
      couponCode,
      landingPageId,
    } = req.body;
    let shippingZone = req.body?.shippingZone;
    let customerAddress = req.body?.customerAddress;

    if (!customerName || !customerPhone || !customerAddress) {
      return res.status(400).json({ error: 'Name, phone and address are required' });
    }

    // v3.9 — district & thana (when switched on): checked against the real
    // list, kept on the order and added to the delivery address; with
    // automatic delivery charges the delivery area follows the district.
    let orderDistrict: string | null = null;
    let orderThana: string | null = null;
    {
      const geo = cleanGeoConfig(await readJsonSetting<any>('checkout_geo_config', DEFAULT_CHECKOUT_GEO));
      if (geo.enabled) {
        const district = findDistrict(req.body?.district);
        if (!district) return res.status(400).json({ error: 'Please choose your district (জেলা).' });
        const thanaRaw = String(req.body?.thana || '').trim();
        if (thanaRaw && !districtHasThana(district, thanaRaw)) {
          return res.status(400).json({ error: 'Please choose a thana / upazila from the list.' });
        }
        if (geo.requireThana && !thanaRaw) return res.status(400).json({ error: 'Please choose your thana / upazila (থানা).' });
        orderDistrict = district.n;
        const thanaEntry = district.t.find(([en, bn]) => en.toLowerCase() === thanaRaw.toLowerCase() || bn === thanaRaw);
        orderThana = thanaEntry ? thanaEntry[0] : null;
        const tail = [orderThana, orderDistrict].filter(Boolean).join(', ');
        const address = String(customerAddress).trim();
        if (tail && !address.toLowerCase().includes(String(orderDistrict).toLowerCase())) customerAddress = `${address}, ${tail}`;
        if (geo.autoShipping) {
          try {
            const zoneRow = await db.select().from(siteSettings).where(eq(siteSettings.key, 'shipping'));
            const allZones: any[] = zoneRow.length > 0 ? JSON.parse(zoneRow[0].value)?.zones || [] : [];
            const auto = zoneForPlace(geo, allZones, orderDistrict, orderThana);
            if (auto) shippingZone = auto;
          } catch {
            /* keep the area the customer picked */
          }
        }
      }
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Closed for maintenance: no website orders (the shop's own conversions and
    // the owner's preview still work)
    if (req.headers['x-internal-order-key'] !== INTERNAL_ORDER_KEY && !hasMaintenancePreview(req)) {
      const maintenance = (await maintenanceState()).maintenance_config || {};
      if (maintenance.enabled) {
        return res.status(503).json({ error: 'The shop is closed for maintenance right now. Please try again soon.', maintenance: true });
      }
    }

    // Wholesale pricing is decided here, from the signed session only.
    const buyer = await wholesaleBuyer(req);
    // v3.10 — an order placed while signed in belongs to that account, whatever
    // phone number is typed at checkout (a gift, another number …). It used to
    // be filed under the typed number only, so "My Orders" stayed empty.
    const signedInCustomer = buyer || (await sessionCustomer(req).catch(() => null));
    const accountOwner = signedInCustomer && signedInCustomer.status !== 'blocked' ? signedInCustomer : null;

    // --- Abuse control -----------------------------------------------------
    // A blocked device IP, or a customer the admin blocked, cannot place orders.
    const orderIp = clientIp(req);
    const orderAgent = String(req.headers['user-agent'] || '').slice(0, 500);

    if (orderIp) {
      const banned = await db.select().from(blockedIps).where(eq(blockedIps.ip, orderIp)).limit(1);
      if (banned.length > 0) {
        return res.status(403).json({
          error: 'Sorry, ordering has been blocked from your device.',
          blocked: true,
          reason: banned[0].note || null,
        });
      }
    }

    const cleanOrderPhone = String(customerPhone || '').replace(/[\s-]+/g, '').trim();
    if (cleanOrderPhone) {
      const blockedCustomer = await db
        .select()
        .from(customers)
        .where(eq(customers.phone, cleanOrderPhone))
        .limit(1);
      if (blockedCustomer.length > 0 && blockedCustomer[0].status === 'blocked') {
        return res.status(403).json({
          error: 'Sorry, ordering has been blocked for your account.',
          blocked: true,
          reason: blockedCustomer[0].note || null,
        });
      }
    }

    // Payment method must be one the admin has actually enabled. Without this a
    // crafted request could place an order using a disabled or unknown method.
    try {
      const payRow = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, 'payment'));

      const configuredMethods: Array<{ id: string; enabled?: boolean }> =
        payRow.length > 0 ? JSON.parse(payRow[0].value)?.methods || [] : [];
      const onlineMethods = await enabledGatewayIds();

      if ((GATEWAY_IDS as string[]).includes(paymentMethod)) {
        // SSLCommerz / bKash / Nagad: only when switched on and fully set up
        if (!onlineMethods.includes(paymentMethod)) {
          return res.status(400).json({ error: 'This payment method is currently unavailable.' });
        }
      } else if (configuredMethods.length > 0) {
        const allowed = configuredMethods.filter((m) => m.enabled !== false).map((m) => m.id);
        if (!allowed.includes(paymentMethod)) {
          return res.status(400).json({ error: 'This payment method is currently unavailable.' });
        }
      }
    } catch (err) {
      console.error('Failed to validate payment method:', err);
    }
    const isOnlinePayment = (GATEWAY_IDS as string[]).includes(paymentMethod);

    // Landing page orders: the page's own delivery rules, and only its products
    const landing = landingPageId ? await loadLandingForOrder(Number(landingPageId)) : null;
    if (landingPageId && !landing) {
      return res.status(400).json({ error: 'This offer is no longer available. Please refresh the page.' });
    }
    const freeShippingRules = await readJsonSetting<FreeShippingRules>('free_shipping_config', DEFAULT_FREE_SHIPPING_CONFIG);

    // Shipping charge comes from Dashboard -> Store & Gateways -> Shipping zones.
    // (It used to be hardcoded here, so changing a zone's charge in the dashboard
    //  had no effect on the amount the customer was actually billed.)
    let shippingCharge = 0;
    let resolvedZoneName = '';
    let resolvedZone: { id: string; name: string; charge: number } | null = null;
    let shippingResult: ReturnType<typeof computeShipping> | null = null;
    // v3.11 — Dashboard → Checkout → Delivery off: no delivery area, no charge
    const checkoutCfg = await readJsonSetting<any>('checkout_config', {});
    const deliveryOff = checkoutCfg?.deliveryEnabled === false;
    if (!deliveryOff) try {
      const zoneRow = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, 'shipping'));

      const allZones: Array<{ id: string; name: string; charge: number; enabled?: boolean }> =
        zoneRow.length > 0 ? JSON.parse(zoneRow[0].value)?.zones || [] : [];

      // A zone the admin switched off must not be usable, even via a direct API call
      const zones = allZones.filter((z) => z.enabled !== false);

      const match = zones.find(
        (z) =>
          z.id === shippingZone ||
          z.name === shippingZone ||
          z.id?.toLowerCase() === String(shippingZone || '').toLowerCase()
      );

      if (match) {
        shippingCharge = Number(match.charge) || 0;
        // Store the human name, not the internal id — the thank-you page,
        // invoice and order list all display this verbatim.
        resolvedZoneName = match.name || String(shippingZone || '');
        resolvedZone = { id: match.id, name: match.name, charge: shippingCharge };
      } else if (zones.length > 0) {
        shippingCharge = Number(zones[0].charge) || 0;
        resolvedZoneName = zones[0].name || '';
        resolvedZone = { id: zones[0].id, name: zones[0].name, charge: shippingCharge };
      }
    } catch (err) {
      console.error('Failed to resolve shipping zone, falling back to 0:', err);
    }

    // Transaction to safely verify stock, calculate real prices, insert order, update inventory
    const newOrder = await db.transaction(async (tx) => {
      let calculatedSubtotal = 0;
      const orderItemsToInsert: any[] = [];
      const stockUpdates: { id: number; newStock: number; qty: number }[] = [];
      /** Variation rows to decrement, kept separate from the parent product row. */
      const variationUpdates: { id: number; newStock: number }[] = [];
      // Running totals so several lines of one product are checked cumulatively.
      const runningProductStock = new Map<number, number>();
      const runningVariationStock = new Map<number, number>();
      /** Wholesale min/max limits apply to a product's total across its option lines */
      const wholesaleQty = new Map<number, { name: string; qty: number; min: number | null; max: number | null }>();
      /** Per-line delivery facts for the shipping rules (free delivery, own charge) */
      const shippingLines: Array<{ quantity: number; lineTotal: number; freeShipping: boolean; charges: Record<string, number> | null }> = [];
      const landingLinks = new Map((landing?.products || []).map((link) => [Number(link.productId), link]));
      await lockProductRows(tx, items.map((item: any) => item.productId));

      for (const item of items) {
        // v3.9 — row lock: two checkouts at the same moment cannot both take the last piece
        const prodRows = await tx
          .select()
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1)
          .for('update');

        if (prodRows.length === 0) {
          throw new Error(`Product with ID ${item.productId} not found`);
        }

        const prod = prodRows[0];
        // Whole, positive quantities only. A negative quantity used to pass the
        // stock check and subtract from the order total.
        const reqQty = Math.floor(Number(item.quantity));
        if (!Number.isFinite(reqQty) || reqQty < 1 || reqQty > 100000) {
          throw new Error(`Invalid quantity for "${prod.name}".`);
        }
        if (prod.status !== 'active') {
          throw new Error(`"${prod.name}" is no longer available.`);
        }
        if (landing && !landingLinks.has(prod.id)) {
          throw new Error(`"${prod.name}" is not part of this offer.`);
        }
        if (buyer) {
          // A wholesale cart holds wholesale products only — never mixed
          if (!isWholesaleProduct(prod)) {
            throw new Error(`"${prod.name}" is not available on wholesale. Remove it from your cart to continue.`);
          }
          const entry = wholesaleQty.get(prod.id) || {
            name: prod.name,
            qty: 0,
            min: prod.wholesaleMinQty ?? null,
            max: prod.wholesaleMaxQty ?? null,
          };
          entry.qty += reqQty;
          wholesaleQty.set(prod.id, entry);
        }

        // A variation carries its own stock and (optionally) its own price, so
        // when one is picked the check and the charge both come from that row.
        let variation: typeof productVariations.$inferSelect | null = null;
        if (item.variationId) {
          const varRows = await tx
            .select()
            .from(productVariations)
            .where(
              and(
                eq(productVariations.id, Number(item.variationId)),
                eq(productVariations.productId, prod.id)
              )
            )
            .limit(1)
            .for('update');
          if (varRows.length === 0) {
            throw new Error(`Selected option for "${prod.name}" is no longer available`);
          }
          variation = varRows[0];
          if (variation.status !== 'active') {
            throw new Error(`"${prod.name} — ${variation.label}" is not available`);
          }
          const offered = landingLinks.get(prod.id)?.variationIds;
          if (landing && Array.isArray(offered) && offered.length > 0 && !offered.map(Number).includes(variation.id)) {
            throw new Error(`"${prod.name} — ${variation.label}" is not part of this offer.`);
          }
          const varAvailable = runningVariationStock.has(variation.id)
            ? (runningVariationStock.get(variation.id) as number)
            : Number(variation.stock);
          if (varAvailable < reqQty) {
            throw new Error(
              `Insufficient stock for "${prod.name} — ${variation.label}". Only ${varAvailable} left.`
            );
          }
          runningVariationStock.set(variation.id, varAvailable - reqQty);
        } else if (prod.hasVariations) {
          throw new Error(`Please choose an option for "${prod.name}"`);
        }

        const prodAvailable = runningProductStock.has(prod.id)
          ? (runningProductStock.get(prod.id) as number)
          : Number(prod.stock);
        if (!variation && prodAvailable < reqQty) {
          throw new Error(`Insufficient stock for "${prod.name}". Only ${prodAvailable} left.`);
        }
        runningProductStock.set(prod.id, Math.max(0, prodAvailable - reqQty));

        const positive = (value: any) => (value != null && Number(value) > 0 ? Number(value) : null);
        const unitPrice = buyer
          ? variation && positive(variation.wholesalePrice)
            ? Number(variation.wholesalePrice)
            : Number(prod.wholesalePrice)
          : variation
          ? positive(variation.salePrice) ?? positive(variation.price) ?? positive(prod.salePrice) ?? Number(prod.price)
          : positive(prod.salePrice) ?? Number(prod.price);
        const itemSubtotal = unitPrice * reqQty;
        calculatedSubtotal += itemSubtotal;
        shippingLines.push({
          quantity: reqQty,
          lineTotal: itemSubtotal,
          freeShipping: Boolean(prod.freeShipping),
          charges: parseCharges(prod.shippingCharges),
        });

        orderItemsToInsert.push({
          productId: prod.id,
          productName: prod.name,
          sku: variation?.sku || prod.sku,
          variationId: variation ? variation.id : null,
          variationLabel: variation ? variation.label : null,
          unitPrice: unitPrice.toFixed(2),
          quantity: reqQty,
          subtotal: itemSubtotal.toFixed(2),
          batchNumber: prod.batchNumber,
          expiryDate: prod.expiryDate,
        });

        // The parent row always mirrors total stock, so it is decremented for
        // variation sales too and the product list stays truthful.
        stockUpdates.push({
          id: prod.id,
          newStock: runningProductStock.get(prod.id) as number,
          qty: reqQty,
        });
      }

      for (const [id, newStock] of runningVariationStock) variationUpdates.push({ id, newStock });

      for (const entry of wholesaleQty.values()) {
        if (entry.min && entry.qty < entry.min) {
          throw new Error(`Minimum wholesale quantity for "${entry.name}" is ${entry.min}.`);
        }
        if (entry.max && entry.qty > entry.max) {
          throw new Error(`Maximum wholesale quantity for "${entry.name}" is ${entry.max}.`);
        }
      }

      // Calculate coupon discount server-side (v3.11: expiry and usage limit
      // are enforced; a coupon that stopped working since it was applied is
      // reported instead of being dropped silently, so the total never jumps)
      let discount = 0;
      let appliedCoupon: CouponRow | null = null;
      const couponText = typeof couponCode === 'string' ? couponCode.toUpperCase().trim().slice(0, 64) : '';
      if (couponText) {
        const foundCoupon = await tx.select().from(coupons).where(eq(coupons.code, couponText)).limit(1).for('update');
        if (foundCoupon.length === 0) {
          throw new Error(`Coupon ${couponText} is not valid any more. Remove it and place the order again.`);
        }
        const problem = couponProblem(foundCoupon[0], calculatedSubtotal);
        if (problem) throw new Error(`${problem} Remove it and place the order again.`);
        appliedCoupon = foundCoupon[0];
        discount = couponDiscount(appliedCoupon, calculatedSubtotal);
      }

      // Delivery: zone charge, per-product charges, free-delivery rules and the
      // landing page's own rules — the same code the checkout page displays.
      shippingResult = deliveryOff
        ? computeShipping({ zone: null, lines: [], rules: null })
        : computeShipping({
            zone: resolvedZone,
            lines: shippingLines,
            rules: freeShippingRules,
            landing: landing?.shipping || null,
            wholesale: Boolean(buyer),
          });
      shippingCharge = shippingResult.charge;

      const grandTotal = Math.max(0, calculatedSubtotal - discount + shippingCharge);

      // Find or create customer. A wholesale order always belongs to the
      // signed-in wholesale account, whatever phone number was typed.
      let customerId: number | null = null;
      const existingCust = accountOwner
        ? await tx.select().from(customers).where(eq(customers.id, accountOwner.id)).limit(1)
        : await tx
            .select()
            .from(customers)
            .where(eq(customers.phone, customerPhone.trim()))
            .limit(1);

      if (existingCust.length > 0) {
        customerId = existingCust[0].id;
        await tx
          .update(customers)
          .set({
            totalOrders: (existingCust[0].totalOrders || 0) + 1,
            totalSpent: (Number(existingCust[0].totalSpent || 0) + grandTotal).toFixed(2),
            // A signed-in customer keeps the address saved in their account
            address: accountOwner && existingCust[0].address ? existingCust[0].address : customerAddress,
            lastIp: orderIp || existingCust[0].lastIp || null,
            // v3.12 — an account made with Google / Facebook has no phone yet: take the order's
            ...(accountOwner && !String(existingCust[0].phone || '').trim() && /^01[3-9]\d{8}$/.test(cleanOrderPhone)
              ? { phone: cleanOrderPhone }
              : {}),
          })
          .where(eq(customers.id, customerId));
      } else {
        const newCust = await insertReturning(tx, customers, {
            name: customerName.trim(),
            phone: customerPhone.trim(),
            address: customerAddress.trim(),
            totalOrders: 1,
            totalSpent: grandTotal.toFixed(2),
            lastIp: orderIp || null,
          });
        customerId = newCust[0].id;
      }

      // Sequential order number (ORD-1001, ORD-1002 …)
      const orderNumber = await nextOrderNumber(tx, 'ORD');

      // Insert Order
      const insertedOrder = await insertReturning(tx, orders, {
          orderNumber,
          source: 'web',
          customerId,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerAddress: customerAddress.trim(),
          subtotal: calculatedSubtotal.toFixed(2),
          discount: discount.toFixed(2),
          shippingCharge: shippingCharge.toFixed(2),
          tax: '0.00',
          total: grandTotal.toFixed(2),
          paymentMethod: paymentMethod || 'cod',
          // Online gateways: "pending" until the gateway confirms the money
          paymentStatus: isOnlinePayment ? 'pending' : 'unpaid',
          orderStatus: 'pending',
          shippingZone: deliveryOff ? null : resolvedZoneName || (typeof shippingZone === 'string' ? shippingZone.slice(0, 100) : '') || null,
          district: orderDistrict,
          thana: orderThana,
          transactionId: transactionId || null,
          senderNumber: senderNumber || null,
          notes: notes || null,
          ipAddress: orderIp || null,
          userAgent: orderAgent || null,
          isWholesale: Boolean(buyer),
          landingPageId: landing ? landing.id : null,
          landingPageName: landing ? String(landing.title).slice(0, 191) : null,
        });

      const createdOrder = insertedOrder[0];

      if (appliedCoupon && discount > 0) {
        await redeemCoupon(tx, appliedCoupon, { id: createdOrder.id, orderNumber, phone: customerPhone.trim(), discount });
      }

      // Insert Order Items & Update Stock & Record Inventory Log
      for (const item of orderItemsToInsert) {
        await tx.insert(orderItems).values({
          orderId: createdOrder.id,
          ...item,
        });
      }

      for (const varUpdate of variationUpdates) {
        await tx
          .update(productVariations)
          .set({ stock: varUpdate.newStock })
          .where(eq(productVariations.id, varUpdate.id));
      }

      for (const update of stockUpdates) {
        await tx
          .update(products)
          .set({ stock: update.newStock })
          .where(eq(products.id, update.id));

        await tx.insert(inventoryTransactions).values({
          productId: update.id,
          type: 'sale',
          quantity: -update.qty,
          previousStock: update.newStock + update.qty,
          newStock: update.newStock,
          reference: orderNumber,
          notes: `Web Store Order #${orderNumber}`,
          performedBy: 'Online Storefront',
        });
      }

      return createdOrder;
    });

    // The visitor finished after all: close out their abandoned-checkout row so
    // it drops off the Incomplete Orders list instead of lingering there.
    try {
      const sessionKey = String(req.body?.checkoutSessionKey || '').trim();
      const matchBy = sessionKey
        ? eq(abandonedCheckouts.sessionKey, sessionKey)
        : eq(abandonedCheckouts.customerPhone, String(customerPhone || '').trim());
      await db
        .update(abandonedCheckouts)
        .set({ status: 'recovered', recoveredOrderId: newOrder.id })
        .where(and(matchBy, eq(abandonedCheckouts.status, 'active')));
    } catch (err) {
      console.error('Could not close the abandoned checkout row:', err);
    }

    // Items as saved, so the thank-you page, tracking and invoice all agree
    let savedItems: any[] = [];
    try {
      savedItems = await attachItemImages(
        await db.select().from(orderItems).where(eq(orderItems.orderId, newOrder.id))
      );
    } catch {
      savedItems = [];
    }
    // Orders the shop enters itself (converted checkouts) are not website conversions
    if (req.headers['x-internal-order-key'] !== INTERNAL_ORDER_KEY) {
      void sendPurchaseToCapi(req, newOrder, savedItems);
    }
    void notifySmsEvent('order_placed', { order: newOrder });
    void autoFraudCheck(newOrder.customerPhone, Number(newOrder.total) || 0);
    void notifySmsEvent('admin_new_order', { order: newOrder });
    if (landing) void countLandingOrder(landing.id);

    res.json({
      success: true,
      order: { ...newOrder, items: savedItems },
      shipping: shippingResult,
      // The checkout sends the customer on to the gateway for these
      payment: isOnlinePayment ? { gateway: paymentMethod, init: `/api/payments/${paymentMethod}/init` } : null,
    });
  } catch (error: any) {
    console.error('Failed to create order:', error);
    res.status(400).json({ error: error.message || 'Failed to place order' });
  }
});

/**
 * Public invoice payload. A customer can only pull their own invoice: the order
 * number alone is not enough, the phone number on the order must match too.
 */
/**
 * Everything an invoice needs from settings: the invoice block, the shop's
 * details, its logo (the invoice logo, else the website logo) and the names of
 * its payment methods (never account numbers or credentials).
 */
async function readInvoiceSettings(): Promise<{ invoiceConfig: any; general: any }> {
  const settingRows = await db
    .select()
    .from(siteSettings)
    .where(inArray(siteSettings.key, ['invoice_config', 'general', 'logo_config', 'payment']));
  let invoiceConfig: any = DEFAULT_INVOICE_CONFIG;
  let general: any = {};
  let logo: any = {};
  let payment: any = {};
  for (const row of settingRows) {
    try {
      if (row.key === 'invoice_config') invoiceConfig = { ...DEFAULT_INVOICE_CONFIG, ...JSON.parse(row.value) };
      if (row.key === 'general') general = JSON.parse(row.value) || {};
      if (row.key === 'logo_config') logo = JSON.parse(row.value) || {};
      if (row.key === 'payment') payment = JSON.parse(row.value) || {};
    } catch {
      /* keep defaults */
    }
  }
  const methods = Array.isArray(payment?.methods) ? payment.methods : [];
  return {
    invoiceConfig,
    general: {
      ...general,
      logoUrl: logo.desktopLogoUrl || logo.mobileLogoUrl || '',
      paymentMethods: methods.map((method: any) => ({ id: String(method?.id || ''), name: String(method?.name || '') })),
    },
  };
}

app.get('/api/orders/:orderNumber/invoice', async (req, res) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim();
    const phone = String(req.query.phone || '').replace(/[\s-]+/g, '').trim();
    if (!orderNumber) return res.status(400).json({ error: 'Order number is required.' });

    const rows = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const token = readSession(getBearer(req));
    const session = token && (token.role === 'admin' || token.role === 'staff') ? await resolveLiveSession(token).catch(() => null) : null;
    const isStaff = Boolean(session && (session.role === 'admin' || hasModule(session, 'orders', 'pos', 'customers')));
    if (!isStaff && order.customerPhone.replace(/[\s-]+/g, '') !== phone) {
      return res.status(403).json({ error: 'You do not have permission to view this invoice.' });
    }

    // Join the product image so the thank-you page can show what was bought
    const items = await db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        productName: orderItems.productName,
        variationLabel: orderItems.variationLabel,
        sku: orderItems.sku,
        unitPrice: orderItems.unitPrice,
        quantity: orderItems.quantity,
        subtotal: orderItems.subtotal,
        batchNumber: orderItems.batchNumber,
        expiryDate: orderItems.expiryDate,
        image: products.image,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, order.id));

    const { invoiceConfig, general } = await readInvoiceSettings();
    res.json({
      order: { ...order, paymentMethodLabel: paymentMethodLabel(order.paymentMethod, general.paymentMethods) },
      items,
      invoiceConfig,
      general,
    });
  } catch (error: any) {
    console.error('invoice:', error);
    res.status(500).json({ error: 'Could not load invoice.' });
  }
});

/**
 * Meta Conversions API relay.
 *
 * The browser pixel and this server event carry the SAME eventID, which is how
 * Meta merges them into one conversion instead of counting two. The access
 * token never leaves the server. Failures are swallowed on purpose: tracking
 * must never be able to break a checkout.
 */
/**
 * Graph API version for the Conversions API. v19.0 (the old value) is past its
 * end of life, and Meta rejects calls to retired Marketing API versions, so
 * every server event was silently failing. Kept in one constant so the next
 * upgrade is a one-line change.
 */
const META_GRAPH_VERSION = 'v25.0';

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** Cookie value from the raw header (no cookie-parser dependency) */
export function readCookie(req: express.Request, name: string): string {
  const header = String(req.headers.cookie || '');
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return rest.join('=');
      }
    }
  }
  return '';
}

/** Bangladeshi mobile in the E.164 digits Meta hashes: 01712345678 -> 8801712345678 */
function normalisePhoneForMeta(raw: any): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('0')) return `88${digits}`;
  if (digits.length === 10 && digits.startsWith('1')) return `880${digits}`;
  return digits;
}

interface CapiUser {
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  externalId?: string | number | null;
}

/** v3.15 — read once per 30 s, not once per tracked event (cleared when the settings are saved) */
let marketingCache: { at: number; value: any } | null = null;
export function forgetMarketingSettings() {
  marketingCache = null;
}
async function readMarketingSettings(): Promise<any> {
  if (marketingCache && Date.now() - marketingCache.at < 30_000) return marketingCache.value;
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'marketing'));
  let value: any = {};
  try {
    value = rows.length > 0 ? JSON.parse(rows[0].value) || {} : {};
  } catch {
    value = {};
  }
  marketingCache = { at: Date.now(), value };
  return value;
}

/**
 * Sends one event to Meta's Conversions API. Matching quality depends on
 * user_data: the browser's _fbp/_fbc cookies (sent as-is) plus hashed phone,
 * email, name and a stable external id whenever we know them. Never throws —
 * tracking must never break a page or an order.
 */
async function sendCapiEvent(
  req: express.Request,
  event: {
    eventName: string;
    eventId: string;
    eventSourceUrl?: string;
    customData?: Record<string, any>;
    user?: CapiUser;
    fbp?: string;
    fbc?: string;
  },
  /** v3.15 — browse events (PageView, AddToCart …) wait up to ~2 s and go to Meta together */
  batched = false
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  try {
    const marketing = await readMarketingSettings();
    const pixelId = String(marketing.metaPixelId || '').trim();
    const token = String(marketing.metaConversionsToken || '').trim();
    if (!pixelId || !token) return { ok: false, skipped: 'not configured' };

    const userData: Record<string, any> = {
      client_ip_address: clientIp(req) || undefined,
      client_user_agent: String(req.headers['user-agent'] || '') || undefined,
    };
    const fbp = event.fbp || readCookie(req, '_fbp');
    const fbc = event.fbc || readCookie(req, '_fbc');
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;

    const user = event.user || {};
    const phone = normalisePhoneForMeta(user.phone);
    if (phone) userData.ph = [sha256(phone)];
    const email = String(user.email || '').trim().toLowerCase();
    if (email && email.includes('@')) userData.em = [sha256(email)];
    const nameParts = String(user.name || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (nameParts.length > 0) userData.fn = [sha256(nameParts[0])];
    if (nameParts.length > 1) userData.ln = [sha256(nameParts[nameParts.length - 1])];
    if (user.externalId != null && String(user.externalId)) {
      userData.external_id = [sha256(String(user.externalId))];
    }
    if (phone || email) userData.country = [sha256('bd')];

    const body: any = {
      data: [
        {
          event_name: String(event.eventName),
          event_time: Math.floor(Date.now() / 1000),
          event_id: String(event.eventId),
          event_source_url: event.eventSourceUrl || undefined,
          action_source: 'website',
          user_data: userData,
          custom_data: event.customData && typeof event.customData === 'object' ? event.customData : {},
        },
      ],
    };
    if (marketing.metaTestEventCode) body.test_event_code = String(marketing.metaTestEventCode).trim();
    if (batched) {
      queueCapiEvent(pixelId, token, body.test_event_code, body.data[0]);
      return { ok: true };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(
      `${process.env.META_GRAPH_BASE || 'https://graph.facebook.com'}/${META_GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    ).catch(() => null);
    clearTimeout(timer);

    if (!response) return { ok: false, error: 'Meta unreachable' };
    if (!response.ok) {
      const data: any = await response.json().catch(() => ({}));
      const message = data?.error?.message || `HTTP ${response.status}`;
      console.error(`[capi] ${event.eventName} rejected by Meta: ${message}`);
      return { ok: false, error: message };
    }
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'failed' };
  }
}

/**
 * v3.15 — browse events from many visitors are sent to Meta in one request
 * (up to 500 at a time, at most every 2 seconds) instead of one request per
 * page view, which kept a busy server opening thousands of connections to
 * Meta. Purchase is never queued: it goes out at once from the order route.
 */
const capiQueue: Array<{ pixelId: string; token: string; testCode?: string; event: any }> = [];
let capiFlushTimer: NodeJS.Timeout | null = null;
function queueCapiEvent(pixelId: string, token: string, testCode: string | undefined, event: any) {
  // A burst bigger than Meta can take in time: drop the oldest rather than grow without end
  if (capiQueue.length >= 5000) capiQueue.shift();
  capiQueue.push({ pixelId, token, testCode, event });
  if (capiQueue.length >= 500) void flushCapiQueue();
  else if (!capiFlushTimer) capiFlushTimer = setTimeout(() => void flushCapiQueue(), 2000);
}
async function flushCapiQueue() {
  if (capiFlushTimer) {
    clearTimeout(capiFlushTimer);
    capiFlushTimer = null;
  }
  while (capiQueue.length > 0) {
    const first = capiQueue[0];
    // One request per pixel / token / test code, 500 events at most
    const batch: any[] = [];
    for (let i = 0; i < capiQueue.length && batch.length < 500; ) {
      const item = capiQueue[i];
      if (item.pixelId === first.pixelId && item.token === first.token && item.testCode === first.testCode) {
        batch.push(item.event);
        capiQueue.splice(i, 1);
      } else i += 1;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(
        `${process.env.META_GRAPH_BASE || 'https://graph.facebook.com'}/${META_GRAPH_VERSION}/${encodeURIComponent(first.pixelId)}/events?access_token=${encodeURIComponent(first.token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: batch, ...(first.testCode ? { test_event_code: first.testCode } : {}) }),
          signal: controller.signal,
        }
      ).catch(() => null);
      clearTimeout(timer);
      if (response && !response.ok) {
        const data: any = await response.json().catch(() => ({}));
        console.error(`[capi] batch of ${batch.length} rejected by Meta: ${data?.error?.message || `HTTP ${response.status}`}`);
      }
    } catch {
      /* tracking never affects the shop */
    }
  }
}

/** v3.15 — the relay is public: at most 120 events a minute from one device */
const capiRelayHits = new Map<string, { count: number; since: number }>();
function capiRelayAllowed(ip: string): boolean {
  const now = Date.now();
  const entry = capiRelayHits.get(ip);
  if (!entry || now - entry.since > 60_000) {
    if (capiRelayHits.size > 20_000) capiRelayHits.clear();
    capiRelayHits.set(ip, { count: 1, since: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= 120;
}

/** Events the browser may mirror. Purchase is sent by the order route itself. */
const RELAYABLE_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'ViewCategory',
  'Search',
  'AddToCart',
  'AddToWishlist',
  'InitiateCheckout',
  'AddPaymentInfo',
  'Contact',
  'CompleteRegistration',
  'Lead',
]);

app.post('/api/track/capi', async (req, res) => {
  try {
    const { eventName, eventId, eventSourceUrl, payload, fbp, fbc } = req.body || {};
    if (!eventName || !eventId) return res.json({ ok: false, skipped: 'missing event' });
    if (!RELAYABLE_EVENTS.has(String(eventName))) return res.json({ ok: false, skipped: 'not relayed' });
    if (!capiRelayAllowed(clientIp(req) || 'unknown')) return res.json({ ok: false, skipped: 'too many events' });

    // A signed-in customer's own details improve Meta's match rate
    let user: CapiUser = {};
    try {
      const customer = await sessionCustomer(req);
      if (customer) {
        user = { phone: customer.phone, email: customer.email, name: customer.name, externalId: customer.id };
      }
    } catch {
      /* anonymous visitor */
    }

    const result = await sendCapiEvent(req, {
      eventName: String(eventName),
      eventId: String(eventId).slice(0, 100),
      eventSourceUrl: typeof eventSourceUrl === 'string' ? eventSourceUrl.slice(0, 1000) : undefined,
      customData: payload && typeof payload === 'object' ? payload : {},
      user,
      fbp: typeof fbp === 'string' ? fbp.slice(0, 200) : undefined,
      fbc: typeof fbc === 'string' ? fbc.slice(0, 300) : undefined,
    }, true);
    res.json(result);
  } catch {
    // Never surface a tracking failure to the storefront
    res.json({ ok: false });
  }
});

/**
 * Server-side Purchase. Sent straight from the order route, so it is counted
 * even when an ad blocker stops the browser pixel. It uses the order number as
 * event_id — the same id the browser pixel uses — so Meta merges the two into
 * one conversion.
 */
async function sendPurchaseToCapi(req: express.Request, order: any, lines: any[]) {
  try {
    let currency = 'BDT';
    try {
      const generalRow = await db.select().from(siteSettings).where(eq(siteSettings.key, 'general'));
      const code = generalRow.length > 0 ? String(JSON.parse(generalRow[0].value)?.currencyCode || '') : '';
      if (/^[A-Z]{3}$/i.test(code)) currency = code.toUpperCase();
    } catch {
      /* default currency */
    }
    const contents = lines.map((line) => ({
      id: String(line.feedId || line.sku || line.productId),
      quantity: Number(line.quantity) || 1,
      item_price: Number(line.unitPrice) || 0,
    }));
    await sendCapiEvent(req, {
      eventName: 'Purchase',
      eventId: String(order.orderNumber),
      eventSourceUrl: String(req.headers.referer || '') || undefined,
      customData: {
        currency,
        value: Number(order.total) || 0,
        content_type: 'product',
        content_ids: contents.map((item) => item.id),
        contents,
        num_items: contents.reduce((sum, item) => sum + item.quantity, 0),
        order_id: String(order.orderNumber),
      },
      user: { phone: order.customerPhone, name: order.customerName, externalId: order.customerId },
    });
  } catch {
    /* never affects the order */
  }
}

/** Admin-only pixel self-check: is everything configured, and does Meta accept it? */
app.get('/api/admin/pixel/health', async (_req, res) => {
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'marketing'));
    let marketing: any = {};
    try {
      marketing = rows.length > 0 ? JSON.parse(rows[0].value) : {};
    } catch {
      marketing = {};
    }

    const checks = {
      pixelId: Boolean(marketing.metaPixelId),
      conversionsToken: Boolean(marketing.metaConversionsToken),
      testEventCode: Boolean(marketing.metaTestEventCode),
      gtmId: Boolean(marketing.gtmId),
      ga4Id: Boolean(marketing.ga4Id),
    };

    let capiReachable: boolean | null = null;
    let capiMessage = '';
    if (checks.pixelId && checks.conversionsToken) {
      try {
        const response = await fetch(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(marketing.metaPixelId)}?fields=id,name&access_token=${encodeURIComponent(marketing.metaConversionsToken)}`
        );
        const data: any = await response.json().catch(() => ({}));
        capiReachable = response.ok;
        capiMessage = response.ok
          ? `Connected to pixel “${data.name || marketing.metaPixelId}”`
          : data?.error?.message || 'Meta rejected the access token';
      } catch {
        capiReachable = null;
        capiMessage = 'Could not reach Meta from this server';
      }
    }

    res.json({ checks, capiReachable, capiMessage });
  } catch {
    res.status(500).json({ error: 'Could not check pixel status.' });
  }
});

// Order Tracking API (Public)
app.get('/api/orders/track', async (req, res) => {
  try {
    const { orderNumber, phone } = req.query;
    if (!orderNumber && !phone) {
      return res.status(400).json({ error: 'Please provide Order Number or Phone Number' });
    }

    const conditions: any[] = [];
    if (orderNumber && typeof orderNumber === 'string') {
      conditions.push(eq(orders.orderNumber, orderNumber.trim()));
    }
    if (phone && typeof phone === 'string') {
      conditions.push(eq(orders.customerPhone, phone.trim()));
    }

    const orderRows = await db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt))
      .limit(5);

    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'No order found with provided details' });
    }

    const targetOrder = orderRows[0];
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, targetOrder.id));

    res.json({
      order: targetOrder,
      items,
      allOrders: orderRows,
    });
  } catch (error: any) {
    console.error('Failed to track order:', error);
    res.status(500).json({ error: 'Failed to track order' });
  }
});

// Submit Product Review
/**
 * Anyone may review a product (Dashboard → Product Page decides whether
 * reviews are allowed and whether they wait for approval). One device may send
 * at most 5 reviews an hour and one per product a day, which stops spam
 * without asking shoppers to sign in.
 */
const reviewThrottle = new Map<string, number[]>();
app.post('/api/reviews', async (req, res) => {
  try {
    const config = await readJsonSetting('product_page_config', DEFAULT_PRODUCT_PAGE_CONFIG);
    if (config.allowReviews === false || config.showReviews === false) {
      return res.status(403).json({ error: 'Reviews are closed for now.' });
    }
    const productId = Number(req.body?.productId) || 0;
    const userName = String(req.body?.userName || req.body?.customerName || '').trim().slice(0, 100);
    const userPhone = String(req.body?.userPhone || '').replace(/[^0-9+]/g, '').slice(0, 20);
    const comment = String(req.body?.comment || '').trim().slice(0, 2000);
    const rating = Math.round(Number(req.body?.rating));
    if (!productId || !userName || !comment || !(rating >= 1 && rating <= 5)) {
      return res.status(400).json({ error: 'Please give a star rating, your name and a few words.' });
    }
    if (comment.length < 3) return res.status(400).json({ error: 'Please write a little more.' });
    if (/(https?:\/\/|www\.)/i.test(comment) && (comment.match(/https?:\/\/|www\./gi) || []).length > 1) {
      return res.status(400).json({ error: 'Links are not allowed in reviews.' });
    }

    const product = (await db.select({ id: products.id, status: products.status }).from(products).where(eq(products.id, productId)).limit(1))[0];
    if (!product || product.status !== 'active') return res.status(404).json({ error: 'Product not found.' });

    const ip = clientIp(req) || 'unknown';
    const now = Date.now();
    const recent = (reviewThrottle.get(ip) || []).filter((at) => now - at < 3600_000);
    if (recent.length >= 5) return res.status(429).json({ error: 'You have sent several reviews. Please try again later.' });
    const sameDay = await db.execute(
      sql`SELECT id FROM reviews WHERE product_id = ${productId} AND ip_address = ${ip} AND created_at > (NOW() - INTERVAL 1 DAY) LIMIT 1`
    );
    if ((Array.isArray((sameDay as any)?.[0]) ? (sameDay as any)[0] : []).length > 0) {
      return res.status(429).json({ error: 'You have already reviewed this product today. Thank you!' });
    }
    recent.push(now);
    reviewThrottle.set(ip, recent);
    if (reviewThrottle.size > 20000) reviewThrottle.clear();

    const status = config.reviewsRequireApproval ? 'pending' : 'approved';
    await db.insert(reviews).values({
      productId,
      userName,
      userPhone: userPhone || null,
      rating,
      comment,
      status,
      ipAddress: ip.slice(0, 64),
    });
    if (status === 'approved') await recalcProductRating(productId);
    else void notifyAdmin('review', 'New review waiting for approval', `${userName}: ${comment.slice(0, 120)}`, 'reviews');

    res.json({ success: true, pending: status === 'pending' });
  } catch (error: any) {
    console.error('Failed to submit review:', error);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// ==========================================
// 2. POS SYSTEM APIS (/pos)
// ==========================================

// Fast POS Product Search (by Name, Generic Name, SKU, Barcode, Category)
app.get('/api/pos/products', async (req, res) => {
  try {
    const { q, categoryId } = req.query;
    const conditions: any[] = [eq(products.status, 'active')];

    if (categoryId && categoryId !== 'all') {
      conditions.push(eq(products.categoryId, Number(categoryId)));
    }

    if (q && typeof q === 'string' && q.trim()) {
      const searchTerm = `%${q.trim()}%`;
      conditions.push(
        or(
          like(products.name, searchTerm),
          like(products.genericName, searchTerm),
          like(products.sku, searchTerm),
          like(products.barcode, searchTerm),
          // v3.7 — a variation's own barcode or SKU finds its product too
          sql`${products.id} IN (SELECT product_id FROM product_variations WHERE barcode LIKE ${searchTerm} OR sku LIKE ${searchTerm})`
        )
      );
    }

    // v3.14 — a whole category can be listed (the POS grid with a category chosen)
    const limit = Math.min(categoryId && categoryId !== 'all' ? 3000 : 500, Math.max(20, Number(req.query.limit) || 100));
    const data = await db
      .select({
        product: products,
        category: categories,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(asc(products.name))
      .limit(limit);

    const formatted = data.map((item) => ({
      ...item.product,
      categoryName: item.category?.name || 'General',
    }));

    res.json(formatted);
  } catch (error: any) {
    console.error('Failed to get POS products:', error);
    res.status(500).json({ error: 'Failed to fetch POS products' });
  }
});

/**
 * v3.7 — cash drawer log. The drawer is opened by the POS in the browser
 * (receipt printer, serial port or USB); every opening is recorded here with
 * who, when and why, so the owner can see drawer opens without a sale.
 */
const DRAWER_KINDS = ['sale', 'manual', 'test'];
app.post('/api/pos/drawer-events', async (req: any, res) => {
  try {
    const body = req.body || {};
    const kind = DRAWER_KINDS.includes(String(body.kind)) ? String(body.kind) : 'manual';
    const amount = Number(body.amount);
    const sessionId = Number(String(req.session?.sub || '').replace(/\D/g, '')) || null;
    await db.execute(
      sql`INSERT INTO pos_drawer_events (kind, reason, order_number, amount, method, ok, cashier, user_id, device)
          VALUES (${kind}, ${String(body.reason || '').slice(0, 191) || null}, ${String(body.orderNumber || '').slice(0, 64) || null},
                  ${Number.isFinite(amount) ? amount.toFixed(2) : null}, ${String(body.method || '').slice(0, 24) || null},
                  ${body.ok === false ? 0 : 1}, ${String(req.session?.name || body.cashier || '').slice(0, 100) || null},
                  ${sessionId}, ${String(body.device || '').slice(0, 100) || null})`
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error('drawer event:', error?.message || error);
    // Logging must never stand between a cashier and the drawer
    res.json({ success: false });
  }
});

app.get('/api/pos/drawer-events', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 30));
    const rows = sqlRows(
      await db.execute(
        sql`SELECT id, kind, reason, order_number AS orderNumber, amount, method, ok, cashier, device, created_at AS createdAt
            FROM pos_drawer_events ORDER BY id DESC LIMIT ${limit}`
      )
    );
    const today = sqlRows(
      await db.execute(
        sql`SELECT kind, COUNT(*) AS n FROM pos_drawer_events WHERE created_at >= ${zonedDayStart(shopDay())} GROUP BY kind`
      )
    );
    const counts: Record<string, number> = { sale: 0, manual: 0, test: 0 };
    today.forEach((row: any) => (counts[String(row.kind)] = Number(row.n) || 0));
    res.json({ events: rows.map((row: any) => ({ ...row, createdAt: utcIso(row.createdAt) })), today: counts });
  } catch (error: any) {
    res.json({ events: [], today: { sale: 0, manual: 0, test: 0 } });
  }
});

/**
 * v3.7 — one scan, one exact answer. A barcode printed on a variation adds
 * that exact option (size/colour) without the option picker; a product
 * barcode or SKU adds the product. Exact matches only, so a scan never adds
 * "something similar".
 */
app.get('/api/pos/scan', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim().slice(0, 100);
    if (!code) return res.status(400).json({ error: 'No code scanned.' });

    const productWithCategory = async (id: number) => {
      const rows = await db
        .select({ product: products, category: categories })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(and(eq(products.id, id), eq(products.status, 'active')))
        .limit(1);
      return rows[0] ? { ...rows[0].product, categoryName: rows[0].category?.name || 'General' } : null;
    };
    const variationOut = (row: typeof productVariations.$inferSelect) => ({
      id: row.id,
      label: row.label,
      sku: row.sku || '',
      barcode: row.barcode || '',
      price: row.price != null ? Number(row.price) : null,
      salePrice: row.salePrice != null ? Number(row.salePrice) : null,
      stock: Number(row.stock || 0),
      image: row.image || '',
    });

    // 1. A variation's own barcode
    const byVariationBarcode = await db
      .select()
      .from(productVariations)
      .where(and(eq(productVariations.barcode, code), eq(productVariations.status, 'active')))
      .limit(1);
    if (byVariationBarcode[0]) {
      const product = await productWithCategory(byVariationBarcode[0].productId);
      if (product) return res.json({ type: 'variation', product, variation: variationOut(byVariationBarcode[0]) });
    }

    // 2. A product barcode or SKU
    const byProduct = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.status, 'active'), or(eq(products.barcode, code), eq(products.sku, code))))
      .limit(1);
    if (byProduct[0]) {
      const product = await productWithCategory(byProduct[0].id);
      if (product) return res.json({ type: 'product', product });
    }

    // 3. A variation SKU
    const byVariationSku = await db
      .select()
      .from(productVariations)
      .where(and(eq(productVariations.sku, code), eq(productVariations.status, 'active')))
      .limit(1);
    if (byVariationSku[0]) {
      const product = await productWithCategory(byVariationSku[0].productId);
      if (product) return res.json({ type: 'variation', product, variation: variationOut(byVariationSku[0]) });
    }

    res.status(404).json({ error: `No product or option has the code ${code}.` });
  } catch (error: any) {
    console.error('pos scan:', error);
    res.status(500).json({ error: 'Could not look up the code.' });
  }
});

// POS Customers Search & List
app.get('/api/pos/customers', async (req, res) => {
  try {
    const { q } = req.query;
    let query = db.select().from(customers);
    if (q && typeof q === 'string' && q.trim()) {
      const term = `%${q.trim()}%`;
      query = query.where(or(like(customers.name, term), like(customers.phone, term))) as any;
    }
    const data = await query.orderBy(desc(customers.createdAt)).limit(50);
    res.json(data);
  } catch (error: any) {
    console.error('Failed to get customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// POS Create Customer Quick Action
app.post('/api/pos/customers', async (req, res) => {
  try {
    const { name, phone, email, address } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const inserted = await insertReturning(db, customers, {
        name: name.trim(),
        phone: phone.trim(),
        email: email ? email.trim() : null,
        address: address ? address.trim() : null,
      });

    res.json(inserted[0]);
  } catch (error: any) {
    console.error('Failed to create customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// POS "Hold Sale" — v3.9: kept in the database (pos_held_orders), so a server
// restart or a second till never loses a held bill.
const heldRow = (row: any) => {
  let items: any[] = [];
  try {
    items = JSON.parse(row.items || '[]');
  } catch {
    items = [];
  }
  return { id: row.id, customer: row.customer || 'Walk-in Customer', items, note: row.note || '', cashier: row.cashier || '', createdAt: row.created_at };
};

app.get('/api/pos/held-orders', async (_req, res) => {
  try {
    const rows = sqlRows(await db.execute(sql`SELECT * FROM pos_held_orders ORDER BY created_at ASC LIMIT 100`));
    res.json(rows.map(heldRow));
  } catch (error: any) {
    console.error('held orders:', error);
    res.json([]);
  }
});

app.post('/api/pos/hold-order', async (req: any, res) => {
  try {
    const { id, customer, items, note } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'The bill is empty.' });
    const holdId = String(id || `HOLD-${Date.now()}`).slice(0, 64);
    const customerName = typeof customer === 'string' ? customer : customer?.name || 'Walk-in Customer';
    await db.execute(sql`INSERT INTO pos_held_orders (id, customer, items, note, cashier, user_sub)
      VALUES (${holdId}, ${String(customerName).slice(0, 191)}, ${JSON.stringify(items)}, ${note ? String(note).slice(0, 2000) : null},
        ${req.session?.name || null}, ${req.session?.sub || null})
      ON DUPLICATE KEY UPDATE customer = VALUES(customer), items = VALUES(items), note = VALUES(note), created_at = CURRENT_TIMESTAMP`);
    const count = sqlRows(await db.execute(sql`SELECT COUNT(*) AS n FROM pos_held_orders`))[0];
    res.json({ success: true, holdId, heldOrdersCount: Number(count?.n) || 0 });
  } catch (error: any) {
    console.error('hold order:', error);
    res.status(500).json({ error: 'Could not hold the bill.' });
  }
});

app.delete('/api/pos/held-orders/:id', async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM pos_held_orders WHERE id = ${String(req.params.id)}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not remove the held bill.' });
  }
});

// POS Complete Sale API (Atomic transaction, instant receipt generation, inventory logging)
// ==========================================
// POS MODULES (staff + admin; guarded by app.use('/api/pos', requireStaff))
// ==========================================

// ---------------------------------------------------------------------------
// v3.9 — My Orders: website orders the owner assigned to this staff member.
// Staff see only their own; an admin sees every assigned order.
// ---------------------------------------------------------------------------
const STAFF_ORDER_STATUSES = ['pending', 'processing', 'confirmed', 'on_hold', 'shipped', 'delivered', 'completed', 'cancelled', 'returned'];

function staffIdOf(req: any): number | null {
  const sub = String(req.session?.sub || '');
  return sub.startsWith('staff_') ? Number(sub.slice(6)) || null : null;
}

async function myOrderOr404(req: any, res: express.Response) {
  const id = Number(req.params.id);
  const order = (await db.select().from(orders).where(eq(orders.id, id)).limit(1))[0];
  const mine = order && (req.session?.role === 'admin' ? order.assignedTo != null : order.assignedTo === staffIdOf(req));
  if (!mine) {
    res.status(404).json({ error: 'This order is not assigned to you.' });
    return null;
  }
  return order;
}

app.get('/api/pos/my-orders', async (req: any, res) => {
  try {
    const staffId = staffIdOf(req);
    const conditions: any[] = [];
    if (req.session?.role === 'admin' && !staffId) conditions.push(sql`${orders.assignedTo} IS NOT NULL`);
    else conditions.push(eq(orders.assignedTo, staffId || -1));
    const status = String(req.query.status || 'open');
    if (status === 'open') conditions.push(inArray(orders.orderStatus, ['pending', 'processing', 'confirmed', 'on_hold', 'shipped']));
    else if (status !== 'all') conditions.push(eq(orders.orderStatus, status));
    const rows = await db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.assignedAt), desc(orders.id))
      .limit(200);
    const ids = rows.map((row) => row.id);
    const items = ids.length
      ? await db
          .select({ orderId: orderItems.orderId, productName: orderItems.productName, variationLabel: orderItems.variationLabel, quantity: orderItems.quantity })
          .from(orderItems)
          .where(inArray(orderItems.orderId, ids))
      : [];
    const counts = sqlRows(
      await db.execute(
        req.session?.role === 'admin' && !staffId
          ? sql`SELECT order_status AS s, COUNT(*) AS n FROM orders WHERE assigned_to IS NOT NULL GROUP BY order_status`
          : sql`SELECT order_status AS s, COUNT(*) AS n FROM orders WHERE assigned_to = ${staffId || -1} GROUP BY order_status`
      )
    );
    res.json({
      orders: rows.map((row) => ({ ...row, items: items.filter((item) => item.orderId === row.id) })),
      counts: Object.fromEntries(counts.map((row: any) => [row.s, Number(row.n) || 0])),
    });
  } catch (error: any) {
    console.error('my orders:', error);
    res.status(500).json({ error: 'Could not load your orders.' });
  }
});

app.patch('/api/pos/my-orders/:id', async (req: any, res) => {
  try {
    const order = await myOrderOr404(req, res);
    if (!order) return;
    const nextStatus = req.body?.orderStatus ? String(req.body.orderStatus) : '';
    if (nextStatus && !STAFF_ORDER_STATUSES.includes(nextStatus)) return res.status(400).json({ error: 'Choose a valid status.' });
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    const patch: any = { updatedAt: new Date() };
    if (nextStatus) patch.orderStatus = nextStatus;
    if (note) {
      const stamp = new Intl.DateTimeFormat('en-GB', { timeZone: SHOP_TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date());
      patch.notes = `${order.notes ? `${order.notes}\n` : ''}[${stamp} · ${req.session?.name || 'Staff'}] ${note}`;
    }
    await db.transaction(async (tx) => {
      if (nextStatus) await syncOrderStock(tx, order.id, nextStatus, actorName(req));
      await tx.update(orders).set(patch).where(eq(orders.id, order.id));
    });
    if (nextStatus && nextStatus !== order.orderStatus) void notifyOrderStatusSms(order.id, order.orderStatus);
    const updated = (await db.select().from(orders).where(eq(orders.id, order.id)).limit(1))[0];
    res.json({ success: true, order: updated });
  } catch (error: any) {
    console.error('my order update:', error);
    res.status(500).json({ error: 'Could not update the order.' });
  }
});

// Suppliers list / create — used by Purchase and Supplier Payment
app.get('/api/pos/suppliers', requireAnyPermission('suppliers', 'purchases'), async (_req, res) => {
  try {
    const rows = await db.select().from(suppliers).orderBy(asc(suppliers.name));
    res.json(rows);
  } catch (error: any) {
    console.error('Failed to list suppliers:', error);
    res.status(500).json({ error: 'Could not load suppliers.' });
  }
});

app.post('/api/pos/suppliers', requirePermission('suppliers'), async (req, res) => {
  try {
    const { name, phone, email, company, address } = req.body || {};
    if (!name || !phone) return res.status(400).json({ error: 'Enter a name and phone number.' });

    const inserted = await insertReturning(db, suppliers, {
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: email || null,
      company: company || null,
      address: address || null,
    });
    res.json(inserted[0]);
  } catch (error: any) {
    console.error('Failed to create supplier:', error);
    res.status(500).json({ error: 'Could not add supplier.' });
  }
});

// Purchase (stock inward). Adds stock and writes the inventory ledger.
app.post('/api/pos/purchase', requirePermission('purchases'), async (req, res) => {
  try {
    const { supplierId, supplierName, items, paid, notes } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Add at least one product.' });
    }

    const invoiceNumber = `PUR-${shopDay().replace(/-/g, '')}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;

    const purchase = await db.transaction(async (tx) => {
      let total = 0;
      const lines: any[] = [];
      await lockProductRows(tx, items.map((item: any) => item.productId));

      for (const item of items) {
        // v3.9 — row lock: two purchases saved at once can no longer lose stock
        const rows = await tx
          .select()
          .from(products)
          .where(eq(products.id, Number(item.productId)))
          .limit(1)
          .for('update');

        if (rows.length === 0) throw new Error(`Product not found (ID ${item.productId}).`);

        const product = rows[0];
        const quantity = Number(item.quantity) || 0;
        const unitCost = Number(item.unitCost ?? product.costPrice ?? 0);
        if (quantity <= 0) throw new Error('Quantity must be greater than zero.');

        const subtotal = quantity * unitCost;
        total += subtotal;

        lines.push({
          productName: product.name,
          productId: product.id,
          quantity,
          unitCost: unitCost.toFixed(2),
          subtotal: subtotal.toFixed(2),
          batchNumber: item.batchNumber || null,
          expiryDate: item.expiryDate || null,
        });

        const previousStock = product.stock || 0;
        const newStock = previousStock + quantity;

        await tx
          .update(products)
          .set({
            stock: newStock,
            costPrice: unitCost.toFixed(2),
            ...(item.batchNumber ? { batchNumber: item.batchNumber } : {}),
            ...(item.expiryDate ? { expiryDate: item.expiryDate } : {}),
          })
          .where(eq(products.id, product.id));

        await tx.insert(inventoryTransactions).values({
          productId: product.id,
          type: 'purchase',
          quantity,
          previousStock,
          newStock,
          reference: invoiceNumber,
          notes: notes || 'Stock purchase',
          performedBy: 'pos',
        });
      }

      const created = await insertReturning(tx, purchases, {
        invoiceNumber,
        supplierId: supplierId ? Number(supplierId) : null,
        supplierName: supplierName || 'Walk-in supplier',
        total: total.toFixed(2),
        paid: Number(paid || 0).toFixed(2),
        status: Number(paid || 0) >= total ? 'paid' : 'due',
        purchaseDate: shopDay(),
        notes: notes || null,
      });

      for (const line of lines) {
        await tx.insert(purchaseItems).values({ ...line, purchaseId: created[0].id });
      }

      return created[0];
    });

    res.json({ success: true, purchase });
  } catch (error: any) {
    console.error('Purchase failed:', error);
    res.status(400).json({ error: error.message || 'Could not complete the purchase.' });
  }
});

app.get('/api/pos/purchases', requirePermission('purchases'), async (_req, res) => {
  try {
    const rows = await db.select().from(purchases).orderBy(desc(purchases.createdAt)).limit(100);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Could not load purchases.' });
  }
});

// Short list (low stock) and expired / near-expiry list
app.get('/api/pos/short-list', requireAnyPermission('inventory', 'purchases'), async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(products)
      .where(and(NOT_DELETED, sql`${products.stock} <= ${products.lowStockThreshold}`))
      .orderBy(asc(products.stock));
    res.json(rows);
  } catch (error: any) {
    console.error('Short list failed:', error);
    res.status(500).json({ error: 'Could not load the short list.' });
  }
});

app.get('/api/pos/expired-list', requireAnyPermission('inventory', 'purchases'), async (req, res) => {
  try {
    // `days` looks ahead: 0 = already expired, 30 = expiring within a month
    const days = Number(req.query.days) || 0;
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + days);
    const cutoff = shopDay(limitDate);

    const rows = await db
      .select()
      .from(products)
      .where(and(NOT_DELETED, sql`${products.expiryDate} IS NOT NULL`, lte(products.expiryDate, cutoff)))
      .orderBy(asc(products.expiryDate));

    res.json(rows);
  } catch (error: any) {
    console.error('Expired list failed:', error);
    res.status(500).json({ error: 'Could not load expired products.' });
  }
});

// Product inventory log
app.get('/api/pos/inventory-log', requirePermission('inventory'), async (req, res) => {
  try {
    const productId = req.query.productId ? Number(req.query.productId) : null;
    const base = db
      .select({
        id: inventoryTransactions.id,
        productId: inventoryTransactions.productId,
        productName: products.name,
        type: inventoryTransactions.type,
        quantity: inventoryTransactions.quantity,
        previousStock: inventoryTransactions.previousStock,
        newStock: inventoryTransactions.newStock,
        reference: inventoryTransactions.reference,
        notes: inventoryTransactions.notes,
        performedBy: inventoryTransactions.performedBy,
        createdAt: inventoryTransactions.createdAt,
      })
      .from(inventoryTransactions)
      .leftJoin(products, eq(inventoryTransactions.productId, products.id));

    const rows = productId
      ? await base.where(eq(inventoryTransactions.productId, productId)).orderBy(desc(inventoryTransactions.createdAt)).limit(200)
      : await base.orderBy(desc(inventoryTransactions.createdAt)).limit(200);

    res.json(rows);
  } catch (error: any) {
    console.error('Inventory log failed:', error);
    res.status(500).json({ error: 'Could not load inventory log.' });
  }
});

// Manual stock adjustment (Product Adjustment)
app.post('/api/pos/adjust-stock', requirePermission('inventory'), async (req, res) => {
  try {
    const { productId, newStock, reason } = req.body || {};
    const rows = await db.select().from(products).where(eq(products.id, Number(productId))).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found.' });

    const previousStock = rows[0].stock || 0;
    const target = Number(newStock);
    if (Number.isNaN(target) || target < 0) {
      return res.status(400).json({ error: 'Enter a valid stock quantity.' });
    }

    await db.update(products).set({ stock: target }).where(eq(products.id, rows[0].id));
    await db.insert(inventoryTransactions).values({
      productId: rows[0].id,
      type: 'adjustment',
      quantity: target - previousStock,
      previousStock,
      newStock: target,
      reference: 'MANUAL-ADJUST',
      notes: reason || 'Manual adjustment from POS',
      performedBy: 'pos',
    });

    res.json({ success: true, previousStock, newStock: target });
  } catch (error: any) {
    console.error('Stock adjustment failed:', error);
    res.status(500).json({ error: 'Could not adjust stock.' });
  }
});

// Daily expenses
app.get('/api/pos/expenses', requirePermission('expenses'), async (req, res) => {
  try {
    const date = String(req.query.date || shopDay());
    const rows = await db
      .select()
      .from(expenses)
      .where(eq(expenses.expenseDate, date))
      .orderBy(desc(expenses.createdAt));

    const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
    res.json({ date, total, expenses: rows });
  } catch (error: any) {
    console.error('Expenses failed:', error);
    res.status(500).json({ error: 'Could not load expenses.' });
  }
});

app.post('/api/pos/expenses', requirePermission('expenses'), async (req, res) => {
  try {
    const { category, description, amount, paymentMethod, expenseDate } = req.body || {};
    if (!category || !amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Enter an expense category and a valid amount.' });
    }

    const inserted = await insertReturning(db, expenses, {
      category: String(category).trim(),
      description: description || null,
      amount: Number(amount).toFixed(2),
      paymentMethod: paymentMethod || 'cash',
      expenseDate: expenseDate || shopDay(),
      recordedBy: 'pos',
    });
    res.json({ success: true, expense: inserted[0] });
  } catch (error: any) {
    console.error('Expense create failed:', error);
    res.status(500).json({ error: 'Could not add expense.' });
  }
});

app.delete('/api/pos/expenses/:id', requirePermission('expenses'), async (req, res) => {
  try {
    await db.delete(expenses).where(eq(expenses.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Could not delete expense.' });
  }
});

// Counter / cash drawer session
app.get('/api/pos/counter', async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(counterSessions)
      .where(eq(counterSessions.status, 'open'))
      .orderBy(desc(counterSessions.openedAt))
      .limit(1);
    res.json({ session: rows[0] || null });
  } catch (error: any) {
    res.status(500).json({ error: 'Could not load counter details.' });
  }
});

app.post('/api/pos/counter/open', async (req: any, res) => {
  try {
    const open = await db.select().from(counterSessions).where(eq(counterSessions.status, 'open'));
    if (open.length > 0) {
      return res.status(409).json({ error: 'A counter is already open.' });
    }

    const inserted = await insertReturning(db, counterSessions, {
      openedBy: req.session?.name || 'staff',
      openingCash: Number(req.body?.openingCash || 0).toFixed(2),
      status: 'open',
    });
    res.json({ success: true, session: inserted[0] });
  } catch (error: any) {
    console.error('Counter open failed:', error);
    res.status(500).json({ error: 'Could not open counter.' });
  }
});

app.post('/api/pos/counter/close', async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(counterSessions)
      .where(eq(counterSessions.status, 'open'))
      .limit(1);

    if (rows.length === 0) return res.status(404).json({ error: 'No open counter found.' });
    const session = rows[0];

    // Expected cash = opening float + cash sales - cash expenses since the counter opened
    const since = session.openedAt ? new Date(session.openedAt) : new Date();
    const cashSales = await db
      .select({ total: sql<string>`COALESCE(SUM(${orders.total}), 0)` })
      .from(orders)
      .where(
        and(
          eq(orders.source, 'pos'),
          eq(orders.paymentMethod, 'cash'),
          gte(orders.createdAt, since)
        )
      );

    const todayExpenses = await db
      .select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(eq(expenses.expenseDate, shopDay()));

    const expected =
      Number(session.openingCash) + Number(cashSales[0]?.total || 0) - Number(todayExpenses[0]?.total || 0);
    const closing = Number(req.body?.closingCash || 0);

    await db
      .update(counterSessions)
      .set({
        status: 'closed',
        closingCash: closing.toFixed(2),
        expectedCash: expected.toFixed(2),
        difference: (closing - expected).toFixed(2),
        note: req.body?.note || null,
        closedAt: new Date(),
      })
      .where(eq(counterSessions.id, session.id));

    res.json({
      success: true,
      openingCash: Number(session.openingCash),
      cashSales: Number(cashSales[0]?.total || 0),
      expenses: Number(todayExpenses[0]?.total || 0),
      expected,
      counted: closing,
      difference: closing - expected,
    });
  } catch (error: any) {
    console.error('Counter close failed:', error);
    res.status(500).json({ error: 'Could not close counter.' });
  }
});

// Sales summary / daily cash received
app.get('/api/pos/summary', async (req, res) => {
  try {
    const date = String(req.query.date || shopDay());
    const start = shopDayStart(date);
    const end = shopDayEnd(date);

    const dayOrders = await db
      .select()
      .from(orders)
      .where(and(gte(orders.createdAt, start), lte(orders.createdAt, end)));

    const byMethod: Record<string, number> = {};
    let posTotal = 0;
    let webTotal = 0;

    for (const order of dayOrders) {
      const amount = Number(order.total);
      byMethod[order.paymentMethod] = (byMethod[order.paymentMethod] || 0) + amount;
      if (order.source === 'pos') posTotal += amount;
      else webTotal += amount;
    }

    const dayExpenses = await db.select().from(expenses).where(eq(expenses.expenseDate, date));
    const expenseTotal = dayExpenses.reduce((sum, row) => sum + Number(row.amount), 0);

    res.json({
      date,
      orderCount: dayOrders.length,
      posTotal,
      webTotal,
      grossTotal: posTotal + webTotal,
      byMethod,
      cashReceived: byMethod.cash || 0,
      expenseTotal,
      netCash: (byMethod.cash || 0) - expenseTotal,
    });
  } catch (error: any) {
    console.error('Summary failed:', error);
    res.status(500).json({ error: 'Could not load summary.' });
  }
});

app.post('/api/pos/sale', async (req, res) => {
  try {
    const {
      customerId,
      customerName = 'Walk-in Customer',
      customerPhone = '01900000000',
      items, // array of { productId, quantity, unitPrice, discount }
      discount = 0,
      tax = 0,
      cashReceived = 0,
      paymentMethod = 'cash',
      cashierName = 'Pharmacist on Duty',
      notes,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    if (items.length > 500) {
      return res.status(400).json({ error: 'Too many lines in one sale.' });
    }
    // v3.11 — every line is checked before anything is written: a whole
    // number of at least 1 (a typed "-2" or "0.5" used to ADD stock back or
    // sell half a box), a real product id and a price that is not negative
    for (const item of items) {
      const qty = Number(item?.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > 100_000) {
        return res.status(400).json({ error: 'Every quantity must be a whole number of at least 1.' });
      }
      if (!Number.isInteger(Number(item?.productId)) || Number(item.productId) <= 0) {
        return res.status(400).json({ error: 'A line in the cart has no product.' });
      }
      if (item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== '') {
        const price = Number(item.unitPrice);
        if (!Number.isFinite(price) || price < 0) {
          return res.status(400).json({ error: 'A price in the cart is not valid.' });
        }
      }
    }
    const discountValue = Number(discount) || 0;
    const taxValue = Number(tax) || 0;
    if (!Number.isFinite(discountValue) || discountValue < 0 || !Number.isFinite(taxValue) || taxValue < 0) {
      return res.status(400).json({ error: 'Discount and tax cannot be negative.' });
    }

    const result = await db.transaction(async (tx) => {
      let subtotal = 0;
      const orderItemsToInsert: any[] = [];
      const stockUpdates: { id: number; newStock: number; qty: number }[] = [];

      // Running stock per product and per variation, so two lines of the same
      // product (e.g. two sizes) are checked and decremented cumulatively
      // instead of each starting from the same stored figure.
      const productStock = new Map<number, number>();
      const variationStock = new Map<number, number>();
      const variationUpdates: { id: number; newStock: number }[] = [];
      await lockProductRows(tx, items.map((item: any) => item.productId));

      for (const item of items) {
        // v3.9 — row lock: two checkouts at the same moment cannot both take the last piece
        const prodRows = await tx
          .select()
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1)
          .for('update');

        if (prodRows.length === 0) {
          throw new Error(`Product ${item.productId} not found`);
        }

        const prod = prodRows[0];
        const qty = Number(item.quantity);
        if (prod.status !== 'active') {
          throw new Error(`"${prod.name}" is not active any more and cannot be sold.`);
        }

        let variation: typeof productVariations.$inferSelect | null = null;
        if (!item.variationId) {
          // A product with options is sold by option (each has its own stock)
          const optionRows = await tx
            .select({ id: productVariations.id })
            .from(productVariations)
            .where(and(eq(productVariations.productId, prod.id), eq(productVariations.status, 'active')))
            .limit(1);
          if (optionRows.length > 0) {
            throw new Error(`Choose an option (size / pack) for "${prod.name}".`);
          }
        }
        if (item.variationId) {
          const varRows = await tx
            .select()
            .from(productVariations)
            .where(
              and(
                eq(productVariations.id, Number(item.variationId)),
                eq(productVariations.productId, prod.id)
              )
            )
            .limit(1)
            .for('update');
          if (varRows.length === 0) {
            throw new Error(`Selected option for "${prod.name}" was not found`);
          }
          variation = varRows[0];
          if (variation.status && variation.status !== 'active') {
            throw new Error(`The option "${variation.label}" of "${prod.name}" is switched off.`);
          }
          const available = variationStock.has(variation.id)
            ? (variationStock.get(variation.id) as number)
            : Number(variation.stock);
          if (available < qty) {
            throw new Error(
              `Insufficient stock for "${prod.name} — ${variation.label}". Available: ${available}`
            );
          }
          variationStock.set(variation.id, available - qty);
        }

        const currentStock = productStock.has(prod.id)
          ? (productStock.get(prod.id) as number)
          : Number(prod.stock);
        if (currentStock < qty) {
          throw new Error(`Insufficient stock for "${prod.name}". Available: ${currentStock}`);
        }
        productStock.set(prod.id, currentStock - qty);

        const fallbackPrice = variation
          ? Number(variation.salePrice ?? variation.price ?? prod.salePrice ?? prod.price)
          : Number(prod.salePrice || prod.price);
        const typed = item.unitPrice === undefined || item.unitPrice === null || item.unitPrice === '' ? NaN : Number(item.unitPrice);
        const price = Number.isFinite(typed) && typed > 0 ? typed : fallbackPrice;
        if (!Number.isFinite(price) || price < 0) throw new Error(`"${prod.name}" has no valid price.`);
        const itemSub = Math.round(price * qty * 100) / 100;
        subtotal += itemSub;

        orderItemsToInsert.push({
          productId: prod.id,
          productName: prod.name,
          sku: variation?.sku || prod.sku,
          variationId: variation ? variation.id : null,
          variationLabel: variation ? variation.label : null,
          unitPrice: price.toFixed(2),
          quantity: qty,
          subtotal: itemSub.toFixed(2),
          batchNumber: prod.batchNumber,
          expiryDate: prod.expiryDate,
        });

        stockUpdates.push({ id: prod.id, newStock: currentStock - qty, qty });
      }

      for (const [id, newStock] of variationStock) variationUpdates.push({ id, newStock });

      // A discount larger than the bill would make the total negative
      const totalDiscount = Math.min(discountValue, subtotal);
      const totalTax = taxValue;
      const grandTotal = Math.max(0, Math.round((subtotal - totalDiscount + totalTax) * 100) / 100);

      const received = Number(cashReceived) || grandTotal;
      const change = Math.max(0, received - grandTotal);

      // Sequential, sharing the website's counter so the order list reads in order
      const orderNumber = await nextOrderNumber(tx, 'POS');

      // Insert order
      const insertedOrder = await insertReturning(tx, orders, {
          orderNumber,
          source: 'pos',
          customerId: customerId || null,
          customerName,
          customerPhone,
          subtotal: subtotal.toFixed(2),
          discount: totalDiscount.toFixed(2),
          shippingCharge: '0.00',
          tax: totalTax.toFixed(2),
          total: grandTotal.toFixed(2),
          cashReceived: received.toFixed(2),
          changeAmount: change.toFixed(2),
          paymentMethod,
          paymentStatus: 'paid',
          orderStatus: 'completed',
          cashierName,
          notes,
        });

      const createdOrder = insertedOrder[0];

      // Insert Items
      for (const oi of orderItemsToInsert) {
        await tx.insert(orderItems).values({
          orderId: createdOrder.id,
          ...oi,
        });
      }

      // Update Stock & Inventory Log
      for (const varUpdate of variationUpdates) {
        await tx
          .update(productVariations)
          .set({ stock: varUpdate.newStock })
          .where(eq(productVariations.id, varUpdate.id));
      }

      for (const update of stockUpdates) {
        await tx
          .update(products)
          .set({ stock: update.newStock })
          .where(eq(products.id, update.id));

        await tx.insert(inventoryTransactions).values({
          productId: update.id,
          type: 'sale',
          quantity: -update.qty,
          previousStock: update.newStock + update.qty,
          newStock: update.newStock,
          reference: orderNumber,
          notes: `POS In-Store Sale #${orderNumber}`,
          performedBy: cashierName,
        });
      }

      // Update customer total spending if customerId provided
      if (customerId) {
        const cust = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
        if (cust.length > 0) {
          await tx
            .update(customers)
            .set({
              totalOrders: (cust[0].totalOrders || 0) + 1,
              totalSpent: (Number(cust[0].totalSpent || 0) + grandTotal).toFixed(2),
            })
            .where(eq(customers.id, customerId));
        }
      }

      return {
        order: createdOrder,
        items: orderItemsToInsert,
      };
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('POS sale failed:', error);
    res.status(400).json({ error: error.message || 'Failed to complete POS sale' });
  }
});

// ==========================================
// 3. ADMIN & DASHBOARD APIS
// ==========================================

// Dashboard Statistics & Analytics (Recharts ready)
/**
 * Minutes the shop's time zone is ahead of UTC right now (Asia/Dhaka: 360).
 * Used to group rows by the shop's own calendar day inside MySQL without the
 * server's time zone tables (shared hosting rarely has them loaded).
 */
function shopOffsetMinutes(at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: SHOP_TZ,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
    return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
  } catch {
    return 360;
  }
}

/**
 * v3.11 — the dashboard numbers are added up by MySQL. Earlier versions loaded
 * EVERY order, order line, product and customer into memory on each visit,
 * which made the dashboard slow (and the server short of memory) once a shop
 * had a few thousand orders. Same numbers, same response shape.
 */
app.get('/api/dashboard/stats', async (_req, res) => {
  try {
    const one = async (query: any) => sqlRows(await db.execute(query))[0] || {};
    const num = (value: any) => Number(value) || 0;
    const now = new Date();
    const todayStr = shopDay();
    const todayStart = shopDayStart(todayStr);
    const todayEnd = shopDayEnd(todayStr);
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const in90 = shopDay(new Date(now.getTime() + 90 * 24 * 3600 * 1000));
    const VALID = sql`COALESCE(o.order_status, '') NOT IN ('cancelled', 'refunded', 'returned', 'failed') AND COALESCE(o.payment_status, '') <> 'failed'`;

    const [orderAgg, productAgg, customerAgg, costAgg, paymentRows, recentOrders] = await Promise.all([
      one(sql`SELECT COUNT(*) AS n,
                COALESCE(SUM(o.total), 0) AS revenue,
                COALESCE(SUM(o.order_status = 'pending'), 0) AS pending,
                COALESCE(SUM(o.order_status IN ('completed', 'delivered')), 0) AS completed,
                COALESCE(SUM(o.created_at BETWEEN ${todayStart} AND ${todayEnd}), 0) AS todayN,
                COALESCE(SUM(CASE WHEN o.created_at BETWEEN ${todayStart} AND ${todayEnd} THEN o.total ELSE 0 END), 0) AS todaySales,
                COALESCE(SUM(CASE WHEN ${VALID} AND o.created_at >= ${since} THEN 1 ELSE 0 END), 0) AS n30,
                COALESCE(SUM(CASE WHEN ${VALID} AND o.created_at >= ${since} THEN o.subtotal - COALESCE(o.discount, 0) ELSE 0 END), 0) AS sales30,
                COALESCE(SUM(CASE WHEN ${VALID} AND o.created_at >= ${since} THEN o.total ELSE 0 END), 0) AS revenue30,
                COALESCE(SUM(CASE WHEN o.order_status IN ('delivered', 'completed') AND COALESCE(o.courier_service, '') NOT IN ('', 'manual') THEN o.shipping_charge ELSE 0 END), 0) AS courierSpend
              FROM orders o`),
      one(sql`SELECT COUNT(*) AS n,
                COALESCE(SUM(stock <= COALESCE(NULLIF(low_stock_threshold, 0), 10)), 0) AS low,
                COALESCE(SUM(stock = 0), 0) AS outOfStock,
                COALESCE(SUM(expiry_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND LEFT(expiry_date, 10) >= ${todayStr} AND LEFT(expiry_date, 10) <= ${in90}), 0) AS expiring,
                COALESCE(SUM(expiry_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND LEFT(expiry_date, 10) < ${todayStr}), 0) AS expired,
                COALESCE(SUM(GREATEST(0, stock) * COALESCE(cost_price, 0)), 0) AS stockValue
              FROM products WHERE status <> 'deleted'`),
      one(sql`SELECT COUNT(*) AS n FROM customers`),
      one(sql`SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0) AS allCost,
                COALESCE(SUM(CASE WHEN ${VALID} THEN oi.quantity * COALESCE(p.cost_price, 0) ELSE 0 END), 0) AS soldCogs,
                COALESCE(SUM(CASE WHEN ${VALID} AND o.created_at >= ${since} THEN oi.quantity * COALESCE(p.cost_price, 0) ELSE 0 END), 0) AS cogs30
              FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
              LEFT JOIN products p ON p.id = oi.product_id`),
      db.execute(sql`SELECT payment_method AS method, COALESCE(SUM(total), 0) AS value FROM orders GROUP BY payment_method`).then(sqlRows),
      db.select().from(orders).orderBy(desc(orders.createdAt)).limit(6),
    ]);

    // Sales by day (last 7 shop days, for the chart)
    const offset = shopOffsetMinutes(now);
    const firstDay = shopDay(new Date(now.getTime() - 6 * 24 * 3600 * 1000));
    const dayRows = sqlRows(
      await db.execute(sql`SELECT DATE_FORMAT(created_at + INTERVAL ${sql.raw(String(offset))} MINUTE, '%Y-%m-%d') AS day,
                                  COUNT(*) AS n, COALESCE(SUM(total), 0) AS sales
                           FROM orders WHERE created_at >= ${shopDayStart(firstDay)}
                           GROUP BY day`)
    );
    const byDay = new Map(dayRows.map((row: any) => [String(row.day), row]));
    const last7DaysData: { date: string; sales: number; orders: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const row: any = byDay.get(shopDay(d));
      last7DaysData.push({
        date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: SHOP_TZ }),
        sales: num(row?.sales),
        orders: num(row?.n),
      });
    }

    const totalRevenue = num(orderAgg.revenue);
    const sales30 = num(orderAgg.sales30);
    const rangeLabel = `${since.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: SHOP_TZ })} - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: SHOP_TZ })}`;

    res.json({
      todaySales: num(orderAgg.todaySales),
      todayOrdersCount: num(orderAgg.todayN),
      totalRevenue,
      totalOrdersCount: num(orderAgg.n),
      pendingOrders: num(orderAgg.pending),
      completedOrders: num(orderAgg.completed),
      customersCount: num(customerAgg.n),
      productsCount: num(productAgg.n),
      lowStockCount: num(productAgg.low),
      outOfStockCount: num(productAgg.outOfStock),
      expiringSoonCount: num(productAgg.expiring),
      expiredCount: num(productAgg.expired),
      estimatedProfit: Math.max(0, totalRevenue - num(costAgg.allCost)),
      last30: { profit: sales30 - num(costAgg.cogs30), revenue: num(orderAgg.revenue30), sales: sales30, orders: num(orderAgg.n30), range: rangeLabel },
      stockValue: num(productAgg.stockValue),
      soldCogs: num(costAgg.soldCogs),
      courierSpend: num(orderAgg.courierSpend),
      last7DaysData,
      paymentChart: (paymentRows as any[]).map((row) => ({ name: String(row.method || 'other').toUpperCase(), value: num(row.value) })),
      recentOrders,
    });
  } catch (error: any) {
    console.error('Failed to get dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Admin Orders List & Filtering
/**
 * v3.15 — the search box at the top of the dashboard. Asks the database for a
 * few orders, products and customers that match (only the kinds this account
 * may open), instead of keeping every product and customer in the browser.
 */
app.get('/api/admin/search', async (req: any, res) => {
  try {
    const term = String(req.query.q || '').trim().slice(0, 80);
    privateResponse(res);
    if (term.length < 2) return res.json({ orders: [], products: [], customers: [] });
    const like = `%${term}%`;
    const session = req.session;
    const can = (...modules: string[]) => session?.role === 'admin' || hasModule(session, ...(modules as any));
    const [orderRows, productRows, customerRows] = await Promise.all([
      can('orders')
        ? db.execute(sql`SELECT id, order_number AS orderNumber, customer_name AS customerName, customer_phone AS customerPhone, total
            FROM orders WHERE order_number LIKE ${like} OR customer_phone LIKE ${like} OR customer_name LIKE ${like}
            ORDER BY id DESC LIMIT 5`)
        : null,
      can('products', 'inventory', 'orders')
        ? db.execute(sql`SELECT id, name, sku, stock, image FROM products
            WHERE status <> 'deleted' AND (name LIKE ${like} OR sku LIKE ${like} OR barcode LIKE ${like})
            ORDER BY id DESC LIMIT 5`)
        : null,
      can('customers')
        ? db.execute(sql`SELECT id, name, phone FROM customers WHERE name LIKE ${like} OR phone LIKE ${like} OR email LIKE ${like}
            ORDER BY id DESC LIMIT 5`)
        : null,
    ]);
    res.json({
      orders: orderRows ? sqlRows(orderRows) : [],
      products: productRows ? sqlRows(productRows) : [],
      customers: customerRows ? sqlRows(customerRows) : [],
    });
  } catch (error: any) {
    console.error('admin search:', error?.message || error);
    res.json({ orders: [], products: [], customers: [] });
  }
});

app.get('/api/admin/orders', async (req, res) => {
  try {
    const { status, search, source, payment, shipping, from, to } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 10));

    const conditions: any[] = [];

    if (status && status !== 'all') {
      if (status === 'incomplete') {
        conditions.push(
          or(
            eq(orders.orderStatus, 'pending'),
            eq(orders.orderStatus, 'processing'),
            eq(orders.orderStatus, 'on_hold')
          )
        );
      } else {
        conditions.push(eq(orders.orderStatus, String(status)));
      }
    }
    if (source && source !== 'all') conditions.push(eq(orders.source, String(source)));
    if (String(req.query.wholesale || '') === '1') conditions.push(eq(orders.isWholesale, true));
    if (String(req.query.wholesale || '') === '0') conditions.push(sql`(${orders.isWholesale} = 0 OR ${orders.isWholesale} IS NULL)`);
    if (payment && payment !== 'all') conditions.push(eq(orders.paymentMethod, String(payment)));
    if (req.query.paymentStatus && req.query.paymentStatus !== 'all') conditions.push(eq(orders.paymentStatus, String(req.query.paymentStatus)));
    // v3.6 — orders from landing pages: landing=any, or one page's id
    const landingFilter = String(req.query.landing || '');
    if (landingFilter === 'any') conditions.push(sql`${orders.landingPageId} IS NOT NULL`);
    else if (Number(landingFilter) > 0) conditions.push(eq(orders.landingPageId, Number(landingFilter)));
    if (shipping && shipping !== 'all') conditions.push(eq(orders.shippingZone, String(shipping)));
    // v3.9 — assigned staff: a staff id, 'none' (nobody yet) or 'any'
    const assignedFilter = String(req.query.assigned || '');
    if (assignedFilter === 'none') conditions.push(sql`${orders.assignedTo} IS NULL`);
    else if (assignedFilter === 'any') conditions.push(sql`${orders.assignedTo} IS NOT NULL`);
    else if (Number(assignedFilter) > 0) conditions.push(eq(orders.assignedTo, Number(assignedFilter)));
    if (req.query.district && req.query.district !== 'all') conditions.push(eq(orders.district, String(req.query.district)));
    if (from) conditions.push(gte(orders.createdAt, shopDayStart(String(from))));
    if (to) conditions.push(lte(orders.createdAt, shopDayEnd(String(to))));

    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          like(orders.orderNumber, term),
          like(orders.customerName, term),
          like(orders.customerPhone, term),
          like(orders.consignmentId, term)
        )
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(where as any);
    const total = Number(countRows[0]?.count || 0);

    const orderRows = await db
      .select()
      .from(orders)
      .where(where as any)
      .orderBy(desc(orders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // Attach a compact item summary so the table can show product thumbnails
    // without the client firing one request per row.
    const ids = orderRows.map((row) => row.id);
    const itemsByOrder = new Map<number, any[]>();
    if (ids.length > 0) {
      const itemRows = await db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          productName: orderItems.productName,
          quantity: orderItems.quantity,
          image: products.image,
        })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(sql`${orderItems.orderId} in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
      for (const item of itemRows) {
        const list = itemsByOrder.get(item.orderId) || [];
        list.push(item);
        itemsByOrder.set(item.orderId, list);
      }
    }

    // Counts for the filter pills — every status, independent of the active one
    const statusCountRows = await db
      .select({ status: orders.orderStatus, count: sql<number>`count(*)` })
      .from(orders)
      .groupBy(orders.orderStatus);
    const statusCounts: Record<string, number> = { all: 0 };
    for (const row of statusCountRows) {
      statusCounts[row.status || 'pending'] = Number(row.count);
      statusCounts.all += Number(row.count);
    }
    statusCounts.incomplete =
      (statusCounts.pending || 0) + (statusCounts.processing || 0) + (statusCounts.on_hold || 0);

    const data = orderRows.map((row) => {
      const items = itemsByOrder.get(row.id) || [];
      return {
        ...row,
        itemCount: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        itemThumbs: items.slice(0, 3).map((item) => ({
          image: item.image,
          name: item.productName,
        })),
      };
    });

    // Older callers expected a bare array; new callers ask for the envelope.
    if (String(req.query.envelope) === '1') {
      res.json({ orders: data, total, page, pageSize, statusCounts });
    } else {
      res.json(data);
    }
  } catch (error: any) {
    console.error('Failed to get admin orders:', error);
    res.status(500).json({ error: 'Could not load orders.' });
  }
});

// Admin Order Details
/**
 * Order lines store names and prices but no picture. This adds each line's
 * photo (the variation's own image first, else the product's) and the product
 * slug for a link, looked up in two queries for the whole order.
 */
/**
 * The catalog id of an item — one rule shared by the Meta feed, the server
 * Purchase event and the browser pixel: an option's own SKU, else
 * "<parent SKU or id>-<option id>"; a plain product's SKU, else its id.
 */
export function catalogItemId(productSku: any, productId: any, variationSku?: any, variationId?: any): string {
  const parent = String(productSku || '').trim() || String(productId || '');
  if (variationId) return String(variationSku || '').trim() || `${parent}-${variationId}`;
  return parent;
}

export async function attachItemImages<T extends { productId?: number | null; variationId?: number | null }>(
  items: T[]
): Promise<Array<T & { image: string | null; productSlug: string | null; feedId: string }>> {
  if (!items.length) return [];
  const productIds = Array.from(new Set(items.map((item) => Number(item.productId)).filter(Boolean)));
  const variationIds = Array.from(new Set(items.map((item) => Number(item.variationId)).filter(Boolean)));
  const productRows = productIds.length
    ? await db
        .select({ id: products.id, image: products.image, images: products.images, slug: products.slug, sku: products.sku })
        .from(products)
        .where(inArray(products.id, productIds))
    : [];
  const variationRows = variationIds.length
    ? await db
        .select({ id: productVariations.id, image: productVariations.image, sku: productVariations.sku })
        .from(productVariations)
        .where(inArray(productVariations.id, variationIds))
    : [];
  const productById = new Map(productRows.map((row) => [row.id, row]));
  const variationById = new Map(variationRows.map((row) => [row.id, row]));
  const firstGalleryImage = (raw: any): string | null => {
    try {
      const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(list) && list[0] ? String(list[0]) : null;
    } catch {
      return null;
    }
  };
  return items.map((item) => {
    const product = productById.get(Number(item.productId));
    const variation = variationById.get(Number(item.variationId));
    return {
      ...item,
      image: variation?.image || product?.image || firstGalleryImage(product?.images) || null,
      productSlug: product?.slug || null,
      // Same id as the Meta catalog feed and the browser pixel
      feedId: catalogItemId(product?.sku, item.productId, variation?.sku, item.variationId),
    };
  });
}

/**
 * Several orders with their lines in one request, for bulk invoice printing.
 * Returned in the order the ids were given (the dashboard sends them in list
 * order, so the printed stack matches the screen).
 */
app.get('/api/admin/orders/invoices', async (req, res) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
      .slice(0, 200);
    if (ids.length === 0) return res.status(400).json({ error: 'Choose at least one order.' });
    const orderRows = await db.select().from(orders).where(inArray(orders.id, ids));
    const itemRows = await db.select().from(orderItems).where(inArray(orderItems.orderId, ids));
    const byOrder = new Map<number, any[]>();
    itemRows.forEach((item) => {
      const list = byOrder.get(item.orderId) || [];
      list.push(item);
      byOrder.set(item.orderId, list);
    });
    const byId = new Map(orderRows.map((order) => [order.id, order]));
    res.json(
      ids
        .filter((id) => byId.has(id))
        .map((id) => ({ order: byId.get(id), items: byOrder.get(id) || [] }))
    );
  } catch (error: any) {
    console.error('bulk invoices:', error);
    res.status(500).json({ error: 'Could not load the invoices.' });
  }
});

app.get('/api/admin/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.id, Number(id)))
      .limit(1);

    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRows[0];
    const items = await attachItemImages(
      await db.select().from(orderItems).where(eq(orderItems.orderId, order.id))
    );

    res.json({ order, items });
  } catch (error: any) {
    console.error('Failed to get order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// Admin Update Order Status
// Delete an order. Runs in a transaction and returns the stock, so deleting a
// cancelled order does not leave the inventory short.
/**
 * Deletes one order and puts its stock back — unless the stock already went
 * back when the order was cancelled / returned / refunded, and minus anything
 * a return already took back.
 */
export async function deleteOrderAndRestock(id: number, actor: string): Promise<string | null> {
  const orderRows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (orderRows.length === 0) return null;
  const order = orderRows[0];

  await db.transaction(async (tx) => {
    const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
    const alreadyReturned = Boolean(order.stockReleased);
    // Every item already handled through Returns (restocked or not) stays as the return left it
    const handledByReturns = await returnedSoFar(id, tx);

    for (const line of lines) {
      const quantity = Math.max(0, Number(line.quantity) - (handledByReturns.get(line.id) || 0));
      if (alreadyReturned || quantity === 0) continue;
      if (line.variationId) {
        await tx.execute(sql`UPDATE product_variations SET stock = stock + ${quantity} WHERE id = ${line.variationId}`);
      }
      const prodRows = await tx.select().from(products).where(eq(products.id, line.productId)).limit(1).for('update');
      if (prodRows.length > 0) {
        const previousStock = prodRows[0].stock || 0;
        const newStock = previousStock + quantity;
        await tx.update(products).set({ stock: newStock }).where(eq(products.id, line.productId));
        await tx.insert(inventoryTransactions).values({
          productId: line.productId,
          type: 'return',
          quantity,
          previousStock,
          newStock,
          reference: `DELETED-${order.orderNumber}`,
          notes: 'Order deleted from dashboard',
          performedBy: actor,
        });
      }
    }

    // v3.11 — a deleted order gives its coupon use back
    await setCouponReleased(tx, id, true);
    await tx.execute(sql`DELETE FROM coupon_usages WHERE order_id = ${id}`).catch(() => undefined);
    await tx.delete(orderItems).where(eq(orderItems.orderId, id));
    await tx.delete(orders).where(eq(orders.id, id));
  });
  return order.orderNumber;
}

app.delete('/api/admin/orders/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Enter a valid order ID.' });
    const deleted = await deleteOrderAndRestock(id, actorName(req));
    if (!deleted) return res.status(404).json({ error: 'Order not found.' });
    res.json({ success: true, deleted });
  } catch (error: any) {
    console.error('Failed to delete order:', error);
    res.status(500).json({ error: 'Could not delete order.' });
  }
});

/**
 * v3.9 — stock follows the order's status.
 * Cancelled / Returned / Refunded put the order's products back in stock
 * (each size/colour too); moving the order back to an open status takes them
 * out again. `stock_released` remembers which side the order is on, so
 * changing between two "closed" statuses (or saving the same status twice)
 * never counts the stock twice. Items already taken back through Sales →
 * Returns are left to that return.
 */
const STOCK_RELEASED_STATUSES = ['cancelled', 'returned', 'refunded'];

export async function syncOrderStock(tx: any, orderId: number, nextStatus: string | null | undefined, actor: string) {
  if (!nextStatus) return { changed: false };
  const order = (await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for('update'))[0];
  if (!order) return { changed: false };
  const wantReleased = STOCK_RELEASED_STATUSES.includes(String(nextStatus));
  const released = Boolean(order.stockReleased);
  if (wantReleased === released) return { changed: false };
  const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const handled = await returnedSoFar(orderId, tx);
  const sign = wantReleased ? 1 : -1;
  for (const line of lines) {
    const quantity = Math.max(0, Number(line.quantity) - (handled.get(line.id) || 0));
    if (quantity === 0) continue;
    if (line.variationId) {
      await tx.execute(sql`UPDATE product_variations SET stock = GREATEST(0, stock + ${sign * quantity}) WHERE id = ${line.variationId}`);
    }
    const product = (await tx.select().from(products).where(eq(products.id, line.productId)).limit(1).for('update'))[0];
    if (!product) continue;
    const previousStock = Number(product.stock || 0);
    const newStock = Math.max(0, previousStock + sign * quantity);
    await tx.update(products).set({ stock: newStock }).where(eq(products.id, product.id));
    await tx.insert(inventoryTransactions).values({
      productId: product.id,
      type: wantReleased ? 'return' : 'order_edit',
      quantity: sign * quantity,
      previousStock,
      newStock,
      reference: order.orderNumber,
      notes: wantReleased
        ? `Order ${order.orderNumber} marked ${String(nextStatus).replace(/_/g, ' ')} — stock put back`
        : `Order ${order.orderNumber} re-opened (${String(nextStatus).replace(/_/g, ' ')}) — stock taken again`,
      performedBy: actor,
    });
  }
  await tx.update(orders).set({ stockReleased: wantReleased }).where(eq(orders.id, orderId));
  // v3.11 — the coupon use follows the order too
  await setCouponReleased(tx, orderId, wantReleased);
  return { changed: true, released: wantReleased };
}

/** The payment status that matches an advance: part paid → "partial" */
export function paymentStatusForAdvance(current: string | null | undefined, advance: number, total: number): string {
  const status = String(current || 'unpaid');
  if (['paid', 'refunded', 'failed'].includes(status)) return status;
  if (advance > 0 && advance + 0.005 >= total) return 'paid';
  if (advance > 0) return 'partial';
  return status === 'partial' ? 'unpaid' : status;
}

app.patch('/api/admin/orders/:id/status', async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const { orderStatus, paymentStatus, notes } = req.body || {};

    const updateFields: any = { updatedAt: new Date() };
    if (orderStatus) updateFields.orderStatus = orderStatus;
    if (paymentStatus) updateFields.paymentStatus = paymentStatus;
    if (notes) updateFields.notes = notes;

    const before = await db.select({ orderStatus: orders.orderStatus }).from(orders).where(eq(orders.id, id)).limit(1);
    if (before.length === 0) return res.status(404).json({ error: 'Order not found.' });
    let stock: any = { changed: false };
    await db.transaction(async (tx) => {
      stock = await syncOrderStock(tx, id, orderStatus, actorName(req));
      await tx.update(orders).set(updateFields).where(eq(orders.id, id));
    });
    const updated = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (orderStatus) void notifyOrderStatusSms(id, before[0]?.orderStatus);

    res.json({ success: true, order: updated[0], stock });
  } catch (error: any) {
    console.error('Failed to update order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});
// Expenses (Dashboard → Expenses: list, categories, monthly report) → src/server/routes/expenses.ts
export const { NOT_DELETED, assignOrders, cleanCouponInput, customerForAdmin, deleteProductForGood, parseWholesaleFields, productExtras, rememberGeneric, shippingChargesValue } = registerExpenseRoutes({
  get categoryAndDescendants() {
    return categoryAndDescendants;
  },
  get actorName() {
    return actorName;
  },
  get app() {
    return app;
  },
  get findVariationBarcodeClash() {
    return findVariationBarcodeClash;
  },
  get lockProductRows() {
    return lockProductRows;
  },
  get privateResponse() {
    return privateResponse;
  },
  get shopDay() {
    return shopDay;
  },
  get slugify() {
    return slugify;
  },
  get sqlRows() {
    return sqlRows;
  },
  get updateOne() {
    return updateOne;
  },
});
// Media library → src/server/routes/mediaLibrary.ts
export const { MEDIA_MAX_BYTES, MEDIA_TYPES, appendToMediaLibrary, humanSize } = registerMediaLibraryRoutes({
  get app() {
    return app;
  },
  get mediaStore() {
    return mediaStore;
  },
  get privateResponse() {
    return privateResponse;
  },
  get saveUploadedFile() {
    return saveUploadedFile;
  },
  get uploadsDir() {
    return uploadsDir;
  },
});
// Wholesale accounts → src/server/routes/wholesaleAccounts.ts
export const { customerSessionUser, notifyAdmin } = registerWholesaleAccountRoutes({
  get app() {
    return app;
  },
  get categoryAndDescendants() {
    return categoryAndDescendants;
  },
  get hasSocialLogin() {
    return hasSocialLogin;
  },
  get isApprovedWholesale() {
    return isApprovedWholesale;
  },
  get loginThrottle() {
    return loginThrottle;
  },
  get makePasswordRecord() {
    return makePasswordRecord;
  },
  get parseWholesaleFields() {
    return parseWholesaleFields;
  },
  get privateResponse() {
    return privateResponse;
  },
  get publicProduct() {
    return publicProduct;
  },
  get requireRole() {
    return requireRole;
  },
  get SESSION_TTL_MS() {
    return SESSION_TTL_MS;
  },
  get signSession() {
    return signSession;
  },
  get sqlRows() {
    return sqlRows;
  },
  get wholesaleIdsCache() {
    return wholesaleIdsCache;
  },
});
// SMS — Bangladeshi gateways → src/server/routes/sms.ts
export const { bdMobile, fillTemplate, notifyOrderStatusSms, notifySmsEvent, readSmsConfig, sendSms, smsEventConfig, smsGatewayReady, smsStoreVars } = registerSmsRoutes({
  get app() {
    return app;
  },
  get sqlRows() {
    return sqlRows;
  },
});
// Email (SMTP) — password reset mail and admin alerts → src/server/routes/email.ts
export const { emailBrand, emailLayout, emailReady, publicOrigin, readEmailConfig, sendEmail } = registerEmailRoutes({
  get app() {
    return app;
  },
  get escapeHtml() {
    return escapeHtml;
  },
  get privateResponse() {
    return privateResponse;
  },
});
// Fraud checker — courier success ratio per phone number → src/server/routes/fraudChecker.ts
export const { autoFraudCheck } = registerFraudCheckerRoutes({
  get app() {
    return app;
  },
  get bdMobile() {
    return bdMobile;
  },
  get sqlRows() {
    return sqlRows;
  },
});
// Returns — Sales → Returns → src/server/routes/returns.ts
export const { returnedSoFar } = registerReturnRoutes({
  get app() {
    return app;
  },
  get attachItemImages() {
    return attachItemImages;
  },
  get sqlRows() {
    return sqlRows;
  },
});
// Maintenance mode → src/server/routes/maintenance.ts
export const { hasMaintenancePreview, htmlEscape, invalidateMaintenanceCache, maintenanceGate, maintenanceState } = registerMaintenanceRoutes({
  get app() {
    return app;
  },
  get readCookie() {
    return readCookie;
  },
  get safeEqual() {
    return safeEqual;
  },
  get SESSION_SECRET() {
    return SESSION_SECRET;
  },
});
// Meta catalog feed — /feeds/meta-catalog.csv (and .xml) → src/server/routes/metaCatalog.ts
registerMetaCatalogRoutes({
  get app() {
    return app;
  },
  get catalogItemId() {
    return catalogItemId;
  },
  get htmlEscape() {
    return htmlEscape;
  },
  get smsStoreVars() {
    return smsStoreVars;
  },
});
// Contact form → Dashboard → Messages → src/server/routes/contactMessages.ts
export const { sqlRows } = registerContactRoutes({
  get app() {
    return app;
  },
  get clientIp() {
    return clientIp;
  },
  get emailBrand() {
    return emailBrand;
  },
  get emailLayout() {
    return emailLayout;
  },
  get emailReady() {
    return emailReady;
  },
  get ensureTable() {
    return ensureTable;
  },
  get escapeHtml() {
    return escapeHtml;
  },
  get notifyAdmin() {
    return notifyAdmin;
  },
  get notifySmsEvent() {
    return notifySmsEvent;
  },
  get privateResponse() {
    return privateResponse;
  },
  get readEmailConfig() {
    return readEmailConfig;
  },
  get sendEmail() {
    return sendEmail;
  },
});
// v3.14 — Live chat (website chat box ↔ Dashboard → Live Chat) → src/server/routes/liveChat.ts
export const { forgetLiveChatSettings } = registerLiveChatRoutes({
  get app() {
    return app;
  },
  get clientIp() {
    return clientIp;
  },
  get ensureTable() {
    return ensureTable;
  },
  get notifyAdmin() {
    return notifyAdmin;
  },
  get privateResponse() {
    return privateResponse;
  },
  get peekSession() {
    return peekSession;
  },
});

// ==========================================
// SYSTEM HEALTH — is the database complete?
// ==========================================
async function systemHealth() {
  const [rows]: any = await createPool().query(
    'SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
  );
  const present = new Set((rows as any[]).map((row) => String(row.t)));
  const required = [...BASE_TABLES.map((table) => table.name), ...SCHEMA_TABLES.map((table) => table.name)];
  const tables = Array.from(new Set(required)).map((name) => ({ name, ok: present.has(name) }));
  let version = '';
  try {
    const [v]: any = await createPool().query('SELECT VERSION() AS v');
    version = String(v?.[0]?.v || '');
  } catch {
    /* ignore */
  }
  return {
    ok: tables.every((table) => table.ok) && schemaReport.ok,
    tables,
    schema: schemaReport,
    database: version,
    node: process.version,
    app: APP_VERSION,
  };
}

app.get('/api/admin/system/health', async (_req, res) => {
  try {
    privateResponse(res);
    res.json(await systemHealth());
  } catch (error: any) {
    res.status(500).json({ error: `Could not read the database: ${error?.message || error}` });
  }
});

/** Runs the automatic upgrade again (safe to repeat: it only adds what is missing) */
app.post('/api/admin/system/repair', async (_req, res) => {
  try {
    await ensureSchema();
    privateResponse(res);
    res.json(await systemHealth());
  } catch (error: any) {
    res.status(500).json({ error: `Repair failed: ${error?.message || error}` });
  }
});
// Generic names → src/server/routes/generics.ts
registerGenericRoutes({
  get app() {
    return app;
  },
});
// Courier APIs — Steadfast, Pathao, RedX, Carrybee (booking, status sync, webhooks) → src/server/routes/couriers.ts
export const { API_COURIERS, bookWithCourier, courierName, courierTrackingUrl, safeEqual } = registerCourierRoutes({
  get actorName() {
    return actorName;
  },
  get app() {
    return app;
  },
  get assignOrders() {
    return assignOrders;
  },
  get nextOrderNumber() {
    return nextOrderNumber;
  },
  get notifyOrderStatusSms() {
    return notifyOrderStatusSms;
  },
  get paymentStatusForAdvance() {
    return paymentStatusForAdvance;
  },
  get syncOrderStock() {
    return syncOrderStock;
  },
  get updateOne() {
    return updateOne;
  },
});

// ==========================================
// POS RETURN & REFUND API
// ==========================================
app.post('/api/pos/return', async (req, res) => {
  try {
    const { orderNumber, items, reason, refundAmount } = req.body;
    if (!orderNumber || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order number and returned items required' });
    }

    const ord = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
    if (ord.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const orderRecord = ord[0];

    if (orderRecord.stockReleased) {
      return res.status(400).json({ error: 'This order was already returned — its stock is back in the shop.' });
    }
    // Restock each item returned (v3.9: one transaction with row locks)
    await db.transaction(async (tx) => {
    // The order row is locked and checked again, so a double click restocks once
    const lockedOrder = (await tx.select().from(orders).where(eq(orders.id, orderRecord.id)).limit(1).for('update'))[0];
    if (lockedOrder?.stockReleased) throw Object.assign(new Error('already returned'), { alreadyReturned: true });
    await lockProductRows(tx, items.map((item: any) => item.productId));
    for (const item of items) {
      const prod = await tx.select().from(products).where(eq(products.id, item.productId)).for('update');
      if (prod.length > 0) {
        const currentStock = prod[0].stock;
        const newStock = currentStock + Number(item.quantity);

        await tx
          .update(products)
          .set({ stock: newStock })
          .where(eq(products.id, item.productId));
        if (item.variationId) {
          await tx.execute(
            sql`UPDATE product_variations SET stock = stock + ${Number(item.quantity) || 0} WHERE id = ${Number(item.variationId)} AND product_id = ${Number(item.productId)}`
          );
        }

        await tx.insert(inventoryTransactions).values({
          productId: item.productId,
          type: 'return',
          quantity: item.quantity,
          previousStock: currentStock,
          newStock,
          reference: `Return for ${orderNumber}`,
          notes: item.reason || reason || 'Customer return',
          performedBy: 'POS Cashier',
        });
      }
    }

    // Update order status
    await tx
      .update(orders)
      .set({
        orderStatus: 'returned',
        paymentStatus: 'refunded',
        stockReleased: true,
        notes: `${orderRecord.notes || ''} [Returned ৳${refundAmount || 0}: ${reason || 'Customer refund processed'}]`,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderRecord.id));
    });

    res.json({
      success: true,
      returnReceiptNumber: `RET-${Date.now().toString().slice(-6)}`,
      orderNumber,
      refundAmount: refundAmount || 0,
      message: 'Items returned to inventory and refund recorded successfully',
    });
  } catch (err: any) {
    if (err?.alreadyReturned) return res.status(400).json({ error: 'This order was already returned — its stock is back in the shop.' });
    console.error('POS return error:', err);
    res.status(500).json({ error: 'Failed to process POS return' });
  }
});

// ==========================================
// CATEGORIES, BRANDS, COUPONS, BANNERS UPDATE & DELETE
// ==========================================
/** Menu Builder: persist a new category order / navbar visibility in one call */
app.put('/api/admin/categories/reorder', async (req, res) => {
  const list = Array.isArray(req.body?.categories) ? req.body.categories : [];
  if (list.length === 0) return res.status(400).json({ error: 'No categories found.' });
  try {
    await db.transaction(async (tx) => {
      for (let index = 0; index < list.length; index += 1) {
        const item = list[index];
        const id = Number(item.id);
        if (!Number.isFinite(id)) continue;
        const patch: any = { sortOrder: Number(item.sortOrder ?? index + 1) };
        if ('featured' in item) patch.featured = Boolean(item.featured);
        if ('showOnHome' in item) patch.showOnHome = Boolean(item.showOnHome);
        await tx.update(categories).set(patch).where(eq(categories.id, id));
      }
    });
    const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id));
    res.json(rows);
  } catch (error: any) {
    console.error('category reorder:', error);
    res.status(500).json({ error: 'Could not save the sort order.' });
  }
});

app.put('/api/admin/categories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, slug, description, image, icon, featured, showOnHome, sortOrder } = req.body;

    // Re-parenting has to be saved too, otherwise a subcategory dragged under a
    // different parent snapped back on reload. Depth is recomputed from the new
    // parent and a category can never become its own ancestor.
    const patch: Record<string, any> = {
      name,
      slug: slug || slugify(name),
      description,
      image,
      icon,
      featured: Boolean(featured),
      showOnHome: Boolean(showOnHome),
      ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
    };

    if ('parentId' in req.body) {
      const rawParent = req.body.parentId;
      const parentId =
        rawParent === null || rawParent === '' || rawParent === undefined ? null : Number(rawParent);

      if (parentId === id) {
        return res.status(400).json({ error: 'A category cannot be its own parent.' });
      }

      let level = 1;
      if (parentId) {
        const parentRows = await db
          .select()
          .from(categories)
          .where(eq(categories.id, parentId))
          .limit(1);
        if (parentRows.length === 0) {
          return res.status(400).json({ error: 'Parent category not found.' });
        }

        // Walk up from the chosen parent; hitting this category means a loop.
        let cursor: number | null = parentRows[0].parentId ?? null;
        let guard = 0;
        while (cursor && guard++ < 10) {
          if (cursor === id) {
            return res.status(400).json({ error: 'A category cannot be placed under one of its own subcategories.' });
          }
          const up = await db.select().from(categories).where(eq(categories.id, cursor)).limit(1);
          cursor = up[0]?.parentId ?? null;
        }

        level = (parentRows[0].level || 1) + 1;
        if (level > 3) {
          return res.status(400).json({ error: 'Categories can only be nested up to 3 levels.' });
        }
      }

      patch.parentId = parentId;
      patch.level = level;
    }

    const updated = await updateReturning(db, categories, patch, eq(categories.id, id));
    res.json(updated[0]);
  } catch (err) {
    console.error('Failed to update category:', err);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

app.delete('/api/admin/categories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const found = (await db.select().from(categories).where(eq(categories.id, id)).limit(1))[0];
    if (!found) return res.status(404).json({ error: 'Category not found.' });
    // Products in it (hidden/deleted ones too — the database refused the delete
    // because of them) move up to the parent category, or become uncategorised,
    // and its subcategories move up one level. Nothing else is deleted or changed.
    const moveTo = found.parentId ? Number(found.parentId) : null;
    let moved = 0;
    let movedSubcategories = 0;
    await db.transaction(async (tx) => {
      const result: any = await tx.update(products).set({ categoryId: moveTo }).where(eq(products.categoryId, id));
      moved = Number(result?.[0]?.affectedRows ?? result?.affectedRows ?? 0);
      // Subcategories (and theirs) move up one level; `level` follows
      const childIds = (await tx.select({ id: categories.id }).from(categories).where(eq(categories.parentId, id))).map((row) => Number(row.id));
      if (childIds.length > 0) {
        const grandIds = (
          await tx.select({ id: categories.id }).from(categories).where(inArray(categories.parentId, childIds))
        ).map((row) => Number(row.id));
        await tx
          .update(categories)
          .set({ parentId: moveTo, level: sql`GREATEST(COALESCE(${categories.level}, 2) - 1, 1)` as any })
          .where(inArray(categories.id, childIds));
        if (grandIds.length > 0) {
          await tx
            .update(categories)
            .set({ level: sql`GREATEST(COALESCE(${categories.level}, 3) - 1, 1)` as any })
            .where(inArray(categories.id, grandIds));
        }
      }
      movedSubcategories = childIds.length;
      await tx.delete(categories).where(eq(categories.id, id));
    });
    categoryTreeCache = { at: 0, rows: [] };
    res.json({ success: true, movedProducts: moved, movedSubcategories, movedTo: moveTo });
  } catch (err: any) {
    console.error('category delete:', err?.message || err);
    res.status(500).json({ error: 'Could not delete the category. Please try again.' });
  }
});

app.put('/api/admin/brands/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, slug, description, logo } = req.body;
    const updated = await updateReturning(db, brands, {
        name,
        slug: slug || slugify(name),
        description,
        logo,
      }, eq(brands.id, id));
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update brand' });
  }
});

app.delete('/api/admin/brands/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const found = (await db.select({ id: brands.id }).from(brands).where(eq(brands.id, id)).limit(1))[0];
    if (!found) return res.status(404).json({ error: 'Brand not found.' });
    // Products keep everything else; they are only unlinked from the brand
    // (hidden/deleted products too — they used to block the delete).
    await db.transaction(async (tx) => {
      await tx.update(products).set({ brandId: null }).where(eq(products.brandId, id));
      await tx.delete(brands).where(eq(brands.id, id));
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error('brand delete:', err?.message || err);
    res.status(500).json({ error: 'Could not delete the brand. Please try again.' });
  }
});

app.put('/api/admin/coupons/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Enter a valid coupon.' });
    const clean = cleanCouponInput(req.body);
    if ('error' in clean) return res.status(400).json({ error: clean.error });
    const taken = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, clean.value.code)).limit(1);
    if (taken.length > 0 && taken[0].id !== id) return res.status(409).json({ error: `A coupon with the code ${clean.value.code} already exists.` });
    const updated = await updateReturning(db, coupons, clean.value as any, eq(coupons.id, id));
    if (!updated[0]) return res.status(404).json({ error: 'Coupon not found.' });
    res.json(updated[0]);
  } catch (err) {
    console.error('Failed to update coupon:', err);
    res.status(500).json({ error: 'Failed to update coupon' });
  }
});

app.delete('/api/admin/coupons/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(coupons).where(eq(coupons.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
});

app.put('/api/admin/banners/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const b = req.body;
    const updated = await updateReturning(db, heroBanners, {
        title: b.title || null,
        subtitle: b.subtitle || null,
        badge: b.badge || null,
        buttonText: b.buttonText || null,
        buttonUrl: b.buttonUrl || null,
        imageUrl: b.imageUrl,
        mobileImageUrl: b.mobileImageUrl || null,
        bgGradient: b.bgGradient || null,
        sortOrder: Number(b.sortOrder || 0),
        status: b.status || 'active',
      }, eq(heroBanners.id, id));
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update banner' });
  }
});

app.delete('/api/admin/banners/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(heroBanners).where(eq(heroBanners.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete banner' });
  }
});

// ==========================================
// 4. VITE MIDDLEWARE / PRODUCTION SERVING
// ==========================================

/** Single-row wrappers around the array-returning MySQL helpers. */
export async function insertOne<T = any>(dbOrTx: any, table: any, values: any): Promise<T> {
  const rows = (await insertReturning(dbOrTx, table, values)) as any[];
  return rows[0] as T;
}
export async function updateOne<T = any>(dbOrTx: any, table: any, values: any, where: any): Promise<T | undefined> {
  const rows = (await updateReturning(dbOrTx, table, values, where)) as any[];
  return rows[0] as T | undefined;
}
export async function deleteOne<T = any>(dbOrTx: any, table: any, where: any): Promise<T | undefined> {
  const rows = (await deleteReturning(dbOrTx, table, where)) as any[];
  return rows[0] as T | undefined;
}

/** URL slug that survives Bengali/Unicode names (falls back to a stable id). */
export function slugify(input: string): string {
  const base = String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    // \p{M} keeps combining marks — Bengali vowel signs and the hasanta.
    // Without it "পরীক্ষা" became the unreadable "পরকষ".
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || `item-${Date.now().toString(36)}`;
}

// ===========================================================================
// BACK-OFFICE / ERP MODULES
// Ledgers, procurement returns, master data, pre-orders, issues, salaries,
// product attributes, staff accounts, reports, backup and IP blocking.
// Everything under /api/pos needs the "POS Terminal" module; requirePermission
// then narrows it to the modules that particular staff account was granted.
// Everything under /api/admin is checked against the account's modules
// (requireDashboard, src/lib/permissions.ts); a route with no rule is admin-only.
// ===========================================================================

function today(): string {
  return shopDay();
}

export function actorName(req: any): string {
  return req?.session?.name || 'System';
}

function toMoney(value: any, fallback = '0'): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : fallback;
}

// ---------------------------------------------------------------------------
// Customer ledger — dues, collections and payment dates
// ---------------------------------------------------------------------------
app.get('/api/pos/customer-ledger', requirePermission('customers'), async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const customerRows = search
      ? await db
          .select()
          .from(customers)
          .where(or(like(customers.name, `%${search}%`), like(customers.phone, `%${search}%`)))
          .limit(200)
      : await db.select().from(customers).orderBy(desc(customers.totalSpent)).limit(200);

    const payments = await db
      .select()
      .from(customerPayments)
      .orderBy(desc(customerPayments.id))
      .limit(500);

    const paidByCustomer = new Map<number, number>();
    for (const p of payments) {
      if (p.customerId == null) continue;
      paidByCustomer.set(p.customerId, (paidByCustomer.get(p.customerId) || 0) + Number(p.amount));
    }

    const ledger = customerRows.map((c) => {
      const spent = Number(c.totalSpent || 0);
      const paid = paidByCustomer.get(c.id) || 0;
      return {
        ...c,
        collected: paid.toFixed(2),
        due: Math.max(0, spent - paid).toFixed(2),
      };
    });

    res.json({ customers: ledger, payments });
  } catch (error: any) {
    console.error('customer ledger:', error);
    res.status(500).json({ error: 'Could not load customer ledger.' });
  }
});

app.post('/api/pos/customer-payments', requirePermission('customers'), async (req: any, res) => {
  try {
    const { customerId, customerName, orderId, amount, method, reference, note, paymentDate } =
      req.body || {};
    if (!customerName || !String(customerName).trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }
    if (!(Number(amount) > 0)) {
      return res.status(400).json({ error: 'Enter a valid amount.' });
    }
    const row = await insertOne(db, customerPayments, {
      customerId: customerId ? Number(customerId) : null,
      customerName: String(customerName).trim(),
      orderId: orderId ? Number(orderId) : null,
      amount: toMoney(amount),
      method: method || 'cash',
      reference: reference || null,
      note: note || null,
      paymentDate: paymentDate || today(),
      recordedBy: actorName(req),
    });
    res.status(201).json(row);
  } catch (error: any) {
    console.error('customer payment:', error);
    res.status(500).json({ error: 'Could not save payment.' });
  }
});

app.delete('/api/pos/customer-payments/:id', requirePermission('customers'), async (req, res) => {
  try {
    const removed = await deleteOne(db, customerPayments, eq(customerPayments.id, Number(req.params.id)));
    if (!removed) return res.status(404).json({ error: 'Payment not found.' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not delete payment.' });
  }
});

// ---------------------------------------------------------------------------
// Supplier ledger
// ---------------------------------------------------------------------------
app.get('/api/pos/supplier-ledger', requirePermission('suppliers'), async (_req, res) => {
  try {
    const supplierRows = await db.select().from(suppliers).orderBy(asc(suppliers.name));
    const bills = await db.select().from(purchases).orderBy(desc(purchases.id)).limit(500);
    const payments = await db
      .select()
      .from(supplierPayments)
      .orderBy(desc(supplierPayments.id))
      .limit(500);

    const billed = new Map<number, number>();
    for (const b of bills) {
      if (b.supplierId == null) continue;
      billed.set(b.supplierId, (billed.get(b.supplierId) || 0) + Number(b.total));
    }
    const paid = new Map<number, number>();
    for (const b of bills) {
      if (b.supplierId == null) continue;
      paid.set(b.supplierId, (paid.get(b.supplierId) || 0) + Number(b.paid || 0));
    }
    for (const p of payments) {
      if (p.supplierId == null) continue;
      paid.set(p.supplierId, (paid.get(p.supplierId) || 0) + Number(p.amount));
    }

    const ledger = supplierRows.map((s) => {
      const totalBilled = billed.get(s.id) || 0;
      const totalPaid = paid.get(s.id) || 0;
      return {
        ...s,
        billed: totalBilled.toFixed(2),
        paid: totalPaid.toFixed(2),
        due: Math.max(0, totalBilled - totalPaid).toFixed(2),
      };
    });

    res.json({ suppliers: ledger, bills, payments });
  } catch (error: any) {
    console.error('supplier ledger:', error);
    res.status(500).json({ error: 'Could not load supplier ledger.' });
  }
});

app.post('/api/pos/supplier-payments', requirePermission('suppliers'), async (req: any, res) => {
  try {
    const { supplierId, supplierName, purchaseId, amount, method, reference, note, paymentDate } =
      req.body || {};
    if (!supplierName) return res.status(400).json({ error: 'Select a supplier.' });
    if (!(Number(amount) > 0)) return res.status(400).json({ error: 'Enter a valid amount.' });

    const row = await insertOne(db, supplierPayments, {
      supplierId: supplierId ? Number(supplierId) : null,
      supplierName: String(supplierName).trim(),
      purchaseId: purchaseId ? Number(purchaseId) : null,
      amount: toMoney(amount),
      method: method || 'cash',
      reference: reference || null,
      note: note || null,
      paymentDate: paymentDate || today(),
      recordedBy: actorName(req),
    });

    if (supplierId) {
      const sup = await db.select().from(suppliers).where(eq(suppliers.id, Number(supplierId)));
      if (sup[0]) {
        const balance = Math.max(0, Number(sup[0].balance || 0) - Number(amount));
        await db.update(suppliers).set({ balance: balance.toFixed(2) }).where(eq(suppliers.id, Number(supplierId)));
      }
    }

    res.status(201).json(row);
  } catch (error: any) {
    console.error('supplier payment:', error);
    res.status(500).json({ error: 'Could not save payment.' });
  }
});

// ---------------------------------------------------------------------------
// Purchase returns (goods back to supplier — stock decreases)
// ---------------------------------------------------------------------------
app.get('/api/pos/purchase-returns', requirePermission('purchases'), async (_req, res) => {
  try {
    const rows = await db.select().from(purchaseReturns).orderBy(desc(purchaseReturns.id)).limit(200);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Could not load purchase returns.' });
  }
});

app.post('/api/pos/purchase-returns', requirePermission('purchases'), async (req: any, res) => {
  const { supplierId, supplierName, purchaseId, reason, items } = req.body || {};
  if (!supplierName) return res.status(400).json({ error: 'Select a supplier.' });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Add at least one product.' });
  }

  try {
    const result = await db.transaction(async (tx) => {
      let total = 0;
      for (const item of items) {
        total += Number(item.unitCost) * Number(item.quantity);
      }
      await lockProductRows(tx, items.map((item: any) => item.productId));

      const returnNumber = `PR-${Date.now().toString().slice(-10)}`;
      const header = await insertOne(tx, purchaseReturns, {
        returnNumber,
        supplierId: supplierId ? Number(supplierId) : null,
        supplierName: String(supplierName).trim(),
        purchaseId: purchaseId ? Number(purchaseId) : null,
        total: total.toFixed(2),
        reason: reason || null,
        returnDate: today(),
        recordedBy: actorName(req),
      });

      for (const item of items) {
        const productId = Number(item.productId);
        const quantity = Number(item.quantity);
        const rows = await tx.select().from(products).where(eq(products.id, productId)).for('update');
        const product = rows[0];
        if (!product) throw new Error(`Product not found (#${productId}).`);
        if (product.stock < quantity) {
          throw new Error(`${product.name} — insufficient stock.`);
        }

        await tx.insert(purchaseReturnItems).values({
          returnId: header.id,
          productId,
          productName: product.name,
          quantity,
          unitCost: toMoney(item.unitCost),
          subtotal: (Number(item.unitCost) * quantity).toFixed(2),
          batchNumber: item.batchNumber || null,
        });

        const newStock = product.stock - quantity;
        await tx.update(products).set({ stock: newStock }).where(eq(products.id, productId));
        await tx.insert(inventoryTransactions).values({
          productId,
          type: 'purchase_return',
          quantity: -quantity,
          previousStock: product.stock,
          newStock,
          reference: returnNumber,
          notes: reason || 'Purchase return',
          performedBy: actorName(req),
        });
      }

      return header;
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('purchase return:', error);
    res.status(400).json({ error: error.message || 'Could not save return.' });
  }
});

// ---------------------------------------------------------------------------
// Master data: generics, manufacturers, product groups
// ---------------------------------------------------------------------------
const MASTER_TABLES: Record<string, any> = {
  generics,
  manufacturers,
  'product-groups': productGroups,
};

app.get('/api/pos/master/:type', requirePermission('products'), async (req, res) => {
  const table = MASTER_TABLES[req.params.type];
  if (!table) return res.status(404).json({ error: 'Unknown master data type.' });
  try {
    const rows = await db.select().from(table).orderBy(asc(table.name));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Could not load data.' });
  }
});

app.post('/api/pos/master/:type', requirePermission('products'), async (req, res) => {
  const table = MASTER_TABLES[req.params.type];
  if (!table) return res.status(404).json({ error: 'Unknown master data type.' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Enter a name.' });
  try {
    // Drizzle wraps driver errors, so errno is unreliable — pre-check instead.
    const existing = await db.select().from(table).where(eq(table.name, name)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An entry with this name already exists.' });
    }
    const values: any = { name };
    if (req.params.type === 'manufacturers') {
      values.contact = req.body?.contact || null;
      values.address = req.body?.address || null;
    } else {
      values.description = req.body?.description || null;
    }
    const row = await insertOne(db, table, values);
    res.status(201).json(row);
  } catch (error: any) {
    console.error('master create:', error);
    res.status(500).json({ error: 'Could not save.' });
  }
});

app.put('/api/pos/master/:type/:id', requirePermission('products'), async (req, res) => {
  const table = MASTER_TABLES[req.params.type];
  if (!table) return res.status(404).json({ error: 'Unknown master data type.' });
  try {
    const values: any = {};
    if (req.body?.name) values.name = String(req.body.name).trim();
    if (req.params.type === 'manufacturers') {
      if ('contact' in req.body) values.contact = req.body.contact || null;
      if ('address' in req.body) values.address = req.body.address || null;
    } else if ('description' in req.body) {
      values.description = req.body.description || null;
    }
    const row = await updateOne(db, table, values, eq(table.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'Entry not found.' });
    res.json(row);
  } catch {
    res.status(500).json({ error: 'Could not update.' });
  }
});

app.delete('/api/pos/master/:type/:id', requirePermission('products'), async (req, res) => {
  const table = MASTER_TABLES[req.params.type];
  if (!table) return res.status(404).json({ error: 'Unknown master data type.' });
  try {
    const row = await deleteOne(db, table, eq(table.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'Entry not found.' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not delete.' });
  }
});

// ---------------------------------------------------------------------------
// Pre-orders
// ---------------------------------------------------------------------------
app.get('/api/pos/pre-orders', requirePermission('orders'), async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const rows = status
      ? await db.select().from(preOrders).where(eq(preOrders.status, status)).orderBy(desc(preOrders.id))
      : await db.select().from(preOrders).orderBy(desc(preOrders.id)).limit(300);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Could not load pre-orders.' });
  }
});

app.post('/api/pos/pre-orders', requirePermission('orders'), async (req: any, res) => {
  try {
    const { customerName, customerPhone, productName, productId, quantity, advance, expectedDate, note } =
      req.body || {};
    if (!customerName || !customerPhone) {
      return res.status(400).json({ error: 'Customer name and mobile number are required.' });
    }
    if (!productName) return res.status(400).json({ error: 'Enter a product name.' });

    const row = await insertOne(db, preOrders, {
      customerName: String(customerName).trim(),
      customerPhone: String(customerPhone).replace(/[\s-]+/g, ''),
      productName: String(productName).trim(),
      productId: productId ? Number(productId) : null,
      quantity: Number(quantity) || 1,
      advance: toMoney(advance),
      expectedDate: expectedDate || null,
      status: 'pending',
      note: note || null,
      recordedBy: actorName(req),
    });
    res.status(201).json(row);
  } catch (error: any) {
    console.error('pre-order:', error);
    res.status(500).json({ error: 'Could not save pre-order.' });
  }
});

app.patch('/api/pos/pre-orders/:id', requirePermission('orders'), async (req, res) => {
  try {
    const allowed = ['pending', 'ordered', 'arrived', 'delivered', 'cancelled'];
    const status = String(req.body?.status || '');
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
    const row = await updateOne(db, preOrders, { status }, eq(preOrders.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'Pre-order not found.' });
    res.json(row);
  } catch {
    res.status(500).json({ error: 'Could not update.' });
  }
});

app.delete('/api/pos/pre-orders/:id', requirePermission('orders'), async (req, res) => {
  try {
    const row = await deleteOne(db, preOrders, eq(preOrders.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'Pre-order not found.' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not delete.' });
  }
});

// ---------------------------------------------------------------------------
// Product issue (damage / sample / internal use) — reduces stock
// ---------------------------------------------------------------------------
app.get('/api/pos/product-issues', requirePermission('inventory'), async (_req, res) => {
  try {
    const rows = await db.select().from(productIssues).orderBy(desc(productIssues.id)).limit(300);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Could not load product issues.' });
  }
});

app.post('/api/pos/product-issues', requirePermission('inventory'), async (req: any, res) => {
  const { productId, quantity, issueType, issuedTo, note, issueDate } = req.body || {};
  const qty = Number(quantity);
  if (!productId || !(qty > 0)) return res.status(400).json({ error: 'Select a product and quantity.' });

  try {
    const created = await db.transaction(async (tx) => {
      const rows = await tx.select().from(products).where(eq(products.id, Number(productId))).for('update');
      const product = rows[0];
      if (!product) throw new Error('Product not found.');
      if (product.stock < qty) throw new Error('Insufficient stock.');

      const newStock = product.stock - qty;
      await tx.update(products).set({ stock: newStock }).where(eq(products.id, product.id));

      const row = await insertOne(tx, productIssues, {
        productId: product.id,
        productName: product.name,
        quantity: qty,
        issueType: issueType || 'damage',
        issuedTo: issuedTo || null,
        note: note || null,
        issueDate: issueDate || today(),
        recordedBy: actorName(req),
      });

      await tx.insert(inventoryTransactions).values({
        productId: product.id,
        type: 'issue',
        quantity: -qty,
        previousStock: product.stock,
        newStock,
        reference: `ISSUE-${row.id}`,
        notes: `${issueType || 'damage'}${issuedTo ? ` → ${issuedTo}` : ''}`,
        performedBy: actorName(req),
      });

      return row;
    });

    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Could not save product issue.' });
  }
});

// ---------------------------------------------------------------------------
// Salaries
// ---------------------------------------------------------------------------
app.get('/api/pos/salaries', requirePermission('salaries'), async (req, res) => {
  try {
    const month = String(req.query.month || '').trim();
    const rows = month
      ? await db.select().from(salaries).where(eq(salaries.month, month)).orderBy(desc(salaries.id))
      : await db.select().from(salaries).orderBy(desc(salaries.id)).limit(300);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Could not load salaries.' });
  }
});

app.post('/api/pos/salaries', requirePermission('salaries'), async (req, res) => {
  try {
    const { employeeName, designation, month, basic, bonus, deduction, paidOn, status, note } =
      req.body || {};
    if (!employeeName || !month) {
      return res.status(400).json({ error: 'Employee name and month are required.' });
    }
    const netPay = Number(basic || 0) + Number(bonus || 0) - Number(deduction || 0);
    const row = await insertOne(db, salaries, {
      employeeName: String(employeeName).trim(),
      designation: designation || null,
      month: String(month).trim(),
      basic: toMoney(basic),
      bonus: toMoney(bonus),
      deduction: toMoney(deduction),
      netPay: netPay.toFixed(2),
      paidOn: paidOn || today(),
      status: status || 'paid',
      note: note || null,
    });
    res.status(201).json(row);
  } catch (error: any) {
    console.error('salary:', error);
    res.status(500).json({ error: 'Could not save salary.' });
  }
});

app.delete('/api/pos/salaries/:id', requirePermission('salaries'), async (req, res) => {
  try {
    const row = await deleteOne(db, salaries, eq(salaries.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'Record not found.' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not delete.' });
  }
});

// ---------------------------------------------------------------------------
// Product attributes (dashboard → Attributes)
// ---------------------------------------------------------------------------
export function parseValues(raw: any): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
      } catch {
        /* fall through to comma split */
      }
    }
    return trimmed
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

app.get('/api/admin/attributes', async (_req, res) => {
  try {
    const rows = await db.select().from(attributes).orderBy(asc(attributes.sortOrder), asc(attributes.id));
    res.json(
      rows.map((row) => ({
        ...row,
        values: parseValues(row.values),
      }))
    );
  } catch (error: any) {
    console.error('attributes list:', error);
    res.status(500).json({ error: 'Could not load attributes.' });
  }
});

app.post('/api/admin/attributes', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Enter an attribute name.' });
    const slug = slugify(name);
    const existing = await db
      .select()
      .from(attributes)
      .where(or(eq(attributes.name, name), eq(attributes.slug, slug)))
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An attribute with this name already exists.' });
    }
    const values = parseValues(req.body?.values);
    const row = await insertOne(db, attributes, {
      name,
      slug,
      values: JSON.stringify(values),
      sortOrder: Number(req.body?.sortOrder) || 0,
    });
    res.status(201).json({ ...row, values });
  } catch (error: any) {
    console.error('attribute create:', error);
    res.status(500).json({ error: 'Could not save attribute.' });
  }
});

app.put('/api/admin/attributes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const patch: any = {};
    if (req.body?.name) {
      patch.name = String(req.body.name).trim();
      patch.slug = slugify(patch.name);
      const clash = await db
        .select()
        .from(attributes)
        .where(eq(attributes.slug, patch.slug))
        .limit(1);
      if (clash.length > 0 && clash[0].id !== id) {
        return res.status(409).json({ error: 'Another attribute with this name already exists.' });
      }
    }
    if ('values' in (req.body || {})) patch.values = JSON.stringify(parseValues(req.body.values));
    if ('sortOrder' in (req.body || {})) patch.sortOrder = Number(req.body.sortOrder) || 0;

    const row = await updateOne(db, attributes, patch, eq(attributes.id, id));
    if (!row) return res.status(404).json({ error: 'Attribute not found.' });
    res.json({ ...row, values: parseValues(row.values) });
  } catch (error: any) {
    console.error('attribute update:', error);
    res.status(500).json({ error: 'Could not update.' });
  }
});

app.delete('/api/admin/attributes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(productAttributes).where(eq(productAttributes.attributeId, id));
    const row = await deleteOne(db, attributes, eq(attributes.id, id));
    if (!row) return res.status(404).json({ error: 'Attribute not found.' });
    res.json({ success: true });
  } catch (error: any) {
    console.error('attribute delete:', error);
    res.status(500).json({ error: 'Could not delete.' });
  }
});

/** Attributes attached to one product */
app.get('/api/admin/products/:id/attributes', async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(productAttributes)
      .where(eq(productAttributes.productId, Number(req.params.id)));
    res.json(rows.map((r) => ({ ...r, value: parseValues(r.value) })));
  } catch {
    res.status(500).json({ error: 'Could not load product attributes.' });
  }
});

/** Replace the whole attribute set of a product in one call */
app.put('/api/admin/products/:id/attributes', async (req, res) => {
  const productId = Number(req.params.id);
  const list = Array.isArray(req.body?.attributes) ? req.body.attributes : [];
  try {
    await db.transaction(async (tx) => {
      await tx.delete(productAttributes).where(eq(productAttributes.productId, productId));
      for (const item of list) {
        const attributeId = Number(item.attributeId);
        if (!Number.isFinite(attributeId)) continue;
        const values = parseValues(item.value);
        if (values.length === 0) continue;
        const attrRow = await tx.select().from(attributes).where(eq(attributes.id, attributeId)).limit(1);
        if (!attrRow[0]) continue;
        await tx.insert(productAttributes).values({
          productId,
          attributeId,
          attributeName: attrRow[0].name,
          value: JSON.stringify(values),
        });
      }
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('product attributes:', error);
    res.status(500).json({ error: 'Could not save attribute.' });
  }
});

// ---------------------------------------------------------------------------
// Suppliers — edit / delete (create already exists above)
// ---------------------------------------------------------------------------
app.put('/api/admin/suppliers/:id', async (req, res) => {
  try {
    const patch: any = {};
    for (const key of ['name', 'phone', 'email', 'company', 'address'] as const) {
      if (key in (req.body || {})) patch[key] = req.body[key] || null;
    }
    if ('balance' in (req.body || {})) patch.balance = toMoney(req.body.balance);
    if (patch.name === null) return res.status(400).json({ error: 'Supplier name is required.' });
    const row = await updateOne(db, suppliers, patch, eq(suppliers.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'Supplier not found.' });
    res.json(row);
  } catch (error: any) {
    console.error('supplier update:', error);
    res.status(500).json({ error: 'Could not update.' });
  }
});

app.delete('/api/admin/suppliers/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const linked = await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.supplierId, id)).limit(1);
    const counts = sqlRows(
      await db.execute(
        sql`SELECT (SELECT COUNT(*) FROM supplier_payments WHERE supplier_id = ${id}) AS payments,
                   (SELECT COUNT(*) FROM purchase_returns WHERE supplier_id = ${id}) AS returns`
      )
    )[0] || {};
    if (linked.length > 0 || Number(counts.payments) > 0 || Number(counts.returns) > 0) {
      // Bills, payments and returns are stock and money records, so the
      // supplier they belong to stays (the database would refuse anyway).
      return res.status(409).json({
        error: 'This supplier has purchase bills, payments or returns recorded, so it is kept — those are your stock and money records.',
      });
    }
    const row = await deleteOne(db, suppliers, eq(suppliers.id, id));
    if (!row) return res.status(404).json({ error: 'Supplier not found.' });
    res.json({ success: true });
  } catch (error: any) {
    console.error('supplier delete:', error);
    res.status(500).json({ error: 'Could not delete.' });
  }
});

// ---------------------------------------------------------------------------
// Staff accounts + access control
// ---------------------------------------------------------------------------
app.get('/api/admin/users', async (_req, res) => {
  try {
    const rows = await db.select().from(users).orderBy(asc(users.id));
    res.json(
      rows.map((row) => {
        const { passwordHash, ...safe } = row as any;
        let perms: string[] = [];
        try {
          perms = row.permissions ? JSON.parse(row.permissions) : [];
        } catch {
          perms = [];
        }
        return { ...safe, permissions: perms, hasPassword: Boolean(passwordHash) };
      })
    );
  } catch (error: any) {
    console.error('users list:', error);
    res.status(500).json({ error: 'Could not load users.' });
  }
});

app.get('/api/admin/permission-modules', (_req, res) => {
  res.json(PERMISSION_MODULES);
});

/**
 * v3.10 — a staff member who manages Staff & Access can never hand out more
 * than they have: no Administrator accounts, only modules they hold
 * themselves, and no changes to their own account or to an administrator's.
 */
function staffManagerProblem(
  session: SessionPayload | undefined,
  body: any,
  target?: { id: number; role: string | null; permissions?: string | null } | null
): string {
  if (!session || session.role === 'admin') return '';
  const mine = session.permissions || [];
  if (target && target.role === 'admin') return 'Only an administrator can change an administrator account.';
  if (target && session.sub === `staff_${target.id}`) return 'You cannot change your own account. Ask the owner.';
  if (target) {
    // An account that opens more than the manager does is out of the manager's
    // reach — otherwise a new password on it would hand over that access.
    let theirs: string[] = [];
    try {
      theirs = target.permissions ? JSON.parse(target.permissions) : [];
    } catch {
      theirs = [];
    }
    if (!Array.isArray(theirs)) theirs = [];
    if (theirs.some((p) => !mine.includes(p))) return 'This account has access you do not have. Only an administrator can change it.';
  }
  if (body?.role === 'admin') return 'Only an administrator can create an administrator account.';
  if (Array.isArray(body?.permissions)) {
    const extra = body.permissions.filter((p: string) => !mine.includes(p));
    if (extra.length > 0) return `You can only give access you have yourself (not: ${extra.join(', ')}).`;
  }
  return '';
}

app.post('/api/admin/users', async (req: any, res) => {
  try {
    const { name, email, password, phone, role, jobRole, permissions, status } = req.body || {};
    const refusal = staffManagerProblem(req.session, req.body);
    if (refusal) return res.status(403).json({ error: refusal });
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!name || !cleanEmail) return res.status(400).json({ error: 'Name and email are required.' });
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    const existing = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    if (existing.length > 0) return res.status(409).json({ error: 'An account with this email already exists.' });

    const allowed = (Array.isArray(permissions) ? permissions : []).filter((p: string) =>
      (PERMISSION_MODULES as readonly string[]).includes(p)
    );

    const row = await insertOne(db, users, {
      uid: `staff_${Date.now().toString(36)}`,
      email: cleanEmail,
      name: String(name).trim(),
      role: role === 'admin' ? 'admin' : 'staff',
      phone: phone || null,
      passwordHash: makePasswordRecord(String(password)),
      jobRole: jobRole || null,
      permissions: JSON.stringify(allowed),
      status: status === 'inactive' ? 'inactive' : 'active',
    });
    const { passwordHash, ...safe } = row as any;
    res.status(201).json({ ...safe, permissions: allowed });
  } catch (error: any) {
    console.error('user create:', error);
    res.status(500).json({ error: 'Could not create user.' });
  }
});

app.put('/api/admin/users/:id', async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (req.session?.role !== 'admin') {
      const target = (await db.select({ id: users.id, role: users.role, permissions: users.permissions }).from(users).where(eq(users.id, id)).limit(1))[0];
      const refusal = staffManagerProblem(req.session, req.body, target || null);
      if (refusal) return res.status(403).json({ error: refusal });
    }
    const patch: any = {};
    if (req.body?.name) patch.name = String(req.body.name).trim();
    if (req.body?.email) {
      const cleanEmail = String(req.body.email).toLowerCase().trim();
      const clash = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
      if (clash.length > 0 && clash[0].id !== id) {
        return res.status(409).json({ error: 'Another account with this email already exists.' });
      }
      patch.email = cleanEmail;
    }
    if ('phone' in (req.body || {})) patch.phone = req.body.phone || null;
    if ('jobRole' in (req.body || {})) patch.jobRole = req.body.jobRole || null;
    if (req.body?.role) patch.role = req.body.role === 'admin' ? 'admin' : 'staff';
    if (req.body?.status) patch.status = req.body.status === 'inactive' ? 'inactive' : 'active';
    if (Array.isArray(req.body?.permissions)) {
      patch.permissions = JSON.stringify(
        req.body.permissions.filter((p: string) => (PERMISSION_MODULES as readonly string[]).includes(p))
      );
    }
    if (req.body?.password) {
      if (String(req.body.password).length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }
      patch.passwordHash = makePasswordRecord(String(req.body.password));
    }

    const row = await updateOne(db, users, patch, eq(users.id, id));
    if (!row) return res.status(404).json({ error: 'User not found.' });
    const { passwordHash, ...safe } = row as any;
    let perms: string[] = [];
    try {
      perms = row.permissions ? JSON.parse(row.permissions) : [];
    } catch {
      perms = [];
    }
    res.json({ ...safe, permissions: perms });
  } catch (error: any) {
    console.error('user update:', error);
    res.status(500).json({ error: 'Could not update.' });
  }
});

app.delete('/api/admin/users/:id', async (req: any, res) => {
  try {
    const target = (await db.select({ uid: users.uid, id: users.id, role: users.role, permissions: users.permissions }).from(users).where(eq(users.id, Number(req.params.id))).limit(1))[0];
    const refusal = staffManagerProblem(req.session, {}, target || null);
    if (refusal) return res.status(403).json({ error: refusal });
    if (target && req.session?.sub && [String(target.uid), `staff_${req.params.id}`].includes(String(req.session.sub))) {
      return res.status(400).json({ error: 'You cannot delete the account you are signed in with.' });
    }
    const row = await deleteOne(db, users, eq(users.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'User not found.' });
    res.json({ success: true });
  } catch (error: any) {
    console.error('user delete:', error);
    res.status(500).json({ error: 'Could not delete.' });
  }
});

// ---------------------------------------------------------------------------
// Blocked IPs (dashboard → IP Block)
// ---------------------------------------------------------------------------
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;

app.get('/api/admin/blocked-ips', async (_req, res) => {
  try {
    const rows = await db.select().from(blockedIps).orderBy(desc(blockedIps.id));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Could not load the block list.' });
  }
});

app.post('/api/admin/blocked-ips', async (req: any, res) => {
  try {
    const ip = String(req.body?.ip || '').trim();
    // `103.120.5.*` blocks a whole range; anything else must be a real address.
    const isWildcard = /^(\d{1,3}\.){1,3}\*$/.test(ip);
    if (!ip || (!isWildcard && !IPV4.test(ip) && !IPV6.test(ip))) {
      return res.status(400).json({ error: 'Enter a valid IP address (e.g. 103.120.5.10 or 103.120.5.*).' });
    }
    const existing = await db.select().from(blockedIps).where(eq(blockedIps.ip, ip)).limit(1);
    if (existing.length > 0) return res.status(409).json({ error: 'This IP is already blocked.' });
    const row = await insertOne(db, blockedIps, {
      ip,
      note: req.body?.note || null,
      createdBy: actorName(req),
    });
    await refreshBlockedIps(true);
    res.status(201).json(row);
  } catch (error: any) {
    console.error('block ip:', error);
    res.status(500).json({ error: 'Could not block IP.' });
  }
});

app.delete('/api/admin/blocked-ips/:id', async (req, res) => {
  try {
    const row = await deleteOne(db, blockedIps, eq(blockedIps.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'Record not found.' });
    await refreshBlockedIps(true);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not unblock.' });
  }
});

// ---------------------------------------------------------------------------
// Customers — block / unblock / export
// ---------------------------------------------------------------------------
app.patch('/api/admin/customers/:id/status', async (req, res) => {
  try {
    const status = req.body?.status === 'blocked' ? 'blocked' : 'active';
    const row = await updateOne(db, customers, { status }, eq(customers.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'Customer not found.' });

    // Blocking a customer also blocks the last device IP they ordered from,
    // so the same machine cannot simply re-order as a guest.
    if (status === 'blocked' && row.lastIp) {
      const existing = await db.select().from(blockedIps).where(eq(blockedIps.ip, row.lastIp)).limit(1);
      if (existing.length === 0) {
        await db.insert(blockedIps).values({
          ip: row.lastIp,
          note: `Auto-blocked with customer ${row.name}`,
          createdBy: 'System',
        });
      }
    }
    if (status === 'active' && row.lastIp) {
      await db.delete(blockedIps).where(eq(blockedIps.ip, row.lastIp));
    }
    await refreshBlockedIps(true);

    res.json(customerForAdmin(row));
  } catch (error: any) {
    console.error('customer status:', error);
    res.status(500).json({ error: 'Could not update status.' });
  }
});

app.get('/api/admin/customers/export', async (_req, res) => {
  try {
    const rows = await db.select().from(customers).orderBy(desc(customers.id));
    const header = [
      'ID',
      'Name',
      'Phone',
      'Email',
      'Address',
      'Total Orders',
      'Total Spent',
      'Status',
      'Last IP',
      'Joined',
    ];
    const esc = (v: any) => {
      const str = v === null || v === undefined ? '' : String(v);
      return `"${str.replace(/"/g, '""')}"`;
    };
    const lines = [header.join(',')];
    for (const c of rows) {
      lines.push(
        [
          c.id,
          c.name,
          c.phone,
          c.email || '',
          (c.address || '').replace(/[\r\n]+/g, ' '),
          c.totalOrders ?? 0,
          c.totalSpent ?? '0.00',
          c.status,
          c.lastIp || '',
          c.createdAt ? shopDay(c.createdAt as any) : '',
        ]
          .map(esc)
          .join(',')
      );
    }
    // BOM so Excel opens the Bengali names in the right encoding
    const csv = '﻿' + lines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="customers-${today()}.csv"`);
    res.send(csv);
  } catch (error: any) {
    console.error('customer export:', error);
    res.status(500).json({ error: 'Could not export.' });
  }
});

/** Order history of one customer (Customer List → History) */
app.get('/api/admin/customers/:id/orders', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.customerId, id))
      .orderBy(desc(orders.id))
      .limit(200);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Could not load order history.' });
  }
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
app.get('/api/admin/reports', async (req, res) => {
  try {
    const from = String(req.query.from || '').trim() || '1970-01-01';
    const to = String(req.query.to || '').trim() || today();
    const fromDate = shopDayStart(String(from));
    const toDate = shopDayEnd(String(to));

    const orderRows = await db
      .select()
      .from(orders)
      .where(and(gte(orders.createdAt, fromDate), lte(orders.createdAt, toDate)));

    const completed = orderRows.filter((o) => !['cancelled', 'refunded'].includes(o.orderStatus || ''));

    const revenue = completed.reduce((sum, o) => sum + Number(o.total), 0);
    const discount = completed.reduce((sum, o) => sum + Number(o.discount || 0), 0);
    const shipping = completed.reduce((sum, o) => sum + Number(o.shippingCharge || 0), 0);

    const expenseRows = await db
      .select()
      .from(expenses)
      .where(and(gte(expenses.expenseDate, from), lte(expenses.expenseDate, to)));
    const expenseTotal = expenseRows.reduce((sum, e) => sum + Number(e.amount), 0);

    const purchaseRows = await db
      .select()
      .from(purchases)
      .where(and(gte(purchases.purchaseDate, from), lte(purchases.purchaseDate, to)));
    const purchaseTotal = purchaseRows.reduce((sum, p) => sum + Number(p.total), 0);

    const salaryRows = await db
      .select()
      .from(salaries)
      .where(and(gte(salaries.paidOn, from), lte(salaries.paidOn, to)));
    const salaryTotal = salaryRows.reduce((sum, r) => sum + Number(r.netPay), 0);

    // Daily revenue series
    const byDay = new Map<string, { date: string; orders: number; revenue: number }>();
    for (const o of completed) {
      const key = o.createdAt ? shopDay(o.createdAt as any) : today();
      const entry = byDay.get(key) || { date: key, orders: 0, revenue: 0 };
      entry.orders += 1;
      entry.revenue += Number(o.total);
      byDay.set(key, entry);
    }

    // Top products in the window
    const itemRows = await db
      .select({
        productId: orderItems.productId,
        productName: orderItems.productName,
        quantity: orderItems.quantity,
        subtotal: orderItems.subtotal,
        orderId: orderItems.orderId,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(gte(orders.createdAt, fromDate), lte(orders.createdAt, toDate)));

    const productAgg = new Map<number, { productId: number; name: string; qty: number; revenue: number }>();
    for (const item of itemRows) {
      const entry =
        productAgg.get(item.productId) || {
          productId: item.productId,
          name: item.productName,
          qty: 0,
          revenue: 0,
        };
      entry.qty += item.quantity;
      entry.revenue += Number(item.subtotal);
      productAgg.set(item.productId, entry);
    }

    const paymentAgg = new Map<string, { method: string; count: number; amount: number }>();
    for (const o of completed) {
      const key = o.paymentMethod || 'cod';
      const entry = paymentAgg.get(key) || { method: key, count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += Number(o.total);
      paymentAgg.set(key, entry);
    }

    res.json({
      range: { from, to },
      summary: {
        orders: orderRows.length,
        completedOrders: completed.length,
        cancelledOrders: orderRows.length - completed.length,
        revenue: revenue.toFixed(2),
        discount: discount.toFixed(2),
        shipping: shipping.toFixed(2),
        expenses: expenseTotal.toFixed(2),
        purchases: purchaseTotal.toFixed(2),
        salaries: salaryTotal.toFixed(2),
        netProfit: (revenue - expenseTotal - purchaseTotal - salaryTotal).toFixed(2),
        averageOrderValue: completed.length ? (revenue / completed.length).toFixed(2) : '0.00',
      },
      daily: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
      topProducts: Array.from(productAgg.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15),
      paymentBreakdown: Array.from(paymentAgg.values()).sort((a, b) => b.amount - a.amount),
      expenseRows,
    });
  } catch (error: any) {
    console.error('reports:', error);
    res.status(500).json({ error: 'Could not generate report.' });
  }
});

// ---------------------------------------------------------------------------
// v3.8 — Sales Report (website orders) and POS Sales Report (counter sales)
// Days are counted in the shop's time zone (REPORT_TIMEZONE, default
// Asia/Dhaka), so a sale at 1 am belongs to that day, not to "yesterday UTC".
// ---------------------------------------------------------------------------
const REPORT_TZ = String(process.env.REPORT_TIMEZONE || 'Asia/Dhaka');
const zonedParts = (date: Date) => {
  const parts: Record<string, string> = {};
  try {
    new Intl.DateTimeFormat('en-CA', {
      timeZone: REPORT_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
      .formatToParts(date)
      .forEach((part) => (parts[part.type] = part.value));
  } catch {
    const iso = date.toISOString();
    return { day: iso.slice(0, 10), hour: Number(iso.slice(11, 13)), weekday: date.getUTCDay() };
  }
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, weekday: weekdays[parts.weekday] ?? 0 };
};
/** The UTC instant of local midnight at the start of `day` (YYYY-MM-DD) in REPORT_TZ */
function zonedDayStart(day: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  for (let i = 0; i < 3; i += 1) {
    const local = zonedParts(guess);
    const localAsUtc = new Date(`${local.day}T${String(local.hour).padStart(2, '0')}:00:00Z`);
    const diff = localAsUtc.getTime() - new Date(`${day}T00:00:00Z`).getTime();
    if (diff === 0) break;
    guess.setTime(guess.getTime() - diff);
  }
  return guess;
}
const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const periodKey = (day: string, group: string) => {
  if (group === 'month') return day.slice(0, 7);
  if (group === 'week') {
    // Weeks start on Saturday, as most shops in Bangladesh count them
    const date = new Date(`${day}T12:00:00Z`);
    const back = (date.getUTCDay() + 1) % 7;
    date.setUTCDate(date.getUTCDate() - back);
    return date.toISOString().slice(0, 10);
  }
  return day;
};

const ONLINE_STATUS_GROUPS: Record<string, string[]> = {
  delivered: ['delivered', 'completed'],
  pending: ['pending', 'confirmed', 'processing', 'on_hold', 'shipped'],
  cancelled: ['cancelled', 'refunded', 'returned'],
};

/**
 * v3.11 — Courier report: how many parcels and products each courier carried,
 * and for how much money — delivered, returned, still on the way.
 *   GET /api/admin/reports/couriers?from=YYYY-MM-DD&to=YYYY-MM-DD&courier=redx
 * Days are counted by the day the parcel was handed over (or the order day
 * for parcels without a hand-over time), in the shop's time zone.
 */
app.get('/api/admin/reports/couriers', async (req, res) => {
  try {
    privateResponse(res);
    const todayLocal = zonedParts(new Date()).day;
    const validDay = (value: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '');
    const to = validDay(req.query.to) || todayLocal;
    const from = validDay(req.query.from) || addDays(to, -29);
    const courierFilter = String(req.query.courier || '').trim().toLowerCase().slice(0, 32);
    const start = zonedDayStart(from);
    const end = zonedDayStart(addDays(to, 1));
    const when = sql`COALESCE(o.courier_sent_at, o.created_at)`;
    const courierCond = courierFilter ? sql`AND o.courier_service = ${courierFilter}` : sql``;

    const rows = sqlRows(
      await db.execute(sql`SELECT o.id, o.order_number AS orderNumber, o.customer_name AS customerName, o.customer_phone AS customerPhone,
          o.courier_service AS courier, o.consignment_id AS consignmentId, o.tracking_code AS trackingCode,
          o.courier_status AS courierStatus, o.order_status AS orderStatus, o.payment_status AS paymentStatus,
          o.total, o.advance_paid AS advancePaid, o.shipping_charge AS shippingCharge,
          UNIX_TIMESTAMP(${when}) AS ts,
          (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) AS items
        FROM orders o
        WHERE o.courier_service IS NOT NULL AND o.courier_service <> ''
          AND ${when} >= FROM_UNIXTIME(${Math.floor(start.getTime() / 1000)})
          AND ${when} < FROM_UNIXTIME(${Math.floor(end.getTime() / 1000)})
          ${courierCond}
        ORDER BY ${when} DESC
        LIMIT 50000`)
    );

    type Bucket = {
      courier: string;
      name: string;
      parcels: number;
      items: number;
      amount: number;
      codAmount: number;
      deliveryCharge: number;
      delivered: { parcels: number; items: number; amount: number };
      returned: { parcels: number; items: number; amount: number };
      cancelled: { parcels: number; amount: number };
      inTransit: { parcels: number; items: number; amount: number };
    };
    const blank = (courier: string): Bucket => ({
      courier,
      name: courier === 'manual' ? 'In-house delivery' : courierName(courier),
      parcels: 0,
      items: 0,
      amount: 0,
      codAmount: 0,
      deliveryCharge: 0,
      delivered: { parcels: 0, items: 0, amount: 0 },
      returned: { parcels: 0, items: 0, amount: 0 },
      cancelled: { parcels: 0, amount: 0 },
      inTransit: { parcels: 0, items: 0, amount: 0 },
    });
    const outcomeOf = (row: any): 'delivered' | 'returned' | 'cancelled' | 'inTransit' => {
      const order = String(row.orderStatus || '');
      const parcel = String(row.courierStatus || '');
      if (['delivered', 'completed'].includes(order) || ['delivered', 'partial_delivered'].includes(parcel)) return 'delivered';
      if (['returned', 'partially_returned'].includes(order) || ['returned', 'returning'].includes(parcel)) return 'returned';
      if (['cancelled', 'refunded'].includes(order) || parcel === 'cancelled') return 'cancelled';
      return 'inTransit';
    };

    const byCourier = new Map<string, Bucket>();
    const total = blank('all');
    total.name = 'All couriers';
    const days = new Map<string, Record<string, number>>();
    for (const row of rows as any[]) {
      const key = String(row.courier || 'other').toLowerCase();
      const bucket = byCourier.get(key) || blank(key);
      const amount = Number(row.total) || 0;
      const items = Number(row.items) || 0;
      const cod = row.paymentStatus === 'paid' ? 0 : Math.max(0, amount - (Number(row.advancePaid) || 0));
      const outcome = outcomeOf(row);
      for (const target of [bucket, total]) {
        target.parcels += 1;
        target.items += items;
        target.amount += amount;
        target.codAmount += cod;
        target.deliveryCharge += Number(row.shippingCharge) || 0;
        if (outcome === 'cancelled') {
          target.cancelled.parcels += 1;
          target.cancelled.amount += amount;
        } else {
          target[outcome].parcels += 1;
          target[outcome].items += items;
          target[outcome].amount += amount;
        }
      }
      byCourier.set(key, bucket);
      const day = shopDay(new Date(Number(row.ts) * 1000));
      const perDay = days.get(day) || {};
      perDay[key] = (perDay[key] || 0) + 1;
      days.set(day, perDay);
    }

    const round = (value: number) => Math.round(value * 100) / 100;
    const tidy = (bucket: Bucket) => ({
      ...bucket,
      amount: round(bucket.amount),
      codAmount: round(bucket.codAmount),
      deliveryCharge: round(bucket.deliveryCharge),
      delivered: { ...bucket.delivered, amount: round(bucket.delivered.amount) },
      returned: { ...bucket.returned, amount: round(bucket.returned.amount) },
      cancelled: { ...bucket.cancelled, amount: round(bucket.cancelled.amount) },
      inTransit: { ...bucket.inTransit, amount: round(bucket.inTransit.amount) },
      deliveryRate: bucket.delivered.parcels + bucket.returned.parcels > 0
        ? Math.round((bucket.delivered.parcels / (bucket.delivered.parcels + bucket.returned.parcels)) * 1000) / 10
        : null,
    });

    const series: Array<Record<string, any>> = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      series.push({ day, ...(days.get(day) || {}) });
      if (series.length > 400) break;
    }

    res.json({
      from,
      to,
      couriers: Array.from(byCourier.values()).map(tidy).sort((a, b) => b.parcels - a.parcels),
      total: tidy(total),
      series,
      parcels: (rows as any[]).slice(0, 500).map((row) => ({
        id: Number(row.id),
        orderNumber: row.orderNumber,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        courier: row.courier,
        consignmentId: row.consignmentId,
        courierStatus: row.courierStatus,
        orderStatus: row.orderStatus,
        items: Number(row.items) || 0,
        amount: Number(row.total) || 0,
        sentAt: new Date(Number(row.ts) * 1000).toISOString(),
        outcome: outcomeOf(row),
        trackingUrl: row.consignmentId ? courierTrackingUrl(String(row.courier), String(row.consignmentId), row.trackingCode, row.orderNumber) : '',
      })),
      truncated: rows.length >= 50000,
    });
  } catch (error: any) {
    console.error('courier report:', error);
    res.status(500).json({ error: 'Could not build the courier report.' });
  }
});

app.get('/api/admin/reports/sales', async (req, res) => {
  try {
    privateResponse(res);
    const channel = String(req.query.channel || 'online') === 'pos' ? 'pos' : 'online';
    const todayLocal = zonedParts(new Date()).day;
    const validDay = (value: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '');
    const to = validDay(req.query.to) || todayLocal;
    const from = validDay(req.query.from) || addDays(to, -29);
    const group = ['day', 'week', 'month'].includes(String(req.query.group)) ? String(req.query.group) : 'day';
    const statusFilter = String(req.query.status || 'sales');
    const methodFilter = String(req.query.method || '').trim();
    const cashierFilter = String(req.query.cashier || '').trim();
    const start = zonedDayStart(from);
    const end = zonedDayStart(addDays(to, 1));
    const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    const prevStart = new Date(start.getTime() - spanDays * 86_400_000);

    const channelSql = channel === 'pos' ? sql`o.source = 'pos'` : sql`(o.source IS NULL OR o.source <> 'pos')`;
    const rows = sqlRows(
      await db.execute(sql`SELECT o.id, o.order_number AS orderNumber, UNIX_TIMESTAMP(o.created_at) AS ts, o.customer_name AS customerName,
          o.customer_phone AS customerPhone, o.subtotal, o.discount, o.shipping_charge AS shippingCharge, o.tax, o.total,
          o.cash_received AS cashReceived, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus,
          o.order_status AS orderStatus, o.cashier_name AS cashierName, o.shipping_zone AS shippingZone,
          o.landing_page_name AS landingPageName, o.is_wholesale AS isWholesale
        FROM orders o
        WHERE ${channelSql} AND o.created_at >= FROM_UNIXTIME(${Math.floor(prevStart.getTime() / 1000)})
          AND o.created_at < FROM_UNIXTIME(${Math.floor(end.getTime() / 1000)})
        ORDER BY o.created_at DESC
        LIMIT 60000`)
    );

    const isSale = (row: any) => {
      const status = String(row.orderStatus || '');
      if (channel === 'pos') return !['cancelled', 'refunded', 'returned'].includes(status);
      if (row.paymentStatus === 'failed') return false;
      return !['cancelled', 'refunded'].includes(status);
    };
    const matchesStatus = (row: any) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'sales') return isSale(row);
      if (statusFilter === 'cancelled') {
        return ONLINE_STATUS_GROUPS.cancelled.includes(String(row.orderStatus)) || row.paymentStatus === 'failed';
      }
      const groupStatuses = ONLINE_STATUS_GROUPS[statusFilter];
      return groupStatuses ? groupStatuses.includes(String(row.orderStatus)) && row.paymentStatus !== 'failed' : isSale(row);
    };
    // Instants come from UNIX_TIMESTAMP, so the database's and the server's
    // own time zones never shift a sale into the wrong day
    const instant = (row: any) => new Date(Number(row.ts) * 1000);
    const inCurrent = (row: any) => instant(row) >= start;
    const passes = (row: any) =>
      matchesStatus(row) &&
      (!methodFilter || String(row.paymentMethod || '') === methodFilter) &&
      (!cashierFilter || String(row.cashierName || '') === cashierFilter);

    const current = rows.filter((row) => inCurrent(row) && passes(row));
    const previous = rows.filter((row) => !inCurrent(row) && passes(row));
    const allCurrent = rows.filter(inCurrent);

    // Lines of the selected orders
    const ids = current.map((row) => Number(row.id));
    const lines: any[] = [];
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      lines.push(
        ...sqlRows(
          await db.execute(sql`SELECT oi.order_id AS orderId, oi.product_id AS productId, oi.product_name AS productName,
              oi.variation_label AS variationLabel, oi.quantity, oi.subtotal, oi.unit_price AS unitPrice,
              p.cost_price AS costPrice, c.name AS categoryName
            FROM order_items oi
            LEFT JOIN products p ON p.id = oi.product_id
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE oi.order_id IN (${sql.join(chunk.map((id) => sql`${id}`), sql`, `)})`)
        )
      );
    }

    const num = (value: any) => Number(value) || 0;
    const money = (value: number) => Math.round(value * 100) / 100;
    const sum = (list: any[], key: string) => list.reduce((total, row) => total + num(row[key]), 0);
    const itemsByOrder = new Map<number, number>();
    lines.forEach((line) => itemsByOrder.set(Number(line.orderId), (itemsByOrder.get(Number(line.orderId)) || 0) + num(line.quantity)));

    const netSales = sum(current, 'total');
    const cogs = lines.reduce((total, line) => total + num(line.costPrice) * num(line.quantity), 0);
    const productRevenue = sum(lines, 'subtotal');
    const costKnownRevenue = lines.filter((line) => num(line.costPrice) > 0).reduce((total, line) => total + num(line.subtotal), 0);
    const discount = sum(current, 'discount');
    const grossProfit = productRevenue - discount - cogs;

    // Returns booked in the period against this channel's orders
    const returnRows = sqlRows(
      await db
        .execute(sql`SELECT r.refund_amount AS refundAmount, r.items_amount AS itemsAmount
          FROM order_returns r JOIN orders o ON o.id = r.order_id
          WHERE ${channelSql} AND r.created_at >= FROM_UNIXTIME(${Math.floor(start.getTime() / 1000)})
            AND r.created_at < FROM_UNIXTIME(${Math.floor(end.getTime() / 1000)}) AND r.status <> 'cancelled'`)
        .catch(() => [[]])
    );
    const returnsAmount = returnRows.reduce((total, row) => total + num(row.refundAmount || row.itemsAmount), 0);

    const settingsInfo = await readInvoiceSettings().catch(() => ({ general: { paymentMethods: [] } } as any));
    const methodsList = settingsInfo.general?.paymentMethods || [];

    // Series, with every period present (zero when nothing was sold)
    const seriesMap = new Map<string, { key: string; orders: number; sales: number; items: number }>();
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const key = periodKey(day, group);
      if (!seriesMap.has(key)) seriesMap.set(key, { key, orders: 0, sales: 0, items: 0 });
      if (seriesMap.size > 800) break;
    }
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, sales: 0 }));
    const weekdays = Array.from({ length: 7 }, (_, weekday) => ({ weekday, orders: 0, sales: 0 }));
    const tally = (map: Map<string, any>, key: string, amount: number, extra: Record<string, any> = {}) => {
      const entry = map.get(key) || { key, count: 0, amount: 0, ...extra };
      entry.count += 1;
      entry.amount += amount;
      map.set(key, entry);
    };
    const payments = new Map<string, any>();
    const statuses = new Map<string, any>();
    const cashiers = new Map<string, any>();
    const zones = new Map<string, any>();
    const sources = new Map<string, any>();
    const customersSeen = new Set<string>();
    for (const row of current) {
      const local = zonedParts(instant(row));
      const key = periodKey(local.day, group);
      const entry = seriesMap.get(key) || { key, orders: 0, sales: 0, items: 0 };
      entry.orders += 1;
      entry.sales += num(row.total);
      entry.items += itemsByOrder.get(Number(row.id)) || 0;
      seriesMap.set(key, entry);
      hours[local.hour].orders += 1;
      hours[local.hour].sales += num(row.total);
      weekdays[local.weekday].orders += 1;
      weekdays[local.weekday].sales += num(row.total);
      tally(payments, String(row.paymentMethod || 'cod'), num(row.total));
      tally(statuses, String(row.orderStatus || 'pending'), num(row.total));
      if (channel === 'pos') tally(cashiers, String(row.cashierName || 'Unknown'), num(row.total));
      else {
        tally(zones, String(row.shippingZone || 'Not set'), num(row.total));
        tally(sources, row.landingPageName ? `Landing: ${row.landingPageName}` : row.isWholesale ? 'Website (wholesale)' : 'Website', num(row.total));
      }
      if (row.customerPhone && row.customerPhone !== '01900000000') customersSeen.add(String(row.customerPhone));
    }

    const productMap = new Map<string, any>();
    const categoryMap = new Map<string, any>();
    for (const line of lines) {
      const key = `${line.productId}|${line.variationLabel || ''}`;
      const entry =
        productMap.get(key) ||
        { productId: Number(line.productId), name: line.productName, variation: line.variationLabel || '', qty: 0, revenue: 0, cost: 0, costKnown: true };
      entry.qty += num(line.quantity);
      entry.revenue += num(line.subtotal);
      entry.cost += num(line.costPrice) * num(line.quantity);
      if (!(num(line.costPrice) > 0)) entry.costKnown = false;
      productMap.set(key, entry);
      const category = String(line.categoryName || 'Uncategorised');
      const cat = categoryMap.get(category) || { name: category, qty: 0, revenue: 0 };
      cat.qty += num(line.quantity);
      cat.revenue += num(line.subtotal);
      categoryMap.set(category, cat);
    }

    const list = (map: Map<string, any>) =>
      Array.from(map.values())
        .map((entry) => ({ ...entry, amount: money(entry.amount) }))
        .sort((a, b) => b.amount - a.amount);
    const allCancelled = allCurrent.filter(
      (row) => ONLINE_STATUS_GROUPS.cancelled.includes(String(row.orderStatus)) || (channel === 'online' && row.paymentStatus === 'failed')
    );

    res.json({
      channel,
      timezone: REPORT_TZ,
      range: { from, to, group, days: spanDays },
      filters: { status: statusFilter, method: methodFilter, cashier: cashierFilter },
      summary: {
        orders: current.length,
        itemsSold: lines.reduce((total, line) => total + num(line.quantity), 0),
        grossSales: money(sum(current, 'subtotal')),
        discount: money(discount),
        delivery: money(sum(current, 'shippingCharge')),
        tax: money(sum(current, 'tax')),
        netSales: money(netSales),
        averageOrder: current.length ? money(netSales / current.length) : 0,
        cogs: money(cogs),
        grossProfit: money(grossProfit),
        margin: productRevenue > 0 ? Math.round((grossProfit / Math.max(1, productRevenue - discount)) * 1000) / 10 : 0,
        costCoverage: productRevenue > 0 ? Math.round((costKnownRevenue / productRevenue) * 100) : 0,
        paid: money(current.filter((row) => row.paymentStatus === 'paid').reduce((total, row) => total + num(row.total), 0)),
        unpaid: money(current.filter((row) => row.paymentStatus !== 'paid').reduce((total, row) => total + num(row.total), 0)),
        returnsCount: returnRows.length,
        returnsAmount: money(returnsAmount),
        netAfterReturns: money(netSales - returnsAmount),
        customers: customersSeen.size,
        cancelledOrders: allCancelled.length,
        cancelledAmount: money(allCancelled.reduce((total, row) => total + num(row.total), 0)),
      },
      previous: { orders: previous.length, netSales: money(sum(previous, 'total')) },
      series: Array.from(seriesMap.values())
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((entry) => ({ ...entry, sales: money(entry.sales) })),
      hours: hours.map((entry) => ({ ...entry, sales: money(entry.sales) })),
      weekdays: weekdays.map((entry) => ({ ...entry, sales: money(entry.sales) })),
      payments: list(payments).map((entry) => ({ ...entry, method: entry.key, label: paymentMethodLabel(entry.key, methodsList) })),
      statuses: list(statuses),
      cashiers: list(cashiers),
      zones: list(zones),
      sources: list(sources),
      products: Array.from(productMap.values())
        .map((entry) => ({ ...entry, revenue: money(entry.revenue), cost: money(entry.cost), profit: entry.costKnown ? money(entry.revenue - entry.cost) : null }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 100),
      categories: Array.from(categoryMap.values())
        .map((entry) => ({ ...entry, revenue: money(entry.revenue) }))
        .sort((a, b) => b.revenue - a.revenue),
      cashierNames: Array.from(new Set(allCurrent.map((row) => String(row.cashierName || '')).filter(Boolean))).sort(),
      methodOptions: Array.from(new Set(allCurrent.map((row) => String(row.paymentMethod || '')).filter(Boolean))).map((method) => ({
        value: method,
        label: paymentMethodLabel(method, methodsList),
      })),
      orders: current.slice(0, 3000).map((row) => ({
        id: Number(row.id),
        orderNumber: row.orderNumber,
        createdAt: instant(row).toISOString(),
        day: zonedParts(instant(row)).day,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        items: itemsByOrder.get(Number(row.id)) || 0,
        paymentMethod: row.paymentMethod,
        paymentLabel: paymentMethodLabel(row.paymentMethod, methodsList),
        paymentStatus: row.paymentStatus,
        orderStatus: row.orderStatus,
        subtotal: money(num(row.subtotal)),
        discount: money(num(row.discount)),
        delivery: money(num(row.shippingCharge)),
        tax: money(num(row.tax)),
        total: money(num(row.total)),
        cashier: row.cashierName || '',
        zone: row.shippingZone || '',
        landing: row.landingPageName || '',
      })),
      truncated: current.length > 3000,
    });
  } catch (error: any) {
    console.error('sales report:', error?.message || error);
    res.status(500).json({ error: 'Could not build the sales report.' });
  }
});

// ---------------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------------
const BACKUP_TABLES: Array<[string, any]> = [
  ['users', users],
  ['categories', categories],
  ['brands', brands],
  ['products', products],
  ['attributes', attributes],
  ['product_attributes', productAttributes],
  ['customers', customers],
  ['suppliers', suppliers],
  ['orders', orders],
  ['order_items', orderItems],
  ['inventory_transactions', inventoryTransactions],
  ['purchases', purchases],
  ['purchase_items', purchaseItems],
  ['purchase_returns', purchaseReturns],
  ['purchase_return_items', purchaseReturnItems],
  ['customer_payments', customerPayments],
  ['supplier_payments', supplierPayments],
  ['coupons', coupons],
  ['site_settings', siteSettings],
  ['hero_banners', heroBanners],
  ['reviews', reviews],
  ['expenses', expenses],
  ['counter_sessions', counterSessions],
  ['generics', generics],
  ['manufacturers', manufacturers],
  ['product_groups', productGroups],
  ['pre_orders', preOrders],
  ['product_issues', productIssues],
  ['salaries', salaries],
  ['blocked_ips', blockedIps],
  // v3.7 — variations were missing from the backup, so a restore lost them
  ['product_variations', productVariations],
];

function sqlEscape(value: any): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\n/g, '\\n').replace(/\r/g, '')}'`;
}

app.get('/api/admin/backup', async (_req, res) => {
  try {
    let dump = `-- Topper IT store data backup\n-- Generated: ${new Date().toISOString()}\n`;
    dump += `SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n`;

    for (const [name, table] of BACKUP_TABLES) {
      const rows = await db.select().from(table);
      if (rows.length === 0) continue;
      // Drizzle hands back camelCase keys; the dump must use real column names.
      const columnMap = getTableColumns(table) as Record<string, any>;
      const keys = Object.keys(rows[0]).filter((key) => columnMap[key]);
      dump += `-- ${name} (${rows.length} rows)\n`;
      for (const row of rows as any[]) {
        const cols = keys.map((k) => `\`${columnMap[k].name}\``).join(', ');
        const vals = keys.map((k) => sqlEscape(row[k])).join(', ');
        dump += `REPLACE INTO \`${name}\` (${cols}) VALUES (${vals});\n`;
      }
      dump += '\n';
    }

    dump += 'SET FOREIGN_KEY_CHECKS=1;\n';
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${today()}.sql"`);
    res.send(dump);
  } catch (error: any) {
    console.error('backup:', error);
    res.status(500).json({ error: 'Could not create backup.' });
  }
});

app.get('/api/admin/backup/stats', async (_req, res) => {
  try {
    const stats: Array<{ table: string; rows: number }> = [];
    for (const [name, table] of BACKUP_TABLES) {
      const rows = await db.select({ count: sql<number>`count(*)` }).from(table);
      stats.push({ table: name, rows: Number(rows[0]?.count || 0) });
    }
    res.json(stats);
  } catch {
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

// ===========================================================================
// PRODUCT VARIATIONS
// A product with variations gets its stock and price from the variation rows,
// never from the product row — that is the single source of truth so the two
// cannot drift apart.
// ===========================================================================

export function buildVariationLabel(combination: Record<string, string>): string {
  return Object.values(combination)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join(' / ');
}

/**
 * Who already uses one of these barcodes: another product's barcode or SKU, or
 * a variation of another product. `productId` is the product being saved (its
 * own rows are not a clash).
 */
export async function findBarcodeOwner(
  codes: string[],
  options: { productId?: number | null; skipVariationsOf?: number | null } = {}
): Promise<{ code: string; owner: string } | null> {
  const list = Array.from(new Set(codes.map((code) => String(code || '').trim()).filter(Boolean)));
  if (list.length === 0) return null;
  const selfId = Number(options.productId) || 0;
  const rows: any = await db.execute(
    sql`SELECT p.name AS productName, v.label AS variationLabel, v.barcode AS code
        FROM product_variations v JOIN products p ON p.id = v.product_id
        WHERE v.barcode IN (${sql.join(list.map((code) => sql`${code}`), sql`, `)}) AND v.product_id <> ${selfId}
        LIMIT 1`
  );
  const variation = Array.isArray(rows?.[0]) ? rows[0][0] : null;
  if (variation) return { code: variation.code, owner: `"${variation.productName} — ${variation.variationLabel}"` };
  const productRows: any = await db.execute(
    sql`SELECT name, barcode, sku FROM products
        WHERE (barcode IN (${sql.join(list.map((code) => sql`${code}`), sql`, `)}) OR sku IN (${sql.join(list.map((code) => sql`${code}`), sql`, `)}))
          AND id <> ${selfId} AND status <> 'deleted'
        LIMIT 1`
  );
  const product = Array.isArray(productRows?.[0]) ? productRows[0][0] : null;
  if (product) {
    const code = list.find((item) => item === product.barcode || item === product.sku) || list[0];
    return { code, owner: `"${product.name}"` };
  }
  return null;
}

/** A product barcode/SKU that a variation of ANOTHER product already prints */
export async function findVariationBarcodeClash(codes: any[], productId: number | null): Promise<string | null> {
  const list = codes.map((code) => String(code ?? '').trim()).filter(Boolean);
  if (list.length === 0) return null;
  const rows: any = await db.execute(
    sql`SELECT p.name AS productName, v.label AS variationLabel, v.barcode AS code
        FROM product_variations v JOIN products p ON p.id = v.product_id
        WHERE v.barcode IN (${sql.join(list.map((code) => sql`${code}`), sql`, `)}) AND v.product_id <> ${Number(productId) || 0}
        LIMIT 1`
  );
  const hit = Array.isArray(rows?.[0]) ? rows[0][0] : null;
  return hit ? `Barcode ${hit.code} is already printed on "${hit.productName} — ${hit.variationLabel}".` : null;
}

/** Variations of one product, admin view */
app.get('/api/admin/products/:id/variations', async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(productVariations)
      .where(eq(productVariations.productId, Number(req.params.id)))
      .orderBy(asc(productVariations.sortOrder), asc(productVariations.id));
    res.json(
      rows.map((row) => ({
        ...row,
        combination: (() => {
          try {
            return JSON.parse(row.combination);
          } catch {
            return {};
          }
        })(),
      }))
    );
  } catch (error: any) {
    console.error('variations list:', error);
    res.status(500).json({ error: 'Could not load variations.' });
  }
});

/**
 * Replace the whole variation set of a product in one call. Existing rows are
 * matched by id so stock already recorded against a variation survives an edit.
 */
app.put('/api/admin/products/:id/variations', async (req, res) => {
  const productId = Number(req.params.id);
  const list = Array.isArray(req.body?.variations) ? req.body.variations : [];

  // v3.7 — barcodes must identify exactly one thing at the POS
  const cleanCode = (value: any) => String(value ?? '').trim().slice(0, 64);
  const codes = list.map((item: any) => cleanCode(item?.barcode)).filter(Boolean);
  const dupInList = codes.find((code: string, index: number) => codes.indexOf(code) !== index);
  if (dupInList) return res.status(400).json({ error: `Barcode ${dupInList} is used on two variations. Each option needs its own barcode.` });
  for (const item of list) {
    const raw = item?.wholesalePrice;
    if (raw !== '' && raw != null && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
      return res.status(400).json({ error: 'Enter a valid wholesale price for every variation (or leave it blank).' });
    }
  }
  if (codes.length > 0) {
    const clash = await findBarcodeOwner(codes, { productId });
    if (clash) return res.status(400).json({ error: `Barcode ${clash.code} is already used by ${clash.owner}.` });
  }

  try {
    await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(productVariations)
        .where(eq(productVariations.productId, productId));
      const keepIds = new Set<number>();

      for (let index = 0; index < list.length; index += 1) {
        const item = list[index];
        const combination =
          item.combination && typeof item.combination === 'object' ? item.combination : {};
        const label = item.label || buildVariationLabel(combination) || `Variation ${index + 1}`;

        const values = {
          productId,
          combination: JSON.stringify(combination),
          label,
          sku: item.sku || null,
          price: item.price === '' || item.price == null ? null : Number(item.price).toFixed(2),
          salePrice:
            item.salePrice === '' || item.salePrice == null ? null : Number(item.salePrice).toFixed(2),
          stock: Math.max(0, Number(item.stock) || 0),
          image: item.image || null,
          status: item.status === 'inactive' ? 'inactive' : 'active',
          sortOrder: index,
          barcode: cleanCode(item.barcode) || null,
          wholesalePrice:
            item.wholesalePrice === '' || item.wholesalePrice == null || !(Number(item.wholesalePrice) > 0)
              ? null
              : Number(item.wholesalePrice).toFixed(2),
        };

        const id = Number(item.id);
        if (Number.isFinite(id) && existing.some((row) => row.id === id)) {
          await tx.update(productVariations).set(values).where(eq(productVariations.id, id));
          keepIds.add(id);
        } else {
          const created = await insertOne(tx, productVariations, values);
          if (created?.id) keepIds.add(created.id);
        }
      }

      for (const row of existing) {
        if (!keepIds.has(row.id)) {
          await tx.delete(productVariations).where(eq(productVariations.id, row.id));
        }
      }

      // Product-level stock mirrors the sum of its variations so every existing
      // low-stock / out-of-stock listing keeps working untouched.
      const hasVariations = list.length > 0;
      const totalStock = list.reduce((sum: number, item: any) => sum + (Number(item.stock) || 0), 0);
      await tx
        .update(products)
        .set(hasVariations ? { hasVariations: true, stock: totalStock } : { hasVariations: false })
        .where(eq(products.id, productId));
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('variations save:', error);
    res.status(500).json({ error: 'Could not save variations.' });
  }
});
// Product import / export (Dashboard → Products → Import / Export) → src/server/routes/productImportExport.ts
registerProductImportExportRoutes({
  get actorName() {
    return actorName;
  },
  get app() {
    return app;
  },
  get APP_VERSION() {
    return APP_VERSION;
  },
  get appendToMediaLibrary() {
    return appendToMediaLibrary;
  },
  get buildVariationLabel() {
    return buildVariationLabel;
  },
  get cache() {
    return cache;
  },
  get findBarcodeOwner() {
    return findBarcodeOwner;
  },
  get humanSize() {
    return humanSize;
  },
  get insertOne() {
    return insertOne;
  },
  get MEDIA_MAX_BYTES() {
    return MEDIA_MAX_BYTES;
  },
  get MEDIA_TYPES() {
    return MEDIA_TYPES;
  },
  get NOT_DELETED() {
    return NOT_DELETED;
  },
  get parseValues() {
    return parseValues;
  },
  get privateResponse() {
    return privateResponse;
  },
  get productExtras() {
    return productExtras;
  },
  get publicOrigin() {
    return publicOrigin;
  },
  get rememberGeneric() {
    return rememberGeneric;
  },
  get saveUploadedFile() {
    return saveUploadedFile;
  },
  get scheduleCacheVersionBump() {
    return scheduleCacheVersionBump;
  },
  get shippingChargesValue() {
    return shippingChargesValue;
  },
  get shopDay() {
    return shopDay;
  },
  get slugify() {
    return slugify;
  },
  get uploadsDir() {
    return uploadsDir;
  },
});
// Incomplete / abandoned checkouts → src/server/routes/incompleteOrders.ts
registerIncompleteOrderRoutes({
  get app() {
    return app;
  },
  get attachItemImages() {
    return attachItemImages;
  },
  get clientIp() {
    return clientIp;
  },
  get deleteOne() {
    return deleteOne;
  },
  get INTERNAL_ORDER_KEY() {
    return INTERNAL_ORDER_KEY;
  },
  get PORT() {
    return PORT;
  },
});
// Bulk actions — orders and products (status, courier, delete) → src/server/routes/bulkActions.ts
registerBulkActionRoutes({
  get actorName() {
    return actorName;
  },
  get API_COURIERS() {
    return API_COURIERS;
  },
  get app() {
    return app;
  },
  get assignOrders() {
    return assignOrders;
  },
  get bookWithCourier() {
    return bookWithCourier;
  },
  get courierName() {
    return courierName;
  },
  get courierTrackingUrl() {
    return courierTrackingUrl;
  },
  get deleteOrderAndRestock() {
    return deleteOrderAndRestock;
  },
  get deleteProductForGood() {
    return deleteProductForGood;
  },
  get notifyOrderStatusSms() {
    return notifyOrderStatusSms;
  },
  get syncOrderStock() {
    return syncOrderStock;
  },
});
// Password reset — customers, staff and the owner (codes by SMS / email, reset links) → src/server/routes/passwordReset.ts
registerPasswordResetRoutes({
  get app() {
    return app;
  },
  get bdMobile() {
    return bdMobile;
  },
  get clearLoginFailures() {
    return clearLoginFailures;
  },
  get clientIp() {
    return clientIp;
  },
  get DEFAULT_ADMIN_AUTH() {
    return DEFAULT_ADMIN_AUTH;
  },
  get emailBrand() {
    return emailBrand;
  },
  get emailLayout() {
    return emailLayout;
  },
  get emailReady() {
    return emailReady;
  },
  get escapeHtml() {
    return escapeHtml;
  },
  get fillTemplate() {
    return fillTemplate;
  },
  get loginThrottle() {
    return loginThrottle;
  },
  get makePasswordRecord() {
    return makePasswordRecord;
  },
  get noteLoginFailure() {
    return noteLoginFailure;
  },
  get notifyAdmin() {
    return notifyAdmin;
  },
  get passwordChangedCache() {
    return passwordChangedCache;
  },
  get privateResponse() {
    return privateResponse;
  },
  get publicOrigin() {
    return publicOrigin;
  },
  get readEmailConfig() {
    return readEmailConfig;
  },
  get readSmsConfig() {
    return readSmsConfig;
  },
  get safeEqual() {
    return safeEqual;
  },
  get sendEmail() {
    return sendEmail;
  },
  get sendSms() {
    return sendSms;
  },
  get SESSION_SECRET() {
    return SESSION_SECRET;
  },
  get sha256() {
    return sha256;
  },
  get smsEventConfig() {
    return smsEventConfig;
  },
  get smsGatewayReady() {
    return smsGatewayReady;
  },
  get sqlRows() {
    return sqlRows;
  },
});

// ===========================================================================
// CACHE VERSION
// "Clear Cache" used to wipe browser storage, which took real settings with it.
// Instead the server keeps a version stamp: bumping it tells every open browser
// to re-fetch, and nothing in the database is touched.
// ===========================================================================

/**
 * The cache version, read from the database at most every few seconds so the
 * HTML of every page view can carry it without a query per visitor.
 */
let cacheVersionMemo = { at: 0, version: 1 };
async function readCacheVersion(fresh = false): Promise<number> {
  if (!fresh && Date.now() - cacheVersionMemo.at < 3000) return cacheVersionMemo.version;
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'cache_version')).limit(1);
    let version = 1;
    try {
      version = rows[0] ? Number(JSON.parse(rows[0].value)?.version) || 1 : 1;
    } catch {
      version = 1;
    }
    cacheVersionMemo = { at: Date.now(), version };
  } catch {
    cacheVersionMemo = { at: Date.now(), version: cacheVersionMemo.version };
  }
  return cacheVersionMemo.version;
}

async function bumpCacheVersion(by: string): Promise<number> {
  const next = (await readCacheVersion(true)) + 1;
  const payload = JSON.stringify({ version: next, flushedAt: new Date().toISOString(), by });
  await db
    .insert(siteSettings)
    .values({ key: 'cache_version', value: payload })
    .onDuplicateKeyUpdate({ set: { value: payload } });
  cacheVersionMemo = { at: Date.now(), version: next };
  return next;
}

/**
 * v3.7 — a dashboard save reaches the website on a normal reload.
 * Visitors' browsers keep a short-lived copy of settings, banners and the
 * catalogue for speed. Any successful dashboard write now moves the cache
 * version (debounced, so a bulk edit is one bump), every page view carries the
 * current version, and a browser holding an older copy drops it at once. The
 * Clear Cache button is no longer needed after ordinary edits.
 */
let cacheBumpRunning = false;
let cacheBumpAgain = false;
export function scheduleCacheVersionBump() {
  // One bump at a time; writes that land meanwhile share a single follow-up bump
  if (cacheBumpRunning) {
    cacheBumpAgain = true;
    return;
  }
  cacheBumpRunning = true;
  bumpCacheVersion('auto')
    .catch((error) => console.error('cache version bump:', error?.message || error))
    .finally(() => {
      cacheBumpRunning = false;
      if (cacheBumpAgain) {
        cacheBumpAgain = false;
        scheduleCacheVersionBump();
      }
    });
}

app.get('/api/cache-version', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  // A save made a moment ago may still be inside the debounce window
  res.json({ version: await readCacheVersion(cacheBumpRunning) });
});

app.post('/api/admin/cache/flush', async (req: any, res) => {
  try {
    const next = await bumpCacheVersion(actorName(req));
    await cache.invalidate();
    res.json({ success: true, version: next });
  } catch (error: any) {
    console.error('cache flush:', error);
    res.status(500).json({ error: 'Could not clear cache.' });
  }
});


// ===========================================================================
// SERVER-RENDERED <head>
// Facebook, WhatsApp and Google never execute JavaScript, so a client-side
// document.title update is invisible to them. Every HTML response therefore
// gets its meta block rewritten here from the store's own settings — and a
// shared product link gets that product's name, price and photo.
// ===========================================================================

const META_START = '<!--SSR-META-START-->';
const META_END = '<!--SSR-META-END-->';

export function escapeHtml(value: any): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Absolute URL for a stored path, needed because OG images must be absolute */
function absoluteUrl(req: express.Request, value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const configured = (process.env.APP_URL || '').replace(/\/+$/, '');
  const base = configured || `${req.protocol}://${req.get('host')}`;
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

interface HeadMeta {
  title: string;
  description: string;
  image: string;
  icon: string;
  /** brand colour for the plain tab icon when no favicon/logo is set */
  iconColor?: string;
  type: string;
  siteName: string;
  url: string;
  /** v3.15 — a product's own tags */
  keywords?: string;
}

async function buildHeadMeta(req: express.Request): Promise<HeadMeta> {
  const rows = await db.select().from(siteSettings);
  const map: Record<string, any> = {};
  for (const row of rows) {
    try {
      map[row.key] = JSON.parse(row.value);
    } catch {
      map[row.key] = row.value;
    }
  }

  const seo = map.seo_config || {};
  const general = map.general || {};
  const logo = map.logo_config || {};

  const siteName = String(general.storeName || logo.pharmacyName || seo.siteTitle || '').trim();
  let title = String(seo.siteTitle || siteName || '').trim();
  let description = String(seo.metaDescription || general.tagline || '').trim();
  let image = absoluteUrl(req, seo.ogImageUrl || logo.desktopLogoUrl || '');
  let type = 'website';
  let keywords = '';

  // A shared product link should preview that product, not the home page
  const match = req.path.match(/^\/product\/([^/?#]+)/);
  if (match) {
    try {
      const slug = decodeURIComponent(match[1]);
      const found = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
      const product = found[0];
      if (product) {
        const currency = general.currency || '৳';
        const price = Number(product.salePrice || product.price || 0);
        // v3.15 — the product's own SEO title / description / share picture win
        const seoTitle = String((product as any).seoTitle || '').trim();
        title = seoTitle || `${product.name}${siteName ? ` | ${siteName}` : ''}`;
        description =
          String((product as any).seoDescription || product.shortDescription || product.description || description || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 300) || `${currency}${price}`;
        const picture = String((product as any).seoImage || '').trim() || product.image;
        if (picture) image = absoluteUrl(req, picture);
        type = 'product';
        keywords = String((product as any).tags || '').trim();
      }
    } catch {
      /* fall back to the site-wide meta */
    }
  }

  // Blog posts and landing pages preview with their own title and picture
  const blogMatch = req.path.match(/^\/blog\/([^/?#]+)/);
  if (blogMatch) {
    try {
      const slug = decodeURIComponent(blogMatch[1]);
      const result: any = await db.execute(
        sql`SELECT title, excerpt, cover_image, meta_title, meta_description FROM blog_posts WHERE slug = ${slug} AND status = 'published' LIMIT 1`
      );
      const post = (Array.isArray(result?.[0]) ? result[0] : [])[0];
      if (post) {
        title = `${post.meta_title || post.title}${siteName ? ` | ${siteName}` : ''}`;
        description = String(post.meta_description || post.excerpt || description).slice(0, 200);
        if (post.cover_image) image = absoluteUrl(req, post.cover_image);
        type = 'article';
      }
    } catch {
      /* site-wide meta */
    }
  }
  const landingMatch = req.path.match(/^\/lp\/([^/?#]+)/);
  if (landingMatch) {
    try {
      const slug = decodeURIComponent(landingMatch[1]);
      const result: any = await db.execute(sql`SELECT title, content FROM landing_pages WHERE slug = ${slug} AND status = 'active' LIMIT 1`);
      const page = (Array.isArray(result?.[0]) ? result[0] : [])[0];
      if (page) {
        let content: any = {};
        try {
          content = JSON.parse(page.content || '{}') || {};
        } catch {
          content = {};
        }
        title = String(content.seo?.title || content.hero?.title || page.title);
        description = String(content.seo?.description || content.hero?.subtitle || description).slice(0, 200);
        const picture = content.seo?.image || content.hero?.image;
        if (picture) image = absoluteUrl(req, picture);
        type = 'product';
      }
    } catch {
      /* site-wide meta */
    }
  }

  // v3.12 — never an empty description: search engines would write their own
  if (!description) {
    try {
      const names = await db
        .select({ name: categories.name })
        .from(categories)
        .orderBy(desc(categories.featured), asc(categories.sortOrder))
        .limit(6);
      description = fallbackDescription(siteName || title, String(general.tagline || '').trim(), names.map((row) => row.name));
    } catch {
      description = fallbackDescription(siteName || title, String(general.tagline || '').trim(), []);
    }
  }

  return {
    title: title || siteName || 'Online Store',
    description,
    image,
    // No favicon set: the logo, else a plain square in the shop's own colour
    icon: absoluteUrl(req, seo.faviconUrl || logo.mobileLogoUrl || logo.desktopLogoUrl || ''),
    iconColor: SAFE_COLOR.test(String(map.theme?.primaryColor || '')) ? String(map.theme.primaryColor) : '#475569',
    type,
    siteName: siteName || title || 'Online Store',
    url: absoluteUrl(req, canonicalPath(req.originalUrl || '/')),
    keywords: keywords || undefined,
  };
}

/** The page address without tracking extras (?fbclid=, ?utm_source=…), for rel=canonical */
function canonicalPath(original: string): string {
  const [pathPart, query = ''] = String(original || '/').split('#')[0].split('?');
  const keep = new URLSearchParams();
  const params = new URLSearchParams(query);
  for (const key of ['category', 'brand', 'generic', 'page', 'flashSale']) {
    const value = params.get(key);
    if (value) keep.set(key, value);
  }
  const rest = keep.toString();
  return `${pathPart || '/'}${rest ? `?${rest}` : ''}`;
}

/**
 * v3.12 — structured data + a plain-HTML copy of the page text for crawlers
 * that do not run JavaScript (see src/server/seo.ts). Cached per address.
 */
const SEO_SKIP = /^\/(admin|dashboard|pos|api|checkout|cart|account|login|signup|reset-password|invoice|payment)(\/|$)/i;
async function buildSeoBlocks(
  req: express.Request,
  meta: HeadMeta
): Promise<{ head: string; body: string; tracking?: string; trackingBody?: string }> {
  const boot: any = await cachedBoot();
  const settings = boot?.settings || {};
  // Analytics / pixel tags on every website page (never the dashboard or POS)
  const tracking = /^\/(admin|dashboard|pos)(\/|$)/i.test(req.path || '/') ? '' : trackingHeadTags(settings.marketing);
  const trackingBody = tracking ? trackingBodyTags(settings.marketing) : '';
  if (SEO_SKIP.test(req.path || '/')) return { head: '', body: '', tracking, trackingBody };
  const general = settings.general || {};
  const logo = settings.logo_config || {};
  const origin = absoluteUrl(req, '/').replace(/\/+$/, '');

  const social: string[] = [];
  const socialCfg = settings.social_config || {};
  for (const [key, value] of Object.entries(socialCfg)) {
    if (key === 'order' || key === 'iconStyle' || key === 'iconShape') continue;
    const url = String((value as any)?.url || '').trim();
    if ((value as any)?.enabled !== false && /^https?:\/\//i.test(url)) social.push(url);
  }

  const toSeoProduct = (row: any, cat?: any, brand?: any) => ({
    name: row.name,
    slug: row.slug,
    price: Number(row.price) || 0,
    salePrice: row.salePrice ? Number(row.salePrice) : null,
    image: row.image || null,
    sku: row.sku || null,
    stock: row.hasVariations ? null : Number(row.stock ?? 0),
    description: row.shortDescription || row.description || '',
    categoryName: cat?.name || null,
    categorySlug: cat?.slug || null,
    brandName: brand?.name || null,
    rating: row.rating ? Number(row.rating) : null,
    reviewCount: row.reviewCount ? Number(row.reviewCount) : 0,
  });

  const catRows = await db
    .select({ name: categories.name, slug: categories.slug, featured: categories.featured, parentId: categories.parentId })
    .from(categories)
    .orderBy(desc(categories.featured), asc(categories.sortOrder))
    .limit(40);

  let product: any = null;
  let category: any = null;
  let article: any = null;
  let listConditions: any[] = [eq(products.status, 'active')];

  const productMatch = req.path.match(/^\/product\/([^/?#]+)/);
  if (productMatch) {
    let slug = productMatch[1];
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* keep as is */
    }
    const rows = await db
      .select({ product: products, category: categories, brand: brands })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(and(eq(products.slug, slug), eq(products.status, 'active')))
      .limit(1);
    if (rows[0]) {
      product = toSeoProduct(rows[0].product, rows[0].category, rows[0].brand);
      if (rows[0].product.categoryId) listConditions.push(eq(products.categoryId, rows[0].product.categoryId));
    }
  } else if (/^\/shop\/?$/.test(req.path) && typeof req.query.category === 'string' && req.query.category) {
    const rows = await db.select().from(categories).where(eq(categories.slug, String(req.query.category))).limit(1);
    if (rows[0]) {
      category = { name: rows[0].name, slug: rows[0].slug };
      const ids = await categoryAndDescendants(rows[0].id);
      listConditions.push(ids.length > 1 ? inArray(products.categoryId, ids) : eq(products.categoryId, rows[0].id));
    }
  } else if (/^\/blog\/[^/]+/.test(req.path)) {
    article = { title: meta.title, description: meta.description, image: meta.image };
    try {
      const slug = decodeURIComponent(req.path.split('/')[2] || '');
      const result: any = await db.execute(sql`SELECT published_at, updated_at FROM blog_posts WHERE slug = ${slug} AND status = 'published' LIMIT 1`);
      const row = (Array.isArray(result?.[0]) ? result[0] : [])[0];
      if (row) {
        article.published = row.published_at ? new Date(row.published_at).toISOString() : undefined;
        article.modified = row.updated_at ? new Date(row.updated_at).toISOString() : undefined;
      }
    } catch {
      /* dates are optional */
    }
  }

  const listRows = await db
    .select({ product: products })
    .from(products)
    .where(and(...listConditions))
    .orderBy(desc(products.id))
    .limit(24);

  const input: SeoInput = {
    origin,
    path: req.path || '/',
    siteName: meta.siteName,
    title: meta.title,
    description: meta.description,
    logo: logo.desktopLogoUrl || logo.mobileLogoUrl || '',
    phone: String(general.phone || '').trim(),
    whatsapp: String(general.whatsapp || '').trim(),
    email: String(general.email || '').trim(),
    address: String(general.address || '').trim(),
    currency: String(general.currency || '৳'),
    currencyCode: String(general.currencyCode || 'BDT'),
    social,
    categories: catRows.filter((row) => !row.parentId || row.featured).map((row) => ({ name: row.name, slug: row.slug })),
    products: listRows.map((row) => toSeoProduct(row.product)),
    product,
    category,
    article,
  };
  return { head: renderJsonLd(input), body: renderSnapshot(input), tracking, trackingBody };
}

function renderHeadMeta(meta: HeadMeta): string {
  const lines = [
    `<title>${escapeHtml(meta.title)}</title>`,
    meta.description ? `<meta name="description" content="${escapeHtml(meta.description)}" />` : '',
    meta.keywords ? `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />` : '',
    meta.icon
      ? `<link rel="icon" href="${escapeHtml(meta.icon)}" />`
      : `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='${encodeURIComponent(meta.iconColor || '#475569')}'/%3E%3C/svg%3E" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    meta.description ? `<meta property="og:description" content="${escapeHtml(meta.description)}" />` : '',
    `<meta property="og:type" content="${escapeHtml(meta.type)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(meta.siteName)}" />`,
    meta.url ? `<meta property="og:url" content="${escapeHtml(meta.url)}" />` : '',
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}" />` : '',
    meta.image ? `<meta property="og:image:width" content="1200" />` : '',
    meta.image ? `<meta property="og:image:height" content="630" />` : '',
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    meta.description ? `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />` : '',
    meta.image ? `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />` : '',
    meta.url ? `<link rel="canonical" href="${escapeHtml(meta.url)}" />` : '',
  ].filter(Boolean);

  return `${META_START}\n    ${lines.join('\n    ')}\n    ${META_END}`;
}

/** Swap the placeholder block in an index.html string for the real tags */
async function injectHeadMeta(req: express.Request, html: string): Promise<string> {
  const start = html.indexOf(META_START);
  const end = html.indexOf(META_END);
  if (start === -1 || end === -1) return html;
  try {
    // Every page view needs this block; it is cached per address like the API
    const url = req.originalUrl || '/';
    const meta =
      url.length < 300
        ? await cache.wrap(`meta:${req.headers.host || ''}:${url}`, 120, () => buildHeadMeta(req))
        : await buildHeadMeta(req);
    let out = html.slice(0, start) + renderHeadMeta(meta) + html.slice(end + META_END.length);
    try {
      const seo =
        url.length < 300
          ? await cache.wrap(`seo:${req.headers.host || ''}:${url}`, 120, () => buildSeoBlocks(req, meta))
          : await buildSeoBlocks(req, meta);
      // Function replacements: text with $& / $' (a review, a product name) must stay as typed
      if (seo?.head) out = out.replace('</head>', () => `${seo.head}</head>`);
      if (seo?.body) out = out.replace('<div id="root"></div>', () => `<div id="root">${seo.body}</div>`);
      if (seo?.tracking) out = out.replace('</head>', () => `${seo.tracking}</head>`);
      if (seo?.trackingBody) out = out.replace(/<body([^>]*)>/, (match) => `${match}${seo.trackingBody}`);
    } catch (error: any) {
      console.error('seo blocks skipped:', error?.message || error);
    }
    return out;
  } catch (error: any) {
    console.error('meta injection skipped:', error?.message || error);
    return html;
  }
}

/**
 * v3.8 — the first paint is already the shop's own look.
 * The page used to open with the software's default look (green colour,
 * placeholder pill logo, empty hero) until the settings request came back,
 * then switch to the shop's colours, logo and banners. The shop's colours are
 * now written into the page as CSS, and its public settings and banners are
 * sent with the page, so the storefront's first render is the real one.
 * Cached like the API (cleared on every dashboard save).
 */
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;

/**
 * v3.12 — the first banner starts downloading with the page, at the size the
 * screen needs: the same srcset the slider uses (src/lib/img.ts), so the
 * browser never fetches it twice.
 */
function heroPreload(banner: any, safeUrl: (value: any) => string): string {
  const tag = (url: string, maxWidth: number, minWidth: number, media?: string) => {
    const set = uploadSrcSet(url, maxWidth, minWidth);
    const mediaAttr = media ? ` media="${media}"` : '';
    return set
      ? `<link rel="preload" as="image" imagesrcset="${escapeHtml(set)}" imagesizes="100vw" fetchpriority="high"${mediaAttr} />`
      : `<link rel="preload" as="image" href="${escapeHtml(url)}" fetchpriority="high"${mediaAttr} />`;
  };
  const desktop = safeUrl(banner.imageUrl);
  const mobile = safeUrl(banner.mobileImageUrl);
  if (mobile) return tag(desktop, 1920, 320, '(min-width: 768px)') + tag(mobile, 960, 320, '(max-width: 767px)');
  return tag(desktop, 1920, 320);
}

/**
 * v3.12 — the first screen before the website's script has started.
 * A home page with a banner shows, straight from the HTML, the top bar, the
 * header bar with the logo and the first banner picture, laid out where the
 * real ones will be. The script then swaps in the live header and slider (same
 * picture, already downloaded). Phones see the shop instantly instead of a
 * blank page, and the PageSpeed paint timings (FCP / LCP) drop sharply.
 */
async function bootShell(req: express.Request, pageProduct?: any): Promise<string> {
  const onHome = (req.path || '/') === '/';
  if (!onHome && !pageProduct) return '';
  try {
    const boot: any = await cachedBoot();
    const settings = boot?.settings || {};
    const banners: any[] = Array.isArray(boot?.banners) ? boot.banners : [];
    const first = banners
      .filter((b) => (b?.status || 'active') === 'active' && b?.imageUrl)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))[0];
    const safe = (value: any) => (typeof value === 'string' && /^(\/|https?:\/\/)[^"'<>\s]+$/i.test(value) ? value : '');
    if (onHome && (!first || !safe(first.imageUrl))) return '';
    if (!onHome && !safe(pageProduct?.image)) return '';
    if (settings.maintenance_config?.enabled) return '';

    const topbar = settings.topbar || {};
    const showTop =
      topbar.enabled !== false && !(topbar.mode === 'ticker' && !String(topbar.tickerText || '').trim());
    const topColor = SAFE_COLOR.test(String(topbar.bgColor || '').trim()) ? String(topbar.bgColor).trim() : '';
    const headerStyle = String(settings.header_config?.style || 'classic');
    const logoCfg = settings.logo_config || {};
    const logo = safe(logoCfg.mobileLogoUrl || logoCfg.desktopLogoUrl || '');
    const desktopLogo = safe(logoCfg.desktopLogoUrl || logoCfg.mobileLogoUrl || '');

    const top = showTop
      ? `<div class="boot-top${topbar.showOnMobile === false ? ' boot-md' : ''}"${topColor ? ` style="background:${escapeHtml(topColor)}"` : ''}></div>`
      : '';
    const storeName = String(logoCfg.pharmacyName || settings.general?.storeName || '').trim();
    const mark = logo
      ? `<img class="boot-logo boot-sm" src="${escapeHtml(uploadSized(logo, 400))}" alt="" />${
          desktopLogo ? `<img class="boot-logo boot-lg" src="${escapeHtml(uploadSized(desktopLogo, 400))}" alt="" />` : ''
        }`
      : storeName
        ? `<span class="boot-name">${escapeHtml(storeName)}</span>`
        : '';
    // The transparent header floats over the home banner; elsewhere it is a normal bar
    const head = headerStyle === 'transparent' && onHome ? '' : `<div class="boot-head"><div class="boot-in">${mark}</div></div>`;

    if (!onHome) {
      // Product page: the photo, name and price where the real ones will be
      const product = pageProduct;
      const set = uploadSrcSet(product.image, 800, 320);
      const photo = set
        ? `<img srcset="${escapeHtml(set)}" sizes="(min-width: 1024px) 560px, 100vw" src="${escapeHtml(uploadSized(product.image, 800))}" alt="" fetchpriority="high" />`
        : `<img src="${escapeHtml(product.image)}" alt="" fetchpriority="high" />`;
      const currency = String(settings.general?.currency || '৳');
      const sale = Number(product.salePrice);
      const price = sale > 0 ? sale : Number(product.price);
      const priceText = Number.isFinite(price) && price > 0 && !product.hasVariations
        ? `${escapeHtml(currency)}${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
        : '';
      return `<div class="boot-shell" aria-hidden="true">${top}${head}<div class="boot-page"><div class="boot-pgrid"><div class="boot-pimg">${photo}</div><div><div class="boot-ptitle">${escapeHtml(
        String(product.name || '')
      )}</div>${priceText ? `<div class="boot-pprice">${priceText}</div>` : ''}</div></div></div></div>`;
    }

    const desktopSet = uploadSrcSet(first.imageUrl, 1920, 320);
    const mobileUrl = safe(first.mobileImageUrl || '');
    const mobileSet = mobileUrl ? uploadSrcSet(mobileUrl, 960, 320) : '';
    const dims = first.width && first.height ? ` width="${Number(first.width)}" height="${Number(first.height)}"` : '';
    const source = mobileUrl
      ? `<source media="(max-width: 767px)" srcset="${escapeHtml(mobileSet || mobileUrl)}" sizes="100vw"${
          first.mobileWidth && first.mobileHeight ? ` width="${Number(first.mobileWidth)}" height="${Number(first.mobileHeight)}"` : ''
        } />`
      : '';
    const img = desktopSet
      ? `<img class="boot-hero" srcset="${escapeHtml(desktopSet)}" sizes="100vw" src="${escapeHtml(uploadSized(first.imageUrl, 1920))}"${dims} alt="" fetchpriority="high" />`
      : `<img class="boot-hero" src="${escapeHtml(first.imageUrl)}"${dims} alt="" fetchpriority="high" />`;
    return `<div class="boot-shell" aria-hidden="true">${top}${head}<picture>${source}${img}</picture></div>`;
  } catch {
    return '';
  }
}

/** Public settings + banners, shared by the page head and the SEO blocks */
function cachedBoot(): Promise<any> {
  return cache.wrap('boot:v1', 300, async () => {
    const [settings, banners] = await Promise.all([buildPublicSettings(), listPublicBanners().catch(() => [])]);
    return { settings, banners };
  });
}

async function bootBlock(req: express.Request): Promise<string> {
  const path = (req.path || '/').toLowerCase();
  // Admin and POS get the same data, so their screens also open in the shop's
  // colours; only the storefront preloads the hero picture
  try {
    const boot = await cachedBoot();
    const theme = (boot as any)?.settings?.theme || {};
    const vars: string[] = [];
    const add = (name: string, value: any) => {
      const clean = String(value || '').trim();
      if (clean && SAFE_COLOR.test(clean)) vars.push(`${name}:${clean}`);
    };
    // The shop colour exactly as chosen, plus a readable shade for small text (src/lib/contrast.ts)
    add('--primary', theme.primaryColor);
    add('--primary-hover', theme.primaryHover);
    add('--primary-ink', theme.primaryColor ? readableOnWhite(String(theme.primaryColor).trim(), 5.4) : '');
    // v3.12.1 — button text stays readable on light shop colours (yellow, pink …)
    add('--primary-foreground', theme.primaryColor ? textOnColor(String(theme.primaryColor).trim()) : '');
    add('--primary-light', theme.primaryLight);
    add('--secondary', theme.secondaryColor);
    add('--accent', theme.accentColor);
    // v3.9 — product picture shape, so cards open in the right shape
    const shape = productImageCss((boot as any)?.settings?.product_image_config);
    vars.push(`--product-ratio:${shape.ratio}`, `--product-fit:${shape.fit}`);
    // v3.15 — the fonts chosen in System Configuration → Fonts (dashboard pages load the dashboard face only)
    const fonts = fontHeadHtml(fontConfigOf((boot as any)?.settings), /^\/(admin|pos|dashboard)(\/|$)/.test(path) ? 'dashboard' : 'website');
    const css = (vars.length ? `<style id="boot-theme">:root{${vars.join(';')}}</style>` : '') + fonts;
    // The logo and the first hero picture start downloading with the page
    const logoCfg = (boot as any)?.settings?.logo_config || {};
    const firstBanner = Array.isArray((boot as any)?.banners) ? (boot as any).banners.find((b: any) => b?.imageUrl) : null;
    const safeUrl = (value: any) => (typeof value === 'string' && /^(\/|https?:\/\/)[^"'<>\s]+$/i.test(value) ? value : '');
    const preloads = [
      safeUrl(logoCfg.desktopLogoUrl) && `<link rel="preload" as="image" href="${escapeHtml(uploadSized(safeUrl(logoCfg.desktopLogoUrl), 400))}" />`,
      path === '/' && firstBanner && safeUrl(firstBanner.imageUrl) ? heroPreload(firstBanner, safeUrl) : '',
    ]
      .filter(Boolean)
      .join('');
    const json = JSON.stringify(boot);
    // A very large settings row is left to the normal request
    if (json.length > 400_000) return css + preloads;
    const safe = json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return `${css}${preloads}<script>window.__PHARMA_BOOT__=${safe}</script>`;
  } catch (error: any) {
    console.error('boot data skipped:', error?.message || error);
    return '';
  }
}

// ===========================================================================
// v3.9 — CUSTOM CODE (Dashboard → System Configuration → Custom Code)
// Custom CSS, custom JavaScript and three HTML snippets (inside <head>, right
// after <body>, before </body>) are written into every website page by the
// server, so tags that must be in the page source (Search Console
// verification, chat widgets, pixels) work too. Each block has its own
// on/off switch. The dashboard and the POS never get custom code, so a
// mistake in a snippet can never lock the owner out.
// ===========================================================================
interface CustomCode {
  cssEnabled: boolean;
  css: string;
  jsEnabled: boolean;
  js: string;
  headEnabled: boolean;
  head: string;
  bodyEnabled: boolean;
  body: string;
  footerEnabled: boolean;
  footer: string;
  updatedAt?: number;
}
const EMPTY_CUSTOM_CODE: CustomCode = {
  cssEnabled: false,
  css: '',
  jsEnabled: false,
  js: '',
  headEnabled: false,
  head: '',
  bodyEnabled: false,
  body: '',
  footerEnabled: false,
  footer: '',
};
const CUSTOM_CODE_MAX = 200_000;

async function readCustomCode(): Promise<CustomCode> {
  try {
    const row = (await db.select().from(siteSettings).where(eq(siteSettings.key, 'custom_code')).limit(1))[0];
    return { ...EMPTY_CUSTOM_CODE, ...(row ? JSON.parse(row.value) || {} : {}) };
  } catch {
    return { ...EMPTY_CUSTOM_CODE };
  }
}

app.get('/api/admin/custom-code', async (_req, res) => {
  privateResponse(res);
  res.json(await readCustomCode());
});

app.put('/api/admin/custom-code', async (req, res) => {
  try {
    const body = req.body || {};
    const text = (value: any) => String(value ?? '');
    const next: CustomCode = {
      cssEnabled: Boolean(body.cssEnabled),
      css: text(body.css),
      jsEnabled: Boolean(body.jsEnabled),
      js: text(body.js),
      headEnabled: Boolean(body.headEnabled),
      head: text(body.head),
      bodyEnabled: Boolean(body.bodyEnabled),
      body: text(body.body),
      footerEnabled: Boolean(body.footerEnabled),
      footer: text(body.footer),
      updatedAt: Date.now(),
    };
    const total = next.css.length + next.js.length + next.head.length + next.body.length + next.footer.length;
    if (total > CUSTOM_CODE_MAX) return res.status(413).json({ error: `Custom code is too long (${Math.round(total / 1024)} KB). Keep it under ${CUSTOM_CODE_MAX / 1000} KB.` });
    await db
      .insert(siteSettings)
      .values({ key: 'custom_code', value: JSON.stringify(next) })
      .onDuplicateKeyUpdate({ set: { value: JSON.stringify(next) } });
    await cache.invalidate();
    res.json({ success: true, code: next });
  } catch (error: any) {
    console.error('custom code save:', error);
    res.status(500).json({ error: 'Could not save the custom code.' });
  }
});

/** Pages that never get custom code: the dashboard, the POS and their sign-in */
const NO_CUSTOM_CODE = /^\/(admin|pos|dashboard)(\/|$)/i;

async function injectCustomCode(req: express.Request, html: string): Promise<string> {
  if (NO_CUSTOM_CODE.test(req.path || '/')) return html;
  let code: CustomCode;
  try {
    code = await cache.wrap('custom-code:v1', 300, () => readCustomCode());
  } catch {
    return html;
  }
  // "</style>" inside the CSS would end the tag early
  const css = code.cssEnabled && code.css.trim() ? `<style id="custom-css">\n${code.css.replace(/<\/style/gi, '<\\/style')}\n</style>` : '';
  const head = code.headEnabled && code.head.trim() ? `\n<!-- custom head code -->\n${code.head}\n` : '';
  const bodyStart = code.bodyEnabled && code.body.trim() ? `\n<!-- custom body code -->\n${code.body}\n` : '';
  const js = code.jsEnabled && code.js.trim() ? `<script id="custom-js">\n${code.js.replace(/<\/script/gi, '<\\/script')}\n</script>` : '';
  const footer = code.footerEnabled && code.footer.trim() ? `\n<!-- custom footer code -->\n${code.footer}\n` : '';
  let out = html;
  if (css || head) out = out.replace('</head>', () => `${head}${css}</head>`);
  if (bodyStart) out = out.replace(/<body([^>]*)>/i, (match) => `${match}${bodyStart}`);
  if (js || footer) {
    const at = out.lastIndexOf('</body>');
    if (at !== -1) out = `${out.slice(0, at)}${footer}${js}${out.slice(at)}`;
  }
  return out;
}

/** robots.txt and a small sitemap so the store is indexable out of the box */
app.get('/robots.txt', (req, res) => {
  const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /pos\nSitemap: ${base}/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const productRows = await db
      .select({ slug: products.slug })
      .from(products)
      .where(eq(products.status, 'active'))
      .limit(2000);
    const categoryRows = await db.select({ slug: categories.slug }).from(categories).limit(500);
    const extra: any = await db
      .execute(
        sql`SELECT CONCAT('blog/', slug) AS path FROM blog_posts WHERE status = 'published' UNION ALL SELECT CONCAT('lp/', slug) FROM landing_pages WHERE status = 'active' LIMIT 3000`
      )
      .catch(() => [[]]);
    const extraRows: any[] = Array.isArray(extra?.[0]) ? extra[0] : [];

    const urls = [
      `${base}/`,
      `${base}/shop`,
      `${base}/offers`,
      ...(extraRows.some((row) => String(row.path).startsWith('blog/')) ? [`${base}/blog`] : []),
      ...categoryRows.map((row) => `${base}/shop?category=${encodeURIComponent(row.slug)}`),
      ...productRows.map((row) => `${base}/product/${encodeURIComponent(row.slug)}`),
      ...extraRows.map((row) => {
        const [kind, ...rest] = String(row.path).split('/');
        return `${base}/${kind}/${encodeURIComponent(rest.join('/'))}`;
      }),
    ];

    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n') +
        `\n</urlset>`
    );
  } catch {
    res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
});

// ===========================================================================
// DEMO DATA — removed for good (v3.6)
// Earlier versions installed a sample catalogue on a new store. It is gone:
// on start, any demo brand, category or product still recorded in the
// `demo_data` setting is removed (a demo product that appears in a real
// order is marked "deleted", which hides it everywhere). Products that the
// old Delete button only switched to "inactive" are treated the same way.
// Nothing the owner created is touched, and no demo data is ever added again.
// ===========================================================================
async function purgeLegacyDemoData() {
  try {
    const row = (await db.select().from(siteSettings).where(eq(siteSettings.key, 'demo_data')).limit(1))[0];
    let state: any = {};
    try {
      state = row ? JSON.parse(row.value) || {} : {};
    } catch {
      state = {};
    }
    const productIds: number[] = [...(state.productIds || []), ...(state.keptProductIds || [])].map(Number).filter(Boolean);
    const categoryIds: number[] = (state.categoryIds || []).map(Number).filter(Boolean);
    const brandIds: number[] = (state.brandIds || []).map(Number).filter(Boolean);
    let removed = 0;
    for (const id of Array.from(new Set(productIds))) {
      if ((await deleteProductForGood(id)) !== 'missing') removed += 1;
    }
    // Sub-categories first; a category the owner has used since is kept
    const cats = categoryIds.length ? await db.select().from(categories).where(inArray(categories.id, categoryIds)) : [];
    cats.sort((a, b) => (b.level || 1) - (a.level || 1));
    for (const category of cats) {
      const inUse = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.categoryId, category.id), NOT_DELETED))
        .limit(1);
      const hasChildren = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, category.id)).limit(1);
      if (inUse.length === 0 && hasChildren.length === 0) {
        await db.update(products).set({ categoryId: null }).where(eq(products.categoryId, category.id));
        await db.delete(categories).where(eq(categories.id, category.id));
      }
    }
    for (const id of brandIds) {
      const inUse = await db.select({ id: products.id }).from(products).where(and(eq(products.brandId, id), NOT_DELETED)).limit(1);
      if (inUse.length === 0) {
        await db.update(products).set({ brandId: null }).where(eq(products.brandId, id));
        await db.delete(brands).where(eq(brands.id, id));
      }
    }
    if (row && (productIds.length || categoryIds.length || brandIds.length)) {
      const value = JSON.stringify({ installed: false, everInstalled: true, purgedAt: new Date().toISOString(), brandIds: [], categoryIds: [], productIds: [] });
      await db.update(siteSettings).set({ value }).where(eq(siteSettings.key, 'demo_data'));
      console.log(`[cleanup] demo data removed (${removed} product(s))`);
    }

    // The old Delete button only set "inactive" — finish those deletions
    const inactive = await db.select({ id: products.id }).from(products).where(eq(products.status, 'inactive'));
    for (const product of inactive) await deleteProductForGood(product.id);
    if (inactive.length > 0) console.log(`[cleanup] finished deleting ${inactive.length} product(s) left as "inactive"`);
  } catch (error: any) {
    console.error('[cleanup] demo data removal skipped:', error?.message || error);
  }
}

/**
 * First-run data every install should have: the attribute list used by the
 * product editor. INSERT-if-empty, so an existing shop is never overwritten.
 */
// ==========================================
// SELF-UPGRADING SCHEMA
// ==========================================
/**
 * A store that is already live has the old table layout. Rather than ask the
 * owner to run SQL by hand after every update, the server checks for each
 * column/table it needs and adds the missing ones on start. Every statement is
 * additive (ADD COLUMN / CREATE TABLE IF NOT EXISTS), so it never touches or
 * deletes existing data, and it is a no-op once the store is up to date.
 * Works on MySQL 5.7+ and MariaDB 10.4+ (information_schema is used instead of
 * ADD COLUMN IF NOT EXISTS, which MySQL does not support).
 */
// The lists live in src/server/schema-upgrades.ts (also used to write database/upgrade-v3.11.sql)

/** What the last automatic upgrade did — shown in System Configuration → Database */
let schemaReport: { ranAt: string; ok: boolean; created: string[]; added: string[]; errors: Array<{ step: string; error: string }> } = {
  ranAt: '',
  ok: true,
  created: [],
  added: [],
  errors: [],
};

/**
 * Additive, idempotent schema upgrade, run at every start before the server
 * listens. Each step stands alone: one refused statement (a missing privilege,
 * an old MySQL) is recorded and the rest still run — previously one failure
 * silently skipped every table after it. Nothing is ever dropped or altered
 * destructively; existing data is untouched.
 */
async function ensureSchema() {
  const report = { ranAt: new Date().toISOString(), ok: true, created: [] as string[], added: [] as string[], errors: [] as Array<{ step: string; error: string }> };
  const pool = createPool();
  const step = async (name: string, run: () => Promise<any>) => {
    try {
      await run();
    } catch (error: any) {
      report.ok = false;
      report.errors.push({ step: name, error: String(error?.message || error).slice(0, 300) });
      console.error(`[schema] ${name} failed:`, error?.message || error);
    }
  };
  try {
    const [dbRow]: any = await pool.query('SELECT DATABASE() AS name');
    const schemaName = dbRow?.[0]?.name;
    if (!schemaName) {
      report.ok = false;
      report.errors.push({ step: 'select database', error: 'No database selected — set DB_NAME in .env' });
      return;
    }

    const [tableRows]: any = await pool.query(
      'SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [schemaName]
    );
    const existingTables = new Set((tableRows as any[]).map((row) => String(row.t)));

    // v3.11 — the core tables too: a database where database.sql was never
    // imported (or the import stopped half-way) used to leave the shop
    // unusable — every sign-in failed with "Could not sign in right now".
    // Missing ones are created with foreign key checks off for this one
    // connection, so their order does not matter. Existing tables are
    // never touched.
    const missingBase = BASE_TABLES.filter((table) => !existingTables.has(table.name));
    if (missingBase.length > 0) {
      await step('create core tables', async () => {
        const connection = await pool.getConnection();
        try {
          await connection.query('SET FOREIGN_KEY_CHECKS = 0');
          for (const table of missingBase) {
            try {
              await connection.query(table.ddl);
              existingTables.add(table.name);
              report.created.push(table.name);
            } catch (error: any) {
              report.ok = false;
              report.errors.push({ step: `create ${table.name}`, error: String(error?.message || error).slice(0, 300) });
              console.error(`[schema] create ${table.name} failed:`, error?.message || error);
            }
          }
        } finally {
          await connection.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => undefined);
          connection.release();
        }
      });
    }

    for (const table of SCHEMA_TABLES) {
      if (existingTables.has(table.name)) continue;
      await step(`create ${table.name}`, async () => {
        await pool.query(table.ddl);
        report.created.push(table.name);
      });
    }

    // v3.9 — order numbers count from 01 (ORD-01, ORD-02 …; POS has its own
    // POS-01 …). Done once: the day this version first starts, both counters
    // start again from 1. Numbers that already exist are skipped when an
    // order is placed, so an old ORD-1001 is never given out twice.
    await step('order numbers from 01', async () => {
      const [found]: any = await pool.query("SELECT `value` FROM `site_settings` WHERE `key` = 'order_number_config' LIMIT 1");
      if (Array.isArray(found) && found.length > 0) return;
      await pool.query("INSERT INTO `order_counters` (`name`, `value`) VALUES ('orders', 0), ('pos_orders', 0) ON DUPLICATE KEY UPDATE `value` = 0");
      await pool.query("INSERT IGNORE INTO `site_settings` (`key`, `value`) VALUES ('order_number_config', ?)", [
        JSON.stringify(DEFAULT_ORDER_NUMBER_CONFIG),
      ]);
    });

    // v3.10 — the POS now needs the "POS Terminal" module. Until this version
    // every staff account could use the POS whatever was ticked, so each
    // existing account is given that module once; nobody is locked out by the
    // update. From then on the tick decides.
    await step('staff POS access', async () => {
      const [done]: any = await pool.query("SELECT `value` FROM `site_settings` WHERE `key` = 'staff_access_version' LIMIT 1");
      if (Array.isArray(done) && done.length > 0) return;
      const [staffRows]: any = await pool.query("SELECT `id`, `permissions` FROM `users` WHERE `role` <> 'admin'");
      for (const row of staffRows as any[]) {
        let list: string[] = [];
        try {
          list = row.permissions ? JSON.parse(row.permissions) : [];
        } catch {
          list = [];
        }
        if (!Array.isArray(list)) list = [];
        if (list.includes('pos')) continue;
        await pool.query('UPDATE `users` SET `permissions` = ? WHERE `id` = ?', [JSON.stringify([...list, 'pos']), row.id]);
      }
      await pool.query("INSERT IGNORE INTO `site_settings` (`key`, `value`) VALUES ('staff_access_version', '2')");
    });

    const [colRows]: any = await pool.query(
      'SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?',
      [schemaName]
    );
    const present = new Set((colRows as any[]).map((row) => `${row.t}.${row.c}`));
    for (const col of SCHEMA_COLUMNS) {
      if (present.has(`${col.table}.${col.column}`)) continue;
      await step(`add ${col.table}.${col.column}`, async () => {
        await pool.query(`ALTER TABLE \`${col.table}\` ADD COLUMN \`${col.column}\` ${col.ddl}`);
        report.added.push(`${col.table}.${col.column}`);
      });
    }

    const [idxRows]: any = await pool.query(
      'SELECT DISTINCT TABLE_NAME AS t, INDEX_NAME AS i FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?',
      [schemaName]
    );
    const indexes = new Set((idxRows as any[]).map((row) => `${row.t}.${row.i}`));
    for (const idx of SCHEMA_INDEXES) {
      if (indexes.has(`${idx.table}.${idx.name}`)) continue;
      await step(`index ${idx.table}.${idx.name}`, () =>
        pool.query(`ALTER TABLE \`${idx.table}\` ADD INDEX \`${idx.name}\` ${idx.ddl}`)
      );
    }

    if (report.created.length > 0) console.log(`[schema] created: ${report.created.join(', ')}`);
    if (report.added.length > 0) console.log(`[schema] upgraded: added ${report.added.join(', ')}`);
  } catch (error: any) {
    // A missing privilege must not take the shop down; the owner can run
    // database/upgrade-v3.11.sql by hand instead.
    report.ok = false;
    report.errors.push({ step: 'read schema', error: String(error?.message || error).slice(0, 300) });
    console.error('[schema] automatic upgrade failed:', error?.message || error);
  } finally {
    schemaReport = report;
  }
}

/** Creates one known table on demand (used when a write finds it missing) */
export async function ensureTable(name: string): Promise<boolean> {
  const table = SCHEMA_TABLES.find((item) => item.name === name);
  if (!table) return false;
  try {
    await db.execute(sql.raw(table.ddl));
    return true;
  } catch (error: any) {
    console.error(`[schema] could not create ${name}:`, error?.message || error);
    return false;
  }
}

/**
 * Sequential order numbers: ORD-1001, ORD-1002, POS-1003 …
 * One counter row, incremented inside the order's own transaction. The UPDATE
 * locks the row until the order commits, so two checkouts at the same second
 * get consecutive numbers — never the same one, never out of order — and a
 * failed order rolls its number back instead of leaving a gap.
 */
/**
 * v3.9 — order numbers start from 01 and count up: ORD-01, ORD-02 … ORD-99,
 * ORD-100. Website, landing-page and manual orders share one sequence; POS
 * sales have their own (POS-01, POS-02 …). The prefix, the minimum number of
 * digits and the next number are set in Dashboard → System Configuration →
 * Orders. A number that already exists (an order from an older numbering) is
 * skipped, so two orders can never share a number.
 */
const DEFAULT_ORDER_NUMBER_CONFIG = { prefix: 'ORD', posPrefix: 'POS', separator: '-', minDigits: 2 };
type OrderNumberConfig = typeof DEFAULT_ORDER_NUMBER_CONFIG;

async function readOrderNumberConfig(dbOrTx: any = db): Promise<OrderNumberConfig> {
  try {
    const rows = await dbOrTx.select().from(siteSettings).where(eq(siteSettings.key, 'order_number_config')).limit(1);
    const saved = rows[0] ? JSON.parse(rows[0].value) || {} : {};
    return cleanOrderNumberConfig(saved);
  } catch {
    return { ...DEFAULT_ORDER_NUMBER_CONFIG };
  }
}

function cleanOrderNumberConfig(raw: any): OrderNumberConfig {
  const text = (value: any, fallback: string) =>
    value === undefined || value === null ? fallback : String(value).replace(/[^A-Za-z0-9_#/-]/g, '').slice(0, 12);
  const digits = Math.floor(Number(raw?.minDigits));
  return {
    prefix: text(raw?.prefix, DEFAULT_ORDER_NUMBER_CONFIG.prefix),
    posPrefix: text(raw?.posPrefix, DEFAULT_ORDER_NUMBER_CONFIG.posPrefix),
    separator: raw?.separator === '' ? '' : text(raw?.separator, '-').slice(0, 2),
    minDigits: Number.isFinite(digits) ? Math.min(8, Math.max(1, digits)) : DEFAULT_ORDER_NUMBER_CONFIG.minDigits,
  };
}

function formatOrderNumber(cfg: OrderNumberConfig, kind: 'ORD' | 'POS', value: number): string {
  const prefix = kind === 'POS' ? cfg.posPrefix : cfg.prefix;
  const number = String(value).padStart(cfg.minDigits, '0');
  return prefix ? `${prefix}${cfg.separator}${number}` : number;
}

const counterName = (kind: 'ORD' | 'POS') => (kind === 'POS' ? 'pos_orders' : 'orders');

export async function nextOrderNumber(tx: any, kind: 'ORD' | 'POS'): Promise<string> {
  const cfg = await readOrderNumberConfig(tx);
  const name = counterName(kind);
  await tx.execute(sql`INSERT IGNORE INTO order_counters (name, value) VALUES (${name}, 0)`);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    // The UPDATE locks the counter row until the order is saved, so two
    // checkouts at the same moment always get different numbers
    await tx.execute(sql`UPDATE order_counters SET value = value + 1 WHERE name = ${name}`);
    const result: any = await tx.execute(sql`SELECT value FROM order_counters WHERE name = ${name}`);
    const rows = Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : result?.rows || [];
    const value = Number(rows?.[0]?.value);
    if (!Number.isFinite(value) || value <= 0) throw new Error('Order counter unavailable');
    const candidate = formatOrderNumber(cfg, kind, value);
    const taken = await tx.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, candidate)).limit(1);
    if (taken.length === 0) return candidate;
  }
  throw new Error('Could not find a free order number. Check Dashboard → System Configuration → Orders.');
}

/** Dashboard → System Configuration → Orders: numbering */
app.get('/api/admin/order-numbering', async (_req, res) => {
  try {
    const cfg = await readOrderNumberConfig();
    const result: any = await db.execute(sql`SELECT name, value FROM order_counters WHERE name IN ('orders', 'pos_orders')`);
    const rows = sqlRows(result);
    const current = (name: string) => Number(rows.find((row: any) => row.name === name)?.value) || 0;
    res.json({
      ...cfg,
      next: current('orders') + 1,
      posNext: current('pos_orders') + 1,
      preview: formatOrderNumber(cfg, 'ORD', current('orders') + 1),
      posPreview: formatOrderNumber(cfg, 'POS', current('pos_orders') + 1),
    });
  } catch (error: any) {
    console.error('order numbering:', error);
    res.status(500).json({ error: 'Could not load the order numbering.' });
  }
});

app.put('/api/admin/order-numbering', async (req, res) => {
  try {
    const cfg = cleanOrderNumberConfig({ ...(await readOrderNumberConfig()), ...(req.body || {}) });
    await db
      .insert(siteSettings)
      .values({ key: 'order_number_config', value: JSON.stringify(cfg) })
      .onDuplicateKeyUpdate({ set: { value: JSON.stringify(cfg) } });
    for (const [field, name] of [['next', 'orders'], ['posNext', 'pos_orders']] as const) {
      const wanted = Math.floor(Number(req.body?.[field]));
      if (!Number.isFinite(wanted) || wanted < 1 || wanted > 99_999_999) continue;
      await db.execute(sql`INSERT INTO order_counters (name, value) VALUES (${name}, ${wanted - 1}) ON DUPLICATE KEY UPDATE value = ${wanted - 1}`);
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('order numbering save:', error);
    res.status(500).json({ error: 'Could not save the order numbering.' });
  }
});

async function bootstrapDefaults() {
  try {
    // No starter coupons any more: codes like "MEGA25" that every copy of the
    // software shared could be guessed by anyone. The owner creates their own.
    const attrRows = await db.select({ id: attributes.id }).from(attributes).limit(1);
    if (attrRows.length === 0) {
      const starter = [
        { name: 'Type', values: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream'] },
        { name: 'Dosage', values: ['10mg', '20mg', '50mg', '100mg', '500mg'] },
        { name: 'Pack Size', values: ['Single', 'Strip', 'Box', 'Family Pack'] },
        { name: 'Weight', values: ['100g', '250g', '500g', '1kg'] },
        { name: 'Volume', values: ['50ml', '100ml', '200ml', '450ml'] },
        { name: 'Age Group', values: ['Infant', 'Child', 'Adult', 'Senior'] },
      ];
      await db.insert(attributes).values(
        starter.map((item, index) => ({
          name: item.name,
          slug: slugify(item.name),
          values: JSON.stringify(item.values),
          sortOrder: index + 1,
        }))
      );
      console.log('[bootstrap] starter attribute set created');
    }

  } catch (error: any) {
    console.error('[bootstrap] skipped:', error?.message || error);
  }
}

async function startServer() {
  // Maintenance mode answers website pages before the app is served
  app.use(maintenanceGate);

  if (process.env.NODE_ENV !== 'production') {
    // Loaded only in development, so the live server never starts Vite
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(APP_DIR, 'dist');

    // Hashed bundles never change under the same name, so they can be cached
    // for a year; index.html must always be revalidated or a deploy would not
    // reach anyone who had visited before.
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        immutable: true,
        maxAge: '1y',
      })
    );
    // index:false so every HTML request falls through to the handler below and
    // gets its meta block rendered — express.static would send the raw file.
    app.use(express.static(distPath, { maxAge: '1h', index: false }));

    const indexPath = path.join(distPath, 'index.html');
    let indexTemplate = '';
    try {
      indexTemplate = fs.readFileSync(indexPath, 'utf8');
    } catch {
      console.error('dist/index.html is missing — run `npm run build` first.');
    }

    // v3.12 — which built file holds each page (dist/.vite/manifest.json)
    let manifest: Record<string, { file: string; imports?: string[]; isEntry?: boolean }> = {};
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(distPath, '.vite', 'manifest.json'), 'utf8'));
    } catch {
      manifest = {};
    }
    const entryFiles = new Set<string>();
    for (const item of Object.values(manifest)) {
      if (item?.isEntry) {
        entryFiles.add(item.file);
        for (const name of item.imports || []) if (manifest[name]) entryFiles.add(manifest[name].file);
      }
    }
    /** <link rel="modulepreload"> for a page's own file and what it needs beyond the main bundle */
    const pagePreloads = (source: string): string => {
      const out = new Set<string>();
      const walk = (key: string, depth: number) => {
        const item = manifest[key];
        if (!item || depth > 4 || entryFiles.has(item.file) || out.has(item.file)) return;
        out.add(item.file);
        for (const name of item.imports || []) walk(name, depth + 1);
      };
      walk(source, 0);
      return [...out].map((file) => `<link rel="modulepreload" crossorigin href="/${escapeHtml(file)}" />`).join('');
    };
    const PAGE_SOURCES: Array<[RegExp, string]> = [
      [/^\/product\/[^/]+/, 'src/components/store/ProductDetailView.tsx'],
      [/^\/shop\/?$/, 'src/components/store/ShopView.tsx'],
      [/^\/cart\/?$/, 'src/components/store/CartView.tsx'],
      [/^\/checkout\/?$/, 'src/components/store/CheckoutView.tsx'],
    ];

    /**
     * v3.12 — a product page opened directly: the product's data (as a retail
     * visitor sees it), its page file and its main picture start with the page.
     */
    const productHead = async (req: express.Request): Promise<{ head: string; product?: any }> => {
      const none = { head: '' };
      const match = (req.path || '').match(/^\/product\/([^/?#]+)/);
      if (!match) return none;
      let slug = match[1];
      try {
        slug = decodeURIComponent(slug);
      } catch {
        /* as typed */
      }
      if (slug.length > 190) return none;
      try {
        const result: any = await cache.wrap(`pp:${slug}`, 60, async () => {
          const payload = await productPagePayload(slug, null);
          return payload.status === 200 ? payload.body : null;
        });
        if (!result?.product || (result.product.status && result.product.status !== 'active')) return none;
        const json = JSON.stringify({ slug, data: result })
          .replace(/</g, '\\u003c')
          .replace(/\u2028/g, '\\u2028')
          .replace(/\u2029/g, '\\u2029');
        if (json.length > 600_000) return none;
        const image = typeof result.product.image === 'string' ? result.product.image : '';
        const set = image ? uploadSrcSet(image, 800, 320) : '';
        const preload = set
          ? `<link rel="preload" as="image" imagesrcset="${escapeHtml(set)}" imagesizes="(min-width: 1024px) 560px, 100vw" fetchpriority="high" />`
          : '';
        return { head: `${preload}<script>window.__PHARMA_PRODUCT__=${json}</script>`, product: result.product };
      } catch {
        return none;
      }
    };

    /**
     * v3.12 — a /shop link opened directly: its first page of products (as a
     * retail visitor sees it) and the first two product pictures start with
     * the page. The key is exactly the request ShopView would make first.
     */
    const CARD_SIZES = '(min-width: 1280px) 240px, (min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 480px) 33vw, 50vw';
    const shopHead = async (req: express.Request): Promise<string> => {
      if (!/^\/shop\/?$/.test(req.path || '')) return '';
      const q = req.query as Record<string, any>;
      const one = (value: any) => (typeof value === 'string' ? value.trim() : '');
      if (one(q.search) || one(q.minPrice) || one(q.maxPrice)) return '';
      try {
        const boot: any = await cachedBoot();
        const pageSize = Math.min(60, Math.max(4, Number(boot?.settings?.shop_config?.pageSize) || 20));
        const params = new URLSearchParams();
        params.set('pageSize', String(pageSize));
        const brand = one(q.brand).slice(0, 120);
        const generic = one(q.generic).slice(0, 120);
        if (brand) {
          params.set('brand', brand);
          params.set('scope', 'brand');
        } else if (generic) params.set('generic', generic);
        const category = one(q.category).slice(0, 190);
        if (category) params.set('category', category);
        if (one(q.flashSale) === '1') params.set('flashSale', '1');
        if (one(q.newArrival) === '1') params.set('newArrival', '1');
        const page = Math.min(500, Math.max(1, Math.floor(Number(one(q.page))) || 1));
        const key = `${params.toString()}&page=${page}`;
        const data: any = await cache.wrap(`shop:${key}`, 60, () => browsePayload(Object.fromEntries(new URLSearchParams(key)), null));
        if (!data || !Array.isArray(data.items)) return '';
        const json = JSON.stringify({ key, data })
          .replace(/</g, '\\u003c')
          .replace(/\u2028/g, '\\u2028')
          .replace(/\u2029/g, '\\u2029');
        if (json.length > 400_000) return '';
        const preloads = data.items
          .slice(0, 2)
          .map((item: any) => (typeof item?.image === 'string' ? uploadSrcSet(item.image, 320, 160) : ''))
          .filter(Boolean)
          .map((set: string) => `<link rel="preload" as="image" imagesrcset="${escapeHtml(set)}" imagesizes="${CARD_SIZES}" fetchpriority="high" />`)
          .join('');
        return `${preloads}<script>window.__PHARMA_SHOP__=${json}</script>`;
      } catch {
        return '';
      }
    };

    app.get('*', async (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      if (!indexTemplate) return res.status(500).send('Build output missing. Run npm run build.');
      let html = await injectHeadMeta(req, indexTemplate);
      // The page carries the current cache version, so a reload after a
      // dashboard save never paints the browser's older copy first.
      const version = await readCacheVersion();
      const bootHead = `<script>window.__PHARMA_CV__=${Number(version) || 1}</script>${await bootBlock(req)}`;
      html = html.replace('</head>', () => `${bootHead}</head>`);
      const productPage = await productHead(req);
      const shell = await bootShell(req, productPage.product);
      if (shell) html = html.replace('<div id="root">', () => `<div id="root">${shell}`);
      const page = PAGE_SOURCES.find(([pattern]) => pattern.test(req.path || '/'));
      const extraHead = `${page ? pagePreloads(page[1]) : ''}${productPage.head}${await shopHead(req)}`;
      if (extraHead) html = html.replace('</head>', () => `${extraHead}</head>`);
      html = await injectCustomCode(req, html);
      res.type('html').send(html);
    });
  }

  await ensureSchema();
  await bootstrapDefaults();
  await purgeLegacyDemoData();
  // Older uploads get their database copy in the background (a few per second)
  setTimeout(() => void mediaStore.runBackfill(), 5000).unref?.();
  // The database was not reachable at start (e.g. MySQL restarting on the same
  // server): keep serving, and finish the upgrade as soon as it is back.
  const retrySchema = (attempt: number) => {
    const unreachable = !schemaReport?.ok && (schemaReport?.errors || []).some((item: any) => /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connect|Too many connections|PROTOCOL_CONNECTION_LOST/i.test(item.error));
    if (!unreachable || attempt > 40) return;
    setTimeout(async () => {
      await ensureSchema();
      if (schemaReport?.ok) {
        await bootstrapDefaults();
        await purgeLegacyDemoData();
        void mediaStore.runBackfill();
        console.log('[schema] database is back — upgrade finished');
      }
      retrySchema(attempt + 1);
    }, 30_000).unref();
  };
  retrySchema(1);
  // Signed-schedule license checks (never more often than the token asks)
  license.start();

  // Last in the chain: any error a route did not answer itself
  app.use(errorHandler());

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
  // Keep-alive a little longer than common proxies (they close first, cleanly)
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 120_000;

  // Restarts (deploys, hosting panel) finish the requests in flight first
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[server] ${signal} received, finishing open requests…`);
    server.close(() => {
      void cache.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
