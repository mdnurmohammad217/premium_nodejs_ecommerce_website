import React, { useEffect, useMemo, useState } from 'react';
import {
  Palette,
  Save,
  Check,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Plus,
  Trash2,
  LayoutTemplate,
  ShoppingBag,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Card, CardHeader, Button, Field, Toggle, Select, IconButton, mix } from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import {
  DEFAULT_GLOW_SECTIONS,
  GLOW_SECTION_INFO,
  glowHomeOf,
  glowProductOf,
  splitAccent,
  themeOf,
  type GlowHomeConfig,
  type GlowProductConfig,
  type GlowSectionId,
  type PromoCard,
  type StorefrontTheme,
  type ThemeId,
  type HomeThemeId,
} from '../../lib/glowTheme.ts';
import { luxeHomeOf, type LuxeHomeConfig } from '../../lib/luxeTheme.ts';
import { AdminLuxeHomeCard } from './AdminLuxeHomeCard.tsx';
import { hoverShade, isHexColor, lightTint } from '../../lib/contrast.ts';
import { SiteSettings } from '../../types/index.ts';

/**
 * v3.13 — Dashboard → Website → Themes.
 *
 * Pick the design of the home page and of the product page (Classic = the
 * design the shop had until now, Glow = the new boutique look), the Glow
 * accent colour, and — for Glow — which home sections show, in what order,
 * and their words and pictures. Saving changes nothing else on the site.
 */

const ACCENT_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Gold', hex: '#B8914A' },
  { name: 'Copper', hex: '#B5703F' },
  { name: 'Rose', hex: '#C2677E' },
  { name: 'Teal', hex: '#2A8F86' },
  { name: 'Lavender', hex: '#8B74C4' },
  { name: 'Charcoal', hex: '#3D4654' },
];

/** Deep green of the Glow look, for shops that want the full theme colours */
const GLOW_BRAND = '#1E4A2C';

const STAR_HINT = 'Put *stars* around words to draw them in the accent colour.';

