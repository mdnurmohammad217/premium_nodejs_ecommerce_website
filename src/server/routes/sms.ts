/**
 * SMS — Bangladeshi gateways
 *
 * v3.13 — moved out of server.ts unchanged (same routes, same order, same
 * behaviour); server.ts calls registerSmsRoutes() at the place this code used to be.
 * Helpers that still live in server.ts arrive through `deps`.
 */
import { db } from '../../db/index.ts';
import { siteSettings, orders } from '../../db/schema.ts';
import { eq, sql } from 'drizzle-orm';
import { hasModule } from '../../lib/permissions.ts';
import type * as Server from '../../../server.ts';
import { utcIso } from '../utcDate.ts';

type SessionPayload = Server.SessionPayload;


// ==========================================
// SMS — Bangladeshi gateways
// ==========================================
/**
 * One settings object (`sms_config`, server-only like the courier keys):
 *   provider  bulksmsbd | smsnetbd | greenweb | mimsms | custom
 *   events    which messages go out, each with its own editable template
 * Every send is written to `sms_logs`, success or not, so the dashboard shows
 * exactly what each customer received and why a message failed.
 */
export type SmsEvent =
  | 'order_placed'
  | 'order_confirmed'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
  | 'admin_new_order'
  | 'contact_admin'
  | 'password_reset';

export interface SmsResult {
  ok: boolean;
  provider: string;
  response: string;
  error?: string;
}

export interface RegisterSmsRoutesDeps {
  app: typeof Server.app;
  sqlRows: typeof Server.sqlRows;
}

export function registerSmsRoutes(deps: RegisterSmsRoutesDeps) {
const SMS_DEFAULT_TEMPLATES: Record<SmsEvent, string> = {
  order_placed: 'Dear {name}, we received your order {order_id} ({total}). We will call you to confirm. - {store}',
  order_confirmed: 'Your order {order_id} is confirmed and will be shipped soon. - {store}',
  order_shipped: 'Your order {order_id} has been handed to {courier}. Track: {tracking_link} - {store}',
  order_delivered: 'Your order {order_id} has been delivered. Thank you for shopping with {store}!',
  order_cancelled: 'Your order {order_id} has been cancelled. For help call {store_phone}. - {store}',
  admin_new_order: 'New order {order_id}: {total} from {name} ({phone}).',
  contact_admin: 'New website message from {name} ({phone}).',
  password_reset: '{code} is your {store} password reset code. It expires in {minutes} minutes. Do not share it with anyone.',
};

/** Events on by default once SMS is switched on */
const SMS_DEFAULT_ON: SmsEvent[] = ['order_placed', 'order_shipped', 'admin_new_order', 'password_reset'];

async function readSmsConfig(): Promise<any> {
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'sms_config'));
    return rows.length > 0 ? JSON.parse(rows[0].value) || {} : {};
  } catch {
    return {};
  }
}

const smsEventConfig = (cfg: any, event: SmsEvent) => {
  const stored = cfg?.events?.[event] || {};
  return {
    enabled: stored.enabled !== undefined ? Boolean(stored.enabled) : SMS_DEFAULT_ON.includes(event),
    template: String(stored.template || '').trim() || SMS_DEFAULT_TEMPLATES[event],
  };
};

