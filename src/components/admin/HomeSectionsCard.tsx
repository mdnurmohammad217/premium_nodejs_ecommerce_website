import React, { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, GalleryHorizontalEnd, Wand2, Save, Check, Rows3, Sparkles, Plus, X, Search, MessageSquare, Shapes } from 'lucide-react';
import { Card, CardHeader, Button, Field, Toggle, Thumb, mix } from './ui.tsx';
import { SiteSettings, Category } from '../../types/index.ts';
import type { HomeSectionsConfig, SectionLayout } from '../store/ProductRail.tsx';

/**
 * v3.10 — Website → Home Sections: choose, section by section, whether the
 * products on the home page are a grid or one sliding row. Grid and Slide look
 * the same on phones, tablets and computers; Auto is the old behaviour (a
 * sliding row on phones, a grid on larger screens).
 */

const CHOICES: Array<{ id: SectionLayout; label: string; icon: typeof LayoutGrid; hint: string }> = [
  { id: 'auto', label: 'Auto', icon: Wand2, hint: 'Slide on phones, grid on computers' },
  { id: 'grid', label: 'Grid', icon: LayoutGrid, hint: 'Rows of products on every device' },
  { id: 'slide', label: 'Slide', icon: GalleryHorizontalEnd, hint: 'One sliding row with arrows on every device' },
];

const flatten = (nodes: Category[], out: Category[] = []): Category[] => {
  for (const node of nodes || []) {
    out.push(node);
    flatten((node.children || []) as Category[], out);
  }
  return out;
};

const Picker: React.FC<{ value: SectionLayout | ''; onChange: (next: SectionLayout | '') => void; allowDefault?: boolean }> = ({
  value,
  onChange,
  allowDefault,
}) => (
  <div
    role="radiogroup"
    className="inline-flex p-0.5 shrink-0"
    style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-3)' }}
  >
    {allowDefault && (
      <button
        type="button"
        role="radio"
        aria-checked={value === ''}
        onClick={() => onChange('')}
        className="px-2.5 font-semibold cursor-pointer"
        style={{
          height: 32,
          borderRadius: 'var(--ds-r-sm)',
          fontSize: 'var(--a-fs-sm)',
          background: value === '' ? 'var(--a-surface)' : 'transparent',
          color: value === '' ? 'var(--a-text)' : 'var(--a-text-muted)',
          boxShadow: value === '' ? 'var(--ds-shadow-xs)' : 'none',
        }}
        title="Follow the choice for all sections"
      >
        Same as all
      </button>
    )}
    {CHOICES.map((choice) => {
      const on = value === choice.id;
      const Icon = choice.icon;
      return (
        <button
          key={choice.id}
          type="button"
          role="radio"
          aria-checked={on}
          title={choice.hint}
          onClick={() => onChange(choice.id)}
          className="inline-flex items-center gap-1.5 px-2.5 font-semibold cursor-pointer"
          style={{
            height: 32,
            borderRadius: 'var(--ds-r-sm)',
            fontSize: 'var(--a-fs-sm)',
            background: on ? 'var(--primary)' : 'transparent',
            color: on ? 'var(--primary-foreground, #fff)' : 'var(--a-text-muted)',
          }}
        >
          <Icon className="w-3.5 h-3.5" />
          {choice.label}
        </button>
      );
    })}
  </div>
);

