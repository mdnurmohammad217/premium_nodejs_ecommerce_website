import React, { useCallback, useEffect, useState } from 'react';
import {
  Mail,
  Save,
  Send,
  KeyRound,
  MessageSquare,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Inbox,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardHeader, Button, Field, Toggle, Select, Badge, EmptyState, TableWrap, useToasts, mix } from './ui.tsx';

/** Common mail hosts — picking one fills host, port and security */
const PRESETS = [
  { id: 'custom', label: 'Custom / other', host: '', port: 465, security: 'ssl', hint: '' },
  { id: 'gmail', label: 'Gmail', host: 'smtp.gmail.com', port: 465, security: 'ssl', hint: 'Use a Google App Password (Google Account → Security → App passwords), not your normal password.' },
  { id: 'hostinger', label: 'Hostinger email', host: 'smtp.hostinger.com', port: 465, security: 'ssl', hint: 'Use the full mailbox address and its password from hPanel → Emails.' },
  { id: 'cpanel', label: 'cPanel mail (your domain)', host: 'mail.yourdomain.com', port: 465, security: 'ssl', hint: 'Replace yourdomain.com with your domain. Username is the full email address.' },
  { id: 'zoho', label: 'Zoho Mail', host: 'smtp.zoho.com', port: 465, security: 'ssl', hint: '' },
  { id: 'brevo', label: 'Brevo (Sendinblue)', host: 'smtp-relay.brevo.com', port: 587, security: 'starttls', hint: 'Username is your Brevo login; password is an SMTP key.' },
] as const;

const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  sent: { bg: 'var(--ds-info-soft)', fg: 'var(--ds-info-text)', label: 'Code sent' },
  verified: { bg: 'var(--ds-indigo-soft)', fg: 'var(--ds-indigo)', label: 'Code confirmed' },
  used: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', label: 'Password changed' },
  admin_set: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', label: 'Set by admin' },
  failed: { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)', label: 'Sending failed' },
  locked: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', label: 'Too many tries' },
  expired: { bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)', label: 'Replaced' },
  no_account: { bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)', label: 'No such account' },
  no_contact: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', label: 'No phone/email on account' },
  no_channel: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', label: 'SMS & email off' },
  blocked: { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)', label: 'Blocked account' },
  sending: { bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)', label: 'Sending' },
};

const ACCOUNT_LABEL: Record<string, string> = { customer: 'Customer', staff: 'Staff', owner: 'Owner', none: '—' };

const when = (value?: string) =>
  value
    ? new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

