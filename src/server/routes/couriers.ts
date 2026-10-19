/**
 * Courier APIs — Steadfast, Pathao, RedX, Carrybee (booking, status sync, webhooks)
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerCourierRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import { db } from '../../db/index.ts';
import { siteSettings, orders, orderItems, products, productVariations, inventoryTransactions, customers } from '../../db/schema.ts';
import { inArray, eq, and, sql, desc, or, like } from 'drizzle-orm';
import crypto from 'crypto';
import { insertReturning } from '../../db/mysql-helpers.ts';
import type * as Server from '../../../server.ts';


/* ---------------------------------------------------------------- booking */

export interface DispatchOptions {
  note?: string;
  /** Amount the rider collects. Defaults to the order total, or 0 when already paid */
  codAmount?: number | string | null;
  pathao?: {
    storeId?: string | number;
    cityId?: string | number;
    zoneId?: string | number;
    areaId?: string | number;
    weight?: string | number;
    deliveryType?: string | number;
  };
  /** v3.11 — RedX delivery area / pickup store / weight in kg */
  redx?: { areaId?: string | number; storeId?: string | number; weight?: string | number };
  /** v3.11 — Carrybee city / zone / area / store / weight in kg / delivery type */
  carrybee?: {
    cityId?: string | number;
    zoneId?: string | number;
    areaId?: string | number;
    storeId?: string | number;
    weight?: string | number;
    deliveryType?: string | number;
  };
}

export interface RegisterCourierRoutesDeps {
  actorName: typeof Server.actorName;
  app: typeof Server.app;
  assignOrders: typeof Server.assignOrders;
  nextOrderNumber: typeof Server.nextOrderNumber;
  notifyOrderStatusSms: typeof Server.notifyOrderStatusSms;
  paymentStatusForAdvance: typeof Server.paymentStatusForAdvance;
  syncOrderStock: typeof Server.syncOrderStock;
  updateOne: typeof Server.updateOne;
}

export function registerCourierRoutes(deps: RegisterCourierRoutesDeps) {
// ==========================================
// COURIER APIS (Steadfast, Pathao) — real bookings
// ==========================================
/**
 * Until this build "Send to courier" never contacted a courier: it made up an
 * id like STE-123456-7 locally, so nothing reached Steadfast or Pathao. These
 * helpers talk to the real merchant APIs.
 *
 * Credentials live in the `courier_config` setting (Dashboard → System
 * Configuration → Integrations), which the public settings endpoint never
 * returns. The old unused `courier_settings` key is read only as a fallback.
 */
const STEADFAST_DEFAULT_BASE = 'https://portal.packzy.com/api/v1';
const PATHAO_LIVE_BASE = 'https://api-hermes.pathao.com';
const PATHAO_SANDBOX_BASE = 'https://courier-api-sandbox.pathao.com';
/** Pathao asks every merchant endpoint to echo this header back (same value for all merchants) */
const PATHAO_WEBHOOK_INTEGRATION_SECRET = 'f3992ecc-59da-4cbe-a049-a13da2018d51';
/** v3.11 — RedX (openapi.redx.com.bd) and Carrybee (developers.carrybee.com) */
const REDX_LIVE_BASE = 'https://openapi.redx.com.bd/v1.0.0-beta';
const REDX_SANDBOX_BASE = 'https://sandbox.redx.com.bd/v1.0.0-beta';
const CARRYBEE_LIVE_BASE = 'https://developers.carrybee.com';
const CARRYBEE_SANDBOX_BASE = 'https://stage-sandbox.carrybee.com';
/** Couriers this server can book through an API; the rest are recorded by hand */
const API_COURIERS = ['steadfast', 'pathao', 'redx', 'carrybee'];
const COURIER_NAMES: Record<string, string> = {
  steadfast: 'Steadfast',
  pathao: 'Pathao',
  redx: 'RedX',
  carrybee: 'Carrybee',
  paperfly: 'Paperfly',
  sundarban: 'Sundarban',
  manual: 'In-house delivery',
};
const courierName = (key: string) => COURIER_NAMES[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Courier');

class CourierError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function readCourierConfig(): Promise<any> {
  const rows = await db
    .select()
    .from(siteSettings)
    .where(inArray(siteSettings.key, ['courier_config', 'courier_settings']));
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const parse = (raw?: string) => {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };
  const current = parse(byKey.get('courier_config'));
  const legacy = parse(byKey.get('courier_settings'));
  return {
    ...current,
    steadfast: { ...(legacy.steadfast || {}), ...(current.steadfast || {}) },
    pathao: { ...(legacy.pathao || {}), ...(current.pathao || {}) },
    redx: { ...(legacy.redx || {}), ...(current.redx || {}) },
    carrybee: { ...(legacy.carrybee || {}), ...(current.carrybee || {}) },
  };
}

/** 11-digit Bangladeshi mobile (01XXXXXXXXX) from whatever the customer typed */
function courierPhone(raw: any): string {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('880')) digits = digits.slice(2);
  else if (digits.startsWith('88') && digits.length === 13) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`;
  return digits;
}

/** fetch with a timeout, always resolving to { ok, status, data } */
async function courierFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs || 20000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text.slice(0, 300) };
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error: any) {
    const reason = error?.name === 'AbortError' ? 'timed out' : error?.message || 'network error';
    throw new CourierError(`Could not reach the courier (${reason}). Please try again.`, 502);
  } finally {
    clearTimeout(timer);
  }
}

/** Field errors from Laravel-style APIs ({ errors: { field: ["msg"] } }) as one line */
function courierErrorText(data: any, fallback: string): string {
  const errors = data?.errors;
  if (errors && typeof errors === 'object') {
    const messages = Object.values(errors)
      .flat()
      .map((item) => String(item))
      .filter(Boolean);
    if (messages.length > 0) return messages.join(' ');
  }
  return String(data?.message || data?.error || fallback);
}

/* ---------------------------------------------------------------- Steadfast */

function steadfastBase(cfg: any): string {
  const saved = String(cfg?.baseUrl || '').trim().replace(/\/+$/, '');
  // The old default (api.steadfast.com.bd) never existed; use the real host
  if (!saved || /api\.steadfast\.com\.bd/i.test(saved)) return STEADFAST_DEFAULT_BASE;
  return saved;
}

async function steadfastRequest(cfg: any, method: string, pathName: string, body?: any) {
  if (!cfg?.apiKey || !cfg?.secretKey) {
    throw new CourierError('Steadfast is not set up. Add the API Key and Secret Key in System Configuration → Integrations.');
  }
  return courierFetch(`${steadfastBase(cfg)}${pathName}`, {
    method,
    headers: {
      'Api-Key': String(cfg.apiKey).trim(),
      'Secret-Key': String(cfg.secretKey).trim(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/* ------------------------------------------------------------------- Pathao */

function pathaoBase(cfg: any): string {
  const saved = String(cfg?.baseUrl || '').trim().replace(/\/+$/, '');
  if (saved) return saved;
  return cfg?.sandbox ? PATHAO_SANDBOX_BASE : PATHAO_LIVE_BASE;
}

/**
 * Pathao tokens last about five days. One is kept in memory and in the
 * database (a secret setting) so a restart does not issue a new one each time;
 * it is refreshed with the refresh token, or re-issued from the password.
 */
let pathaoTokenCache: { key: string; accessToken: string; refreshToken: string; expiresAt: number } | null = null;

async function pathaoToken(cfg: any, forceNew = false): Promise<string> {
  if (!cfg?.clientId || !cfg?.clientSecret || !cfg?.username || !cfg?.password) {
    throw new CourierError(
      'Pathao is not set up. Add Client ID, Client Secret, Username and Password in System Configuration → Integrations.'
    );
  }
  const base = pathaoBase(cfg);
  const key = `${base}|${cfg.clientId}|${cfg.username}`;

  if (!pathaoTokenCache || pathaoTokenCache.key !== key) {
    try {
      const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'pathao_token'));
      const stored = rows.length > 0 ? JSON.parse(rows[0].value) : null;
      pathaoTokenCache = stored && stored.key === key ? stored : null;
    } catch {
      pathaoTokenCache = null;
    }
  }
  if (!forceNew && pathaoTokenCache && pathaoTokenCache.expiresAt - Date.now() > 10 * 60 * 1000) {
    return pathaoTokenCache.accessToken;
  }

  const issue = async (grant: Record<string, string>) =>
    courierFetch(`${base}/aladdin/api/v1/issue-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: String(cfg.clientId).trim(),
        client_secret: String(cfg.clientSecret).trim(),
        ...grant,
      }),
    });

  let result: any = null;
  if (!forceNew && pathaoTokenCache?.refreshToken) {
    result = await issue({ grant_type: 'refresh_token', refresh_token: pathaoTokenCache.refreshToken }).catch(() => null);
    if (!result?.ok || !result.data?.access_token) result = null;
  }
  if (!result) {
    result = await issue({
      grant_type: 'password',
      username: String(cfg.username).trim(),
      password: String(cfg.password),
    });
  }
  if (!result.ok || !result.data?.access_token) {
    throw new CourierError(
      `Pathao sign-in failed: ${courierErrorText(result.data, 'check the Client ID, Client Secret, username and password')}.`,
      result.status === 401 || result.status === 400 ? 400 : 502
    );
  }

  pathaoTokenCache = {
    key,
    accessToken: result.data.access_token,
    refreshToken: result.data.refresh_token || '',
    expiresAt: Date.now() + (Number(result.data.expires_in) || 3600) * 1000,
  };
  try {
    const value = JSON.stringify(pathaoTokenCache);
    await db.insert(siteSettings).values({ key: 'pathao_token', value }).onDuplicateKeyUpdate({ set: { value } });
  } catch {
    /* memory copy still works */
  }
  return pathaoTokenCache.accessToken;
}

