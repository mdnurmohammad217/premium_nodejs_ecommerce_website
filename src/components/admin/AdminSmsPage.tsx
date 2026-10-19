import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Save, Send, RefreshCw, Wallet, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  Field,
  Toggle,
  Select,
  Badge,
  StatCard,
  TableWrap,
  EmptyState,
  LoadingRows,
  useToasts,
  ACCENTS,
  tint,
} from './ui.tsx';

const PROVIDERS = [
  { id: 'bulksmsbd', name: 'BulkSMSBD', site: 'bulksmsbd.net', keyLabel: 'API Key', needsSender: true },
  { id: 'smsnetbd', name: 'Alpha SMS', site: 'sms.net.bd', keyLabel: 'API Key', needsSender: false },
  { id: 'greenweb', name: 'Greenweb', site: 'bdbulksms.net', keyLabel: 'Token', needsSender: false },
  // v3.11
  { id: 'mimsms', name: 'MiM SMS', site: 'mimsms.com', keyLabel: 'API Key', needsSender: true },
  { id: 'custom', name: 'Other gateway', site: 'Any HTTP API', keyLabel: 'API Key', needsSender: false },
] as const;

const EVENTS: Array<{ id: string; title: string; who: string }> = [
  { id: 'order_placed', title: 'Order received', who: 'Customer' },
  { id: 'order_confirmed', title: 'Order confirmed', who: 'Customer' },
  { id: 'order_shipped', title: 'Sent to courier / shipped', who: 'Customer' },
  { id: 'order_delivered', title: 'Delivered', who: 'Customer' },
  { id: 'order_cancelled', title: 'Cancelled', who: 'Customer' },
  { id: 'admin_new_order', title: 'New order alert', who: 'You (admin phones)' },
  { id: 'contact_admin', title: 'New contact message', who: 'You (admin phones)' },
  { id: 'password_reset', title: 'Password reset code', who: 'Customer / staff who tapped “Forgot password?”' },
];

const VARIABLES = ['{name}', '{order_id}', '{total}', '{status}', '{courier}', '{tracking_link}', '{store}', '{store_phone}'];
/** Some messages have their own variables */
const EVENT_VARIABLES: Record<string, string[]> = {
  password_reset: ['{code}', '{minutes}', '{store}', '{name}'],
  contact_admin: ['{name}', '{phone}', '{store}'],
};

/** Same maths as the server: GSM 160/153, Unicode (Bangla) 70/67 per SMS */
const segmentsOf = (text: string) => {
  const unicode = /[^\x00-\x7F]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return { unicode, parts: text.length <= single ? 1 : Math.ceil(text.length / multi) };
};

const EVENT_LABEL: Record<string, string> = Object.fromEntries(EVENTS.map((e) => [e.id, e.title]));

