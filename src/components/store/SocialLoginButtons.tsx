import React, { useState } from 'react';
import { SiteSettings } from '../../types/index.ts';

/**
 * v3.12 — "Continue with Google" / "Continue with Facebook".
 * Shown only for the providers switched on (with keys) in Dashboard →
 * System Configuration → Social Login. The button sends the visitor to
 * /api/auth/oauth/<provider>/start; the server does the rest and brings
 * them back signed in (to `returnTo`, the account page by default).
 */
export const OAUTH_NONCE_KEY = 'shop:oauth-cn';

export const socialLoginOf = (settings?: SiteSettings) => {
  const raw = ((settings as any)?.social_login || {}) as { google?: boolean; facebook?: boolean };
  return { google: Boolean(raw.google), facebook: Boolean(raw.facebook) };
};

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

const FacebookMark = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      fill="currentColor"
      d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"
    />
  </svg>
);

export const SocialLoginButtons: React.FC<{
  settings?: SiteSettings;
  /** Where to land after signing in (a path on this site) */
  returnTo?: string;
  /** Text above the buttons is "or" below a form, or none when the buttons come first */
  dividerText?: string;
  dividerPosition?: 'before' | 'after';
}> = ({ settings, returnTo = '/account', dividerText = 'or continue with', dividerPosition = 'before' }) => {
  const live = socialLoginOf(settings);
  const [going, setGoing] = useState<'' | 'google' | 'facebook'>('');
  if (!live.google && !live.facebook) return null;

  const start = (provider: 'google' | 'facebook') => {
    setGoing(provider);
    // A random value this tab keeps: the session that comes back is accepted
    // only together with it, so nobody can sign a visitor into another account
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      sessionStorage.setItem(OAUTH_NONCE_KEY, nonce);
    } catch {
      /* private mode without storage: the sign-in cannot be completed safely */
    }
    window.location.href = `/api/auth/oauth/${provider}/start?return=${encodeURIComponent(returnTo)}&cn=${nonce}`;
  };

  const divider = (
    <div className="flex items-center gap-(--ds-s-3) text-(length:--ds-fs-sm) text-(--ds-text-muted)" aria-hidden="true">
      <span className="h-px flex-1 bg-(--ds-border)" />
      <span>{dividerText}</span>
      <span className="h-px flex-1 bg-(--ds-border)" />
    </div>
  );

  const both = live.google && live.facebook;
  return (
    <div className="space-y-(--ds-s-4)">
      {dividerPosition === 'before' && divider}
      <div className={`grid gap-(--ds-s-3) ${both ? 'sm:grid-cols-2' : ''}`}>
        {live.google && (
          <button
            type="button"
            onClick={() => start('google')}
            disabled={Boolean(going)}
            className="h-(--ds-h-lg) inline-flex items-center justify-center gap-(--ds-s-2) px-(--ds-s-4) rounded-(--ds-r-md) border border-(--ds-border-strong) bg-(--ds-surface) text-(--ds-text) font-(--ds-fw-semibold) text-(length:--ds-fs-md) hover:bg-(--ds-surface-2) hover:border-(--ds-gray-400) transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-wait"
          >
            {going === 'google' ? <span className="ds-spinner w-4 h-4" /> : <GoogleMark />}
            <span>{both ? 'Google' : 'Continue with Google'}</span>
          </button>
        )}
        {live.facebook && (
          <button
            type="button"
            onClick={() => start('facebook')}
            disabled={Boolean(going)}
            className="h-(--ds-h-lg) inline-flex items-center justify-center gap-(--ds-s-2) px-(--ds-s-4) rounded-(--ds-r-md) text-white font-(--ds-fw-semibold) text-(length:--ds-fs-md) bg-[#1565d8] hover:bg-[#0f56bd] transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-wait"
          >
            {going === 'facebook' ? (
              <span className="ds-spinner w-4 h-4" style={{ borderColor: 'rgba(255,255,255,.4)', borderTopColor: '#fff' }} />
            ) : (
              <FacebookMark />
            )}
            <span>{both ? 'Facebook' : 'Continue with Facebook'}</span>
          </button>
        )}
      </div>
      {dividerPosition === 'after' && divider}
    </div>
  );
};

/** A sign-in error the server sent back in the address (#oauth_error=…), read once */
export function takeOauthError(): string {
  try {
    const match = (window.location.hash || '').match(/[#&]oauth_error=([^&]+)/);
    if (!match) return '';
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    return decodeURIComponent(match[1]).slice(0, 200);
  } catch {
    return '';
  }
}
