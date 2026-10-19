import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, LogOut, Store, ShieldX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { LicenseContext, LicenseStatus, LICENSE_EVENT, fetchLicenseStatus } from '../../lib/license.ts';

/**
 * Wraps the dashboard and the POS and shares the license status with them.
 *
 * • Dashboard: always rendered. While the license is not active the dashboard
 *   itself opens only its License page (and Account & Security) — see
 *   AdminLayout. The owner signs in, sees the License page, activates, and
 *   carries on.
 * • POS: while the license is not active it shows a short notice with the way
 *   to the License page.
 *
 * This is the friendly layer. The real lock is on the server: every
 * back-office API refuses to work without a valid license.
 */
export const LicenseGate: React.FC<{
  children: React.ReactNode;
  mode?: 'admin' | 'pos';
  onBackToStore?: () => void;
  onOpenLicense?: () => void;
  storeName?: string;
  logoUrl?: string;
}> = ({ children, mode = 'admin', onBackToStore, onOpenLicense, storeName, logoUrl }) => {
  const { user, signOut } = useAuth();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    fetchLicenseStatus()
      .then(setStatus)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const onRequired = () => refresh();
    window.addEventListener(LICENSE_EVENT, onRequired);
    // A long-open dashboard notices a block or a new warning within minutes
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 5 * 60_000);
    return () => {
      window.removeEventListener(LICENSE_EVENT, onRequired);
      window.clearInterval(timer);
    };
  }, [refresh]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-(--ds-bg)">
        <span className="ds-spinner w-8 h-8" />
      </div>
    );
  }

  const locked = Boolean(status && (!status.operational || !status.domainMatches));
  const provider = (content: React.ReactNode) => (
    <LicenseContext.Provider value={{ status, refresh, setStatus }}>{content}</LicenseContext.Provider>
  );

  if (!locked || mode === 'admin') return provider(children);

  // POS while the license is not active
  const owner = Boolean(status?.canManage);
  return provider(
    <div className="admin-shell admin-dash min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--a-bg, var(--ds-bg))' }}>
      <div className="w-full text-center overflow-hidden" style={{ maxWidth: 420, borderRadius: 18, background: 'var(--a-surface)', border: '1px solid var(--a-border)', boxShadow: '0 18px 50px -20px rgba(15,23,42,.35)' }}>
        <div className="px-6 pt-8 pb-7 text-white" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
          {logoUrl ? (
            <img src={logoUrl} alt={storeName || ''} className="mx-auto h-9 w-auto object-contain mb-4 p-1.5" style={{ background: '#fff', borderRadius: 8 }} />
          ) : null}
          <span className="mx-auto w-14 h-14 inline-flex items-center justify-center" style={{ borderRadius: 999, background: 'rgba(255,255,255,.18)' }}>
            {status?.state === 'blocked' ? <ShieldX className="w-7 h-7" /> : <KeyRound className="w-7 h-7" />}
          </span>
          <h1 className="mt-3 font-bold" style={{ fontSize: 22 }}>
            POS is locked
          </h1>
          <p className="mt-1" style={{ opacity: 0.9, fontSize: 'var(--a-fs-md)' }}>
            {status?.state === 'blocked' ? 'The license has ended. It opens again as soon as it is renewed.' : 'The license has not been activated yet.'}
          </p>
        </div>
        <div className="p-6 space-y-3">
          <p style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-soft)' }}>
            {owner
              ? 'Activate the license on the License page of the dashboard, then come back to the POS.'
              : `Signed in as ${user?.name || user?.email || 'staff'}. Please ask the owner to activate the license.`}
          </p>
          {owner && (
            <button
              type="button"
              onClick={() => (onOpenLicense ? onOpenLicense() : (window.location.href = '/admin/license'))}
              className="w-full h-11 inline-flex items-center justify-center gap-2 font-semibold text-white cursor-pointer"
              style={{ borderRadius: 10, background: 'linear-gradient(90deg, #2563eb, #7c3aed)' }}
            >
              <KeyRound className="w-4 h-4" /> Open the License page
            </button>
          )}
          <div className="flex gap-2">
            {onBackToStore && (
              <button type="button" onClick={onBackToStore} className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 font-semibold cursor-pointer" style={{ borderRadius: 10, border: '1px solid var(--a-border)' }}>
                <Store className="w-4 h-4" /> Store
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                signOut();
                window.location.href = '/login';
              }}
              className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 font-semibold cursor-pointer"
              style={{ borderRadius: 10, border: '1px solid var(--a-border)' }}
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
