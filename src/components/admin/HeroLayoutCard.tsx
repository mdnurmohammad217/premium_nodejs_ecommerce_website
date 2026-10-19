import React, { useMemo, useState } from 'react';
import { LayoutPanelLeft, Save, Check } from 'lucide-react';
import { Card, CardHeader, Button, Toggle, Field, Select, tint } from './ui.tsx';
import { DEFAULT_HERO_LAYOUT, heroLayoutOf, type HeroLayoutConfig, type HeroStyle } from '../../lib/homeExtras.ts';
import { SiteSettings } from '../../types/index.ts';

const BANNER_FILL = 'linear-gradient(120deg, color-mix(in srgb, var(--primary) 85%, #000), color-mix(in srgb, var(--primary) 30%, #f3c873))';

/** Small drawing of each hero style */
const StyleThumb: React.FC<{ style: HeroStyle }> = ({ style }) => (
  <div className="relative w-full aspect-[16/7] p-2" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)' }} aria-hidden>
    <div className="h-2 mb-1.5" style={{ borderRadius: 3, background: 'var(--a-border)', width: '70%' }} />
    {style === 'full' ? (
      <div className="h-[calc(100%-14px)] -mx-2" style={{ background: BANNER_FILL }} />
    ) : (
      <div className="h-[calc(100%-14px)] grid grid-cols-[30%_1fr] gap-1.5">
        <div className="flex flex-col gap-1 p-1" style={{ borderRadius: 4, background: 'var(--a-surface)', border: '1px solid var(--a-border)' }}>
          <div className="h-2" style={{ borderRadius: 2, background: 'var(--primary)' }} />
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 shrink-0" style={{ borderRadius: 999, background: 'var(--a-border-strong)' }} />
              <span className="h-1 flex-1" style={{ borderRadius: 2, background: 'var(--a-border)' }} />
            </div>
          ))}
        </div>
        <div style={{ borderRadius: 4, background: BANNER_FILL }} />
      </div>
    )}
  </div>
);

/**
 * v3.14 — Website → Hero Banners → Hero layout: the banner across the whole
 * page, or the main categories on the left with the banner on the right.
 * Works on both home designs (Classic and Glow).
 */
export const HeroLayoutCard: React.FC<{ settings: SiteSettings; onSaveSettings: (next: SiteSettings) => Promise<void> | void }> = ({
  settings,
  onSaveSettings,
}) => {
  const initial = useMemo(() => heroLayoutOf(settings), [settings]);
  const [cfg, setCfg] = useState<HeroLayoutConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(cfg) !== JSON.stringify(initial);
  const set = (patch: Partial<HeroLayoutConfig>) => setCfg((current) => ({ ...current, ...patch }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSaveSettings({ ...settings, hero_layout_config: cfg } as any);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const choice = (style: HeroStyle, name: string, note: string) => {
    const on = cfg.style === style;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => set({ style })}
        className="text-start p-2.5 cursor-pointer transition-colors"
        style={{
          borderRadius: 'var(--ds-r-lg)',
          border: `2px solid ${on ? 'var(--primary)' : 'var(--a-border)'}`,
          background: on ? tint(0.06) : 'var(--a-surface)',
        }}
      >
        <StyleThumb style={style} />
        <span className="flex items-center justify-between mt-2">
          <span className="font-bold" style={{ fontSize: 'var(--a-fs-base)', color: on ? 'var(--primary)' : 'var(--a-text)' }}>
            {name}
          </span>
          {on && <Check className="w-4 h-4" style={{ color: 'var(--primary)' }} />}
        </span>
        <span className="block" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
          {note}
        </span>
      </button>
    );
  };

  return (
    <Card>
      <CardHeader
        icon={LayoutPanelLeft}
        title="Hero layout"
        subtitle="The top of the home page: your banners across the whole page, or your categories on the left with the banners beside them. Applies to both home designs."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {error && (
              <span role="alert" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-danger-text)' }}>
                {error}
              </span>
            )}
            {saved && (
              <span className="inline-flex items-center gap-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-success-text)' }}>
                <Check className="w-4 h-4" /> Saved
              </span>
            )}
            <Button variant="primary" icon={Save} loading={saving} disabled={!dirty || saving} onClick={save}>
              Save Layout
            </Button>
          </div>
        }
      />

      <Toggle
        checked={cfg.enabled}
        onChange={(value) => set({ enabled: value })}
        label={cfg.enabled ? 'Hero is shown on the home page' : 'Hero is hidden'}
        description="Switch off to start the home page with the next section."
      />

      {cfg.enabled && (
        <>
          <div role="radiogroup" aria-label="Hero style" className="grid gap-3 sm:grid-cols-2 mt-4 max-w-3xl">
            {choice('full', 'Banner across the page', 'Your banners edge to edge (as before)')}
            {choice('split', 'Categories + banner', 'Category list on the left, banners on the right (computers)')}
          </div>

          {cfg.style === 'split' && (
            <div className="mt-4 p-3 space-y-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)' }}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="List title">
                  <input className="a-field" value={cfg.title} placeholder={DEFAULT_HERO_LAYOUT.title} onChange={(e) => set({ title: e.target.value })} />
                </Field>
                <Field label="Categories in the list" hint="Main categories, in the order of Categories">
                  <Select
                    value={String(cfg.count)}
                    onChange={(value) => set({ count: Number(value) })}
                    options={[6, 8, 10, 12, 15, 20, 30].map((n) => ({ value: String(n), label: `${n} categories` }))}
                  />
                </Field>
                <Field label="Height on computers">
                  <Select
                    value={cfg.height}
                    onChange={(value) => set({ height: value as HeroLayoutConfig['height'] })}
                    options={[
                      { value: 'small', label: 'Small' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'large', label: 'Large' },
                    ]}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Toggle checked={cfg.showSubcategories} onChange={(value) => set({ showSubcategories: value })} label="Sub-categories on hover" description="Pointing at a category opens its sub-categories beside the list." />
                <Toggle checked={cfg.showImages} onChange={(value) => set({ showImages: value })} label="Category pictures" description="A small round picture (or icon) before each name." />
                <Toggle checked={cfg.phoneChips} onChange={(value) => set({ phoneChips: value })} label="Category row on phones" description="Phones have no room for the list: show a sliding row of categories under the banner." />
              </div>
              <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                Tip: banners about <b>1400 × 600 px</b> fit this layout best. A banner of a very different shape is shown whole on a soft blurred background, never
                cut badly.
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
};