async function pathaoRequest(cfg: any, method: string, pathName: string, body?: any) {
  const send = async (token: string) =>
    courierFetch(`${pathaoBase(cfg)}${pathName}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  let result = await send(await pathaoToken(cfg));
  // A token revoked on Pathao's side: get a fresh one once and retry
  if (result.status === 401) result = await send(await pathaoToken(cfg, true));
  return result;
}

const pathaoLocationCache = new Map<string, { at: number; data: any[] }>();

async function pathaoList(cfg: any, pathName: string): Promise<any[]> {
  const cacheKey = `${pathaoBase(cfg)}${pathName}`;
  const hit = pathaoLocationCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 12 * 60 * 60 * 1000) return hit.data;
  const result = await pathaoRequest(cfg, 'GET', pathName);
  if (!result.ok) throw new CourierError(courierErrorText(result.data, 'Pathao did not return the list.'), 502);
  const list = Array.isArray(result.data?.data?.data)
    ? result.data.data.data
    : Array.isArray(result.data?.data)
    ? result.data.data
    : [];
  pathaoLocationCache.set(cacheKey, { at: Date.now(), data: list });
  return list;
}

/* --------------------------------------------------------------------- RedX */
/*
 * RedX Open API (v1.0.0-beta). One "API access token" from the RedX merchant
 * panel (Developer API), sent as  API-ACCESS-TOKEN: Bearer <token>.
 *   GET  /areas                 delivery areas (id, name, post_code, division_name)
 *   GET  /pickup/stores         pickup stores
 *   POST /parcel                create → { tracking_id }
 *   GET  /parcel/info/{id}      → { parcel: { status, … } }
 *   GET  /parcel/track/{id}     → { tracking: [ { message_en, message_bn, time } ] }
 */
function redxBase(cfg: any): string {
  const saved = String(cfg?.baseUrl || '').trim().replace(/\/+$/, '');
  if (saved) return saved;
  return cfg?.sandbox ? REDX_SANDBOX_BASE : REDX_LIVE_BASE;
}

async function redxRequest(cfg: any, method: string, pathName: string, body?: any) {
  const token = String(cfg?.token || '').trim().replace(/^Bearer\s+/i, '');
  if (!token) throw new CourierError('RedX is not set up. Add the RedX API access token in System Configuration → Couriers.');
  return courierFetch(`${redxBase(cfg)}${pathName}`, {
    method,
    headers: {
      'API-ACCESS-TOKEN': `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const redxCache = new Map<string, { at: number; data: any[] }>();
async function redxList(cfg: any, kind: 'areas' | 'stores'): Promise<any[]> {
  const key = `${redxBase(cfg)}|${kind}|${String(cfg?.token || '').slice(-8)}`;
  const hit = redxCache.get(key);
  if (hit && Date.now() - hit.at < 12 * 60 * 60 * 1000) return hit.data;
  const result = await redxRequest(cfg, 'GET', kind === 'areas' ? '/areas' : '/pickup/stores');
  if (!result.ok) throw new CourierError(`RedX: ${courierErrorText(result.data, `HTTP ${result.status}`)}`, result.status === 401 ? 400 : 502);
  const list = kind === 'areas' ? result.data?.areas || result.data?.data || [] : result.data?.pickup_stores || result.data?.data || [];
  const rows = Array.isArray(list) ? list : [];
  redxCache.set(key, { at: Date.now(), data: rows });
  return rows;
}

const placeWords = (text: string) =>
  String(text || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, ' ')
    .trim();

/**
 * The RedX delivery area for an order: the one picked in the dispatch window,
 * else the best match for its thana / address, else the district.
 */
async function redxResolveArea(cfg: any, order: any, pickedId?: any): Promise<{ id: number; name: string }> {
  const areas = await redxList(cfg, 'areas');
  if (Number(pickedId)) {
    const found = areas.find((area: any) => Number(area.id) === Number(pickedId));
    return { id: Number(pickedId), name: String(found?.name || '') };
  }
  const haystack = ` ${placeWords([order.thana, order.district, order.customerAddress].filter(Boolean).join(' '))} `;
  let best: any = null;
  let bestScore = 0;
  for (const area of areas) {
    const name = placeWords(area.name);
    if (!name || name.length < 3) continue;
    if (!haystack.includes(` ${name} `)) continue;
    // Longer, more specific names win; a match on the thana counts extra
    let score = name.length;
    if (order.thana && placeWords(order.thana).includes(name)) score += 50;
    if (score > bestScore) {
      best = area;
      bestScore = score;
    }
  }
  if (!best) {
    throw new CourierError('RedX could not work out the delivery area from the address. Choose the RedX area in the dispatch window.');
  }
  return { id: Number(best.id), name: String(best.name) };
}

/* ----------------------------------------------------------------- Carrybee */
/*
 * Carrybee merchant API v2 (developers.carrybee.com). Three keys from the
 * Carrybee merchant panel: Client-ID, Client-Secret and Client-Context.
 *   GET  /api/v2/stores, /api/v2/cities, /cities/{c}/zones, /cities/{c}/zones/{z}/areas
 *   POST /api/v2/address-details { query }   → city / zone / area for an address
 *   POST /api/v2/orders                        → { data: { order: { consignment_id, delivery_fee, cod_fee } } }
 *   GET  /api/v2/orders/{id}/details           → { data: { …status…, collected_amount, … } }
 *   POST /api/v2/orders/{id}/cancel            { cancellation_reason }
 * Webhook: header X-Carrybee-Webhook-Signature equals the secret set in Carrybee.
 */
function carrybeeBase(cfg: any): string {
  const saved = String(cfg?.baseUrl || '').trim().replace(/\/+$/, '');
  if (saved) return saved;
  return cfg?.sandbox ? CARRYBEE_SANDBOX_BASE : CARRYBEE_LIVE_BASE;
}

async function carrybeeRequest(cfg: any, method: string, pathName: string, body?: any) {
  if (!cfg?.clientId || !cfg?.clientSecret || !cfg?.clientContext) {
    throw new CourierError('Carrybee is not set up. Add the Client ID, Client Secret and Client Context in System Configuration → Couriers.');
  }
  const result = await courierFetch(`${carrybeeBase(cfg)}${pathName}`, {
    method,
    headers: {
      'Client-ID': String(cfg.clientId).trim(),
      'Client-Secret': String(cfg.clientSecret).trim(),
      'Client-Context': String(cfg.clientContext).trim(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  // Carrybee also answers 200 with { error: true } / { status: false }
  if (result.ok && (result.data?.error === true || result.data?.status === false)) return { ...result, ok: false };
  return result;
}

const carrybeeCache = new Map<string, { at: number; data: any[] }>();
async function carrybeeList(cfg: any, pathName: string, key: string): Promise<any[]> {
  const cacheKey = `${carrybeeBase(cfg)}|${String(cfg?.clientId || '')}|${pathName}`;
  const hit = carrybeeCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 12 * 60 * 60 * 1000) return hit.data;
  const result = await carrybeeRequest(cfg, 'GET', pathName);
  if (!result.ok) throw new CourierError(`Carrybee: ${courierErrorText(result.data, `HTTP ${result.status}`)}`, result.status === 401 ? 400 : 502);
  const list = result.data?.data?.[key] ?? result.data?.[key] ?? result.data?.data ?? [];
  const rows = Array.isArray(list) ? list : [];
  carrybeeCache.set(cacheKey, { at: Date.now(), data: rows });
  return rows;
}

const findByName = (list: any[], name: string) => {
  const wanted = placeWords(name);
  if (!wanted) return null;
  return (
    list.find((row: any) => placeWords(row.name) === wanted) ||
    list.find((row: any) => {
      const n = placeWords(row.name);
      return n.length >= 3 && (wanted.includes(n) || n.includes(wanted));
    }) ||
    null
  );
};

/** City / zone (/ area) for Carrybee: picked by hand, from Carrybee's address lookup, or from the district / thana */
async function carrybeeResolveLocation(cfg: any, order: any, picked: any = {}): Promise<{ cityId: number; zoneId: number; areaId: number | null }> {
  if (Number(picked.cityId) && Number(picked.zoneId)) {
    return { cityId: Number(picked.cityId), zoneId: Number(picked.zoneId), areaId: Number(picked.areaId) || null };
  }
  const address = String(order.customerAddress || '').replace(/\s+/g, ' ').trim();
  try {
    const lookup = await carrybeeRequest(cfg, 'POST', '/api/v2/address-details', { query: address.slice(0, 250) });
    const data = lookup.data?.data || {};
    if (lookup.ok && Number(data.city_id) && Number(data.zone_id)) {
      return { cityId: Number(data.city_id), zoneId: Number(data.zone_id), areaId: Number(data.area_id) || null };
    }
  } catch {
    /* fall back to the district / thana below */
  }
  if (order.district) {
    const cities = await carrybeeList(cfg, '/api/v2/cities', 'cities');
    const city = findByName(cities, order.district);
    if (city) {
      const zones = await carrybeeList(cfg, `/api/v2/cities/${Number(city.id)}/zones`, 'zones');
      const zone = order.thana ? findByName(zones, order.thana) : null;
      if (zone) return { cityId: Number(city.id), zoneId: Number(zone.id), areaId: null };
    }
  }
  throw new CourierError('Carrybee could not work out the city and zone from the address. Choose them in the dispatch window.');
}

/* ---------------------------------------------------------- status mapping */

/** Courier status → our courier_status, and the order status it implies (if any) */
function mapCourierStatus(raw: any): { courierStatus: string; orderStatus?: string } {
  const value = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, '_')
    .replace(/^order_/, '');
  if (!value) return { courierStatus: 'pending' };
  if (value.includes('approval_pending')) return { courierStatus: value };
  // RedX: agent-hold / agent-returning; Carrybee: returned-to-merchant
  if (value.includes('returning')) return { courierStatus: 'returning' };
  if (value === 'delivered' || value === 'partial_delivered' || value === 'partial_delivery') {
    return { courierStatus: value === 'delivered' ? 'delivered' : 'partial_delivered', orderStatus: 'delivered' };
  }
  if (value.includes('return')) return { courierStatus: 'returned' };
  // Checked before the pickup rule: Pathao's Pickup_Cancelled / Pickup_Failed
  if (value.includes('cancel')) return { courierStatus: 'cancelled' };
  if (value.includes('fail')) return { courierStatus: value };
  // RedX: pickup-pending / pickup-processing; Carrybee: pending / accepted
  if (value.startsWith('pickup') || value === 'accepted' || value === 'created') return { courierStatus: 'pickup_pending' };
  if (value === 'hold' || value === 'on_hold') return { courierStatus: 'on_hold' };
  if (value.includes('hold')) return { courierStatus: 'on_hold' };
  if (
    value.includes('transit') ||
    value.includes('picked') ||
    value.includes('hub') ||
    value.includes('assigned_for_delivery') ||
    value.includes('in_progress') ||
    value.includes('ready_for_delivery') ||
    value.includes('area_change')
  ) {
    return { courierStatus: 'in_transit' };
  }
  return { courierStatus: value };
}

async function applyCourierStatus(orderId: number, rawStatus: any) {
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = rows[0];
  if (!order) return null;
  const mapped = mapCourierStatus(rawStatus);
  const patch: any = { courierStatus: mapped.courierStatus, updatedAt: new Date() };
  // Only move an order forward to delivered; never re-open a cancelled/refunded one
  if (
    mapped.orderStatus === 'delivered' &&
    !['delivered', 'completed', 'cancelled', 'refunded', 'returned', 'partially_returned'].includes(order.orderStatus || '')
  ) {
    patch.orderStatus = 'delivered';
  }
  await db.update(orders).set(patch).where(eq(orders.id, orderId));
  if (patch.orderStatus) void deps.notifyOrderStatusSms(orderId, order.orderStatus);
  const updated = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return updated[0] || null;
}

async function orderItemSummary(orderId: number): Promise<{ text: string; quantity: number }> {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const text = items
    .map((item) => `${item.productName}${item.variationLabel ? ` (${item.variationLabel})` : ''} x${item.quantity}`)
    .join(', ');
  return { text, quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) };
}

function defaultCodAmount(order: any): number {
  // v3.9 — an advance is not collected again: the rider collects total − advance
  if (order.paymentStatus === 'paid') return 0;
  return Math.max(0, Math.round(((Number(order.total) || 0) - (Number(order.advancePaid) || 0)) * 100) / 100);
}

/**
 * Books one order with Steadfast or Pathao and returns the consignment the
 * courier created. Throws a CourierError with the courier's own message when
 * the booking is refused, so the dashboard can show exactly what to fix.
 */
async function bookWithCourier(
  courier: string,
  order: any,
  options: DispatchOptions = {}
): Promise<{ consignmentId: string; trackingCode: string; courierStatus: string; message: string }> {
  const cfg = await readCourierConfig();
  const phone = courierPhone(order.customerPhone);
  if (!/^01\d{9}$/.test(phone)) {
    throw new CourierError(`The customer's phone "${order.customerPhone}" is not a valid 11-digit mobile number.`);
  }
  const name = String(order.customerName || '').trim().slice(0, 100);
  const address = String(order.customerAddress || '').replace(/\s+/g, ' ').trim();
  if (!address) throw new CourierError('The order has no delivery address.');
  const cod =
    options.codAmount !== undefined && options.codAmount !== null && String(options.codAmount) !== ''
      ? Math.max(0, Number(options.codAmount) || 0)
      : defaultCodAmount(order);
  const summary = await orderItemSummary(order.id);
  const note = String(options.note || '').trim();

  if (courier === 'steadfast') {
    const result = await steadfastRequest(cfg.steadfast, 'POST', '/create_order', {
      invoice: String(order.orderNumber).replace(/[^A-Za-z0-9_-]/g, '-'),
      recipient_name: name,
      recipient_phone: phone,
      recipient_address: address.slice(0, 250),
      cod_amount: Math.round(cod * 100) / 100,
      note: note.slice(0, 250) || undefined,
      item_description: summary.text.slice(0, 250) || undefined,
      delivery_type: 0,
    });
    const consignment = result.data?.consignment;
    if (!result.ok || Number(result.data?.status) !== 200 || !consignment?.consignment_id) {
      const text = courierErrorText(result.data, 'Steadfast did not accept the order.');
      throw new CourierError(
        /invoice.*(taken|exist)/i.test(text)
          ? `Steadfast already has a parcel for ${order.orderNumber}. Look it up in the Steadfast panel and type its consignment ID instead.`
          : `Steadfast: ${text}`,
        result.status >= 500 ? 502 : 400
      );
    }
    return {
      consignmentId: String(consignment.consignment_id),
      trackingCode: String(consignment.tracking_code || ''),
      courierStatus: mapCourierStatus(consignment.status || 'in_review').courierStatus,
      message: `Booked with Steadfast. Consignment ${consignment.consignment_id}${
        consignment.tracking_code ? `, tracking ${consignment.tracking_code}` : ''
      }.`,
    };
  }

  if (courier === 'pathao') {
    const p = options.pathao || {};
    const storeId = Number(p.storeId || cfg.pathao?.storeId);
    if (!storeId) throw new CourierError('Set the Pathao Store ID in System Configuration → Integrations.');
    if (name.length < 3) throw new CourierError('Pathao needs a customer name of at least 3 characters.');
    if (address.length < 10) {
      throw new CourierError('Pathao needs a delivery address of at least 10 characters. Edit the order address first.');
    }
    const weight = Math.min(10, Math.max(0.5, Number(p.weight || cfg.pathao?.defaultWeight) || 0.5));
    const payload: Record<string, any> = {
      store_id: storeId,
      merchant_order_id: String(order.orderNumber),
      recipient_name: name,
      recipient_phone: phone,
      recipient_address: address.slice(0, 220),
      delivery_type: Number(p.deliveryType || cfg.pathao?.deliveryType) === 12 ? 12 : 48,
      item_type: 2,
      item_quantity: Math.max(1, summary.quantity),
      item_weight: weight,
      amount_to_collect: Math.round(cod),
      item_description: summary.text.slice(0, 250) || undefined,
      special_instruction: note.slice(0, 250) || undefined,
    };
    // City/zone/area are optional: Pathao works them out from the address,
    // but a picked location is always more accurate.
    if (Number(p.cityId)) payload.recipient_city = Number(p.cityId);
    if (Number(p.zoneId)) payload.recipient_zone = Number(p.zoneId);
    if (Number(p.areaId)) payload.recipient_area = Number(p.areaId);

    const result = await pathaoRequest(cfg.pathao, 'POST', '/aladdin/api/v1/orders', payload);
    const data = result.data?.data;
    if (!result.ok || !data?.consignment_id) {
      throw new CourierError(
        `Pathao: ${courierErrorText(result.data, 'Pathao did not accept the order.')}`,
        result.status >= 500 ? 502 : 400
      );
    }
    return {
      consignmentId: String(data.consignment_id),
      trackingCode: '',
      courierStatus: mapCourierStatus(data.order_status || 'pending').courierStatus,
      message: `Booked with Pathao. Consignment ${data.consignment_id}${
        data.delivery_fee != null ? `, delivery fee ৳${data.delivery_fee}` : ''
      }.`,
    };
  }

  if (courier === 'redx') {
    const r = options.redx || {};
    const area = await redxResolveArea(cfg.redx, order, r.areaId);
    const kg = Math.min(30, Math.max(0.1, Number(r.weight || cfg.redx?.defaultWeight) || 0.5));
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const payload: Record<string, any> = {
      customer_name: name || 'Customer',
      customer_phone: phone,
      delivery_area: area.name,
      delivery_area_id: area.id,
      customer_address: address.slice(0, 250),
      merchant_invoice_id: String(order.orderNumber),
      cash_collection_amount: String(Math.round(cod)),
      parcel_weight: Math.round(kg * 1000),
      instruction: note.slice(0, 250) || '',
      value: String(Math.round(Number(order.total) || cod)),
      parcel_details_json: items.slice(0, 10).map((item) => ({
        name: `${item.productName}${item.variationLabel ? ` (${item.variationLabel})` : ''}`.slice(0, 100),
        category: 'general',
        value: Math.round(Number(item.subtotal) || 0),
      })),
    };
    const storeId = Number(r.storeId || cfg.redx?.storeId);
    if (storeId) payload.pickup_store_id = storeId;
    const result = await redxRequest(cfg.redx, 'POST', '/parcel', payload);
    const trackingId = result.data?.tracking_id;
    if (!result.ok || !trackingId) {
      throw new CourierError(`RedX: ${courierErrorText(result.data, 'RedX did not accept the parcel.')}`, result.status >= 500 ? 502 : 400);
    }
    return {
      consignmentId: String(trackingId),
      trackingCode: String(trackingId),
      courierStatus: 'pickup_pending',
      message: `Booked with RedX. Tracking ID ${trackingId} (area: ${area.name}).`,
    };
  }

  if (courier === 'carrybee') {
    const c = options.carrybee || {};
    const storeId = String(c.storeId || cfg.carrybee?.storeId || '').trim();
    if (!storeId) throw new CourierError('Set the Carrybee store in System Configuration → Couriers.');
    const place = await carrybeeResolveLocation(cfg.carrybee, order, c);
    const kg = Math.min(30, Math.max(0.1, Number(c.weight || cfg.carrybee?.defaultWeight) || 0.5));
    const payload: Record<string, any> = {
      store_id: storeId,
      merchant_order_id: String(order.orderNumber),
      delivery_type: Number(c.deliveryType || cfg.carrybee?.deliveryType) === 2 ? 2 : 1,
      product_type: [1, 2, 3].includes(Number(cfg.carrybee?.productType)) ? Number(cfg.carrybee.productType) : 1,
      recipient_phone: phone,
      recipient_name: name || 'Customer',
      recipient_address: address.slice(0, 250),
      city_id: place.cityId,
      zone_id: place.zoneId,
      item_weight: Math.round(kg * 1000),
      item_quantity: Math.max(1, summary.quantity),
      collectable_amount: Math.round(cod),
      product_description: summary.text.slice(0, 250) || undefined,
    };
    if (place.areaId) payload.area_id = place.areaId;
    if (note) payload.special_instruction = note.slice(0, 250);
    const result = await carrybeeRequest(cfg.carrybee, 'POST', '/api/v2/orders', payload);
    const booked = result.data?.data?.order || result.data?.order || {};
    if (!result.ok || !booked.consignment_id) {
      throw new CourierError(`Carrybee: ${courierErrorText(result.data, 'Carrybee did not accept the order.')}`, result.status >= 500 ? 502 : 400);
    }
    return {
      consignmentId: String(booked.consignment_id),
      trackingCode: '',
      courierStatus: 'pickup_pending',
      message: `Booked with Carrybee. Consignment ${booked.consignment_id}${booked.delivery_fee != null ? `, delivery fee ৳${booked.delivery_fee}` : ''}.`,
    };
  }

  throw new CourierError('This courier has no API connection. Type the consignment ID by hand.');
}

/** Live status from the courier for one dispatched order */
async function fetchCourierStatus(order: any): Promise<string> {
  const cfg = await readCourierConfig();
  if (order.courierService === 'steadfast') {
    const result = await steadfastRequest(
      cfg.steadfast,
      'GET',
      `/status_by_cid/${encodeURIComponent(String(order.consignmentId))}`
    );
    if (!result.ok || !result.data?.delivery_status) {
      throw new CourierError(`Steadfast: ${courierErrorText(result.data, 'status not available')}`, 502);
    }
    return String(result.data.delivery_status);
  }
  if (order.courierService === 'pathao') {
    const result = await pathaoRequest(
      cfg.pathao,
      'GET',
      `/aladdin/api/v1/orders/${encodeURIComponent(String(order.consignmentId))}/info`
    );
    const status = result.data?.data?.order_status;
    if (!result.ok || !status) throw new CourierError(`Pathao: ${courierErrorText(result.data, 'status not available')}`, 502);
    return String(status);
  }
  if (order.courierService === 'redx') {
    const result = await redxRequest(cfg.redx, 'GET', `/parcel/info/${encodeURIComponent(String(order.consignmentId))}`);
    const status = result.data?.parcel?.status;
    if (!result.ok || !status) throw new CourierError(`RedX: ${courierErrorText(result.data, 'status not available')}`, 502);
    return String(status);
  }
  if (order.courierService === 'carrybee') {
    const result = await carrybeeRequest(cfg.carrybee, 'GET', `/api/v2/orders/${encodeURIComponent(String(order.consignmentId))}/details`);
    // The parcel's own state; a money state (paid / invoiced …) is not a delivery status
    const details = result.data?.data || {};
    const status = [details.order_status, details.status, details.delivery_status, details.parcel_status, details.transfer_status]
      .map((value) => String(value ?? '').trim())
      .find((value) => value && !/^(un)?paid$|payment|invoice|settle/i.test(value));
    if (!result.ok || !status) throw new CourierError(`Carrybee: ${courierErrorText(result.data, 'status not available')}`, 502);
    return String(status);
  }
  throw new CourierError('Live status is available for Steadfast, Pathao, RedX and Carrybee.');
}

/* ----------------------------------------------------------- admin routes */

deps.app.get('/api/admin/courier/settings', async (_req, res) => {
  try {
    res.json(await readCourierConfig());
  } catch (err) {
    console.error('Failed to get courier settings:', err);
    res.status(500).json({ error: 'Failed to get courier settings' });
  }
});

deps.app.post('/api/admin/courier/settings', async (req, res) => {
  try {
    const settings = req.body || {};
    const value = JSON.stringify(settings);
    await db.insert(siteSettings).values({ key: 'courier_config', value }).onDuplicateKeyUpdate({ set: { value } });
    pathaoTokenCache = null;
    redxCache.clear();
    carrybeeCache.clear();
    res.json({ success: true, settings });
  } catch (err) {
    console.error('Failed to save courier settings:', err);
    res.status(500).json({ error: 'Failed to save courier settings' });
  }
});

/**
 * "Test connection" in Integrations. Uses the values on screen (even unsaved)
 * so the owner can check credentials before saving them.
 */
deps.app.post('/api/admin/courier/test', async (req, res) => {
  const courier = String(req.body?.courier || '');
  try {
    const saved = await readCourierConfig();
    const cfg = { ...(saved[courier] || {}), ...(req.body?.config || {}) };
    if (courier === 'steadfast') {
      const result = await steadfastRequest(cfg, 'GET', '/get_balance');
      if (!result.ok || result.data?.current_balance === undefined) {
        throw new CourierError(`Steadfast refused the keys: ${courierErrorText(result.data, `HTTP ${result.status}`)}`);
      }
      return res.json({
        success: true,
        message: `Connected to Steadfast. Current balance ৳${Number(result.data.current_balance).toLocaleString('en-US')}.`,
      });
    }
    if (courier === 'pathao') {
      pathaoTokenCache = null;
      await pathaoToken(cfg, true);
      const stores = await pathaoList(cfg, '/aladdin/api/v1/stores').catch(() => []);
      const storeOptions = stores.map((store: any) => ({
        id: String(store.store_id),
        name: String(store.store_name || store.store_id),
        active: store.is_active !== 0,
      }));
      const storeOk = !cfg.storeId || storeOptions.some((store: any) => store.id === String(cfg.storeId));
      return res.json({
        success: true,
        stores: storeOptions,
        message: storeOk
          ? `Connected to Pathao. ${storeOptions.length} pickup store${storeOptions.length === 1 ? '' : 's'} found.`
          : `Connected to Pathao, but Store ID ${cfg.storeId} is not one of your stores. Pick one from the list.`,
      });
    }
    if (courier === 'redx') {
      redxCache.clear();
      const stores = await redxList(cfg, 'stores');
      const storeOptions = stores.map((store: any) => ({ id: String(store.id), name: String(store.name || store.id), area: store.area_name || '' }));
      const storeOk = !cfg.storeId || storeOptions.some((store: any) => store.id === String(cfg.storeId));
      return res.json({
        success: true,
        stores: storeOptions,
        message: storeOk
          ? `Connected to RedX${cfg.sandbox ? ' (sandbox)' : ''}. ${storeOptions.length} pickup store${storeOptions.length === 1 ? '' : 's'} found.`
          : `Connected to RedX, but pickup store ${cfg.storeId} is not one of yours. Pick one from the list.`,
      });
    }
    if (courier === 'carrybee') {
      carrybeeCache.clear();
      const stores = await carrybeeList(cfg, '/api/v2/stores', 'stores');
      const storeOptions = stores.map((store: any) => ({ id: String(store.id), name: String(store.name || store.id), active: store.is_active !== false }));
      const storeOk = !cfg.storeId || storeOptions.some((store: any) => store.id === String(cfg.storeId));
      return res.json({
        success: true,
        stores: storeOptions,
        message: storeOk
          ? `Connected to Carrybee${cfg.sandbox ? ' (sandbox)' : ''}. ${storeOptions.length} store${storeOptions.length === 1 ? '' : 's'} found.`
          : `Connected to Carrybee, but store ${cfg.storeId} is not one of yours. Pick one from the list.`,
      });
    }
    res.status(400).json({ error: 'Unknown courier.' });
  } catch (error: any) {
    res.status(error instanceof CourierError ? error.status : 500).json({
      success: false,
      error: error?.message || 'Connection test failed.',
    });
  }
});

/** v3.11 — RedX areas and pickup stores for the dispatch window */
deps.app.get('/api/admin/courier/redx/:kind', async (req, res) => {
  try {
    const cfg = (await readCourierConfig()).redx;
    const kind = req.params.kind === 'stores' ? 'stores' : req.params.kind === 'areas' ? 'areas' : null;
    if (!kind) return res.status(400).json({ error: 'Unknown list.' });
    const list = (await redxList(cfg, kind)).map((row: any) => ({
      id: row.id,
      name: row.name,
      district: row.division_name || row.district_name || '',
      postCode: row.post_code || '',
    }));
    res.json(list.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name))));
  } catch (error: any) {
    res.status(error instanceof CourierError ? error.status : 500).json({ error: error?.message || 'Could not load.' });
  }
});

