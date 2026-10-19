import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgePercent, ChevronDown, ChevronRight, Layers, Save, Undo2, Store, AlertTriangle, Percent } from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  SearchInput,
  Select,
  Toggle,
  Checkbox,
  TableWrap,
  Thumb,
  EmptyState,
  ErrorState,
  SectionLoader,
  Pagination,
  StatCard,
  useDebounced,
  useToasts,
  mix,
} from './ui.tsx';

interface VariationPrice {
  id: number;
  label: string;
  sku: string;
  price: number | null;
  salePrice: number | null;
  wholesalePrice: number | null;
  stock: number;
  status: string;
}

interface PriceRow {
  id: number;
  name: string;
  sku: string;
  image: string;
  unit: string;
  status: string;
  categoryName: string;
  price: number | null;
  salePrice: number | null;
  costPrice: number | null;
  stock: number;
  hasVariations: boolean;
  wholesaleEnabled: boolean;
  wholesalePrice: number | null;
  wholesaleMinQty: number | null;
  wholesaleMaxQty: number | null;
  variations: VariationPrice[];
}

/** What the operator has typed for one product (strings while editing) */
interface Draft {
  wholesaleEnabled: boolean;
  wholesalePrice: string;
  wholesaleMinQty: string;
  wholesaleMaxQty: string;
  variations: Record<number, string>;
}

const str = (value: number | null | undefined) => (value == null ? '' : String(value));

const draftOf = (row: PriceRow): Draft => ({
  wholesaleEnabled: row.wholesaleEnabled,
  wholesalePrice: str(row.wholesalePrice),
  wholesaleMinQty: str(row.wholesaleMinQty),
  wholesaleMaxQty: str(row.wholesaleMaxQty),
  variations: Object.fromEntries(row.variations.map((variation) => [variation.id, str(variation.wholesalePrice)])),
});

const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

const cellInput: React.CSSProperties = {
  minHeight: 'var(--ds-h-sm)',
  height: 'var(--ds-h-sm)',
  padding: '0 var(--ds-s-2)',
  fontSize: 'var(--a-fs-base)',
  textAlign: 'right',
};

/**
 * Wholesale → Wholesale Prices: every product's wholesale price, minimum and
 * maximum quantity, and each variation's own wholesale price, edited in one
 * table and saved together. The server re-checks every value; nothing here
 * decides what a buyer pays.
 */