/** 01XXXXXXXXX from anything the customer typed; '' when it is not a BD mobile */
function bdMobile(raw: any): string {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('880')) digits = digits.slice(2);
  else if (digits.startsWith('88') && digits.length === 13) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`;
  return /^01[3-9]\d{8}$/.test(digits) ? digits : '';
}

const isUnicodeText = (text: string) => /[^\x00-\x7F]/.test(text);

/** GSM segments (160/153) or Unicode (70/67) — for the dashboard's cost hint */
function smsSegments(text: string): number {
  const unicode = isUnicodeText(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

function fillTemplate(template: string, vars: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : ''
  ).replace(/\s{2,}/g, ' ').trim();
}

async function smsHttp(url: string, init: RequestInit = {}): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { status: response.status, text: (await response.text()).slice(0, 1000) };
  } finally {
    clearTimeout(timer);
  }
}

const parseJson = (text: string): any => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Talks to the chosen gateway. Never throws. */
async function deliverSms(cfg: any, phone: string, message: string): Promise<SmsResult> {
  const provider = String(cfg?.provider || 'bulksmsbd');
  const apiKey = String(cfg?.apiKey || '').trim();
  const senderId = String(cfg?.senderId || '').trim();
  const phone880 = `88${phone}`;
  try {
    if (provider === 'bulksmsbd') {
      if (!apiKey || !senderId) return { ok: false, provider, response: '', error: 'API key and Sender ID are required.' };
      const params = new URLSearchParams({
        api_key: apiKey,
        type: isUnicodeText(message) ? 'unicode' : 'text',
        number: phone880,
        senderid: senderId,
        message,
      });
      const { text } = await smsHttp(`https://bulksmsbd.net/api/smsapi?${params}`, { method: 'POST' });
      const data = parseJson(text);
      const ok = Number(data?.response_code) === 202;
      return { ok, provider, response: text, error: ok ? undefined : data?.error_message || data?.success_message || text };
    }

    if (provider === 'smsnetbd') {
      if (!apiKey) return { ok: false, provider, response: '', error: 'API key is required.' };
      const body = new URLSearchParams({ api_key: apiKey, msg: message, to: phone880 });
      if (senderId) body.set('sender_id', senderId);
      const { text } = await smsHttp('https://api.sms.net.bd/sendsms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const data = parseJson(text);
      const ok = data !== null && Number(data.error) === 0;
      return { ok, provider, response: text, error: ok ? undefined : data?.msg || text };
    }

    // v3.11 — MiM SMS (api.mimsms.com, API v2): user name + API key + sender name
    if (provider === 'mimsms') {
      const userName = String(cfg?.username || '').trim();
      if (!apiKey || !userName || !senderId) {
        return { ok: false, provider, response: '', error: 'MiM SMS needs the user name, API key and sender name.' };
      }
      const { status, text } = await smsHttp('https://api.mimsms.com/api/V2/SMS', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          apiKey,
          userName,
          senderName: senderId,
          transactionType: 'T',
          mobileNumber: phone880,
          message,
          campaignName: '',
        }),
      });
      const data = parseJson(text);
      const ok = status >= 200 && status < 300 && String(data?.statusCode) === '200' && /success/i.test(String(data?.status || ''));
      return { ok, provider, response: text, error: ok ? undefined : String(data?.responseResult || data?.message || data?.status || text || `HTTP ${status}`) };
    }

    if (provider === 'greenweb') {
      if (!apiKey) return { ok: false, provider, response: '', error: 'Token is required.' };
      const body = new URLSearchParams({ token: apiKey, to: phone, message });
      const { text } = await smsHttp('https://api.bdbulksms.net/api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const ok = /^\s*ok/i.test(text);
      return { ok, provider, response: text, error: ok ? undefined : text };
    }

    if (provider === 'custom') {
      // Any gateway: URL + parameters with {phone}, {phone880}, {message}, {api_key}, {sender_id}
      const custom = cfg?.custom || {};
      const fill = (value: string, encode: boolean) =>
        String(value || '').replace(/\{(phone880|phone|message|api_key|sender_id)\}/g, (_m, key) => {
          const raw = { phone, phone880, message, api_key: apiKey, sender_id: senderId }[key as string] || '';
          return encode ? encodeURIComponent(raw) : raw;
        });
      const method = String(custom.method || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';
      const url = fill(String(custom.url || ''), true);
      if (!/^https?:\/\//i.test(url)) return { ok: false, provider, response: '', error: 'Enter the gateway URL.' };
      let init: RequestInit = { method };
      if (method === 'POST' && custom.body) {
        const json = String(custom.bodyType || 'form') === 'json';
        init = {
          method,
          headers: { 'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded' },
          body: json ? fill(String(custom.body), false) : fill(String(custom.body), true),
        };
      }
      const { status, text } = await smsHttp(url, init);
      const expect = String(custom.successContains || '').trim();
      const ok = status >= 200 && status < 300 && (!expect || text.toLowerCase().includes(expect.toLowerCase()));
      return { ok, provider, response: text, error: ok ? undefined : `HTTP ${status}: ${text.slice(0, 200)}` };
    }

    return { ok: false, provider, response: '', error: 'Choose an SMS provider.' };
  } catch (error: any) {
    return {
      ok: false,
      provider,
      response: '',
      error: error?.name === 'AbortError' ? 'The SMS gateway did not answer in time.' : error?.message || 'Network error',
    };
  }
}

/** Send one SMS and log it. `force` sends even when SMS is switched off (test button). */
async function sendSms(
  rawPhone: any,
  message: string,
  meta: { event?: string; orderId?: number | null; force?: boolean; logText?: string } = {}
): Promise<SmsResult & { phone: string }> {
  const cfg = await readSmsConfig();
  const phone = bdMobile(rawPhone);
  const text = String(message || '').trim();
  let result: SmsResult;
  if (!cfg.enabled && !meta.force) result = { ok: false, provider: cfg.provider || '', response: '', error: 'SMS is switched off.' };
  else if (!phone) result = { ok: false, provider: cfg.provider || '', response: '', error: `"${rawPhone}" is not a valid mobile number.` };
  else if (!text) result = { ok: false, provider: cfg.provider || '', response: '', error: 'The message is empty.' };
  else result = await deliverSms(cfg, phone, text);

  try {
    await db.execute(sql`INSERT INTO sms_logs (phone, message, event, order_id, provider, status, response, segments)
      VALUES (${phone || String(rawPhone || '').slice(0, 32)}, ${(meta.logText || text).slice(0, 2000)}, ${meta.event || 'manual'},
              ${meta.orderId || null}, ${result.provider || null}, ${result.ok ? 'sent' : 'failed'},
              ${String(result.error || result.response || '').slice(0, 1000)}, ${smsSegments(text)})`);
  } catch (error: any) {
    console.error('[sms] could not log:', error?.message || error);
  }
  if (!result.ok && cfg.enabled) console.error(`[sms] ${meta.event || 'manual'} to ${phone || rawPhone} failed: ${result.error}`);
  return { ...result, phone };
}

async function smsStoreVars() {
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'general'));
    const general = rows.length > 0 ? JSON.parse(rows[0].value) : {};
    return {
      store: general.storeName || 'our shop',
      store_phone: general.phone || general.whatsapp || '',
      currency: general.currency || '৳',
    };
  } catch {
    return { store: 'our shop', store_phone: '', currency: '৳' };
  }
}

