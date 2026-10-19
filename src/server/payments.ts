/**
 * Online payments — SSLCommerz, bKash (tokenized checkout) and Nagad.
 *
 * How a payment runs:
 *   1. The customer places the order as usual (stock, price and delivery are
 *      decided by the order route). The order is saved "payment pending".
 *   2. The checkout calls POST /api/payments/:gateway/init with the order
 *      number and phone. The AMOUNT IS READ FROM THE ORDER on the server —
 *      the browser never tells us how much to charge.
 *   3. The customer pays on the gateway's own page.
 *   4. The gateway sends the customer back (and SSLCommerz also calls our IPN).
 *      We NEVER trust the status in that URL: every result is confirmed
 *      server-to-server with the gateway (validation API / execute / verify)
 *      and the paid amount must match the order before it is marked paid.
 *   5. The customer lands on /payment/result with the outcome.
 *
 * Credentials live in site_settings.payment_gateways, which is never sent to
 * the storefront; the dashboard only ever sees masked secrets.
 */
import type express from 'express';
import crypto from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { orders, paymentTransactions, siteSettings } from '../db/schema.ts';

export type GatewayId = 'sslcommerz' | 'bkash' | 'nagad';
export const GATEWAY_IDS: GatewayId[] = ['sslcommerz', 'bkash', 'nagad'];

export interface GatewayConfig {
  sslcommerz: { enabled: boolean; sandbox: boolean; label: string; description: string; logoUrl: string; storeId: string; storePassword: string };
  bkash: { enabled: boolean; sandbox: boolean; label: string; description: string; logoUrl: string; appKey: string; appSecret: string; username: string; password: string };
  nagad: {
    enabled: boolean;
    sandbox: boolean;
    label: string;
    description: string;
    /** v3.7 — optional logo shown at checkout (uploaded in the media library) */
    logoUrl: string;
    merchantId: string;
    merchantNumber: string;
    merchantPrivateKey: string;
    pgPublicKey: string;
  };
}

const DEFAULT_CONFIG: GatewayConfig = {
  sslcommerz: {
    enabled: false,
    sandbox: true,
    label: 'Card / Mobile Banking (SSLCommerz)',
    description: 'Visa, Mastercard, bKash, Nagad, Rocket and internet banking',
    logoUrl: '',
    storeId: '',
    storePassword: '',
  },
  bkash: { enabled: false, sandbox: true, label: 'bKash', description: 'Pay instantly with your bKash account', logoUrl: '', appKey: '', appSecret: '', username: '', password: '' },
  nagad: {
    enabled: false,
    sandbox: true,
    label: 'Nagad',
    description: 'Pay instantly with your Nagad account',
    logoUrl: '',
    merchantId: '',
    merchantNumber: '',
    merchantPrivateKey: '',
    pgPublicKey: '',
  },
};

const SECRET_FIELDS: Record<GatewayId, string[]> = {
  sslcommerz: ['storePassword'],
  bkash: ['appSecret', 'password'],
  nagad: ['merchantPrivateKey'],
};
const MASK = '••••••••';

const BASE_URLS = {
  sslcommerz: { sandbox: 'https://sandbox.sslcommerz.com', live: 'https://securepay.sslcommerz.com' },
  bkash: { sandbox: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta', live: 'https://tokenized.pay.bka.sh/v1.2.0-beta' },
  nagad: {
    sandbox: 'http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs',
    live: 'https://api.mynagad.com/api/dfs',
  },
};

/** Test/staging override: SSLCOMMERZ_BASE_URL, BKASH_BASE_URL, NAGAD_BASE_URL */
function baseUrl(gateway: GatewayId, sandbox: boolean): string {
  const env = process.env[`${gateway.toUpperCase()}_BASE_URL`];
  if (env && /^https?:\/\//i.test(env)) return env.replace(/\/+$/, '');
  return sandbox ? BASE_URLS[gateway].sandbox : BASE_URLS[gateway].live;
}

/* ------------------------------------------------------------- settings */

let configCache: { at: number; value: GatewayConfig | null } = { at: 0, value: null };

export async function readGatewayConfig(): Promise<GatewayConfig> {
  if (configCache.value && Date.now() - configCache.at < 15_000) return configCache.value;
  let saved: any = {};
  try {
    const row = (await db.select().from(siteSettings).where(eq(siteSettings.key, 'payment_gateways')).limit(1))[0];
    saved = row ? JSON.parse(row.value) || {} : {};
  } catch {
    saved = {};
  }
  const value = {
    sslcommerz: { ...DEFAULT_CONFIG.sslcommerz, ...(saved.sslcommerz || {}) },
    bkash: { ...DEFAULT_CONFIG.bkash, ...(saved.bkash || {}) },
    nagad: { ...DEFAULT_CONFIG.nagad, ...(saved.nagad || {}) },
  } as GatewayConfig;
  configCache = { at: Date.now(), value };
  return value;
}

function isConfigured(id: GatewayId, cfg: GatewayConfig): boolean {
  if (id === 'sslcommerz') return Boolean(cfg.sslcommerz.storeId && cfg.sslcommerz.storePassword);
  if (id === 'bkash') return Boolean(cfg.bkash.appKey && cfg.bkash.appSecret && cfg.bkash.username && cfg.bkash.password);
  return Boolean(cfg.nagad.merchantId && cfg.nagad.merchantPrivateKey && cfg.nagad.pgPublicKey);
}

/** What the checkout may know: which gateways are on, and their captions */
export async function publicGateways(): Promise<Array<{ id: GatewayId; name: string; description: string; logoUrl: string; sandbox: boolean }>> {
  const cfg = await readGatewayConfig();
  return GATEWAY_IDS.filter((id) => cfg[id].enabled && isConfigured(id, cfg)).map((id) => ({
    id,
    name: cfg[id].label || DEFAULT_CONFIG[id].label,
    description: cfg[id].description || '',
    logoUrl: cfg[id].logoUrl || '',
    sandbox: Boolean(cfg[id].sandbox),
  }));
}

export async function enabledGatewayIds(): Promise<GatewayId[]> {
  return (await publicGateways()).map((item) => item.id);
}

function maskConfig(cfg: GatewayConfig) {
  const out: any = {};
  for (const id of GATEWAY_IDS) {
    out[id] = { ...cfg[id] };
    for (const field of SECRET_FIELDS[id]) {
      out[id][`has_${field}`] = Boolean((cfg[id] as any)[field]);
      out[id][field] = (cfg[id] as any)[field] ? MASK : '';
    }
    out[id].configured = isConfigured(id, cfg);
  }
  return out;
}

/* ------------------------------------------------------------- helpers */

const money = (value: any) => (Math.round(Number(value || 0) * 100) / 100).toFixed(2);

async function httpJson(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; data: any; text: string }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs || 25_000) });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: response.status, data, text };
}

