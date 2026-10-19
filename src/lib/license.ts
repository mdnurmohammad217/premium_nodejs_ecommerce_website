import { createContext, useContext } from 'react';

/** GET /api/license/status — what the License page shows (never the key or token) */
export interface LicenseStatus {
  state: 'unlicensed' | 'active' | 'warning' | 'blocked' | 'invalid';
  operational: boolean;
  code: string;
  message: string;
  daysLeft: number | null;
  blockAt: number | null;
  scheduledOnly: boolean;
  canManage: boolean;
  everActivated: boolean;
  license: null | {
    status: string;
    reason: string | null;
    product: { slug: string; name: string; type: string };
    type: string;
    seats: number | null;
    expiry: string;
    expiryPolicy: string;
    revoked: boolean;
    revokedAt: number | null;
    graceEnd: number | null;
    graceDays: number | null;
    warnAt: number | null;
    verifyIntervalDays: number | null;
    tokenExpiresAt: number | null;
  };
  keyMasked: string;
  keyStored: boolean;
  domain: string;
  requestDomain: string;
  domainMatches: boolean;
  installationId: string;
  activatedAt: number | null;
  lastSyncAt: number | null;
  nextCheckAt: number | null;
  lastResult: string;
  server: {
    host: string;
    reachable: boolean | null;
    lastAttemptAt: number | null;
    lastError: string;
    backoffUntil: number | null;
    consecutiveFailures: number;
  };
  config: {
    ready: boolean;
    missing: string[];
    productSlug: string;
    publicKeySource: string;
    keyId: string;
    appVersion: string;
  };
  support: { name: string; email: string; phone: string; url: string };
  events: Array<{ id: number; event: string; level: string; message: string; httpStatus: number | null; createdAt: string }>;
}

export const LICENSE_EVENT = 'pharma:license-required';

export async function fetchLicenseStatus(): Promise<LicenseStatus> {
  const res = await fetch('/api/license/status', { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not read the license.');
  return data as LicenseStatus;
}

export async function licenseAction(
  path: 'activate' | 'sync' | 'deactivate' | 'key' | 'new-domain',
  body: Record<string, any> = {}
): Promise<{ ok: boolean; message: string; status?: LicenseStatus }> {
  const res = await fetch(`/api/license/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) return { ok: false, message: data?.error || 'That did not work. Please try again.' };
  return { ok: data?.success !== false, message: data?.message || '', status: data?.status };
}

export const LicenseContext = createContext<{ status: LicenseStatus | null; refresh: () => void; setStatus: (s: LicenseStatus) => void }>({
  status: null,
  refresh: () => {},
  setStatus: () => {},
});

export const useLicense = () => useContext(LicenseContext);
