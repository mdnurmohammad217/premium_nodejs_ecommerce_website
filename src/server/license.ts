/**
 * License Server v2 integration — service, endpoints and the license gate.
 *
 * Source of truth: "License Server v2 API Contract — eCommerce/POS Client".
 * Only these License Server endpoints are called:
 *   GET  /api/v2/license/public-key   (once, only if no key is configured)
 *   POST /api/v2/license/activate
 *   POST /api/v2/license/sync
 *   POST /api/v2/license/deactivate
 *   POST /api/v2/license/report       (fire-and-forget)
 *
 * Rules this file enforces:
 *   • Nothing is trusted before its Ed25519 signature is checked with the
 *     License Server's PUBLIC key (token: QCT, response: LSR1 + nonce + jti).
 *   • A network error, timeout, 5xx or 429 never changes the local license —
 *     the last good token is kept and the next try backs off.
 *   • Only a verified 200 (a new token, stored even when success=false) or a
 *     verified 403 requireActivation changes what this install believes.
 *   • The gate runs on the server for every protected API, including routes
 *     added in the future (anything under the back-office prefixes, and any
 *     request made with an admin/staff session that is not a public read).
 */
import type express from 'express';
import crypto from 'crypto';
import { sql } from 'drizzle-orm';
import {
  normalizeDomain,
  newNonce,
  newInstallationId,
  licenseKeyHashes,
  maskLicenseKey,
  loadPublicKey,
  verifyToken,
  verifyEnvelope,
  checkBinding,
  decide,
  snapInterval,
  type TokenClaims,
  type LicenseDecision,
} from './license-core.ts';
import { BAKED_LICENSE_CONFIG } from './license-config.ts';

/* ------------------------------------------------------------ schema (DDL) */