export const HomeSectionsCard: React.FC<{ settings: SiteSettings; onSaveSettings: (next: SiteSettings) => Promise<void> | void }> = ({
  settings,
  onSaveSettings,
}) => {
  const stored = ((settings as any)?.home_sections_config || {}) as HomeSectionsConfig;
  const [draft, setDraft] = useState<HomeSectionsConfig>({ default: 'auto', ...stored, categories: { ...(stored.categories || {}) } });
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft({ default: 'auto', ...stored, categories: { ...(stored.categories || {}) } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(stored)]);

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setCategories(Array.isArray(data) ? flatten(data) : []))
      .catch(() => setCategories([]));
  }, []);

  const homeCategories = useMemo(() => categories.filter((category) => (category as any).showOnHome), [categories]);

  const change = (patch: Partial<HomeSectionsConfig>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const setCategory = (id: number, value: SectionLayout | '') => {
    setSaved(false);
    setDraft((current) => {
      const next = { ...(current.categories || {}) };
      if (value === '') delete next[String(id)];
      else next[String(id)] = value;
      return { ...current, categories: next };
    });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSaveSettings({ ...settings, home_sections_config: draft } as any);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const row = (key: string, name: string, note: string, control: React.ReactNode) => (
    <div
      key={key}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3"
      style={{ borderTop: '1px solid var(--a-border-soft)' }}
    >
      <div className="min-w-0">
        <div className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
          {name}
        </div>
        <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{note}</div>
      </div>
      {control}
    </div>
  );

  return (
    <Card accent="var(--ds-teal)">
      <CardHeader
        title="Home page sections"
        subtitle="Grid or sliding row for each product section, the category slider, the New Arrival section and the contact block. Grid and Slide work the same on phones, tablets and computers."
        icon={Rows3}
        accent="var(--ds-teal)"
        actions={
          <Button variant="primary" icon={saved ? Check : Save} onClick={save} loading={saving}>
            {saved ? 'Saved' : 'Save Sections'}
          </Button>
        }
      />

      <div
        className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
        style={{ borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-teal)', 0.07), border: `1px solid ${mix('var(--ds-teal)', 0.2)}` }}
      >
        <div>
          <div className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
            All sections
          </div>
          <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
            {CHOICES.find((choice) => choice.id === (draft.default || 'auto'))?.hint}. A section below can have its own choice.
          </div>
        </div>
        <Picker value={draft.default || 'auto'} onChange={(value) => change({ default: (value || 'auto') as SectionLayout })} />
      </div>

      <div className="mt-2">
        {row(
          'flash',
          'Flash Sale',
          'The offer strip at the top of the home page',
          <Picker allowDefault value={draft.flashSale || ''} onChange={(value) => change({ flashSale: (value || undefined) as any })} />
        )}
        {row(
          'all',
          'All Products',
          'Auto = a grid here',
          <Picker allowDefault value={draft.allProducts || ''} onChange={(value) => change({ allProducts: (value || undefined) as any })} />
        )}
        {homeCategories.map((category) =>
          row(
            `cat-${category.id}`,
            category.name,
            'Category section',
            <Picker allowDefault value={(draft.categories || {})[String(category.id)] || ''} onChange={(value) => setCategory(category.id, value)} />
          )
        )}
        {homeCategories.length === 0 && (
          <p className="py-3" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)', borderTop: '1px solid var(--a-border-soft)' }}>
            No category is shown on the home page yet. Turn on “Show Section (Home Page)” for a category in Products → Categories and it appears
            here.
          </p>
        )}
      </div>

      {/* ------------------------------------------------ v3.12: Category slider */}
      <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--a-border)' }}>
        <SectionTitle icon={Shapes} title="Categories" note="The category pictures under the banner — one sliding row, or rows of tiles (grid)." />
        <div className="mb-4">
          <span className="block font-semibold mb-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
            Design
          </span>
          <CategoryDesignPicker value={draft.categoryDesign || 'tile'} onChange={(value) => change({ categoryDesign: value })} />
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="font-semibold" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
            Layout
          </span>
          <div role="radiogroup" aria-label="Category layout" className="inline-flex p-0.5" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-3)' }}>
            {(
              [
                { id: 'slide', label: 'Slide', icon: GalleryHorizontalEnd, hint: 'One sliding row on every device' },
                { id: 'grid', label: 'Grid', icon: LayoutGrid, hint: 'Rows of categories, one under another' },
              ] as const
            ).map((choice) => {
              const on = (draft.categoryLayout === 'grid' ? 'grid' : 'slide') === choice.id;
              const Icon = choice.icon;
              return (
                <button
                  key={choice.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={choice.hint}
                  onClick={() => change({ categoryLayout: choice.id })}
                  className="inline-flex items-center gap-1.5 px-3 font-semibold cursor-pointer"
                  style={{
                    height: 32,
                    borderRadius: 'var(--ds-r-sm)',
                    fontSize: 'var(--a-fs-sm)',
                    background: on ? 'var(--primary)' : 'transparent',
                    color: on ? 'var(--primary-foreground, #fff)' : 'var(--a-text-muted)',
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {choice.label}
                </button>
              );
            })}
          </div>
        </div>
        {draft.categoryLayout === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Per row on phones">
              <select
                className="a-field"
                value={String(draft.categoryGridMobile || 2)}
                onChange={(event) => change({ categoryGridMobile: Number(event.target.value) })}
              >
                <option value="2">2 per row</option>
                <option value="3">3 per row</option>
                <option value="4">4 per row</option>
              </select>
            </Field>
            <Field label="Per row on computers">
              <select
                className="a-field"
                value={String(draft.categoryGridDesktop || 6)}
                onChange={(event) => change({ categoryGridDesktop: Number(event.target.value) })}
              >
                <option value="4">4 per row</option>
                <option value="5">5 per row</option>
                <option value="6">6 per row</option>
                <option value="8">8 per row</option>
              </select>
            </Field>
            <p className="sm:col-span-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              Every featured category is shown, row under row. Tablets use a size in between.
            </p>
          </div>
        ) : (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Toggle
            checked={draft.categoryAutoSlide !== false}
            onChange={(value) => change({ categoryAutoSlide: value })}
            label="Slide by itself"
            description="The categories glide along one by one and start again at the end. It waits while a visitor touches or points at the row."
          />
          <Field label="Speed" className="sm:w-48">
            <select
              className="a-field"
              value={String(draft.categorySlideSeconds || 3)}
              disabled={draft.categoryAutoSlide === false}
              onChange={(event) => change({ categorySlideSeconds: Number(event.target.value) })}
            >
              <option value="2">Fast — every 2 s</option>
              <option value="3">Normal — every 3 s</option>
              <option value="4">Calm — every 4 s</option>
              <option value="6">Slow — every 6 s</option>
            </select>
          </Field>
        </div>
        )}
      </div>

      {/* ------------------------------------------------ v3.12: New Arrival */}
      <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--a-border)' }}>
        <SectionTitle icon={Sparkles} title="New Arrival section" note="Shown right under the categories, with the products you add here." />
        <div className="grid gap-4 md:grid-cols-[auto_1fr_10rem] md:items-end">
          <Toggle
            checked={draft.newArrivalSection?.enabled !== false}
            onChange={(value) => change({ newArrivalSection: { ...(draft.newArrivalSection || {}), enabled: value } })}
            label="Show on the home page"
          />
          <Field label="Section title">
            <input
              className="a-field"
              value={draft.newArrivalSection?.title ?? ''}
              placeholder="New Arrivals"
              maxLength={60}
              onChange={(event) => change({ newArrivalSection: { ...(draft.newArrivalSection || {}), title: event.target.value } })}
            />
          </Field>
          <Field label="Products shown">
            <select
              className="a-field"
              value={String(draft.newArrivalSection?.limit || 10)}
              onChange={(event) => change({ newArrivalSection: { ...(draft.newArrivalSection || {}), limit: Number(event.target.value) } })}
            >
              {[4, 5, 8, 10, 12, 15, 20, 24].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Layout of this section</div>
          <Picker allowDefault value={draft.newArrival || ''} onChange={(value) => change({ newArrival: (value || undefined) as any })} />
        </div>
        <div className="mt-4">
          <NewArrivalPicker />
        </div>
      </div>

      {/* ------------------------------------------------ v3.12: Contact block */}
      <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--a-border)' }}>
        <SectionTitle
          icon={MessageSquare}
          title="“Need help?” contact block"
          note="Near the bottom of the home page: tap-to-call, WhatsApp, e-mail (from Settings → General) and a short message form (messages arrive in Messages)."
        />
        <Toggle
          checked={draft.contactSection?.enabled !== false}
          onChange={(value) => change({ contactSection: { ...(draft.contactSection || {}), enabled: value } })}
          label="Show on the home page"
        />
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <Field label="Title">
            <input
              className="a-field"
              value={draft.contactSection?.title ?? ''}
              placeholder="Need help with an order?"
              maxLength={80}
              onChange={(event) => change({ contactSection: { ...(draft.contactSection || {}), title: event.target.value } })}
            />
          </Field>
          <Field label="Line under the title">
            <input
              className="a-field"
              value={draft.contactSection?.subtitle ?? ''}
              placeholder="Call or WhatsApp us, or leave a message — we reply quickly."
              maxLength={160}
              onChange={(event) => change({ contactSection: { ...(draft.contactSection || {}), subtitle: event.target.value } })}
            />
          </Field>
        </div>
      </div>

      {error && <p className="ds-error-text mt-3">{error}</p>}
      <div className="mt-5 flex justify-end">
        <Button variant="primary" icon={saved ? Check : Save} onClick={save} loading={saving}>
          {saved ? 'Saved' : 'Save Home Sections'}
        </Button>
      </div>
    </Card>
  );
};

