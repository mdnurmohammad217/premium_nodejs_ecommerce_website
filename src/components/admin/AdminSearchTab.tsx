import React, { useEffect, useRef, useState } from 'react';
import {
  Save,
  Search,
  Type as TypeIcon,
  Camera,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  ShieldCheck,
  ImageOff,
  CheckCircle2,
  Square,
  LayoutGrid,
} from 'lucide-react';
import { Card, CardHeader, Button, Field, Toggle, IconButton, useToasts, ConfirmDialog } from './ui.tsx';
import type { SiteSettings } from '../../types/index.ts';
import { buildImageIndex, fetchIndexStatus, type IndexProgress, type IndexStatus } from '../../lib/imageIndexer.ts';
import { TypingPlaceholder } from '../store/TypingPlaceholder.tsx';

/** Dashboard → Website → Search Box (settings key `search_config`) */
export interface SearchConfig {
  placeholder?: string;
  typingEnabled?: boolean;
  typingPhrases?: string[];
  typingSpeed?: 'slow' | 'normal' | 'fast';
  imageSearchEnabled?: boolean;
  imageSearchTitle?: string;
  imageSearchMinScore?: number;
}

const STRICTNESS: Array<{ value: number; label: string; text: string }> = [
  { value: 0.55, label: 'Relaxed', text: 'More results, some only loosely similar' },
  { value: 0.62, label: 'Balanced', text: 'Recommended' },
  { value: 0.7, label: 'Strict', text: 'Only very close matches' },
];

