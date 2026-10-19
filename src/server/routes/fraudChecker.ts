/**
 * Fraud checker — courier success ratio per phone number
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerFraudCheckerRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import { db } from '../../db/index.ts';
import { siteSettings, orders, customers } from '../../db/schema.ts';
import { eq, inArray, desc, sql } from 'drizzle-orm';
import type * as Server from '../../../server.ts';


export interface CourierLine {
  key: string;
  name: string;
  total: number;
  success: number;
  cancelled: number;
  ratio: number;
}

export type RiskLevel = 'safe' | 'caution' | 'risky' | 'new';

export interface RegisterFraudCheckerRoutesDeps {
  app: typeof Server.app;
  bdMobile: typeof Server.bdMobile;
  sqlRows: typeof Server.sqlRows;
}

export function registerFraudCheckerRoutes(deps: RegisterFraudCheckerRoutesDeps) {
// ==========================================
// FRAUD CHECKER — courier success ratio per phone number
// ==========================================
/**
 * Combines:
 *  1. This shop's own history for the number (always available, free)
 *  2. BD Courier's network-wide courier history (Steadfast, Pathao, RedX,
 *     Paperfly…) when an API key is set — cached per number to save credits
 *  3. Signals: repeat orders in 24h, blocked customer/IP, large first order
 * into one risk level with plain-language reasons.
 */
const FRAUD_DEFAULT_BASE = 'https://api.bdcourier.com';

async function readFraudConfig(): Promise<any> {
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'fraud_config'));
    const cfg = rows.length > 0 ? JSON.parse(rows[0].value) || {} : {};
    return {
      enabled: cfg.enabled !== false,
      apiKey: String(cfg.apiKey || '').trim(),
      baseUrl: String(cfg.baseUrl || '').trim().replace(/\/+$/, '') || FRAUD_DEFAULT_BASE,
      autoCheck: cfg.autoCheck !== false,
      cacheHours: Math.min(720, Math.max(1, Number(cfg.cacheHours) || 24)),
      safeRatio: Math.min(100, Math.max(0, Number(cfg.safeRatio) || 80)),
      riskyRatio: Math.min(100, Math.max(0, Number(cfg.riskyRatio) || 50)),
      largeOrder: Math.max(0, Number(cfg.largeOrder) || 5000),
    };
  } catch {
    return {
      enabled: true, apiKey: '', baseUrl: FRAUD_DEFAULT_BASE, autoCheck: true,
      cacheHours: 24, safeRatio: 80, riskyRatio: 50, largeOrder: 5000,
    };
  }
}

const ratioOf = (success: number, total: number) => (total > 0 ? Math.round((success / total) * 1000) / 10 : 0);

