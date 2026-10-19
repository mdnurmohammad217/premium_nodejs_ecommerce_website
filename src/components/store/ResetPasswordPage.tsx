import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, KeyRound, Loader2 } from 'lucide-react';
import { NewPasswordForm } from './PasswordResetParts.tsx';

interface ResetPasswordPageProps {
  /** The `token` query parameter from the emailed or texted link */
  token?: string;
  onNavigate: (view: string, params?: any) => void;
  /** Storefront header and footer, so the page sits inside the shop */
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * /reset-password?token=… — opened from the reset email (or a link the shop
 * texted from the dashboard). The link is checked first, so an expired one
 * says so before anyone types a new password.
 */
export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ token = '', onNavigate, header, footer }) => {
  const [state, setState] = useState<'checking' | 'ready' | 'invalid' | 'done'>(token ? 'checking' : 'invalid');
  const [invalidReason, setInvalidReason] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/auth/reset-token?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setState(data?.valid === false ? 'invalid' : 'ready');
      })
      .catch(() => !cancelled && setState('ready'));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const save = async (password: string): Promise<string | void> => {
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) {
        setState('done');
        return;
      }
      if (res.status === 400 && /token|link|expired/i.test(String(data?.error || ''))) {
        setInvalidReason(data.error);
        setState('invalid');
        return;
      }
      return data?.error || "We couldn't change your password. Please try again.";
    } catch {
      return "We couldn't reach the server. Check your internet connection and try again.";
    }
  };

  const goLogin = (event: React.MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate('login');
  };

  let body: React.ReactNode;
  if (state === 'checking') {
    body = (
      <div className="flex items-center justify-center gap-(--ds-s-2) py-(--ds-s-10) text-(--ds-text-muted)">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Checking your link...</span>
      </div>
    );
  } else if (state === 'done') {
    body = (
      <div className="text-center">
        <span className="mx-auto w-14 h-14 rounded-(--ds-r-full) bg-(--ds-success-soft) text-(--ds-success) inline-flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7" />
        </span>
        <h1 className="mt-(--ds-s-4) text-(length:--ds-fs-2xl) font-(--ds-fw-bold)">Password changed</h1>
        <p className="mt-(--ds-s-2) text-(length:--ds-fs-md) text-(--ds-text-soft)">
          Sign in with your new password. Any other device that was signed in has been signed out.
        </p>
        <a href="/login" onClick={goLogin} className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block mt-(--ds-s-6)">
          Sign in
        </a>
      </div>
    );
  } else if (state === 'invalid') {
    body = (
      <div className="text-center">
        <span className="mx-auto w-14 h-14 rounded-(--ds-r-full) bg-(--ds-danger-soft) text-(--ds-danger) inline-flex items-center justify-center">
          <AlertCircle className="w-7 h-7" />
        </span>
        <h1 className="mt-(--ds-s-4) text-(length:--ds-fs-2xl) font-(--ds-fw-bold)">This link no longer works</h1>
        <p className="mt-(--ds-s-2) text-(length:--ds-fs-md) text-(--ds-text-soft)">
          {token
            ? invalidReason || 'Reset links work once and expire after a short time. Ask for a new code from the sign-in page.'
            : 'This link is missing part of its address. Open the full link from your email or message, or ask for a new code.'}
        </p>
        <a href="/login" onClick={goLogin} className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block mt-(--ds-s-6)">
          Go to sign in
        </a>
      </div>
    );
  } else {
    body = (
      <NewPasswordForm onSubmit={save}>
        <span className="w-12 h-12 rounded-(--ds-r-lg) bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-(--primary) inline-flex items-center justify-center">
          <KeyRound className="w-6 h-6" />
        </span>
        <h1 className="mt-(--ds-s-4) text-(length:--ds-fs-2xl) font-(--ds-fw-bold)">Choose a new password</h1>
        <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-soft)">
          After saving, every device signed in to your account is signed out.
        </p>
      </NewPasswordForm>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-(--ds-bg)">
      {header}
      <main className="flex-1 flex items-start sm:items-center justify-center px-(--ds-s-4) py-(--ds-s-10)">
        <div className="ds-card ds-slide-up w-full max-w-md p-(--ds-card-pad-lg)">
          {body}
          {state === 'ready' && (
            <p className="mt-(--ds-s-4) text-center text-(length:--ds-fs-sm) text-(--ds-text-muted)">
              Remembered it?{' '}
              <a href="/login" onClick={goLogin} className="font-(--ds-fw-semibold) text-(--primary) hover:underline">
                Sign in
              </a>
            </p>
          )}
        </div>
      </main>
      {footer}
    </div>
  );
};
