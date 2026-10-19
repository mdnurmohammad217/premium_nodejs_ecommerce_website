import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ruler, Plus, Pencil, Trash2, Copy, Columns3, Rows3, X, Package, Sparkles, Eye } from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  IconButton,
  Badge,
  EmptyState,
  ErrorState,
  Drawer,
  ConfirmDialog,
  Field,
  Toggle,
  SearchInput,
  SkeletonGrid,
  useToasts,
  mix,
} from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import { SizeGuide } from '../../types/index.ts';

/**
 * Size Guides — reusable size charts. A guide is picked on the product form
 * (Inventory tab) and shows as a "Size guide" button on the product page.
 */

interface Draft {
  id: number | null;
  name: string;
  description: string;
  columns: string[];
  rows: string[][];
  image: string;
  note: string;
  status: 'active' | 'inactive';
}

const PRESETS: Array<{ id: string; name: string; hint: string; columns: string[]; rows: string[][]; note?: string }> = [
  {
    id: 'tshirt',
    name: 'T-Shirt',
    hint: 'Chest, length, sleeve (inch)',
    columns: ['Size', 'Chest (in)', 'Length (in)', 'Sleeve (in)'],
    rows: [
      ['S', '36', '27', '7.5'],
      ['M', '38', '28', '8'],
      ['L', '40', '29', '8.5'],
      ['XL', '42', '30', '9'],
      ['XXL', '44', '31', '9.5'],
    ],
    note: 'Measurements are of the garment laid flat. Allow ±0.5 inch.',
  },
  {
    id: 'shirt',
    name: 'Shirt',
    hint: 'Chest, length, shoulder, sleeve',
    columns: ['Size', 'Chest (in)', 'Length (in)', 'Shoulder (in)', 'Sleeve (in)'],
    rows: [
      ['S', '38', '29', '17', '24'],
      ['M', '40', '30', '17.5', '24.5'],
      ['L', '42', '31', '18', '25'],
      ['XL', '44', '32', '18.5', '25.5'],
      ['XXL', '46', '33', '19', '26'],
    ],
  },
  {
    id: 'panjabi',
    name: 'Panjabi',
    hint: 'Chest, length, shoulder, sleeve',
    columns: ['Size', 'Chest (in)', 'Length (in)', 'Shoulder (in)', 'Sleeve (in)'],
    rows: [
      ['38', '40', '40', '17', '23.5'],
      ['40', '42', '41', '17.5', '24'],
      ['42', '44', '42', '18', '24.5'],
      ['44', '46', '43', '18.5', '25'],
      ['46', '48', '44', '19', '25.5'],
    ],
  },
  {
    id: 'pant',
    name: 'Pant / Trouser',
    hint: 'Waist, hip, length, thigh',
    columns: ['Size', 'Waist (in)', 'Hip (in)', 'Length (in)', 'Thigh (in)'],
    rows: [
      ['28', '28', '36', '39', '22'],
      ['30', '30', '38', '40', '23'],
      ['32', '32', '40', '41', '24'],
      ['34', '34', '42', '41', '25'],
      ['36', '36', '44', '42', '26'],
    ],
  },
  {
    id: 'shoes',
    name: 'Shoes',
    hint: 'EU / UK / US / foot length',
    columns: ['EU (BD)', 'UK', 'US', 'Foot length (cm)'],
    rows: [
      ['39', '6', '7', '24.5'],
      ['40', '6.5', '7.5', '25'],
      ['41', '7.5', '8.5', '26'],
      ['42', '8', '9', '26.5'],
      ['43', '9', '10', '27.5'],
      ['44', '9.5', '10.5', '28'],
    ],
    note: 'Measure your foot from heel to the longest toe and pick the nearest length.',
  },
  {
    id: 'kids',
    name: 'Kids',
    hint: 'Age, height, chest, length',
    columns: ['Age', 'Height (cm)', 'Chest (in)', 'Length (in)'],
    rows: [
      ['2–3 Y', '92–98', '21', '16'],
      ['4–5 Y', '104–110', '23', '18'],
      ['6–7 Y', '116–122', '25', '20'],
      ['8–9 Y', '128–134', '27', '22'],
      ['10–11 Y', '140–146', '29', '24'],
    ],
  },
  { id: 'blank', name: 'Blank', hint: 'Start from an empty 3 × 3 table', columns: ['Size', '', ''], rows: [['', '', ''], ['', '', ''], ['', '', '']] },
];