/**
 * Fire an event's SMS if that event is switched on. Order events go to the
 * customer; admin_* / contact_admin go to every number in "Admin phones".
 * Never throws and never delays the caller (callers use `void`).
 */
async function notifySmsEvent(event: SmsEvent, data: Record<string, any>): Promise<void> {
  try {
    const cfg = await readSmsConfig();
    if (!cfg.enabled) return;
    const setting = smsEventConfig(cfg, event);
    if (!setting.enabled) return;
    const store = await smsStoreVars();
    const order = data.order || {};
    const origin = String(cfg.publicBaseUrl || '').replace(/\/+$/, '');
    const vars = {
      ...store,
      name: data.name ?? order.customerName ?? '',
      phone: data.phone ?? order.customerPhone ?? '',
      order_id: order.orderNumber ?? '',
      total: order.total !== undefined ? `${store.currency}${Number(order.total).toLocaleString('en-US')}` : '',
      status: order.orderStatus ?? '',
      courier: data.courier ?? order.courierService ?? 'the courier',
      tracking_link: data.trackingUrl || (origin && order.orderNumber ? `${origin}/track?order=${order.orderNumber}` : ''),
      message: data.message ?? '',
    };
    const text = fillTemplate(setting.template, vars);

    if (event === 'admin_new_order' || event === 'contact_admin') {
      const phones = String(cfg.adminPhones || '')
        .split(/[\s,;]+/)
        .map(bdMobile)
        .filter(Boolean);
      for (const adminPhone of Array.from(new Set(phones))) {
        await sendSms(adminPhone, text, { event, orderId: order.id || null });
      }
      return;
    }
    await sendSms(vars.phone, text, { event, orderId: order.id || null });
  } catch (error: any) {
    console.error('[sms] event failed:', error?.message || error);
  }
}

/** Status → SMS event, for every place an order's status changes */
function smsEventForStatus(status: string): SmsEvent | null {
  if (status === 'confirmed') return 'order_confirmed';
  if (status === 'shipped') return 'order_shipped';
  if (status === 'delivered' || status === 'completed') return 'order_delivered';
  if (status === 'cancelled') return 'order_cancelled';
  return null;
}

