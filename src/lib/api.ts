/**
 * Single place where the frontend talks to the API.
 * Attaches the stored session token and normalises error handling so an expired
 * session logs the user out instead of silently failing in the background.
 */

import { announceDataChange } from './dataCache.ts';

const TOKEN_KEY = 'pharma_token';

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable (private mode) */
  }
};

export const clearToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const authHeaders = (): Record<string, string> => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...authHeaders(),
    ...((options.headers as Record<string, string>) || {}),
  };

  const sentToken = getToken();
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    if (!sentToken || getToken() === sentToken) {
      clearToken();
      window.dispatchEvent(new CustomEvent('pharma:session-expired'));
    }
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    throw new ApiError((data && data.error) || "We couldn't get a response from the server. Please try again.", res.status);
  }

  return data as T;
}

/** POST/PUT helper */
export const apiSend = <T = any>(url: string, method: string, body?: any) =>
  apiFetch<T>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/**
 * Patches window.fetch once so every same-origin `/api/...` call carries the
 * session token, and a 401 anywhere in the app clears the stale session.
 * Prevents "forgot the Authorization header" bugs in existing call sites.
 */
export function installApiAuth() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__pharmaApiAuthInstalled) return;
  w.__pharmaApiAuthInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: any, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isInternalApi = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);

    if (!isInternalApi) return originalFetch(input, init);

    const token = getToken();
    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
    // A call site that built its own header with an empty or stale value
    // ("Bearer ", "Bearer null") would be refused with a 401 — and a 401 signs
    // the user out below. That is exactly how picking an image in the media
    // library used to log the admin out. The real session token always wins.
    const existing = headers.get('Authorization') || '';
    const existingToken = existing.replace(/^Bearer\s*/i, '').trim();
    if (token && (!existingToken || existingToken === 'null' || existingToken === 'undefined')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await originalFetch(input, { ...init, headers });

    // A dashboard save: other open storefront tabs of this browser refresh
    const method = String(init.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    if (res.ok && method !== 'GET' && method !== 'HEAD' && /\/api\/(admin|settings|media)(\/|$)/.test(url)) {
      announceDataChange();
    }

    // Only when the refused token is still the stored one: a request that left
    // just before a password change (which hands out a new token) must not
    // sign the user out with its late 401
    if (res.status === 401 && token && getToken() === token) {
      clearToken();
      window.dispatchEvent(new CustomEvent('pharma:session-expired'));
    }
    // The server's license gate answered: let the dashboard/POS show the
    // License screen instead of a page full of failed requests.
    if ((res.status === 403 || res.status === 503) && (res.headers.get('content-type') || '').includes('json')) {
      res
        .clone()
        .json()
        .then((body) => {
          if (typeof body?.code === 'string' && body.code.startsWith('LICENSE_')) {
            window.dispatchEvent(new CustomEvent('pharma:license-required', { detail: body }));
          }
        })
        .catch(() => undefined);
    }
    return res;
  };
}
