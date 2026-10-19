import React, { useState } from 'react';
import { KeyRound, MessageSquare, Mail, Wand2, Save, Eye, EyeOff, Copy } from 'lucide-react';
import { Card, Button, Badge, useToasts, tint } from './ui.tsx';

const generatePassword = () => {
  // Easy to read out on the phone: no 0/O or 1/l look-alikes
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  return `${pick(letters).toUpperCase()}${Array.from({ length: 4 }, () => pick(letters)).join('')}${Array.from({ length: 4 }, () => pick(digits)).join('')}`;
};

/**
 * Customers → customer → Password & login. For shoppers who call the shop:
 * text/email them a one-time reset link, or set a password and tell them.
 * Either way they are signed out on every other device.
 */
export const AdminCustomerPassword: React.FC<{
  customer: { id: number; name: string; phone?: string; email?: string | null; hasPassword?: boolean };
  onChanged?: () => void;
}> = ({ customer, onChanged }) => {
  const toasts = useToasts();
  const [busy, setBusy] = useState<'' | 'sms' | 'email' | 'set'>('');
  const [setting, setSetting] = useState(false);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(true);

  const call = async (body: any, kind: 'sms' | 'email' | 'set') => {
    setBusy(kind);
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not complete that.');
      toasts.push(data.message || 'Done.');
      if (kind === 'set') {
        setSetting(false);
        onChanged?.();
      }
    } catch (error: any) {
      toasts.push(error.message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <Card className="mb-4">
      {toasts.node}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <span
            className="w-9 h-9 shrink-0 inline-flex items-center justify-center"
            style={{ borderRadius: 'var(--ds-r-md)', background: tint(0.12), color: 'var(--primary-ink, var(--primary))' }}
          >
            <KeyRound className="w-4 h-4" />
          </span>
          <div>
            <div className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
              Password & login
            </div>
            <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              Signs in with {customer.phone || 'their mobile number'}
              {customer.email ? ` or ${customer.email}` : ''}.
            </div>
          </div>
        </div>
        {customer.hasPassword ? (
          <Badge tone={{ bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)' }}>Password set</Badge>
        ) : (
          <Badge tone={{ bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)' }}>No password yet</Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={MessageSquare} loading={busy === 'sms'} disabled={!customer.phone || Boolean(busy)} onClick={() => call({ action: 'send', channel: 'sms' }, 'sms')}>
          Text reset link
        </Button>
        {customer.email && (
          <Button size="sm" icon={Mail} loading={busy === 'email'} disabled={Boolean(busy)} onClick={() => call({ action: 'send', channel: 'email' }, 'email')}>
            Email reset link
          </Button>
        )}
        <Button
          size="sm"
          variant={setting ? 'soft' : 'secondary'}
          icon={KeyRound}
          onClick={() => {
            setSetting((value) => !value);
            if (!password) setPassword(generatePassword());
          }}
        >
          Set a new password
        </Button>
      </div>

      {setting && (
        <div className="mt-3 p-3 space-y-2" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border-soft)' }}>
          <label className="a-label" htmlFor={`cust-pass-${customer.id}`}>
            New password for {customer.name}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                id={`cust-pass-${customer.id}`}
                className="a-field pr-10 ds-num"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShow((value) => !value)}
                aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center cursor-pointer"
                style={{ color: 'var(--a-text-muted)' }}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button size="sm" icon={Wand2} onClick={() => setPassword(generatePassword())} title="Make a new one">
              New
            </Button>
            <Button
              size="sm"
              icon={Copy}
              onClick={() => navigator.clipboard?.writeText(password).then(() => toasts.push('Copied.')).catch(() => undefined)}
              title="Copy"
            >
              Copy
            </Button>
          </div>
          <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
            At least 8 characters. Tell the customer on the phone, and ask them to change it after signing in.
          </p>
          <Button
            size="sm"
            variant="primary"
            icon={Save}
            loading={busy === 'set'}
            disabled={password.length < 8 || Boolean(busy)}
            onClick={() => call({ action: 'set', password }, 'set')}
          >
            Save password
          </Button>
        </div>
      )}
    </Card>
  );
};