/** v3.11 — Carrybee stores / cities / zones / areas for the dispatch window */
deps.app.get('/api/admin/courier/carrybee/:level/:cityId?/:zoneId?', async (req, res) => {
  try {
    const cfg = (await readCourierConfig()).carrybee;
    const { level } = req.params;
    const cityId = Number(req.params.cityId);
    const zoneId = Number(req.params.zoneId);
    let list: any[] = [];
    if (level === 'stores') list = await carrybeeList(cfg, '/api/v2/stores', 'stores');
    else if (level === 'cities') list = await carrybeeList(cfg, '/api/v2/cities', 'cities');
    else if (level === 'zones' && cityId) list = await carrybeeList(cfg, `/api/v2/cities/${cityId}/zones`, 'zones');
    else if (level === 'areas' && cityId && zoneId) list = await carrybeeList(cfg, `/api/v2/cities/${cityId}/zones/${zoneId}/areas`, 'areas');
    else return res.status(400).json({ error: 'Unknown list.' });
    res.json(list.map((row: any) => ({ id: row.id, name: row.name })).sort((a, b) => String(a.name).localeCompare(String(b.name))));
  } catch (error: any) {
    res.status(error instanceof CourierError ? error.status : 500).json({ error: error?.message || 'Could not load.' });
  }
});