/* -------------------------------------------------------------------------- */
/* v3.13 — category design picker, each choice drawn as a tiny preview        */
/* -------------------------------------------------------------------------- */

type CatDesign = 'tile' | 'circle' | 'card' | 'chip';
const CATEGORY_DESIGN_CHOICES: Array<{ id: CatDesign; label: string; hint: string }> = [
  { id: 'tile', label: 'Tiles', hint: 'Square picture, name below' },
  { id: 'circle', label: 'Circles', hint: 'Round picture in a ring' },
  { id: 'card', label: 'Cards', hint: 'Tall picture, name on it' },
  { id: 'chip', label: 'Chips', hint: 'Small pill — compact on phones' },
];

const DesignPreview: React.FC<{ id: CatDesign }> = ({ id }) => {
  const soft = mix('var(--primary)', 0.18);
  const strong = mix('var(--primary)', 0.45);
  const line = <span className="block mx-auto mt-1 rounded-full" style={{ height: 4, width: '70%', background: 'var(--a-border)' }} />;
  if (id === 'circle')
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <span className="block aspect-square rounded-full" style={{ background: soft, boxShadow: `0 0 0 2px ${strong}` }} />
            {line}
          </div>
        ))}
      </div>
    );
  if (id === 'card')
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="relative block aspect-[4/5] rounded-md overflow-hidden" style={{ background: soft }}>
            <span className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: 'linear-gradient(180deg,transparent,rgba(0,0,0,.45))' }} />
            <span className="absolute left-1 right-3 bottom-1.5 h-1 rounded-full bg-white/90" />
          </span>
        ))}
      </div>
    );
  if (id === 'chip')
    return (
      <div className="flex flex-wrap gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="inline-flex items-center gap-1 h-5 pl-0.5 pr-2 rounded-full border" style={{ borderColor: 'var(--a-border)' }}>
            <span className="w-4 h-4 rounded-full" style={{ background: strong }} />
            <span className="h-1 w-5 rounded-full" style={{ background: 'var(--a-border)' }} />
          </span>
        ))}
      </div>
    );
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <span className="block aspect-square rounded-md border" style={{ background: soft, borderColor: 'var(--a-border)' }} />
          {line}
        </div>
      ))}
    </div>
  );
};