/** Sends the status SMS once per order and status (re-saving the same status is silent) */
async function notifyOrderStatusSms(orderId: number, previousStatus: string | null | undefined, extra: Record<string, any> = {}) {
  try {
    const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = rows[0];
    if (!order || order.orderStatus === previousStatus) return;
    const event = smsEventForStatus(order.orderStatus || '');
    if (!event) return;
    await notifySmsEvent(event, { order, ...extra });
  } catch {
    /* never affects the status change */
  }
}

/**
 * Password reset codes travel by SMS, so the gateway connection (provider,
 * API key, custom URL) is changed only by an administrator or a staff member
 * with System Configuration. Marketing staff keep the messages and templates.
 */
const mayEditSmsGateway = (session?: SessionPayload) => Boolean(session && (session.role === 'admin' || hasModule(session, 'settings')));

deps.app.get('/api/admin/sms/config', async (req: any, res) => {
  const cfg = await readSmsConfig();
  const events: Record<string, any> = {};
  (Object.keys(SMS_DEFAULT_TEMPLATES) as SmsEvent[]).forEach((event) => {
    events[event] = { ...smsEventConfig(cfg, event), defaultTemplate: SMS_DEFAULT_TEMPLATES[event] };
  });
  if (!mayEditSmsGateway(req.session)) {
    return res.json({ ...cfg, apiKey: cfg.apiKey ? '••••••••' : '', custom: { ...(cfg.custom || {}), url: '', body: '' }, events, gatewayLocked: true });
  }
  res.json({ ...cfg, events });
});

deps.app.put('/api/admin/sms/config', async (req: any, res) => {
  try {
    let body = req.body || {};
    if (!mayEditSmsGateway(req.session)) {
      const stored: any = await readSmsConfig();
      body = { ...body, provider: stored.provider, apiKey: stored.apiKey, senderId: stored.senderId, username: stored.username, publicBaseUrl: stored.publicBaseUrl, custom: stored.custom };
    }
    const events: Record<string, any> = {};
    (Object.keys(SMS_DEFAULT_TEMPLATES) as SmsEvent[]).forEach((event) => {
      const incoming = body.events?.[event] || {};
      events[event] = {
        enabled: Boolean(incoming.enabled),
        template: String(incoming.template || '').slice(0, 1000),
      };
    });
    const value = JSON.stringify({
      enabled: Boolean(body.enabled),
      provider: ['bulksmsbd', 'smsnetbd', 'greenweb', 'mimsms', 'custom'].includes(body.provider) ? body.provider : 'bulksmsbd',
      apiKey: String(body.apiKey || '').trim(),
      senderId: String(body.senderId || '').trim(),
      // v3.11 — MiM SMS account user name (email)
      username: String(body.username || '').trim().slice(0, 191),
      adminPhones: String(body.adminPhones || '').trim(),
      publicBaseUrl: String(body.publicBaseUrl || '').trim(),
      custom: {
        url: String(body.custom?.url || '').trim(),
        method: String(body.custom?.method || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET',
        bodyType: body.custom?.bodyType === 'json' ? 'json' : 'form',
        body: String(body.custom?.body || ''),
        successContains: String(body.custom?.successContains || '').trim(),
      },
      events,
    });
    await db.insert(siteSettings).values({ key: 'sms_config', value }).onDuplicateKeyUpdate({ set: { value } });
    res.json({ success: true });
  } catch (error: any) {
    console.error('sms config:', error);
    res.status(500).json({ error: 'Could not save SMS settings.' });
  }
});

/** Test / manual send. Uses the saved settings (save first). */
deps.app.post('/api/admin/sms/send', async (req, res) => {
  const { phone, message, orderId } = req.body || {};
  const result = await sendSms(phone, String(message || ''), {
    event: orderId ? 'manual_order' : 'test',
    orderId: Number(orderId) || null,
    force: true,
  });
  res.status(result.ok ? 200 : 400).json({
    success: result.ok,
    error: result.ok ? undefined : result.error,
    message: result.ok ? `SMS sent to ${result.phone}.` : undefined,
  });
});

deps.app.get('/api/admin/sms/balance', async (_req, res) => {
  const cfg = await readSmsConfig();
  const apiKey = String(cfg.apiKey || '').trim();
  try {
    if (cfg.provider === 'bulksmsbd' && apiKey) {
      const { text } = await smsHttp(`https://bulksmsbd.net/api/getBalanceApi?api_key=${encodeURIComponent(apiKey)}`);
      const data = parseJson(text);
      if (data?.balance !== undefined) return res.json({ balance: Number(data.balance) });
      return res.status(400).json({ error: data?.error_message || text || 'Balance not available.' });
    }
    if (cfg.provider === 'smsnetbd' && apiKey) {
      const { text } = await smsHttp(`https://api.sms.net.bd/user/balance/?api_key=${encodeURIComponent(apiKey)}`);
      const data = parseJson(text);
      if (data && Number(data.error) === 0) return res.json({ balance: Number(data.data?.balance) });
      return res.status(400).json({ error: data?.msg || 'Balance not available.' });
    }
    if (cfg.provider === 'mimsms' && apiKey && cfg.username) {
      const { text } = await smsHttp('https://api.mimsms.com/api/V2/BalanceCheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ userName: String(cfg.username).trim(), apiKey }),
      });
      const data = parseJson(text);
      const raw = Array.isArray(data?.data) ? data.data[0]?.balance : data?.data?.balance ?? data?.responseResult;
      if (String(data?.statusCode) === '200' && raw !== undefined && Number.isFinite(Number(raw))) {
        const expires = Array.isArray(data?.data) ? data.data[0]?.expair_Date : undefined;
        return res.json({ balance: Number(raw), expires: expires || undefined });
      }
      return res.status(400).json({ error: data?.responseResult || data?.message || 'Balance not available.' });
    }
    res.status(400).json({ error: 'Balance check is available for BulkSMSBD, sms.net.bd and MiM SMS.' });
  } catch (error: any) {
    res.status(502).json({ error: 'Could not reach the SMS gateway.' });
  }
});

