import React, { useMemo, useState } from 'react';
import { ShieldCheck, Factory, Save, Check, Plus, Trash2, ArrowUp, ArrowDown, Award, Image as ImageIcon } from 'lucide-react';
import { Card, CardHeader, Button, IconButton, Toggle, Field, Select, tint } from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import {
  facilitySectionOf,
  trustSectionOf,
  type FacilitySectionConfig,
  type TrustBadge,
  type TrustSectionConfig,
} from '../../lib/homeExtras.ts';
import { TrustSeal } from '../store/TrustSection.tsx';
import { SiteSettings } from '../../types/index.ts';

const newId = () => Math.random().toString(36).slice(2, 9);
const STAR_HINT = 'Put *stars* around words to colour them, e.g. Why Choose *Us?*';

type SaveFn = (next: SiteSettings) => Promise<void> | void;

/** Save button + "Saved" note used by both cards */
function useSaver(settings: SiteSettings, onSaveSettings: SaveFn) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const save = async (patch: Record<string, any>) => {
    setSaving(true);
    setError('');
    try {
      await onSaveSettings({ ...settings, ...patch } as any);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  const bar = (dirty: boolean, onClick: () => void, label: string) => (
    <div className="flex flex-wrap items-center gap-3">
      {error && (
        <span role="alert" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-danger-text)' }}>
          {error}
        </span>
      )}
      {saved && (
        <span className="inline-flex items-center gap-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-success-text)' }}>
          <Check className="w-4 h-4" /> Saved — the website shows it now
        </span>
      )}
      <Button variant="primary" icon={Save} loading={saving} disabled={!dirty || saving} onClick={onClick}>
        {label}
      </Button>
    </div>
  );
  return { save, bar };
}

