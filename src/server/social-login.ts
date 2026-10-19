/**
 * v3.12 — "Continue with Google" / "Continue with Facebook" for customers.
 *
 * Standard OAuth 2.0 authorization-code flow, done entirely by the server:
 *   1. /api/auth/oauth/<provider>/start   → the provider's sign-in page
 *   2. the provider sends the visitor back to /api/auth/oauth/<provider>/callback
 *      with a one-time code; the server swaps it (with the app secret, which
 *      never leaves the server) for the visitor's id, name and e-mail
 *   3. the matching customer account is found or created and signed in.
 *
 * The `state` value is signed and tied to a short-lived cookie in the
 * visitor's own browser, so a sign-in started on another site or replayed
 * later is refused.
 */
import crypto from 'crypto';

export type SocialProvider = 'google' | 'facebook';
export const SOCIAL_PROVIDERS: SocialProvider[] = ['google', 'facebook'];
const FB_VERSION = 'v21.0';

export interface SocialLoginConfig {
  enabled?: boolean;
  google?: { enabled?: boolean; clientId?: string; clientSecret?: string };
  facebook?: { enabled?: boolean; appId?: string; appSecret?: string };
}

export interface SocialProfile {
  provider: SocialProvider;
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/** Which buttons the website may show (no secrets) */
export function publicSocialLogin(config: SocialLoginConfig | null | undefined): { google: boolean; facebook: boolean } {
  const on = Boolean(config?.enabled);
  return {
    google: on && config?.google?.enabled !== false && Boolean(config?.google?.clientId && config?.google?.clientSecret),
    facebook: on && config?.facebook?.enabled !== false && Boolean(config?.facebook?.appId && config?.facebook?.appSecret),
  };
}

export function authorizeUrl(provider: SocialProvider, config: SocialLoginConfig, redirectUri: string, state: string): string {
  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: String(config.google?.clientId || ''),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
      include_granted_scopes: 'true',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
  const params = new URLSearchParams({
    client_id: String(config.facebook?.appId || ''),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'email,public_profile',
    state,
  });
  return `https://www.facebook.com/${FB_VERSION}/dialog/oauth?${params.toString()}`;
}

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error_description || data?.error?.message || data?.error || `HTTP ${response.status}`;
      throw new Error(String(message).slice(0, 200));
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Swap the one-time code for the visitor's profile */
export async function fetchProfile(provider: SocialProvider, config: SocialLoginConfig, redirectUri: string, code: string): Promise<SocialProfile> {
  if (provider === 'google') {
    const token = await getJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: String(config.google?.clientId || ''),
        client_secret: String(config.google?.clientSecret || ''),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!token?.access_token) throw new Error('Google did not return an access token.');
    const info = await getJson('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!info?.sub) throw new Error('Google did not return an account id.');
    return {
      provider,
      id: String(info.sub),
      email: String(info.email || '').trim().toLowerCase(),
      emailVerified: info.email_verified === true || info.email_verified === 'true',
      name: String(info.name || info.given_name || '').trim(),
    };
  }

  const appId = String(config.facebook?.appId || '');
  const appSecret = String(config.facebook?.appSecret || '');
  const token = await getJson(
    `https://graph.facebook.com/${FB_VERSION}/oauth/access_token?${new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    }).toString()}`
  );
  if (!token?.access_token) throw new Error('Facebook did not return an access token.');
  // appsecret_proof: Facebook only answers calls made with our own app secret
  const proof = crypto.createHmac('sha256', appSecret).update(token.access_token).digest('hex');
  const info = await getJson(
    `https://graph.facebook.com/${FB_VERSION}/me?${new URLSearchParams({
      fields: 'id,name,email',
      access_token: token.access_token,
      appsecret_proof: proof,
    }).toString()}`
  );
  if (!info?.id) throw new Error('Facebook did not return an account id.');
  return {
    provider,
    id: String(info.id),
    // Facebook only shares an address the person has confirmed
    email: String(info.email || '').trim().toLowerCase(),
    emailVerified: Boolean(info.email),
    name: String(info.name || '').trim(),
  };
}

/* ------------------------------------------------------------ signed state */

export function makeState(
  secret: string,
  payload: { provider: SocialProvider; returnTo: string; nonce: string; clientNonce: string }
): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`oauth.${body}`).digest('base64url');
  return `${body}.${sig}`;
}

export function readState(
  secret: string,
  state: string
): { provider: SocialProvider; returnTo: string; nonce: string; clientNonce: string } | null {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(`oauth.${body}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data || Number(data.exp) < Date.now()) return null;
    if (!SOCIAL_PROVIDERS.includes(data.provider)) return null;
    return {
      provider: data.provider,
      returnTo: String(data.returnTo || '/account'),
      nonce: String(data.nonce || ''),
      clientNonce: String(data.clientNonce || ''),
    };
  } catch {
    return null;
  }
}

/** Only a path on this site (never //other-site or a full address) */
/** A random value made by the visitor's own page (see SocialLoginButtons) */
export const isClientNonce = (value: unknown) => /^[A-Za-z0-9_-]{16,64}$/.test(String(value || ''));

export function safeReturnPath(value: unknown): string {
  const text = String(value || '').trim().split('#')[0];
  if (!text.startsWith('/') || text.startsWith('//') || text.startsWith('/\\') || /[\r\n]/.test(text)) return '/account';
  if (/^\/(api|admin|dashboard|pos|login|signup)(\/|$|\?)/i.test(text)) return '/account';
  return text.slice(0, 300);
}
