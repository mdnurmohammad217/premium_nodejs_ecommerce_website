import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

/**
 * Pieces shared by the sign-in page's "Forgot password" flow and the
 * /reset-password page opened from an emailed or texted link.
 */

export const MIN_PASSWORD = 8;

/** 0–4 score from length and character variety */
export const scorePassword = (value: string): number => {
  if (!value) return 0;
  let score = 0;
  if (value.length >= MIN_PASSWORD) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  else if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) score += 0.5;
  return Math.min(4, Math.round(score));
};

const STRENGTH = [
  { label: 'Very weak', color: 'var(--ds-danger)' },
  { label: 'Weak', color: 'var(--ds-danger)' },
  { label: 'Fair', color: 'var(--ds-warning)' },
  { label: 'Good', color: 'var(--ds-success)' },
  { label: 'Strong', color: 'var(--ds-success)' },
];

interface NewPasswordFormProps {
  /** Resolves to an error message, or nothing when the password was saved */
  onSubmit: (password: string) => Promise<string | void>;
  submitLabel?: string;
  children?: React.ReactNode;
}

/** New password + confirmation, with a strength meter and inline checks */
export const NewPasswordForm: React.FC<NewPasswordFormProps> = ({ onSubmit, submitLabel = 'Save new password', children }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const score = useMemo(() => scorePassword(password), [password]);
  const strength = STRENGTH[score];
  const tooShort = (touched || password.length > 0) && password.length < MIN_PASSWORD;
  const mismatch = (touched || confirm.length > 0) && confirm !== password;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    setError('');
    if (password.length < MIN_PASSWORD || password !== confirm) return;
    setBusy(true);
    try {
      const problem = await onSubmit(password);
      if (problem) setError(problem);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {children}

      {error && (
        <p role="alert" className="mt-(--ds-s-4) rounded-(--ds-r-md) bg-(--ds-danger-soft) text-(--ds-danger-text) px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm)">
          {error}
        </p>
      )}

      <div className="mt-(--ds-s-5)">
        <label htmlFor="new-password" className="ds-label">
          New password
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="new-password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={tooShort || undefined}
            aria-describedby="new-password-hint"
            className="ds-input h-(--ds-h-lg) pl-9 pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((value) => !value)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="ds-btn ds-btn-ghost ds-btn-icon ds-btn-sm absolute right-1.5 top-1/2 -translate-y-1/2"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="mt-(--ds-s-2) flex items-center gap-(--ds-s-2)" aria-live="polite">
          <div className="flex-1 grid grid-cols-4 gap-1">
            {[1, 2, 3, 4].map((step) => (
              <span
                key={step}
                className="h-1.5 rounded-(--ds-r-full) transition-colors duration-(--ds-dur)"
                style={{ background: password && score >= step ? strength.color : 'var(--ds-gray-150)' }}
              />
            ))}
          </div>
          {password && (
            <span className="w-20 text-right text-(length:--ds-fs-xs) font-(--ds-fw-semibold)" style={{ color: strength.color }}>
              {strength.label}
            </span>
          )}
        </div>
        <p id="new-password-hint" className={tooShort ? 'ds-error-text' : 'mt-1 text-(length:--ds-fs-xs) text-(--ds-text-muted)'}>
          {tooShort
            ? `Use at least ${MIN_PASSWORD} characters.`
            : 'At least 8 characters. Mixing letters, numbers and a symbol makes it stronger.'}
        </p>
      </div>

      <div className="mt-(--ds-s-4)">
        <label htmlFor="new-password-confirm" className="ds-label">
          Confirm new password
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="new-password-confirm"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            aria-invalid={mismatch || undefined}
            className="ds-input h-(--ds-h-lg) pl-9"
          />
        </div>
        {mismatch && <p className="ds-error-text">The two passwords don't match.</p>}
      </div>

      <button type="submit" disabled={busy} className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block mt-(--ds-s-6)">
        {busy && <span className="ds-spinner border-(--primary-foreground)/30 border-t-(--primary-foreground)" />}
        <span>{busy ? 'Saving...' : submitLabel}</span>
      </button>
    </form>
  );
};

/** One field for a 6-digit code: numeric keypad on phones, SMS autofill, paste-friendly */
export const CodeInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}> = ({ value, onChange, onComplete, invalid, disabled }) => {
  const digits = value.padEnd(6, ' ').split('');
  return (
    <div className="relative">
      {/* The six boxes are drawn behind one real input, so typing, pasting and
          SMS autofill all behave like a normal text field */}
      <div aria-hidden className="grid grid-cols-6 gap-(--ds-s-2)">
        {digits.map((digit, index) => {
          const active = !disabled && index === Math.min(value.length, 5);
          return (
            <span
              key={index}
              className="h-14 rounded-(--ds-r-md) border-2 flex items-center justify-center text-(length:--ds-fs-2xl) font-(--ds-fw-bold) ds-num transition-colors duration-(--ds-dur)"
              style={{
                borderColor: invalid
                  ? 'var(--ds-danger)'
                  : active
                  ? 'var(--primary)'
                  : digit.trim()
                  ? 'color-mix(in srgb, var(--primary) 35%, var(--ds-border))'
                  : 'var(--ds-border)',
                background: digit.trim() ? 'color-mix(in srgb, var(--primary) 6%, var(--ds-surface))' : 'var(--ds-surface)',
                color: 'var(--ds-text)',
              }}
            >
              {digit.trim()}
            </span>
          );
        })}
      </div>
      <input
        id="reset-code"
        aria-label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        autoFocus
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '').slice(0, 6);
          onChange(next);
          if (next.length === 6) onComplete?.(next);
        }}
        aria-invalid={invalid || undefined}
        className="absolute inset-0 w-full h-full opacity-0 cursor-text"
        style={{ caretColor: 'transparent' }}
      />
    </div>
  );
};

/** "01XXXXXXXXX" or an email address, cleaned the way the server expects */
export const cleanSignInId = (raw: string) => {
  const text = raw.trim();
  return text.includes('@') ? text.toLowerCase() : text.replace(/[\s-]+/g, '');
};