/** Pathao city → zone → area pickers for the dispatch dialog */
deps.app.get('/api/admin/courier/pathao/:level/:parentId?', async (req, res) => {
  try {
    const cfg = (await readCourierConfig()).pathao;
    const { level, parentId } = req.params;
    let list: any[] = [];
    if (level === 'cities') {
      list = (await pathaoList(cfg, '/aladdin/api/v1/city-list')).map((row: any) => ({
        id: row.city_id,
        name: row.city_name,
      }));
    } else if (level === 'zones' && Number(parentId)) {
      list = (await pathaoList(cfg, `/aladdin/api/v1/cities/${Number(parentId)}/zone-list`)).map((row: any) => ({
        id: row.zone_id,
        name: row.zone_name,
      }));
    } else if (level === 'areas' && Number(parentId)) {
      list = (await pathaoList(cfg, `/aladdin/api/v1/zones/${Number(parentId)}/area-list`)).map((row: any) => ({
        id: row.area_id,
        name: row.area_name,
      }));
    } else if (level === 'stores') {
      list = (await pathaoList(cfg, '/aladdin/api/v1/stores')).map((row: any) => ({
        id: row.store_id,
        name: row.store_name,
      }));
    } else {
      return res.status(400).json({ error: 'Unknown list.' });
    }
    res.json(list.sort((a, b) => String(a.name).localeCompare(String(b.name))));
  } catch (error: any) {
    res.status(error instanceof CourierError ? error.status : 500).json({ error: error?.message || 'Could not load.' });
  }
});

