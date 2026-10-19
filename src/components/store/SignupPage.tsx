import React, { useState } from 'react';
import { SocialLoginButtons } from './SocialLoginButtons.tsx';
import { normalizeBdPhone } from '../../lib/phone.ts';
import { User, Phone, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Store, MapPin, Briefcase } from 'lucide-react';
import { useAuth, AppUser } from '../../context/AuthContext.tsx';
import { tracking } from '../../lib/tracking.ts';
import { SiteSettings } from '../../types/index.ts';
import { BUSINESS_TYPES } from '../../lib/wholesale.ts';

interface SignupPageProps {
  settings?: SiteSettings;
  onSignupSuccess: (user?: AppUser) => void;
  onOpenLogin: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  /** 'wholesale' adds the business details and applies for a wholesale account */
  mode?: 'regular' | 'wholesale';
  onSwitchMode?: (mode: 'regular' | 'wholesale') => void;
}


/** Customer self sign-up. Phone is the account identifier (013-019, 11 digits). */
export const SignupPage: React.FC<SignupPageProps> = ({
  settings,
  onSignupSuccess,
  onOpenLogin,
  header,
  footer,
  mode = 'regular',
  onSwitchMode,
}) => {
  const { registerCustomer, registerWholesale } = useAuth();
  const wholesale = mode === 'wholesale';

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    confirm: '',
    businessName: '',
    businessAddress: '',
    businessType: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const logoConfig = settings?.logo_config;
  const storeName = logoConfig?.pharmacyName || settings?.general?.storeName || '';
  const logoUrl = logoConfig?.desktopLogoUrl || logoConfig?.mobileLogoUrl || '';
  const [logoFailed, setLogoFailed] = useState(false);

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    const next: Record<string, string> = {};
    const phone = form.phone.replace(/[\s-]+/g, '');

    if (!form.name.trim()) next.name = 'Full name is required';
    if (!phone) next.phone = 'Mobile number is required';
    else if (!/^\d{11}$/.test(phone)) next.phone = 'Number must be exactly 11 digits';
    else if (!/^01[3-9]\d{8}$/.test(phone)) next.phone = 'Number must start between 013 and 019';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = 'Enter a valid email address';
    if (form.password.length < 8) next.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirm) next.confirm = 'Passwords do not match';
    if (wholesale) {
      if (!form.businessName.trim()) next.businessName = 'Business or shop name is required';
      if (!form.businessAddress.trim()) next.businessAddress = 'Business address is required';
      if (!form.businessType) next.businessType = 'Choose your business type';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    const res = wholesale
      ? await registerWholesale({
          name: form.name.trim(),
          phone,
          email: form.email.trim() || undefined,
          password: form.password,
          businessName: form.businessName.trim(),
          businessAddress: form.businessAddress.trim(),
          businessType: form.businessType,
        })
      : await registerCustomer({
          name: form.name.trim(),
          phone,
          email: form.email.trim() || undefined,
          password: form.password,
        });
    setBusy(false);

    if (res.success) {
      tracking.completeRegistration(wholesale ? 'wholesale' : 'website');
      setSuccess(
        wholesale
          ? res.user?.wholesaleStatus === 'approved'
            ? 'Wholesale account approved. Signing you in...'
            : 'Application received. We will review it shortly — signing you in...'
          : 'Account created. Signing you in...'
      );
      setTimeout(() => onSignupSuccess(res.user), wholesale ? 1200 : 500);
    } else {
      setServerError(res.error || 'Could not create the account.');
    }
  };

  const fields = [
    { key: 'name', label: 'Full Name', icon: User, placeholder: 'Your full name', type: 'text', autoComplete: 'name' },
    { key: 'phone', label: 'Mobile Number', icon: Phone, placeholder: '01XXXXXXXXX', type: 'tel', autoComplete: 'tel' },
    { key: 'email', label: 'Email (optional)', icon: Mail, placeholder: 'you@example.com', type: 'email', autoComplete: 'email' },
  ];

  return (
    <div className="min-h-screen bg-(--ds-bg) flex flex-col">
      {header}

      <main className="relative flex-1 flex items-center justify-center px-(--ds-s-4) py-(--ds-s-10) overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(900px 460px at 90% -10%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 60%)',
          }}
        />

        <div className="relative w-full max-w-md">
          <div className="ds-card ds-scale-in shadow-(--ds-shadow-lg) rounded-(--ds-r-2xl) p-(--ds-card-pad-lg) sm:p-(--ds-s-10)">
            <div className="flex flex-col items-center text-center gap-(--ds-s-3) mb-(--ds-s-8)">
              {logoUrl && !logoFailed ? (
                <img
                  src={logoUrl}
                  alt={storeName}
                  loading="lazy"
                  onError={() => setLogoFailed(true)}
                  className="h-11 w-auto max-w-56 object-contain"
                />
              ) : storeName ? (
                <span className="text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text)">{storeName}</span>
              ) : null}
              <div>
                <h1 className="text-(length:--ds-fs-2xl) sm:text-(length:--ds-fs-3xl) font-(--ds-fw-bold) text-(--ds-text)">
                  {wholesale ? 'Wholesale account' : 'Create account'}
                </h1>
                <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-muted)">
                  {wholesale
                    ? 'For shops and businesses buying at wholesale prices'
                    : 'Track your orders and check out faster'}
                </p>
              </div>
            </div>

            {onSwitchMode && (
              <div
                role="tablist"
                aria-label="Account type"
                className="grid grid-cols-2 gap-(--ds-s-1) p-(--ds-s-1) mb-(--ds-s-6) rounded-(--ds-r-lg) bg-(--ds-surface-3)"
              >
                {(
                  [
                    { id: 'regular', label: 'Customer' },
                    { id: 'wholesale', label: 'Wholesale' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={mode === tab.id}
                    onClick={() => mode !== tab.id && onSwitchMode(tab.id)}
                    className={`h-(--ds-h-md) rounded-(--ds-r-md) text-(length:--ds-fs-base) font-(--ds-fw-semibold) transition-colors cursor-pointer ${
                      mode === tab.id
                        ? 'bg-(--ds-surface) text-(--ds-text) shadow-(--ds-shadow-xs)'
                        : 'text-(--ds-text-muted) hover:text-(--ds-text)'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {serverError && (
              <div
                role="alert"
                className="mb-(--ds-s-5) flex items-start gap-(--ds-s-2) rounded-(--ds-r-md) bg-(--ds-danger-soft) text-(--ds-danger-text) px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm)"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{serverError}</span>
              </div>
            )}

            {success && (
              <div
                role="status"
                className="mb-(--ds-s-5) flex items-start gap-(--ds-s-2) rounded-(--ds-r-md) bg-(--ds-success-soft) text-(--ds-success-text) px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm)"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            {/* v3.12 — one tap with Google / Facebook (regular customers; when switched on) */}
            {!wholesale && (
              <div className="mb-(--ds-s-5)">
                <SocialLoginButtons settings={settings} returnTo="/account" dividerPosition="after" dividerText="or sign up with your mobile number" />
              </div>
            )}

            <form onSubmit={submit} className="space-y-(--ds-s-4)" noValidate>
              {fields.map(({ key, label, icon: Icon, placeholder, type, autoComplete }) => (
                <div key={key}>
                  <label htmlFor={`su-${key}`} className="ds-label">
                    {label}
                  </label>
                  <div className="relative">
                    <Icon className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id={`su-${key}`}
                      type={type}
                      autoComplete={autoComplete}
                      inputMode={key === 'phone' ? 'numeric' : undefined}
                      value={(form as any)[key]}
                      onChange={(e) => {
                        if (key === 'phone') {
                          // v3.11 — "+880 1712-345678" from autofill becomes 01712345678
                          set(key, normalizeBdPhone(e.target.value));
                          return;
                        }
                        set(key, e.target.value);
                      }}
                      placeholder={placeholder}
                      aria-invalid={Boolean(errors[key]) || undefined}
                      className={`ds-input h-(--ds-h-lg) pl-9 ${key === 'phone' ? 'ds-num' : ''}`}
                    />
                  </div>
                  {errors[key] && <p className="ds-error-text">{errors[key]}</p>}
                </div>
              ))}

              {wholesale && (
                <div className="space-y-(--ds-s-4) pt-(--ds-s-2) border-t border-(--ds-border-soft)">
                  <div>
                    <label htmlFor="su-businessName" className="ds-label">
                      Business / Shop Name
                    </label>
                    <div className="relative">
                      <Store className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="su-businessName"
                        autoComplete="organization"
                        value={form.businessName}
                        onChange={(e) => set('businessName', e.target.value)}
                        placeholder="e.g. Karim Pharmacy"
                        aria-invalid={Boolean(errors.businessName) || undefined}
                        className="ds-input h-(--ds-h-lg) pl-9"
                      />
                    </div>
                    {errors.businessName && <p className="ds-error-text">{errors.businessName}</p>}
                  </div>

                  <div>
                    <label htmlFor="su-businessType" className="ds-label">
                      Business Type
                    </label>
                    <div className="relative">
                      <Briefcase className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                        id="su-businessType"
                        value={form.businessType}
                        onChange={(e) => set('businessType', e.target.value)}
                        aria-invalid={Boolean(errors.businessType) || undefined}
                        className="ds-select h-(--ds-h-lg) pl-9"
                      >
                        <option value="">Choose one</option>
                        {BUSINESS_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>
                    {errors.businessType && <p className="ds-error-text">{errors.businessType}</p>}
                  </div>

                  <div>
                    <label htmlFor="su-businessAddress" className="ds-label">
                      Business Address
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-(--ds-s-3) pointer-events-none" />
                      <textarea
                        id="su-businessAddress"
                        rows={2}
                        autoComplete="street-address"
                        value={form.businessAddress}
                        onChange={(e) => set('businessAddress', e.target.value)}
                        placeholder="Shop number, road, area, district"
                        aria-invalid={Boolean(errors.businessAddress) || undefined}
                        className="ds-textarea pl-9 resize-none"
                      />
                    </div>
                    {errors.businessAddress && <p className="ds-error-text">{errors.businessAddress}</p>}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="su-password" className="ds-label">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="su-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    placeholder="At least 8 characters"
                    aria-invalid={Boolean(errors.password) || undefined}
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
                {errors.password && <p className="ds-error-text">{errors.password}</p>}
              </div>

              <div>
                <label htmlFor="su-confirm" className="ds-label">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="su-confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.confirm}
                    onChange={(e) => set('confirm', e.target.value)}
                    placeholder="Re-type your password"
                    aria-invalid={Boolean(errors.confirm) || undefined}
                    className="ds-input h-(--ds-h-lg) pl-9"
                  />
                </div>
                {errors.confirm && <p className="ds-error-text">{errors.confirm}</p>}
              </div>

              <button type="submit" disabled={busy} className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block">
                {busy ? (
                  <>
                    <span
                      className="ds-spinner"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--primary-foreground) 40%, transparent)',
                        borderTopColor: 'var(--primary-foreground)',
                      }}
                    />
                    <span>{wholesale ? 'Submitting...' : 'Creating account...'}</span>
                  </>
                ) : (
                  <span>{wholesale ? 'Register as Wholesale Customer' : 'Create account'}</span>
                )}
              </button>
            </form>

            <div className="mt-(--ds-s-6) pt-(--ds-s-5) border-t border-(--ds-border-soft) text-center text-(length:--ds-fs-base) text-(--ds-text-muted)">
              Already have an account?{' '}
              <button
                type="button"
                onClick={onOpenLogin}
                className="font-(--ds-fw-bold) text-(--primary) hover:underline cursor-pointer"
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      </main>

      {footer}
    </div>
  );
};