export const AdminThemesTab: React.FC<{ settings: SiteSettings; onSaveSettings: (next: SiteSettings) => Promise<void> | void }> = ({
  settings,
  onSaveSettings,
}) => {
  const stored = useMemo(
    () => ({ theme: themeOf(settings), home: glowHomeOf(settings), product: glowProductOf(settings), luxe: luxeHomeOf(settings) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      JSON.stringify((settings as any)?.storefront_theme),
      JSON.stringify((settings as any)?.glow_home_config),
      JSON.stringify((settings as any)?.glow_product_config),
      JSON.stringify((settings as any)?.luxe_home_config),
    ]
  );
  const [theme, setTheme] = useState<Required<StorefrontTheme>>(stored.theme);
  const [home, setHome] = useState<GlowHomeConfig>(stored.home);
  const [product, setProduct] = useState<GlowProductConfig>(stored.product);
  const [luxe, setLuxe] = useState<LuxeHomeConfig>(stored.luxe);
  const [useGlowBrand, setUseGlowBrand] = useState(false);
  const [open, setOpen] = useState<GlowSectionId | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTheme(stored.theme);
    setHome(stored.home);
    setProduct(stored.product);
    setLuxe(stored.luxe);
  }, [stored]);

  const dirty =
    useGlowBrand ||
    JSON.stringify(theme) !== JSON.stringify(stored.theme) ||
    JSON.stringify(home) !== JSON.stringify(stored.home) ||
    JSON.stringify(product) !== JSON.stringify(stored.product) ||
    JSON.stringify(luxe) !== JSON.stringify(stored.luxe);

  const touch = () => {
    setSaved(false);
    setError('');
  };
  const setSection = <K extends GlowSectionId>(id: K, patch: Partial<GlowHomeConfig['sections'][K]>) => {
    touch();
    setHome((current) => ({ ...current, sections: { ...current.sections, [id]: { ...current.sections[id], ...patch } } }));
  };
  const move = (index: number, delta: number) => {
    touch();
    setHome((current) => {
      const order = [...current.order];
      const target = index + delta;
      if (target < 0 || target >= order.length) return current;
      [order[index], order[target]] = [order[target], order[index]];
      return { ...current, order };
    });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const next: any = {
        ...settings,
        storefront_theme: theme,
        glow_home_config: home,
        glow_product_config: product,
        luxe_home_config: luxe,
      };
      if (useGlowBrand) {
        next.theme = { ...(settings as any)?.theme, primaryColor: GLOW_BRAND, primaryHover: hoverShade(GLOW_BRAND), primaryLight: lightTint(GLOW_BRAND) };
      }
      await onSaveSettings(next);
      setUseGlowBrand(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveBar = (
    <div className="flex flex-wrap items-center gap-3">
      {error && (
        <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-danger-text)' }} role="alert">
          {error}
        </span>
      )}
      {saved && (
        <span className="inline-flex items-center gap-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-success-text)' }}>
          <Check className="w-4 h-4" /> Saved — the website shows it now
        </span>
      )}
      <Button variant="primary" icon={Save} loading={saving} disabled={!dirty || saving} onClick={save}>
        Save Themes
      </Button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ designs */}
      <Card>
        <CardHeader
          icon={LayoutTemplate}
          title="Website theme"
          subtitle="Choose the design of the home page and of the product page. Classic is the design your shop has now; nothing of it changes."
          actions={saveBar}
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <ThemeChoice
            label="Home page"
            value={theme.home}
            onChange={(value) => {
              touch();
              setTheme({ ...theme, home: value as HomeThemeId });
            }}
            kind="home"
          />
          <ThemeChoice
            label="Single product page"
            value={theme.product}
            onChange={(value) => {
              touch();
              setTheme({ ...theme, product: value as ThemeId });
            }}
            kind="product"
          />
        </div>
      </Card>

      {/* ------------------------------------------------------ Luxe home (v3.15) */}
      <AdminLuxeHomeCard
        value={luxe}
        onChange={(next) => {
          touch();
          setLuxe(next);
        }}
        active={theme.home === 'luxe'}
        saveBar={saveBar}
      />

      {/* ------------------------------------------------------------ colours */}
      <Card>
        <CardHeader
          icon={Palette}
          title="Glow colours"
          subtitle="Glow and Luxe use your brand colour (System Configuration → Theme & Colors) plus this second colour for prices, highlighted words and Buy Now."
        />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <div className="space-y-4">
            <Field label="Accent colour">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  aria-label="Accent colour picker"
                  value={theme.accentColor}
                  onChange={(e) => {
                    touch();
                    setTheme({ ...theme, accentColor: e.target.value.toUpperCase() });
                  }}
                  style={{ width: 42, height: 42, padding: 2, borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)' }}
                />
                <input
                  className="a-field ds-num"
                  style={{ maxWidth: 130 }}
                  defaultValue={theme.accentColor}
                  key={theme.accentColor}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (isHexColor(value) && value.length === 7) {
                      touch();
                      setTheme({ ...theme, accentColor: value.toUpperCase() });
                    }
                  }}
                />
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.hex}
                    type="button"
                    title={preset.name}
                    aria-label={preset.name}
                    onClick={() => {
                      touch();
                      setTheme({ ...theme, accentColor: preset.hex });
                    }}
                    className="w-8 h-8 rounded-full cursor-pointer"
                    style={{
                      background: preset.hex,
                      boxShadow: theme.accentColor.toUpperCase() === preset.hex.toUpperCase() ? `0 0 0 2px var(--a-surface), 0 0 0 4px ${preset.hex}` : 'none',
                    }}
                  />
                ))}
              </div>
            </Field>
            <label className="flex items-start gap-2 cursor-pointer" style={{ fontSize: 'var(--a-fs-sm)' }}>
              <input type="checkbox" checked={useGlowBrand} onChange={(e) => setUseGlowBrand(e.target.checked)} className="mt-1" />
              <span>
                <b>Also set my brand colour to Glow deep green</b> ({GLOW_BRAND}) when I save — the exact look of the sample design.
                <span className="block" style={{ color: 'var(--a-text-muted)' }}>
                  Changes the colour of the whole website, dashboard and POS. You can change it back any time in System Configuration → Theme &amp; Colors.
                </span>
              </span>
            </label>
          </div>
          <AccentPreview accent={theme.accentColor} primary={useGlowBrand ? GLOW_BRAND : undefined} />
        </div>
      </Card>

      {/* ------------------------------------------------------ home sections */}
      <Card>
        <CardHeader
          icon={Sparkles}
          title="Glow home page sections"
          subtitle={`Used when the home page design is Glow. Switch each part on or off, move it up or down, and open it to change its words and pictures. ${STAR_HINT}`}
        />
        {theme.home !== 'glow' && (
          <p className="mb-3 px-3 py-2" style={{ fontSize: 'var(--a-fs-sm)', borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-warning)', 0.12), color: 'var(--ds-warning-text)' }}>
            The home page is set to Classic, so these sections are not shown yet. Choose Glow above to use them.
          </p>
        )}
        <div className="space-y-2">
          {home.order.map((id, index) => {
            const info = GLOW_SECTION_INFO.find((item) => item.id === id)!;
            const section: any = home.sections[id];
            const editable = hasEditor(id);
            const expanded = open === id;
            return (
              <div
                key={id}
                style={{ borderRadius: 'var(--ds-r-md)', border: `1px solid ${expanded ? 'var(--primary)' : 'var(--a-border)'}`, background: 'var(--a-surface)' }}
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <MiniSwitch checked={Boolean(section.enabled)} onChange={(value) => setSection(id, { enabled: value } as any)} label={`Show ${info.name}`} />
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
                    <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={index === home.order.length - 1} onClick={() => move(index, 1)} />
                    {editable && (
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : id)}
                        className="inline-flex items-center gap-1 h-8 px-2.5 font-semibold cursor-pointer"
                        style={{ borderRadius: 'var(--ds-r-sm)', fontSize: 'var(--a-fs-sm)', background: expanded ? mix('var(--primary)', 0.1) : 'var(--a-surface-3)', color: expanded ? 'var(--primary-ink, var(--primary))' : 'var(--a-text-soft)' }}
                        aria-expanded={expanded}
                      >
                        Edit <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div className="px-3 pb-4 pt-1" style={{ borderTop: '1px solid var(--a-border-soft)' }}>
                    <SectionEditor id={id} home={home} setSection={setSection} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex justify-between gap-3 flex-wrap">
          <Button
            size="sm"
            onClick={() => {
              touch();
              setHome(glowHomeOf({}));
            }}
          >
            Reset sections to the default
          </Button>
          {saveBar}
        </div>
      </Card>

      {/* ------------------------------------------------------ product page */}
      <Card>
        <CardHeader
          icon={ShoppingBag}
          title="Glow product page"
          subtitle="Used when the product page design is Glow. The switches in Website → Product Page (reviews, specifications, video, size guide, related products, sticky buy bar) apply to both designs."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ['showBreadcrumb', 'Breadcrumb (Home › Category › Product)'],
              ['showStockPill', '“In Stock” label beside the name'],
              ['showRating', 'Star rating and number of reviews'],
              ['showWishlist', 'Wishlist (heart) button'],
              ['showMeta', 'SKU and tags'],
              ['showShare', 'Share buttons (Facebook, X, Pinterest, WhatsApp, copy link)'],
              ['showTrust', 'Three promises under the buttons'],
            ] as Array<[keyof GlowProductConfig, string]>
          ).map(([key, label]) => (
            <Toggle
              key={key}
              checked={Boolean(product[key])}
              onChange={(value) => {
                touch();
                setProduct({ ...product, [key]: value });
              }}
              label={label}
            />
          ))}
        </div>
        {product.showTrust && (
          <div className="grid gap-3 sm:grid-cols-3 mt-4">
            {[0, 1, 2].map((index) => (
              <Field key={index} label={`Promise ${index + 1}`} hint={index === 0 ? 'Icon: money' : index === 1 ? 'Icon: truck' : 'Icon: return arrow'}>
                <input
                  className="a-field"
                  value={product.trust[index] || ''}
                  placeholder={['Cash on delivery', 'Fast delivery', 'Easy returns'][index]}
                  onChange={(e) => {
                    touch();
                    const trust = [...product.trust];
                    trust[index] = e.target.value;
                    setProduct({ ...product, trust });
                  }}
                />
              </Field>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">{saveBar}</div>
      </Card>
    </div>
  );
};

/** A bare on/off switch for list rows (the row itself names the section) */
const MiniSwitch: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
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

/* ------------------------------------------------------------ theme cards */

const ThemeChoice: React.FC<{ label: string; value: HomeThemeId; onChange: (value: HomeThemeId) => void; kind: 'home' | 'product' }> = ({ label, value, onChange, kind }) => (
  <div>
    <div className="font-bold mb-2" style={{ fontSize: 'var(--a-fs-md)' }}>
      {label}
    </div>
    <div role="radiogroup" aria-label={label} className={`grid gap-3 ${kind === 'home' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
      {((kind === 'home' ? ['classic', 'glow', 'luxe'] : ['classic', 'glow']) as HomeThemeId[]).map((id) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(id)}
            className="text-left p-2.5 cursor-pointer"
            style={{ borderRadius: 'var(--ds-r-lg)', border: `2px solid ${on ? 'var(--primary)' : 'var(--a-border)'}`, background: on ? mix('var(--primary)', 0.05) : 'var(--a-surface)' }}
          >
            <ThemeThumb id={id} kind={kind} />
            <div className="mt-2 flex items-center justify-between">
              <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)', color: on ? 'var(--primary-ink, var(--primary))' : 'var(--a-text)' }}>
                {id === 'classic' ? 'Classic' : id === 'luxe' ? 'Luxe' : 'Glow'}
              </span>
              {on && <Check className="w-4 h-4" style={{ color: 'var(--primary)' }} />}
            </div>
            <div style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
              {id === 'classic'
                ? 'Your current design'
                : id === 'luxe'
                ? 'Premium Shopify-style: big pictures, tiles, story'
                : kind === 'home'
                ? 'Promo cards, countdown, deals, FAQ'
                : 'Big gallery, pill options, share'}
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

/** Small drawing of each design */
const ThemeThumb: React.FC<{ id: HomeThemeId; kind: 'home' | 'product' }> = ({ id, kind }) => {
  const box = (style: React.CSSProperties, className = '') => <span className={`block ${className}`} style={style} />;
  const grey = 'var(--a-surface-3)';
  const p = 'var(--primary)';
  const gold = 'var(--glow-accent)';
  const frame: React.CSSProperties = { height: 112, borderRadius: 10, background: 'var(--a-surface-2)', padding: 8, overflow: 'hidden' };
  if (kind === 'product') {
    return (
      <div style={frame} className="grid grid-cols-2 gap-2">
        {box({ background: id === 'glow' ? mix(p, 0.15) : grey, borderRadius: id === 'glow' ? 10 : 6 })}
        <div className="space-y-1.5">
          {box({ height: 6, width: '50%', background: grey, borderRadius: 3 })}
          {box({ height: 9, width: '85%', background: 'var(--a-text-faint)', borderRadius: 3 })}
          {box({ height: 8, width: '40%', background: id === 'glow' ? gold : p, borderRadius: 3 })}
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => box({ height: 10, width: 18, borderRadius: id === 'glow' ? 99 : 3, background: i === 0 ? p : grey }, ''))}
          </div>
          <div className="flex gap-1 pt-1">
            {box({ height: 12, flex: 1, borderRadius: id === 'glow' ? 99 : 4, background: id === 'glow' ? p : mix(p, 0.2) })}
            {box({ height: 12, flex: 1, borderRadius: id === 'glow' ? 99 : 4, background: id === 'glow' ? gold : p })}
          </div>
        </div>
      </div>
    );
  }
  if (id === 'luxe') {
    return (
      <div style={frame} className="space-y-1.5">
        {box({ height: 30, background: `linear-gradient(90deg, ${mix(p, 0.6)}, ${mix(p, 0.2)})`, borderRadius: 4 })}
        {box({ height: 5, background: 'var(--a-text)', borderRadius: 1 })}
        <div className="grid grid-cols-4 gap-1">{[0, 1, 2, 3].map((i) => <React.Fragment key={i}>{box({ height: 22, background: mix(p, 0.12 + i * 0.05), borderRadius: 5 })}</React.Fragment>)}</div>
        <div className="grid grid-cols-2 gap-1.5 items-center">
          {box({ height: 30, background: grey, borderRadius: 5 })}
          <div className="space-y-1">
            {box({ height: 5, width: '70%', background: 'var(--a-text-faint)', borderRadius: 2 })}
            {box({ height: 4, width: '90%', background: grey, borderRadius: 2 })}
            {box({ height: 7, width: '40%', background: 'var(--a-text)', borderRadius: 99 })}
          </div>
        </div>
      </div>
    );
  }
  if (id === 'classic') {
    return (
      <div style={frame} className="space-y-1.5">
        {box({ height: 28, background: mix(p, 0.25), borderRadius: 4 })}
        <div className="grid grid-cols-6 gap-1">{[0, 1, 2, 3, 4, 5].map((i) => <React.Fragment key={i}>{box({ height: 14, background: grey, borderRadius: 3 })}</React.Fragment>)}</div>
        <div className="grid grid-cols-4 gap-1">{[0, 1, 2, 3].map((i) => <React.Fragment key={i}>{box({ height: 40, background: '#fff', border: '1px solid var(--a-border)', borderRadius: 4 })}</React.Fragment>)}</div>
      </div>
    );
  }
  return (
    <div style={frame} className="space-y-1.5">
      {box({ height: 24, background: mix(p, 0.25), borderRadius: 4 })}
      <div className="grid grid-cols-2 gap-1">
        {box({ height: 22, background: grey, borderRadius: 7 })}
        {box({ height: 22, background: p, borderRadius: 7 })}
      </div>
      <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <React.Fragment key={i}>{box({ height: 6, width: 18, background: i === 0 ? p : grey, borderRadius: 99 })}</React.Fragment>)}</div>
      <div className="grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-0.5">
            {box({ height: 22, background: mix(p, 0.12), borderRadius: 6 })}
            {box({ height: 4, width: '60%', background: gold, borderRadius: 2 })}
          </div>
        ))}
      </div>
    </div>
  );
};

const AccentPreview: React.FC<{ accent: string; primary?: string }> = ({ accent, primary }) => {
  const p = primary || 'var(--primary)';
  const title = splitAccent('Our *Best Sellers* Products');
  return (
    <div className="p-4" style={{ borderRadius: 'var(--ds-r-lg)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border)' }}>
      <div className="font-bold" style={{ fontSize: 22, lineHeight: 1.2 }}>
        {title.map((part, i) => (
          <span key={i} style={part.accent ? { color: accent } : undefined}>
            {part.text}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-bold" style={{ color: accent, fontSize: 20 }}>
          ৳1,250
        </span>
        <span style={{ textDecoration: 'line-through', color: 'var(--a-text-muted)' }}>৳1,600</span>
      </div>
      <div className="mt-3 flex gap-2">
        <span className="inline-flex items-center justify-center h-9 px-4 rounded-full text-white font-semibold" style={{ background: p, fontSize: 13 }}>
          Add To Cart
        </span>
        <span className="inline-flex items-center justify-center h-9 px-4 rounded-full text-white font-semibold" style={{ background: accent, fontSize: 13 }}>
          Buy Now
        </span>
      </div>
      <p className="mt-3" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
        Small text in this colour is darkened a little on the website so it stays easy to read.
      </p>
    </div>
  );
};

/* -------------------------------------------------------- section editors */

const hasEditor = (id: GlowSectionId) =>
  ['categories', 'promo', 'bestSellers', 'countdown', 'deals', 'weekly', 'newArrivals', 'allProducts', 'faq'].includes(id);

type SetSection = <K extends GlowSectionId>(id: K, patch: Partial<GlowHomeConfig['sections'][K]>) => void;

const SectionEditor: React.FC<{ id: GlowSectionId; home: GlowHomeConfig; setSection: SetSection }> = ({ id, home, setSection }) => {
  const section: any = home.sections[id];
  const text = (key: string, label: string, hint?: string, placeholder?: string) => (
    <Field label={label} hint={hint}>
      <input
        className="a-field"
        value={section[key] ?? ''}
        placeholder={placeholder ?? (DEFAULT_GLOW_SECTIONS as any)[id]?.[key] ?? ''}
        onChange={(e) => setSection(id, { [key]: e.target.value } as any)}
      />
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
    <MediaPicker label={label} value={section[key] || ''} onChange={(url) => setSection(id, { [key]: url } as any)} />
  );
  const grid = (children: React.ReactNode) => <div className="grid gap-3 sm:grid-cols-2 mt-3">{children}</div>;

  if (id === 'categories') return grid(<>{text('title', 'Title', STAR_HINT)}<p className="sm:self-end" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Design (tiles, circles, cards, chips) and slide / grid: Website → Home Sections → Categories.</p></>);
  if (id === 'bestSellers')
    return grid(
      <>
        {text('title', 'Title', STAR_HINT)}
        {text('button', 'Button text')}
        <Field label="Which products">
          <Select
            value={section.source}
            onChange={(value) => setSection('bestSellers', { source: value as any })}
            options={[
              { value: 'bestSeller', label: 'Products marked “Best Seller” (then top rated)' },
              { value: 'rating', label: 'Top rated products' },
              { value: 'newest', label: 'Newest products' },
            ]}
          />
        </Field>
        {number('limit', 'How many products', 4, 24)}
        <Toggle checked={section.showTabs} onChange={(value) => setSection('bestSellers', { showTabs: value })} label="Category tabs (All, Skin Care, …)" />
      </>
    );
  if (id === 'deals') return grid(<>{text('title', 'Title', STAR_HINT)}{number('limit', 'How many products', 2, 8)}<p className="sm:col-span-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Shows the products with the biggest discount (sale price lower than the regular price).</p></>);
  if (id === 'allProducts') return grid(<>{text('title', 'Title', STAR_HINT)}{number('limit', 'How many products', 4, 30)}</>);
  if (id === 'weekly')
    return grid(
      <>
        {text('smallTitle', 'Small title')}
        {text('title', 'Title', STAR_HINT)}
        {text('text', 'Text')}
        {text('button', 'Button text')}
        {text('link', 'Button link', 'e.g. /offers, /shop?category=skin-care or a full https:// address')}
        {image('image', 'Picture (shown on the right; a person or product photo with a plain background looks best)')}
      </>
    );
  if (id === 'countdown')
    return grid(
      <>
        {text('smallTitle', 'Small title')}
        {text('title', 'Title', STAR_HINT)}
        {text('subtitle', 'Line under the title')}
        <Field label="Offer ends" hint="Empty = counts down to midnight every day. After a set date passes, the section hides itself.">
          <input
            type="datetime-local"
            className="a-field ds-num"
            value={section.endsAt || ''}
            onChange={(e) => setSection('countdown', { endsAt: e.target.value })}
          />
        </Field>
        {text('button', 'Button text')}
        {text('link', 'Button link')}
        {image('leftImage', 'Left picture (tall)')}
        {image('rightImage', 'Right picture (tall)')}
        <p className="sm:col-span-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
          Products marked “Flash Sale” show the same countdown on their picture in Best Sellers.
        </p>
      </>
    );
  if (id === 'newArrivals')
    return grid(
      <>
        {text('smallTitle', 'Small title')}
        {text('title', 'Title', STAR_HINT)}
        {text('text', 'Text beside the title')}
        {number('limit', 'How many products', 3, 12)}
        {image('promoImage', 'Tall promo picture')}
        <div className="space-y-3">
          {text('promoTitle', 'Promo title', 'e.g. 50% Off')}
          {text('promoSubtitle', 'Promo line', 'e.g. 16 Jan – 26 Jan')}
          {text('promoButton', 'Promo link text')}
          {text('promoLink', 'Promo link')}
        </div>
        <p className="sm:col-span-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
          Shows the products switched to “New Arrival”; with none, the newest products.
        </p>
      </>
    );
  if (id === 'promo') return <PromoEditor cards={section.cards} onChange={(cards) => setSection('promo', { cards })} />;
  if (id === 'faq') return <FaqEditor section={section} setSection={setSection} text={text} />;
  return null;
};

const PromoEditor: React.FC<{ cards: PromoCard[]; onChange: (cards: PromoCard[]) => void }> = ({ cards, onChange }) => {
  const set = (index: number, patch: Partial<PromoCard>) => onChange(cards.map((card, i) => (i === index ? { ...card, ...patch } : card)));
  return (
    <div className="space-y-3 mt-3">
      {cards.map((card, index) => (
        <div key={index} className="p-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border)' }}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-bold" style={{ fontSize: 'var(--a-fs-sm)' }}>
              Card {index + 1}
            </span>
            <div className="flex items-center gap-2">
              <Select
                value={card.tone || 'light'}
                onChange={(value) => set(index, { tone: value as any })}
                options={[
                  { value: 'light', label: 'Light card' },
                  { value: 'dark', label: 'Card in brand colour' },
                ]}
              />
              <IconButton icon={Trash2} size="sm" tone="danger" label="Remove card" onClick={() => onChange(cards.filter((_, i) => i !== index))} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['badge', 'Badge', 'e.g. Flat 25% Discount'],
                ['title', 'Title', STAR_HINT],
                ['text', 'Text', ''],
                ['button', 'Button text', ''],
                ['link', 'Button link', 'e.g. /offers or /shop?category=hair-care'],
              ] as Array<[keyof PromoCard, string, string]>
            ).map(([key, label, hint]) => (
              <Field key={key} label={label} hint={hint || undefined}>
                <input className="a-field" value={(card[key] as string) || ''} onChange={(e) => set(index, { [key]: e.target.value })} />
              </Field>
            ))}
            <MediaPicker label="Picture (right side)" value={card.image || ''} onChange={(url) => set(index, { image: url })} />
          </div>
        </div>
      ))}
      {cards.length < 3 && (
        <Button size="sm" icon={Plus} onClick={() => onChange([...cards, { badge: '', title: '', text: '', button: 'Shop Now', link: '/shop', image: '', tone: cards.length % 2 ? 'dark' : 'light' }])}>
          Add card
        </Button>
      )}
    </div>
  );
};

const FaqEditor: React.FC<{
  section: GlowHomeConfig['sections']['faq'];
  setSection: SetSection;
  text: (key: string, label: string, hint?: string) => React.ReactNode;
}> = ({ section, setSection, text }) => {
  const items = section.items;
  const setItems = (next: typeof items) => setSection('faq', { items: next });
  const [preview, setPreview] = useState(true);
  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {text('smallTitle', 'Small title')}
        {text('title', 'Title', STAR_HINT)}
      </div>
      <div className="flex items-center justify-between">
        <span className="font-bold" style={{ fontSize: 'var(--a-fs-sm)' }}>
          Questions ({items.length})
        </span>
        <button type="button" onClick={() => setPreview(!preview)} className="inline-flex items-center gap-1 cursor-pointer" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
          {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {preview ? 'Hide answers' : 'Show answers'}
        </button>
      </div>
      {items.map((item, index) => (
        <div key={index} className="p-3 space-y-2" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border)' }}>
          <div className="flex items-center gap-2">
            <input
              className="a-field"
              value={item.q}
              placeholder="Question"
              aria-label={`Question ${index + 1}`}
              onChange={(e) => setItems(items.map((it, i) => (i === index ? { ...it, q: e.target.value } : it)))}
            />
            <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={index === 0} onClick={() => {
              const next = [...items];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              setItems(next);
            }} />
            <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={index === items.length - 1} onClick={() => {
              const next = [...items];
              [next[index + 1], next[index]] = [next[index], next[index + 1]];
              setItems(next);
            }} />
            <IconButton icon={Trash2} size="sm" tone="danger" label="Remove question" onClick={() => setItems(items.filter((_, i) => i !== index))} />
          </div>
          {preview && (
            <textarea
              className="a-field"
              rows={2}
              value={item.a}
              placeholder="Answer"
              aria-label={`Answer ${index + 1}`}
              onChange={(e) => setItems(items.map((it, i) => (i === index ? { ...it, a: e.target.value } : it)))}
            />
          )}
        </div>
      ))}
      <Button size="sm" icon={Plus} onClick={() => setItems([...items, { q: 'New question', a: '' }])}>
        Add question
      </Button>
      <div className="grid gap-3 sm:grid-cols-2 pt-2">
        {text('cardTitle', 'Contact card title')}
        {text('cardText', 'Contact card text')}
        {text('cardButton', 'Contact card button')}
        {text('cardLink', 'Contact card link')}
      </div>
    </div>
  );
};
