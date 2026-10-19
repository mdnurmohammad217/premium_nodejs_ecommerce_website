import React, { useEffect, useRef, useState } from 'react';
import { SocialLoginButtons, takeOauthError } from './SocialLoginButtons.tsx';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  KeyRound,
  MessageSquareText,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { useAuth, AppUser } from '../../context/AuthContext.tsx';
import { SiteSettings } from '../../types/index.ts';
import { CodeInput, NewPasswordForm, cleanSignInId } from './PasswordResetParts.tsx';

interface LoginPageProps {
  onBackToHome: () => void;
  onLoginSuccess: (user?: AppUser) => void;
  settings?: SiteSettings;
  /** Rendered above the card — the storefront header */
  header?: React.ReactNode;
  /** Rendered below the card — the storefront footer */
  footer?: React.ReactNode;
  /** Switch to the customer registration screen */
  onOpenSignup?: () => void;
  onOpenWholesaleSignup?: () => void;
  /** A short note above the form, e.g. why the visitor was sent here */
  notice?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^01[3-9]\d{8}$/;

type ResetStep = 'forgot' | 'code' | 'newpass' | 'done';

interface ResetOptions {
  sms: boolean;
  email: boolean;
  storePhone?: string;
}

const formatWait = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Sign-in screen. The sign-in copy is English by request, and server error
 * messages are mapped to English equivalents below; the password-recovery
 * panel is in English as well.
 * No demo credentials and no role shortcuts: the server verifies every login.
 * The logo comes from Dashboard -> Header & Logo, so it never needs re-uploading.
 */
export const LoginPage: React.FC<LoginPageProps> = ({
  onBackToHome,
  onLoginSuccess,
  settings,
  header,
  footer,
  onOpenSignup,
  onOpenWholesaleSignup,
  notice,
}) => {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [mode, setMode] = useState<'login' | ResetStep>('login');
  const [resetId, setResetId] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetOptions, setResetOptions] = useState<ResetOptions | null>(null);
  const [noChannel, setNoChannel] = useState<{ message: string; phone: string } | null>(null);
  const [sentTo, setSentTo] = useState<{ channel: 'sms' | 'email'; destination: string; minutes: number } | null>(null);
  const [code, setCode] = useState('');
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [resetToken, setResetToken] = useState('');
  const passwordRef = useRef<HTMLInputElement | null>(null);

  // v3.12 — back from Google / Facebook with a problem: say what went wrong
  useEffect(() => {
    const problem = takeOauthError();
    if (problem) setErrorMessage(problem);
  }, []);

  // Resend countdown
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const logoConfig = settings?.logo_config;
  const storeName = logoConfig?.pharmacyName || settings?.general?.storeName || '';
  const logoUrl = logoConfig?.desktopLogoUrl || logoConfig?.mobileLogoUrl || '';
  const [logoFailed, setLogoFailed] = useState(false);

