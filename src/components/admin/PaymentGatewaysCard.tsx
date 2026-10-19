import React, { useCallback, useEffect, useState } from 'react';
import { Globe2, Save, Check, RefreshCw, ShieldCheck, Copy, Eye, EyeOff, KeyRound, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, Button, Toggle, Field, SegmentedTabs, mix } from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';

type GatewayId = 'sslcommerz' | 'bkash' | 'nagad';
const MASK = '••••••••';

const GATEWAYS: Array<{
  id: GatewayId;
  name: string;
  color: string;
  about: string;
  fields: Array<{ key: string; label: string; secret?: boolean; textarea?: boolean; placeholder?: string; hint?: string }>;
  docs: string;
}> = [
  {
    id: 'bkash',
    name: 'bKash',
    color: '#e2136e',
    about: 'bKash Tokenized Checkout — the customer pays from their bKash app/number on bKash’s own page.',
    fields: [
      { key: 'appKey', label: 'App Key' },
      { key: 'appSecret', label: 'App Secret', secret: true },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password', secret: true },
    ],
    docs: 'Get these from your bKash merchant account (PGW / Tokenized Checkout). Sandbox credentials come from bKash for testing.',
  },
  {
    id: 'nagad',
    name: 'Nagad',
    color: '#f7941d',
    about: 'Nagad Online Payment — the customer pays on Nagad’s own page.',
    fields: [
      { key: 'merchantId', label: 'Merchant ID' },
      { key: 'merchantNumber', label: 'Merchant number (optional)', placeholder: '01XXXXXXXXX' },
      { key: 'merchantPrivateKey', label: 'Merchant private key', secret: true, textarea: true, hint: 'The RSA private key Nagad gave you (with or without the BEGIN/END lines).' },
      { key: 'pgPublicKey', label: 'Nagad payment gateway public key', textarea: true, hint: 'Nagad’s public key (PG public key).' },
    ],
    docs: 'Nagad issues the Merchant ID and both keys when your merchant account is approved.',
  },
  {
    id: 'sslcommerz',
    name: 'SSLCommerz',
    color: '#1d4ed8',
    about: 'Cards (Visa, Mastercard, Amex), mobile banking and internet banking through SSLCommerz.',
    fields: [
      { key: 'storeId', label: 'Store ID' },
      { key: 'storePassword', label: 'Store password', secret: true },
    ],
    docs: 'Find them in the SSLCommerz merchant panel. For testing, create a free sandbox store at developer.sslcommerz.com.',
  },
];

