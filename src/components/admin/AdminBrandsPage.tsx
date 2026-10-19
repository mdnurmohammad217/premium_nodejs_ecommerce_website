import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Tag, Plus, Pencil, Trash2, RefreshCw, ImagePlus, Package, Search, LayoutGrid, Save } from 'lucide-react';
import {
  PageHeader,
  StatCard,
  Card,
  Button,
  IconButton,
  SearchInput,
  Select,
  Toolbar,
  EmptyState,
  ErrorState,
  SkeletonGrid,
  Drawer,
  ConfirmDialog,
  Field,
  Thumb,
  useToasts,
  ACCENTS,
  tint,
  Toggle,
} from './ui.tsx';
import { HomeBrandsConfig } from '../../types/index.ts';
import { MediaPicker } from './MediaPicker.tsx';

interface Props {
  onRefresh?: () => void;
}

const emptyBrand = () => ({
  id: null as number | null,
  name: '',
  slug: '',
  logo: '',
  description: '',
});

/**
 * Home page "Shop by Brand" strip: on/off, heading, and whether names show
 * under the logos. Stored as the home_brands_config setting.
 */
const HomeBrandsSettings: React.FC<{ onSaved: (message: string, tone?: 'error') => void }> = ({ onSaved }) => {
  const [config, setConfig] = useState<HomeBrandsConfig>({ enabled: true, title: '', showNames: true });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: any) => {
        const stored = data?.home_brands_config || {};
        setConfig({ enabled: stored.enabled !== false, title: stored.title || '', showNames: stored.showNames !== false });
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  const save = async (next: HomeBrandsConfig = config) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_brands_config: next }),
      });
      if (!res.ok) throw new Error();
      window.dispatchEvent(new CustomEvent('pharma:settings-updated'));
      onSaved(next.enabled ? 'Brand section is shown on the home page.' : 'Brand section is hidden from the home page.');
    } catch {
      onSaved('Could not save the home page brand setting.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span
            className="inline-flex items-center justify-center shrink-0"
            style={{ width: 38, height: 38, borderRadius: 'var(--ds-r-md)', background: tint(0.12), color: 'var(--primary-ink, var(--primary))' }}
          >
            <LayoutGrid className="w-4 h-4" />
          </span>
          <div className="min-w-0 space-y-3 flex-1">
            <Toggle
              checked={config.enabled !== false}
              disabled={!loaded || saving}
              onChange={(value) => {
                const next = { ...config, enabled: value };
                setConfig(next);
                save(next);
              }}
              label="Show brands on the home page"
              description="A logo strip under All Products. Each logo opens that brand's products."
            />
            {config.enabled !== false && (
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
                <Field label="Section heading">
                  <input
                    className="a-field"
                    value={config.title || ''}
                    placeholder="Shop by Brand"
                    onChange={(e) => setConfig({ ...config, title: e.target.value })}
                  />
                </Field>
                <Toggle
                  checked={config.showNames !== false}
                  onChange={(value) => setConfig({ ...config, showNames: value })}
                  label="Names under logos"
                />
              </div>
            )}
          </div>
        </div>
        {config.enabled !== false && (
          <Button icon={Save} onClick={() => save()} loading={saving} disabled={!loaded}>
            Save
          </Button>
        )}
      </div>
    </Card>
  );
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    // \p{M} keeps Bengali vowel signs and hasanta, so "ব্র্যান্ড" stays whole
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, '')
    .replace(/-+/g, '-');

/**
 * Brands — a tile per manufacturer with its logo and how many products carry it,
 * plus a slide-over for adding and editing. The grid shape suits a catalogue of
 * logos far better than a table of names would.
 */