const move = <T,>(list: T[], index: number, delta: number): T[] => {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

/* ================================================================ trust */

const SUGGESTED_BADGES: Array<Pick<TrustBadge, 'name' | 'label'>> = [
  { name: 'BSTI', label: 'Approved' },
  { name: 'GMP', label: 'Certified' },
  { name: 'ISO', label: 'Certified' },
  { name: 'UKAS', label: 'Certified' },
  { name: 'USAC', label: 'Certified' },
  { name: 'HALAL', label: 'Certified' },
];

const TrustCard: React.FC<{ settings: SiteSettings; onSaveSettings: SaveFn }> = ({ settings, onSaveSettings }) => {
  const initial = useMemo(() => trustSectionOf(settings), [settings]);
  const [cfg, setCfg] = useState<TrustSectionConfig>(initial);
  const { save, bar } = useSaver(settings, onSaveSettings);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(initial);
  const set = (patch: Partial<TrustSectionConfig>) => setCfg((current) => ({ ...current, ...patch }));
  const setBadge = (index: number, patch: Partial<TrustBadge>) =>
    setCfg((current) => ({ ...current, badges: current.badges.map((badge, i) => (i === index ? { ...badge, ...patch } : badge)) }));
  const missing = SUGGESTED_BADGES.filter((item) => !cfg.badges.some((badge) => badge.name.toUpperCase() === item.name));

  return (
    <Card>
      <CardHeader
        icon={ShieldCheck}
        title="Trust & certificates"
        subtitle="“Why choose us” text with your approval and certificate badges, on the home page. A badge with a certificate picture opens it full size."
        actions={bar(dirty, () => save({ trust_section_config: { ...cfg, badges: cfg.badges.filter((badge) => badge.name.trim() || badge.logo) } }), 'Save')}
      />
      <Toggle checked={cfg.enabled} onChange={(value) => set({ enabled: value })} label={cfg.enabled ? 'Shown on the home page' : 'Hidden'} />

      <div className="grid gap-3 sm:grid-cols-2 mt-4">
        <Field label="Small heading">
          <input className="a-field" value={cfg.eyebrow} onChange={(e) => set({ eyebrow: e.target.value })} placeholder="Trust & Quality" />
        </Field>
        <Field label="Title" hint={STAR_HINT}>
          <input className="a-field" value={cfg.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
      </div>
      <Field label="Text" hint="Leave an empty line between paragraphs." className="mt-3">
        <textarea className="a-field" rows={7} value={cfg.text} onChange={(e) => set({ text: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <MediaPicker label="Picture beside the text (optional)" value={cfg.image} onChange={(url) => set({ image: url })} />
        <div className="space-y-3">
          <Field label="Background">
            <Select
              value={cfg.tone}
              onChange={(value) => set({ tone: value as TrustSectionConfig['tone'] })}
              options={[
                { value: 'soft', label: 'Soft tint of your brand colour' },
                { value: 'plain', label: 'Plain (page background)' },
                { value: 'dark', label: 'Brand colour (white text)' },
              ]}
            />
          </Field>
          <Field label="Line above the badges">
            <input className="a-field" value={cfg.badgesTitle} onChange={(e) => set({ badgesTitle: e.target.value })} placeholder="Approved & certified by" />
          </Field>
        </div>
      </div>

      {/* badges */}
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h4 className="font-bold inline-flex items-center gap-2" style={{ fontSize: 'var(--a-fs-md)' }}>
            <Award className="w-4 h-4" style={{ color: 'var(--primary)' }} /> Badges ({cfg.badges.length})
          </h4>
          <Button
            size="sm"
            icon={Plus}
            disabled={cfg.badges.length >= 12}
            onClick={() => set({ badges: [...cfg.badges, { id: newId(), name: '', label: 'Certified', logo: '', certificate: '' }] })}
          >
            Add badge
          </Button>
        </div>
        <p className="mb-3" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
          Upload each organisation's logo for the badge (until then a neat round seal with the short name is shown). Add the certificate picture to let customers open it.
        </p>
        {missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>Quick add:</span>
            {missing.map((item) => (
              <button
                key={item.name}
                type="button"
                disabled={cfg.badges.length >= 12}
                onClick={() => set({ badges: [...cfg.badges, { id: newId(), name: item.name, label: item.label, logo: '', certificate: '' }] })}
                className="h-7 px-2.5 cursor-pointer inline-flex items-center gap-1"
                style={{ borderRadius: 'var(--ds-r-full)', border: '1px dashed var(--a-border-strong)', fontSize: 'var(--a-fs-xs)', fontWeight: 600 }}
              >
                <Plus className="w-3 h-3" /> {item.name}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-2.5">
          {cfg.badges.map((badge, index) => (
            <div key={badge.id} className="p-3" style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)', background: 'var(--a-surface)' }}>
              <div className="grid gap-3 md:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_auto] items-start">
                <div className="w-16 h-16 inline-flex items-center justify-center" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)' }}>
                  {badge.logo ? (
                    <img src={badge.logo} alt="" className="max-w-[90%] max-h-[90%] object-contain" />
                  ) : (
                    <TrustSeal name={badge.name || '?'} className="w-14 h-14" />
                  )}
                </div>
                <Field label="Short name">
                  <input className="a-field" value={badge.name} maxLength={24} placeholder="ISO" onChange={(e) => setBadge(index, { name: e.target.value })} />
                </Field>
                <Field label="Line under it">
                  <input className="a-field" value={badge.label} maxLength={40} placeholder="Certified" onChange={(e) => setBadge(index, { label: e.target.value })} />
                </Field>
                <div className="flex items-center gap-1 md:pt-6">
                  <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={index === 0} onClick={() => set({ badges: move(cfg.badges, index, -1) })} />
                  <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={index === cfg.badges.length - 1} onClick={() => set({ badges: move(cfg.badges, index, 1) })} />
                  <IconButton icon={Trash2} size="sm" tone="danger" label="Remove badge" onClick={() => set({ badges: cfg.badges.filter((_, i) => i !== index) })} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 mt-3">
                <MediaPicker label="Logo" value={badge.logo} onChange={(url) => setBadge(index, { logo: url })} modalTitle={`Logo — ${badge.name || 'badge'}`} />
                <MediaPicker
                  label="Certificate picture (opens full size)"
                  value={badge.certificate}
                  onChange={(url) => setBadge(index, { certificate: url })}
                  modalTitle={`Certificate — ${badge.name || 'badge'}`}
                />
              </div>
            </div>
          ))}
          {cfg.badges.length === 0 && (
            <p className="p-4 text-center" style={{ borderRadius: 'var(--ds-r-md)', border: '1px dashed var(--a-border)', fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              No badges yet. Use Quick add or Add badge.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
};

/* ============================================================= facility */

const FacilityCard: React.FC<{ settings: SiteSettings; onSaveSettings: SaveFn }> = ({ settings, onSaveSettings }) => {
  const initial = useMemo(() => facilitySectionOf(settings), [settings]);
  const [cfg, setCfg] = useState<FacilitySectionConfig>(initial);
  const { save, bar } = useSaver(settings, onSaveSettings);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(initial);
  const set = (patch: Partial<FacilitySectionConfig>) => setCfg((current) => ({ ...current, ...patch }));
  const urls = cfg.gallery.map((photo) => photo.url);

  return (
    <Card>
      <CardHeader
        icon={Factory}
        title="Factory & lab"
        subtitle="Your company profile with photos of the production floor and the lab. The button opens all photos in a full-screen gallery."
        actions={bar(
          dirty,
          () => save({ facility_section_config: { ...cfg, points: cfg.points.map((point) => point.trim()).filter(Boolean) } }),
          'Save'
        )}
      />
      <Toggle checked={cfg.enabled} onChange={(value) => set({ enabled: value })} label={cfg.enabled ? 'Shown on the home page' : 'Hidden'} />

      <div className="grid gap-3 sm:grid-cols-2 mt-4">
        <Field label="Small heading">
          <input className="a-field" value={cfg.eyebrow} onChange={(e) => set({ eyebrow: e.target.value })} placeholder="Our Facility" />
        </Field>
        <Field label="Title" hint={STAR_HINT}>
          <input className="a-field" value={cfg.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
      </div>
      <Field label="Short introduction" hint="Leave an empty line between paragraphs." className="mt-3">
        <textarea className="a-field" rows={4} value={cfg.text} onChange={(e) => set({ text: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <Field label="Points with a tick" hint="One per line, up to 6">
          <textarea className="a-field" rows={4} value={cfg.points.join('\n')} onChange={(e) => set({ points: e.target.value.split('\n').slice(0, 6) })} />
        </Field>
        <div className="space-y-3">
          <Field label="Button text" hint="Opens the photo gallery">
            <input className="a-field" value={cfg.buttonText} onChange={(e) => set({ buttonText: e.target.value })} placeholder="Explore Our Facility" />
          </Field>
          <Field label="Photos on computers">
            <Select
              value={cfg.imageSide}
              onChange={(value) => set({ imageSide: value as 'start' | 'end' })}
              options={[
                { value: 'start', label: 'Left of the text' },
                { value: 'end', label: 'Right of the text' },
              ]}
            />
          </Field>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <MediaPicker label="Main photo (empty = first gallery photo)" value={cfg.cover} onChange={(url) => set({ cover: url })} />
        <div>
          <MediaPicker
            gallery
            label={`Gallery photos (${cfg.gallery.length}/40) — drag to reorder`}
            values={urls}
            max={40}
            onChangeMany={(next) =>
              set({ gallery: next.map((url) => cfg.gallery.find((photo) => photo.url === url) || { id: newId(), url, caption: '' }) })
            }
          />
        </div>
      </div>

      {cfg.gallery.length > 0 && (
        <div className="mt-4">
          <h4 className="font-bold mb-2 inline-flex items-center gap-2" style={{ fontSize: 'var(--a-fs-md)' }}>
            <ImageIcon className="w-4 h-4" style={{ color: 'var(--primary)' }} /> Captions <span style={{ fontWeight: 400, color: 'var(--a-text-muted)', fontSize: 'var(--a-fs-sm)' }}>(optional, shown under the photo in the gallery)</span>
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {cfg.gallery.map((photo, index) => (
              <div key={photo.id} className="flex items-center gap-2 p-1.5" style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)' }}>
                <img src={photo.url} alt="" className="w-14 h-10 object-cover shrink-0" style={{ borderRadius: 'var(--ds-r-sm)' }} />
                <input
                  className="a-field"
                  value={photo.caption}
                  maxLength={160}
                  placeholder={index === 0 ? 'e.g. Production floor' : index === 1 ? 'e.g. Quality control lab' : 'Caption'}
                  onChange={(e) => set({ gallery: cfg.gallery.map((item, i) => (i === index ? { ...item, caption: e.target.value } : item)) })}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {cfg.gallery.length === 0 && !cfg.cover && (
        <p className="mt-3 px-3 py-2" style={{ borderRadius: 'var(--ds-r-md)', background: tint(0.06), fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
          Add photos of your factory and lab — the section looks best with 6 or more. Without photos it shows the text only.
        </p>
      )}
    </Card>
  );
};

/**
 * v3.14 — Website → Trust & Facility: the "why choose us" section with
 * certificate badges, and the factory & lab profile with its photo gallery.
 * Both appear on the Classic and the Glow home page (in Glow they can also be
 * moved in Themes → Glow home page sections).
 */
export const AdminTrustTab: React.FC<{ settings: SiteSettings; onSaveSettings: SaveFn }> = ({ settings, onSaveSettings }) => (
  <div className="space-y-5">
    <TrustCard settings={settings} onSaveSettings={onSaveSettings} />
    <FacilityCard settings={settings} onSaveSettings={onSaveSettings} />
  </div>
);
