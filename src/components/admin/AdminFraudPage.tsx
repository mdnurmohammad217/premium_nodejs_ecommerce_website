import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Shield, RefreshCw, Search, Save, Info } from 'lucide-react';
import { PageHeader, Card, Button, Field, Toggle, useToasts, ACCENTS } from './ui.tsx';

type Level = 'safe' | 'caution' | 'risky' | 'new';

export const RISK_META: Record<Level, { label: string; color: string; soft: string; text: string; icon: any }> = {
  safe: { label: 'Safe', color: 'var(--ds-success)', soft: 'var(--ds-success-soft)', text: 'var(--ds-success-text)', icon: ShieldCheck },
  caution: { label: 'Caution', color: 'var(--ds-warning)', soft: 'var(--ds-warning-soft)', text: 'var(--ds-warning-text)', icon: Shield },
  risky: { label: 'High risk', color: 'var(--ds-danger)', soft: 'var(--ds-danger-soft)', text: 'var(--ds-danger-text)', icon: ShieldAlert },
  new: { label: 'New customer', color: 'var(--ds-info)', soft: 'var(--ds-info-soft)', text: 'var(--ds-info-text)', icon: ShieldQuestion },
};

const REASON_COLOR = {
  good: 'var(--ds-success-text)',
  warn: 'var(--ds-warning-text)',
  bad: 'var(--ds-danger-text)',
  info: 'var(--a-text-soft)',
};

const ago = (iso?: string | null) => {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};

/** Ring showing the success ratio, coloured by risk */
const RatioRing: React.FC<{ ratio: number; level: Level; size?: number }> = ({ ratio, level, size = 84 }) => {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const meta = RISK_META[level];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--a-surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={meta.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (level === 'new' ? 0 : ratio) / 100)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold ds-num" style={{ fontSize: size > 70 ? 'var(--a-fs-lg)' : 'var(--a-fs-sm)' }}>
          {level === 'new' ? '—' : `${Math.round(ratio)}%`}
        </span>
        {size > 70 && <span style={{ fontSize: 'var(--a-fs-2xs)', color: 'var(--a-text-muted)' }}>success</span>}
      </div>
    </div>
  );
};

/**
 * Courier success report for one phone number. Loads by itself (cached on the
 * server, so opening an order costs no API credit when checked recently).
 */