function newReference(orderNumber: string): string {
  const clean = orderNumber.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  return `${clean}${Date.now().toString(36).slice(-5)}${crypto.randomBytes(2).toString('hex')}`.toUpperCase();
}

function trimPayload(value: any): string {
  try {
    return JSON.stringify(value).slice(0, 4000);
  } catch {
    return '';
  }
}

async function saveTx(id: number, patch: Partial<typeof paymentTransactions.$inferInsert>) {
  await db
    .update(paymentTransactions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(paymentTransactions.id, id));
}

/* ------------------------------------------------------------- Nagad crypto */

function pem(raw: string, kind: 'PRIVATE KEY' | 'PUBLIC KEY'): string {
  const value = String(raw || '').trim();
  if (value.includes('-----BEGIN')) return value;
  const body = value.replace(/\s+/g, '').replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${kind}-----\n${body}\n-----END ${kind}-----`;
}

function nagadEncrypt(pgPublicKey: string, data: object): string {
  return crypto
    .publicEncrypt({ key: pem(pgPublicKey, 'PUBLIC KEY'), padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(JSON.stringify(data)))
    .toString('base64');
}

function nagadSign(privateKey: string, data: object): string {
  return crypto.createSign('RSA-SHA256').update(JSON.stringify(data)).sign(pem(privateKey, 'PRIVATE KEY'), 'base64');
}

function nagadVerify(pgPublicKey: string, text: string, signature: string): boolean {
  try {
    return crypto.createVerify('RSA-SHA256').update(text).verify(pem(pgPublicKey, 'PUBLIC KEY'), signature, 'base64');
  } catch {
    return false;
  }
}

/**
 * Nagad encrypts its answer with RSA PKCS#1 v1.5. Recent Node versions refuse
 * that padding for private decryption, so the raw block is decrypted without
 * padding and the v1.5 envelope (00 02 <random> 00 <message>) is removed here.
 */
function nagadDecrypt(privateKey: string, base64: string): string {
  const key = pem(privateKey, 'PRIVATE KEY');
  const input = Buffer.from(base64, 'base64');
  try {
    return crypto.privateDecrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, input).toString('utf8');
  } catch {
    /* fall through to manual unpadding */
  }
  const keyObject = crypto.createPrivateKey(key);
  const size = ((keyObject.asymmetricKeyDetails?.modulusLength as number) || 2048) / 8;
  const parts: string[] = [];
  for (let offset = 0; offset < input.length; offset += size) {
    const block = crypto.privateDecrypt({ key: keyObject, padding: crypto.constants.RSA_NO_PADDING }, input.subarray(offset, offset + size));
    if (block[0] !== 0x00 || block[1] !== 0x02) throw new Error('Nagad response could not be decrypted');
    const separator = block.indexOf(0x00, 2);
    if (separator < 10) throw new Error('Nagad response could not be decrypted');
    parts.push(block.subarray(separator + 1).toString('utf8'));
  }
  return parts.join('');
}

/** Nagad wants Bangladesh time, YYYYMMDDHHmmss */
function dhakaDateTime(): string {
  const d = new Date(Date.now() + 6 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/* ------------------------------------------------------------- bKash token */

let bkashToken: { key: string; token: string; expires: number } | null = null;

async function bkashGrant(cfg: GatewayConfig['bkash']): Promise<string> {
  const cacheKey = `${cfg.sandbox}:${cfg.appKey}:${cfg.username}`;
  if (bkashToken && bkashToken.key === cacheKey && bkashToken.expires > Date.now() + 60_000) return bkashToken.token;
  const { data, status } = await httpJson(`${baseUrl('bkash', cfg.sandbox)}/tokenized/checkout/token/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', username: cfg.username, password: cfg.password },
    body: JSON.stringify({ app_key: cfg.appKey, app_secret: cfg.appSecret }),
  });
  if (!data?.id_token) {
    throw new Error(data?.statusMessage || data?.errorMessage || data?.msg || `bKash login failed (HTTP ${status})`);
  }
  bkashToken = { key: cacheKey, token: data.id_token, expires: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return data.id_token;
}

