import React, { useEffect, useState } from 'react';
import { KeyRound, Mail, Lock, CheckCircle2, AlertCircle, Save, Eye, EyeOff, ShieldCheck, Smartphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { setToken } from '../../lib/api.ts';
import { PageHeader, Card, CardHeader, Button, Field, mix } from './ui.tsx';

const MIN_PASSWORD = 8;

/** A rough strength score (0–4) so the owner can see a weak password before saving it */
const strengthOf = (value: string) => {
  if (!value) return 0;
  let score = 0;
  if (value.length >= MIN_PASSWORD) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(4, Math.max(1, score));
};

const STRENGTH = [
  { label: '', color: 'var(--ds-border)' },
  { label: 'Weak', color: 'var(--ds-danger)' },
  { label: 'Fair', color: 'var(--ds-warning)' },
  { label: 'Good', color: 'var(--ds-info)' },
  { label: 'Strong', color: 'var(--ds-success)' },
];

const IconInput: React.FC<{
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  invalid?: boolean;
}> = ({ icon: Icon, value, onChange, type = 'text', placeholder, autoComplete, required, invalid }) => {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className="relative">
      <Icon
        className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: 'var(--a-text-muted)' }}
      />
      <input
        type={isPassword && reveal ? 'text' : type}
        required={required}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className={`a-field pl-9 ${isPassword ? 'pr-10' : ''} ${invalid ? 'a-field-error' : ''}`}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          aria-label={reveal ? 'Hide password' : 'Show password'}
          className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer"
          style={{
            right: 'var(--ds-s-1)',
            width: 'var(--ds-h-sm)',
            height: 'var(--ds-h-sm)',
            color: 'var(--a-text-muted)',
          }}
        >
          {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
};

const Notice: React.FC<{ tone: 'danger' | 'success'; children: React.ReactNode }> = ({ tone, children }) => {
  const Icon = tone === 'danger' ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className="flex items-start gap-2.5 ds-fade-in"
      style={{
        padding: 'var(--ds-s-3) var(--ds-s-4)',
        borderRadius: 'var(--ds-r-md)',
        background: `var(--ds-${tone}-soft)`,
        color: `var(--ds-${tone}-text)`,
        border: `1px solid ${mix(`var(--ds-${tone})`, 0.24)}`,
        fontSize: 'var(--a-fs-md)',
      }}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
};

export const AdminAccountSettingsTab: React.FC = () => {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [isOwner, setIsOwner] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetch('/api/auth/owner-profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.email) setNewEmail(data.email);
        setRecoveryPhone(data.recoveryPhone || '');
        setIsOwner(data.isOwner !== false);
      })
      .catch(() => undefined);
  }, []);

  const phoneInvalid = Boolean(recoveryPhone.trim()) && !/^01[3-9]\d{8}$/.test(recoveryPhone.replace(/[\s-]+/g, ''));

  const strength = strengthOf(newPassword);
  const mismatch = Boolean(newPassword && confirmPassword && newPassword !== confirmPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!currentPassword) {
      setErrorMessage('Enter your current password.');
      return;
    }

    if (newPassword && newPassword.length < MIN_PASSWORD) {
      setErrorMessage('The new password must be at least 8 characters.');
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setErrorMessage('The new password and confirmation do not match.');
      return;
    }

    if (phoneInvalid) {
      setErrorMessage('Enter an 11-digit mobile number for password recovery, or leave it empty.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/change-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newEmail: newEmail || undefined,
          newPassword: newPassword || undefined,
          recoveryPhone: recoveryPhone.replace(/[\s-]+/g, ''),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // A new password signs out every other session; this one gets a fresh token
        if (data.token) setToken(data.token);
        setSuccessMessage(newPassword ? 'Login details and password updated.' : 'Login details updated.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setErrorMessage(data.error || 'Could not update credentials.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not reach the server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="Account & Security"
        subtitle="Change the email, password and recovery number of the owner's login."
        icon={KeyRound}
        accent="var(--ds-amber)"
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && <Notice tone="danger">{errorMessage}</Notice>}
        {successMessage && <Notice tone="success">{successMessage}</Notice>}

        <Card>
          <CardHeader
            title="Verify Identity"
            subtitle="For security, your current password is checked before any change."
            icon={ShieldCheck}
            accent="var(--ds-amber)"
          />
          <Field label="Current Password" required>
            <IconInput
              icon={Lock}
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="••••••••"
            />
          </Field>
        </Card>

        <Card>
          <CardHeader title="Login Details" icon={Mail} />
          <div className="space-y-4">
            <Field label="Admin Email" required>
              <IconInput
                icon={Mail}
                type="email"
                required
                autoComplete="username"
                value={newEmail}
                onChange={setNewEmail}
                placeholder="Your email"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="New Password" hint="Leave empty to keep your current password.">
                <IconInput
                  icon={Lock}
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="New password, at least 8 characters"
                />
              </Field>

              <Field
                label="Confirm New Password"
                error={mismatch ? 'Passwords do not match.' : undefined}
              >
                <IconInput
                  icon={Lock}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Re-enter the new password"
                  invalid={mismatch}
                />
              </Field>
            </div>

            {newPassword && (
              <div className="space-y-1.5" aria-live="polite">
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map((step) => (
                    <span
                      key={step}
                      style={{
                        height: 4,
                        borderRadius: 'var(--ds-r-full)',
                        background: step <= strength ? STRENGTH[strength].color : 'var(--ds-border)',
                        transition: 'background-color var(--ds-dur) var(--ds-ease)',
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between" style={{ fontSize: 'var(--a-fs-sm)' }}>
                  <span style={{ color: 'var(--a-text-muted)' }}>
                    {newPassword.length < MIN_PASSWORD ? (
                      <>
                        <span className="ds-num">{MIN_PASSWORD - newPassword.length}</span> more characters needed
                      </>
                    ) : (
                      'Mix upper and lower case letters, numbers and symbols for a stronger password'
                    )}
                  </span>
                  <span className="font-semibold" style={{ color: STRENGTH[strength].color }}>
                    {STRENGTH[strength].label}
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Password recovery"
            subtitle="If you forget your password, tap “Forgot Password?” on the sign-in page and enter your admin email."
            icon={Smartphone}
            accent="var(--ds-teal)"
          />
          <Field
            label="Recovery mobile number"
            hint="The reset code is texted here when email is not set up. SMS must be on (Marketing & Tools → SMS)."
            error={phoneInvalid ? 'Enter an 11-digit number like 01XXXXXXXXX.' : undefined}
          >
            <IconInput
              icon={Smartphone}
              type="tel"
              autoComplete="tel"
              value={recoveryPhone}
              onChange={setRecoveryPhone}
              placeholder="01XXXXXXXXX"
              invalid={phoneInvalid}
            />
          </Field>
          {!isOwner && (
            <p className="mt-3" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              You are signed in with a staff account. These settings belong to the owner's login.
            </p>
          )}
        </Card>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
            After the change, log in with the new email and password.
          </p>
          <Button type="submit" variant="primary" icon={Save} loading={isSubmitting} className="shrink-0">
            {isSubmitting ? 'Updating...' : 'Save Credentials'}
          </Button>
        </div>
      </form>
    </div>
  );
};