const SecretInput: React.FC<{ value: string; saved: boolean; onChange: (value: string) => void; textarea?: boolean; placeholder?: string }> = ({
  value,
  saved,
  onChange,
  textarea,
  placeholder,
}) => {
  const [reveal, setReveal] = useState(false);
  const hint = saved ? 'Saved — type to replace' : placeholder || '';
  if (textarea) {
    return (
      <textarea
        className="a-field"
        rows={4}
        value={value}
        placeholder={saved ? 'Saved — paste a new key to replace it' : placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--a-fs-sm)' }}
        spellCheck={false}
        autoComplete="off"
      />
    );
  }
  return (
    <div className="relative">
      <input
        type={reveal ? 'text' : 'password'}
        className="a-field pr-10"
        value={value}
        placeholder={hint}
        autoComplete="new-password"
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setReveal((current) => !current)}
        aria-label={reveal ? 'Hide' : 'Show'}
        className="absolute top-1/2 -translate-y-1/2 right-1 w-8 h-8 inline-flex items-center justify-center cursor-pointer"
        style={{ color: 'var(--a-text-muted)' }}
      >
        {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

/**
 * Online payment gateways — SSLCommerz, bKash and Nagad. Credentials are kept
 * on the server only; this screen never receives a saved secret back.
 */
export const PaymentGatewaysCard: React.FC = () => {
  const [config, setConfig] = useState<Record<GatewayId, any> | null>(null);
  const [draft, setDraft] = useState<Record<GatewayId, any> | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState<GatewayId | null>(null);
  const [savedId, setSavedId] = useState<GatewayId | null>(null);
  const [message, setMessage] = useState<{ id: GatewayId; ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState<GatewayId | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch('/api/admin/payment-gateways');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load payment gateways.');
      setConfig(data);
      const blank: any = {};
      for (const gateway of GATEWAYS) {
        blank[gateway.id] = { ...data[gateway.id] };
        for (const field of gateway.fields) if (field.secret) blank[gateway.id][field.key] = '';
      }
      setDraft(blank);
    } catch (err: any) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (id: GatewayId, changes: Record<string, any>) => {
    setSavedId(null);
    setDraft((current) => (current ? { ...current, [id]: { ...current[id], ...changes } } : current));
  };

  const save = async (id: GatewayId) => {
    if (!draft) return;
    setSaving(id);
    setMessage(null);
    try {
      const gateway = GATEWAYS.find((item) => item.id === id)!;
      const body: any = { ...draft[id] };
      for (const field of gateway.fields) if (field.secret && !body[field.key]) body[field.key] = MASK;
      if (body.enabled) {
        const missing = gateway.fields.filter(
          (field) => !field.label.includes('optional') && !(field.secret ? body[field.key] && (body[field.key] !== MASK || config?.[id]?.[`has_${field.key}`]) : String(body[field.key] || '').trim())
        );
        if (missing.length) throw new Error(`Fill in ${missing.map((field) => field.label).join(', ')} before turning ${gateway.name} on.`);
      }
      const res = await fetch('/api/admin/payment-gateways', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [id]: body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      await load();
      setSavedId(id);
      window.setTimeout(() => setSavedId(null), 2500);
    } catch (err: any) {
      setMessage({ id, ok: false, text: err.message });
    } finally {
      setSaving(null);
    }
  };

  const test = async (id: GatewayId) => {
    setTesting(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/payment-gateways/${id}/test`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setMessage({ id, ok: Boolean(res.ok && data.success), text: data.message || data.error || (res.ok ? 'Connection works.' : 'Connection failed.') });
    } catch {
      setMessage({ id, ok: false, text: 'Could not reach the server.' });
    } finally {
      setTesting(null);
    }
  };

  return (
    <Card accent="var(--ds-indigo)">
      <CardHeader
        title="Online payment gateways"
        subtitle="Take real payments at checkout and on landing pages. The amount always comes from the order on the server, and every payment is confirmed with the gateway before the order is marked paid."
        icon={Globe2}
        accent="var(--ds-indigo)"
      />

      {loadError && (
        <div className="flex items-center justify-between gap-3 p-3 mb-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--ds-danger-soft)', color: 'var(--ds-danger-text)' }}>
          <span className="font-semibold">{loadError}</span>
          <Button size="sm" icon={RefreshCw} onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {!draft && !loadError && <div className="ds-skeleton" style={{ height: 180, borderRadius: 'var(--ds-r-md)' }} />}

      {draft && (
        <div className="space-y-4">
          {GATEWAYS.map((gateway) => {
            const current = draft[gateway.id] || {};
            const saved = config?.[gateway.id] || {};
            const live = current.sandbox === false;
            return (
              <div
                key={gateway.id}
                className="overflow-hidden"
                style={{ border: `1px solid ${current.enabled ? mix(gateway.color, 0.45) : 'var(--a-border)'}`, borderRadius: 'var(--ds-r-lg)', background: 'var(--a-surface)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ background: mix(gateway.color, 0.07) }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="inline-flex items-center justify-center font-black text-white shrink-0"
                      style={{ width: 40, height: 40, borderRadius: 10, background: gateway.color, fontSize: 13 }}
                    >
                      {gateway.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold flex items-center gap-2" style={{ fontSize: 'var(--a-fs-lg)' }}>
                        {gateway.name}
                        {saved.configured ? (
                          <span className="inline-flex items-center gap-1 font-semibold" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--ds-success-text)' }}>
                            <ShieldCheck className="w-3.5 h-3.5" /> Set up
                          </span>
                        ) : (
                          <span className="font-semibold" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                            Not set up
                          </span>
                        )}
                      </p>
                      <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{gateway.about}</p>
                    </div>
                  </div>
                  <Toggle checked={Boolean(current.enabled)} onChange={(value) => patch(gateway.id, { enabled: value })} label={current.enabled ? 'On' : 'Off'} />
                </div>

                <div className="p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <SegmentedTabs
                      tabs={[
                        { id: 'sandbox', label: 'Sandbox (test)' },
                        { id: 'live', label: 'Live' },
                      ]}
                      active={live ? 'live' : 'sandbox'}
                      onChange={(value) => patch(gateway.id, { sandbox: value !== 'live' })}
                    />
                    {!live && (
                      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-warning-text)' }}>
                        <AlertTriangle className="w-4 h-4" /> Test mode — no real money moves.
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Name at checkout">
                      <input className="a-field" value={current.label || ''} maxLength={80} onChange={(e) => patch(gateway.id, { label: e.target.value })} />
                    </Field>
                    <Field label="Short description at checkout">
                      <input className="a-field" value={current.description || ''} maxLength={140} onChange={(e) => patch(gateway.id, { description: e.target.value })} />
                    </Field>
                    <Field label="Logo at checkout" hint="Optional — without one, the coloured name badge is shown." className="md:col-span-2">
                      <MediaPicker
                        value={current.logoUrl || ''}
                        onChange={(url) => patch(gateway.id, { logoUrl: url })}
                        modalTitle={`${gateway.name} — Logo`}
                        hideUrlInput
                      />
                    </Field>
                    {gateway.fields.map((field) => (
                      <Field key={field.key} label={field.label} hint={field.hint} className={field.textarea ? 'md:col-span-2' : ''}>
                        {field.secret ? (
                          <SecretInput
                            value={current[field.key] || ''}
                            saved={Boolean(saved[`has_${field.key}`])}
                            textarea={field.textarea}
                            placeholder={field.placeholder}
                            onChange={(value) => patch(gateway.id, { [field.key]: value })}
                          />
                        ) : field.textarea ? (
                          <textarea
                            className="a-field"
                            rows={4}
                            value={current[field.key] || ''}
                            spellCheck={false}
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--a-fs-sm)' }}
                            onChange={(e) => patch(gateway.id, { [field.key]: e.target.value })}
                          />
                        ) : (
                          <input className="a-field" value={current[field.key] || ''} placeholder={field.placeholder} autoComplete="off" onChange={(e) => patch(gateway.id, { [field.key]: e.target.value })} />
                        )}
                      </Field>
                    ))}
                  </div>

                  {gateway.id === 'sslcommerz' && (
                    <div className="p-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', fontSize: 'var(--a-fs-sm)' }}>
                      <p className="font-semibold mb-1">IPN URL (paste in the SSLCommerz panel → IPN Settings)</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 min-w-0 truncate ds-num">{origin}/api/payments/sslcommerz/ipn</code>
                        <Button size="sm" icon={Copy} onClick={() => navigator.clipboard?.writeText(`${origin}/api/payments/sslcommerz/ipn`)}>
                          Copy
                        </Button>
                      </div>
                    </div>
                  )}

                  <p className="inline-flex items-start gap-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                    <KeyRound className="w-4 h-4 shrink-0 mt-0.5" /> {gateway.docs}
                  </p>

                  {message?.id === gateway.id && (
                    <p role="status" className="font-semibold" style={{ fontSize: 'var(--a-fs-md)', color: message.ok ? 'var(--ds-success-text)' : 'var(--ds-danger-text)' }}>
                      {message.text}
                    </p>
                  )}

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button icon={RefreshCw} onClick={() => test(gateway.id)} loading={testing === gateway.id} disabled={!saved.configured}>
                      Test connection
                    </Button>
                    <Button variant="primary" icon={savedId === gateway.id ? Check : Save} onClick={() => save(gateway.id)} loading={saving === gateway.id}>
                      {savedId === gateway.id ? 'Saved' : `Save ${gateway.name}`}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