const emptyDraft = (): Draft => ({
  id: null,
  name: '',
  description: '',
  columns: [...PRESETS[0].columns],
  rows: PRESETS[0].rows.map((row) => [...row]),
  image: '',
  note: PRESETS[0].note || '',
  status: 'active',
});

const cellStyle: React.CSSProperties = { height: 34, padding: '0 8px', fontSize: 'var(--a-fs-base)', minWidth: 86 };

export const AdminSizeGuidesPage: React.FC = () => {
  const toasts = useToasts();
  const [guides, setGuides] = useState<SizeGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<SizeGuide | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/size-guides');
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || 'Could not load size guides.');
      setGuides(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? guides.filter((guide) => guide.name.toLowerCase().includes(term)) : guides;
  }, [guides, search]);

  const patch = (changes: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...changes } : current));

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((item) => item.id === presetId);
    if (!preset || !draft) return;
    patch({
      columns: [...preset.columns],
      rows: preset.rows.map((row) => [...row]),
      note: draft.note || preset.note || '',
      name: draft.name || (preset.id === 'blank' ? '' : `${preset.name} size chart`),
    });
  };

  const setCell = (rowIndex: number, cellIndex: number, value: string) =>
    draft &&
    patch({ rows: draft.rows.map((row, r) => (r === rowIndex ? row.map((cell, c) => (c === cellIndex ? value : cell)) : row)) });

  const setColumn = (index: number, value: string) => draft && patch({ columns: draft.columns.map((column, c) => (c === index ? value : column)) });

  const addColumn = () => draft && draft.columns.length < 12 && patch({ columns: [...draft.columns, ''], rows: draft.rows.map((row) => [...row, '']) });
  const removeColumn = (index: number) =>
    draft && draft.columns.length > 1 && patch({ columns: draft.columns.filter((_, c) => c !== index), rows: draft.rows.map((row) => row.filter((_, c) => c !== index)) });
  const addRow = () => draft && draft.rows.length < 60 && patch({ rows: [...draft.rows, draft.columns.map(() => '')] });
  const removeRow = (index: number) => draft && patch({ rows: draft.rows.filter((_, r) => r !== index) });
  const duplicateRow = (index: number) =>
    draft && draft.rows.length < 60 && patch({ rows: [...draft.rows.slice(0, index + 1), [...draft.rows[index]], ...draft.rows.slice(index + 1)] });

  const openEditor = (guide?: SizeGuide) => {
    setFormError('');
    setDraft(
      guide
        ? {
            id: guide.id,
            name: guide.name,
            description: guide.description || '',
            columns: guide.columns.length ? [...guide.columns] : [''],
            rows: guide.rows.map((row) => guide.columns.map((_, index) => row[index] || '')),
            image: guide.image || '',
            note: guide.note || '',
            status: guide.status === 'inactive' ? 'inactive' : 'active',
          }
        : emptyDraft()
    );
  };

  const save = async () => {
    if (!draft) return;
    setFormError('');
    if (!draft.name.trim()) return setFormError('Give the size guide a name, e.g. "Men’s T-Shirt".');
    if (draft.columns.every((column) => !column.trim())) return setFormError('Add at least one column heading.');
    const cleanRows = draft.rows.filter((row) => row.some((cell) => cell.trim()));
    if (cleanRows.length === 0) return setFormError('Add at least one size row.');
    setSaving(true);
    try {
      const res = await fetch(draft.id ? `/api/admin/size-guides/${draft.id}` : '/api/admin/size-guides', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, rows: cleanRows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save the size guide.');
      toasts.push(draft.id ? 'Size guide updated.' : 'Size guide created.');
      setDraft(null);
      load();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      const res = await fetch(`/api/admin/size-guides/${deleting.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete the size guide.');
      toasts.push('Size guide deleted.');
      setDeleting(null);
      load();
    } catch (err: any) {
      toasts.push(err.message, 'error');
    } finally {
      setBusyDelete(false);
    }
  };

  return (
    <div>
      {toasts.node}
      <PageHeader
        title="Size Guides"
        subtitle="Size charts for clothing, shoes and more. Pick one on a product and shoppers get a “Size guide” button on its page."
        icon={Ruler}
        accent="var(--ds-violet)"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => openEditor()}>
            New size guide
          </Button>
        }
      />

      {guides.length > 0 && (
        <div className="mb-4 max-w-md">
          <SearchInput value={search} onChange={setSearch} placeholder="Search size guides…" />
        </div>
      )}

      {loading ? (
        <SkeletonGrid count={3} height={180} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : guides.length === 0 ? (
        <Card>
          <EmptyState
            icon={Ruler}
            title="No size guides yet"
            description="Create one from a ready preset — T-shirt, shirt, panjabi, pant, shoes or kids — then adjust the numbers."
            action={
              <Button variant="primary" icon={Sparkles} onClick={() => openEditor()}>
                Create the first size guide
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((guide) => (
            <div key={guide.id} className="a-card overflow-hidden flex flex-col" style={{ borderTop: '3px solid var(--ds-violet)' }}>
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold truncate" style={{ fontSize: 'var(--a-fs-lg)' }}>
                    {guide.name}
                  </h3>
                  <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                    {guide.columns.length} columns · {guide.rows.length} sizes
                  </p>
                </div>
                <Badge status={guide.status === 'inactive' ? 'inactive' : 'active'} dot />
              </div>
              <div className="px-4 overflow-x-auto">
                <table className="w-full" style={{ fontSize: 'var(--a-fs-sm)', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {guide.columns.slice(0, 5).map((column, index) => (
                        <th key={index} className="text-left font-semibold whitespace-nowrap px-2 py-1.5" style={{ background: mix('var(--ds-violet)', 0.1), color: 'var(--a-text)' }}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {guide.rows.slice(0, 3).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {guide.columns.slice(0, 5).map((_, cellIndex) => (
                          <td key={cellIndex} className="px-2 py-1 whitespace-nowrap" style={{ borderTop: '1px solid var(--a-border)', color: 'var(--a-text-soft)' }}>
                            {row[cellIndex] || '–'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {guide.rows.length > 3 && (
                  <p className="px-2 py-1" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                    + {guide.rows.length - 3} more
                  </p>
                )}
              </div>
              <div className="mt-auto p-4 pt-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                  <Package className="w-4 h-4" />
                  {guide.productCount || 0} product{guide.productCount === 1 ? '' : 's'}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" icon={Pencil} onClick={() => openEditor(guide)}>
                    Edit
                  </Button>
                  <IconButton icon={Trash2} tone="danger" size="sm" label="Delete size guide" onClick={() => setDeleting(guide)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit size guide' : 'New size guide'}
        subtitle="Start from a preset, then edit any cell. Columns and rows can be added or removed."
        width="max-w-3xl"
        footer={
          <>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {draft?.id ? 'Save changes' : 'Create size guide'}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-4 items-end">
              <Field label="Name" required>
                <input className="a-field" value={draft.name} maxLength={191} placeholder="e.g. Men’s T-Shirt" onChange={(e) => patch({ name: e.target.value })} />
              </Field>
              <Toggle checked={draft.status === 'active'} onChange={(on) => patch({ status: on ? 'active' : 'inactive' })} label="Active" />
            </div>

            <div>
              <p className="a-label">Presets</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className="text-left p-2.5 cursor-pointer transition-colors"
                    style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)', background: 'var(--a-surface)' }}
                    onMouseEnter={(event) => (event.currentTarget.style.borderColor = 'var(--ds-violet)')}
                    onMouseLeave={(event) => (event.currentTarget.style.borderColor = 'var(--a-border)')}
                  >
                    <span className="block font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                      {preset.name}
                    </span>
                    <span className="block truncate" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                      {preset.hint}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                A preset replaces the table below.
              </p>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="a-label" style={{ margin: 0 }}>
                  Size table
                </p>
                <div className="flex gap-2">
                  <Button size="sm" icon={Columns3} onClick={addColumn} disabled={draft.columns.length >= 12}>
                    Add column
                  </Button>
                  <Button size="sm" icon={Rows3} onClick={addRow} disabled={draft.rows.length >= 60}>
                    Add row
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto" style={{ border: '1px solid var(--a-border)', borderRadius: 'var(--ds-r-md)' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr style={{ background: mix('var(--ds-violet)', 0.08) }}>
                      {draft.columns.map((column, index) => (
                        <th key={index} className="p-1.5 align-top">
                          <div className="flex items-center gap-1">
                            <input
                              className="a-field font-semibold"
                              style={cellStyle}
                              value={column}
                              placeholder={index === 0 ? 'Size' : `Column ${index + 1}`}
                              onChange={(e) => setColumn(index, e.target.value)}
                              aria-label={`Column ${index + 1} heading`}
                            />
                            {draft.columns.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeColumn(index)}
                                aria-label={`Remove column ${index + 1}`}
                                className="shrink-0 w-7 h-7 inline-flex items-center justify-center cursor-pointer"
                                style={{ borderRadius: 999, color: 'var(--a-text-muted)' }}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </th>
                      ))}
                      <th style={{ width: 70 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {draft.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} style={{ borderTop: '1px solid var(--a-border)' }}>
                        {draft.columns.map((_, cellIndex) => (
                          <td key={cellIndex} className="p-1.5">
                            <input
                              className="a-field"
                              style={{ ...cellStyle, fontWeight: cellIndex === 0 ? 600 : 400 }}
                              value={row[cellIndex] || ''}
                              onChange={(e) => setCell(rowIndex, cellIndex, e.target.value)}
                              aria-label={`Row ${rowIndex + 1}, ${draft.columns[cellIndex] || `column ${cellIndex + 1}`}`}
                            />
                          </td>
                        ))}
                        <td className="p-1.5 whitespace-nowrap">
                          <IconButton icon={Copy} size="sm" tone="plain" label={`Duplicate row ${rowIndex + 1}`} onClick={() => duplicateRow(rowIndex)} />
                          <IconButton icon={Trash2} size="sm" tone="plain" label={`Remove row ${rowIndex + 1}`} onClick={() => removeRow(rowIndex)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Field label="Short description (optional)" hint="Shown above the table, e.g. “All measurements are in inches.”">
              <textarea className="a-field" rows={2} value={draft.description} maxLength={1000} onChange={(e) => patch({ description: e.target.value })} />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MediaPicker label="How-to-measure picture (optional)" value={draft.image} onChange={(url) => patch({ image: url })} />
              <Field label="Note under the table (optional)">
                <textarea className="a-field" rows={4} value={draft.note} maxLength={1000} onChange={(e) => patch({ note: e.target.value })} />
              </Field>
            </div>

            <div>
              <p className="a-label inline-flex items-center gap-1.5">
                <Eye className="w-4 h-4" /> Preview
              </p>
              <div className="overflow-x-auto" style={{ border: '1px solid var(--a-border)', borderRadius: 'var(--ds-r-md)' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--a-fs-base)' }}>
                  <thead>
                    <tr>
                      {draft.columns.map((column, index) => (
                        <th key={index} className="text-left px-3 py-2 whitespace-nowrap" style={{ background: mix('var(--primary)', 0.1) }}>
                          {column || '—'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {draft.rows
                      .filter((row) => row.some((cell) => cell.trim()))
                      .map((row, rowIndex) => (
                        <tr key={rowIndex} style={{ background: rowIndex % 2 ? 'var(--a-surface-2)' : 'var(--a-surface)' }}>
                          {draft.columns.map((_, cellIndex) => (
                            <td key={cellIndex} className="px-3 py-1.5 whitespace-nowrap" style={{ borderTop: '1px solid var(--a-border)', fontWeight: cellIndex === 0 ? 600 : 400 }}>
                              {row[cellIndex] || '–'}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {formError && (
              <p role="alert" className="font-semibold" style={{ color: 'var(--ds-danger-text)', fontSize: 'var(--a-fs-md)' }}>
                {formError}
              </p>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete size guide?"
        message={`“${deleting?.name}” will be removed${deleting?.productCount ? ` from ${deleting.productCount} product(s)` : ''}. The products themselves are not changed.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
        busy={busyDelete}
      />
    </div>
  );
};