const CategoryDesignPicker: React.FC<{ value: CatDesign; onChange: (value: CatDesign) => void }> = ({ value, onChange }) => (
  <div role="radiogroup" aria-label="Category design" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
    {CATEGORY_DESIGN_CHOICES.map((choice) => {
      const on = value === choice.id;
      return (
        <button
          key={choice.id}
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => onChange(choice.id)}
          className="text-left p-2.5 cursor-pointer transition-colors"
          style={{
            borderRadius: 'var(--ds-r-md)',
            border: `1.5px solid ${on ? 'var(--primary)' : 'var(--a-border)'}`,
            background: on ? mix('var(--primary)', 0.06) : 'var(--a-surface)',
          }}
        >
          <div className="h-[58px] flex items-center">
            <div className="w-full">
              <DesignPreview id={choice.id} />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-1">
            <span className="font-bold" style={{ fontSize: 'var(--a-fs-sm)', color: on ? 'var(--primary-ink, var(--primary))' : 'var(--a-text)' }}>
              {choice.label}
            </span>
            {on && <Check className="w-4 h-4" style={{ color: 'var(--primary)' }} />}
          </div>
          <div style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>{choice.hint}</div>
        </button>
      );
    })}
  </div>
);

const SectionTitle: React.FC<{ icon: typeof Sparkles; title: string; note: string }> = ({ icon: Icon, title, note }) => (
  <div className="flex items-start gap-3 mb-4">
    <span
      className="w-8 h-8 shrink-0 inline-flex items-center justify-center"
      style={{ borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-teal)', 0.12), color: 'var(--ds-teal)' }}
    >
      <Icon className="w-4 h-4" />
    </span>
    <div className="min-w-0">
      <div className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
        {title}
      </div>
      <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{note}</div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* v3.12 — New Arrival products                                               */
/* -------------------------------------------------------------------------- */

interface PickProduct {
  id: number;
  name: string;
  image?: string | null;
  sku?: string;
  price?: string | number;
  salePrice?: string | number | null;
  status?: string;
}

/**
 * Pick the products of the home page's New Arrival section. Adding or removing
 * a product is saved at once (it is the product's own "New Arrival" switch,
 * the same one as on the Edit Product page).
 */
const NewArrivalPicker: React.FC = () => {
  const [picked, setPicked] = useState<PickProduct[] | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = React.useCallback(() => {
    fetch('/api/products?newArrival=true&limit=100', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setPicked(Array.isArray(data) ? data : []))
      .catch(() => setPicked([]));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/admin/products?search=${encodeURIComponent(text)}&limit=20`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          const rows = Array.isArray(data) ? data : Array.isArray(data?.products) ? data.products : [];
          setResults(rows);
        })
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const setFlag = async (product: PickProduct, value: boolean) => {
    setBusy(product.id);
    setError('');
    try {
      const res = await fetch('/api/admin/new-arrivals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, value }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Could not save.');
      setPicked((current) => {
        const list = current || [];
        return value ? [product, ...list.filter((item) => item.id !== product.id)] : list.filter((item) => item.id !== product.id);
      });
    } catch (err: any) {
      setError(err?.message || 'Could not save.');
    } finally {
      setBusy(null);
    }
  };

  const pickedIds = new Set((picked || []).map((item) => item.id));
  const price = (item: PickProduct) => {
    const sale = Number(item.salePrice);
    return sale > 0 ? sale : Number(item.price || 0);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--a-text-muted)' }} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a product by name or SKU to add it…"
          className="a-field"
          style={{ paddingLeft: 34 }}
          aria-label="Search products to add to New Arrivals"
        />
      </div>

      {query.trim().length >= 2 && (
        <div className="overflow-hidden" style={{ border: '1px solid var(--a-border)', borderRadius: 'var(--ds-r-md)' }}>
          {searching && results.length === 0 ? (
            <p className="p-3" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="p-3" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              No product found.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {results.map((item) => {
                const added = pickedIds.has(item.id);
                return (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2" style={{ borderTop: '1px solid var(--a-border-soft)' }}>
                    <Thumb src={item.image || undefined} alt={item.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                        {item.sku ? `${item.sku} · ` : ''}৳{price(item).toLocaleString('en-US')}
                        {item.status && item.status !== 'active' ? ` · ${item.status} (not shown on the website)` : ''}
                      </div>
                    </div>
                    <Button
                      variant={added ? 'secondary' : 'primary'}
                      size="sm"
                      icon={added ? Check : Plus}
                      disabled={added || busy === item.id}
                      loading={busy === item.id}
                      onClick={() => setFlag(item, true)}
                    >
                      {added ? 'Added' : 'Add'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {error && <p className="ds-error-text">{error}</p>}

      <div>
        <div className="font-semibold mb-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
          In the section now {picked ? `(${picked.length})` : ''}
        </div>
        {picked === null ? (
          <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Loading…</p>
        ) : picked.length === 0 ? (
          <p
            className="p-3"
            style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)', border: '1px dashed var(--a-border)', borderRadius: 'var(--ds-r-md)' }}
          >
            No product yet — search above and press Add. The section stays hidden until it has at least one product.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {picked.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 p-2"
                style={{ border: '1px solid var(--a-border)', borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface)' }}
              >
                <Thumb src={item.image || undefined} alt={item.name} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>৳{price(item).toLocaleString('en-US')}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setFlag(item, false)}
                  disabled={busy === item.id}
                  aria-label={`Remove ${item.name} from New Arrivals`}
                  title="Remove"
                  className="w-8 h-8 shrink-0 inline-flex items-center justify-center cursor-pointer disabled:opacity-50"
                  style={{ borderRadius: 'var(--ds-r-md)', color: 'var(--ds-danger)', background: mix('var(--ds-danger)', 0.08) }}
                >
                  {busy === item.id ? <span className="ds-spinner w-3.5 h-3.5" /> : <X className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