/** Public tracking link for each supported courier. */
function courierTrackingUrl(courier: string, consignment: string, trackingCode?: string | null, orderNumber?: string | null): string {
  switch (courier) {
    case 'steadfast':
      // Steadfast's public page works with the tracking code
      return `https://steadfast.com.bd/t/${trackingCode || consignment}`;
    case 'pathao':
      return `https://merchant.pathao.com/tracking?consignment_id=${consignment}`;
    case 'redx':
      return `https://redx.com.bd/track-parcel/?trackingId=${encodeURIComponent(trackingCode || consignment)}`;
    case 'carrybee': {
      // Carrybee has no public tracking page: the shop's own order tracking is used
      const site = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
      return site && orderNumber ? `${site}/track?order=${encodeURIComponent(orderNumber)}` : '';
    }
    case 'paperfly':
      return `https://paperfly.com.bd/track?ref=${consignment}`;
    default:
      return '';
  }
}

/**
 * Dispatch one order.
 * - Steadfast / Pathao: the parcel is booked through the courier's API and the
 *   consignment id comes back from the courier.
 * - Typing a consignment id instead records a parcel booked elsewhere (the
 *   courier's own panel), for any courier.
 * - RedX / Paperfly / in-house have no API here: a consignment id is required,
 *   except in-house delivery, which gets an internal reference.
 */
deps.app.post('/api/admin/orders/:id/courier-ship', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { courier = 'steadfast', note, consignmentId: manualId, codAmount, pathao, redx, carrybee, resend } = req.body || {};
    const courierKey = String(courier);

    const ord = await db.select().from(orders).where(eq(orders.id, id));
    if (ord.length === 0) return res.status(404).json({ error: 'Order not found.' });
    const orderRecord = ord[0];
    if (['cancelled', 'refunded'].includes(orderRecord.orderStatus || '')) {
      return res.status(400).json({ error: 'A cancelled or refunded order cannot be sent to a courier.' });
    }

    const typedId = String(manualId || '').trim();
    let consignment = typedId;
    let trackingCode: string | null = null;
    let courierStatus = 'in_transit';
    let message = '';

    if (!typedId && API_COURIERS.includes(courierKey)) {
      if (orderRecord.consignmentId && API_COURIERS.includes(orderRecord.courierService || '') && !resend) {
        return res.status(409).json({
          error: `Already sent to ${courierName(orderRecord.courierService || '')} (consignment ${orderRecord.consignmentId}). Choose "Send again" only if that parcel was cancelled.`,
          alreadySent: true,
        });
      }
      const booked = await bookWithCourier(courierKey, orderRecord, { note, codAmount, pathao, redx, carrybee });
      consignment = booked.consignmentId;
      trackingCode = booked.trackingCode || null;
      courierStatus = booked.courierStatus;
      message = booked.message;
    } else if (!typedId) {
      if (courierKey !== 'manual') {
        return res.status(400).json({
          error: `${courierKey.toUpperCase()} has no API connection here. Book the parcel in the courier's panel and type its consignment ID.`,
        });
      }
      consignment = `LOCAL-${orderRecord.orderNumber}`;
      message = `In-house delivery recorded (${consignment}).`;
    } else {
      message = `${courierKey.toUpperCase()} consignment ${typedId} saved.`;
    }

    const updated = await deps.updateOne(
      db,
      orders,
      {
        orderStatus: ['delivered', 'completed'].includes(orderRecord.orderStatus || '') ? orderRecord.orderStatus : 'shipped',
        courierService: courierKey,
        consignmentId: consignment,
        trackingCode,
        courierStatus,
        courierSentAt: new Date(),
        notes: note ? `${orderRecord.notes || ''}\n[Courier] ${note}`.trim() : orderRecord.notes,
        updatedAt: new Date(),
      },
      eq(orders.id, id)
    );

    void deps.notifyOrderStatusSms(id, orderRecord.orderStatus, {
      courier: courierKey === 'manual' ? 'our delivery team' : courierName(courierKey),
      trackingUrl: courierTrackingUrl(courierKey, consignment, trackingCode, orderRecord.orderNumber),
    });
    res.json({
      success: true,
      order: updated,
      courier: courierKey,
      consignmentId: consignment,
      trackingCode,
      trackingUrl: courierTrackingUrl(courierKey, consignment, trackingCode, orderRecord.orderNumber),
      message,
    });
  } catch (err: any) {
    if (err instanceof CourierError) return res.status(err.status).json({ error: err.message });
    console.error('Courier dispatch error:', err);
    res.status(500).json({ error: 'Could not send to courier.' });
  }
});