export const AdminBrandsPage: React.FC<Props> = ({ onRefresh }) => {
  const toasts = useToasts();
  const [rows, setRows] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name_asc');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState(emptyBrand());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [brandRes, productRes] = await Promise.all([
        fetch('/api/brands').then((res) => res.json()),
        // v3.15 — counted in the database, not by loading every product
        fetch('/api/admin/brands/product-counts').then((res) => (res.ok ? res.json() : {})),
      ]);
      setRows(Array.isArray(brandRes) ? brandRes : []);
      setCounts(productRes && typeof productRes === 'object' && !Array.isArray(productRes) ? productRes : {});
    } catch {
      setError('Could not load brands.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? rows.filter((row) =>
          `${row.name} ${row.slug || ''}`.toLowerCase().includes(term)
        )
      : [...rows];

    return list.sort((a, b) => {
      if (sort === 'products_desc') return (counts[b.id] || 0) - (counts[a.id] || 0);
      if (sort === 'newest') return Number(b.id || 0) - Number(a.id || 0);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [rows, search, sort, counts]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      withLogo: rows.filter((row) => Boolean(row.logo)).length,
      tagged: rows.reduce((sum, row) => sum + (counts[row.id] || 0), 0),
    }),
    [rows, counts]
  );

  const openAdd = () => {
    setDraft(emptyBrand());
    setDrawerOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) return toasts.push('Enter a brand name.', 'error');
    setSaving(true);
    try {
      const res = await fetch(draft.id ? `/api/admin/brands/${draft.id}` : '/api/admin/brands', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'failed');
      toasts.push(draft.id ? 'Brand updated.' : 'Brand added.');
      setDrawerOpen(false);
      load();
      onRefresh?.();
    } catch (err: any) {
      toasts.push(err.message || 'Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/brands/${confirmDelete.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'failed');
      toasts.push('Brand deleted.');
      setConfirmDelete(null);
      load();
      onRefresh?.();
    } catch (err: any) {
      toasts.push(err.message || 'Could not delete.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Brands"
        subtitle="Manufacturers and brands — logos, slugs and product counts"
        icon={Tag}
        accent={ACCENTS.violet}
        actions={
          <>
            <Button icon={RefreshCw} onClick={load} loading={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={openAdd}>
              Add Brand
            </Button>
          </>
        }
      />

      <div className="mb-4">
        <HomeBrandsSettings onSaved={(message, tone) => toasts.push(message, tone)} />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
        <StatCard label="Total Brands" value={stats.total} icon={Tag} color={ACCENTS.violet} loading={loading} />
        <StatCard
          label="With Logo"
          value={stats.withLogo}
          icon={ImagePlus}
          color={ACCENTS.teal}
          loading={loading}
        />
        <StatCard
          label="Branded Products"
          value={stats.tagged}
          icon={Package}
          color={ACCENTS.indigo}
          loading={loading}
        />
      </div>

      <Card className="mb-4" padded={false}>
        <Toolbar className="p-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by brand name or slug"
            className="flex-1 min-w-0"
          />
          <Select
            value={sort}
            onChange={setSort}
            className="lg:w-[190px] shrink-0"
            options={[
              { value: 'name_asc', label: 'Name (A–Z)' },
              { value: 'products_desc', label: 'Most products first' },
              { value: 'newest', label: 'Newest first' },
            ]}
          />
        </Toolbar>
      </Card>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : loading ? (
        <SkeletonGrid count={8} height={72} />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title={search ? 'No brands match your search' : 'No brands yet'}
            description={
              search
                ? 'Try searching with a different name.'
                : 'Add your product manufacturers and brands — you can then pick them in the product form.'
            }
            icon={search ? Search : Tag}
            action={
              search ? (
                <Button onClick={() => setSearch('')}>Clear Search</Button>
              ) : (
                <Button variant="primary" icon={Plus} onClick={openAdd}>
                  Add Brand
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
          {filtered.map((row) => {
            const productCount = counts[row.id] || 0;
            return (
              <div key={row.id} className="a-card ds-card-hover p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Thumb src={row.logo} alt={row.name} size={56} />

                  <div className="min-w-0 flex-1">
                    <div className="font-bold ds-clamp-1" style={{ fontSize: 'var(--a-fs-md)' }}>
                      {row.name}
                    </div>
                    <div
                      className="truncate"
                      style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                    >
                      /{row.slug}
                    </div>
                  </div>
                </div>

                {row.description && (
                  <p
                    className="ds-clamp-2"
                    style={{ fontSize: 'var(--a-fs-base)', color: 'var(--a-text-soft)' }}
                  >
                    {row.description}
                  </p>
                )}

                <div
                  className="flex items-center justify-between gap-2 pt-3 mt-auto border-t"
                  style={{ borderColor: 'var(--a-border-soft)' }}
                >
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 whitespace-nowrap"
                    style={{
                      height: 'var(--ds-h-sm)',
                      borderRadius: 'var(--ds-r-md)',
                      background: productCount > 0 ? tint(0.09) : 'var(--a-surface-2)',
                      color: productCount > 0 ? 'var(--primary)' : 'var(--a-text-muted)',
                      fontSize: 'var(--a-fs-sm)',
                      fontWeight: 'var(--ds-fw-semibold)',
                    }}
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span className="ds-num font-bold">{productCount}</span> products
                  </span>

                  <div className="flex items-center gap-1.5">
                    <IconButton
                      icon={Pencil}
                      size="sm"
                      tone="primary"
                      label="Edit Brand"
                      onClick={() => {
                        setDraft({ ...emptyBrand(), ...row, description: row.description || '' });
                        setDrawerOpen(true);
                      }}
                    />
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      tone="danger"
                      label={`Delete ${row.name}`}
                      onClick={() => setConfirmDelete(row)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={draft.id ? 'Edit Brand' : 'New Brand'}
        subtitle="This brand will appear in the brand list on the product form"
        footer={
          <>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {draft.id ? 'Save Changes' : 'Add Brand'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Brand name" required>
            <input
              className="a-field"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                  slug: current.id ? current.slug : slugify(event.target.value),
                }))
              }
              placeholder="Enter brand name"
            />
          </Field>

          <Field label="Slug">
            <div className="flex items-stretch gap-2">
              <input
                className="a-field flex-1"
                value={draft.slug}
                onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))}
                placeholder="brand-name"
              />
              <IconButton
                icon={RefreshCw}
                label="Generate slug from name"
                onClick={() => setDraft((current) => ({ ...current, slug: slugify(current.name) }))}
              />
            </div>
          </Field>

          <MediaPicker
            value={draft.logo}
            onChange={(url) => setDraft((current) => ({ ...current, logo: url }))}
            label="Brand logo"
          />

          <Field label="Description">
            <textarea
              className="a-field"
              rows={3}
              value={draft.description || ''}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="A short description of the brand"
            />
          </Field>
        </div>
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete brand?"
        message={`"${confirmDelete?.name || ''}" will be deleted. Its products will stay, but they will no longer be linked to this brand.`}
        confirmLabel="Delete"
        busy={saving}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
