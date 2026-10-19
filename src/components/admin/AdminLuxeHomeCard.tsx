import React, { useState } from 'react';
import { ArrowUp, ArrowDown, ChevronDown, Crown, Plus, Trash2 } from 'lucide-react';
import { Card, CardHeader, Button, Field, Toggle, Select, IconButton, mix } from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import {
  DEFAULT_LUXE_SECTIONS,
  LUXE_SECTION_INFO,
  luxeHomeOf,
  type LuxeHomeConfig,
  type LuxeSectionId,
  type LuxePromoTile,
} from '../../lib/luxeTheme.ts';

const STAR_HINT = 'Put *stars* around words to draw them in the accent colour.';

const CARD_OPTIONS = [
  { value: 'luxe', label: 'Luxe (recommended)' },
  { value: 'boutique', label: 'Boutique' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'spotlight', label: 'Spotlight' },
  { value: 'classic', label: 'Classic' },
  { value: 'modern', label: 'Modern' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'compact', label: 'Compact' },
  { value: 'glow', label: 'Glow' },
];

const EDITABLE: LuxeSectionId[] = ['hero', 'marquee', 'categories', 'featured', 'imageText', 'newArrivals', 'promoGrid', 'allProducts'];

const RowSwitch: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    title={checked ? 'Shown — click to hide' : 'Hidden — click to show'}
    onClick={() => onChange(!checked)}
    className="relative shrink-0 cursor-pointer"
    style={{ width: 40, height: 24, borderRadius: 999, background: checked ? 'var(--primary)' : 'var(--ds-gray-300)', transition: 'background-color var(--ds-dur) var(--ds-ease)' }}
  >
    <span
      className="absolute bg-white"
      style={{ top: 3, left: checked ? 19 : 3, width: 18, height: 18, borderRadius: 999, boxShadow: 'var(--ds-shadow-sm)', transition: 'left var(--ds-dur) var(--ds-ease)' }}
    />
  </button>
);

/**
 * v3.15 — Dashboard → Website → Themes → "Luxe home page sections".
 * The state lives in the Themes page so one Save stores everything.
 */
