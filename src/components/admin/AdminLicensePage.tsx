import React, { useState } from 'react';
import {
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  ArrowRight,
  Lock,
  Zap,
  Headphones,
  ChevronDown,
  RefreshCw,
  Power,
  Globe,
} from 'lucide-react';
import { ConfirmDialog, useToasts } from './ui.tsx';
import { LicenseStatus, licenseAction } from '../../lib/license.ts';

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

/** Header look per state: gradient, badge colour, icon, words */
const LOOK: Record<LicenseStatus['state'], { from: string; to: string; badge: string; icon: IconType; title: string; line: string }> = {
  active: { from: '#2563eb', to: '#4338ca', badge: '#22c55e', icon: ShieldCheck, title: 'License Active', line: 'Your application is fully activated' },
  warning: { from: '#f59e0b', to: '#ea580c', badge: '#ffffff', icon: AlertTriangle, title: 'License Needs Attention', line: 'Everything still works — please renew soon' },
  blocked: { from: '#e11d48', to: '#b91c1c', badge: '#ffffff', icon: ShieldX, title: 'License Blocked', line: 'Renew the license to open the dashboard again' },
  invalid: { from: '#e11d48', to: '#9f1239', badge: '#ffffff', icon: ShieldAlert, title: 'License Not Valid Here', line: 'Activate the license for this website again' },
  unlicensed: { from: '#4f46e5', to: '#7c3aed', badge: '#ffffff', icon: KeyRound, title: 'Activate Your License', line: 'Enter your license key to unlock the dashboard' },
};

const fmtDate = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

/**
 * Super Admin → License. One simple card: the key, its status and the
 * activation date, and a field to activate or change the key. The finer
 * details (domain, next check, server) sit folded away at the bottom for
 * support. Whether the license is valid is always decided on the server.
 */
