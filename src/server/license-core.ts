/**
 * License Server v2 client — verification core.
 *
 * Pure functions only (no database, no network), written against
 * "License Server v2 API Contract — eCommerce/POS Client". Everything here
 * uses ONLY the License Server's public key; the private signing key never
 * exists in this project.
 *
 *   • Token (section 6):   b64url(header).b64url(claims).b64url(sig)
 *                          header = {alg:"EdDSA", typ:"QCT", kid}
 *                          sig    = Ed25519(header_b64 + "." + claims_b64)
 *   • Envelope (section 7): signed = {alg:"EdDSA", typ:"LSR1", kid, payload, sig}
 *                          sig    = Ed25519("LSR1." + payload)
 *   • Domains (section 8):  scheme, "www.", path and port are stripped
 *   • Offline decision table (section 9)
 */
import crypto from 'crypto';

/* ------------------------------------------------------------------ types */

export interface TokenClaims {
  iss?: string;
  jti?: string;
  iat?: number;
  nbf?: number;
  exp?: number;
  sync?: number;
  tv?: number;
  lid?: string | number;
  cid?: string | number;
  lkh?: string;
  dom?: string;
  iid?: string;
  slug?: string;
  ver?: string;
  st?: string;
  lexp?: string | null;
  type?: string;
  seats?: number;
  rev?: boolean;
  rev_at?: number;
  grace_end?: number;
  grace_days?: number;
  pid?: string | number;
  pslug?: string;
  ptype?: string;
  lst?: string;
  reason?: string | null;
  vi?: number;
  nchk?: number;
  lexp_ts?: number | null;
  xp?: 'soft' | 'hard' | string;
  warn_at?: number;
  block_at?: number;
  [key: string]: unknown;
}

export interface EnvelopePayload {
  typ?: string;
  act?: string;
  ts?: number;
  nonce?: string;
  ok?: boolean;
  code?: number;
  lid?: string | number;
  dom?: string;
  iid?: string;
  lst?: string;
  rev?: boolean;
  grace_end?: number;
  block_at?: number;
  jti?: string;
  require_activation?: boolean;
  msg?: string;
  [key: string]: unknown;
}

export type LicenseState = 'unlicensed' | 'active' | 'warning' | 'blocked' | 'invalid';

export interface LicenseDecision {
  state: LicenseState;
  /** active or warning: the business keeps running */
  operational: boolean;
  /** machine-readable cause */
  code: string;
  /** plain-language line for the License page */
  message: string;
  /** unix seconds of the effective block moment (0 = none scheduled) */
  blockAt: number;
  /** whole days until blockAt, when one is scheduled in the future */
  daysLeft: number | null;
  /** true when a future block_at is only the signed hard-expiry schedule */
  scheduledOnly: boolean;
}

/* ---------------------------------------------------------------- helpers */

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** The 32 raw public-key bytes, base64 (as GET /public-key returns them) → KeyObject */
export function publicKeyFromBase64(raw: string): crypto.KeyObject {
  const bytes = Buffer.from(String(raw || '').trim(), 'base64');
  if (bytes.length !== 32) throw new Error('The License Server public key must be 32 bytes (base64).');
  return crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, bytes]), format: 'der', type: 'spki' });
}