export const AdminWholesalePricesPage: React.FC<{
  currency: string;
  categories: Array<{ id: number; name: string; parentId?: number | null; level?: number | null }>;
}> = ({ currency, categories }) => {
  const toasts = useToasts();
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ products: 0, enabled: 0 });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [bulk, setBulk] = useState({ percent: '10', base: 'sale', round: '1' });
  const debouncedSearch = useDebounced(search, 300);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), filter });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (category) params.set('category', category);
      const res = await fetch(`/api/admin/wholesale/prices?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'failed');
      const list: PriceRow[] = Array.isArray(data.rows) ? data.rows : [];
      setRows(list);
      setDrafts(Object.fromEntries(list.map((row) => [row.id, draftOf(row)])));
      setTotal(Number(data.total) || 0);
      setStats(data.stats || { products: 0, enabled: 0 });
      setSelected(new Set());
      setRowErrors({});
      setState('ready');
    } catch {
      setState('error');
    }
  }, [page, pageSize, filter, debouncedSearch, category]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setPage(1), [debouncedSearch, category, filter, pageSize]);

  const changedIds = useMemo(
    () => rows.filter((row) => drafts[row.id] && !same(drafts[row.id], draftOf(row))).map((row) => row.id),
    [rows, drafts]
  );

  // Leaving with unsaved prices would lose them
  useEffect(() => {
    if (changedIds.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changedIds.length]);

  const patch = (id: number, changes: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...changes } }));

  const patchVariation = (id: number, variationId: number, value: string) =>
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], variations: { ...current[id].variations, [variationId]: value } },
    }));

  /** "X % below the sale/regular price" for the selected rows (and their options) */
  const applyBulk = () => {
    const percent = Number(bulk.percent);
    const step = Number(bulk.round) || 0;
    if (!Number.isFinite(percent) || percent < 0 || percent >= 100) {
      toasts.push('Enter a discount between 0 and 99 %.', 'error');
      return;
    }
    const target = selected.size > 0 ? rows.filter((row) => selected.has(row.id)) : rows;
    const priceFrom = (regular: number | null, sale: number | null) => {
      const base = bulk.base === 'sale' && Number(sale) > 0 ? Number(sale) : Number(regular) || 0;
      if (!(base > 0)) return '';
      let value = base * (1 - percent / 100);
      if (step > 0) value = Math.max(step, Math.round(value / step) * step);
      return String(Number(value.toFixed(2)));
    };
    setDrafts((current) => {
      const next = { ...current };
      for (const row of target) {
        const variations = { ...next[row.id].variations };
        row.variations.forEach((variation) => {
          variations[variation.id] = priceFrom(variation.price ?? row.price, variation.salePrice ?? (variation.price == null ? row.salePrice : null));
        });
        next[row.id] = { ...next[row.id], wholesaleEnabled: true, wholesalePrice: priceFrom(row.price, row.salePrice), variations };
      }
      return next;
    });
    toasts.push(`Prices filled in for ${target.length} product${target.length === 1 ? '' : 's'} — review, then Save.`);
  };

  const setEnabled = (on: boolean) => {
    const target = selected.size > 0 ? rows.filter((row) => selected.has(row.id)) : [];
    if (target.length === 0) return;
    setDrafts((current) => {
      const next = { ...current };
      target.forEach((row) => (next[row.id] = { ...next[row.id], wholesaleEnabled: on }));
      return next;
    });
  };

  const save = async () => {
    if (changedIds.length === 0) return;
    setSaving(true);
    setRowErrors({});
    try {
      const items = changedIds.map((id) => {
        const draft = drafts[id];
        return {
          id,
          wholesaleEnabled: draft.wholesaleEnabled,
          wholesalePrice: draft.wholesalePrice,
          wholesaleMinQty: draft.wholesaleMinQty,
          wholesaleMaxQty: draft.wholesaleMaxQty,
          variations: Object.entries(draft.variations).map(([variationId, value]) => ({ id: Number(variationId), wholesalePrice: value })),
        };
      });
      const res = await fetch('/api/admin/wholesale/prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json().catch(() => ({}));
      const errors: Array<{ id: number; name: string; error: string }> = Array.isArray(data?.errors) ? data.errors : [];
      if (errors.length > 0) {
        setRowErrors(Object.fromEntries(errors.map((item) => [item.id, item.error])));
        toasts.push(
          `${data.saved || 0} saved. ${errors.length} need attention: ${errors[0].name} — ${errors[0].error}`,
          'error'
        );
      } else if (!res.ok) {
        throw new Error(data?.error || 'Could not save.');
      } else {
        toasts.push(`Wholesale prices saved for ${data.saved} product${data.saved === 1 ? '' : 's'}.`);
      }
      // Reload the saved rows, keep unsaved edits of the failed ones
      const failed = new Set(errors.map((item) => item.id));
      const keep = Object.fromEntries(Array.from(failed).map((id) => [id, drafts[id]]));
      await load();
      if (failed.size > 0) {
        setDrafts((current) => ({ ...current, ...keep }));
        setRowErrors(Object.fromEntries(errors.map((item) => [item.id, item.error])));
      }
    } catch (error: any) {
      toasts.push(error?.message || 'Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDrafts(Object.fromEntries(rows.map((row) => [row.id, draftOf(row)])));
    setRowErrors({});
  };

  const categoryOptions = useMemo(() => {
    const byParent = new Map<number | null, typeof categories>();
    categories.forEach((item) => {
      const key = item.parentId ?? null;
      byParent.set(key, [...(byParent.get(key) || []), item]);
    });
    const out: Array<{ value: string; label: string }> = [{ value: '', label: 'All categories' }];
    const walk = (parent: number | null, depth: number) =>
      (byParent.get(parent) || []).forEach((item) => {
        out.push({ value: String(item.id), label: `${depth ? '— '.repeat(depth) : ''}${item.name}` });
        if (depth < 2) walk(item.id, depth + 1);
      });
    walk(null, 0);
    return out;
  }, [categories]);

  const money = (value: number | null) =>
    value == null || !(Number(value) > 0) ? '—' : `${currency}${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  const warnings = (row: PriceRow, draft: Draft) => {
    const price = Number(draft.wholesalePrice);
    const list: string[] = [];
    if (draft.wholesaleEnabled && !(price > 0) && !Object.values(draft.variations).some((value) => Number(value) > 0)) list.push('Needs a wholesale price');
    if (price > 0 && Number(row.costPrice) > 0 && price < Number(row.costPrice)) list.push('Below cost');
    if (Number(draft.wholesaleMinQty) > 0 && Number(draft.wholesaleMaxQty) > 0 && Number(draft.wholesaleMaxQty) < Number(draft.wholesaleMinQty)) list.push('Max below min');
    return list;
  };

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const someSelected = rows.some((row) => selected.has(row.id));

  const renderPriceInput = (value: string, onChange: (value: string) => void, label: string, placeholder = '', width: number | string = 104) => (
    <input
      type="number"
      min={0}
      step="0.01"
      inputMode="decimal"
      className="a-field ds-num"
      style={{ ...cellInput, width }}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    />
  );

  return (
    <div>
      <PageHeader
        title="Wholesale Prices"
        subtitle="Every wholesale price in one place — products and each of their variations. Only approved wholesale customers see or pay these prices."
        icon={BadgePercent}
        accent="var(--ds-indigo)"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Products" value={stats.products.toLocaleString('en-US')} icon={Store} color="var(--ds-indigo)" />
        <StatCard label="Wholesale" value={stats.enabled.toLocaleString('en-US')} icon={BadgePercent} color="var(--ds-success)" />
        <StatCard label="Not set" value={Math.max(0, stats.products - stats.enabled).toLocaleString('en-US')} icon={Store} color="var(--ds-gray-500)" />
        <StatCard label="Unsaved" value={changedIds.length} icon={Save} color={changedIds.length ? 'var(--ds-amber)' : 'var(--ds-gray-400)'} />
      </div>

      <Card className="mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, SKU, barcode or option" className="flex-1 min-w-0" />
          <div className="grid grid-cols-2 gap-2.5 lg:flex">
            <Select value={category} onChange={setCategory} options={categoryOptions} className="lg:w-[210px]" />
            <Select
              value={filter}
              onChange={setFilter}
              className="lg:w-[190px]"
              options={[
                { value: 'all', label: 'All products' },
                { value: 'on', label: 'Wholesale on' },
                { value: 'off', label: 'Wholesale off' },
                { value: 'variations', label: 'With variations' },
                { value: 'below-cost', label: 'Priced below cost' },
              ]}
            />
          </div>
        </div>

        {/* Quick fill */}
        <div
          className="mt-3 p-3 flex flex-col xl:flex-row xl:items-center gap-2.5"
          style={{ borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-indigo)', 0.06), border: `1px solid ${mix('var(--ds-indigo)', 0.18)}` }}
        >
          <div className="flex items-center gap-2 font-semibold shrink-0" style={{ color: 'var(--ds-indigo)', fontSize: 'var(--a-fs-base)' }}>
            <Percent className="w-4 h-4" /> Quick fill {selected.size > 0 ? `(${selected.size} selected)` : '(this page)'}
          </div>
          <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 'var(--a-fs-base)' }}>
            <span>Wholesale =</span>
            <input
              type="number"
              min={0}
              max={99}
              className="a-field ds-num"
              style={{ ...cellInput, width: 70 }}
              value={bulk.percent}
              aria-label="Percent below"
              onChange={(event) => setBulk({ ...bulk, percent: event.target.value })}
            />
            <span>% below the</span>
            <Select
              value={bulk.base}
              onChange={(value) => setBulk({ ...bulk, base: value })}
              options={[
                { value: 'sale', label: 'selling price' },
                { value: 'regular', label: 'regular price' },
              ]}
            />
            <span>rounded to</span>
            <Select
              value={bulk.round}
              onChange={(value) => setBulk({ ...bulk, round: value })}
              options={[
                { value: '0', label: 'exact' },
                { value: '1', label: `${currency}1` },
                { value: '5', label: `${currency}5` },
                { value: '10', label: `${currency}10` },
              ]}
            />
          </div>
          <div className="flex flex-wrap gap-2 xl:ml-auto">
            <Button size="sm" variant="primary" onClick={applyBulk} disabled={rows.length === 0}>
              Fill prices
            </Button>
            <Button size="sm" onClick={() => setEnabled(true)} disabled={selected.size === 0}>
              Turn on
            </Button>
            <Button size="sm" onClick={() => setEnabled(false)} disabled={selected.size === 0}>
              Turn off
            </Button>
          </div>
        </div>
      </Card>

      <Card padded={false}>
        {state === 'loading' ? (
          <div className="p-5">
            <SectionLoader lines={6} />
          </div>
        ) : state === 'error' ? (
          <ErrorState message="Could not load wholesale prices." onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState title="No products found" description="Try a different search or filter." icon={BadgePercent} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block">
              <TableWrap>
                <table style={{ minWidth: 1080 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>
                        <Checkbox
                          checked={allSelected}
                          indeterminate={!allSelected && someSelected}
                          onChange={(on) => setSelected(on ? new Set(rows.map((row) => row.id)) : new Set())}
                          label="Select all"
                        />
                      </th>
                      <th>Product</th>
                      <th style={{ textAlign: 'right' }}>Regular</th>
                      <th style={{ textAlign: 'right' }}>Selling</th>
                      <th style={{ textAlign: 'right' }}>Cost</th>
                      <th style={{ textAlign: 'center' }}>Wholesale</th>
                      <th style={{ textAlign: 'right', color: 'var(--ds-indigo)' }}>Wholesale price</th>
                      <th style={{ textAlign: 'right' }}>Min qty</th>
                      <th style={{ textAlign: 'right' }}>Max qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const draft = drafts[row.id] || draftOf(row);
                      const changed = changedIds.includes(row.id);
                      const open = Boolean(expanded[row.id]);
                      const notes = warnings(row, draft);
                      return (
                        <React.Fragment key={row.id}>
                          <tr style={changed ? { background: mix('var(--ds-amber)', 0.07) } : undefined}>
                            <td>
                              <Checkbox
                                checked={selected.has(row.id)}
                                onChange={(on) =>
                                  setSelected((current) => {
                                    const next = new Set(current);
                                    if (on) next.add(row.id);
                                    else next.delete(row.id);
                                    return next;
                                  })
                                }
                                label={`Select ${row.name}`}
                              />
                            </td>
                            <td>
                              <div className="flex items-center gap-3 min-w-0">
                                <Thumb src={row.image} alt={row.name} size={38} />
                                <div className="min-w-0">
                                  <div className="font-semibold truncate" style={{ maxWidth: 300 }}>
                                    {row.name}
                                  </div>
                                  <div className="flex items-center gap-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                                    <span className="ds-num">{row.sku}</span>
                                    {row.categoryName && <span>· {row.categoryName}</span>}
                                    {row.hasVariations && (
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1 font-semibold cursor-pointer"
                                        style={{ color: 'var(--ds-indigo)' }}
                                        onClick={() => setExpanded((current) => ({ ...current, [row.id]: !open }))}
                                        aria-expanded={open}
                                      >
                                        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                        <Layers className="w-3.5 h-3.5" /> {row.variations.length} options
                                      </button>
                                    )}
                                  </div>
                                  {(notes.length > 0 || rowErrors[row.id]) && (
                                    <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-danger-text)' }}>
                                      <AlertTriangle className="w-3.5 h-3.5" /> {rowErrors[row.id] || notes.join(' · ')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="ds-num" style={{ textAlign: 'right' }}>{money(row.price)}</td>
                            <td className="ds-num" style={{ textAlign: 'right' }}>{money(Number(row.salePrice) > 0 ? row.salePrice : row.price)}</td>
                            <td className="ds-num" style={{ textAlign: 'right', color: 'var(--a-text-muted)' }}>{money(row.costPrice)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <div className="inline-flex">
                                <Toggle checked={draft.wholesaleEnabled} onChange={(on) => patch(row.id, { wholesaleEnabled: on })} />
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {renderPriceInput(draft.wholesalePrice, (value) => patch(row.id, { wholesalePrice: value }), `${row.name} wholesale price`, row.hasVariations ? 'All options' : '')}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input
                                type="number"
                                min={1}
                                className="a-field ds-num"
                                style={{ ...cellInput, width: 76 }}
                                value={draft.wholesaleMinQty}
                                placeholder="—"
                                aria-label={`${row.name} minimum quantity`}
                                onChange={(event) => patch(row.id, { wholesaleMinQty: event.target.value })}
                              />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input
                                type="number"
                                min={1}
                                className="a-field ds-num"
                                style={{ ...cellInput, width: 76 }}
                                value={draft.wholesaleMaxQty}
                                placeholder="—"
                                aria-label={`${row.name} maximum quantity`}
                                onChange={(event) => patch(row.id, { wholesaleMaxQty: event.target.value })}
                              />
                            </td>
                          </tr>
                          {open &&
                            row.variations.map((variation) => (
                              <tr key={`${row.id}-${variation.id}`} style={{ background: 'var(--a-surface-2)', opacity: variation.status === 'inactive' ? 0.6 : 1 }}>
                                <td />
                                <td>
                                  <div className="pl-12 flex items-center gap-2" style={{ fontSize: 'var(--a-fs-base)' }}>
                                    <span className="font-semibold">{variation.label}</span>
                                    {variation.sku && <span className="ds-num" style={{ color: 'var(--a-text-muted)' }}>{variation.sku}</span>}
                                    <span className="ds-num" style={{ color: 'var(--a-text-muted)' }}>· stock {variation.stock}</span>
                                  </div>
                                </td>
                                <td className="ds-num" style={{ textAlign: 'right' }}>{money(variation.price ?? row.price)}</td>
                                <td className="ds-num" style={{ textAlign: 'right' }}>
                                  {money(Number(variation.salePrice) > 0 ? variation.salePrice : variation.price ?? (Number(row.salePrice) > 0 ? row.salePrice : row.price))}
                                </td>
                                <td />
                                <td />
                                <td style={{ textAlign: 'right' }}>
                                  {renderPriceInput(
                                    draft.variations[variation.id] ?? '',
                                    (value) => patchVariation(row.id, variation.id, value),
                                    `${row.name} ${variation.label} wholesale price`,
                                    draft.wholesalePrice || '—'
                                  )}
                                </td>
                                <td colSpan={2} style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                                  Blank = product price
                                </td>
                              </tr>
                            ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </div>

            {/* Phones and tablets: one card per product */}
            <div className="lg:hidden divide-y" style={{ borderColor: 'var(--a-border)' }}>
              {rows.map((row) => {
                const draft = drafts[row.id] || draftOf(row);
                const changed = changedIds.includes(row.id);
                const notes = warnings(row, draft);
                return (
                  <div key={row.id} className="p-4 space-y-3" style={changed ? { background: mix('var(--ds-amber)', 0.07) } : undefined}>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selected.has(row.id)}
                        onChange={(on) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (on) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          })
                        }
                        label={`Select ${row.name}`}
                      />
                      <Thumb src={row.image} alt={row.name} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold" style={{ overflowWrap: 'anywhere' }}>
                          {row.name}
                        </div>
                        <div className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          Selling {money(Number(row.salePrice) > 0 ? row.salePrice : row.price)} · Cost {money(row.costPrice)}
                        </div>
                      </div>
                      <Toggle checked={draft.wholesaleEnabled} onChange={(on) => patch(row.id, { wholesaleEnabled: on })} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="block" style={{ fontSize: 'var(--a-fs-sm)' }}>
                        <span style={{ color: 'var(--ds-indigo)' }}>Wholesale</span>
                        {renderPriceInput(draft.wholesalePrice, (value) => patch(row.id, { wholesalePrice: value }), `${row.name} wholesale price`, '', '100%')}
                      </label>
                      <label className="block" style={{ fontSize: 'var(--a-fs-sm)' }}>
                        Min qty
                        <input
                          type="number"
                          min={1}
                          className="a-field ds-num w-full"
                          style={cellInput}
                          value={draft.wholesaleMinQty}
                          onChange={(event) => patch(row.id, { wholesaleMinQty: event.target.value })}
                        />
                      </label>
                      <label className="block" style={{ fontSize: 'var(--a-fs-sm)' }}>
                        Max qty
                        <input
                          type="number"
                          min={1}
                          className="a-field ds-num w-full"
                          style={cellInput}
                          value={draft.wholesaleMaxQty}
                          onChange={(event) => patch(row.id, { wholesaleMaxQty: event.target.value })}
                        />
                      </label>
                    </div>
                    {row.variations.length > 0 && (
                      <div className="space-y-1.5 p-2" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)' }}>
                        {row.variations.map((variation) => (
                          <div key={variation.id} className="flex items-center justify-between gap-2" style={{ fontSize: 'var(--a-fs-sm)' }}>
                            <span className="min-w-0 truncate">
                              <strong>{variation.label}</strong>{' '}
                              <span className="ds-num" style={{ color: 'var(--a-text-muted)' }}>
                                {money(Number(variation.salePrice) > 0 ? variation.salePrice : variation.price ?? row.price)}
                              </span>
                            </span>
                            {renderPriceInput(
                              draft.variations[variation.id] ?? '',
                              (value) => patchVariation(row.id, variation.id, value),
                              `${row.name} ${variation.label} wholesale price`,
                              draft.wholesalePrice || '—',
                              96
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {(notes.length > 0 || rowErrors[row.id]) && (
                      <div className="flex items-center gap-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-danger-text)' }}>
                        <AlertTriangle className="w-3.5 h-3.5" /> {rowErrors[row.id] || notes.join(' · ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t" style={{ borderColor: 'var(--a-border)' }}>
              <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </div>
          </>
        )}
      </Card>

      {/* Save bar */}
      {changedIds.length > 0 && (
        <div
          className="sticky bottom-0 z-20 mt-4 px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: 'var(--a-surface)', border: '1px solid var(--a-border)', borderRadius: 'var(--ds-r-lg)', boxShadow: '0 -6px 20px rgba(15,23,42,0.10)' }}
        >
          <span className="font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
            {changedIds.length} product{changedIds.length === 1 ? '' : 's'} changed
          </span>
          <div className="flex items-center gap-2">
            <Button icon={Undo2} onClick={discard} disabled={saving}>
              Discard
            </Button>
            <Button variant="primary" icon={Save} loading={saving} onClick={save}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