export const AdminLicensePage: React.FC<{
  status: LicenseStatus;
  onStatus: (status: LicenseStatus) => void;
  onRefresh: () => void;
  /** kept for older callers; the page is always compact now */
  compact?: boolean;
}> = ({ status, onStatus, onRefresh }) => {
  const toasts = useToasts();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<'' | 'activate' | 'sync' | 'deactivate' | 'key' | 'new-domain'>('');
  const [error, setError] = useState('');
  const [confirmOff, setConfirmOff] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // v3.9 — a copy on another domain is locked here even though the saved license is fine
  const movedHere = Boolean(status.domain && !status.domainMatches && status.requestDomain);
  const look = movedHere
    ? { ...LOOK.invalid, icon: Globe, title: 'Activate This Domain', line: `This copy of the website (${status.requestDomain}) needs its own license` }
    : LOOK[status.state] || LOOK.unlicensed;
  const Icon = look.icon;
  const activated = Boolean(status.license);
  const canManage = status.canManage;
  const configMissing = !status.config.ready;
  const support = status.support;
  // v3.9 — the site was copied / restored onto another domain
  const movedDomain = movedHere;
  const supportHref = support.url || (support.email ? `mailto:${support.email}` : support.phone ? `tel:${support.phone}` : '');

  const run = async (kind: 'activate' | 'sync' | 'deactivate' | 'key' | 'new-domain', body: Record<string, any> = {}) => {
    setBusy(kind);
    setError('');
    try {
      const result = await licenseAction(kind, body);
      if (result.status) onStatus(result.status);
      if (!result.ok) {
        if (kind === 'activate' || kind === 'key' || kind === 'new-domain') setError(result.message);
        else toasts.push(result.message, 'warning');
        return false;
      }
      const next = result.status?.state;
      toasts.push(result.message || 'Done.', next === 'warning' ? 'warning' : next === 'blocked' || next === 'invalid' ? 'error' : 'success');
      if (kind === 'activate' || kind === 'key' || kind === 'new-domain') setKey('');
      if (!result.status) onRefresh();
      return true;
    } finally {
      setBusy('');
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = key.trim();
    if (!value) {
      setError('Enter your license key.');
      return;
    }
    if (movedDomain) {
      void run('new-domain', { licenseKey: value, confirm: true });
      return;
    }
    void run(activated && !status.keyStored ? 'key' : 'activate', { licenseKey: value });
  };

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-2" style={{ fontSize: 'var(--a-fs-md)' }}>
      <span style={{ color: 'var(--a-text-muted)' }}>{label}:</span>
      <span className="font-semibold text-right min-w-0 break-all">{value}</span>
    </div>
  );

  const statusPill = (() => {
    const text = movedHere ? `for ${status.domain}` : status.license?.status || (status.state === 'unlicensed' ? 'not activated' : status.state);
    const palette =
      status.state === 'active' && !movedHere
        ? { bg: '#dcfce7', fg: '#15803d' }
        : status.state === 'warning'
        ? { bg: '#fef3c7', fg: '#b45309' }
        : { bg: '#ffe4e6', fg: '#be123c' };
    return (
      <span className="inline-flex items-center px-2.5 h-6 font-semibold" style={{ borderRadius: 999, background: palette.bg, color: palette.fg, fontSize: 'var(--a-fs-sm)' }}>
        {text}
      </span>
    );
  })();

  return (
    <div className="py-4 sm:py-8">
      {toasts.node}
      <div className="mx-auto w-full" style={{ maxWidth: 460 }}>
        <div className="overflow-hidden" style={{ borderRadius: 18, background: 'var(--a-surface)', boxShadow: '0 18px 50px -20px rgba(15, 23, 42, 0.35)', border: '1px solid var(--a-border)' }}>
          {/* ------------------------------------------------------ header */}
          <div className="relative text-center text-white px-6 pt-8 pb-10" style={{ background: `linear-gradient(135deg, ${look.from}, ${look.to})` }}>
            <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 460 200" preserveAspectRatio="none">
              <path d="M0,150 C120,60 260,40 460,120 L460,200 L0,200 Z" fill="rgba(255,255,255,0.08)" />
              <path d="M0,80 C140,150 300,10 460,60 L460,0 L0,0 Z" fill="rgba(255,255,255,0.06)" />
            </svg>
            <span
              className="relative mx-auto w-[68px] h-[68px] inline-flex items-center justify-center"
              style={{ borderRadius: 999, background: status.state === 'active' && !movedHere ? look.badge : 'rgba(255,255,255,0.18)', boxShadow: '0 10px 25px -8px rgba(0,0,0,0.35)' }}
            >
              <Icon className="w-8 h-8" style={{ color: status.state === 'active' ? '#ffffff' : '#ffffff' }} />
            </span>
            <h1 className="relative mt-4 font-bold" style={{ fontSize: 28, lineHeight: 1.15 }}>
              {look.title}
            </h1>
            <p className="relative mt-1.5" style={{ fontSize: 'var(--a-fs-md)', opacity: 0.9 }}>
              {look.line}
            </p>
          </div>

          <div className="px-6 pb-6 -mt-4 relative">
            {/* ------------------------------------------------ key summary */}
            {activated && (
              <div className="px-4 py-1.5 mb-5" style={{ borderRadius: 12, background: 'var(--a-surface-2)', border: '1px solid var(--a-border-soft)' }}>
                {row('License Key', <span className="ds-num tracking-wide">{status.keyMasked || '—'}</span>)}
                <div style={{ borderTop: '1px solid var(--a-border-soft)' }} />
                {row('Status', statusPill)}
                <div style={{ borderTop: '1px solid var(--a-border-soft)' }} />
                {row('Activated At', fmtDate(status.activatedAt))}
              </div>
            )}
            {!activated && <div className="h-5" />}

            {/* --------------------------------- warnings that need action */}
            {status.state !== 'active' && status.state !== 'unlicensed' && (
              <p className="mb-4 p-3" style={{ borderRadius: 10, background: status.state === 'warning' ? '#fffbeb' : '#fff1f2', color: status.state === 'warning' ? '#92400e' : '#9f1239', fontSize: 'var(--a-fs-sm)' }}>
                {status.message}
                {status.state === 'warning' && status.blockAt && !status.scheduledOnly ? ` The dashboard locks on ${fmtDate(status.blockAt)}.` : ''}
              </p>
            )}
            {movedDomain && (
              <div className="mb-4 p-3.5" style={{ borderRadius: 12, background: '#eef2ff', color: '#3730a3', fontSize: 'var(--a-fs-sm)', border: '1px solid #c7d2fe' }}>
                <div className="flex items-center gap-1.5 font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                  <Globe className="w-4 h-4" /> Website moved to a new domain?
                </div>
                <p className="mt-1.5 leading-relaxed">
                  The saved license belongs to <strong>{status.domain}</strong>, but this website is <strong>{status.requestDomain}</strong> — for example after a
                  backup was restored here. Enter the license key for <strong>{status.requestDomain}</strong> below to activate this copy as its own
                  installation. Nothing is sent to <strong>{status.domain}</strong> and its license is not released.
                </p>
                <p className="mt-1.5 font-semibold">
                  Only for a separate copy of the website. If {status.requestDomain} is just another address of the same website (its
                  IP address, a test link), do not activate here — open the dashboard on {status.domain} instead.
                </p>
                <p className="mt-1.5" style={{ color: '#4338ca' }}>
                  Still using {status.domain}? Open the dashboard at{' '}
                  <a className="underline font-semibold" href={`https://${status.domain}/admin`}>
                    https://{status.domain}/admin
                  </a>
                  .
                </p>
              </div>
            )}

            {/* ----------------------------------------------------- form */}
            {configMissing ? (
              <div className="p-3" style={{ borderRadius: 10, background: '#fffbeb', color: '#92400e', fontSize: 'var(--a-fs-sm)' }}>
                <div className="font-bold mb-1">The License Server connection is not set up</div>
                {status.config.missing.map((line) => (
                  <div key={line}>• {line}</div>
                ))}
                <div className="mt-1">Add these to the server’s .env file and restart the app.</div>
              </div>
            ) : canManage ? (
              <form onSubmit={submit} noValidate>
                <h2 className="flex items-center gap-2 font-semibold mb-3" style={{ fontSize: 'var(--a-fs-lg)' }}>
                  {movedDomain ? <Globe className="w-4 h-4" /> : activated ? <RefreshCw className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
                  {movedDomain ? `License for ${status.requestDomain}` : activated ? (status.keyStored ? 'Update License Key' : 'Enter License Key Again') : 'License Key'}
                </h2>
                <label htmlFor="license-key" className="block font-semibold mb-1.5" style={{ fontSize: 'var(--a-fs-sm)' }}>
                  {movedDomain ? 'License key for this domain' : activated ? 'New License Key' : 'Your License Key'}
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--a-text-muted)' }} />
                  <input
                    id="license-key"
                    aria-label="License key"
                    className="a-field ds-num uppercase"
                    style={{ height: 48, paddingLeft: 40, letterSpacing: '0.06em', borderRadius: 10 }}
                    value={key}
                    onChange={(event) => {
                      setKey(event.target.value);
                      setError('');
                    }}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus={!activated || movedDomain}
                  />
                </div>
                <p className="mt-2 flex items-start gap-1.5 px-2.5 py-1.5" style={{ borderRadius: 8, background: '#fffbeb', color: '#b45309', fontSize: 'var(--a-fs-xs)' }}>
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>
                    Make sure the license key belongs to this domain
                    {status.requestDomain ? (
                      <>
                        {' '}(<strong>{status.requestDomain}</strong>)
                      </>
                    ) : null}
                    .
                  </span>
                </p>
                {error && (
                  <p role="alert" className="mt-3 p-2.5" style={{ borderRadius: 8, background: '#fff1f2', color: '#be123c', fontSize: 'var(--a-fs-sm)' }}>
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy === 'activate' || busy === 'key' || busy === 'new-domain'}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 font-semibold text-white cursor-pointer disabled:opacity-70"
                  style={{ height: 48, borderRadius: 10, background: `linear-gradient(90deg, ${LOOK.active.from}, ${LOOK.unlicensed.to})`, fontSize: 'var(--a-fs-md)' }}
                >
                  {busy === 'activate' || busy === 'key' || busy === 'new-domain' ? <span className="ds-spinner" style={{ borderColor: 'rgba(255,255,255,.4)', borderTopColor: '#fff' }} /> : null}
                  {movedDomain ? 'Activate on this domain' : activated ? 'Update License' : 'Activate License'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <p className="p-3 text-center" style={{ borderRadius: 10, background: 'var(--a-surface-2)', fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
                Only the owner account (Super Admin) can activate or change the license.
              </p>
            )}

            <p className="mt-5 text-center" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              Having trouble activating?{' '}
              {supportHref ? (
                <a href={supportHref} target={support.url ? '_blank' : undefined} rel="noopener noreferrer" className="font-semibold" style={{ color: '#a16207' }}>
                  Contact Support
                </a>
              ) : (
                <span className="font-semibold" style={{ color: '#a16207' }}>
                  Contact the supplier of your license
                </span>
              )}
            </p>
          </div>
        </div>

        {/* --------------------------------------------------- reassurance */}
        <div className="mt-5 grid grid-cols-3 gap-2 text-center" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
          {(
            [
              [Lock, 'Secure Activation'],
              [Zap, 'Instant Access'],
              [Headphones, '24/7 Support'],
            ] as const
          ).map(([ItemIcon, label]) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <ItemIcon className="w-4 h-4" />
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* ------------------------------------------- folded-away details */}
        {canManage && (activated || status.everActivated) && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowDetails((value) => !value)}
              className="mx-auto flex items-center gap-1 cursor-pointer"
              style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}
              aria-expanded={showDetails}
            >
              Technical details
              <ChevronDown className="w-3.5 h-3.5" style={{ transform: showDetails ? 'rotate(180deg)' : 'none' }} />
            </button>
            {showDetails && (
              <div className="mt-3 p-4 space-y-1.5" style={{ borderRadius: 12, background: 'var(--a-surface)', border: '1px solid var(--a-border)', fontSize: 'var(--a-fs-sm)' }}>
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--a-text-muted)' }}>Domain</span>
                  <span className="font-semibold inline-flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5" /> {status.domain || status.requestDomain}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--a-text-muted)' }}>Product</span>
                  <span className="font-semibold">{status.license?.product?.name || status.config.productSlug}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--a-text-muted)' }}>Type / expiry</span>
                  <span className="font-semibold">
                    {status.license?.type || '—'} · {status.license?.expiry || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--a-text-muted)' }}>Last check / next</span>
                  <span className="font-semibold">
                    {fmtDate(status.lastSyncAt)} · {fmtDate(status.nextCheckAt)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--a-text-muted)' }}>License Server</span>
                  <span className="font-semibold">
                    {status.server.reachable === false ? 'Unreachable (keeps working offline)' : status.server.host || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--a-text-muted)' }}>Installation</span>
                  <span className="font-semibold ds-num">{status.installationId ? `${status.installationId.slice(0, 10)}…` : '—'}</span>
                </div>
                {activated && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => run('sync')}
                      disabled={Boolean(busy)}
                      className="inline-flex items-center gap-1.5 h-8 px-3 font-semibold cursor-pointer"
                      style={{ borderRadius: 8, border: '1px solid var(--a-border)', fontSize: 'var(--a-fs-sm)' }}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} /> Check now
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmOff(true)}
                      disabled={Boolean(busy)}
                      className="inline-flex items-center gap-1.5 h-8 px-3 font-semibold cursor-pointer"
                      style={{ borderRadius: 8, border: '1px solid var(--a-border)', color: 'var(--ds-danger-text)', fontSize: 'var(--a-fs-sm)' }}
                    >
                      <Power className="w-3.5 h-3.5" /> Deactivate
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOff}
        title="Deactivate this installation?"
        message={`This releases the license seat. The dashboard and POS on ${status.domain} lock until a license is activated again. The shop stays online.`}
        confirmLabel="Deactivate"
        tone="danger"
        busy={busy === 'deactivate'}
        onConfirm={async () => {
          const done = await run('deactivate', { confirm: true });
          if (done) setConfirmOff(false);
        }}
        onCancel={() => setConfirmOff(false)}
      />
    </div>
  );
};
