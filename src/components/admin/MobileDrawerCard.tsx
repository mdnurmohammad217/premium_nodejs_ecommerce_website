import React, { useEffect, useState } from 'react';
import { Smartphone, Save, Check, Megaphone, LayoutGrid } from 'lucide-react';
import { Card, CardHeader, Button, Toggle, Field, mix } from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import { SiteSettings } from '../../types/index.ts';
import { DEFAULT_MOBILE_DRAWER, mobileDrawerConfigOf } from '../store/MobileDrawer.tsx';

type Config = ReturnType<typeof mobileDrawerConfigOf>;

/**
 * Website → Mobile Nav → Mobile menu: the side menu that opens from the ☰
 * button on phones — welcome text and picture, the promo banner (text,
 * button, link, picture, on/off) and the category tiles.
 */
export const MobileDrawerCard: React.FC<{ settings: SiteSettings; onSaveSettings: (next: SiteSettings) => Promise<void> | void }> = ({
  settings,
  onSaveSettings,
}) => {
  const [draft, setDraft] = useState<Config>(() => mobileDrawerConfigOf(settings));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setDraft(mobileDrawerConfigOf(settings)), [settings]);

  const patch = (changes: Partial<Config>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...changes }));
  };
  const patchPromo = (changes: Partial<Config['promo']>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, promo: { ...current.promo, ...changes } }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSaveSettings({ ...settings, mobile_drawer_config: draft } as any);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const promo = draft.promo;

  return (
    <Card accent="var(--ds-amber)">
      <CardHeader
        title="Mobile menu (side drawer)"
        subtitle="The menu that slides in from the ☰ button on phones. The menu rows come from Menu Builder."
        icon={Smartphone}
        accent="var(--ds-amber)"
        actions={
          <Button variant="primary" icon={saved ? Check : Save} onClick={save} loading={saving}>
            {saved ? 'Saved' : 'Save Mobile Menu'}
          </Button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Welcome text" hint="Under the logo, on the coloured banner.">
              <input className="a-field" value={draft.subtitle} onChange={(event) => patch({ subtitle: event.target.value })} placeholder={DEFAULT_MOBILE_DRAWER.subtitle} />
            </Field>
            <Field label="Menu heading">
              <input className="a-field" value={draft.menuTitle} onChange={(event) => patch({ menuTitle: event.target.value })} placeholder="Menu" />
            </Field>
          </div>
          <Field label="Banner picture (optional)" hint="A transparent PNG looks best. Empty = a shopping-bag drawing.">
            <MediaPicker value={draft.bannerImage} onChange={(url) => patch({ bannerImage: url })} modalTitle="Banner picture" />
          </Field>

          <div className="pt-4 border-t space-y-4" style={{ borderColor: 'var(--a-border-soft)' }}>
            <div className="flex items-center gap-2 font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
              <Megaphone className="w-4 h-4" style={{ color: 'var(--ds-amber)' }} /> Promo banner
            </div>
            <Toggle checked={promo.enabled !== false} onChange={(value) => patchPromo({ enabled: value })} label="Show the promo banner" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ opacity: promo.enabled !== false ? 1 : 0.55 }}>
              <Field label="Title line 1">
                <input className="a-field" value={promo.title} onChange={(event) => patchPromo({ title: event.target.value })} placeholder="Big" />
              </Field>
              <Field label="Title line 2 (brand colour)">
                <input className="a-field" value={promo.highlight} onChange={(event) => patchPromo({ highlight: event.target.value })} placeholder="Discounts" />
              </Field>
              <Field label="Small text">
                <input className="a-field" value={promo.subtitle} onChange={(event) => patchPromo({ subtitle: event.target.value })} placeholder="On All Categories" />
              </Field>
              <Field label="Button text">
                <input className="a-field" value={promo.buttonText} onChange={(event) => patchPromo({ buttonText: event.target.value })} placeholder="Shop Now" />
              </Field>
              <Field label="Link" hint="e.g. offers, shop?category=panjabi, /lp/eid-offer or a full https:// link" className="sm:col-span-2">
                <input className="a-field" value={promo.link} onChange={(event) => patchPromo({ link: event.target.value })} placeholder="offers" />
              </Field>
            </div>
            <Field label="Promo picture (optional)">
              <MediaPicker value={promo.image} onChange={(url) => patchPromo({ image: url })} modalTitle="Promo picture" />
            </Field>
          </div>

          <div className="pt-4 border-t space-y-4" style={{ borderColor: 'var(--a-border-soft)' }}>
            <div className="flex items-center gap-2 font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
              <LayoutGrid className="w-4 h-4" style={{ color: 'var(--ds-teal)' }} /> Categories
            </div>
            <Toggle checked={draft.showCategories} onChange={(value) => patch({ showCategories: value })} label="Show the category tiles" description="Top-level categories with their pictures (set in Products → Categories), in one row that slides sideways." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Heading">
                <input className="a-field" value={draft.categoriesTitle} onChange={(event) => patch({ categoriesTitle: event.target.value })} />
              </Field>
              <Field label="How many in the slider" hint="One sliding row; four and a half show at a time.">
                <select className="a-field" value={draft.maxCategories} onChange={(event) => patch({ maxCategories: Number(event.target.value) })}>
                  {[8, 12, 16, 20, 30].map((n) => (
                    <option key={n} value={n}>
                      {n} categories
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </div>

        {/* A live miniature */}
        <div className="hidden xl:block">
          <p className="a-label">Preview</p>
          <div className="p-3 space-y-3" style={{ width: 280, borderRadius: 24, border: '6px solid #111827', background: '#fff' }}>
            <div className="p-3 text-white" style={{ borderRadius: 16, background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 78%, #000), var(--primary))' }}>
              <div className="flex justify-between items-center">
                <span style={{ width: 60, height: 18, borderRadius: 5, background: '#fff' }} />
                <span style={{ width: 24, height: 24, borderRadius: 999, background: '#fff' }} />
              </div>
              <p className="mt-2" style={{ fontSize: 11 }}>
                {draft.subtitle}
              </p>
              <span className="block mt-2" style={{ height: 24, borderRadius: 999, background: '#fff' }} />
            </div>
            {[1, 2, 3].map((n) => (
              <span key={n} className="block" style={{ height: 10, width: `${70 - n * 10}%`, borderRadius: 4, background: 'var(--a-surface-3)' }} />
            ))}
            {promo.enabled !== false && (
              <div className="p-2.5" style={{ borderRadius: 12, background: mix('var(--primary)', 0.1) }}>
                <div style={{ fontWeight: 900, fontSize: 15, lineHeight: 1 }}>{promo.title}</div>
                <div style={{ fontWeight: 900, fontSize: 15, color: 'var(--primary-ink, var(--primary))' }}>{promo.highlight}</div>
                <div style={{ fontSize: 10, color: 'var(--a-text-muted)' }}>{promo.subtitle}</div>
                {promo.buttonText && (
                  <span className="inline-block mt-1.5 px-2 py-0.5 text-white" style={{ fontSize: 10, borderRadius: 999, background: 'var(--primary)' }}>
                    {promo.buttonText} →
                  </span>
                )}
              </div>
            )}
            {draft.showCategories && (
              <div className="flex gap-1.5 overflow-hidden">
                {Array.from({ length: 5 }).map((_, index) => (
                  <span key={index} className="shrink-0" style={{ width: '20.5%', aspectRatio: '1', borderRadius: 8, background: 'var(--a-surface-3)' }} />
                ))}
              </div>
            )}
            <span className="block" style={{ height: 26, borderRadius: 10, background: 'var(--primary)' }} />
          </div>
        </div>
      </div>

      {error && <p className="ds-error-text mt-3">{error}</p>}
    </Card>
  );
};
