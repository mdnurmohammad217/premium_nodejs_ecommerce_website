import React, { useEffect, useState } from 'react';
import { PanelTop, Save, Check, Sun, Moon } from 'lucide-react';
import { Card, CardHeader, Button, Toggle, Field, mix } from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import { SiteSettings } from '../../types/index.ts';

type Style = 'classic' | 'transparent' | 'centered' | 'market';

interface HeaderConfig {
  style: Style;
  transparentTone: 'light' | 'dark';
  lightLogoUrl: string;
  showHotline: boolean;
}

const DEFAULTS: HeaderConfig = { style: 'classic', transparentTone: 'light', lightLogoUrl: '', showHotline: true };

const STYLES: Array<{ id: Style; name: string; text: string }> = [
  { id: 'classic', name: 'Classic', text: 'Logo, big search and icons, with the menu bar underneath.' },
  { id: 'transparent', name: 'Transparent', text: 'One see-through row over the home banner; turns solid white when the page scrolls.' },
  { id: 'centered', name: 'Centered Boutique', text: 'Logo in the middle, search on the left, centred menu with an underline — elegant for fashion.' },
  { id: 'market', name: 'Marketplace', text: 'Brand-coloured bar with a wide search, an “All Categories” button and the hotline.' },
];

/** A small drawing of each design, so the choice is visual */
const Preview: React.FC<{ id: Style }> = ({ id }) => {
  const bar = (w: number | string, h = 5, color = 'var(--a-border-strong)') => (
    <span style={{ display: 'block', width: w, height: h, borderRadius: 3, background: color }} />
  );
  const dot = (color = 'var(--a-border-strong)', size = 9) => <span style={{ width: size, height: size, borderRadius: 999, background: color, display: 'inline-block' }} />;
  const logo = (color = 'var(--primary)') => <span style={{ width: 22, height: 10, borderRadius: 3, background: color, display: 'inline-block' }} />;
  const banner = (
    <div style={{ height: 34, background: 'linear-gradient(120deg, #7c2d12, #f97316)', borderRadius: 4 }} />
  );
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };
  if (id === 'classic')
    return (
      <div className="space-y-1">
        <div style={{ ...row, justifyContent: 'space-between', padding: '5px 6px', background: '#fff', borderRadius: 4 }}>
          {logo()}
          {bar('45%', 8, 'var(--a-surface-3)')}
          <span style={row}>
            {dot()}
            {dot()}
          </span>
        </div>
        <div style={{ ...row, padding: '3px 6px', background: '#fff', borderRadius: 4 }}>
          {bar(18)}
          {bar(18)}
          {bar(18)}
          {bar(18)}
        </div>
        {banner}
      </div>
    );
  if (id === 'transparent')
    return (
      <div style={{ position: 'relative', height: 62, borderRadius: 4, overflow: 'hidden', background: 'linear-gradient(120deg, #7c2d12, #f97316)' }}>
        <div style={{ ...row, justifyContent: 'space-between', padding: '6px', background: 'linear-gradient(180deg, rgba(0,0,0,.45), transparent)' }}>
          {logo('#fff')}
          <span style={row}>
            {bar(14, 4, 'rgba(255,255,255,.85)')}
            {bar(14, 4, 'rgba(255,255,255,.85)')}
            {bar(14, 4, 'rgba(255,255,255,.85)')}
          </span>
          <span style={row}>
            {dot('rgba(255,255,255,.85)')}
            {dot('rgba(255,255,255,.85)')}
          </span>
        </div>
      </div>
    );
  if (id === 'centered')
    return (
      <div className="space-y-1">
        <div style={{ ...row, justifyContent: 'space-between', padding: '5px 6px', background: '#fff', borderRadius: 4 }}>
          {bar('28%', 8, 'var(--a-surface-3)')}
          {logo()}
          <span style={row}>
            {dot()}
            {dot()}
          </span>
        </div>
        <div style={{ ...row, justifyContent: 'center', padding: '3px 6px', background: '#fff', borderRadius: 4 }}>
          {bar(16)}
          {bar(16, 5, 'var(--primary)')}
          {bar(16)}
          {bar(16)}
        </div>
        {banner}
      </div>
    );
  return (
    <div className="space-y-1">
      <div style={{ ...row, justifyContent: 'space-between', padding: '5px 6px', background: 'var(--primary)', borderRadius: 4 }}>
        {logo('#fff')}
        {bar('52%', 8, '#fff')}
        <span style={row}>
          {dot('rgba(255,255,255,.8)')}
          {dot('rgba(255,255,255,.8)')}
        </span>
      </div>
      <div style={{ ...row, padding: '3px 6px', background: '#fff', borderRadius: 4 }}>
        {bar(26, 7, 'var(--primary)')}
        {bar(16)}
        {bar(16)}
        {bar(16)}
      </div>
      {banner}
    </div>
  );
};