export const AdminSmsPage: React.FC = () => {
  const toasts = useToasts();
  const [cfg, setCfg] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState<{ value?: number; error?: string; loading?: boolean }>({});
  const [test, setTest] = useState({ phone: '', message: 'Test SMS from our shop.' });
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [logsLoading, setLogsLoading] = useState(true);

  // The gateway connection is changed from an account with System Configuration
  const [gatewayLocked, setGatewayLocked] = useState(false);
  const loadConfig = useCallback(async () => {
    const res = await fetch('/api/admin/sms/config');
    const data = await res.json();
    setGatewayLocked(Boolean(data.gatewayLocked));
    setCfg({
      enabled: Boolean(data.enabled),
      provider: data.provider || 'bulksmsbd',
      apiKey: data.apiKey || '',
      senderId: data.senderId || '',
      username: data.username || '',
      adminPhones: data.adminPhones || '',
      publicBaseUrl: data.publicBaseUrl || window.location.origin,
      custom: { url: '', method: 'GET', bodyType: 'form', body: '', successContains: '', ...(data.custom || {}) },
      events: data.events || {},
    });
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/admin/sms/logs');
      const data = await res.json();
      setLogs(data.logs || []);
      setStats(data.stats || {});
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadLogs();
  }, [loadConfig, loadLogs]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/sms/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error();
      toasts.push('SMS settings saved.');
    } catch {
      toasts.push('Could not save SMS settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const checkBalance = async () => {
    setBalance({ loading: true });
    const res = await fetch('/api/admin/sms/balance');
    const data = await res.json().catch(() => ({}));
    setBalance(res.ok ? { value: data.balance } : { error: data.error || 'Not available' });
  };

  const sendTest = async () => {
    setSending(true);
    try {
      // Save first, so the test uses what is on screen
      await fetch('/api/admin/sms/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const res = await fetch('/api/admin/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sending failed.');
      toasts.push(data.message || 'Sent.');
    } catch (err: any) {
      toasts.push(err.message, 'error');
    } finally {
      setSending(false);
      loadLogs();
    }
  };

  if (!cfg) {
    return (
      <div className="space-y-4">
        <PageHeader title="SMS" icon={MessageSquare} accent={ACCENTS.teal} />
        <Card>
          <div className="ds-skeleton h-24 w-full" />
        </Card>
      </div>
    );
  }

  const provider = PROVIDERS.find((p) => p.id === cfg.provider) || PROVIDERS[0];
  const setEvent = (id: string, patch: any) =>
    setCfg({ ...cfg, events: { ...cfg.events, [id]: { ...(cfg.events[id] || {}), ...patch } } });
  const testSeg = segmentsOf(test.message);

  return (
    <div className="space-y-4">
      {toasts.node}
      <PageHeader
        title="SMS"
        subtitle="Text customers about their orders and get alerts for new orders — through your own Bangladeshi SMS gateway."
        icon={MessageSquare}
        accent={ACCENTS.teal}
        actions={
          <Button variant="primary" icon={Save} onClick={save} loading={saving}>
            Save Settings
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Sent (30 days)" value={stats.sent30 ?? 0} icon={CheckCircle2} color={ACCENTS.success} />
        <StatCard label="Failed (30 days)" value={stats.failed30 ?? 0} icon={XCircle} color={ACCENTS.danger} />
        <StatCard label="SMS parts used (30 days)" value={stats.segments30 ?? 0} icon={MessageSquare} color={ACCENTS.teal} />
      </div>

      {/* ------------------------------------------------------------ gateway */}
      <Card>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <Toggle
              checked={cfg.enabled}
              onChange={(value) => setCfg({ ...cfg, enabled: value })}
              label={`SMS ${cfg.enabled ? 'ON' : 'OFF'}`}
              description="When off, no automatic SMS is sent (test messages still work)."
            />
            <div className="flex items-center gap-2">
              {balance.value !== undefined && (
                <span className="font-bold ds-num" style={{ color: 'var(--ds-success-text)' }}>
                  Balance: ৳{Number(balance.value).toLocaleString('en-US')}
                </span>
              )}
              {balance.error && (
                <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{balance.error}</span>
              )}
              <Button icon={Wallet} size="sm" onClick={checkBalance} loading={balance.loading}>
                Check Balance
              </Button>
            </div>
          </div>

          {gatewayLocked && (
            <p
              className="px-3 py-2"
              style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)', background: 'var(--ds-surface-2)', borderRadius: 'var(--ds-r-md)' }}
            >
              The gateway connection (provider, API key, sender) is set by the owner or by staff with System Configuration. You can
              change the messages below.
            </p>
          )}
          <fieldset disabled={gatewayLocked} className="space-y-4 min-w-0" style={{ border: 0, padding: 0, margin: 0, opacity: gatewayLocked ? 0.6 : 1 }}>
          <div role="radiogroup" aria-label="SMS gateway" className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            {PROVIDERS.map((p) => {
              const active = cfg.provider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCfg({ ...cfg, provider: p.id })}
                  className="text-left px-3 py-2.5 cursor-pointer"
                  style={{
                    borderRadius: 'var(--ds-r-md)',
                    border: `1px solid ${active ? 'var(--primary)' : 'var(--a-border)'}`,
                    background: active ? tint(0.08) : 'var(--a-surface)',
                    boxShadow: active ? 'var(--ds-ring)' : 'none',
                  }}
                >
                  <span className="block font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                    {p.name}
                  </span>
                  <span className="block" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                    {p.site}
                  </span>
                </button>
              );
            })}
          </div>

          {cfg.provider === 'mimsms' && (
            <p
              className="px-3 py-2"
              style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-info-text)', background: 'var(--ds-info-soft)', borderRadius: 'var(--ds-r-md)' }}
            >
              MiM SMS: log in at mimsms.com → Developer / API → copy your API key. The user name is the email you sign in with, and
              the sender name is your approved masking or non-masking sender ID.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {cfg.provider === 'mimsms' && (
              <Field label="User Name (account email)" required className="md:col-span-2">
                <input
                  className="a-field"
                  autoComplete="off"
                  value={cfg.username || ''}
                  onChange={(e) => setCfg({ ...cfg, username: e.target.value })}
                  placeholder="you@example.com"
                />
              </Field>
            )}
            <Field label={provider.keyLabel} required={provider.id !== 'custom'}>
              <input
                className="a-field ds-num"
                type="password"
                autoComplete="off"
                value={cfg.apiKey}
                onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
              />
            </Field>
            <Field
              label={cfg.provider === 'mimsms' ? 'Sender Name' : 'Sender ID'}
              required={provider.needsSender}
              hint={provider.needsSender ? 'The approved sender ID / number from your gateway.' : 'Optional — only if your gateway gave you one.'}
            >
              <input className="a-field" value={cfg.senderId} onChange={(e) => setCfg({ ...cfg, senderId: e.target.value })} />
            </Field>
          </div>

          {cfg.provider === 'custom' && (
            <div className="space-y-3 p-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)' }}>
              <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
                Paste your gateway's API address. Use <code>{'{phone}'}</code> (01…), <code>{'{phone880}'}</code> (8801…),{' '}
                <code>{'{message}'}</code>, <code>{'{api_key}'}</code> and <code>{'{sender_id}'}</code> where the values go.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-[120px_minmax(0,1fr)] gap-3">
                <Field label="Method">
                  <Select
                    value={cfg.custom.method}
                    onChange={(value) => setCfg({ ...cfg, custom: { ...cfg.custom, method: value } })}
                    options={[
                      { value: 'GET', label: 'GET' },
                      { value: 'POST', label: 'POST' },
                    ]}
                  />
                </Field>
                <Field label="URL">
                  <input
                    className="a-field ds-num"
                    value={cfg.custom.url}
                    placeholder="https://gateway.example/api/send?key={api_key}&to={phone880}&msg={message}"
                    onChange={(e) => setCfg({ ...cfg, custom: { ...cfg.custom, url: e.target.value } })}
                  />
                </Field>
              </div>
              {cfg.custom.method === 'POST' && (
                <div className="grid grid-cols-1 md:grid-cols-[120px_minmax(0,1fr)] gap-3">
                  <Field label="Body type">
                    <Select
                      value={cfg.custom.bodyType}
                      onChange={(value) => setCfg({ ...cfg, custom: { ...cfg.custom, bodyType: value } })}
                      options={[
                        { value: 'form', label: 'Form' },
                        { value: 'json', label: 'JSON' },
                      ]}
                    />
                  </Field>
                  <Field label="Body">
                    <input
                      className="a-field ds-num"
                      value={cfg.custom.body}
                      placeholder={cfg.custom.bodyType === 'json' ? '{"to":"{phone880}","text":"{message}"}' : 'to={phone880}&text={message}'}
                      onChange={(e) => setCfg({ ...cfg, custom: { ...cfg.custom, body: e.target.value } })}
                    />
                  </Field>
                </div>
              )}
              <Field label="Success when the reply contains" hint="Optional, e.g. SUCCESS or 1000. Empty = any 2xx reply counts as sent.">
                <input
                  className="a-field"
                  value={cfg.custom.successContains}
                  onChange={(e) => setCfg({ ...cfg, custom: { ...cfg.custom, successContains: e.target.value } })}
                />
              </Field>
            </div>
          )}
          </fieldset>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Admin phones" hint="Get new-order and message alerts. Separate several with commas.">
              <input
                className="a-field ds-num"
                value={cfg.adminPhones}
                placeholder="01XXXXXXXXX, 01XXXXXXXXX"
                onChange={(e) => setCfg({ ...cfg, adminPhones: e.target.value })}
              />
            </Field>
            <Field label="Website address" hint="Used for the order-tracking link in SMS.">
              <input className="a-field ds-num" disabled={gatewayLocked} value={cfg.publicBaseUrl} onChange={(e) => setCfg({ ...cfg, publicBaseUrl: e.target.value })} />
            </Field>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------ events */}
      <Card>
        <h3 className="font-bold mb-1" style={{ fontSize: 'var(--a-fs-lg)' }}>
          Automatic messages
        </h3>
        <p className="mb-3" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
          Sent automatically when an order reaches that step. Click a variable to add it. Bangla text uses more SMS parts (70
          characters each).
        </p>
        <div className="space-y-3">
          {EVENTS.map((event) => {
            const setting = cfg.events[event.id] || {};
            const template = setting.template ?? '';
            const effective = template || setting.defaultTemplate || '';
            const seg = segmentsOf(effective.replace(/\{\w+\}/g, 'XXXXXXXX'));
            return (
              <div
                key={event.id}
                className="p-3 space-y-2"
                style={{
                  borderRadius: 'var(--ds-r-md)',
                  border: `1px solid ${setting.enabled ? 'color-mix(in srgb, var(--primary) 40%, var(--a-border))' : 'var(--a-border)'}`,
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Toggle
                    checked={Boolean(setting.enabled)}
                    onChange={(value) => setEvent(event.id, { enabled: value })}
                    label={event.title}
                    description={`To: ${event.who}`}
                  />
                  <span className="ds-num" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                    ~{seg.parts} SMS {seg.unicode ? '· Bangla/Unicode' : ''}
                  </span>
                </div>
                {setting.enabled && (
                  <>
                    <textarea
                      className="a-field"
                      rows={2}
                      value={template}
                      placeholder={setting.defaultTemplate}
                      onChange={(e) => setEvent(event.id, { template: e.target.value })}
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(EVENT_VARIABLES[event.id] || VARIABLES).map((variable) => (
                        <button
                          key={variable}
                          type="button"
                          onClick={() => setEvent(event.id, { template: `${template || setting.defaultTemplate || ''} ${variable}`.trim() })}
                          className="px-2 h-6 cursor-pointer ds-num"
                          style={{
                            borderRadius: 'var(--ds-r-full)',
                            background: 'var(--a-surface-3)',
                            fontSize: 'var(--a-fs-xs)',
                          }}
                        >
                          {variable}
                        </button>
                      ))}
                      {template && (
                        <button
                          type="button"
                          onClick={() => setEvent(event.id, { template: '' })}
                          className="inline-flex items-center gap-1 px-2 h-6 cursor-pointer"
                          style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}
                        >
                          <RotateCcw className="w-3 h-3" /> Default text
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ------------------------------------------------------------ test */}
      <Card>
        <h3 className="font-bold mb-3" style={{ fontSize: 'var(--a-fs-lg)' }}>
          Send a test SMS
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)_auto] gap-3 items-end">
          <Field label="Phone">
            <input
              className="a-field ds-num"
              inputMode="tel"
              placeholder="01XXXXXXXXX"
              value={test.phone}
              onChange={(e) => setTest({ ...test, phone: e.target.value })}
            />
          </Field>
          <Field label={`Message · ${test.message.length} chars · ${testSeg.parts} SMS${testSeg.unicode ? ' (Bangla)' : ''}`}>
            <input className="a-field" value={test.message} onChange={(e) => setTest({ ...test, message: e.target.value })} />
          </Field>
          <Button variant="primary" icon={Send} onClick={sendTest} loading={sending} disabled={!test.phone}>
            Send
          </Button>
        </div>
      </Card>

      {/* ------------------------------------------------------------ log */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
          SMS log
        </h3>
        <Button size="sm" icon={RefreshCw} onClick={loadLogs}>
          Refresh
        </Button>
      </div>
      <TableWrap>
        <table className="a-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Phone</th>
              <th>Type</th>
              <th>Message</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {logsLoading && logs.length === 0 ? (
              <LoadingRows rows={4} cols={5} />
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState icon={MessageSquare} title="No SMS sent yet" description="Every SMS, sent or failed, is listed here." />
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td className="ds-num whitespace-nowrap" style={{ fontSize: 'var(--a-fs-sm)' }}>
                    {new Date(log.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="ds-num">{log.phone}</td>
                  <td style={{ fontSize: 'var(--a-fs-sm)' }}>{EVENT_LABEL[log.event] || log.event}</td>
                  <td style={{ fontSize: 'var(--a-fs-sm)', maxWidth: 380 }}>
                    <div className="truncate" title={log.message}>{log.message}</div>
                    {log.status === 'failed' && log.response && (
                      <div className="truncate" style={{ color: 'var(--ds-danger-text)' }} title={log.response}>
                        {log.response}
                      </div>
                    )}
                  </td>
                  <td>
                    {log.status === 'sent' ? (
                      <Badge tone={{ bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)' }}>Sent</Badge>
                    ) : (
                      <Badge tone={{ bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)' }}>Failed</Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
};