function bkashHeaders(cfg: GatewayConfig['bkash'], token: string) {
  return { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: token, 'X-APP-Key': cfg.appKey };
}

/* ------------------------------------------------------------- the module */

export interface PaymentDeps {
  clientIp: (req: express.Request) => string;
  publicOrigin: (req: express.Request) => string;
  notifyAdmin: (type: string, title: string, body: string, linkTab?: string) => Promise<any> | void;
  requireAdmin: express.RequestHandler;
  /** Called after an order is confirmed paid (cache invalidation, SMS …) */
  onPaid?: (orderId: number) => void;
}

export function registerPayments(app: express.Express, deps: PaymentDeps) {
  const resultUrl = (req: express.Request, orderNumber: string, status: 'paid' | 'failed' | 'cancelled', gateway: string, message = '') => {
    const query = new URLSearchParams({ order: orderNumber, status, gateway });
    if (message) query.set('message', message.slice(0, 160));
    return `${deps.publicOrigin(req)}/payment/result?${query.toString()}`;
  };

  async function markPaid(tx: typeof paymentTransactions.$inferSelect, gatewayTxnId: string, payload: any, note = '') {
    // v3.9 — the browser return and the gateway's IPN often arrive at the same
    // moment. Only the call that actually flips the row to "paid" carries on,
    // so the order is updated and the owner notified exactly once.
    const result: any = await db
      .update(paymentTransactions)
      .set({ status: 'paid', gatewayTxnId: gatewayTxnId || null, message: (note || 'Paid').slice(0, 250), payload: trimPayload(payload), updatedAt: new Date() })
      .where(and(eq(paymentTransactions.id, tx.id), sql`${paymentTransactions.status} <> 'paid'`));
    const affected = Number(result?.[0]?.affectedRows ?? result?.affectedRows ?? 0);
    if (!affected) return;
    await db
      .update(orders)
      .set({
        paymentStatus: 'paid',
        transactionId: gatewayTxnId || tx.reference,
        updatedAt: new Date(),
        // A risk warning is written on the order too, where the packer will see it
        ...(note ? { notes: sql`TRIM(CONCAT(COALESCE(${orders.notes}, ''), ' ', ${`[${note}]`}))` } : {}),
      })
      .where(eq(orders.id, tx.orderId));
    try {
      await deps.notifyAdmin(
        'payment',
        `Payment received — ${tx.orderNumber}`,
        `৳${tx.amount} paid by ${tx.gateway}. Transaction ${gatewayTxnId || tx.reference}.${note ? ` ${note}` : ''}`,
        'orders'
      );
    } catch {
      /* a notification is never worth failing a payment over */
    }
    deps.onPaid?.(tx.orderId);
  }

  async function markFailed(tx: typeof paymentTransactions.$inferSelect, status: 'failed' | 'cancelled', message: string, payload?: any) {
    if (tx.status === 'paid') return; // a late "failed" never undoes a confirmed payment
    await db
      .update(paymentTransactions)
      .set({ status, message: message.slice(0, 250), payload: payload ? trimPayload(payload) : tx.payload, updatedAt: new Date() })
      .where(and(eq(paymentTransactions.id, tx.id), sql`${paymentTransactions.status} <> 'paid'`));
    await db
      .update(orders)
      .set({ paymentStatus: status === 'cancelled' ? 'unpaid' : 'failed', updatedAt: new Date() })
      .where(and(eq(orders.id, tx.orderId), sql`${orders.paymentStatus} <> 'paid'`));
  }

  async function txByReference(reference: string) {
    if (!reference) return null;
    return (await db.select().from(paymentTransactions).where(eq(paymentTransactions.reference, reference)).limit(1))[0] || null;
  }

  /* ---- start a payment ---- */
  app.post('/api/payments/:gateway/init', async (req, res) => {
    try {
      const gateway = String(req.params.gateway) as GatewayId;
      if (!GATEWAY_IDS.includes(gateway)) return res.status(404).json({ error: 'Unknown payment method.' });
      const cfg = await readGatewayConfig();
      if (!cfg[gateway].enabled || !isConfigured(gateway, cfg)) {
        return res.status(400).json({ error: 'This payment method is not available right now.' });
      }
      const orderNumber = String(req.body?.orderNumber || '').trim();
      const phone = String(req.body?.phone || '').replace(/[\s-]+/g, '');
      const order = (await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1))[0];
      if (!order || String(order.customerPhone).replace(/[\s-]+/g, '') !== phone) {
        return res.status(404).json({ error: 'Order not found.' });
      }
      if (order.paymentStatus === 'paid') return res.json({ alreadyPaid: true, url: resultUrl(req, order.orderNumber, 'paid', gateway) });
      if (order.paymentMethod !== gateway) return res.status(400).json({ error: 'This order uses a different payment method.' });
      if (['cancelled', 'returned'].includes(String(order.orderStatus))) {
        return res.status(400).json({ error: 'This order has been cancelled.' });
      }
      const amount = money(order.total);
      if (Number(amount) <= 0) return res.status(400).json({ error: 'Nothing to pay on this order.' });

      const reference = newReference(order.orderNumber);
      await db.insert(paymentTransactions).values({
        orderId: order.id,
        orderNumber: order.orderNumber,
        gateway,
        amount,
        reference,
        status: 'initiated',
      });
      const tx = (await txByReference(reference))!;
      const origin = deps.publicOrigin(req);

      if (gateway === 'sslcommerz') {
        const c = cfg.sslcommerz;
        const form = new URLSearchParams({
          store_id: c.storeId,
          store_passwd: c.storePassword,
          total_amount: amount,
          currency: 'BDT',
          tran_id: reference,
          success_url: `${origin}/api/payments/sslcommerz/return/success?ref=${reference}`,
          fail_url: `${origin}/api/payments/sslcommerz/return/fail?ref=${reference}`,
          cancel_url: `${origin}/api/payments/sslcommerz/return/cancel?ref=${reference}`,
          ipn_url: `${origin}/api/payments/sslcommerz/ipn`,
          cus_name: String(order.customerName || 'Customer').slice(0, 50),
          // SSLCommerz requires an e-mail and a post code; a COD-style checkout has neither
          cus_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String((order as any).customerEmail || '')) ? String((order as any).customerEmail) : 'customer@example.com',
          cus_add1: String(order.customerAddress || 'Bangladesh').slice(0, 50),
          cus_city: String((order as any).district || 'Dhaka').slice(0, 50),
          cus_postcode: '1000',
          cus_country: 'Bangladesh',
          cus_phone: String(order.customerPhone),
          shipping_method: 'NO',
          product_name: `Order ${order.orderNumber}`,
          product_category: 'General',
          product_profile: 'general',
          num_of_item: '1',
          value_a: order.orderNumber,
        });
        const { data, status } = await httpJson(`${baseUrl('sslcommerz', c.sandbox)}/gwprocess/v4/api.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        });
        if (data?.status !== 'SUCCESS' || !data?.GatewayPageURL) {
          const message = data?.failedreason || `SSLCommerz did not start the payment (HTTP ${status})`;
          await markFailed(tx, 'failed', message, data);
          return res.status(502).json({ error: message });
        }
        await saveTx(tx.id, { gatewayRef: String(data.sessionkey || ''), payload: trimPayload({ sessionkey: data.sessionkey }) });
        return res.json({ url: data.GatewayPageURL });
      }

      if (gateway === 'bkash') {
        const c = cfg.bkash;
        const token = await bkashGrant(c);
        const { data, status } = await httpJson(`${baseUrl('bkash', c.sandbox)}/tokenized/checkout/create`, {
          method: 'POST',
          headers: bkashHeaders(c, token),
          body: JSON.stringify({
            mode: '0011',
            payerReference: phone || order.orderNumber,
            callbackURL: `${origin}/api/payments/bkash/callback?ref=${reference}`,
            amount,
            currency: 'BDT',
            intent: 'sale',
            merchantInvoiceNumber: reference,
          }),
        });
        if (!data?.bkashURL || !data?.paymentID) {
          const message = data?.statusMessage || data?.errorMessage || `bKash did not start the payment (HTTP ${status})`;
          await markFailed(tx, 'failed', message, data);
          return res.status(502).json({ error: message });
        }
        await saveTx(tx.id, { gatewayRef: String(data.paymentID) });
        return res.json({ url: data.bkashURL });
      }

      // Nagad
      const c = cfg.nagad;
      const base = baseUrl('nagad', c.sandbox);
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-KM-Api-Version': 'v-0.2.0',
        'X-KM-IP-V4': deps.clientIp(req) || '127.0.0.1',
        'X-KM-Client-Type': 'PC_WEB',
      };
      const dateTime = dhakaDateTime();
      const challenge = crypto.randomBytes(20).toString('hex');
      const sensitive = { merchantId: c.merchantId, datetime: dateTime, orderId: reference, challenge };
      const init = await httpJson(`${base}/check-out/initialize/${encodeURIComponent(c.merchantId)}/${encodeURIComponent(reference)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          accountNumber: c.merchantNumber || undefined,
          dateTime,
          sensitiveData: nagadEncrypt(c.pgPublicKey, sensitive),
          signature: nagadSign(c.merchantPrivateKey, sensitive),
        }),
      });
      if (!init.data?.sensitiveData) {
        const message = init.data?.message || init.data?.reason || `Nagad did not start the payment (HTTP ${init.status})`;
        await markFailed(tx, 'failed', message, init.data);
        return res.status(502).json({ error: message });
      }
      const decrypted = nagadDecrypt(c.merchantPrivateKey, init.data.sensitiveData);
      if (init.data.signature && !nagadVerify(c.pgPublicKey, decrypted, init.data.signature)) {
        await markFailed(tx, 'failed', 'Nagad response signature is not valid');
        return res.status(502).json({ error: 'Nagad response could not be verified.' });
      }
      const initData = JSON.parse(decrypted);
      const completeSensitive = {
        merchantId: c.merchantId,
        orderId: reference,
        currencyCode: '050',
        amount,
        challenge: initData.challenge,
      };
      const complete = await httpJson(`${base}/check-out/complete/${encodeURIComponent(initData.paymentReferenceId)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sensitiveData: nagadEncrypt(c.pgPublicKey, completeSensitive),
          signature: nagadSign(c.merchantPrivateKey, completeSensitive),
          merchantCallbackURL: `${origin}/api/payments/nagad/callback?ref=${reference}`,
          additionalMerchantInfo: { orderNumber: order.orderNumber },
        }),
      });
      if (complete.data?.status !== 'Success' || !complete.data?.callBackUrl) {
        const message = complete.data?.message || complete.data?.reason || `Nagad did not start the payment (HTTP ${complete.status})`;
        await markFailed(tx, 'failed', message, complete.data);
        return res.status(502).json({ error: message });
      }
      await saveTx(tx.id, { gatewayRef: String(initData.paymentReferenceId) });
      return res.json({ url: complete.data.callBackUrl });
    } catch (error: any) {
      console.error('[payments] init failed:', error?.message || error);
      res.status(502).json({ error: 'The payment could not be started. Please try again or choose another method.' });
    }
  });

  /* ---- SSLCommerz: confirm a val_id with the validation API ---- */
  async function sslcommerzConfirm(tx: typeof paymentTransactions.$inferSelect, valId: string) {
    const cfg = (await readGatewayConfig()).sslcommerz;
    const query = new URLSearchParams({ val_id: valId, store_id: cfg.storeId, store_passwd: cfg.storePassword, v: '1', format: 'json' });
    const { data } = await httpJson(`${baseUrl('sslcommerz', cfg.sandbox)}/validator/api/validationserverAPI.php?${query.toString()}`);
    const valid = data && (data.status === 'VALID' || data.status === 'VALIDATED');
    const sameTx = data && String(data.tran_id) === tx.reference;
    const sameAmount = data && Math.abs(Number(data.amount) - Number(tx.amount)) < 0.01 && String(data.currency || 'BDT') === 'BDT';
    if (valid && sameTx && sameAmount) {
      // risk_level 1 = SSLCommerz flags the card as risky: the money is taken,
      // but the owner should check before sending the parcel
      const risky = String(data.risk_level || '0') === '1';
      if (tx.status !== 'paid') {
        await markPaid(tx, String(data.bank_tran_id || data.val_id || valId), data, risky ? `HIGH RISK (SSLCommerz): ${String(data.risk_title || 'verify the customer before delivery')}.` : '');
      }
      return true;
    }
    await markFailed(tx, 'failed', !valid ? `Not valid (${data?.status || 'no answer'})` : !sameTx ? 'Transaction id mismatch' : 'Amount mismatch', data);
    return false;
  }

  const sslReturn = async (req: express.Request, res: express.Response) => {
    const outcome = String(req.params.outcome);
    const reference = String(req.query.ref || req.body?.tran_id || '');
    const tx = await txByReference(reference);
    if (!tx) return res.redirect(`${deps.publicOrigin(req)}/`);
    try {
      if (tx.status === 'paid') return res.redirect(resultUrl(req, tx.orderNumber, 'paid', 'sslcommerz'));
      const valId = String(req.body?.val_id || req.query.val_id || '');
      if (outcome === 'success' && valId) {
        const ok = await sslcommerzConfirm(tx, valId);
        return res.redirect(resultUrl(req, tx.orderNumber, ok ? 'paid' : 'failed', 'sslcommerz'));
      }
      const cancelled = outcome === 'cancel';
      await markFailed(tx, cancelled ? 'cancelled' : 'failed', cancelled ? 'Cancelled by the customer' : String(req.body?.error || 'Payment failed'), req.body);
      return res.redirect(resultUrl(req, tx.orderNumber, cancelled ? 'cancelled' : 'failed', 'sslcommerz'));
    } catch (error: any) {
      console.error('[payments] sslcommerz return:', error?.message || error);
      return res.redirect(resultUrl(req, tx.orderNumber, 'failed', 'sslcommerz', 'We could not confirm the payment yet. If money was taken it will be confirmed shortly.'));
    }
  };
  app.post('/api/payments/sslcommerz/return/:outcome', sslReturn);
  app.get('/api/payments/sslcommerz/return/:outcome', sslReturn);

  // Instant Payment Notification — SSLCommerz calls this server-to-server
  app.post('/api/payments/sslcommerz/ipn', async (req, res) => {
    try {
      const tx = await txByReference(String(req.body?.tran_id || ''));
      if (!tx) return res.status(404).send('unknown');
      if (tx.status !== 'paid' && req.body?.val_id) await sslcommerzConfirm(tx, String(req.body.val_id));
      res.send('ok');
    } catch (error: any) {
      console.error('[payments] sslcommerz ipn:', error?.message || error);
      res.status(500).send('error');
    }
  });

  /* ---- bKash callback: execute, then query if the execute answer is unclear ---- */
  app.get('/api/payments/bkash/callback', async (req, res) => {
    const tx = await txByReference(String(req.query.ref || ''));
    if (!tx) return res.redirect(`${deps.publicOrigin(req)}/`);
    try {
      if (tx.status === 'paid') return res.redirect(resultUrl(req, tx.orderNumber, 'paid', 'bkash'));
      const paymentID = String(req.query.paymentID || '');
      const status = String(req.query.status || '');
      if (!paymentID || paymentID !== tx.gatewayRef) {
        await markFailed(tx, 'failed', 'Payment id mismatch');
        return res.redirect(resultUrl(req, tx.orderNumber, 'failed', 'bkash'));
      }
      if (status !== 'success') {
        const cancelled = status === 'cancel';
        await markFailed(tx, cancelled ? 'cancelled' : 'failed', cancelled ? 'Cancelled by the customer' : 'Payment failed at bKash');
        return res.redirect(resultUrl(req, tx.orderNumber, cancelled ? 'cancelled' : 'failed', 'bkash'));
      }
      const cfg = (await readGatewayConfig()).bkash;
      const token = await bkashGrant(cfg);
      const base = baseUrl('bkash', cfg.sandbox);
      let { data } = await httpJson(`${base}/tokenized/checkout/execute`, {
        method: 'POST',
        headers: bkashHeaders(cfg, token),
        body: JSON.stringify({ paymentID }),
      });
      if (!data || !data.transactionStatus) {
        // Network hiccup on execute: ask bKash what actually happened
        ({ data } = await httpJson(`${base}/tokenized/checkout/payment/status`, {
          method: 'POST',
          headers: bkashHeaders(cfg, token),
          body: JSON.stringify({ paymentID }),
        }));
      }
      const completed = data?.transactionStatus === 'Completed';
      const sameAmount = data && Math.abs(Number(data.amount) - Number(tx.amount)) < 0.01;
      const sameInvoice = !data?.merchantInvoiceNumber || data.merchantInvoiceNumber === tx.reference;
      if (completed && sameAmount && sameInvoice) {
        await markPaid(tx, String(data.trxID || paymentID), data);
        return res.redirect(resultUrl(req, tx.orderNumber, 'paid', 'bkash'));
      }
      const message = data?.statusMessage || data?.errorMessage || (completed ? 'Amount mismatch' : 'Payment was not completed');
      await markFailed(tx, 'failed', message, data);
      return res.redirect(resultUrl(req, tx.orderNumber, 'failed', 'bkash', message));
    } catch (error: any) {
      console.error('[payments] bkash callback:', error?.message || error);
      return res.redirect(resultUrl(req, tx.orderNumber, 'failed', 'bkash', 'We could not confirm the payment yet. If money was taken it will be confirmed shortly.'));
    }
  });

  /* ---- Nagad callback: verify with Nagad ---- */
  async function nagadConfirm(tx: typeof paymentTransactions.$inferSelect, paymentRefId: string) {
    const cfg = (await readGatewayConfig()).nagad;
    const { data } = await httpJson(`${baseUrl('nagad', cfg.sandbox)}/verify/payment/${encodeURIComponent(paymentRefId)}`, {
      headers: { 'Content-Type': 'application/json', 'X-KM-Api-Version': 'v-0.2.0', 'X-KM-Client-Type': 'PC_WEB' },
    });
    const ok =
      data?.status === 'Success' &&
      Math.abs(Number(data.amount) - Number(tx.amount)) < 0.01 &&
      (!data.orderId || String(data.orderId) === tx.reference);
    if (ok) {
      if (tx.status !== 'paid') await markPaid(tx, String(data.issuerPaymentRefNo || data.paymentRefId || paymentRefId), data);
      return true;
    }
    await markFailed(tx, data?.status === 'Aborted' || data?.status === 'Cancelled' ? 'cancelled' : 'failed', String(data?.message || data?.status || 'Not verified'), data);
    return false;
  }

  app.get('/api/payments/nagad/callback', async (req, res) => {
    const tx = await txByReference(String(req.query.ref || req.query.order_id || ''));
    if (!tx) return res.redirect(`${deps.publicOrigin(req)}/`);
    try {
      if (tx.status === 'paid') return res.redirect(resultUrl(req, tx.orderNumber, 'paid', 'nagad'));
      const paymentRefId = String(req.query.payment_ref_id || tx.gatewayRef || '');
      if (!paymentRefId) {
        await markFailed(tx, 'failed', 'No payment reference');
        return res.redirect(resultUrl(req, tx.orderNumber, 'failed', 'nagad'));
      }
      const ok = await nagadConfirm(tx, paymentRefId);
      const fresh = await txByReference(tx.reference);
      return res.redirect(resultUrl(req, tx.orderNumber, ok ? 'paid' : fresh?.status === 'cancelled' ? 'cancelled' : 'failed', 'nagad'));
    } catch (error: any) {
      console.error('[payments] nagad callback:', error?.message || error);
      return res.redirect(resultUrl(req, tx.orderNumber, 'failed', 'nagad', 'We could not confirm the payment yet. If money was taken it will be confirmed shortly.'));
    }
  });

  /* ---- The result page asks for the latest state of its order ---- */
  app.get('/api/payments/status', async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const orderNumber = String(req.query.order || '').trim();
    const phone = String(req.query.phone || '').replace(/[\s-]+/g, '');
    const order = (await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1))[0];
    // The phone on the order is required: order numbers are sequential and
    // must not be enough to read someone else's payment
    if (!order || !phone || String(order.customerPhone).replace(/[\s-]+/g, '') !== phone) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const last = (
      await db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, order.id)).orderBy(desc(paymentTransactions.id)).limit(1)
    )[0];
    res.json({
      orderNumber: order.orderNumber,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      total: order.total,
      lastAttempt: last ? { status: last.status, message: last.message, gateway: last.gateway } : null,
    });
  });

  /**
   * The customer could not (or chose not to) pay online: the same order is
   * switched to cash on delivery — no second order, stock is not touched.
   * Only while nothing has been paid, and only if COD is offered.
   */
  app.post('/api/payments/switch-to-cod', async (req, res) => {
    const orderNumber = String(req.body?.orderNumber || '').trim();
    const phone = String(req.body?.phone || '').replace(/[\s-]+/g, '');
    const order = (await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1))[0];
    if (!order || String(order.customerPhone).replace(/[\s-]+/g, '') !== phone) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (order.paymentStatus === 'paid') return res.status(400).json({ error: 'This order is already paid.' });
    if (!(GATEWAY_IDS as string[]).includes(String(order.paymentMethod))) {
      return res.json({ success: true, order: { orderNumber: order.orderNumber, paymentMethod: order.paymentMethod } });
    }
    let codAllowed = true;
    try {
      const row = (await db.select().from(siteSettings).where(eq(siteSettings.key, 'payment')).limit(1))[0];
      const methods: Array<{ id: string; enabled?: boolean }> = row ? JSON.parse(row.value)?.methods || [] : [];
      if (methods.length > 0) codAllowed = methods.some((method) => method.id === 'cod' && method.enabled !== false);
    } catch {
      codAllowed = true;
    }
    if (!codAllowed) return res.status(400).json({ error: 'Cash on delivery is not available. Please try the online payment again.' });
    await db
      .update(orders)
      .set({ paymentMethod: 'cod', paymentStatus: 'unpaid', updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), sql`${orders.paymentStatus} <> 'paid'`));
    await db
      .update(paymentTransactions)
      .set({ status: 'cancelled', message: 'Customer switched to cash on delivery', updatedAt: new Date() })
      .where(and(eq(paymentTransactions.orderId, order.id), eq(paymentTransactions.status, 'initiated')));
    res.json({ success: true, order: { orderNumber: order.orderNumber, paymentMethod: 'cod', total: order.total } });
  });

  /* ---- Dashboard ---- */
  app.get('/api/admin/payment-gateways', deps.requireAdmin, async (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(maskConfig(await readGatewayConfig()));
  });

  app.put('/api/admin/payment-gateways', deps.requireAdmin, async (req, res) => {
    try {
      const current = await readGatewayConfig();
      const next: any = {};
      for (const id of GATEWAY_IDS) {
        const incoming = (req.body || {})[id] || {};
        const merged: any = { ...current[id] };
        for (const key of Object.keys(DEFAULT_CONFIG[id])) {
          if (!(key in incoming)) continue;
          const value = incoming[key];
          if (SECRET_FIELDS[id].includes(key)) {
            // The masked placeholder (or an empty box) keeps the saved secret
            if (value === MASK || value === undefined) continue;
            if (value === '' && incoming[`clear_${key}`] !== true) continue;
            merged[key] = String(value).trim();
          } else if (typeof (DEFAULT_CONFIG[id] as any)[key] === 'boolean') {
            merged[key] = Boolean(value);
          } else {
            merged[key] = String(value ?? '').trim().slice(0, key === 'pgPublicKey' ? 4000 : 500);
          }
        }
        next[id] = merged;
      }
      // A key that cannot be read would only fail at the customer's checkout
      if (next.nagad.merchantPrivateKey && next.nagad.merchantPrivateKey !== current.nagad.merchantPrivateKey) {
        try {
          crypto.createPrivateKey(pem(next.nagad.merchantPrivateKey, 'PRIVATE KEY'));
        } catch {
          return res.status(400).json({ error: 'The Nagad merchant private key is not a valid RSA private key.' });
        }
      }
      if (next.nagad.pgPublicKey && next.nagad.pgPublicKey !== current.nagad.pgPublicKey) {
        try {
          crypto.createPublicKey(pem(next.nagad.pgPublicKey, 'PUBLIC KEY'));
        } catch {
          return res.status(400).json({ error: 'The Nagad payment gateway public key is not a valid RSA public key.' });
        }
      }
      const value = JSON.stringify(next);
      await db.insert(siteSettings).values({ key: 'payment_gateways', value }).onDuplicateKeyUpdate({ set: { value } });
      configCache = { at: 0, value: null };
      bkashToken = null;
      res.json({ success: true, config: maskConfig(await readGatewayConfig()) });
    } catch (error: any) {
      console.error('[payments] save config:', error?.message || error);
      res.status(500).json({ error: 'Could not save the payment settings.' });
    }
  });

  /** "Test connection": proves the saved credentials work without charging anyone */
  app.post('/api/admin/payment-gateways/:gateway/test', deps.requireAdmin, async (req, res) => {
    const gateway = String(req.params.gateway) as GatewayId;
    const cfg = await readGatewayConfig();
    if (!GATEWAY_IDS.includes(gateway)) return res.status(404).json({ error: 'Unknown gateway.' });
    if (!isConfigured(gateway, cfg)) return res.status(400).json({ success: false, error: 'Fill in and save the credentials first.' });
    try {
      if (gateway === 'bkash') {
        bkashToken = null;
        await bkashGrant(cfg.bkash);
        return res.json({ success: true, message: `bKash ${cfg.bkash.sandbox ? 'sandbox' : 'live'} login works.` });
      }
      if (gateway === 'sslcommerz') {
        const c = cfg.sslcommerz;
        const query = new URLSearchParams({ tran_id: 'CONNECTION-TEST', store_id: c.storeId, store_passwd: c.storePassword, format: 'json' });
        const { data, status } = await httpJson(`${baseUrl('sslcommerz', c.sandbox)}/validator/api/merchantTransIDvalidationAPI.php?${query.toString()}`);
        const text = JSON.stringify(data || {}).toLowerCase();
        if (status >= 200 && status < 300 && data && !text.includes('invalid') && !text.includes('unauthorized')) {
          return res.json({ success: true, message: `SSLCommerz ${c.sandbox ? 'sandbox' : 'live'} store answered.` });
        }
        return res.status(400).json({ success: false, error: data?.APIConnect === 'INVALID_REQUEST' ? 'Store ID or password is wrong.' : `SSLCommerz refused the store credentials (HTTP ${status}).` });
      }
      const c = cfg.nagad;
      crypto.createPrivateKey(pem(c.merchantPrivateKey, 'PRIVATE KEY'));
      crypto.createPublicKey(pem(c.pgPublicKey, 'PUBLIC KEY'));
      return res.json({ success: true, message: 'Nagad keys are valid. Place a small test order to finish checking the account.' });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: String(error?.message || 'Connection failed').slice(0, 200) });
    }
  });

  app.get('/api/admin/payment-transactions', deps.requireAdmin, async (req, res) => {
    const orderId = Number(req.query.orderId) || 0;
    const rows = orderId
      ? await db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, orderId)).orderBy(desc(paymentTransactions.id)).limit(50)
      : await db.select().from(paymentTransactions).orderBy(desc(paymentTransactions.id)).limit(200);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(rows.map(({ payload, ...row }) => row));
  });

  /** Re-check a pending payment with the gateway (e.g. the customer closed the tab) */
  app.post('/api/admin/payment-transactions/:id/verify', deps.requireAdmin, async (req, res) => {
    const tx = (await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, Number(req.params.id))).limit(1))[0];
    if (!tx) return res.status(404).json({ error: 'Not found.' });
    if (tx.status === 'paid') return res.json({ success: true, status: 'paid' });
    try {
      const cfg = await readGatewayConfig();
      if (tx.gateway === 'sslcommerz') {
        const c = cfg.sslcommerz;
        const query = new URLSearchParams({ tran_id: tx.reference, store_id: c.storeId, store_passwd: c.storePassword, format: 'json' });
        const { data } = await httpJson(`${baseUrl('sslcommerz', c.sandbox)}/validator/api/merchantTransIDvalidationAPI.php?${query.toString()}`);
        const element = (data?.element || []).find((item: any) => item.status === 'VALID' || item.status === 'VALIDATED');
        if (element?.val_id) await sslcommerzConfirm(tx, String(element.val_id));
      } else if (tx.gateway === 'bkash' && tx.gatewayRef) {
        const token = await bkashGrant(cfg.bkash);
        const { data } = await httpJson(`${baseUrl('bkash', cfg.bkash.sandbox)}/tokenized/checkout/payment/status`, {
          method: 'POST',
          headers: bkashHeaders(cfg.bkash, token),
          body: JSON.stringify({ paymentID: tx.gatewayRef }),
        });
        if (data?.transactionStatus === 'Completed' && Math.abs(Number(data.amount) - Number(tx.amount)) < 0.01) {
          await markPaid(tx, String(data.trxID || tx.gatewayRef), data);
        }
      } else if (tx.gateway === 'nagad' && tx.gatewayRef) {
        await nagadConfirm(tx, tx.gatewayRef);
      }
      const fresh = (await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, tx.id)).limit(1))[0];
      res.json({ success: true, status: fresh?.status || tx.status, message: fresh?.message || '' });
    } catch (error: any) {
      res.status(502).json({ error: String(error?.message || 'The gateway did not answer.').slice(0, 200) });
    }
  });
}