deps.app.get('/api/admin/sms/logs', async (req, res) => {
  try {
    const orderId = Number(req.query.orderId) || 0;
    const rows = deps.sqlRows(
      await db.execute(
        orderId
          ? sql`SELECT id, phone, message, event, order_id AS orderId, provider, status, response, segments, created_at AS createdAt
                FROM sms_logs WHERE order_id = ${orderId} ORDER BY id DESC LIMIT 50`
          : sql`SELECT id, phone, message, event, order_id AS orderId, provider, status, response, segments, created_at AS createdAt
                FROM sms_logs ORDER BY id DESC LIMIT 300`
      )
    );
    const stats = deps.sqlRows(
      await db.execute(sql`SELECT
          SUM(status = 'sent' AND created_at > NOW() - INTERVAL 30 DAY) AS sent30,
          SUM(status = 'failed' AND created_at > NOW() - INTERVAL 30 DAY) AS failed30,
          SUM(CASE WHEN status = 'sent' AND created_at > NOW() - INTERVAL 30 DAY THEN segments ELSE 0 END) AS segments30
        FROM sms_logs`)
    )[0] || {};
    res.json({
      logs: rows.map((row: any) => ({ ...row, createdAt: utcIso(row.createdAt) })),
      stats: {
        sent30: Number(stats.sent30 || 0),
        failed30: Number(stats.failed30 || 0),
        segments30: Number(stats.segments30 || 0),
      },
    });
  } catch (error: any) {
    console.error('sms logs:', error);
    res.status(500).json({ error: 'Could not load the SMS log.' });
  }
});

/** True when the chosen gateway has the credentials it needs */
function smsGatewayReady(cfg: any): boolean {
  if (!cfg?.enabled) return false;
  const apiKey = String(cfg.apiKey || '').trim();
  switch (String(cfg.provider || 'bulksmsbd')) {
    case 'bulksmsbd':
      return Boolean(apiKey && String(cfg.senderId || '').trim());
    case 'smsnetbd':
    case 'greenweb':
      return Boolean(apiKey);
    case 'mimsms':
      return Boolean(apiKey && String(cfg.username || '').trim() && String(cfg.senderId || '').trim());
    case 'custom':
      return /^https?:\/\//i.test(String(cfg.custom?.url || ''));
    default:
      return false;
  }
}

  return { bdMobile, fillTemplate, notifyOrderStatusSms, notifySmsEvent, readSmsConfig, sendSms, smsEventConfig, smsGatewayReady, smsStoreVars };
}
