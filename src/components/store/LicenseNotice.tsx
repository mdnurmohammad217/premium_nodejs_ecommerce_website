import React, { useEffect, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';

const SEEN_KEY = 'pharma:license-notice-at';
/** At most once every 6 hours per browser */
const GAP_MS = 6 * 60 * 60 * 1000;
/** Shown a little after the page opens, never in the visitor's way at once */
const DELAY_MS = 8000;

/**
 * Storefront notice for a store whose software has never been activated.
 *
 * It shows only when the server says this installation was NEVER activated —
 * a fact from the local database, so a License Server outage can never make
 * it appear on a licensed shop. Even then it is rare (once every few hours,
 * a few seconds after a page opens) and closes with one tap.
 */
export const LicenseNotice: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let last = 0;
    try {
      last = Number(localStorage.getItem(SEEN_KEY)) || 0;
    } catch {
      last = 0;
    }
    if (Date.now() - last < GAP_MS) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch('/api/license/notice')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data?.show) return;
          setOpen(true);
          try {
            localStorage.setItem(SEEN_KEY, String(Date.now()));
          } catch {
            /* private mode: it may simply show again later */
          }
        })
        .catch(() => undefined);
    }, DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="license-notice-title">
      <div className="absolute inset-0 bg-black/40 ds-fade-in" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-(--ds-r-2xl) bg-(--ds-surface) shadow-(--ds-shadow-lg) ds-scale-in">
        <div className="px-5 pt-6 pb-5 text-center text-white" style={{ background: 'linear-gradient(135deg, #e11d48, #7c3aed)' }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-2.5 right-2.5 w-8 h-8 inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <span className="mx-auto w-14 h-14 inline-flex items-center justify-center rounded-full bg-white/20">
            <ShieldAlert className="w-7 h-7" />
          </span>
          <h2 id="license-notice-title" className="mt-3 text-(length:--ds-fs-xl) font-(--ds-fw-bold)">
            Unlicensed software
          </h2>
          <p className="mt-1 text-(length:--ds-fs-sm) opacity-90">This website is running without an activated license.</p>
        </div>
        <div className="p-5 text-center">
          <p className="text-(length:--ds-fs-sm) text-(--ds-text-soft)">
            If you own this store, activate your license from <strong>Dashboard → License</strong>. Shopping here is not affected.
          </p>
          <button type="button" onClick={() => setOpen(false)} className="ds-btn ds-btn-primary ds-btn-block mt-4">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
