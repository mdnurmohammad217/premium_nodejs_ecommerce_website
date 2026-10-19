import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Download,
  FileJson,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Image as ImageIcon,
  FolderTree,
  Layers,
  RefreshCcw,
} from 'lucide-react';
import { Modal, Button, Toggle, Field, mix } from './ui.tsx';

/**
 * v3.9 — Products → Import / Export.
 * Export: JSON (everything, for another shop of ours) or CSV (Excel).
 * Import: our JSON / CSV, WooCommerce CSV or Shopify CSV. A preview comes
 * first, then the import runs in the background with a progress bar.
 */

type Mode = 'export' | 'import';

interface Preview {
  token: string;
  source: 'json' | 'csv' | 'woocommerce' | 'shopify';
  count: number;
  existing: number;
  pictures: number;
  variations: number;
  categories: string[];
  categoryCount: number;
  sample: Array<{ name: string; sku: string; price: number; salePrice: number | null; stock: number; category: string; image: string; variations: number }>;
}

interface Job {
  id: string;
  status: 'running' | 'done' | 'failed';
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  categoriesCreated: number;
  brandsCreated: number;
  imagesDownloaded: number;
  imagesFailed: number;
  current: string;
  errors: Array<{ name: string; error: string }>;
}

const SOURCE_LABEL: Record<Preview['source'], string> = {
  json: 'Product export (JSON) from a shop like this one',
  csv: 'Product CSV (this shop’s format)',
  woocommerce: 'WooCommerce product CSV',
  shopify: 'Shopify product CSV',
};

const download = async (url: string, fallbackName: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Could not export.');
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] || fallbackName;
  const blob = await res.blob();
  const link = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = link;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(link), 2000);
};

const Stat: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({ label, value, color = 'var(--primary)' }) => (
  <div className="p-3" style={{ borderRadius: 'var(--ds-r-md)', background: mix(color, 0.07), border: `1px solid ${mix(color, 0.18)}` }}>
    <div className="font-extrabold ds-num" style={{ fontSize: 'var(--a-fs-xl)', color }}>
      {value}
    </div>
    <div style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>{label}</div>
  </div>
);

