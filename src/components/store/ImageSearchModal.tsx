import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X, ImagePlus, ShieldCheck, RefreshCw, SearchX, ScanSearch, Sparkles } from 'lucide-react';
import type { Product, SiteSettings } from '../../types/index.ts';
import { fingerprintImage, loadImage } from '../../lib/imageFingerprint.ts';
import { IMAGE_PLACEHOLDER } from '../../lib/placeholder.ts';

/**
 * v3.11 — search by photo.
 *
 * The photo is read on the shopper's own device: it is turned into a small
 * fingerprint (colours, layout, shape) and only that is sent to the shop.
 * The photo is never uploaded, and the search is not stored anywhere.
 */

type Match = Product & { match?: number };

interface Props {
  settings?: SiteSettings;
  onClose: () => void;
  onNavigate: (view: string, params?: any) => void;
}

export const ImageSearchModal: React.FC<Props> = ({ settings, onClose, onNavigate }) => {
  const cfg: any = (settings as any)?.search_config || {};
  const title = String(cfg.imageSearchTitle || '').trim() || 'Search by photo';
  const currency = settings?.general?.currency || '৳';
  const [preview, setPreview] = useState('');
  const [phase, setPhase] = useState<'pick' | 'reading' | 'done' | 'error'>('pick');
  const [results, setResults] = useState<Match[]>([]);
  const [exact, setExact] = useState(true);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef('');
  const panelRef = useRef<HTMLDivElement>(null);
  // The parent passes a new onClose on every render: keep the latest in a ref
  // so the window's set-up below runs once (re-running it revoked the preview)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Only the newest photo's answer is shown when two are picked quickly
  const requestRef = useRef(0);

  // Close on Escape; the page behind does not scroll; focus moves into the window
  useEffect(() => {
    const previous = document.body.style.overflow;
    const opener = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    const focus = window.setTimeout(() => panelRef.current?.focus(), 30);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(focus);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = '';
      opener?.focus?.();
    };
  }, []);

  const search = useCallback(async (file: Blob) => {
    if (!file || !/^image\//.test(file.type || 'image/')) {
      setError('Please choose a photo (JPG, PNG or WEBP).');
      setPhase('error');
      return;
    }
    const request = ++requestRef.current;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreview(url);
    setError('');
    setResults([]);
    setPhase('reading');
    const started = Date.now();
    try {
      const img = await loadImage(url);
      const fingerprint = fingerprintImage(img);
      const res = await fetch('/api/image-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Search by photo is not available right now.');
      // A short, steady "scanning" moment reads better than a flicker
      const wait = Math.max(0, 700 - (Date.now() - started));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      if (request !== requestRef.current) return;
      setResults(Array.isArray(data.results) ? data.results : []);
      setExact(data.exact !== false);
      setPhase('done');
    } catch (err: any) {
      if (request !== requestRef.current) return;
      setError(err?.message || 'The photo could not be read. Please try another one.');
      setPhase('error');
    }
  }, []);

  // Paste a photo (Ctrl + V / ⌘ + V)
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items || []).find((entry) => entry.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) {
        event.preventDefault();
        void search(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [search]);

  const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void search(file);
  };

  const reset = () => {
    setPhase('pick');
    setResults([]);
    setError('');
  };

  const priceOf = (p: Product) => (Number(p.salePrice) > 0 ? Number(p.salePrice) : Number(p.price) || 0);

  const inputs = (
    <>
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickFile} />
    </>
  );

  // Rendered at the end of <body>: the header it opens from is sticky and
  // blurred, which would otherwise trap a fixed window inside the header
  return createPortal(
    <div className="fixed inset-0 z-(--ds-z-modal) flex items-end sm:items-center justify-center sm:p-(--ds-s-4)" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-(--ds-overlay) backdrop-blur-[2px] ds-fade-in" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className="img-search-panel outline-none relative w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-(--ds-surface) rounded-t-(--ds-r-2xl) sm:rounded-(--ds-r-2xl) shadow-(--ds-shadow-xl) overflow-hidden">
        {inputs}

        {/* Header */}
        <div className="flex items-center gap-(--ds-s-3) px-(--ds-s-4) sm:px-(--ds-s-6) py-(--ds-s-4) border-b border-(--ds-border-soft) shrink-0">
          <span className="w-10 h-10 shrink-0 rounded-(--ds-r-lg) inline-flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-(--primary)">
            <ScanSearch className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text) truncate">{title}</h2>
            <p className="text-(length:--ds-fs-sm) text-(--ds-text-muted) truncate">Find products that look like your photo</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center text-(--ds-text-soft) hover:bg-(--ds-surface-3) cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-(--ds-s-4) sm:p-(--ds-s-6)">
          {phase === 'pick' && (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void search(file);
              }}
              className={`img-search-drop rounded-(--ds-r-xl) border-2 border-dashed px-(--ds-s-5) py-(--ds-s-10) sm:py-(--ds-s-12) text-center transition-colors ${
                dragging ? 'border-(--primary) bg-[color-mix(in_srgb,var(--primary)_7%,transparent)]' : 'border-(--ds-border-strong) bg-(--ds-surface-2)'
              }`}
            >
              <span className="img-search-orb mx-auto w-18 h-18 rounded-(--ds-r-full) inline-flex items-center justify-center text-(--primary-foreground) bg-(--primary)">
                <Camera className="w-8 h-8" />
              </span>
              <h3 className="mt-(--ds-s-4) text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">Take or upload a photo of the product</h3>
              <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-muted) max-w-md mx-auto">
                Drop a picture here, paste one, or use your camera. A clear photo of the pack works best.
              </p>
              <div className="mt-(--ds-s-5) flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-(--ds-s-2)">
                <button type="button" onClick={() => cameraRef.current?.click()} className="ds-btn ds-btn-primary ds-btn-lg sm:hidden">
                  <Camera className="w-4 h-4" /> Take a photo
                </button>
                <button type="button" onClick={() => galleryRef.current?.click()} className="ds-btn ds-btn-secondary ds-btn-lg sm:hidden">
                  <ImagePlus className="w-4 h-4" /> Choose from gallery
                </button>
                <button type="button" onClick={() => galleryRef.current?.click()} className="ds-btn ds-btn-primary ds-btn-lg hidden sm:inline-flex">
                  <ImagePlus className="w-4 h-4" /> Choose a photo
                </button>
              </div>
            </div>
          )}

          {phase === 'reading' && (
            <div className="flex flex-col items-center text-center py-(--ds-s-6)">
              <div className="img-search-scan relative w-56 h-56 sm:w-64 sm:h-64 rounded-(--ds-r-xl) overflow-hidden border border-(--ds-border) bg-(--ds-surface-2)">
                {preview && <img src={preview} alt="Your photo" className="w-full h-full object-contain" />}
                <span className="img-search-beam" aria-hidden />
                <span className="img-search-corners" aria-hidden />
              </div>
              <p className="mt-(--ds-s-5) inline-flex items-center gap-(--ds-s-2) text-(length:--ds-fs-md) font-(--ds-fw-semibold) text-(--ds-text)">
                <Sparkles className="w-4 h-4 text-(--primary)" /> Looking for similar products…
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center text-center py-(--ds-s-8)">
              <span className="w-14 h-14 rounded-(--ds-r-full) inline-flex items-center justify-center bg-(--ds-danger-soft) text-(--ds-danger)">
                <SearchX className="w-6 h-6" />
              </span>
              <p className="mt-(--ds-s-4) text-(length:--ds-fs-md) font-(--ds-fw-semibold) text-(--ds-text) max-w-sm">{error}</p>
              <button type="button" onClick={reset} className="ds-btn ds-btn-primary mt-(--ds-s-5)">
                <RefreshCw className="w-4 h-4" /> Try another photo
              </button>
            </div>
          )}

          {phase === 'done' && (
            <div>
              <div className="flex items-center gap-(--ds-s-3) mb-(--ds-s-4)">
                {preview && (
                  <img src={preview} alt="Your photo" className="w-14 h-14 rounded-(--ds-r-md) object-cover border border-(--ds-border) bg-(--ds-surface-2) shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text)">
                    {results.length === 0
                      ? 'No matching products found'
                      : exact
                      ? `${results.length} matching product${results.length === 1 ? '' : 's'}`
                      : 'No exact match — the closest products'}
                  </p>
                  <p className="text-(length:--ds-fs-sm) text-(--ds-text-muted)">Sorted by how closely they look like your photo</p>
                </div>
                <button type="button" onClick={reset} className="ds-btn ds-btn-secondary ds-btn-sm shrink-0">
                  <RefreshCw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">New photo</span>
                </button>
              </div>

              {results.length === 0 ? (
                <div className="text-center py-(--ds-s-8) rounded-(--ds-r-xl) bg-(--ds-surface-2)">
                  <SearchX className="w-8 h-8 mx-auto text-(--ds-text-faint)" />
                  <p className="mt-(--ds-s-3) text-(length:--ds-fs-base) text-(--ds-text-muted) max-w-sm mx-auto">
                    Try a closer, well-lit photo of the product on a plain background — or search by name.
                  </p>
                </div>
              ) : (
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-(--ds-s-3)">
                  {results.map((product, index) => (
                    <li key={product.id} className="ds-fade-in" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
                      <button
                        type="button"
                        onClick={() => onNavigate('product', { slug: product.slug, id: product.id, product })}
                        className="group w-full text-left rounded-(--ds-r-lg) border border-(--ds-border) bg-(--ds-surface) overflow-hidden hover:border-(--primary) hover:shadow-(--ds-shadow-md) transition-[border-color,box-shadow] cursor-pointer"
                      >
                        <span className="relative block aspect-square bg-(--ds-surface-2)">
                          <img
                            src={product.image || IMAGE_PLACEHOLDER}
                            alt={product.name}
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.src = IMAGE_PLACEHOLDER;
                            }}
                            className="w-full h-full object-contain p-(--ds-s-2) transition-transform duration-300 group-hover:scale-105"
                          />
                          {typeof product.match === 'number' && (
                            <span
                              className={`absolute left-2 top-2 h-6 px-2 rounded-(--ds-r-full) inline-flex items-center text-(length:--ds-fs-2xs) font-(--ds-fw-bold) ds-num ${
                                product.match >= 80
                                  ? 'bg-(--ds-success) text-white'
                                  : product.match >= 65
                                  ? 'bg-(--primary) text-(--primary-foreground)'
                                  : 'bg-(--ds-surface) text-(--ds-text-soft) border border-(--ds-border)'
                              }`}
                            >
                              {product.match}% match
                            </span>
                          )}
                        </span>
                        <span className="block p-(--ds-s-3)">
                          <span className="block text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text) ds-clamp-2 leading-(--ds-lh-snug) min-h-[2.5em]">
                            {product.name}
                          </span>
                          <span className="mt-1 block text-(length:--ds-fs-base) font-(--ds-fw-bold) text-(--primary) ds-num">
                            {currency}
                            {priceOf(product).toLocaleString('en-US')}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <p className="shrink-0 flex items-center justify-center gap-(--ds-s-2) px-(--ds-s-4) py-(--ds-s-3) border-t border-(--ds-border-soft) bg-(--ds-surface-2) text-(length:--ds-fs-xs) text-(--ds-text-muted) text-center pb-[calc(var(--ds-s-3)+env(safe-area-inset-bottom))]">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-(--ds-success)" />
          <span>Your photo stays on your device — it is never uploaded or saved.</span>
        </p>
      </div>
    </div>,
    document.body
  );
};