const muted: React.CSSProperties = { fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' };

/**
 * System Configuration → Email & Password Reset.
 * SMTP settings (with presets and a test button), how password reset codes
 * are delivered, and the log of recent reset requests.
 */
export const AdminEmailSettings: React.FC<{ onOpenTab?: (tab: string) => void }> = ({ onOpenTab }) => {
  const toasts = useToasts();
  const [cfg, setCfg] = useState<any>(null);
  const [preset, setPreset] = useState<string>('custom');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [log, setLog] = useState<any[]>([]);
  const [channels, setChannels] = useState<{ sms: boolean; email: boolean; smsOn: boolean } | null>(null);
  const [logLoading, setLogLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/email/config')
      .then((res) => res.json())
      .then((data) => {
        const next = { security: 'ssl', port: 465, passwordReset: true, ...data };
        setCfg(next);
        setPreset(PRESETS.find((item) => item.host && item.host === next.host)?.id || 'custom');
        setTestTo(next.notifyTo || next.fromEmail || '');
      })
      .catch(() => setCfg({ security: 'ssl', port: 465, passwordReset: true }));
  }, []);

  const loadLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const res = await fetch('/api/admin/password-resets');
      const data = await res.json();
      if (res.ok) {
        setLog(data.requests || []);
        setChannels(data.channels || null);
      }
    } finally {
      setLogLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  if (!cfg) {
    return (
      <Card>
        <div className="py-10 text-center" style={muted}>
          Loading email settings...
        </div>
      </Card>
    );
  }

  const set = (patch: any) => setCfg((current: any) => ({ ...current, ...patch }));
  const presetInfo = PRESETS.find((item) => item.id === preset) || PRESETS[0];

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/email/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      toasts.push('Email settings saved.');
      if (cfg.pass) set({ pass: '', hasPassword: true });
      loadLog();
    } catch (error: any) {
      toasts.push(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo.trim())) {
      toasts.push('Enter the email address to send the test to.', 'error');
      return;
    }
    setTesting(true);
    try {
      const res = await fetch('/api/admin/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo.trim(), config: cfg }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The test email could not be sent.');
      toasts.push(data.message || 'Test email sent.');
    } catch (error: any) {
      toasts.push(error.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const channelRow = (icon: React.ReactNode, title: string, on: boolean, detail: string, action?: React.ReactNode) => (
    <div
      className="flex flex-col sm:flex-row sm:items-center gap-3 p-3"
      style={{
        borderRadius: 'var(--ds-r-md)',
        border: `1px solid ${on ? mix('var(--ds-success)', 0.35) : 'var(--a-border)'}`,
        background: on ? mix('var(--ds-success)', 0.05) : 'transparent',
      }}
    >
      <span
        className="w-10 h-10 shrink-0 inline-flex items-center justify-center"
        style={{
          borderRadius: 'var(--ds-r-md)',
          background: on ? 'var(--ds-success-soft)' : 'var(--a-surface-3)',
          color: on ? 'var(--ds-success-text)' : 'var(--a-text-muted)',
        }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
          {title}
          {on ? (
            <Badge tone={{ bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)' }} dot>
              Working
            </Badge>
          ) : (
            <Badge tone={{ bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)' }} dot>
              Off
            </Badge>
          )}
        </div>
        <p style={muted}>{detail}</p>
      </div>
      {action}
    </div>
  );

  return (
    <div className="space-y-5">
      {toasts.node}

      {/* ------------------------------------------------ how resets reach people */}
      <Card>
        <CardHeader
          title="Password reset"
          subtitle="When someone taps “Forgot password?”, a 6-digit code is sent to their mobile or email. Turn on at least one."
          icon={KeyRound}
          accent="var(--ds-amber)"
        />
        <div className="space-y-3">
          {channelRow(
            <MessageSquare className="w-5 h-5" />,
            'By SMS',
            Boolean(channels?.sms),
            channels?.sms
              ? 'Codes go to the mobile number on the account through your SMS gateway (about 1 SMS each).'
              : channels?.smsOn
              ? 'SMS is on, but the “Password reset code” message is switched off in the SMS page.'
              : 'Turn on SMS in Marketing & Tools → SMS to text reset codes. Best for customers who sign in with a mobile number.',
            onOpenTab ? (
              <Button size="sm" onClick={() => onOpenTab('sms')}>
                SMS settings
              </Button>
            ) : undefined
          )}
          {channelRow(
            <Mail className="w-5 h-5" />,
            'By email',
            Boolean(channels?.email),
            channels?.email
              ? 'Codes and a one-click reset link go to the email on the account. Free.'
              : 'Fill in the mail server below and switch it on to email reset codes.'
          )}
          {channels && !channels.sms && !channels.email && (
            <p
              className="p-3"
              style={{
                borderRadius: 'var(--ds-r-md)',
                background: 'var(--ds-warning-soft)',
                color: 'var(--ds-warning-text)',
                fontSize: 'var(--a-fs-md)',
              }}
            >
              Right now nobody can reset a forgotten password by themselves: the sign-in page asks them to call you. You can
              still set a new password for any customer from Customers → open the customer → Reset password.
            </p>
          )}
        </div>
      </Card>

      {/* ------------------------------------------------------------ SMTP */}
      <Card>
        <CardHeader
          title="Email (SMTP)"
          subtitle="The mailbox your shop sends from — reset codes, and optional copies of contact messages."
          icon={Mail}
          accent="var(--ds-indigo)"
          actions={
            <Button variant="primary" icon={Save} loading={saving} onClick={save}>
              Save
            </Button>
          }
        />
        <div className="space-y-4">
          <Toggle
            checked={Boolean(cfg.enabled)}
            onChange={(value) => set({ enabled: value })}
            label="Send email from this shop"
            description="Off: no emails are sent at all."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Mail provider" hint={presetInfo.hint || undefined}>
              <Select
                value={preset}
                onChange={(id) => {
                  setPreset(id);
                  const next = PRESETS.find((item) => item.id === id);
                  if (next && next.host) set({ host: next.host, port: next.port, security: next.security });
                }}
                options={PRESETS.map((item) => ({ value: item.id, label: item.label }))}
              />
            </Field>
            <Field label="SMTP host" required>
              <input className="a-field" value={cfg.host || ''} onChange={(e) => set({ host: e.target.value })} placeholder="smtp.example.com" />
            </Field>
            <Field label="Port">
              <input
                className="a-field ds-num"
                inputMode="numeric"
                value={cfg.port || ''}
                onChange={(e) => set({ port: e.target.value.replace(/\D/g, '') })}
                placeholder="465"
              />
            </Field>
            <Field label="Security">
              <Select
                value={cfg.security || 'ssl'}
                onChange={(value) => set({ security: value, port: value === 'ssl' ? 465 : value === 'starttls' ? 587 : 25 })}
                options={[
                  { value: 'ssl', label: 'SSL/TLS (port 465)' },
                  { value: 'starttls', label: 'STARTTLS (port 587)' },
                  { value: 'none', label: 'None (not recommended)' },
                ]}
              />
            </Field>
            <Field label="Username" hint="Usually the full email address.">
              <input className="a-field" autoComplete="off" value={cfg.user || ''} onChange={(e) => set({ user: e.target.value })} />
            </Field>
            <Field label="Password" hint={cfg.hasPassword ? 'Saved. Leave empty to keep it.' : undefined}>
              <div className="relative">
                <input
                  className="a-field pr-10"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={cfg.pass || ''}
                  onChange={(e) => set({ pass: e.target.value })}
                  placeholder={cfg.hasPassword ? '••••••••' : ''}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((value) => !value)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center cursor-pointer"
                  style={{ color: 'var(--a-text-muted)' }}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
            <Field label="Sender name">
              <input className="a-field" value={cfg.fromName || ''} onChange={(e) => set({ fromName: e.target.value })} placeholder="Your shop name" />
            </Field>
            <Field label="Sender email" hint="Most providers require this to be the same mailbox as the username.">
              <input className="a-field" value={cfg.fromEmail || ''} onChange={(e) => set({ fromEmail: e.target.value })} placeholder="info@yourdomain.com" />
            </Field>
          </div>

          <div className="pt-4 space-y-4" style={{ borderTop: '1px solid var(--a-border-soft)' }}>
            <Toggle
              checked={cfg.passwordReset !== false}
              onChange={(value) => set({ passwordReset: value })}
              label="Email password reset codes"
              description="Sends the code and a one-click reset link to people who sign in with an email address."
            />
            <Toggle
              checked={Boolean(cfg.notifyContact)}
              onChange={(value) => set({ notifyContact: value })}
              label="Email me new contact messages"
              description="A copy of every Contact page message, as well as the Messages inbox."
            />
            {cfg.notifyContact && (
              <Field label="Send copies to" hint="One or more addresses, separated by commas. Empty: the shop email from Website settings.">
                <input className="a-field" value={cfg.notifyTo || ''} onChange={(e) => set({ notifyTo: e.target.value })} placeholder="owner@gmail.com" />
              </Field>
            )}
          </div>

          <div
            className="flex flex-col sm:flex-row gap-2 sm:items-end p-3"
            style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border-soft)' }}
          >
            <Field label="Send a test email to" className="flex-1">
              <input className="a-field" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
            </Field>
            <Button icon={Send} loading={testing} onClick={sendTest} className="shrink-0">
              Send test
            </Button>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------ log */}
      <Card padded={false}>
        <div className="p-5 pb-0">
          <CardHeader
            title="Recent reset requests"
            subtitle="Who asked, how the code was sent, and what happened. Codes are never stored or shown."
            icon={ShieldCheck}
            accent="var(--ds-teal)"
            actions={
              <Button size="sm" icon={RefreshCw} onClick={loadLog} disabled={logLoading}>
                Refresh
              </Button>
            }
          />
        </div>
        {log.length === 0 ? (
          <div className="p-5 pt-0">
            <EmptyState icon={Inbox} title="No reset requests yet" description="They appear here when someone uses “Forgot password?”." />
          </div>
        ) : (
          <TableWrap>
            <table className="a-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Account</th>
                  <th>Signed in with</th>
                  <th>Sent by</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {log.map((row) => {
                  const tone = STATUS_TONE[row.status] || STATUS_TONE.sending;
                  return (
                    <tr key={row.id}>
                      <td className="ds-num whitespace-nowrap">{when(row.createdAt)}</td>
                      <td>
                        <div className="font-semibold">{row.accountName || '—'}</div>
                        <div style={muted}>{ACCOUNT_LABEL[row.accountType] || row.accountType}</div>
                      </td>
                      <td className="ds-num break-all">{row.identifier}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          {row.channel === 'sms' ? <MessageSquare className="w-3.5 h-3.5" /> : row.channel === 'email' ? <Mail className="w-3.5 h-3.5" /> : null}
                          {row.channel === 'sms' ? 'SMS' : row.channel === 'email' ? 'Email' : row.channel === 'admin' ? 'Dashboard' : '—'}
                        </span>
                        {row.destination && <div style={muted} className="ds-num">{row.destination}</div>}
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          {['used', 'admin_set'].includes(row.status) ? (
                            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ds-success)' }} />
                          ) : row.status === 'failed' ? (
                            <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--ds-danger)' }} />
                          ) : null}
                          <Badge tone={tone}>{tone.label}</Badge>
                        </span>
                        {row.error && (
                          <div style={{ ...muted, color: 'var(--ds-danger-text)' }} className="mt-1 max-w-xs">
                            {row.error}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
};