  const validate = () => {
    const errors: { email?: string; password?: string } = {};
    const id = email.trim();
    if (!id) errors.email = 'Email or mobile number is required';
    else if (!EMAIL_RE.test(id) && !PHONE_RE.test(id.replace(/[\s-]+/g, '')))
      errors.email = 'Enter a valid email or 11-digit mobile number';
    if (!password) errors.password = 'Password is required';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    if (!validate()) return;

    setIsSubmitting(true);
    // One form for everyone: the server recognises the owner, staff and
    // customer accounts and answers with the right role.
    const res = await signIn(email.trim(), password);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMessage('Signed in successfully. Redirecting...');
      setPassword('');
      setTimeout(() => onLoginSuccess(res.user), 400);
    } else {
      setErrorMessage(res.error || 'Incorrect email/phone or password.');
    }
  };

  const openForgot = () => {
    // Carry over whatever was typed into the sign-in field
    setResetId((current) => current || email.trim());
    setResetError('');
    setNoChannel(null);
    setCode('');
    setCodeInvalid(false);
    setMode('forgot');
    if (!resetOptions) {
      fetch('/api/auth/reset-options')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setResetOptions(data))
        .catch(() => undefined);
    }
  };

  const backToLogin = (prefill?: string) => {
    if (prefill) setEmail(prefill);
    setPassword('');
    setResetError('');
    setMode('login');
    if (prefill) window.setTimeout(() => passwordRef.current?.focus(), 50);
  };

  /** Step 1 — ask for a code (also used by "Resend code") */
  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setResetError('');
    setNoChannel(null);
    const raw = resetId.trim();
    const cleaned = cleanSignInId(raw);
    if (!raw) {
      setResetError('Enter your mobile number or email.');
      return;
    }
    if (!EMAIL_RE.test(cleaned) && !PHONE_RE.test(cleaned)) {
      setResetError('Enter a valid email or an 11-digit mobile number.');
      return;
    }

    setResetBusy(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleaned }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 && data?.code === 'NO_CHANNEL') {
        setNoChannel({ message: data.error, phone: data.storePhone || '' });
        return;
      }
      if (res.status === 429 && data?.retryAfter && mode === 'code') {
        setResendIn(Number(data.retryAfter) || 60);
        return;
      }
      if (!res.ok || !data?.success) {
        setResetError(data?.error || "We couldn't send the code. Please try again.");
        return;
      }
      setSentTo({ channel: data.channel, destination: data.destination, minutes: Number(data.expiresInMinutes) || 10 });
      setResendIn(Number(data.resendIn) || 60);
      setCode('');
      setCodeInvalid(false);
      setMode('code');
    } catch {
      setResetError("We couldn't reach the server. Check your internet connection and try again.");
    } finally {
      setResetBusy(false);
    }
  };

  /** Step 2 — the code unlocks a one-time reset token */
  const verifyCode = async (value = code) => {
    if (value.length !== 6 || resetBusy) return;
    setResetError('');
    setResetBusy(true);
    try {
      const res = await fetch('/api/auth/verify-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanSignInId(resetId), code: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.resetToken) {
        setCodeInvalid(true);
        setCode(''); // ready for the next try without deleting six digits
        setResetError(data?.error || 'That code is not right.');
        if (data?.expired) setResendIn(0);
        return;
      }
      setResetToken(data.resetToken);
      setMode('newpass');
    } catch {
      setResetError("We couldn't reach the server. Check your internet connection and try again.");
    } finally {
      setResetBusy(false);
    }
  };

  /** Step 3 — save the new password */
  const saveNewPassword = async (next: string): Promise<string | void> => {
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) return data?.error || "We couldn't change your password. Please try again.";
      setMode('done');
    } catch {
      return "We couldn't reach the server. Check your internet connection and try again.";
    }
  };

  const brand =
    logoUrl && !logoFailed ? (
      <img
        src={logoUrl}
        alt={storeName}
        loading="lazy"
        onError={() => setLogoFailed(true)}
        className="h-11 w-auto max-w-56 object-contain"
      />
    ) : storeName ? (
      <span className="text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text)">{storeName}</span>
    ) : null;

  const spinner = (
    <span
      className="ds-spinner"
      style={{
        borderColor: 'color-mix(in srgb, var(--primary-foreground) 40%, transparent)',
        borderTopColor: 'var(--primary-foreground)',
      }}
    />
  );

  return (
    <div className="min-h-screen bg-(--ds-bg) flex flex-col">
      {header}

      <main className="relative flex-1 flex items-center justify-center px-(--ds-s-4) py-(--ds-s-10) overflow-hidden">
        {/* Brand-tinted backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(900px 440px at 12% -10%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 60%), radial-gradient(760px 420px at 110% 110%, color-mix(in srgb, var(--primary) 14%, transparent), transparent 62%)',
          }}
        />

        <div className="relative w-full max-w-md">
          <div className="ds-card ds-scale-in shadow-(--ds-shadow-lg) rounded-(--ds-r-2xl) p-(--ds-card-pad-lg) sm:p-(--ds-s-10)">
            {mode === 'login' ? (
              <>
                <div className="flex flex-col items-center text-center gap-(--ds-s-3) mb-(--ds-s-8)">
                  {brand}
                  <div>
                    <h1 className="text-(length:--ds-fs-2xl) sm:text-(length:--ds-fs-3xl) font-(--ds-fw-bold) text-(--ds-text)">
                      Welcome back
                    </h1>
                    <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-muted)">
                      {storeName ? `Sign in to continue to ${storeName}` : 'Sign in to continue'}
                    </p>
                  </div>
                </div>

                {notice && !errorMessage && !successMessage && (
                  <div
                    role="note"
                    className="mb-(--ds-s-5) flex items-start gap-(--ds-s-2) rounded-(--ds-r-md) bg-(--ds-info-soft) text-(--ds-info-text) px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm)"
                  >
                    <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{notice}</span>
                  </div>
                )}

                {errorMessage && (
                  <div
                    role="alert"
                    className="mb-(--ds-s-5) flex items-start gap-(--ds-s-2) rounded-(--ds-r-md) bg-(--ds-danger-soft) text-(--ds-danger-text) px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm)"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {successMessage && (
                  <div
                    role="status"
                    className="mb-(--ds-s-5) flex items-start gap-(--ds-s-2) rounded-(--ds-r-md) bg-(--ds-success-soft) text-(--ds-success-text) px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm)"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{successMessage}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-(--ds-s-5)" noValidate>
                  <div>
                    <label htmlFor="login-email" className="ds-label">
                      Email or Mobile
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-email"
                        type="text"
                        autoComplete="username"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setFieldErrors((prev) => ({ ...prev, email: undefined }));
                        }}
                        placeholder="Email address or 01XXXXXXXXX"
                        aria-invalid={Boolean(fieldErrors.email) || undefined}
                        className="ds-input h-(--ds-h-lg) pl-9"
                      />
                    </div>
                    {fieldErrors.email && <p className="ds-error-text">{fieldErrors.email}</p>}
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between gap-(--ds-s-2)">
                      <label htmlFor="login-password" className="ds-label">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={openForgot}
                        className="mb-1.5 text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) hover:underline cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-password"
                        ref={passwordRef}
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setFieldErrors((prev) => ({ ...prev, password: undefined }));
                        }}
                        placeholder="Enter your password"
                        aria-invalid={Boolean(fieldErrors.password) || undefined}
                        className="ds-input h-(--ds-h-lg) pl-9 pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="ds-btn ds-btn-ghost ds-btn-icon ds-btn-sm absolute right-1.5 top-1/2 -translate-y-1/2"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {fieldErrors.password && <p className="ds-error-text">{fieldErrors.password}</p>}

                    <label className="mt-(--ds-s-3) inline-flex items-center gap-(--ds-s-2) text-(length:--ds-fs-sm) text-(--ds-text-soft) cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="w-4 h-4 cursor-pointer accent-(--primary)"
                      />
                      <span>Remember me</span>
                    </label>
                  </div>

                  <button type="submit" disabled={isSubmitting} className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block">
                    {isSubmitting ? (
                      <>
                        {spinner}
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <span>Sign in</span>
                    )}
                  </button>
                </form>

                {/* v3.12 — Google / Facebook (shown only when switched on in the dashboard) */}
                <div className="mt-(--ds-s-5)">
                  <SocialLoginButtons settings={settings} returnTo="/account" />
                </div>

                <div className="mt-(--ds-s-6) pt-(--ds-s-5) border-t border-(--ds-border-soft) text-center text-(length:--ds-fs-base) text-(--ds-text-muted)">
                  New customer?{' '}
                  <button
                    type="button"
                    onClick={onOpenSignup}
                    className="font-(--ds-fw-bold) text-(--primary) hover:underline cursor-pointer"
                  >
                    Create an account
                  </button>
                  {onOpenWholesaleSignup && (
                    <p className="mt-(--ds-s-2)">
                      Buying for a shop or business?{' '}
                      <button
                        type="button"
                        onClick={onOpenWholesaleSignup}
                        className="font-(--ds-fw-bold) text-(--primary) hover:underline cursor-pointer"
                      >
                        Register as Wholesale Customer
                      </button>
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="ds-fade-in" key={mode}>
                {mode !== 'done' && (
                  <button
                    type="button"
                    onClick={() => (mode === 'code' ? setMode('forgot') : backToLogin())}
                    className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text-muted) hover:text-(--ds-text) cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{mode === 'code' ? 'Change number or email' : 'Back to sign in'}</span>
                  </button>
                )}

                {/* Where you are in the three steps */}
                {mode !== 'done' && (
                  <ol className="mt-(--ds-s-5) grid grid-cols-3 gap-(--ds-s-2)" aria-label="Password reset steps">
                    {(['forgot', 'code', 'newpass'] as const).map((step, index) => {
                      const order = ['forgot', 'code', 'newpass'].indexOf(mode);
                      const state = index < order ? 'done' : index === order ? 'current' : 'next';
                      return (
                        <li key={step} aria-current={state === 'current' ? 'step' : undefined}>
                          <span
                            className="block h-1.5 rounded-(--ds-r-full) transition-colors duration-(--ds-dur)"
                            style={{
                              background:
                                state === 'next' ? 'var(--ds-gray-150)' : state === 'done' ? 'color-mix(in srgb, var(--primary) 45%, transparent)' : 'var(--primary)',
                            }}
                          />
                          <span
                            className="mt-1.5 block text-(length:--ds-fs-xs) font-(--ds-fw-semibold)"
                            style={{ color: state === 'next' ? 'var(--ds-text-faint)' : 'var(--ds-text-soft)' }}
                          >
                            {['Your account', 'Enter code', 'New password'][index]}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {mode === 'forgot' && (
                  <>
                    <h1 className="mt-(--ds-s-5) text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">Reset your password</h1>
                    {noChannel || (resetOptions && !resetOptions.sms && !resetOptions.email) ? (
                      <div className="mt-(--ds-s-4)">
                        <div
                          role="status"
                          className="flex items-start gap-(--ds-s-2) rounded-(--ds-r-md) bg-(--ds-warning-soft) text-(--ds-warning-text) px-(--ds-s-3) py-(--ds-s-3) text-(length:--ds-fs-base)"
                        >
                          <AlertCircle className="w-4 h-4 shrink-0 mt-1" />
                          <span>
                            {noChannel?.message ||
                              `Resetting by SMS or email is not available right now. ${
                                resetOptions?.storePhone ? `Call ${resetOptions.storePhone}` : 'Contact the shop'
                              } and we will reset it for you.`}
                          </span>
                        </div>
                        {(noChannel?.phone || resetOptions?.storePhone) && (
                          <a
                            href={`tel:${noChannel?.phone || resetOptions?.storePhone}`}
                            className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block mt-(--ds-s-5)"
                          >
                            <Phone className="w-4 h-4" />
                            <span>Call {noChannel?.phone || resetOptions?.storePhone}</span>
                          </a>
                        )}
                        <button type="button" onClick={() => backToLogin()} className="ds-btn ds-btn-secondary ds-btn-lg ds-btn-block mt-(--ds-s-3)">
                          Back to sign in
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={requestCode} noValidate>
                        <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-soft)">
                          {resetOptions && resetOptions.sms && !resetOptions.email
                            ? 'Enter the mobile number or email you sign in with. We will text a 6-digit code to your mobile.'
                            : resetOptions && resetOptions.email && !resetOptions.sms
                            ? 'Enter the mobile number or email you sign in with. We will email you a 6-digit code.'
                            : 'Enter the mobile number or email you sign in with. We will send you a 6-digit code.'}
                        </p>

                        <div className="mt-(--ds-s-5)">
                          <label htmlFor="forgot-id" className="ds-label">
                            Mobile number or email
                          </label>
                          <div className="relative">
                            <Mail className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              id="forgot-id"
                              type="text"
                              autoComplete="username"
                              autoFocus
                              value={resetId}
                              onChange={(e) => {
                                setResetId(e.target.value);
                                setResetError('');
                              }}
                              placeholder="01XXXXXXXXX or email"
                              aria-invalid={Boolean(resetError) || undefined}
                              className="ds-input h-(--ds-h-lg) pl-9"
                            />
                          </div>
                          {resetError && <p className="ds-error-text">{resetError}</p>}
                        </div>

                        <button type="submit" disabled={resetBusy} className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block mt-(--ds-s-5)">
                          {resetBusy ? spinner : <MessageSquareText className="w-4 h-4" />}
                          <span>{resetBusy ? 'Sending code...' : 'Send code'}</span>
                        </button>
                      </form>
                    )}
                  </>
                )}

                {mode === 'code' && sentTo && (
                  <div>
                    <h1 className="mt-(--ds-s-5) text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">Enter the code</h1>
                    <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-soft)">
                      We {sentTo.channel === 'sms' ? 'texted' : 'emailed'} a 6-digit code to{' '}
                      <span className="font-(--ds-fw-semibold) text-(--ds-text) ds-num">{sentTo.destination}</span>. It expires in{' '}
                      {sentTo.minutes} minutes.
                      {sentTo.channel === 'email' ? ' The email also has a link you can open instead.' : ''}
                    </p>

                    <div className="mt-(--ds-s-5)">
                      <CodeInput
                        value={code}
                        onChange={(value) => {
                          setCode(value);
                          setCodeInvalid(false);
                          setResetError('');
                        }}
                        onComplete={(value) => void verifyCode(value)}
                        invalid={codeInvalid}
                        disabled={resetBusy}
                      />
                      {resetError && (
                        <p role="alert" className="ds-error-text">
                          {resetError}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={resetBusy || code.length !== 6}
                      onClick={() => void verifyCode()}
                      className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block mt-(--ds-s-5)"
                    >
                      {resetBusy ? spinner : <ShieldCheck className="w-4 h-4" />}
                      <span>{resetBusy ? 'Checking...' : 'Verify code'}</span>
                    </button>

                    <p className="mt-(--ds-s-4) text-center text-(length:--ds-fs-sm) text-(--ds-text-muted)">
                      Didn't get it?{' '}
                      {resendIn > 0 ? (
                        <span className="ds-num">Resend in {formatWait(resendIn)}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void requestCode()}
                          disabled={resetBusy}
                          className="font-(--ds-fw-semibold) text-(--primary) hover:underline cursor-pointer"
                        >
                          Send a new code
                        </button>
                      )}
                    </p>
                  </div>
                )}

                {mode === 'newpass' && (
                  <NewPasswordForm onSubmit={saveNewPassword} submitLabel="Save new password">
                    <h1 className="mt-(--ds-s-5) text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">Choose a new password</h1>
                    <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-soft)">
                      Code confirmed. Pick a password you have not used here before.
                    </p>
                  </NewPasswordForm>
                )}

                {mode === 'done' && (
                  <div className="text-center py-(--ds-s-2)">
                    <span className="mx-auto w-14 h-14 rounded-(--ds-r-full) bg-(--ds-success-soft) text-(--ds-success) inline-flex items-center justify-center">
                      <CheckCircle2 className="w-7 h-7" />
                    </span>
                    <h1 className="mt-(--ds-s-4) text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">Password changed</h1>
                    <p className="mt-(--ds-s-2) text-(length:--ds-fs-md) text-(--ds-text-soft)">
                      Sign in with your new password. Any other device that was signed in has been signed out.
                    </p>
                    <button
                      type="button"
                      onClick={() => backToLogin(cleanSignInId(resetId))}
                      className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block mt-(--ds-s-6)"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>Sign in</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-(--ds-s-4) text-center">
            <button
              type="button"
              onClick={onBackToHome}
              className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text-muted) hover:text-(--ds-text) cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to store</span>
            </button>
          </div>
        </div>
      </main>

      {footer}
    </div>
  );
};
