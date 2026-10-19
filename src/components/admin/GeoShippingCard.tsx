import React, { useEffect, useMemo, useState } from 'react';
import { MapPinned, Save, Check, Plus, Trash2, Info } from 'lucide-react';
import { Card, CardHeader, Button, Toggle, Field, Select, IconButton, mix } from './ui.tsx';
import { ShippingZoneConfig } from '../../types/index.ts';
import { cleanGeoConfig, zoneForPlace, type CheckoutGeoConfig } from '../../lib/geoShipping.ts';
import { useBdDistricts } from '../store/DistrictThanaFields.tsx';

/**
 * Dashboard → System Configuration → Shipping → District & Thana.
 *
 * 1. Ask for District + Thana at checkout (website and landing pages) — on/off.
 * 2. Work out the delivery area (and so the charge) from them — on/off.
 *    Dhaka goes to "Inside Dhaka", every other district to the default area,
 *    and any district or single thana can have its own area (e.g. Savar,
 *    Gazipur → "Dhaka Sub Area").
 */
export const GeoShippingCard: React.FC<{
  config?: any;
  zones: ShippingZoneConfig[];
  currency?: string;
  onSave: (next: CheckoutGeoConfig) => Promise<void> | void;
}> = ({ config, zones, currency = '৳', onSave }) => {
  const [draft, setDraft] = useState<CheckoutGeoConfig>(() => cleanGeoConfig(config));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const districts = useBdDistricts(true);
  const [newDistrict, setNewDistrict] = useState('');
  const [newDistrictZone, setNewDistrictZone] = useState('');
  const [newThanaDistrict, setNewThanaDistrict] = useState('');
  const [newThana, setNewThana] = useState('');
  const [newThanaZone, setNewThanaZone] = useState('');

  useEffect(() => setDraft(cleanGeoConfig(config)), [config]);

  const liveZones = zones.filter((zone) => zone.enabled !== false);
  const zoneOptions = liveZones.map((zone) => ({ value: zone.id, label: `${zone.name} — ${currency}${zone.charge}` }));
  const zoneName = (id: string) => liveZones.find((zone) => zone.id === id)?.name || id;

  const patch = (changes: Partial<CheckoutGeoConfig>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...changes }));
  };

  // What Dhaka and the rest of the country get right now — shown so the owner sees the effect
  const preview = useMemo(
    () => ({
      dhaka: zoneForPlace(draft, liveZones, 'Dhaka', ''),
      other: zoneForPlace(draft, liveZones, 'Rajshahi', ''),
    }),
    [draft, liveZones]
  );

  const thanaList = districts.find((d) => d.n === newThanaDistrict)?.t || [];

  const save = async () => {
    setError('');
    if (draft.autoShipping && liveZones.length === 0) {
      setError('Add delivery areas above first, then turn on automatic charges.');
      return;
    }
    setSaving(true);
    try {
      await onSave(cleanGeoConfig(draft));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const rowStyle: React.CSSProperties = {
    borderRadius: 'var(--ds-r-md)',
    border: '1px solid var(--a-border)',
    background: 'var(--a-surface-2)',
  };

  return (
    <Card accent="var(--ds-indigo)">
      <CardHeader
        title="District & Thana at checkout"
        subtitle="Customers pick their district (জেলা) and thana (থানা) from a list of all 64 districts — on the website checkout and on every landing page."
        icon={MapPinned}
        accent="var(--ds-indigo)"
      />

      <div className="space-y-3">
        <Toggle
          checked={draft.enabled}
          onChange={(value) => patch({ enabled: value })}
          label="Ask for District and Thana"
          description="Adds two dropdowns under the address. The choice is saved on the order and added to the delivery address."
        />
        <div style={{ opacity: draft.enabled ? 1 : 0.55 }} className="space-y-3 pl-0 sm:pl-[52px]">
          <Toggle
            checked={draft.requireThana}
            disabled={!draft.enabled}
            onChange={(value) => patch({ requireThana: value })}
            label="Thana is required"
            description="Off: only the district must be chosen."
          />
          <Field label="Names shown to customers" className="max-w-xs">
            <Select
              value={draft.language}
              disabled={!draft.enabled}
              onChange={(value) => patch({ language: value as CheckoutGeoConfig['language'] })}
              options={[
                { value: 'both', label: 'English + বাংলা — Dhaka (ঢাকা)' },
                { value: 'bn', label: 'বাংলা — ঢাকা' },
                { value: 'en', label: 'English — Dhaka' },
              ]}
            />
          </Field>
        </div>

        <div className="pt-3 border-t" style={{ borderColor: 'var(--a-border-soft)' }}>
          <Toggle
            checked={draft.autoShipping}
            disabled={!draft.enabled}
            onChange={(value) => patch({ autoShipping: value })}
            label="Set the delivery charge from the district automatically"
            description="The customer no longer picks Inside / Outside Dhaka — the area (and its charge) follows the district and thana chosen."
          />
        </div>
      </div>

      {draft.enabled && draft.autoShipping && (
        <div className="mt-4 space-y-4 sm:pl-[52px]">
          {liveZones.length === 0 ? (
            <p className="p-3" style={{ ...rowStyle, fontSize: 'var(--a-fs-base)', color: 'var(--a-text-muted)' }}>
              Add delivery areas (Inside Dhaka, Outside Dhaka …) above first.
            </p>
          ) : (
            <>
              <div
                className="p-3 flex items-start gap-2"
                style={{ borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-indigo)', 0.07), fontSize: 'var(--a-fs-base)' }}
              >
                <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--ds-indigo)' }} />
                <span>
                  Now: <strong>Dhaka</strong> → {preview.dhaka ? zoneName(preview.dhaka) : '—'} · <strong>other districts</strong> →{' '}
                  {preview.other ? zoneName(preview.other) : '—'}
                </span>
              </div>

              <Field label="Area for every other district" hint="Normally “Outside Dhaka”. Dhaka uses “Inside Dhaka” unless you add a rule below.">
                <Select
                  value={draft.defaultZone}
                  onChange={(value) => patch({ defaultZone: value })}
                  options={[{ value: '', label: 'Automatic (Outside Dhaka)' }, ...zoneOptions]}
                />
              </Field>

              {/* District rules */}
              <div>
                <p className="a-label">District rules</p>
                <div className="space-y-2">
                  {Object.entries(draft.districtZones).map(([district, zone]) => (
                    <div key={district} className="flex items-center gap-2 p-2 pl-3" style={rowStyle}>
                      <span className="font-semibold flex-1 min-w-0 truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {district}
                      </span>
                      <Select
                        value={zone}
                        className="w-48 sm:w-60"
                        onChange={(value) => patch({ districtZones: { ...draft.districtZones, [district]: value } })}
                        options={zoneOptions}
                      />
                      <IconButton
                        icon={Trash2}
                        tone="danger"
                        label={`Remove ${district}`}
                        onClick={() => {
                          const next = { ...draft.districtZones };
                          delete next[district];
                          patch({ districtZones: next });
                        }}
                      />
                    </div>
                  ))}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select
                      value={newDistrict}
                      className="flex-1"
                      onChange={setNewDistrict}
                      options={[
                        { value: '', label: 'Choose a district…' },
                        ...districts.filter((d) => !draft.districtZones[d.n]).map((d) => ({ value: d.n, label: `${d.n} (${d.b})` })),
                      ]}
                    />
                    <Select
                      value={newDistrictZone}
                      className="flex-1"
                      onChange={setNewDistrictZone}
                      options={[{ value: '', label: 'Delivery area…' }, ...zoneOptions]}
                    />
                    <Button
                      icon={Plus}
                      disabled={!newDistrict || !newDistrictZone}
                      onClick={() => {
                        patch({ districtZones: { ...draft.districtZones, [newDistrict]: newDistrictZone } });
                        setNewDistrict('');
                        setNewDistrictZone('');
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              {/* Thana rules */}
              <div>
                <p className="a-label">Thana rules (optional)</p>
                <p className="mb-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                  For a thana that should be charged differently from its district — e.g. Dhaka → Savar or Keraniganj as “Dhaka Sub Area”.
                </p>
                <div className="space-y-2">
                  {Object.entries(draft.thanaZones).map(([key, zone]) => (
                    <div key={key} className="flex items-center gap-2 p-2 pl-3" style={rowStyle}>
                      <span className="font-semibold flex-1 min-w-0 truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {key.split('|')[1]} <span style={{ color: 'var(--a-text-muted)', fontWeight: 500 }}>· {key.split('|')[0]}</span>
                      </span>
                      <Select
                        value={zone}
                        className="w-48 sm:w-60"
                        onChange={(value) => patch({ thanaZones: { ...draft.thanaZones, [key]: value } })}
                        options={zoneOptions}
                      />
                      <IconButton
                        icon={Trash2}
                        tone="danger"
                        label={`Remove ${key}`}
                        onClick={() => {
                          const next = { ...draft.thanaZones };
                          delete next[key];
                          patch({ thanaZones: next });
                        }}
                      />
                    </div>
                  ))}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2">
                    <Select
                      value={newThanaDistrict}
                      onChange={(value) => {
                        setNewThanaDistrict(value);
                        setNewThana('');
                      }}
                      options={[{ value: '', label: 'District…' }, ...districts.map((d) => ({ value: d.n, label: d.n }))]}
                    />
                    <Select
                      value={newThana}
                      onChange={setNewThana}
                      disabled={!newThanaDistrict}
                      options={[{ value: '', label: 'Thana…' }, ...thanaList.map(([en, bn]) => ({ value: en, label: `${en} (${bn})` }))]}
                    />
                    <Select
                      value={newThanaZone}
                      onChange={setNewThanaZone}
                      options={[{ value: '', label: 'Delivery area…' }, ...zoneOptions]}
                    />
                    <Button
                      icon={Plus}
                      disabled={!newThanaDistrict || !newThana || !newThanaZone}
                      onClick={() => {
                        patch({ thanaZones: { ...draft.thanaZones, [`${newThanaDistrict}|${newThana}`]: newThanaZone } });
                        setNewThana('');
                        setNewThanaZone('');
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 ds-error-text">
          {error}
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <Button variant="primary" icon={saved ? Check : Save} onClick={save} loading={saving}>
          {saved ? 'Saved' : 'Save District & Thana'}
        </Button>
      </div>
    </Card>
  );
};
