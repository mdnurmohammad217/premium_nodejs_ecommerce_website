import React, { useEffect, useState } from 'react';
import { Hash, Save, Check } from 'lucide-react';
import { Card, CardHeader, Button, Field, SectionLoader, ErrorState, mix } from './ui.tsx';

interface Numbering {
  prefix: string;
  posPrefix: string;
  separator: string;
  minDigits: number;
  next: number;
  posNext: number;
}

const format = (prefix: string, separator: string, digits: number, value: number) => {
  const number = String(Math.max(1, Math.floor(value) || 1)).padStart(Math.min(8, Math.max(1, digits || 1)), '0');
  return prefix ? `${prefix}${separator}${number}` : number;
};

/**
 * System Configuration → Orders → Order numbers. Website orders count
 * ORD-01, ORD-02 … and POS sales POS-01, POS-02 …; the prefix, the minimum
 * number of digits and the next number can be changed here.
 */
export const OrderNumberingCard: React.FC = () => {
  const [draft, setDraft] = useState<Numbering | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = () => {
    setError('');
    fetch('/api/admin/order-numbering')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) =>
        setDraft({
          prefix: data.prefix ?? 'ORD',
          posPrefix: data.posPrefix ?? 'POS',
          separator: data.separator ?? '-',
          minDigits: Number(data.minDigits) || 2,
          next: Number(data.next) || 1,
          posNext: Number(data.posNext) || 1,
        })
      )
      .catch(() => setError('Could not load the order numbering.'));
  };
  useEffect(load, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!draft)
    return (
      <Card>
        <SectionLoader lines={4} />
      </Card>
    );

  const patch = (changes: Partial<Numbering>) => {
    setSaved(false);
    setDraft((current) => (current ? { ...current, ...changes } : current));
  };

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/admin/order-numbering', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setSaveError(err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const clean = (value: string) => value.replace(/[^A-Za-z0-9_#/-]/g, '').slice(0, 12);
  const sample = (prefix: string, start: number) =>
    [0, 1, 2].map((offset) => format(prefix, draft.separator, draft.minDigits, start + offset)).join(', ') + ' …';

  return (
    <Card accent="var(--ds-indigo)">
      <CardHeader
        title="Order numbers"
        subtitle="Orders count up from 01. A number that already exists is skipped automatically, so two orders never share one."
        icon={Hash}
        accent="var(--ds-indigo)"
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Website order prefix" hint="Empty = just the number (01, 02 …)">
          <input className="a-field" value={draft.prefix} onChange={(event) => patch({ prefix: clean(event.target.value) })} placeholder="ORD" />
        </Field>
        <Field label="Separator">
          <input
            className="a-field"
            value={draft.separator}
            maxLength={2}
            onChange={(event) => patch({ separator: event.target.value.replace(/[^\-_/#.]/g, '').slice(0, 2) })}
            placeholder="-"
          />
        </Field>
        <Field label="Minimum digits" hint="2 → 01, 3 → 001">
          <input
            type="number"
            min={1}
            max={8}
            className="a-field ds-num"
            value={draft.minDigits}
            onChange={(event) => patch({ minDigits: Math.min(8, Math.max(1, Math.floor(Number(event.target.value) || 1))) })}
          />
        </Field>
        <Field label="Next website order number">
          <input
            type="number"
            min={1}
            className="a-field ds-num"
            value={draft.next}
            onChange={(event) => patch({ next: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
          />
        </Field>
        <Field label="POS sale prefix">
          <input className="a-field" value={draft.posPrefix} onChange={(event) => patch({ posPrefix: clean(event.target.value) })} placeholder="POS" />
        </Field>
        <Field label="Next POS sale number">
          <input
            type="number"
            min={1}
            className="a-field ds-num"
            value={draft.posNext}
            onChange={(event) => patch({ posNext: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
          />
        </Field>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          ['Website, landing page and manual orders', sample(draft.prefix, draft.next)],
          ['POS sales', sample(draft.posPrefix, draft.posNext)],
        ].map(([label, value]) => (
          <div key={label} className="p-3" style={{ borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-indigo)', 0.07) }}>
            <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{label}</div>
            <div className="ds-num font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {saveError && <p className="ds-error-text mt-3">{saveError}</p>}
      <div className="mt-4 flex justify-end">
        <Button variant="primary" icon={saved ? Check : Save} onClick={save} loading={saving}>
          {saved ? 'Saved' : 'Save Numbering'}
        </Button>
      </div>
    </Card>
  );
};