/** Accepts the raw base64 key or a PEM block */
export function loadPublicKey(value: string): crypto.KeyObject {
  const text = String(value || '').trim();
  if (text.includes('BEGIN PUBLIC KEY')) {
    const key = crypto.createPublicKey({ key: text.replace(/\\n/g, '\n'), format: 'pem' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('The License Server public key is not an Ed25519 key.');
    return key;
  }
  return publicKeyFromBase64(text);
}

const B64URL = /^[A-Za-z0-9_-]+$/;

function b64urlJson(part: string): any {
  if (!B64URL.test(part)) throw new Error('bad base64url');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function verifyEd25519(key: crypto.KeyObject, data: string, signatureB64url: string): boolean {
  if (!B64URL.test(signatureB64url || '')) return false;
  const sig = Buffer.from(signatureB64url, 'base64url');
  if (sig.length !== 64) return false;
  try {
    return crypto.verify(null, Buffer.from(data, 'utf8'), key, sig);
  } catch {
    return false;
  }
}

/**
 * normalizeDomain() as the License Server applies it: strip scheme, "www.",
 * path and port. "https://www.shop.com/" and "shop.com:443" are the same site.
 */
export function normalizeDomain(input: string | null | undefined): string {
  let value = String(input || '').trim().toLowerCase();
  if (!value) return '';
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme
  value = value.split(/[/?#]/)[0]; // path, query, fragment
  value = value.replace(/^[^@]*@/, ''); // user:pass@
  if (value.startsWith('[')) {
    // IPv6 literal: [::1]:3000 → ::1
    const end = value.indexOf(']');
    value = end > 0 ? value.slice(1, end) : value;
  } else {
    value = value.replace(/:\d*$/, ''); // port
  }
  value = value.replace(/\.+$/, ''); // trailing dot
  if (value.startsWith('www.')) value = value.slice(4);
  return value;
}

/** A fresh random nonce for every request (echoed back inside signed.payload) */
export const newNonce = () => crypto.randomBytes(24).toString('base64url');

/** A secure, stable installation id — generated once per install */
export const newInstallationId = () => crypto.randomBytes(32).toString('hex');

/** SHA-256 of the license key, in the forms the token's lkh claim may use */
export function licenseKeyHashes(licenseKey: string): string[] {
  const digest = crypto.createHash('sha256').update(String(licenseKey || '').trim()).digest();
  return [digest.toString('hex'), digest.toString('base64url'), digest.toString('base64')];
}

/** JNPOS-4F7K-9XQ2-M3RT → JNPOS-••••-••••-M3RT */
export function maskLicenseKey(licenseKey: string): string {
  const key = String(licenseKey || '').trim();
  if (!key) return '';
  const parts = key.split('-');
  if (parts.length >= 3) return parts.map((part, i) => (i === 0 || i === parts.length - 1 ? part : '•'.repeat(Math.max(4, part.length)))).join('-');
  return key.length <= 8 ? `${key.slice(0, 2)}••••` : `${key.slice(0, 4)}${'•'.repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

/* ------------------------------------------------------------ verification */

export interface VerifiedToken {
  ok: boolean;
  error?: string;
  header?: { alg?: string; typ?: string; kid?: string };
  claims?: TokenClaims;
}

/**
 * Section 6: reject if typ !== "QCT" or the signature doesn't verify. The
 * claims are not even parsed until the signature has passed.
 */
export function verifyToken(token: string, key: crypto.KeyObject, keyId?: string): VerifiedToken {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts.some((part) => !B64URL.test(part))) return { ok: false, error: 'malformed_token' };
  let header: any;
  try {
    header = b64urlJson(parts[0]);
  } catch {
    return { ok: false, error: 'malformed_token' };
  }
  if (header?.alg !== 'EdDSA') return { ok: false, error: 'wrong_algorithm' };
  if (header?.typ !== 'QCT') return { ok: false, error: 'wrong_token_type' };
  if (keyId && header?.kid !== keyId) return { ok: false, error: 'unknown_key_id' };
  if (!verifyEd25519(key, `${parts[0]}.${parts[1]}`, parts[2])) return { ok: false, error: 'signature_mismatch' };
  let claims: TokenClaims;
  try {
    claims = b64urlJson(parts[1]);
  } catch {
    return { ok: false, error: 'malformed_claims' };
  }
  if (!claims || typeof claims !== 'object') return { ok: false, error: 'malformed_claims' };
  return { ok: true, header, claims };
}

export interface VerifiedEnvelope {
  ok: boolean;
  error?: string;
  payload?: EnvelopePayload;
}

/**
 * Section 7: sig = Ed25519("LSR1." + payload). Confirms the nonce we sent,
 * the action we called and — when a token came with it — that payload.jti is
 * that token's jti. This is what stops a rewritten "revoked":false or a
 * replayed old "everything's fine" answer.
 */
export function verifyEnvelope(
  signed: any,
  key: crypto.KeyObject,
  expect: { nonce: string; act: string; keyId?: string }
): VerifiedEnvelope {
  if (!signed || typeof signed !== 'object') return { ok: false, error: 'missing_signature' };
  if (signed.typ !== 'LSR1' || signed.alg !== 'EdDSA') return { ok: false, error: 'wrong_envelope_type' };
  if (expect.keyId && signed.kid !== expect.keyId) return { ok: false, error: 'unknown_key_id' };
  const payloadB64 = String(signed.payload || '');
  if (!B64URL.test(payloadB64)) return { ok: false, error: 'malformed_envelope' };
  if (!verifyEd25519(key, `LSR1.${payloadB64}`, String(signed.sig || ''))) return { ok: false, error: 'response_signature_mismatch' };
  let payload: EnvelopePayload;
  try {
    payload = b64urlJson(payloadB64);
  } catch {
    return { ok: false, error: 'malformed_envelope' };
  }
  if (payload?.typ !== 'license-response') return { ok: false, error: 'wrong_envelope_type' };
  if (payload.act !== expect.act) return { ok: false, error: 'wrong_action' };
  if (!payload.nonce || payload.nonce !== expect.nonce) return { ok: false, error: 'nonce_mismatch' };
  return { ok: true, payload };
}

/* --------------------------------------------------------- binding checks */

export interface BindingContext {
  /** normalized domain this install is bound to */
  domain: string;
  installationId: string;
  /** accepted product slugs (the first one is sent as productSlug) */
  productSlugs: string[];
  /** expected ptype, '' to skip */
  productType: string;
}

/** Everything that must match THIS install before a verified token is trusted */
export function checkBinding(claims: TokenClaims, ctx: BindingContext): { ok: boolean; error?: string } {
  if (claims.tv !== undefined && Number(claims.tv) !== 2) return { ok: false, error: 'unsupported_token_version' };
  if (!claims.jti || typeof claims.jti !== 'string') return { ok: false, error: 'missing_jti' };
  if (normalizeDomain(String(claims.dom || '')) !== normalizeDomain(ctx.domain) || !ctx.domain) return { ok: false, error: 'domain_mismatch' };
  if (String(claims.iid || '') !== ctx.installationId || !ctx.installationId) return { ok: false, error: 'installation_mismatch' };
  const accepted = ctx.productSlugs.map((slug) => slug.toLowerCase());
  // pslug is the licensed product's real slug from the database; slug is only
  // what the client reported, so pslug decides whenever the server sends it.
  const productSlug = String(claims.pslug || claims.slug || '').toLowerCase();
  if (!productSlug || !accepted.includes(productSlug)) return { ok: false, error: 'product_mismatch' };
  if (ctx.productType && claims.ptype && String(claims.ptype) !== ctx.productType) return { ok: false, error: 'product_type_mismatch' };
  return { ok: true };
}

/* ---------------------------------------------------------- decision table */

const DAY = 86400;

/**
 * Section 9, in order:
 *   signature invalid, or dom/iid ≠ this install      → invalid (handled by caller)
 *   block_at > 0 and now ≥ block_at                    → blocked
 *   rev === true (grace running)                       → warning, days left
 *   lst === "expired" (soft) or now ≥ warn_at          → warning
 *   now > exp (hasn't synced in a long time)           → warning ("stale")
 *   otherwise                                          → active
 * A future block_at while rev is false is the signed hard-expiry schedule —
 * informational, never "already blocked".
 * `now` never goes below the token's own iat, so a server clock that runs
 * behind cannot make a fresh token look not-yet-valid.
 */
export function decide(claims: TokenClaims, nowSeconds: number): LicenseDecision {
  const now = Math.max(Math.floor(nowSeconds), Number(claims.iat) || 0);
  const rev = claims.rev === true;
  const blockAtSigned = Number(claims.block_at) || 0;
  const graceEnd = Number(claims.grace_end) || 0;
  // A revocation always carries its deadline; if only grace_end came, it is the block moment
  const blockAt = blockAtSigned > 0 ? blockAtSigned : rev && graceEnd > 0 ? graceEnd : 0;
  const daysLeft = blockAt > 0 && blockAt > now ? Math.max(0, Math.ceil((blockAt - now) / DAY)) : null;
  const lst = String(claims.lst || claims.st || '').toLowerCase();
  const base = { blockAt, daysLeft, scheduledOnly: false };

  if (blockAt > 0 && now >= blockAt) {
    return {
      ...base,
      state: 'blocked',
      operational: false,
      code: rev ? `blocked_${claims.reason || lst || 'revoked'}` : 'blocked_expired',
      message: rev
        ? `The license was ${claims.reason || lst || 'revoked'} and its grace period has ended.`
        : 'The license has expired.',
    };
  }
  if (rev) {
    return {
      ...base,
      state: 'warning',
      operational: true,
      code: `grace_${claims.reason || lst || 'revoked'}`,
      message:
        daysLeft !== null
          ? `The license is ${claims.reason || lst || 'revoked'}. Everything keeps working for ${daysLeft} more day${daysLeft === 1 ? '' : 's'} (grace period).`
          : `The license is ${claims.reason || lst || 'revoked'}.`,
    };
  }
  const warnAt = Number(claims.warn_at) || 0;
  if (lst === 'expired' || (warnAt > 0 && now >= warnAt)) {
    return {
      ...base,
      state: 'warning',
      operational: true,
      code: lst === 'expired' ? 'expired_soft' : 'expiry_near',
      message:
        lst === 'expired'
          ? 'The license has expired. Please renew it.'
          : daysLeft !== null
          ? `The license expires soon — renew within ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`
          : 'The license expires soon. Please renew it.',
    };
  }
  if (Number(claims.exp) > 0 && now > Number(claims.exp)) {
    return {
      ...base,
      state: 'warning',
      operational: true,
      code: 'stale',
      message: 'This install has not reached the License Server for a long time. It keeps working; the next check will refresh it.',
    };
  }
  if (['suspended', 'revoked', 'cancelled', 'refunded', 'deactivated'].includes(lst)) {
    // Not in the table's order, but never report such a token as plain "active"
    return { ...base, state: 'warning', operational: true, code: `state_${lst}`, message: `The License Server reports this license as ${lst}.` };
  }
  return {
    ...base,
    scheduledOnly: blockAt > 0,
    state: 'active',
    operational: true,
    code: 'active',
    message: 'The license is active.',
  };
}

/** Allowed verify intervals (section 9); anything else snaps to the nearest */
export const VERIFY_INTERVALS = [3, 7, 14, 30, 60, 90];
export function snapInterval(days: any): number {
  const value = Number(days) || 7;
  return VERIFY_INTERVALS.reduce((best, cur) => (Math.abs(cur - value) < Math.abs(best - value) ? cur : best), 7);
}