/** Pull the live parcel status from the courier for one order */
deps.app.post('/api/admin/orders/:id/courier-sync', async (req, res) => {
  try {
    const rows = await db.select().from(orders).where(eq(orders.id, Number(req.params.id))).limit(1);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!order.consignmentId || !API_COURIERS.includes(order.courierService || '')) {
      return res.status(400).json({ error: 'This order was not booked through a connected courier (Steadfast, Pathao, RedX or Carrybee).' });
    }
    const status = await fetchCourierStatus(order);
    const updated = await applyCourierStatus(order.id, status);
    res.json({ success: true, courierStatus: updated?.courierStatus, order: updated, raw: status });
  } catch (error: any) {
    res.status(error instanceof CourierError ? error.status : 500).json({ error: error?.message || 'Could not refresh.' });
  }
});

/** Refresh every open Steadfast/Pathao parcel (the Orders page "Refresh courier status" button) */
deps.app.post('/api/admin/courier/sync-all', async (_req, res) => {
  try {
    const open = await db
      .select()
      .from(orders)
      .where(
        and(
          inArray(orders.courierService, API_COURIERS),
          sql`${orders.consignmentId} IS NOT NULL`,
          sql`(${orders.courierStatus} IS NULL OR ${orders.courierStatus} NOT IN ('delivered','partial_delivered','returned','cancelled'))`
        )
      )
      .orderBy(desc(orders.id))
      .limit(60);
    let updated = 0;
    const failed: Array<{ orderNumber: string; error: string }> = [];
    for (const order of open) {
      try {
        const status = await fetchCourierStatus(order);
        const before = order.courierStatus;
        const after = await applyCourierStatus(order.id, status);
        if (after && after.courierStatus !== before) updated += 1;
      } catch (error: any) {
        failed.push({ orderNumber: order.orderNumber, error: error?.message || 'failed' });
      }
    }
    res.json({ success: true, checked: open.length, updated, failed });
  } catch (error: any) {
    console.error('courier sync-all:', error);
    res.status(500).json({ error: 'Could not refresh courier statuses.' });
  }
});

/* ---------------------------------------------------------------- webhooks */

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Steadfast delivery-status webhook. When a Bearer token is configured the
 * call must carry it. Without one the body is not trusted at all: the status
 * is re-read from Steadfast's API before anything changes.
 */
deps.app.post('/api/webhooks/steadfast', async (req, res) => {
  try {
    const cfg = (await readCourierConfig()).steadfast || {};
    const secret = String(cfg.webhookSecret || '').trim();
    const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (secret && !safeEqual(given, secret)) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const body = req.body || {};
    const consignmentId = String(body.consignment_id || '').trim();
    const invoice = String(body.invoice || '').trim();
    if (!consignmentId && !invoice) return res.json({ status: 'success', message: 'Nothing to update.' });

    const rows = await db
      .select()
      .from(orders)
      .where(
        consignmentId
          ? and(eq(orders.courierService, 'steadfast'), eq(orders.consignmentId, consignmentId))
          : eq(orders.orderNumber, invoice)
      )
      .limit(1);
    const order = rows[0];
    if (order && body.status) {
      const status = secret ? String(body.status) : await fetchCourierStatus(order).catch(() => '');
      if (status) await applyCourierStatus(order.id, status);
    }
    res.json({ status: 'success', message: 'Webhook received successfully.' });
  } catch (error) {
    console.error('Steadfast webhook:', error);
    res.status(200).json({ status: 'success', message: 'Webhook received.' });
  }
});

/**
 * Pathao webhook. Pathao requires a 202 and the integration-secret header on
 * every response, including its first "webhook_integration" handshake. Its
 * signature header is one public value shared by every merchant, so it
 * proves nothing: the parcel's status is always re-read from Pathao's API.
 */
deps.app.post('/api/webhooks/pathao', async (req, res) => {
  let headerSecret = PATHAO_WEBHOOK_INTEGRATION_SECRET;
  let cfg: any = {};
  try {
    cfg = (await readCourierConfig()).pathao || {};
    if (cfg.webhookSecret) headerSecret = String(cfg.webhookSecret).trim();
  } catch {
    /* default secret */
  }
  res.setHeader('X-Pathao-Merchant-Webhook-Integration-Secret', headerSecret);
  res.status(202).json({ received: true });

  // Work after the reply: Pathao gives the endpoint 10 seconds
  const body = req.body || {};
  const consignmentId = String(body.consignment_id || '').trim();
  const event = String(body.event || '');
  if (!consignmentId || event === 'webhook_integration') return;
  try {
    const rows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.courierService, 'pathao'), eq(orders.consignmentId, consignmentId)))
      .limit(1);
    const order = rows[0];
    if (!order) return;
    const status = await fetchCourierStatus(order);
    await applyCourierStatus(order.id, status);
  } catch (error: any) {
    console.error('Pathao webhook follow-up failed:', error?.message || error);
  }
});

/**
 * v3.11 — RedX parcel-status webhook. Set the callback URL in the RedX panel to
 *   https://your-site/api/webhooks/redx?token=<webhook secret>
 * The body (tracking_number, status, invoice_number …) is never trusted on its
 * own: the parcel's status is read again from RedX's API before anything changes.
 */
deps.app.post('/api/webhooks/redx', async (req, res) => {
  try {
    const cfg = (await readCourierConfig()).redx || {};
    const secret = String(cfg.webhookSecret || '').trim();
    const given = String(req.query.token || req.headers['x-webhook-token'] || '').trim();
    if (secret && !safeEqual(given, secret)) return res.status(401).json({ success: false, message: 'Unauthorized' });
    res.json({ success: true });

    const body = req.body || {};
    const tracking = String(body.tracking_number || body.tracking_id || '').trim();
    const invoice = String(body.invoice_number || body.merchant_invoice_id || '').trim();
    if (!tracking && !invoice) return;
    const rows = await db
      .select()
      .from(orders)
      .where(tracking ? and(eq(orders.courierService, 'redx'), eq(orders.consignmentId, tracking)) : and(eq(orders.courierService, 'redx'), eq(orders.orderNumber, invoice)))
      .limit(1);
    const order = rows[0];
    if (!order) return;
    const status = await fetchCourierStatus(order).catch(() => (secret ? String(body.status || '') : ''));
    if (status) await applyCourierStatus(order.id, status);
  } catch (error: any) {
    console.error('RedX webhook:', error?.message || error);
    if (!res.headersSent) res.json({ success: true });
  }
});

/**
 * v3.11 — Carrybee webhook (events order.picked, order.in-transit,
 * order.delivered, order.delivery-failed, order.returned-to-merchant …).
 * With a secret set, the X-Carrybee-Webhook-Signature header must equal it
 * and the event is used as sent; without one, the status is read again from
 * Carrybee's API first.
 */
deps.app.post('/api/webhooks/carrybee', async (req, res) => {
  try {
    const cfg = (await readCourierConfig()).carrybee || {};
    const secret = String(cfg.webhookSecret || '').trim();
    const given = String(req.headers['x-carrybee-webhook-signature'] || '').trim();
    if (secret && !safeEqual(given, secret)) return res.status(401).json({ status: 'invalid_signature' });
    const body = req.body || {};
    const event = String(body.event || '');
    const consignmentId = String(body.consignment_id || '').trim();
    const merchantOrderId = String(body.merchant_order_id || '').trim();
    if (!event || (!consignmentId && !merchantOrderId)) return res.json({ status: 'ignored' });
    const rows = await db
      .select()
      .from(orders)
      .where(
        consignmentId
          ? and(eq(orders.courierService, 'carrybee'), eq(orders.consignmentId, consignmentId))
          : and(eq(orders.courierService, 'carrybee'), eq(orders.orderNumber, merchantOrderId))
      )
      .limit(1);
    const order = rows[0];
    if (!order) return res.json({ status: 'order_not_found' });
    if (event === 'order.paid') return res.json({ status: 'processed' });
    const status = secret ? event.replace(/^order\./, '') : await fetchCourierStatus(order).catch(() => '');
    if (status) await applyCourierStatus(order.id, status);
    res.json({ status: 'processed' });
  } catch (error: any) {
    console.error('Carrybee webhook:', error?.message || error);
    res.json({ status: 'error' });
  }
});