export const AdminSearchTab: React.FC<{ settings: SiteSettings; onSaveSettings: (next: SiteSettings) => Promise<void> }> = ({
  settings,
  onSaveSettings,
}) => {
  const toasts = useToasts();
  const [cfg, setCfg] = useState<SearchConfig>(() => ({ ...((settings as any).search_config || {}) }));
  const [pageSize, setPageSize] = useState<number>(() => Number((settings as any).shop_config?.pageSize) || 20);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const stopRef = useRef(false);

  const phrases = cfg.typingPhrases || [];
  const patch = (changes: Partial<SearchConfig>) => setCfg((prev) => ({ ...prev, ...changes }));

  const loadStatus = () => {
    setStatusError('');
    fetchIndexStatus()
      .then(setStatus)
      .catch((err) => setStatusError(err.message || 'Could not read the photo index.'));
  };
  useEffect(loadStatus, []);

  const save = async () => {
    setSaving(true);
    try {
      const clean: SearchConfig = {
        ...cfg,
        placeholder: (cfg.placeholder || '').trim().slice(0, 80),
        typingPhrases: phrases.map((p) => p.trim()).filter(Boolean).slice(0, 12),
      };
      await onSaveSettings({
        ...settings,
        search_config: clean,
        shop_config: { ...((settings as any).shop_config || {}), pageSize: Math.min(60, Math.max(4, Math.round(pageSize) || 20)) },
      } as SiteSettings);
      toasts.push('Search box settings saved.');
    } catch {
      toasts.push('Could not save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addPhrase = () => {
    const text = draft.trim();
    if (!text) return;
    patch({ typingPhrases: [...phrases, text].slice(0, 12) });
    setDraft('');
  };

  const move = (index: number, step: -1 | 1) => {
    const target = index + step;
    if (target < 0 || target >= phrases.length) return;
    const next = phrases.slice();
    [next[index], next[target]] = [next[target], next[index]];
    patch({ typingPhrases: next });
  };

  const runIndex = async (all = false) => {
    if (!status || progress) return;
    stopRef.current = false;
    // The buttons give way to "Stop" at once, so a second click cannot start a second run
    setProgress({ done: 0, total: status.pending.length, failed: 0 });
    let list = status.pending;
    try {
      if (all) {
        // Re-make every fingerprint: clear first, then everything is "pending"
        const res = await fetch('/api/admin/image-index', { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Could not clear the photo index.');
        }
        const fresh = await fetchIndexStatus();
        list = fresh.pending;
      }
      if (list.length === 0) {
        toasts.push('Every product picture is already in the index.', 'info');
        return;
      }
      setProgress({ done: 0, total: list.length, failed: 0 });
      const result = await buildImageIndex(list, setProgress, () => stopRef.current);
      toasts.push(
        result.failed > 0
          ? `Index updated — ${result.done - result.failed} pictures added, ${result.failed} could not be read.`
          : `Index updated — ${result.done} pictures added.`,
        result.failed > 0 ? 'warning' : 'success'
      );
    } catch (err: any) {
      toasts.push(err?.message || 'Could not update the index.', 'error');
    } finally {
      setProgress(null);
      loadStatus();
    }
  };

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const indexedPercent = status && status.total > 0 ? Math.round((status.indexed / status.total) * 100) : 0;

  return (
    <div className="space-y-5">
      {toasts.node}

      <Card>
        <CardHeader
          title="Search box"
          subtitle="The text inside the search box at the top of the website, with an optional typing animation."
          icon={Search}
          actions={
            <Button variant="primary" icon={Save} onClick={save} loading={saving}>
              Save changes
            </Button>
          }
        />
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-5">
          <div className="space-y-4 min-w-0">
            <Field label="Placeholder text" hint="Shown in the empty search box (and to screen readers).">
              <input
                className="a-field"
                value={cfg.placeholder ?? ''}
                onChange={(e) => patch({ placeholder: e.target.value })}
                placeholder="Search products....."
                maxLength={80}
              />
            </Field>
            <Toggle
              checked={cfg.typingEnabled !== false}
              onChange={(value) => patch({ typingEnabled: value })}
              label="Animated typing text"
              description="The box types out the words below one after another, then rubs them out — a hint of what can be searched."
            />
            {cfg.typingEnabled !== false && (
              <>
                <div>
                  <span className="a-label">Words to type (in this order)</span>
                  {phrases.length === 0 ? (
                    <p className="mb-2" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                      No words yet — the placeholder text above is typed out instead.
                    </p>
                  ) : (
                    <ul className="space-y-2 mb-3">
                      {phrases.map((phrase, index) => (
                        <li
                          key={`${phrase}-${index}`}
                          className="flex items-center gap-2"
                          style={{
                            padding: 'var(--ds-s-2) var(--ds-s-2) var(--ds-s-2) var(--ds-s-3)',
                            borderRadius: 'var(--ds-r-md)',
                            background: 'var(--a-surface-2)',
                            border: '1px solid var(--a-border)',
                          }}
                        >
                          <TypeIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--a-text-faint)' }} />
                          <input
                            className="a-field flex-1 min-w-0"
                            value={phrase}
                            onChange={(e) => {
                              const next = phrases.slice();
                              next[index] = e.target.value;
                              patch({ typingPhrases: next });
                            }}
                            aria-label={`Typing text ${index + 1}`}
                            maxLength={60}
                          />
                          <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={index === 0} onClick={() => move(index, -1)} />
                          <IconButton
                            icon={ArrowDown}
                            size="sm"
                            label="Move down"
                            disabled={index === phrases.length - 1}
                            onClick={() => move(index, 1)}
                          />
                          <IconButton
                            icon={Trash2}
                            size="sm"
                            tone="danger"
                            label="Remove"
                            onClick={() => patch({ typingPhrases: phrases.filter((_, i) => i !== index) })}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <input
                      className="a-field flex-1 min-w-0"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addPhrase();
                        }
                      }}
                      placeholder="e.g. Napa Extra, Vitamin C, Baby lotion"
                      maxLength={60}
                    />
                    <Button icon={Plus} onClick={addPhrase} disabled={!draft.trim() || phrases.length >= 12}>
                      Add
                    </Button>
                  </div>
                </div>
                <Field label="Typing speed">
                  <select className="a-field" value={cfg.typingSpeed || 'normal'} onChange={(e) => patch({ typingSpeed: e.target.value as any })}>
                    <option value="slow">Slow</option>
                    <option value="normal">Normal</option>
                    <option value="fast">Fast</option>
                  </select>
                </Field>
              </>
            )}
          </div>

          <div className="min-w-0">
            <span className="a-label">Preview</span>
            <div
              style={{ padding: 'var(--ds-s-5)', borderRadius: 'var(--ds-r-lg)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border)' }}
            >
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ds-text-faint)' }} />
                <div
                  className="w-full flex items-center pl-9 pr-24"
                  style={{
                    height: 46,
                    borderRadius: 999,
                    border: '1px solid var(--ds-border-strong)',
                    background: 'var(--ds-surface)',
                    fontSize: 'var(--ds-fs-md)',
                  }}
                >
                  <TypingPlaceholder
                    phrases={cfg.typingEnabled !== false ? (phrases.filter(Boolean).length ? phrases.filter(Boolean) : [cfg.placeholder || 'Search products.....']) : []}
                    fallback={cfg.placeholder || 'Search products.....'}
                    speed={cfg.typingSpeed || 'normal'}
                  />
                </div>
                {cfg.imageSearchEnabled && (
                  <span
                    className="absolute top-1/2 -translate-y-1/2 inline-flex items-center justify-center"
                    style={{ right: 84, width: 32, height: 32, borderRadius: 999, color: 'var(--primary-ink, var(--primary))', background: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}
                  >
                    <Camera className="w-4 h-4" />
                  </span>
                )}
                <span
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center px-3 font-semibold"
                  style={{ height: 34, borderRadius: 999, background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: 'var(--a-fs-sm)' }}
                >
                  Search
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Search by photo"
          subtitle="Shoppers take or upload a photo and see the products that look like it — a camera button appears in the search box."
          icon={Camera}
        />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="space-y-4 min-w-0">
            <Toggle
              checked={Boolean(cfg.imageSearchEnabled)}
              onChange={(value) => patch({ imageSearchEnabled: value })}
              label={cfg.imageSearchEnabled ? 'Search by photo: ON' : 'Search by photo: OFF'}
              description="Turn it off at any time — the camera button disappears from the website."
            />
            <Field label="Title of the photo search window">
              <input
                className="a-field"
                value={cfg.imageSearchTitle ?? ''}
                onChange={(e) => patch({ imageSearchTitle: e.target.value })}
                placeholder="Search by photo"
                maxLength={60}
              />
            </Field>
            <Field label="How close a match must be">
              <div className="grid grid-cols-3 gap-2">
                {STRICTNESS.map((item) => {
                  const active = Math.abs((cfg.imageSearchMinScore ?? 0.62) - item.value) < 0.001;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => patch({ imageSearchMinScore: item.value })}
                      className="text-left cursor-pointer"
                      style={{
                        padding: 'var(--ds-s-2) var(--ds-s-3)',
                        borderRadius: 'var(--ds-r-md)',
                        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--a-border)'}`,
                        background: active ? 'color-mix(in srgb, var(--primary) 7%, var(--a-surface))' : 'var(--a-surface)',
                      }}
                    >
                      <span className="block font-semibold" style={{ fontSize: 'var(--a-fs-sm)' }}>
                        {item.label}
                      </span>
                      <span className="block" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                        {item.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>
            <p
              className="flex items-start gap-2"
              style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-success-text)', background: 'var(--ds-success-soft)', padding: 'var(--ds-s-3)', borderRadius: 'var(--ds-r-md)' }}
            >
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Shoppers' photos are never uploaded or saved. The phone or computer turns the photo into a small set of numbers
                (colours and shape), only those numbers are compared, and nothing about the search is kept.
              </span>
            </p>
          </div>

          <div className="space-y-4 min-w-0">
            <div
              style={{ padding: 'var(--ds-s-4)', borderRadius: 'var(--ds-r-lg)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border)' }}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                  Product picture index
                </span>
                <IconButton icon={RefreshCw} size="sm" label="Refresh" onClick={loadStatus} disabled={Boolean(progress)} />
              </div>
              {statusError ? (
                <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-danger-text)' }}>{statusError}</p>
              ) : !status ? (
                <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Loading…</p>
              ) : (
                <>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="font-bold ds-num" style={{ fontSize: 'var(--ds-fs-2xl)' }}>
                      {status.indexed}
                    </span>
                    <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                      of <span className="ds-num">{status.total}</span> product pictures are searchable
                    </span>
                  </div>
                  <span className="block h-2 rounded-full overflow-hidden mb-3" style={{ background: 'var(--a-border)' }}>
                    <span
                      className="block h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${progress ? percent : indexedPercent}%`, background: progress ? 'var(--ds-info)' : 'var(--primary)' }}
                    />
                  </span>
                  {progress ? (
                    <p className="mb-3 truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
                      Reading pictures… <span className="ds-num">{progress.done}</span> / <span className="ds-num">{progress.total}</span>
                      {progress.current ? ` — ${progress.current}` : ''}
                    </p>
                  ) : (
                    <ul className="mb-3 space-y-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ds-success)' }} />
                        {status.pending.length === 0
                          ? 'Up to date'
                          : `${status.pending.length} new or changed picture${status.pending.length === 1 ? '' : 's'} waiting`}
                      </li>
                      {status.noImage > 0 && (
                        <li className="flex items-center gap-2">
                          <ImageOff className="w-3.5 h-3.5" /> {status.noImage} product{status.noImage === 1 ? '' : 's'} without a picture
                        </li>
                      )}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {progress ? (
                      <Button icon={Square} onClick={() => (stopRef.current = true)}>
                        Stop
                      </Button>
                    ) : (
                      <>
                        <Button variant="primary" icon={RefreshCw} onClick={() => runIndex(false)} disabled={status.pending.length === 0}>
                          Update index
                        </Button>
                        <Button icon={LayoutGrid} onClick={() => setConfirmClear(true)} disabled={status.total === 0}>
                          Rebuild all
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)', lineHeight: 'var(--ds-lh-normal)' }}>
              New and changed product pictures are added when you save a product. Press <strong>Update index</strong> once after
              turning this on, or after importing many products. Keep this page open until it finishes.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Shop page" subtitle="How many products the All Products page shows before the page numbers (1, 2, 3 …)." icon={LayoutGrid} />
        <div className="max-w-xs">
          <Field label="Products per page">
            <select className="a-field" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[12, 16, 20, 24, 28, 32, 40, 48].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmClear}
        title="Rebuild the whole photo index?"
        message="Every product picture is read again. With many products this takes a few minutes — keep this page open until it finishes. Search by photo keeps working meanwhile for the pictures already done."
        confirmLabel="Rebuild"
        tone="primary"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          void runIndex(true);
        }}
      />
    </div>
  );
};
