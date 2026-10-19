import React, { useEffect, useMemo, useState } from 'react';
import { Gift, Save, Check, PackageCheck, Info } from 'lucide-react';
import { Card, CardHeader, Button, Toggle, Field, mix } from './ui.tsx';
import { FreeShippingConfig, ShippingZoneConfig } from '../../types/index.ts';

const DEFAULTS: FreeShippingConfig = {
  enabled: false,
  minSubtotal: null,
  minQuantity: null,
  zones: [],
  excludeWholesale: true,
  showProgress: true,
};

/**
 * Store-wide free delivery: by order total and/or by number of items,
 * optionally only in some delivery areas. The order API applies exactly
 * these rules (src/lib/shipping.ts), so what the checkout shows is what the
 * customer is billed.
 */
export const FreeShippingCard: React.FC<{
  config?: FreeShippingConfig;
  zones: ShippingZoneConfig[];
  currency?: string;
  onSave: (next: FreeShippingConfig) => Promise<void> | void;
}> = ({ config, zones, currency = '৳', onSave }) => {
  const [draft, setDraft] = useState<FreeShippingConfig>({ ...DEFAULTS, ...(config || {}) });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft({ ...DEFAULTS, ...(config || {}) });
  }, [config]);

  const patch = (changes: Partial<FreeShippingConfig>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...changes }));
  };

  const activeZones = zones.filter((zone) => zone.enabled !== false);
  const chosen = new Set<string>(draft.zones || []);

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (Number(draft.minSubtotal) > 0) parts.push(`orders of ${currency}${Number(draft.minSubtotal).toLocaleString('en-BD')} or more`);
    if (Number(draft.minQuantity) > 0) parts.push(`${draft.minQuantity}+ items`);
    if (parts.length === 0) return 'Set an order total or an item count to turn the offer on.';
    const where =
      draft.zones && draft.zones.length > 0
        ? ` — ${activeZones
            .filter((zone) => chosen.has(zone.id))
            .map((zone) => zone.name)
            .join(', ') || 'selected areas'} only`
        : ' — every delivery area';
    return `Free delivery on ${parts.join(' or ')}${where}.`;
  }, [draft, activeZones, currency]);

  const save = async () => {
    setError('');
    const minSubtotal = Number(draft.minSubtotal) > 0 ? Number(draft.minSubtotal) : null;
    const minQuantity = Number(draft.minQuantity) > 0 ? Math.floor(Number(draft.minQuantity)) : null;
    if (draft.enabled && !minSubtotal && !minQuantity) {
      setError('Enter an order total or an item count, or turn the offer off.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...draft, minSubtotal, minQuantity, zones: (draft.zones || []).filter((id) => zones.some((zone) => zone.id === id)) });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card accent="var(--ds-success)">
      <CardHeader
        title="Free delivery offer"
        subtitle="Make delivery free when an order is big enough — by total amount, by number of items, or both."
        icon={Gift}
        accent="var(--ds-success)"
      />

      <Toggle checked={Boolean(draft.enabled)} onChange={(value) => patch({ enabled: value })} label="Offer free delivery" description="Applies on the website checkout. Landing pages can use their own rules." />

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ opacity: draft.enabled ? 1 : 0.55 }}>
        <Field label={`Order total at least (${currency})`} hint="Products total, before delivery. Leave empty to skip.">
          <input
            type="number"
            min={0}
            inputMode="decimal"
            className="a-field ds-num"
            value={draft.minSubtotal ?? ''}
            placeholder="e.g. 1000"
            disabled={!draft.enabled}
            onChange={(e) => patch({ minSubtotal: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </Field>
        <Field label="Number of items at least" hint="Total quantity in the order. Leave empty to skip.">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            className="a-field ds-num"
            value={draft.minQuantity ?? ''}
            placeholder="e.g. 3"
            disabled={!draft.enabled}
            onChange={(e) => patch({ minQuantity: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </Field>
      </div>

      {activeZones.length > 0 && (
        <div className="mt-4" style={{ opacity: draft.enabled ? 1 : 0.55 }}>
          <p className="a-label">Delivery areas</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!draft.enabled}
              onClick={() => patch({ zones: [] })}
              className="font-semibold cursor-pointer disabled:cursor-not-allowed"
              style={{
                height: 34,
                padding: '0 12px',
                borderRadius: 999,
                fontSize: 'var(--a-fs-base)',
                border: `1px solid ${chosen.size === 0 ? 'var(--ds-success)' : 'var(--a-border)'}`,
                background: chosen.size === 0 ? mix('var(--ds-success)', 0.12) : 'var(--a-surface)',
                color: chosen.size === 0 ? 'var(--ds-success-text)' : 'var(--a-text-soft)',
              }}
            >
              All areas
            </button>
            {activeZones.map((zone) => {
              const on = chosen.has(zone.id);
              return (
                <button
                  key={zone.id}
                  type="button"
                  disabled={!draft.enabled}
                  aria-pressed={on}
                  onClick={() => {
                    const next = new Set<string>(chosen);
                    if (on) next.delete(zone.id);
                    else next.add(zone.id);
                    patch({ zones: Array.from(next) });
                  }}
                  className="font-semibold cursor-pointer disabled:cursor-not-allowed"
                  style={{
                    height: 34,
                    padding: '0 12px',
                    borderRadius: 999,
                    fontSize: 'var(--a-fs-base)',
                    border: `1px solid ${on ? 'var(--ds-success)' : 'var(--a-border)'}`,
                    background: on ? mix('var(--ds-success)', 0.12) : 'var(--a-surface)',
                    color: on ? 'var(--ds-success-text)' : 'var(--a-text-soft)',
                  }}
                >
                  {zone.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3" style={{ opacity: draft.enabled ? 1 : 0.55 }}>
        <Toggle
          checked={draft.showProgress !== false}
          disabled={!draft.enabled}
          onChange={(value) => patch({ showProgress: value })}
          label="Show “add ৳X more for free delivery”"
          description="A small progress note in the cart and at checkout — nudges shoppers to add one more item."
        />
        <Toggle
          checked={draft.excludeWholesale !== false}
          disabled={!draft.enabled}
          onChange={(value) => patch({ excludeWholesale: value })}
          label="Wholesale orders still pay delivery"
        />
      </div>

      <div
        className="mt-4 flex items-start gap-2.5 p-3"
        style={{ borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-success)', 0.08), color: 'var(--ds-success-text)', fontSize: 'var(--a-fs-md)' }}
      >
        <PackageCheck className="w-4 h-4 shrink-0 mt-0.5" />
        <span className="font-semibold">{draft.enabled ? summary : 'Free delivery offer is off.'}</span>
      </div>

      <div className="mt-3 flex items-start gap-2.5" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Per-product rules are on each product (Products → edit → Delivery tab): “Free delivery” or its own charge per area. When products with
          different charges are in one order, the highest single charge applies.
        </span>
      </div>

      {error && (
        <p role="alert" className="mt-3 font-semibold" style={{ color: 'var(--ds-danger-text)', fontSize: 'var(--a-fs-md)' }}>
          {error}
        </p>
      )}

      <div className="flex justify-end pt-4">
        <Button variant="primary" icon={saved ? Check : Save} onClick={save} loading={saving}>
          {saved ? 'Saved' : 'Save free delivery'}
        </Button>
      </div>
    </Card>
  );
};