export const ProductTransferModal: React.FC<{
  open: boolean;
  initialMode?: Mode;
  selectedIds: number[];
  onClose: () => void;
  onImported: () => void;
}> = ({ open, initialMode = 'export', selectedIds, onClose, onImported }) => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [scope, setScope] = useState<'all' | 'active' | 'selected'>('all');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [options, setOptions] = useState({
    mode: 'update' as 'update' | 'skip' | 'new',
    downloadImages: true,
    createCategories: true,
    importStock: true,
    status: 'keep' as 'keep' | 'active' | 'draft',
  });
  const [job, setJob] = useState<Job | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const poll = useRef<number | null>(null);

  const startPolling = (jobId: string) => {
    if (poll.current) window.clearInterval(poll.current);
    poll.current = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/products/import/${jobId}`);
        if (r.status === 404) {
          // The server restarted: the products saved so far stay, the rest were not imported
          if (poll.current) window.clearInterval(poll.current);
          poll.current = null;
          setJob((current) => (current ? { ...current, status: 'failed' } : current));
          setError('The import stopped because the server restarted. Products already imported are saved — import the same file again to finish (they are updated, not copied).');
          onImported();
          return;
        }
        const next = await r.json();
        if (!r.ok) return;
        setJob(next);
        if (next.status !== 'running') {
          if (poll.current) window.clearInterval(poll.current);
          poll.current = null;
          onImported();
        }
      } catch {
        /* keep polling */
      }
    }, 1200);
  };

  // Opening the window again shows an import that is still running
  useEffect(() => {
    if (!open || job) return;
    let cancelled = false;
    fetch('/api/admin/products/import-latest')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.job || data.job.status !== 'running') return;
        setMode('import');
        setJob(data.job);
        startPolling(data.job.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError('');
    if (!job || job.status !== 'running') {
      setPreview(null);
      setJob(null);
      setFileName('');
    }
    setScope(selectedIds.length ? 'selected' : 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode]);

  useEffect(
    () => () => {
      if (poll.current) window.clearInterval(poll.current);
    },
    []
  );

  const exportAs = async (format: 'json' | 'csv') => {
    setBusy(format);
    setError('');
    try {
      const params = new URLSearchParams({ format });
      if (scope === 'active') params.set('status', 'active');
      if (scope === 'selected' && selectedIds.length) params.set('ids', selectedIds.join(','));
      await download(`/api/admin/products/export?${params}`, `products.${format}`);
    } catch (e: any) {
      setError(e.message || 'Could not export.');
    } finally {
      setBusy('');
    }
  };

  const pickFile = async (file?: File | null) => {
    if (!file) return;
    setError('');
    setPreview(null);
    setJob(null);
    setFileName(file.name);
    if (file.size > 38 * 1024 * 1024) {
      setError('This file is larger than 38 MB. Export fewer products at a time.');
      return;
    }
    setBusy('preview');
    try {
      const text = await file.text();
      const res = await fetch('/api/admin/products/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not read the file.');
      setPreview(data);
    } catch (e: any) {
      setError(e.message || 'Could not read the file.');
    } finally {
      setBusy('');
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const startImport = async () => {
    if (!preview) return;
    setBusy('import');
    setError('');
    try {
      const res = await fetch('/api/admin/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: preview.token, options }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start the import.');
      setJob({ id: data.jobId, status: 'running', total: data.total, processed: 0, created: 0, updated: 0, skipped: 0, failed: 0, categoriesCreated: 0, brandsCreated: 0, imagesDownloaded: 0, imagesFailed: 0, current: '', errors: [] });
      startPolling(data.jobId);
    } catch (e: any) {
      setError(e.message || 'Could not start the import.');
    } finally {
      setBusy('');
    }
  };

  const tab = (id: Mode, label: string, Icon: typeof Upload) => (
    <button
      type="button"
      onClick={() => (job?.status === 'running' ? null : setMode(id))}
      className="flex-1 inline-flex items-center justify-center gap-2 font-bold cursor-pointer"
      style={{
        height: 42,
        borderRadius: 'var(--ds-r-md)',
        background: mode === id ? 'var(--a-surface)' : 'transparent',
        boxShadow: mode === id ? 'var(--ds-shadow-sm)' : 'none',
        color: mode === id ? 'var(--primary)' : 'var(--a-text-muted)',
      }}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  const percent = job ? Math.round((job.processed / Math.max(1, job.total)) * 100) : 0;

  return (
    <Modal
      open={open}
      onClose={() => (job?.status === 'running' ? onClose() : onClose())}
      title="Import / Export products"
      subtitle="Move products between shops with their price, category, brand, pictures and variations"
      width="max-w-3xl"
    >
      <div className="flex gap-1 p-1 mb-5" style={{ borderRadius: 'var(--ds-r-lg)', background: 'var(--a-surface-2)' }}>
        {tab('export', 'Export', Download)}
        {tab('import', 'Import', Upload)}
      </div>

      {mode === 'export' && (
        <div className="space-y-5">
          <Field label="Which products">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  ['all', 'All products', 'Everything except deleted'],
                  ['active', 'Published only', 'Products visible on the website'],
                  ['selected', `Selected (${selectedIds.length})`, 'Tick products in the list first'],
                ] as const
              ).map(([value, label, text]) => (
                <button
                  key={value}
                  type="button"
                  disabled={value === 'selected' && !selectedIds.length}
                  onClick={() => setScope(value)}
                  className="text-left p-3 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  style={{
                    borderRadius: 'var(--ds-r-md)',
                    border: `1.5px solid ${scope === value ? 'var(--primary)' : 'var(--a-border)'}`,
                    background: scope === value ? mix('var(--primary)', 0.06) : 'var(--a-surface)',
                  }}
                >
                  <span className="block font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                    {label}
                  </span>
                  <span className="block" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                    {text}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 flex flex-col" style={{ borderRadius: 'var(--ds-r-lg)', border: '1px solid var(--a-border)' }}>
              <div className="flex items-center gap-2 font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                <FileJson className="w-5 h-5" style={{ color: 'var(--ds-indigo, #4f46e5)' }} /> JSON — full copy
                <span className="ml-auto px-2 py-0.5 font-bold" style={{ fontSize: 10, borderRadius: 999, background: mix('var(--ds-success, #16a34a)', 0.12), color: 'var(--ds-success, #16a34a)' }}>
                  RECOMMENDED
                </span>
              </div>
              <p className="mt-1.5 flex-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                Everything: prices, stock, category tree, brand, all pictures, variations, attributes, highlights and "How to use". Import it on another shop running this software.
              </p>
              <Button className="mt-3" variant="primary" icon={Download} loading={busy === 'json'} onClick={() => exportAs('json')}>
                Download JSON
              </Button>
            </div>
            <div className="p-4 flex flex-col" style={{ borderRadius: 'var(--ds-r-lg)', border: '1px solid var(--a-border)' }}>
              <div className="flex items-center gap-2 font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                <FileSpreadsheet className="w-5 h-5" style={{ color: 'var(--ds-success, #16a34a)' }} /> CSV — for Excel
              </div>
              <p className="mt-1.5 flex-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                One row per product. Edit prices or stock in Excel / Google Sheets and import it back, or use it as a template to add many products at once.
              </p>
              <Button className="mt-3" icon={Download} loading={busy === 'csv'} onClick={() => exportAs('csv')}>
                Download CSV
              </Button>
            </div>
          </div>
          <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
            Pictures are saved as full web links (https://…), so the shop that imports the file downloads them from this website. Keep this website online until the import there is finished.
          </p>
        </div>
      )}

      {mode === 'import' && !job && (
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void pickFile(event.dataTransfer.files?.[0]);
            }}
            className="w-full flex flex-col items-center justify-center text-center p-6 cursor-pointer"
            style={{ borderRadius: 'var(--ds-r-lg)', border: '2px dashed var(--a-border-strong)', background: 'var(--a-surface-2)' }}
          >
            {busy === 'preview' ? <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--primary-ink, var(--primary))' }} /> : <Upload className="w-8 h-8" style={{ color: 'var(--primary-ink, var(--primary))' }} />}
            <span className="mt-2 font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
              {fileName || 'Choose a file or drop it here'}
            </span>
            <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>JSON or CSV from another shop · WooCommerce CSV · Shopify CSV</span>
          </button>
          <input ref={fileInput} type="file" accept=".json,.csv,application/json,text/csv" className="hidden" onChange={(event) => void pickFile(event.target.files?.[0])} />

          {preview && (
            <>
              <div className="flex items-center gap-2 font-semibold" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-success, #16a34a)' }}>
                <CheckCircle2 className="w-4 h-4" /> {SOURCE_LABEL[preview.source]}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Products in file" value={preview.count} />
                <Stat label="Already in this shop" value={preview.existing} color="var(--ds-amber, #d97706)" />
                <Stat label="Pictures" value={preview.pictures} color="var(--ds-teal, #0d9488)" />
                <Stat label="Categories" value={preview.categoryCount} color="var(--ds-indigo, #4f46e5)" />
              </div>

              <div className="overflow-auto" style={{ maxHeight: 220, borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)' }}>
                <table className="w-full" style={{ fontSize: 'var(--a-fs-sm)' }}>
                  <thead style={{ background: 'var(--a-surface-2)', position: 'sticky', top: 0 }}>
                    <tr className="text-left">
                      <th className="p-2">Product</th>
                      <th className="p-2">Category</th>
                      <th className="p-2 text-right">Price</th>
                      <th className="p-2 text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((row, index) => (
                      <tr key={index} style={{ borderTop: '1px solid var(--a-border-soft)' }}>
                        <td className="p-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {row.image ? (
                              <img src={row.image} alt="" className="w-8 h-8 object-cover shrink-0" style={{ borderRadius: 6, background: 'var(--a-surface-2)' }} loading="lazy" referrerPolicy="no-referrer" />
                            ) : (
                              <span className="w-8 h-8 shrink-0" style={{ borderRadius: 6, background: 'var(--a-surface-3)' }} />
                            )}
                            <span className="min-w-0">
                              <span className="block font-semibold truncate" style={{ maxWidth: 260 }}>
                                {row.name}
                              </span>
                              <span style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                                {row.sku || 'new SKU'}
                                {row.variations ? ` · ${row.variations} variations` : ''}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="p-2" style={{ color: 'var(--a-text-muted)' }}>
                          {row.category || '—'}
                        </td>
                        <td className="p-2 text-right ds-num">
                          ৳{Number(row.salePrice || row.price || 0).toLocaleString()}
                          {row.salePrice ? (
                            <span className="block line-through" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                              ৳{Number(row.price).toLocaleString()}
                            </span>
                          ) : null}
                        </td>
                        <td className="p-2 text-right ds-num">{row.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.count > preview.sample.length && (
                <p style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                  Showing the first {preview.sample.length} of {preview.count} products.
                </p>
              )}

              <Field label="When a product already exists (same SKU or link)">
                <select className="a-field" value={options.mode} onChange={(event) => setOptions((o) => ({ ...o, mode: event.target.value as any }))}>
                  <option value="update">Update it with the file (price, stock, pictures …)</option>
                  <option value="skip">Leave it as it is — only add new products</option>
                  <option value="new">Add everything as new products (copies)</option>
                </select>
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Toggle
                  checked={options.downloadImages}
                  onChange={(value) => setOptions((o) => ({ ...o, downloadImages: value }))}
                  label="Download pictures into this shop"
                  description="Recommended. Off = pictures keep loading from the other website."
                />
                <Toggle
                  checked={options.createCategories}
                  onChange={(value) => setOptions((o) => ({ ...o, createCategories: value }))}
                  label="Create missing categories & brands"
                  description="Matched by name; new ones keep their parent category."
                />
                <Toggle
                  checked={options.importStock}
                  onChange={(value) => setOptions((o) => ({ ...o, importStock: value }))}
                  label="Import stock quantities"
                  description="Off = new products start at 0 and existing stock is not changed."
                />
                <Field label="Publish status">
                  <select className="a-field" value={options.status} onChange={(event) => setOptions((o) => ({ ...o, status: event.target.value as any }))}>
                    <option value="keep">As in the file</option>
                    <option value="active">Publish all (active)</option>
                    <option value="draft">Save all as Draft (hidden) to check first</option>
                  </select>
                </Field>
              </div>
              <div className="flex justify-end">
                <Button variant="primary" icon={Upload} loading={busy === 'import'} onClick={startImport}>
                  Import {preview.count} product{preview.count === 1 ? '' : 's'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {mode === 'import' && job && (
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between font-bold mb-2" style={{ fontSize: 'var(--a-fs-md)' }}>
              <span className="inline-flex items-center gap-2">
                {job.status === 'running' ? (
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--primary-ink, var(--primary))' }} />
                ) : job.status === 'done' ? (
                  <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ds-success, #16a34a)' }} />
                ) : (
                  <AlertTriangle className="w-4 h-4" style={{ color: 'var(--ds-danger, #dc2626)' }} />
                )}
                {job.status === 'running' ? 'Importing…' : job.status === 'done' ? 'Import finished' : 'Import stopped'}
              </span>
              <span className="ds-num">
                {job.processed} / {job.total}
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: 'var(--a-surface-3)', overflow: 'hidden' }}>
              <div style={{ width: `${percent}%`, height: '100%', background: 'var(--primary)', transition: 'width .4s ease' }} />
            </div>
            {job.status === 'running' && job.current && (
              <p className="mt-1.5 truncate" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                {job.current}
              </p>
            )}
            {job.status === 'running' && (
              <p className="mt-1" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                You can close this window — the import keeps running on the server.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="New products" value={job.created} color="var(--ds-success, #16a34a)" />
            <Stat label="Updated" value={job.updated} />
            <Stat label="Skipped" value={job.skipped} color="var(--ds-amber, #d97706)" />
            <Stat label="Failed" value={job.failed} color="var(--ds-danger, #dc2626)" />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
            <span className="inline-flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4" /> {job.imagesDownloaded} pictures downloaded{job.imagesFailed ? `, ${job.imagesFailed} could not be downloaded` : ''}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FolderTree className="w-4 h-4" /> {job.categoriesCreated} new categories
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> {job.brandsCreated} new brands
            </span>
          </div>
          {job.errors.length > 0 && (
            <div className="p-3 overflow-auto" style={{ maxHeight: 160, borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-danger, #dc2626)', 0.06), fontSize: 'var(--a-fs-sm)' }}>
              {job.errors.map((item, index) => (
                <div key={index}>
                  <b>{item.name}</b>: {item.error}
                </div>
              ))}
            </div>
          )}
          {job.status !== 'running' && (
            <div className="flex justify-end gap-2">
              <Button
                icon={RefreshCcw}
                onClick={() => {
                  setJob(null);
                  setPreview(null);
                  setFileName('');
                }}
              >
                Import another file
              </Button>
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="ds-error-text mt-4 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4" /> {error}
        </p>
      )}
    </Modal>
  );
};