export const FraudPanel: React.FC<{ phone: string; orderTotal?: number; compact?: boolean }> = ({ phone, orderTotal, compact }) => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(
    async (refresh = false) => {
      if (!phone) return;
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ phone });
        if (refresh) params.set('refresh', '1');
        if (orderTotal) params.set('total', String(orderTotal));
        const res = await fetch(`/api/admin/fraud/check?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not check this number.');
        setReport(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [phone, orderTotal]
  );

  useEffect(() => {
    run(false);
  }, [run]);

  if (error) {
    return (
      <div className="p-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', fontSize: 'var(--a-fs-sm)' }}>
        {error}
      </div>
    );
  }
  if (!report) {
    return (
      <div className="flex items-center gap-3 p-3" style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)' }}>
        <div className="ds-skeleton rounded-full" style={{ width: 64, height: 64 }} />
        <div className="flex-1 space-y-2">
          <div className="ds-skeleton h-4 w-1/3" />
          <div className="ds-skeleton h-3 w-2/3" />
        </div>
      </div>
    );
  }

  const level = report.level as Level;
  const meta = RISK_META[level];
  const Icon = meta.icon;
  const couriers: any[] = report.network?.couriers || [];
  const maxTotal = Math.max(1, ...couriers.map((c) => c.total));

  return (
    <div className="space-y-3 p-3" style={{ borderRadius: 'var(--ds-r-lg)', border: `1px solid ${meta.color}`, background: `color-mix(in srgb, ${meta.soft} 55%, var(--a-surface))` }}>
      <div className="flex items-center gap-3">
        <RatioRing ratio={report.ratio} level={level} size={compact ? 64 : 84} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1 px-2 h-6 font-bold"
              style={{ borderRadius: 'var(--ds-r-full)', background: meta.soft, color: meta.text, fontSize: 'var(--a-fs-sm)' }}
            >
              <Icon className="w-3.5 h-3.5" />
              {meta.label}
            </span>
            <span className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              {report.total > 0 ? `${report.success} delivered · ${report.failed} cancelled/returned` : 'No history'}
            </span>
          </div>
          <p className="mt-1 font-medium" style={{ fontSize: 'var(--a-fs-md)' }}>
            {report.advice}
          </p>
        </div>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={loading}
          title="Check again now"
          aria-label="Check again now"
          className="shrink-0 w-8 h-8 inline-flex items-center justify-center cursor-pointer"
          style={{ borderRadius: 'var(--ds-r-md)', color: 'var(--a-text-soft)' }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {couriers.length > 0 && (
        <div className="space-y-1.5">
          {couriers.map((courier) => (
            <div key={courier.key} className="grid grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-2" style={{ fontSize: 'var(--a-fs-sm)' }}>
              <span className="font-semibold truncate">{courier.name}</span>
              <div className="h-2.5 overflow-hidden flex" style={{ borderRadius: 'var(--ds-r-full)', background: 'var(--a-surface-3)' }}>
                <div style={{ width: `${(courier.success / maxTotal) * 100}%`, background: 'var(--ds-success)' }} />
                <div style={{ width: `${(courier.cancelled / maxTotal) * 100}%`, background: 'var(--ds-danger)' }} />
              </div>
              <span className="ds-num whitespace-nowrap" style={{ color: 'var(--a-text-soft)' }}>
                {courier.success}/{courier.total} · {Math.round(courier.ratio)}%
              </span>
            </div>
          ))}
        </div>
      )}

      <ul className="space-y-1">
        {report.reasons.map((reason: any, index: number) => (
          <li key={index} className="flex gap-2" style={{ fontSize: 'var(--a-fs-sm)', color: REASON_COLOR[reason.tone as keyof typeof REASON_COLOR] }}>
            <span aria-hidden>•</span>
            <span>{reason.text}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
        <span>
          {report.network?.checkedAt
            ? `Courier data ${report.network.fromCache ? 'from' : 'checked'} ${ago(report.network.checkedAt)}`
            : report.networkError}
        </span>
        <span className="ds-num">{report.phone}</span>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------- list */

/** Batch summaries for the orders list (cached data only — costs no API credit) */
export function useFraudSummary(phones: string[]) {
  const [data, setData] = useState<Record<string, any>>({});
  const key = Array.from(new Set(phones.filter(Boolean))).sort().join(',');
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch('/api/admin/fraud/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phones: key.split(',') }),
    })
      .then((res) => (res.ok ? res.json() : {}))
      .then((result) => !cancelled && setData(result || {}))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
  return data;
}

const normalise = (raw: string) => {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('880')) digits = digits.slice(2);
  else if (digits.startsWith('88') && digits.length === 13) digits = digits.slice(2);
  return digits;
};

export const FraudPill: React.FC<{ phone: string; summaries: Record<string, any> }> = ({ phone, summaries }) => {
  const entry = summaries[normalise(phone)];
  if (!entry) return null;
  const meta = RISK_META[entry.level as Level] || RISK_META.new;
  return (
    <span
      title={entry.total > 0 ? `${entry.ratio}% delivered of ${entry.total} parcels` : 'No delivery history yet'}
      className="inline-flex items-center gap-1 px-1.5 h-5 font-bold ds-num whitespace-nowrap"
      style={{ borderRadius: 'var(--ds-r-full)', background: meta.soft, color: meta.text, fontSize: 'var(--a-fs-2xs)' }}
    >
      {entry.level === 'new' ? 'NEW' : `${Math.round(entry.ratio)}%`}
      {entry.total > 0 && <span style={{ opacity: 0.7 }}>({entry.total})</span>}
    </span>
  );
};

/* -------------------------------------------------------------------- page */

export const AdminFraudPage: React.FC = () => {
  const toasts = useToasts();
  const [cfg, setCfg] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState('');
  const [checking, setChecking] = useState('');

  useEffect(() => {
    fetch('/api/admin/fraud/config')
      .then((res) => res.json())
      .then(setCfg)
      .catch(() => setCfg({}));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/fraud/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error();
      toasts.push('Fraud checker settings saved.');
    } catch {
      toasts.push('Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {toasts.node}
      <PageHeader
        title="Fraud Checker"
        subtitle="See how often a customer receives their parcels before you ship a cash-on-delivery order."
        icon={ShieldCheck}
        accent={ACCENTS.success}
        actions={
          <Button variant="primary" icon={Save} onClick={save} loading={saving} disabled={!cfg}>
            Save Settings
          </Button>
        }
      />

      <Card>
        <h3 className="font-bold mb-3" style={{ fontSize: 'var(--a-fs-lg)' }}>
          Check a number
        </h3>
        <form
          className="flex gap-2 max-w-md"
          onSubmit={(event) => {
            event.preventDefault();
            setChecking(phone.trim());
          }}
        >
          <input
            className="a-field ds-num"
            inputMode="tel"
            placeholder="01XXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button type="submit" variant="primary" icon={Search}>
            Check
          </Button>
        </form>
        {checking && (
          <div className="mt-4 max-w-2xl">
            <FraudPanel key={checking} phone={checking} />
          </div>
        )}
      </Card>

      {cfg && (
        <Card>
          <div className="space-y-4">
            <Toggle
              checked={cfg.enabled !== false}
              onChange={(value) => setCfg({ ...cfg, enabled: value })}
              label="Fraud checker ON"
              description="Shows the delivery record on every order and a success pill in the order list."
            />
            <div
              className="flex gap-2 p-3"
              style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--ds-info-soft)', color: 'var(--ds-info-text)', fontSize: 'var(--a-fs-sm)' }}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Without a key the checker still uses your own shop's history. With a free BD Courier key (bdcourier.com → API),
                it adds every courier's record: Steadfast, Pathao, RedX, Paperfly and more.
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="BD Courier API key">
                <input
                  className="a-field ds-num"
                  type="password"
                  autoComplete="off"
                  value={cfg.apiKey || ''}
                  onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
                />
              </Field>
              <Field label="API address" hint="Leave as is unless BD Courier gives you a different one.">
                <input className="a-field ds-num" value={cfg.baseUrl || ''} onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} />
              </Field>
            </div>
            <Toggle
              checked={cfg.autoCheck !== false}
              onChange={(value) => setCfg({ ...cfg, autoCheck: value })}
              label="Check new orders automatically"
              description="Each new order's number is checked in the background, so its pill is ready when you open the list."
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Safe from (%)" hint="Success ratio">
                <input type="number" className="a-field ds-num" value={cfg.safeRatio} onChange={(e) => setCfg({ ...cfg, safeRatio: e.target.value })} />
              </Field>
              <Field label="High risk below (%)">
                <input type="number" className="a-field ds-num" value={cfg.riskyRatio} onChange={(e) => setCfg({ ...cfg, riskyRatio: e.target.value })} />
              </Field>
              <Field label="Large order (৳)" hint="Warn on a first order this big">
                <input type="number" className="a-field ds-num" value={cfg.largeOrder} onChange={(e) => setCfg({ ...cfg, largeOrder: e.target.value })} />
              </Field>
              <Field label="Re-use results for (hours)" hint="Saves API credit">
                <input type="number" className="a-field ds-num" value={cfg.cacheHours} onChange={(e) => setCfg({ ...cfg, cacheHours: e.target.value })} />
              </Field>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