export const LICENSE_TABLES: Array<{ name: string; ddl: string }> = [
  {
    name: 'license_state',
    ddl: `CREATE TABLE IF NOT EXISTS \`license_state\` (
      \`id\` tinyint(4) NOT NULL,
      \`installation_id\` char(64) NOT NULL,
      \`license_key_enc\` text DEFAULT NULL,
      \`license_key_mask\` varchar(64) DEFAULT NULL,
      \`token\` text DEFAULT NULL,
      \`token_jti\` varchar(128) DEFAULT NULL,
      \`domain\` varchar(191) DEFAULT NULL,
      \`product_slug\` varchar(100) DEFAULT NULL,
      \`product_name\` varchar(191) DEFAULT NULL,
      \`public_key\` varchar(600) DEFAULT NULL,
      \`key_id\` varchar(64) DEFAULT NULL,
      \`ever_activated\` tinyint(1) NOT NULL DEFAULT 0,
      \`requires_activation\` tinyint(1) NOT NULL DEFAULT 0,
      \`activated_at\` bigint(20) DEFAULT NULL,
      \`last_sync_at\` bigint(20) DEFAULT NULL,
      \`last_attempt_at\` bigint(20) DEFAULT NULL,
      \`next_check_at\` bigint(20) DEFAULT NULL,
      \`last_result\` varchar(255) DEFAULT NULL,
      \`last_error\` varchar(255) DEFAULT NULL,
      \`server_reachable\` tinyint(1) DEFAULT NULL,
      \`consecutive_failures\` int(11) NOT NULL DEFAULT 0,
      \`backoff_until\` bigint(20) DEFAULT NULL,
      \`updated_at\` bigint(20) DEFAULT NULL,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'license_events',
    ddl: `CREATE TABLE IF NOT EXISTS \`license_events\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`event\` varchar(40) NOT NULL,
      \`level\` varchar(10) NOT NULL DEFAULT 'info',
      \`message\` varchar(500) DEFAULT NULL,
      \`http_status\` int(11) DEFAULT NULL,
      \`ip_address\` varchar(64) DEFAULT NULL,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      KEY \`idx_license_events_created\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
];

/* ------------------------------------------------------------------ types */

interface SessionLike {
  sub: string;
  role: 'admin' | 'staff' | 'customer';
}

export interface LicenseDeps {
  db: any;
  readSession: (token?: string | null) => SessionLike | null;
  getBearer: (req: express.Request) => string | null;
  requireRole: (...roles: Array<'admin' | 'staff' | 'customer'>) => express.RequestHandler;
  clientIp: (req: express.Request) => string;
  appVersion: string;
  /** header value that marks the server's own internal order call */
  internalOrderKey: string;
  /** used to encrypt the stored license key at rest */
  secret: string;
  notifyAdmin?: (type: string, title: string, body: string, linkTab?: string) => Promise<void>;
}

interface Row {
  id: number;
  installation_id: string;
  license_key_enc: string | null;
  license_key_mask: string | null;
  token: string | null;
  token_jti: string | null;
  domain: string | null;
  product_slug: string | null;
  product_name: string | null;
  public_key: string | null;
  key_id: string | null;
  ever_activated: number;
  requires_activation: number;
  activated_at: number | null;
  last_sync_at: number | null;
  last_attempt_at: number | null;
  next_check_at: number | null;
  last_result: string | null;
  last_error: string | null;
  server_reachable: number | null;
  consecutive_failures: number;
  backoff_until: number | null;
}

type HttpOutcome =
  | { kind: 'network'; error: string }
  | { kind: 'timeout'; error: string }
  | { kind: 'http'; status: number; body: any; retryAfterMs?: number };

export interface Evaluation {
  decision: LicenseDecision;
  claims: TokenClaims | null;
  row: Row | null;
}

/* ----------------------------------------------------------------- config */

const REQUIRED_ENV = ['LICENSE_SERVER_URL', 'LICENSE_PRODUCT_SLUG'] as const;

function licenseConfig() {
  const env = process.env;
  const serverUrl = String(BAKED_LICENSE_CONFIG.serverUrl || env.LICENSE_SERVER_URL || '').trim().replace(/\/+$/, '');
  const productSlugs = String(BAKED_LICENSE_CONFIG.productSlug || env.LICENSE_PRODUCT_SLUG || '')
    .split(/[\s,;]+/)
    .map((slug) => slug.trim())
    .filter(Boolean);
  return {
    serverUrl,
    productSlugs,
    productType: env.LICENSE_PRODUCT_TYPE === undefined ? 'ecommerce_pos' : String(env.LICENSE_PRODUCT_TYPE).trim(),
    publicKey: String(BAKED_LICENSE_CONFIG.publicKey || env.LICENSE_PUBLIC_KEY || '').trim(),
    keyId: String(BAKED_LICENSE_CONFIG.keyId || env.LICENSE_KEY_ID || '').trim(),
    timeoutMs: Math.max(2000, Math.min(60000, Number(env.LICENSE_HTTP_TIMEOUT_MS) || 15000)),
    support: {
      name: String(env.LICENSE_SUPPORT_NAME || '').trim(),
      email: String(env.LICENSE_SUPPORT_EMAIL || '').trim(),
      phone: String(env.LICENSE_SUPPORT_PHONE || '').trim(),
      url: String(env.LICENSE_SUPPORT_URL || '').trim(),
    },
  };
}

/** The License Server must be https, except a local test server */
function serverUrlProblem(url: string): string {
  if (!url) return 'LICENSE_SERVER_URL is not set.';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'LICENSE_SERVER_URL is not a valid address.';
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) return 'LICENSE_SERVER_URL must start with https://';
  return '';
}

/* ----------------------------------------------------------------- service */

export function createLicenseService(deps: LicenseDeps) {
  const { db } = deps;
  const rowsOf = (result: any): any[] => (Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : []);

  /* ------------------------------------------------ license key at rest */
  const cipherKey = () => crypto.createHash('sha256').update(`license-key:v1:${deps.secret}`).digest();
  const encryptKey = (plain: string) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`;
  };
  const decryptKey = (stored: string | null): string | null => {
    if (!stored) return null;
    try {
      const [version, iv, tag, body] = stored.split(':');
      if (version !== 'v1') return null;
      const decipher = crypto.createDecipheriv('aes-256-gcm', cipherKey(), Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      return null; // SESSION_SECRET changed: the key must be entered again (the token keeps working)
    }
  };

  /* ------------------------------------------------------------- storage */
  let cache: { at: number; row: Row | null } = { at: 0, row: null };
  const verifyCache = new Map<string, ReturnType<typeof verifyToken>>();

  async function ensureTables() {
    for (const table of LICENSE_TABLES) {
      await db.execute(sql.raw(table.ddl));
    }
  }

  async function readRow(): Promise<Row | null> {
    const found = rowsOf(await db.execute(sql`SELECT * FROM license_state WHERE id = 1`))[0];
    if (found) return normalizeRow(found);
    // First run: this install gets its permanent, random installation id
    await db.execute(sql`INSERT IGNORE INTO license_state (id, installation_id, updated_at)
      VALUES (1, ${newInstallationId()}, ${Date.now()})`);
    const created = rowsOf(await db.execute(sql`SELECT * FROM license_state WHERE id = 1`))[0];
    return created ? normalizeRow(created) : null;
  }

  function normalizeRow(raw: any): Row {
    const num = (value: any) => (value === null || value === undefined ? null : Number(value));
    return {
      ...raw,
      id: Number(raw.id),
      ever_activated: Number(raw.ever_activated) || 0,
      requires_activation: Number(raw.requires_activation) || 0,
      consecutive_failures: Number(raw.consecutive_failures) || 0,
      activated_at: num(raw.activated_at),
      last_sync_at: num(raw.last_sync_at),
      last_attempt_at: num(raw.last_attempt_at),
      next_check_at: num(raw.next_check_at),
      backoff_until: num(raw.backoff_until),
      server_reachable: raw.server_reachable === null || raw.server_reachable === undefined ? null : Number(raw.server_reachable),
    };
  }

  async function getRow(force = false): Promise<Row | null> {
    if (!force && cache.row && Date.now() - cache.at < 30_000) return cache.row;
    let row: Row | null;
    try {
      row = await readRow();
    } catch (error: any) {
      if (!/doesn't exist|no such table|ER_NO_SUCH_TABLE/i.test(String(error?.message || error?.cause?.message || ''))) throw error;
      await ensureTables();
      row = await readRow();
    }
    cache = { at: Date.now(), row };
    return row;
  }

  async function update(patch: Record<string, any>) {
    const entries = Object.entries({ ...patch, updated_at: Date.now() });
    const sets = sql.join(
      entries.map(([column, value]) => sql`${sql.raw(`\`${column}\``)} = ${value === undefined ? null : value}`),
      sql`, `
    );
    await db.execute(sql`UPDATE license_state SET ${sets} WHERE id = 1`);
    cache.at = 0;
  }

  async function logEvent(event: string, level: 'info' | 'warn' | 'error', message: string, httpStatus?: number | null, ip?: string) {
    try {
      await db.execute(sql`INSERT INTO license_events (event, level, message, http_status, ip_address)
        VALUES (${event}, ${level}, ${message.slice(0, 500)}, ${httpStatus ?? null}, ${ip || null})`);
      if (Math.random() < 0.05) {
        await db.execute(sql`DELETE FROM license_events WHERE id < (SELECT m FROM (SELECT MAX(id) - 500 AS m FROM license_events) AS t)`);
      }
    } catch {
      /* logging never breaks licensing */
    }
    if (level !== 'info') console.warn(`[license] ${event}: ${message}`);
  }

  /* ---------------------------------------------------------- public key */
  function keyInfo(row: Row | null): { key: crypto.KeyObject; keyId: string; source: 'config' | 'pinned' } | null {
    const cfg = licenseConfig();
    try {
      if (cfg.publicKey) return { key: loadPublicKey(cfg.publicKey), keyId: cfg.keyId || row?.key_id || '', source: 'config' };
      if (row?.public_key) return { key: loadPublicKey(row.public_key), keyId: row.key_id || '', source: 'pinned' };
    } catch (error: any) {
      console.error('[license] public key unusable:', error?.message || error);
    }
    return null;
  }

  /** Section 1: fetch once and pin, only when no key is configured */
  async function ensurePublicKey(row: Row): Promise<{ ok: boolean; error?: string }> {
    if (keyInfo(row)) return { ok: true };
    const cfg = licenseConfig();
    const outcome = await http('GET', '/api/v2/license/public-key');
    if (outcome.kind !== 'http' || outcome.status !== 200) {
      return { ok: false, error: 'Could not download the License Server public key. Check LICENSE_SERVER_URL, or set LICENSE_PUBLIC_KEY.' };
    }
    const body = outcome.body || {};
    if (body.algorithm !== 'Ed25519' || typeof body.publicKey !== 'string') return { ok: false, error: 'The License Server did not return an Ed25519 public key.' };
    try {
      loadPublicKey(body.publicKey);
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
    await update({ public_key: body.publicKey, key_id: String(body.keyId || '') });
    await logEvent('public_key_pinned', 'info', `Public key ${body.keyId || ''} downloaded from ${new URL(cfg.serverUrl).host} and pinned.`);
    return { ok: true };
  }

  /* ---------------------------------------------------------------- http */
  async function http(method: 'GET' | 'POST', path: string, body?: any): Promise<HttpOutcome> {
    const cfg = licenseConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const response = await fetch(`${cfg.serverUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': `ecommerce-pos/${deps.appVersion}` },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      const retryAfterMs =
        response.status === 429
          ? Number(parsed?.retryAfterMs) || (Number(response.headers.get('retry-after')) || 60) * 1000
          : undefined;
      return { kind: 'http', status: response.status, body: parsed, retryAfterMs };
    } catch (error: any) {
      if (error?.name === 'AbortError') return { kind: 'timeout', error: `No answer within ${Math.round(cfg.timeoutMs / 1000)} s` };
      return { kind: 'network', error: String(error?.cause?.code || error?.message || error) };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ------------------------------------------------------------- reports */
  const lastReport = new Map<string, number>();
  function report(reason: string, details: string, domain?: string) {
    const key = `${reason}:${domain || ''}`;
    const last = lastReport.get(key) || 0;
    if (Date.now() - last < 6 * 3600_000) return;
    lastReport.set(key, Date.now());
    void (async () => {
      try {
        const row = await getRow();
        const cfg = licenseConfig();
        if (!cfg.serverUrl || serverUrlProblem(cfg.serverUrl) || !row) return;
        await http('POST', '/api/v2/license/report', {
          licenseKey: decryptKey(row.license_key_enc) || '',
          domain: domain || row.domain || '',
          installationId: row.installation_id,
          reason,
          details: details.slice(0, 1000),
        });
        await logEvent('report_sent', 'warn', `Reported "${reason}" to the License Server: ${details.slice(0, 200)}`);
      } catch {
        /* fire-and-forget */
      }
    })();
  }

  /* ---------------------------------------------------------- evaluation */
  function verifyCached(token: string, key: crypto.KeyObject, keyId: string) {
    const cacheKey = `${keyId}|${token}`;
    let hit = verifyCache.get(cacheKey);
    if (!hit) {
      hit = verifyToken(token, key, keyId || undefined);
      if (verifyCache.size > 20) verifyCache.clear();
      verifyCache.set(cacheKey, hit);
    }
    return hit;
  }

  const acceptedSlugs = (row: Row | null) => {
    const configured = licenseConfig().productSlugs;
    return configured.length > 0 ? configured : row?.product_slug ? [row.product_slug] : [];
  };

  const locked = (state: 'unlicensed' | 'invalid', code: string, message: string): LicenseDecision => ({
    state,
    operational: false,
    code,
    message,
    blockAt: 0,
    daysLeft: null,
    scheduledOnly: false,
  });

  /** The license as this install knows it, right now — no network involved */
  async function evaluate(force = false): Promise<Evaluation> {
    const row = await getRow(force);
    if (!row) return { row, claims: null, decision: locked('unlicensed', 'no_state', 'The license record could not be read.') };
    if (!row.token) {
      return {
        row,
        claims: null,
        decision: row.ever_activated
          ? locked('unlicensed', 'deactivated', 'This installation is not activated. Activate a license to continue.')
          : locked('unlicensed', 'never_activated', 'No license has been activated on this installation yet.'),
      };
    }
    if (row.requires_activation) {
      return {
        row,
        claims: null,
        decision: locked('invalid', 'require_activation', 'The License Server asked for this site to be activated again.'),
      };
    }
    const info = keyInfo(row);
    if (!info) return { row, claims: null, decision: locked('invalid', 'no_public_key', 'The License Server public key is missing.') };
    const verified = verifyCached(row.token, info.key, info.keyId);
    if (!verified.ok || !verified.claims) {
      report('signature_mismatch', `Stored license token failed verification (${verified.error}).`);
      return { row, claims: null, decision: locked('invalid', verified.error || 'invalid_token', 'The stored license token failed verification. Activate the license again.') };
    }
    const binding = checkBinding(verified.claims, {
      domain: row.domain || '',
      installationId: row.installation_id,
      productSlugs: acceptedSlugs(row),
      productType: licenseConfig().productType,
    });
    if (!binding.ok) {
      if (binding.error === 'domain_mismatch' || binding.error === 'installation_mismatch') {
        report(binding.error, `Stored token is bound to ${verified.claims.dom}/${String(verified.claims.iid || '').slice(0, 12)}…, install is ${row.domain}/${row.installation_id.slice(0, 12)}…`);
      }
      const words: Record<string, string> = {
        domain_mismatch: 'The license token belongs to a different domain.',
        installation_mismatch: 'The license token belongs to a different installation.',
        product_mismatch: 'The license token is for a different product.',
        product_type_mismatch: 'The license token is for a different kind of product.',
        missing_jti: 'The license token is incomplete.',
        unsupported_token_version: 'The license token version is not supported.',
      };
      return { row, claims: verified.claims, decision: locked('invalid', binding.error || 'binding', words[binding.error || ''] || 'The license token does not match this installation.') };
    }
    return { row, claims: verified.claims, decision: decide(verified.claims, Date.now() / 1000) };
  }

  /**
   * Verifies a token that just arrived, against THIS install, before it may
   * replace the stored one.
   */
  function acceptIncomingToken(token: string, row: Row, info: { key: crypto.KeyObject; keyId: string }, payloadJti?: string, domain?: string) {
    const verified = verifyToken(token, info.key, info.keyId || undefined);
    if (!verified.ok || !verified.claims) return { ok: false as const, error: verified.error || 'invalid_token' };
    if (payloadJti !== undefined && payloadJti !== verified.claims.jti) return { ok: false as const, error: 'jti_mismatch' };
    const binding = checkBinding(verified.claims, {
      domain: domain || row.domain || '',
      installationId: row.installation_id,
      productSlugs: acceptedSlugs(row),
      productType: licenseConfig().productType,
    });
    if (!binding.ok) return { ok: false as const, error: binding.error || 'binding', claims: verified.claims };
    return { ok: true as const, claims: verified.claims };
  }

  const nextCheckFrom = (claims: TokenClaims) => {
    const nchk = Number(claims.nchk) || 0;
    if (nchk > 0) return nchk;
    const base = Number(claims.sync) || Number(claims.iat) || Math.floor(Date.now() / 1000);
    return base + snapInterval(claims.vi) * 86400;
  };

  async function recordFailure(outcome: HttpOutcome, action: string, note?: string) {
    const row = await getRow(true);
    const failures = (row?.consecutive_failures || 0) + 1;
    const reachable = outcome.kind === 'http';
    let delay = Math.min(12 * 3600_000, 5 * 60_000 * 2 ** Math.min(failures - 1, 8));
    if (outcome.kind === 'http' && outcome.status === 429 && outcome.retryAfterMs) {
      delay = Math.max(1000, Math.min(24 * 3600_000, outcome.retryAfterMs)); // back off exactly retryAfterMs
    }
    const what =
      note ||
      (outcome.kind === 'http'
        ? outcome.status === 429
          ? 'License Server rate limit (429)'
          : `License Server error (HTTP ${outcome.status})`
        : outcome.kind === 'timeout'
        ? `License Server timed out (${outcome.error})`
        : `License Server unreachable (${outcome.error})`);
    await update({
      consecutive_failures: failures,
      backoff_until: Date.now() + delay,
      last_attempt_at: Date.now(),
      last_error: what.slice(0, 255),
      server_reachable: reachable ? 1 : 0,
    });
    await logEvent(`${action}_retry`, 'warn', `${what}. License unchanged; next try in ${Math.round(delay / 60000)} min.`, outcome.kind === 'http' ? outcome.status : null);
  }

  /* ------------------------------------------------------------ activate */
  async function activate(licenseKeyRaw: string, requestDomain: string, ip: string) {
    const licenseKey = String(licenseKeyRaw || '').trim();
    const cfg = licenseConfig();
    const problem = serverUrlProblem(cfg.serverUrl) || (cfg.productSlugs.length === 0 ? 'LICENSE_PRODUCT_SLUG is not set.' : '');
    if (problem) return { ok: false, status: 400, error: `License settings incomplete: ${problem}` };
    if (!licenseKey || licenseKey.length > 200) return { ok: false, status: 400, error: 'Enter your license key.' };
    const domain = normalizeDomain(requestDomain);
    if (!domain) return { ok: false, status: 400, error: 'Could not work out this site’s domain.' };

    let row = await getRow(true);
    if (!row) return { ok: false, status: 500, error: 'The license record could not be created.' };
    const keyReady = await ensurePublicKey(row);
    if (!keyReady.ok) return { ok: false, status: 502, error: keyReady.error };
    row = (await getRow(true)) as Row;
    const info = keyInfo(row)!;

    const nonce = newNonce();
    const outcome = await http('POST', '/api/v2/license/activate', {
      licenseKey,
      domain,
      installationId: row.installation_id,
      productSlug: cfg.productSlugs[0],
      pluginVersion: deps.appVersion,
      platform: 'pos',
      nonce,
    });

    if (outcome.kind !== 'http') {
      await update({ last_attempt_at: Date.now(), last_error: outcome.error.slice(0, 255), server_reachable: 0 });
      await logEvent('activate_unreachable', 'warn', `Activation could not reach the License Server: ${outcome.error}`, null, ip);
      return { ok: false, status: 503, error: 'The License Server could not be reached. Check the internet connection and try again.' };
    }
    if (outcome.status === 429) {
      const seconds = Math.ceil((outcome.retryAfterMs || 60000) / 1000);
      await logEvent('activate_rate_limited', 'warn', `Activation rate-limited; retry after ${seconds}s.`, 429, ip);
      return { ok: false, status: 429, error: `Too many activation attempts. Try again in ${seconds} seconds.`, retryAfter: seconds };
    }
    if (outcome.status >= 500) {
      await logEvent('activate_server_error', 'warn', `License Server error during activation (HTTP ${outcome.status}).`, outcome.status, ip);
      return { ok: false, status: 502, error: 'The License Server had a problem. Please try again in a few minutes.' };
    }

    const body = outcome.body || {};
    const envelope = verifyEnvelope(body.signed, info.key, { nonce, act: 'activate', keyId: info.keyId || undefined });
    if (!envelope.ok || !envelope.payload) {
      await logEvent('activate_bad_signature', 'error', `Activation answer rejected: ${envelope.error}.`, outcome.status, ip);
      report('response_signature_mismatch', `Activation response failed verification (${envelope.error}).`, domain);
      return { ok: false, status: 502, error: 'The answer from the License Server could not be verified, so it was ignored.' };
    }
    const payload = envelope.payload;
    const message = String(payload.msg || body.error || body.message || '').slice(0, 300);

    if (outcome.status !== 200 || !payload.ok || !body.token) {
      await logEvent('activate_refused', 'warn', `Activation refused: ${message || `HTTP ${outcome.status}`}`, outcome.status, ip);
      return { ok: false, status: outcome.status >= 400 && outcome.status < 500 ? outcome.status : 400, error: message || 'The License Server refused the activation.' };
    }
    if ((payload.dom && normalizeDomain(payload.dom) !== domain) || (payload.iid && payload.iid !== row.installation_id)) {
      await logEvent('activate_bad_binding', 'error', 'Activation answer was for a different domain or installation.', 200, ip);
      return { ok: false, status: 502, error: 'The License Server answer was for a different site, so it was ignored.' };
    }

    const accepted = acceptIncomingToken(String(body.token), row, info, payload.jti, domain);
    if (!accepted.ok) {
      const words: Record<string, string> = {
        product_mismatch: `This license key is for a different product (${accepted.claims?.pslug || accepted.claims?.slug || 'unknown'}).`,
        product_type_mismatch: 'This license key is for a different kind of product.',
        domain_mismatch: 'The license was issued for a different domain.',
        installation_mismatch: 'The license was issued for a different installation.',
      };
      await logEvent('activate_token_rejected', 'error', `Activation token rejected: ${accepted.error}.`, 200, ip);
      if (!words[accepted.error]) report('signature_mismatch', `Activation token failed verification (${accepted.error}).`, domain);
      return { ok: false, status: 400, error: words[accepted.error] || 'The license token could not be verified, so it was not saved.' };
    }
    const claims = accepted.claims;
    const hashes = licenseKeyHashes(licenseKey);
    if (claims.lkh && !hashes.includes(String(claims.lkh))) {
      await logEvent('activate_key_hash', 'warn', 'Token key hash does not match the entered key.', 200, ip);
    }

    await update({
      license_key_enc: encryptKey(licenseKey),
      license_key_mask: maskLicenseKey(licenseKey),
      token: String(body.token),
      token_jti: claims.jti,
      domain,
      product_slug: String(claims.pslug || claims.slug || cfg.productSlugs[0]),
      product_name: String(body.license?.product?.name || '').slice(0, 191) || null,
      ever_activated: 1,
      requires_activation: 0,
      activated_at: Date.now(),
      last_sync_at: Date.now(),
      last_attempt_at: Date.now(),
      next_check_at: nextCheckFrom(claims),
      last_result: 'Activated',
      last_error: null,
      server_reachable: 1,
      consecutive_failures: 0,
      backoff_until: null,
    });
    const ev = await evaluate(true);
    await logEvent('activated', 'info', `License activated for ${domain} (${ev.decision.state}).`, 200, ip);
    return { ok: true, status: 200, message: message || 'License activated.' };
  }

  /* ---------------------------------------------------------------- sync */
  let syncing: Promise<any> | null = null;

  function sync(trigger: 'scheduled' | 'manual' | 'key') {
    if (!syncing) {
      syncing = runSync(trigger).finally(() => {
        syncing = null;
      });
    }
    return syncing;
  }

  async function runSync(trigger: string): Promise<{ ok: boolean; changed: boolean; message: string }> {
    const cfg = licenseConfig();
    const row = await getRow(true);
    if (!row?.token) return { ok: false, changed: false, message: 'No license is activated.' };
    if (serverUrlProblem(cfg.serverUrl)) return { ok: false, changed: false, message: serverUrlProblem(cfg.serverUrl) };
    const licenseKey = decryptKey(row.license_key_enc);
    if (!licenseKey) {
      await update({ last_attempt_at: Date.now(), last_error: 'License key must be entered again before the next check.' });
      return { ok: false, changed: false, message: 'Enter the license key again so this install can check in.' };
    }
    const info = keyInfo(row);
    if (!info) return { ok: false, changed: false, message: 'The License Server public key is missing.' };

    const nonce = newNonce();
    const outcome = await http('POST', '/api/v2/license/sync', {
      licenseKey,
      domain: row.domain,
      installationId: row.installation_id,
      productSlug: acceptedSlugs(row)[0] || row.product_slug,
      pluginVersion: deps.appVersion,
      nonce,
    });

    // Contract rule, no exceptions: network error, timeout, any 5xx or 429 → change nothing
    if (outcome.kind !== 'http' || outcome.status === 429 || outcome.status >= 500) {
      await recordFailure(outcome, 'sync');
      return { ok: false, changed: false, message: 'The License Server could not be reached. The license is unchanged; it will try again later.' };
    }

    const body = outcome.body || {};
    const envelope = verifyEnvelope(body.signed, info.key, { nonce, act: 'sync', keyId: info.keyId || undefined });
    if (!envelope.ok || !envelope.payload) {
      await recordFailure(outcome, 'sync', `Unverified answer from the License Server (${envelope.error})`);
      report('response_signature_mismatch', `Sync response failed verification (${envelope.error}, HTTP ${outcome.status}).`);
      return { ok: false, changed: false, message: 'The answer from the License Server could not be verified, so it was ignored.' };
    }
    const payload = envelope.payload;
    const bound = (!payload.dom || normalizeDomain(payload.dom) === row.domain) && (!payload.iid || payload.iid === row.installation_id);

    if (outcome.status === 403 && payload.require_activation === true && bound) {
      await update({
        requires_activation: 1,
        last_attempt_at: Date.now(),
        last_result: 'Activation required',
        last_error: String(payload.msg || body.error || '').slice(0, 255) || null,
        server_reachable: 1,
        consecutive_failures: 0,
        backoff_until: null,
      });
      await logEvent('require_activation', 'error', `License Server: ${payload.msg || body.error || 'activation required'}`, 403);
      await deps.notifyAdmin?.('license', 'License needs activating again', String(payload.msg || body.error || 'The License Server asked this site to activate its license again.'), 'license');
      return { ok: false, changed: true, message: String(payload.msg || body.error || 'Activation required.') };
    }

    if (outcome.status === 200 && body.token && bound) {
      const accepted = acceptIncomingToken(String(body.token), row, info, payload.jti);
      if (!accepted.ok) {
        await recordFailure(outcome, 'sync', `Sync token rejected (${accepted.error})`);
        report('signature_mismatch', `Sync token failed local verification (${accepted.error}).`);
        return { ok: false, changed: false, message: 'The new license token could not be verified, so the previous one is kept.' };
      }
      const before = (await evaluate()).decision;
      // Stored even when success=false: a revocation carries its own signed countdown
      await update({
        token: String(body.token),
        token_jti: accepted.claims.jti,
        last_sync_at: Date.now(),
        last_attempt_at: Date.now(),
        next_check_at: nextCheckFrom(accepted.claims),
        last_result: String(payload.msg || body.message || (payload.ok ? 'License verified.' : 'License state updated.')).slice(0, 255),
        last_error: null,
        server_reachable: 1,
        consecutive_failures: 0,
        backoff_until: null,
      });
      const after = (await evaluate(true)).decision;
      await logEvent(payload.ok ? 'synced' : 'sync_enforcement', payload.ok ? 'info' : 'warn', `${trigger} check: ${after.message}`, 200);
      if (after.state !== before.state && after.state !== 'active') {
        await deps.notifyAdmin?.('license', after.state === 'blocked' ? 'License blocked' : 'License warning', after.message, 'license');
      }
      return { ok: true, changed: true, message: after.message };
    }

    // 400 and anything else: nothing may change
    await recordFailure(outcome, 'sync', `License Server answered HTTP ${outcome.status}: ${payload.msg || body.error || 'no token'}`);
    return { ok: false, changed: false, message: String(payload.msg || body.error || 'The License Server did not send a new token.') };
  }

  /* ---------------------------------------------------------- deactivate */
  async function deactivate(ip: string) {
    const row = await getRow(true);
    if (!row?.token) return { ok: false, status: 400, error: 'No license is active on this installation.' };
    const licenseKey = decryptKey(row.license_key_enc);
    if (!licenseKey) return { ok: false, status: 400, error: 'Enter the license key again first.' };
    const info = keyInfo(row);
    if (!info) return { ok: false, status: 400, error: 'The License Server public key is missing.' };
    const nonce = newNonce();
    const outcome = await http('POST', '/api/v2/license/deactivate', {
      licenseKey,
      domain: row.domain,
      installationId: row.installation_id,
      nonce,
    });
    if (outcome.kind !== 'http' || outcome.status === 429 || outcome.status >= 500) {
      await logEvent('deactivate_failed', 'warn', 'Deactivation could not reach the License Server; nothing changed.', outcome.kind === 'http' ? outcome.status : null, ip);
      return { ok: false, status: 503, error: 'The License Server could not be reached. Nothing was changed — try again later.' };
    }
    const envelope = verifyEnvelope(outcome.body?.signed, info.key, { nonce, act: 'deactivate', keyId: info.keyId || undefined });
    if (!envelope.ok || !envelope.payload) {
      report('response_signature_mismatch', `Deactivation response failed verification (${envelope.error}).`);
      return { ok: false, status: 502, error: 'The answer from the License Server could not be verified, so nothing was changed.' };
    }
    if (outcome.status !== 200 || !envelope.payload.ok) {
      return { ok: false, status: 400, error: String(envelope.payload.msg || outcome.body?.error || 'The License Server refused the deactivation.') };
    }
    await update({
      token: null,
      token_jti: null,
      requires_activation: 0,
      next_check_at: null,
      last_result: 'Deactivated — seat released',
      last_attempt_at: Date.now(),
      last_error: null,
      server_reachable: 1,
      consecutive_failures: 0,
      backoff_until: null,
    });
    await logEvent('deactivated', 'warn', `Installation deactivated and seat released (${envelope.payload.msg || 'ok'}).`, 200, ip);
    return { ok: true, status: 200, message: String(envelope.payload.msg || 'License deactivated and seat released.') };
  }

  /**
   * v3.9 — the site (files + database) was copied or restored onto a NEW
   * domain. The copied record still carries the old site's domain, token and
   * installation id, so the dashboard here is locked to the old address. This
   * gives the copy its own installation id and activates the key entered for
   * the new domain. The old website keeps its own license untouched. If the
   * activation is refused, the record is put back exactly as it was.
   */
  let movingDomain: Promise<any> | null = null;
  async function activateForNewDomain(licenseKeyRaw: string, requestDomain: string, ip: string): Promise<any> {
    // One at a time: a double click must not snapshot an already-cleared record
    if (movingDomain) return { ok: false, status: 429, error: 'An activation is already running. Please wait a moment.' };
    movingDomain = moveToDomain(licenseKeyRaw, requestDomain, ip).finally(() => {
      movingDomain = null;
    });
    return movingDomain;
  }

  async function moveToDomain(licenseKeyRaw: string, requestDomain: string, ip: string) {
    const domain = normalizeDomain(requestDomain);
    if (!domain) return { ok: false, status: 400, error: 'Could not work out this site’s domain.' };
    const row = await getRow(true);
    if (!row) return { ok: false, status: 500, error: 'The license record could not be read.' };
    const current = await evaluate(true);
    if (row.domain === domain && current.decision.operational) {
      return { ok: false, status: 400, error: `This website is already licensed for ${domain}.` };
    }
    const snapshot = {
      installation_id: row.installation_id,
      license_key_enc: row.license_key_enc,
      license_key_mask: row.license_key_mask,
      token: row.token,
      token_jti: row.token_jti,
      domain: row.domain,
      product_slug: row.product_slug,
      product_name: row.product_name,
      ever_activated: row.ever_activated,
      requires_activation: row.requires_activation,
      activated_at: row.activated_at,
      last_sync_at: row.last_sync_at,
      next_check_at: row.next_check_at,
      last_result: row.last_result,
      last_error: row.last_error,
      consecutive_failures: row.consecutive_failures,
      backoff_until: row.backoff_until,
    };
    const fresh = newInstallationId();
    await update({
      installation_id: fresh,
      license_key_enc: null,
      license_key_mask: null,
      token: null,
      token_jti: null,
      domain: null,
      requires_activation: 0,
      activated_at: null,
      last_sync_at: null,
      next_check_at: null,
      consecutive_failures: 0,
      backoff_until: null,
      last_error: null,
    });
    verifyCache.clear();
    let result: Awaited<ReturnType<typeof activate>>;
    try {
      result = await activate(licenseKeyRaw, domain, ip);
    } catch (error) {
      // Anything unexpected: put the record back exactly as it was
      await update(snapshot);
      verifyCache.clear();
      throw error;
    }
    if (!result.ok) {
      await update(snapshot);
      verifyCache.clear();
      return result;
    }
    await logEvent(
      'moved_to_new_domain',
      'warn',
      `New installation for ${domain}${snapshot.domain ? ` (copied from ${snapshot.domain})` : ''}; the old site keeps its own license.`,
      200,
      ip
    );
    return { ...result, message: `License activated for ${domain}.` };
  }

  /** The stored key could not be decrypted (SESSION_SECRET changed) — enter it again */
  async function reenterKey(licenseKeyRaw: string, ip: string) {
    const licenseKey = String(licenseKeyRaw || '').trim();
    const ev = await evaluate(true);
    if (!ev.row?.token || !ev.claims) return { ok: false, status: 400, error: 'Activate the license instead.' };
    if (ev.claims.lkh && !licenseKeyHashes(licenseKey).includes(String(ev.claims.lkh))) {
      return { ok: false, status: 400, error: 'That is not the key this installation was activated with.' };
    }
    await update({ license_key_enc: encryptKey(licenseKey), license_key_mask: maskLicenseKey(licenseKey), last_error: null });
    await logEvent('key_reentered', 'info', 'License key entered again.', null, ip);
    return { ok: true, status: 200, message: 'License key saved.' };
  }

  /* ----------------------------------------------------------- scheduler */
  let timers: NodeJS.Timeout[] = [];
  async function tick() {
    try {
      const row = await getRow(true);
      if (!row?.token || row.requires_activation) return;
      const now = Date.now();
      if (row.backoff_until && now < row.backoff_until) return;
      const due = row.next_check_at ? now / 1000 >= row.next_check_at : now - (row.last_sync_at || 0) >= 7 * 86400_000;
      if (due) await sync('scheduled');
    } catch (error: any) {
      console.error('[license] scheduled check failed:', error?.message || error);
    }
  }
  function start() {
    timers.forEach(clearTimeout);
    timers = [setTimeout(tick, 20_000), setInterval(tick, 10 * 60_000)];
    timers.forEach((timer) => timer.unref?.());
  }

  /* ---------------------------------------------------------------- gate */
  const EXEMPT = [
    /^\/api\/license(\/|$)/, // this integration's own endpoints (owner-only inside)
    /^\/api\/auth(\/|$)/, // sign-in, session, password recovery, owner credentials
    /^\/api\/health$/,
    /^\/api\/access-check$/,
    /^\/api\/maintenance\/status$/,
  ];
  /**
   * Back-office surfaces: always licensed, whoever calls them. The storefront
   * (browsing, checkout, courier webhooks) is never locked by the license —
   * only the dashboard and the POS are.
   */
  const BACKOFFICE = [
    /^\/api\/admin(\/|$)/,
    /^\/api\/pos(\/|$)/,
    /^\/api\/dashboard(\/|$)/,
    /^\/api\/media(\/|$)/,
  ];
  /** Storefront actions that need a license (none: checkout always stays open) */
  const COMMERCE: Array<[string, RegExp]> = [];
  /** Storefront reads an admin may make while browsing the shop */
  const PUBLIC_READS = [
    /^\/api\/settings$/,
    /^\/api\/cache-version$/,
    /^\/api\/(products|categories|brands|banners|generics)(\/|$)/,
    /^\/api\/orders\/track$/,
    /^\/api\/orders\/[^/]+\/invoice$/,
    /^\/api\/account(\/|$)/,
    /^\/api\/(blog|reviews|size-guides|review-images|lp|landing)(\/|$)/,
  ];

  type Kind = 'exempt' | 'public' | 'backoffice' | 'commerce';
  function classify(req: express.Request): Kind {
    // Express matches routes case-insensitively, so "/API/Admin/..." reaches the
    // same handler as "/api/admin/..." — classify on the lower-cased path.
    const path = req.path.toLowerCase();
    if (EXEMPT.some((re) => re.test(path))) return 'exempt';
    if (BACKOFFICE.some((re) => re.test(path))) return 'backoffice';
    if (COMMERCE.some(([method, re]) => req.method === method && re.test(path))) return 'commerce';
    const session = deps.readSession(deps.getBearer(req));
    if (session && (session.role === 'admin' || session.role === 'staff')) {
      if ((req.method === 'GET' || req.method === 'HEAD') && PUBLIC_READS.some((re) => re.test(path))) return 'public';
      // Anything else an admin/staff session does is back-office work —
      // including endpoints that do not exist yet.
      return 'backoffice';
    }
    return 'public';
  }

  const requestHost = (req: express.Request) =>
    normalizeDomain(String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0]);

  function deny(res: express.Response, kind: Kind, code: string, message: string, state: string) {
    if (kind === 'commerce') {
      return res.status(503).json({ error: 'Online ordering is not available right now. Please contact the shop.', code, licenseState: state });
    }
    return res.status(403).json({ error: message, code, licenseState: state });
  }

  const gate: express.RequestHandler = (req, res, next) => {
    if (!req.path.toLowerCase().startsWith('/api/')) return next();
    const kind = classify(req);
    if (kind === 'exempt' || kind === 'public') return next();
    evaluate()
      .then((ev) => {
        const { decision, row } = ev;
        if (!decision.operational) {
          const code = decision.state === 'blocked' ? 'LICENSE_BLOCKED' : decision.state === 'invalid' ? 'LICENSE_INVALID' : 'LICENSE_REQUIRED';
          return deny(res, kind, code, `License required: ${decision.message}`, decision.state);
        }
        const internal = req.headers['x-internal-order-key'] === deps.internalOrderKey;
        const host = requestHost(req);
        if (!internal && row?.domain && host !== row.domain) {
          report('domain_mismatch', `Request for ${host} on an install licensed to ${row.domain}.`, host);
          void logEvent('domain_mismatch', 'warn', `Blocked a request for ${host}; the license is for ${row.domain}.`, 403, deps.clientIp(req));
          return deny(res, kind, 'LICENSE_DOMAIN_MISMATCH', `This license is for ${row.domain}. Open the dashboard on that address.`, 'invalid');
        }
        next();
      })
      .catch((error: any) => {
        console.error('[license] gate could not evaluate:', error?.message || error);
        deny(res, kind, 'LICENSE_UNAVAILABLE', 'The license could not be checked. Please try again.', 'unknown');
      });
  };

  /* ------------------------------------------------------------- routes */
  function register(app: express.Express) {
    const requireBackoffice = deps.requireRole('admin', 'staff');
    const requireOwner: express.RequestHandler = (req: any, res, next) =>
      deps.requireRole('admin')(req, res, () => {
        if (req.session?.sub !== 'admin_root') {
          return res.status(403).json({ error: 'Only the Super Admin (the owner account) can manage the license.' });
        }
        next();
      });

    // Local brake on top of the server's own limits
    const recent: number[] = [];
    const throttle: express.RequestHandler = (_req, res, next) => {
      const now = Date.now();
      while (recent.length && now - recent[0] > 10 * 60_000) recent.shift();
      if (recent.length >= 15) return res.status(429).json({ error: 'Too many license actions. Wait a few minutes.' });
      recent.push(now);
      next();
    };

    /**
     * Storefront: should the "not activated" notice be shown? Only when this
     * installation has NEVER been activated. It depends on nothing but the
     * local record, so a License Server outage can never make it appear.
     */
    let noticeCache = { at: 0, show: false };
    app.get('/api/license/notice', async (_req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=60');
      try {
        if (Date.now() - noticeCache.at > 60_000) {
          const row = await getRow();
          noticeCache = { at: Date.now(), show: Boolean(row && !row.token && !row.ever_activated) };
        }
        res.json({ show: noticeCache.show });
      } catch {
        res.json({ show: false });
      }
    });

    app.get('/api/license/status', requireBackoffice, async (req: any, res) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const view: any = await statusView(req);
        // Staff see whether the license is fine (the dashboard needs that); the
        // key, the installation and the license server are the owner's business.
        if (req.session?.role !== 'admin') {
          view.keyMasked = '';
          view.installationId = '';
          if (view.server) view.server = { ...view.server, host: '', lastError: '' };
        }
        res.json(view);
      } catch (error: any) {
        res.status(500).json({ error: `Could not read the license: ${error?.message || error}` });
      }
    });

    app.post('/api/license/activate', requireOwner, throttle, async (req, res) => {
      const result = await activate(String(req.body?.licenseKey || ''), requestHost(req), deps.clientIp(req));
      // The storefront notice must disappear right after the first activation
      if (result.ok) noticeCache = { at: 0, show: false };
      res.status(result.ok ? 200 : result.status).json(result.ok ? { success: true, message: result.message, status: await statusView(req) } : { error: result.error, retryAfter: (result as any).retryAfter });
    });

    let lastManual = 0;
    const cooldownMs = Math.max(1, Math.min(3600, Number(process.env.LICENSE_SYNC_COOLDOWN_SECONDS) || 60)) * 1000;
    app.post('/api/license/sync', requireOwner, async (req, res) => {
      if (Date.now() - lastManual < cooldownMs) return res.status(429).json({ error: 'Checked a moment ago. Try again in a minute.' });
      lastManual = Date.now();
      const result = await sync('manual');
      res.status(result.ok ? 200 : 202).json({ success: result.ok, message: result.message, status: await statusView(req) });
    });

    app.post('/api/license/deactivate', requireOwner, throttle, async (req, res) => {
      if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirm the deactivation first.' });
      const result = await deactivate(deps.clientIp(req));
      res.status(result.ok ? 200 : result.status).json(result.ok ? { success: true, message: result.message, status: await statusView(req) } : { error: result.error });
    });

    // v3.9 — the site was moved / restored onto another domain: activate it there as a new installation
    app.post('/api/license/new-domain', requireOwner, throttle, async (req, res) => {
      if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirm first.' });
      const result: any = await activateForNewDomain(String(req.body?.licenseKey || ''), requestHost(req), deps.clientIp(req));
      if (result.ok) noticeCache = { at: 0, show: false };
      res
        .status(result.ok ? 200 : result.status)
        .json(result.ok ? { success: true, message: result.message, status: await statusView(req) } : { error: result.error, retryAfter: result.retryAfter });
    });

    app.post('/api/license/key', requireOwner, throttle, async (req, res) => {
      const result = await reenterKey(String(req.body?.licenseKey || ''), deps.clientIp(req));
      if (result.ok) void sync('key');
      res.status(result.ok ? 200 : result.status).json(result.ok ? { success: true, message: result.message, status: await statusView(req) } : { error: result.error });
    });
  }

  /** What the License page shows. Never the key, the token or any secret. */
  async function statusView(req: any) {
    const cfg = licenseConfig();
    const ev = await evaluate();
    const row = ev.row;
    const claims = ev.claims || ({} as TokenClaims);
    const owner = req.session?.sub === 'admin_root';
    const info = keyInfo(row);
    const missing: string[] = [];
    if (serverUrlProblem(cfg.serverUrl)) missing.push(serverUrlProblem(cfg.serverUrl));
    if (cfg.productSlugs.length === 0) missing.push('LICENSE_PRODUCT_SLUG is not set.');
    let events: any[] = [];
    if (owner) {
      try {
        events = rowsOf(
          await db.execute(sql`SELECT id, event, level, message, http_status AS httpStatus, created_at AS createdAt
            FROM license_events ORDER BY id DESC LIMIT 15`)
        );
      } catch {
        events = [];
      }
    }
    const iid = row?.installation_id || '';
    const lexp = claims.lexp === undefined ? undefined : claims.lexp;
    const host = requestHost(req);
    let serverHost = '';
    try {
      serverHost = cfg.serverUrl ? new URL(cfg.serverUrl).host : '';
    } catch {
      serverHost = '';
    }
    return {
      state: ev.decision.state,
      operational: ev.decision.operational,
      code: ev.decision.code,
      message: ev.decision.message,
      daysLeft: ev.decision.daysLeft,
      blockAt: ev.decision.blockAt ? ev.decision.blockAt * 1000 : null,
      scheduledOnly: ev.decision.scheduledOnly,
      canManage: owner,
      everActivated: Boolean(row?.ever_activated),
      license: ev.claims
        ? {
            status: claims.lst || claims.st || '',
            reason: claims.reason || null,
            product: { slug: claims.pslug || claims.slug || row?.product_slug || '', name: row?.product_name || '', type: claims.ptype || '' },
            type: claims.type || '',
            seats: claims.seats ?? null,
            expiry: lexp === null || lexp === 'Never' ? 'Lifetime' : lexp || (claims.lexp_ts ? new Date(Number(claims.lexp_ts) * 1000).toISOString().slice(0, 10) : ''),
            expiryPolicy: claims.xp || '',
            revoked: claims.rev === true,
            revokedAt: claims.rev_at ? Number(claims.rev_at) * 1000 : null,
            graceEnd: claims.grace_end ? Number(claims.grace_end) * 1000 : null,
            graceDays: claims.grace_days ?? null,
            warnAt: claims.warn_at ? Number(claims.warn_at) * 1000 : null,
            verifyIntervalDays: claims.vi ? snapInterval(claims.vi) : null,
            tokenExpiresAt: claims.exp ? Number(claims.exp) * 1000 : null,
          }
        : null,
      keyMasked: row?.license_key_mask || '',
      keyStored: Boolean(decryptKey(row?.license_key_enc || null)),
      domain: row?.domain || '',
      requestDomain: host,
      domainMatches: !row?.domain || row.domain === host,
      installationId: owner ? iid : iid ? `${iid.slice(0, 6)}••••${iid.slice(-4)}` : '',
      activatedAt: row?.activated_at || null,
      lastSyncAt: row?.last_sync_at || null,
      nextCheckAt: row?.token && row?.next_check_at ? row.next_check_at * 1000 : null,
      lastResult: row?.last_result || '',
      server: {
        host: serverHost,
        reachable: row?.server_reachable === null || row?.server_reachable === undefined ? null : Boolean(row.server_reachable),
        lastAttemptAt: row?.last_attempt_at || null,
        lastError: row?.last_error || '',
        backoffUntil: row?.backoff_until && row.backoff_until > Date.now() ? row.backoff_until : null,
        consecutiveFailures: row?.consecutive_failures || 0,
      },
      config: {
        ready: missing.length === 0,
        missing,
        productSlug: cfg.productSlugs[0] || '',
        publicKeySource: info ? info.source : cfg.publicKey ? 'invalid' : 'not yet downloaded',
        keyId: info?.keyId || '',
        appVersion: deps.appVersion,
      },
      support: cfg.support,
      events,
    };
  }

  return { gate, register, start, evaluate, sync, ensureTables, config: licenseConfig, REQUIRED_ENV };
}