export const AdminLuxeHomeCard: React.FC<{
  value: LuxeHomeConfig;
  onChange: (next: LuxeHomeConfig) => void;
  active: boolean;
  saveBar: React.ReactNode;
}> = ({ value, onChange, active, saveBar }) => {
  const [open, setOpen] = useState<LuxeSectionId | null>(null);
  const setSection = <K extends LuxeSectionId>(id: K, patch: Partial<LuxeHomeConfig['sections'][K]>) =>
    onChange({ ...value, sections: { ...value.sections, [id]: { ...value.sections[id], ...patch } } });
  const move = (index: number, delta: number) => {
    const order = [...value.order];
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    onChange({ ...value, order });
  };

  return (
    <Card>
      <CardHeader
        icon={Crown}
        title="Luxe home page sections"
        subtitle={`Used when the home page design is Luxe — a premium, Shopify-style look. Switch each part on or off, move it, and open it to change its words and pictures. ${STAR_HINT}`}
      />
      {!active && (
        <p className="mb-3 px-3 py-2" style={{ fontSize: 'var(--a-fs-sm)', borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-warning)', 0.12), color: 'var(--ds-warning-text)' }}>
          The home page is not set to Luxe, so these sections are not shown yet. Choose Luxe above to use them.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <Field label="Product card design on this page" hint="Luxe matches this theme best. The rest of the shop keeps the design chosen in Product Card.">
          <Select value={value.cardDesign} onChange={(next) => onChange({ ...value, cardDesign: next as any })} options={CARD_OPTIONS} />
        </Field>
      </div>
      <div className="space-y-2">
        {value.order.map((id, index) => {
          const info = LUXE_SECTION_INFO.find((item) => item.id === id)!;
          const section: any = value.sections[id];
          const editable = EDITABLE.includes(id);
          const expanded = open === id;
          return (
            <div key={id} style={{ borderRadius: 'var(--ds-r-md)', border: `1px solid ${expanded ? 'var(--primary)' : 'var(--a-border)'}`, background: 'var(--a-surface)' }}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <RowSwitch checked={Boolean(section.enabled)} onChange={(enabled) => setSection(id, { enabled } as any)} label={`Show ${info.name}`} />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left cursor-pointer"
                  onClick={() => editable && setOpen(expanded ? null : id)}
                  disabled={!editable}
                  style={{ opacity: section.enabled ? 1 : 0.6 }}
                >
                  <span className="block font-bold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                    {info.name}
                  </span>
                  <span className="block truncate" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                    {info.note}
                  </span>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={index === 0} onClick={() => move(index, -1)} />
                  <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={index === value.order.length - 1} onClick={() => move(index, 1)} />
                  {editable && (
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : id)}
                      className="inline-flex items-center gap-1 h-8 px-2.5 font-semibold cursor-pointer"
                      style={{
                        borderRadius: 'var(--ds-r-sm)',
                        fontSize: 'var(--a-fs-sm)',
                        background: expanded ? mix('var(--primary)', 0.1) : 'var(--a-surface-3)',
                        color: expanded ? 'var(--primary-ink, var(--primary))' : 'var(--a-text-soft)',
                      }}
                      aria-expanded={expanded}
                    >
                      Edit <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
              {expanded && (
                <div className="px-3 pb-4 pt-1" style={{ borderTop: '1px solid var(--a-border-soft)' }}>
                  <LuxeSectionEditor id={id} value={value} setSection={setSection} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between gap-3 flex-wrap">
        <Button size="sm" onClick={() => onChange(luxeHomeOf({}))}>
          Reset sections to the default
        </Button>
        {saveBar}
      </div>
    </Card>
  );
};

type SetSection = <K extends LuxeSectionId>(id: K, patch: Partial<LuxeHomeConfig['sections'][K]>) => void;

const LuxeSectionEditor: React.FC<{ id: LuxeSectionId; value: LuxeHomeConfig; setSection: SetSection }> = ({ id, value, setSection }) => {
  const section: any = value.sections[id];
  const text = (key: string, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input className="a-field" value={section[key] ?? ''} placeholder={(DEFAULT_LUXE_SECTIONS as any)[id]?.[key] ?? ''} onChange={(e) => setSection(id, { [key]: e.target.value } as any)} />
    </Field>
  );
  const area = (key: string, label: string) => (
    <Field label={label} className="sm:col-span-2">
      <textarea className="a-field" rows={3} value={section[key] ?? ''} placeholder={(DEFAULT_LUXE_SECTIONS as any)[id]?.[key] ?? ''} onChange={(e) => setSection(id, { [key]: e.target.value } as any)} />
    </Field>
  );
  const number = (key: string, label: string, min: number, max: number) => (
    <Field label={label} hint={`${min}–${max}`}>
      <input
        type="number"
        min={min}
        max={max}
        className="a-field ds-num"
        value={section[key] ?? ''}
        onChange={(e) => setSection(id, { [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) } as any)}
      />
    </Field>
  );
  const image = (key: string, label: string) => (
    <div className="sm:col-span-2">
      <MediaPicker label={label} value={section[key] || ''} onChange={(url) => setSection(id, { [key]: url } as any)} />
    </div>
  );
  const grid = (children: React.ReactNode) => <div className="grid gap-3 sm:grid-cols-2 mt-3">{children}</div>;

  if (id === 'hero')
    return grid(
      <>
        <Field label="Hero style" className="sm:col-span-2">
          <Select
            value={section.style}
            onChange={(style) => setSection('hero', { style: style as any })}
            options={[
              { value: 'banners', label: 'My banner slider (Website → Hero Banners)' },
              { value: 'editorial', label: 'One big picture with words and buttons over it' },
            ]}
          />
        </Field>
        {section.style === 'editorial' && (
          <>
            {image('image', 'Picture — best 1920 × 900 px. Empty = a background in your brand colour.')}
            {image('mobileImage', 'Phone picture (optional) — best 800 × 1000 px')}
            {text('smallTitle', 'Small title')}
            {text('title', 'Title', STAR_HINT)}
            {area('text', 'Text')}
            {text('button', 'Button')}
            {text('link', 'Button link', 'e.g. /shop, /offers, /shop?category=hair-care')}
            {text('secondButton', 'Second button (empty = hidden)')}
            {text('secondLink', 'Second button link')}
            <Field label="Words position">
              <Select
                value={section.align}
                onChange={(align) => setSection('hero', { align: align as any })}
                options={[
                  { value: 'start', label: 'Left (right in Arabic)' },
                  { value: 'center', label: 'Centre' },
                ]}
              />
            </Field>
          </>
        )}
      </>
    );

  if (id === 'marquee') {
    const items: string[] = section.items || [];
    return (
      <div className="mt-3 space-y-3">
        <Field label="Speed">
          <Select
            value={section.speed}
            onChange={(speed) => setSection('marquee', { speed: speed as any })}
            options={[
              { value: 'slow', label: 'Slow' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Fast' },
            ]}
          />
        </Field>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex gap-2">
              <input
                className="a-field"
                value={item}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = e.target.value;
                  setSection('marquee', { items: next });
                }}
              />
              <IconButton icon={Trash2} label="Remove" onClick={() => setSection('marquee', { items: items.filter((_, i) => i !== index) })} />
            </div>
          ))}
          {items.length < 12 && (
            <Button size="sm" icon={Plus} onClick={() => setSection('marquee', { items: [...items, ''] })}>
              Add a line
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (id === 'categories')
    return grid(
      <>
        {text('smallTitle', 'Small title')}
        {text('title', 'Title', STAR_HINT)}
        {number('limit', 'How many categories', 2, 12)}
        <p className="sm:self-end" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
          Shows your featured categories with their pictures (Products → Categories). Best picture: 800 × 1000 px.
        </p>
      </>
    );

  if (id === 'featured')
    return grid(
      <>
        {text('smallTitle', 'Small title')}
        {text('title', 'Title', STAR_HINT)}
        {number('limit', 'How many products', 4, 24)}
        {text('button', 'Button under the products (empty = hidden)')}
        <div className="sm:col-span-2">
          <Toggle checked={Boolean(section.showTabs)} onChange={(showTabs) => setSection('featured', { showTabs })} label="Tabs: Best Sellers / New Arrivals / On Sale" />
        </div>
      </>
    );

  if (id === 'imageText')
    return grid(
      <>
        {image('image', 'Picture — best 1000 × 1250 px')}
        <Field label="Picture side">
          <Select
            value={section.imageSide}
            onChange={(imageSide) => setSection('imageText', { imageSide: imageSide as any })}
            options={[
              { value: 'start', label: 'Left (right in Arabic)' },
              { value: 'end', label: 'Right (left in Arabic)' },
            ]}
          />
        </Field>
        {text('smallTitle', 'Small title')}
        {text('title', 'Title', STAR_HINT)}
        {area('text', 'Text (an empty line starts a new paragraph)')}
        {text('button', 'Button (empty = hidden)')}
        {text('link', 'Button link')}
      </>
    );

  if (id === 'newArrivals')
    return grid(
      <>
        {text('smallTitle', 'Small title')}
        {text('title', 'Title', STAR_HINT)}
        {number('limit', 'How many products', 4, 24)}
        <p className="sm:self-end" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
          Products marked “New Arrival”; if none are marked, the newest products.
        </p>
      </>
    );

  if (id === 'allProducts') return grid(<>{text('title', 'Title', STAR_HINT)}{number('limit', 'How many products', 4, 30)}</>);

  if (id === 'promoGrid') {
    const tiles: LuxePromoTile[] = section.tiles || [];
    const setTile = (index: number, patch: Partial<LuxePromoTile>) =>
      setSection('promoGrid', { tiles: tiles.map((tile, i) => (i === index ? { ...tile, ...patch } : tile)) });
    return (
      <div className="mt-3 space-y-4">
        {tiles.map((tile, index) => (
          <div key={index} className="p-3 space-y-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)' }}>
            <div className="flex items-center justify-between">
              <span className="font-bold" style={{ fontSize: 'var(--a-fs-sm)' }}>
                Tile {index + 1}
              </span>
              <IconButton icon={Trash2} size="sm" label="Remove tile" onClick={() => setSection('promoGrid', { tiles: tiles.filter((_, i) => i !== index) })} />
            </div>
            <MediaPicker label="Picture — best 1200 × 750 px (empty = a colour background)" value={tile.image || ''} onChange={(url) => setTile(index, { image: url })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Small title">
                <input className="a-field" value={tile.smallTitle || ''} onChange={(e) => setTile(index, { smallTitle: e.target.value })} />
              </Field>
              <Field label="Title">
                <input className="a-field" value={tile.title || ''} onChange={(e) => setTile(index, { title: e.target.value })} />
              </Field>
              <Field label="Button">
                <input className="a-field" value={tile.button || ''} onChange={(e) => setTile(index, { button: e.target.value })} />
              </Field>
              <Field label="Link">
                <input className="a-field" value={tile.link || ''} placeholder="/offers" onChange={(e) => setTile(index, { link: e.target.value })} />
              </Field>
            </div>
          </div>
        ))}
        {tiles.length < 3 && (
          <Button size="sm" icon={Plus} onClick={() => setSection('promoGrid', { tiles: [...tiles, { title: '', button: 'Shop Now', link: '/shop', image: '' }] })}>
            Add a tile
          </Button>
        )}
      </div>
    );
  }
  return null;
};