/** Update just the courier fields (consignment id typed in later, status change) */
deps.app.patch('/api/admin/orders/:id/courier', async (req, res) => {
  try {
    const patch: any = { updatedAt: new Date() };
    if ('consignmentId' in (req.body || {})) patch.consignmentId = req.body.consignmentId || null;
    if ('courierService' in (req.body || {})) patch.courierService = req.body.courierService || null;
    if ('courierStatus' in (req.body || {})) patch.courierStatus = req.body.courierStatus || null;
    const row = await deps.updateOne(db, orders, patch, eq(orders.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'Order not found.' });
    res.json(row);
  } catch {
    res.status(500).json({ error: 'Could not update courier details.' });
  }
});

/**
 * Full order edit — customer details, shipping charge, discount, and the item
 * lines themselves (add / remove / change quantity or unit price).
 * Stock is reconciled line by line inside one transaction so an edit can never
 * leave the inventory out of step with what was actually sold.
 */
deps.app.put('/api/admin/orders/:id', async (req: any, res) => {
  const id = Number(req.params.id);
  try {
    // Remember the status before the edit, so a changed status sends its SMS
    let previousStatusForSms: string | null | undefined;
    if (req.body && 'orderStatus' in req.body) {
      const prev = await db.select({ orderStatus: orders.orderStatus }).from(orders).where(eq(orders.id, id)).limit(1);
      previousStatusForSms = prev[0]?.orderStatus ?? null;
    }
    const actor = deps.actorName(req);
    const result = await db.transaction(async (tx) => {
      const rows = await tx.select().from(orders).where(eq(orders.id, id)).limit(1).for('update');
      const order = rows[0];
      if (!order) throw Object.assign(new Error('Order not found.'), { status: 404 });

      const body = req.body || {};
      const existingItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));

      let subtotal = 0;
      let itemsChanged = false;

      if (Array.isArray(body.items)) {
        itemsChanged = true;
        // v3.9 — a line is a product AND its option (size/colour), so editing
        // an order keeps the chosen variation and its own stock
        const keyOf = (productId: number, variationId: number | null) => `${productId}:${variationId || 0}`;
        const previous = new Map<string, number>();
        for (const item of existingItems) {
          const key = keyOf(item.productId, item.variationId || null);
          previous.set(key, (previous.get(key) || 0) + item.quantity);
        }

        const next = new Map<string, { productId: number; variationId: number | null; qty: number; price: number | null }>();
        for (const raw of body.items) {
          const productId = Number(raw.productId);
          const variationId = Number(raw.variationId) > 0 ? Number(raw.variationId) : null;
          const qty = Math.max(0, Math.floor(Number(raw.quantity) || 0));
          if (!Number.isFinite(productId) || productId <= 0 || qty === 0) continue;
          const key = keyOf(productId, variationId);
          const existing = next.get(key);
          const price = Number(raw.unitPrice);
          next.set(key, {
            productId,
            variationId,
            qty: (existing?.qty || 0) + qty,
            price: raw.unitPrice !== '' && raw.unitPrice != null && Number.isFinite(price) && price >= 0 ? price : existing?.price ?? null,
          });
        }
        if (next.size === 0) throw Object.assign(new Error('The order must contain at least one product.'), { status: 400 });

        // Stock moves only while the order holds its stock (not after it was cancelled/returned)
        if (!order.stockReleased) {
          const touched = new Set<string>([...previous.keys(), ...next.keys()]);
          for (const key of touched) {
            const before = previous.get(key) || 0;
            const after = next.get(key)?.qty || 0;
            const delta = after - before; // positive = need more stock
            if (delta === 0) continue;
            const [productIdText, variationText] = key.split(':');
            const productId = Number(productIdText);
            const variationId = Number(variationText) || null;

            const product = (await tx.select().from(products).where(eq(products.id, productId)).limit(1).for('update'))[0];
            if (!product) throw Object.assign(new Error(`Product not found (#${productId}).`), { status: 400 });
            if (variationId) {
              const variation = (await tx.select().from(productVariations).where(eq(productVariations.id, variationId)).limit(1).for('update'))[0];
              if (!variation) throw Object.assign(new Error(`${product.name}: that option no longer exists.`), { status: 400 });
              if (delta > 0 && Number(variation.stock) < delta) {
                throw Object.assign(new Error(`${product.name} — ${variation.label}: only ${variation.stock} left in stock.`), { status: 400 });
              }
              await tx.execute(sql`UPDATE product_variations SET stock = GREATEST(0, stock - ${delta}) WHERE id = ${variationId}`);
            } else if (delta > 0 && product.stock < delta) {
              throw Object.assign(new Error(`${product.name} — only ${product.stock} left in stock.`), { status: 400 });
            }
            const newStock = Math.max(0, product.stock - delta);
            await tx.update(products).set({ stock: newStock }).where(eq(products.id, productId));
            await tx.insert(inventoryTransactions).values({
              productId,
              type: 'order_edit',
              quantity: -delta,
              previousStock: product.stock,
              newStock,
              reference: order.orderNumber,
              notes: `Order #${order.orderNumber} edited in dashboard`,
              performedBy: actor,
            });
          }
        }

        await tx.delete(orderItems).where(eq(orderItems.orderId, id));
        for (const line of next.values()) {
          const product = (await tx.select().from(products).where(eq(products.id, line.productId)).limit(1))[0];
          const variation = line.variationId
            ? (await tx.select().from(productVariations).where(eq(productVariations.id, line.variationId)).limit(1))[0]
            : null;
          const positive = (value: any) => (value != null && Number(value) > 0 ? Number(value) : null);
          const listPrice = variation
            ? positive(variation.salePrice) ?? positive(variation.price) ?? positive(product?.salePrice) ?? Number(product?.price || 0)
            : positive(product?.salePrice) ?? Number(product?.price || 0);
          const unitPrice = line.price ?? listPrice;
          const lineTotal = unitPrice * line.qty;
          subtotal += lineTotal;
          await tx.insert(orderItems).values({
            orderId: id,
            productId: line.productId,
            productName: product?.name || `#${line.productId}`,
            variationId: variation ? variation.id : null,
            variationLabel: variation ? variation.label : null,
            sku: variation?.sku || product?.sku || null,
            unitPrice: unitPrice.toFixed(2),
            quantity: line.qty,
            subtotal: lineTotal.toFixed(2),
            batchNumber: product?.batchNumber || null,
            expiryDate: product?.expiryDate || null,
          });
        }
      } else {
        subtotal = existingItems.reduce((sum, item) => sum + Number(item.subtotal), 0);
      }

      const shippingCharge =
        'shippingCharge' in body ? Math.max(0, Number(body.shippingCharge) || 0) : Number(order.shippingCharge || 0);
      const discount = 'discount' in body ? Math.max(0, Number(body.discount) || 0) : Number(order.discount || 0);
      const total = Math.max(0, subtotal - discount + shippingCharge);
      const advance = 'advancePaid' in body ? Math.max(0, Number(body.advancePaid) || 0) : Number(order.advancePaid || 0);
      if (advance > total + 0.005) {
        throw Object.assign(new Error('The advance cannot be more than the order total.'), { status: 400 });
      }

      const patch: any = {
        subtotal: subtotal.toFixed(2),
        discount: discount.toFixed(2),
        shippingCharge: shippingCharge.toFixed(2),
        total: total.toFixed(2),
        advancePaid: advance.toFixed(2),
        updatedAt: new Date(),
      };
      for (const key of [
        'customerName',
        'customerPhone',
        'customerAddress',
        'shippingZone',
        'paymentMethod',
        'paymentStatus',
        'orderStatus',
        'transactionId',
        'senderNumber',
        'notes',
        'district',
        'thana',
      ] as const) {
        if (key in body) patch[key] = body[key] || null;
      }
      if (!patch.customerName) delete patch.customerName;
      if (!patch.customerPhone) delete patch.customerPhone;
      if (!patch.orderStatus) delete patch.orderStatus;
      // An advance makes the payment "partial" (or "paid" when it covers everything)
      patch.paymentStatus = deps.paymentStatusForAdvance(patch.paymentStatus ?? order.paymentStatus, advance, total);

      await tx.update(orders).set(patch).where(eq(orders.id, id));
      if (patch.orderStatus) await deps.syncOrderStock(tx, id, patch.orderStatus, actor);
      const finalRows = await tx.select().from(orders).where(eq(orders.id, id)).limit(1);
      const finalItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
      return { order: finalRows[0], items: finalItems, itemsChanged };
    });

    // Assignment is optional in the same save
    if (req.body && 'assignedTo' in req.body) {
      const current = result.order?.assignedTo ?? null;
      const wanted = req.body.assignedTo === '' || req.body.assignedTo == null ? null : Number(req.body.assignedTo);
      if (wanted !== current) {
        await deps.assignOrders([id], wanted);
        result.order = (await db.select().from(orders).where(eq(orders.id, id)).limit(1))[0];
      }
    }

    if (previousStatusForSms !== undefined) void deps.notifyOrderStatusSms(id, previousStatusForSms);
    res.json({ success: true, ...result });
  } catch (error: any) {
    if (!error?.status) console.error('order edit:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not update order.' });
  }
});