/**
 * Website → Header: choose one of four header designs. Every design keeps the
 * menu, search, wishlist, cart and My Account, and works on phones.
 */
export const HeaderDesignCard: React.FC<{ settings: SiteSettings; onSaveSettings: (next: SiteSettings) => Promise<void> | void }> = ({
  settings,
  onSaveSettings,
}) => {
  const [draft, setDraft] = useState<HeaderConfig>({ ...DEFAULTS, ...((settings as any)?.header_config || {}) });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setDraft({ ...DEFAULTS, ...((settings as any)?.header_config || {}) }), [settings]);

  const patch = (changes: Partial<HeaderConfig>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...changes }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSaveSettings({ ...settings, header_config: draft } as any);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card accent="var(--primary)">
      <CardHeader
        title="Header design"
        subtitle="Pick how the top of the website looks. Menu, search, wishlist, cart and My Account work the same in every design, on phones too."
        icon={PanelTop}
        actions={
          <Button variant="primary" icon={saved ? Check : Save} onClick={save} loading={saving}>
            {saved ? 'Saved' : 'Save Header'}
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" role="radiogroup" aria-label="Header design">
        {STYLES.map((item) => {
          const on = draft.style === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => patch({ style: item.id })}
              className="text-left p-3 cursor-pointer transition-all"
              style={{
                borderRadius: 'var(--ds-r-lg)',
                border: `2px solid ${on ? 'var(--primary)' : 'var(--a-border)'}`,
                background: on ? mix('var(--primary)', 0.05) : 'var(--a-surface)',
                boxShadow: on ? 'var(--ds-shadow-md)' : 'none',
              }}
            >
              <div className="p-2 mb-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)' }}>
                <Preview id={item.id} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                  {item.name}
                </span>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    border: `2px solid ${on ? 'var(--primary)' : 'var(--a-border-strong)'}`,
                    boxShadow: on ? 'inset 0 0 0 3px var(--a-surface)' : 'none',
                    background: on ? 'var(--primary)' : 'transparent',
                  }}
                />
              </div>
              <p className="mt-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                {item.text}
              </p>
            </button>
          );
        })}
      </div>

      {draft.style === 'transparent' && (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Text colour over the banner" hint="Light for dark banners, dark for light banners.">
            <div className="flex gap-2">
              {(
                [
                  ['light', 'Light (white)', Sun],
                  ['dark', 'Dark', Moon],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => patch({ transparentTone: value })}
                  className="flex-1 inline-flex items-center justify-center gap-2 font-semibold cursor-pointer"
                  style={{
                    height: 40,
                    borderRadius: 'var(--ds-r-md)',
                    border: `1px solid ${draft.transparentTone === value ? 'var(--primary)' : 'var(--a-border)'}`,
                    background: draft.transparentTone === value ? mix('var(--primary)', 0.08) : 'var(--a-surface)',
                    color: draft.transparentTone === value ? 'var(--primary)' : 'var(--a-text-soft)',
                  }}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="White logo (optional)" hint="Optional. Shown while the header is see-through — useful when your normal logo is dark. Without it your normal logo is shown as it is, with no box behind it.">
            <MediaPicker value={draft.lightLogoUrl} onChange={(url) => patch({ lightLogoUrl: url })} modalTitle="White logo" />
          </Field>
        </div>
      )}

      {draft.style === 'market' && (
        <div className="mt-5">
          <Toggle
            checked={draft.showHotline}
            onChange={(value) => patch({ showHotline: value })}
            label="Show the hotline in the menu bar"
            description="Uses the phone number from Settings → Store."
          />
        </div>
      )}

      {error && <p className="ds-error-text mt-3">{error}</p>}
    </Card>
  );
};