/** BD Courier: POST {base}/courier-check {phone} → data.summary + one block per courier */
async function fetchCourierNetwork(cfg: any, phone: string): Promise<{ couriers: CourierLine[]; summary: CourierLine } | { error: string }> {
  if (!cfg.apiKey) return { error: 'No BD Courier API key' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${cfg.baseUrl}/courier-check`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ phone }),
      signal: controller.signal,
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok || data?.status !== 'success') {
      return { error: String(data?.message || data?.error || `BD Courier answered HTTP ${response.status}`) };
    }
    const block = data?.data || {};
    const toLine = (key: string, raw: any): CourierLine => {
      const total = Number(raw?.total_parcel ?? raw?.total ?? 0) || 0;
      const success = Number(raw?.success_parcel ?? raw?.success ?? 0) || 0;
      const cancelled = Number(raw?.cancelled_parcel ?? raw?.cancel ?? raw?.cancelled ?? 0) || 0;
      return {
        key,
        name: String(raw?.name || key).replace(/^\w/, (c) => c.toUpperCase()),
        total,
        success,
        cancelled,
        ratio: raw?.success_ratio !== undefined ? Number(raw.success_ratio) || 0 : ratioOf(success, total),
      };
    };
    const couriers = Object.entries(block)
      .filter(([key, raw]) => key !== 'summary' && raw && typeof raw === 'object')
      .map(([key, raw]) => toLine(key, raw))
      .filter((line) => line.total > 0 || line.success > 0 || line.cancelled > 0);
    const summary = block.summary
      ? toLine('summary', { ...block.summary, name: 'All couriers' })
      : toLine('summary', {
          name: 'All couriers',
          total_parcel: couriers.reduce((sum, line) => sum + line.total, 0),
          success_parcel: couriers.reduce((sum, line) => sum + line.success, 0),
          cancelled_parcel: couriers.reduce((sum, line) => sum + line.cancelled, 0),
        });
    return { couriers, summary };
  } catch (error: any) {
    return { error: error?.name === 'AbortError' ? 'BD Courier did not answer in time' : 'Could not reach BD Courier' };
  } finally {
    clearTimeout(timer);
  }
}

/** Phone as stored in orders can be typed many ways; match the common forms */
const phoneVariants = (phone: string) => Array.from(new Set([phone, `88${phone}`, `+88${phone}`, phone.slice(1)]));

async function shopHistory(phone: string) {
  const variants = phoneVariants(phone);
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      orderStatus: orders.orderStatus,
      courierStatus: orders.courierStatus,
      total: orders.total,
      createdAt: orders.createdAt,
      ipAddress: orders.ipAddress,
    })
    .from(orders)
    .where(inArray(orders.customerPhone, variants))
    .orderBy(desc(orders.id))
    .limit(200);
  let success = 0;
  let failed = 0;
  let open = 0;
  rows.forEach((row) => {
    const status = String(row.orderStatus || '');
    const courier = String(row.courierStatus || '');
    if (['delivered', 'completed'].includes(status) || courier === 'delivered') success += 1;
    else if (['cancelled', 'returned', 'refunded'].includes(status) || ['returned', 'cancelled'].includes(courier)) failed += 1;
    else open += 1;
  });
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const last24h = rows.filter((row) => row.createdAt && new Date(row.createdAt).getTime() > dayAgo).length;
  const customerRows = await db
    .select({ status: customers.status, note: customers.note })
    .from(customers)
    .where(inArray(customers.phone, variants))
    .limit(1);
  return {
    total: rows.length,
    success,
    failed,
    open,
    ratio: ratioOf(success, success + failed),
    last24h,
    blocked: customerRows[0]?.status === 'blocked',
    blockedNote: customerRows[0]?.note || '',
    recent: rows.slice(0, 5).map((row) => ({
      orderNumber: row.orderNumber,
      status: row.orderStatus,
      total: row.total,
      createdAt: row.createdAt,
    })),
  };
}

/**
 * Full report for one number. External data comes from the cache when it is
 * fresh (refresh=true forces a new lookup); the shop's own history is always
 * read live.
 */
async function fraudReport(rawPhone: any, options: { refresh?: boolean; orderTotal?: number; orderId?: number } = {}) {
  const phone = deps.bdMobile(rawPhone);
  if (!phone) return { error: 'Not a valid Bangladeshi mobile number.' };
  const cfg = await readFraudConfig();

  // ---- network history (cached)
  let network: { couriers: CourierLine[]; summary: CourierLine } | null = null;
  let networkError = '';
  let checkedAt: string | null = null;
  let fromCache = false;
  const cached = deps.sqlRows(await db.execute(sql`SELECT data, checked_at AS checkedAt FROM fraud_checks WHERE phone = ${phone} LIMIT 1`))[0];
  const fresh = cached && Date.now() - new Date(cached.checkedAt).getTime() < cfg.cacheHours * 3600 * 1000;
  if (cached && (fresh || !cfg.apiKey) && !options.refresh) {
    try {
      network = JSON.parse(cached.data);
      checkedAt = new Date(cached.checkedAt).toISOString();
      fromCache = true;
    } catch {
      network = null;
    }
  }
  if (!network && cfg.apiKey && cfg.enabled) {
    const result = await fetchCourierNetwork(cfg, phone);
    if ('error' in result) networkError = result.error;
    else {
      network = result;
      checkedAt = new Date().toISOString();
      const value = JSON.stringify(result);
      await db.execute(sql`INSERT INTO fraud_checks (phone, data, total, success, cancelled, ratio, checked_at)
        VALUES (${phone}, ${value}, ${result.summary.total}, ${result.summary.success}, ${result.summary.cancelled}, ${result.summary.ratio}, NOW())
        ON DUPLICATE KEY UPDATE data = VALUES(data), total = VALUES(total), success = VALUES(success),
          cancelled = VALUES(cancelled), ratio = VALUES(ratio), checked_at = NOW()`);
    }
  }

  // ---- this shop
  const shop = await shopHistory(phone);

  // ---- combine
  const netTotal = network?.summary.total || 0;
  const netSuccess = network?.summary.success || 0;
  const netCancelled = network?.summary.cancelled || 0;
  // Network figures already include deliveries through this shop, so the shop
  // counts only add orders the network cannot see (not yet dispatched / own delivery).
  const combinedSuccess = Math.max(netSuccess, shop.success);
  const combinedFailed = Math.max(netCancelled, shop.failed);
  const combinedTotal = combinedSuccess + combinedFailed;
  const ratio = ratioOf(combinedSuccess, combinedTotal);

  const reasons: Array<{ tone: 'good' | 'warn' | 'bad' | 'info'; text: string }> = [];
  if (netTotal > 0) {
    reasons.push({
      tone: network!.summary.ratio >= cfg.safeRatio ? 'good' : network!.summary.ratio >= cfg.riskyRatio ? 'warn' : 'bad',
      text: `Couriers: ${netSuccess} delivered, ${netCancelled} cancelled/returned out of ${netTotal} parcels (${network!.summary.ratio}%).`,
    });
  } else if (network) {
    reasons.push({ tone: 'info', text: 'No parcels found with any courier for this number.' });
  }
  if (shop.total > 0) {
    reasons.push({
      tone: shop.failed > shop.success ? 'bad' : shop.failed > 0 ? 'warn' : 'good',
      text: `This shop: ${shop.total} order(s) — ${shop.success} delivered, ${shop.failed} cancelled/returned, ${shop.open} open.`,
    });
  } else {
    reasons.push({ tone: 'info', text: 'First order from this number at this shop.' });
  }
  if (shop.last24h >= 2) reasons.push({ tone: 'warn', text: `${shop.last24h} orders from this number in the last 24 hours.` });
  if (shop.blocked) reasons.push({ tone: 'bad', text: `Customer is blocked${shop.blockedNote ? `: ${shop.blockedNote}` : ''}.` });
  const orderTotal = Number(options.orderTotal) || 0;
  if (orderTotal >= cfg.largeOrder && combinedSuccess === 0) {
    reasons.push({ tone: 'warn', text: `Large order (৳${orderTotal.toLocaleString('en-US')}) with no delivery history — call to confirm.` });
  }

  let level: RiskLevel;
  if (shop.blocked) level = 'risky';
  else if (combinedTotal === 0) level = 'new';
  else if (ratio >= cfg.safeRatio) level = 'safe';
  else if (ratio >= cfg.riskyRatio) level = 'caution';
  else level = 'risky';
  // A burst of orders or a large blind first order lifts "safe/new" to caution
  if ((shop.last24h >= 3 || (orderTotal >= cfg.largeOrder && combinedSuccess === 0)) && (level === 'safe' || level === 'new')) {
    level = 'caution';
  }

  const advice =
    level === 'safe'
      ? 'Good delivery record. Safe to ship.'
      : level === 'new'
      ? 'No history yet. A quick confirmation call is a good idea.'
      : level === 'caution'
      ? 'Mixed record. Call to confirm before shipping, or ask for the delivery charge in advance.'
      : 'High cancellation risk. Take an advance payment or confirm carefully before shipping.';

  return {
    phone,
    level,
    ratio,
    total: combinedTotal,
    success: combinedSuccess,
    failed: combinedFailed,
    advice,
    reasons,
    network: network ? { ...network, checkedAt, fromCache } : null,
    networkError: networkError || (!cfg.apiKey ? 'Add a BD Courier API key to include every courier’s history.' : ''),
    shop,
  };
}

deps.app.get('/api/admin/fraud/config', async (_req, res) => {
  const cfg = await readFraudConfig();
  res.json(cfg);
});

deps.app.put('/api/admin/fraud/config', async (req, res) => {
  try {
    const body = req.body || {};
    const value = JSON.stringify({
      enabled: body.enabled !== false,
      apiKey: String(body.apiKey || '').trim(),
      baseUrl: String(body.baseUrl || '').trim(),
      autoCheck: body.autoCheck !== false,
      cacheHours: Number(body.cacheHours) || 24,
      safeRatio: Number(body.safeRatio) || 80,
      riskyRatio: Number(body.riskyRatio) || 50,
      largeOrder: Number(body.largeOrder) || 5000,
    });
    await db.insert(siteSettings).values({ key: 'fraud_config', value }).onDuplicateKeyUpdate({ set: { value } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Could not save the fraud checker settings.' });
  }
});

/** One number — the order drawer calls this automatically */
deps.app.get('/api/admin/fraud/check', async (req, res) => {
  try {
    const report = await fraudReport(req.query.phone, {
      refresh: String(req.query.refresh || '') === '1',
      orderTotal: Number(req.query.total) || 0,
    });
    if ('error' in report) return res.status(400).json(report);
    res.json(report);
  } catch (error: any) {
    console.error('fraud check:', error);
    res.status(500).json({ error: 'Could not check this number.' });
  }
});

/**
 * Ratio pills for the order list: cached network data + live shop history.
 * Never calls the paid API (the list would spend a credit per row).
 */
deps.app.post('/api/admin/fraud/summary', async (req, res) => {
  try {
    const cfg = await readFraudConfig();
    const phones: string[] = Array.from(
      new Set((Array.isArray(req.body?.phones) ? req.body.phones : []).map(deps.bdMobile).filter(Boolean))
    ).slice(0, 100) as string[];
    if (phones.length === 0) return res.json({});
    const cachedRows = deps.sqlRows(
      await db.execute(sql`SELECT phone, total, success, cancelled, ratio FROM fraud_checks WHERE phone IN (${sql.join(phones.map((p) => sql`${p}`), sql`, `)})`)
    );
    const cachedBy = new Map(cachedRows.map((row: any) => [row.phone, row]));
    const variants = phones.flatMap(phoneVariants);
    const orderRows = await db
      .select({ phone: orders.customerPhone, orderStatus: orders.orderStatus, courierStatus: orders.courierStatus })
      .from(orders)
      .where(inArray(orders.customerPhone, variants));
    const shopBy = new Map<string, { success: number; failed: number }>();
    orderRows.forEach((row) => {
      const key = deps.bdMobile(row.phone);
      if (!key) return;
      const entry = shopBy.get(key) || { success: 0, failed: 0 };
      const status = String(row.orderStatus || '');
      const courier = String(row.courierStatus || '');
      if (['delivered', 'completed'].includes(status) || courier === 'delivered') entry.success += 1;
      else if (['cancelled', 'returned', 'refunded'].includes(status) || ['returned', 'cancelled'].includes(courier)) entry.failed += 1;
      shopBy.set(key, entry);
    });
    const out: Record<string, any> = {};
    phones.forEach((phone) => {
      const net = cachedBy.get(phone);
      const shop = shopBy.get(phone) || { success: 0, failed: 0 };
      const success = Math.max(Number(net?.success || 0), shop.success);
      const failed = Math.max(Number(net?.cancelled || 0), shop.failed);
      const total = success + failed;
      const ratio = ratioOf(success, total);
      out[phone] = {
        total,
        ratio,
        level: total === 0 ? 'new' : ratio >= cfg.safeRatio ? 'safe' : ratio >= cfg.riskyRatio ? 'caution' : 'risky',
        checked: Boolean(net),
      };
    });
    res.json(out);
  } catch (error: any) {
    console.error('fraud summary:', error);
    res.json({});
  }
});

/** New orders are screened in the background so the list pill is ready when staff look */
async function autoFraudCheck(phone: any, total: number) {
  try {
    const cfg = await readFraudConfig();
    if (!cfg.enabled || !cfg.autoCheck || !cfg.apiKey) return;
    await fraudReport(phone, { orderTotal: total });
  } catch {
    /* background only */
  }
}

  return { autoFraudCheck };
}