/**
 * v3.9 — Orders → Add Order: an order typed in by the shop (phone / Facebook /
 * WhatsApp orders). Same rules as a website order — stock is checked and
 * taken, each size/colour keeps its own stock, the customer is found or
 * created — but the shop may set the price, delivery charge, discount and an
 * advance payment.
 */
deps.app.post('/api/admin/orders', async (req: any, res) => {
  try {
    const body = req.body || {};
    const customerName = String(body.customerName || '').trim();
    const customerPhone = String(body.customerPhone || '').replace(/[\s-]+/g, '').trim();
    const customerAddress = String(body.customerAddress || '').trim();
    if (!customerName || !customerPhone) return res.status(400).json({ error: 'Enter the customer’s name and phone number.' });
    if (!Array.isArray(body.items) || body.items.length === 0) return res.status(400).json({ error: 'Add at least one product.' });
    const actor = deps.actorName(req);
    const orderStatus = String(body.orderStatus || 'pending');
    const allowedStatuses = ['pending', 'processing', 'confirmed', 'on_hold', 'shipped', 'delivered', 'completed'];
    if (!allowedStatuses.includes(orderStatus)) return res.status(400).json({ error: 'Choose a valid order status.' });

    // Delivery charge: typed by the shop, else the zone's charge
    let shippingZone = String(body.shippingZone || '').trim();
    let shippingCharge = body.shippingCharge === '' || body.shippingCharge == null ? null : Math.max(0, Number(body.shippingCharge) || 0);
    if (shippingCharge === null) {
      try {
        const zoneRow = await db.select().from(siteSettings).where(eq(siteSettings.key, 'shipping'));
        const zones: any[] = zoneRow.length > 0 ? JSON.parse(zoneRow[0].value)?.zones || [] : [];
        const match = zones.find((z) => z.id === shippingZone || z.name === shippingZone) || zones.find((z) => z.enabled !== false);
        shippingCharge = match ? Number(match.charge) || 0 : 0;
        if (match && !shippingZone) shippingZone = match.name;
        else if (match && match.id === shippingZone) shippingZone = match.name;
      } catch {
        shippingCharge = 0;
      }
    }

    const created = await db.transaction(async (tx) => {
      let subtotal = 0;
      const lines: any[] = [];
      const positive = (value: any) => (value != null && Number(value) > 0 ? Number(value) : null);
      for (const raw of body.items) {
        const productId = Number(raw.productId);
        const quantity = Math.floor(Number(raw.quantity));
        if (!(productId > 0) || !(quantity >= 1)) continue;
        const product = (await tx.select().from(products).where(eq(products.id, productId)).limit(1).for('update'))[0];
        if (!product || product.status === 'deleted') throw Object.assign(new Error(`Product #${productId} was not found.`), { status: 400 });
        let variation: any = null;
        if (Number(raw.variationId) > 0) {
          variation = (await tx
            .select()
            .from(productVariations)
            .where(and(eq(productVariations.id, Number(raw.variationId)), eq(productVariations.productId, productId)))
            .limit(1)
            .for('update'))[0];
          if (!variation) throw Object.assign(new Error(`Choose an option for "${product.name}".`), { status: 400 });
          if (Number(variation.stock) < quantity) {
            throw Object.assign(new Error(`${product.name} — ${variation.label}: only ${variation.stock} left in stock.`), { status: 400 });
          }
        } else if (product.hasVariations) {
          throw Object.assign(new Error(`Choose a size / colour for "${product.name}".`), { status: 400 });
        } else if (Number(product.stock) < quantity) {
          throw Object.assign(new Error(`${product.name}: only ${product.stock} left in stock.`), { status: 400 });
        }
        const listPrice = variation
          ? positive(variation.salePrice) ?? positive(variation.price) ?? positive(product.salePrice) ?? Number(product.price)
          : positive(product.salePrice) ?? Number(product.price);
        const typed = raw.unitPrice === '' || raw.unitPrice == null ? null : Number(raw.unitPrice);
        const unitPrice = typed !== null && Number.isFinite(typed) && typed >= 0 ? typed : listPrice;
        const lineTotal = unitPrice * quantity;
        subtotal += lineTotal;
        lines.push({ product, variation, quantity, unitPrice, lineTotal });

        if (variation) await tx.execute(sql`UPDATE product_variations SET stock = GREATEST(0, stock - ${quantity}) WHERE id = ${variation.id}`);
        const previousStock = Number(product.stock || 0);
        const newStock = Math.max(0, previousStock - quantity);
        await tx.update(products).set({ stock: newStock }).where(eq(products.id, product.id));
        lines[lines.length - 1].stock = { previousStock, newStock };
      }
      if (lines.length === 0) throw Object.assign(new Error('Add at least one product.'), { status: 400 });

      const discount = Math.max(0, Number(body.discount) || 0);
      const total = Math.max(0, subtotal - discount + (shippingCharge || 0));
      const advance = Math.max(0, Number(body.advancePaid) || 0);
      if (advance > total + 0.005) throw Object.assign(new Error('The advance cannot be more than the order total.'), { status: 400 });

      // Find or create the customer by phone
      let customerId: number | null = null;
      const existing = (await tx.select().from(customers).where(eq(customers.phone, customerPhone)).limit(1))[0];
      if (existing) {
        customerId = existing.id;
        await tx
          .update(customers)
          .set({
            totalOrders: (existing.totalOrders || 0) + 1,
            totalSpent: (Number(existing.totalSpent || 0) + total).toFixed(2),
            address: customerAddress || existing.address,
          })
          .where(eq(customers.id, existing.id));
      } else {
        const inserted = await insertReturning(tx, customers, {
          name: customerName,
          phone: customerPhone,
          address: customerAddress || null,
          totalOrders: 1,
          totalSpent: total.toFixed(2),
        });
        customerId = inserted[0].id;
      }

      const orderNumber = await deps.nextOrderNumber(tx, 'ORD');
      const paymentStatus = deps.paymentStatusForAdvance(String(body.paymentStatus || 'unpaid'), advance, total);
      const inserted = await insertReturning(tx, orders, {
        orderNumber,
        source: 'web',
        customerId,
        customerName,
        customerPhone,
        customerAddress: customerAddress || null,
        district: body.district ? String(body.district).slice(0, 64) : null,
        thana: body.thana ? String(body.thana).slice(0, 100) : null,
        subtotal: subtotal.toFixed(2),
        discount: discount.toFixed(2),
        shippingCharge: (shippingCharge || 0).toFixed(2),
        tax: '0.00',
        total: total.toFixed(2),
        advancePaid: advance.toFixed(2),
        paymentMethod: String(body.paymentMethod || 'cod'),
        paymentStatus,
        orderStatus,
        shippingZone: shippingZone || null,
        transactionId: body.transactionId ? String(body.transactionId).slice(0, 100) : null,
        notes: body.notes ? String(body.notes).slice(0, 5000) : null,
        createdBy: actor,
      });
      const order = inserted[0];
      for (const line of lines) {
        await tx.insert(orderItems).values({
          orderId: order.id,
          productId: line.product.id,
          productName: line.product.name,
          variationId: line.variation ? line.variation.id : null,
          variationLabel: line.variation ? line.variation.label : null,
          sku: line.variation?.sku || line.product.sku,
          unitPrice: line.unitPrice.toFixed(2),
          quantity: line.quantity,
          subtotal: line.lineTotal.toFixed(2),
          batchNumber: line.product.batchNumber,
          expiryDate: line.product.expiryDate,
        });
        await tx.insert(inventoryTransactions).values({
          productId: line.product.id,
          type: 'sale',
          quantity: -line.quantity,
          previousStock: line.stock.previousStock,
          newStock: line.stock.newStock,
          reference: orderNumber,
          notes: `Manual order ${orderNumber}`,
          performedBy: actor,
        });
      }
      return order;
    });

    if (body.assignedTo) {
      try {
        await deps.assignOrders([created.id], body.assignedTo);
      } catch {
        /* the order is saved; assignment can be done from the list */
      }
    }
    const order = (await db.select().from(orders).where(eq(orders.id, created.id)).limit(1))[0];
    res.status(201).json({ success: true, order });
  } catch (error: any) {
    if (!error?.status) console.error('manual order:', error);
    res.status(error?.status || 500).json({ error: error?.status ? error.message : 'Could not create the order.' });
  }
});

/** Customer look-up for the Add Order form (by phone or name) */
deps.app.get('/api/admin/orders-customer-lookup', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.json([]);
    const rows = await db
      .select({ id: customers.id, name: customers.name, phone: customers.phone, address: customers.address, totalOrders: customers.totalOrders })
      .from(customers)
      .where(or(like(customers.phone, `%${q}%`), like(customers.name, `%${q}%`)))
      .limit(8);
    res.json(rows);
  } catch {
    res.json([]);
  }
});

  return { API_COURIERS, bookWithCourier, courierName, courierTrackingUrl, safeEqual };
}
