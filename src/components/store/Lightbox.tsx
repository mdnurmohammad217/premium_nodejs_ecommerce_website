import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, ExternalLink } from 'lucide-react';
import { sized } from '../../lib/img.ts';
import { useT } from '../../lib/i18n.tsx';

export interface LightboxPhoto {
  url: string;
  caption?: string;
}

interface LightboxProps {
  photos: LightboxPhoto[];
  /** Index of the photo to open, or null when closed */
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  /** Title over the photos (e.g. "Our facility") */
  title?: string;
  /** Show the row of small pictures under the big one */
  thumbnails?: boolean;
}

/**
 * v3.14 — full-screen photo viewer for the factory gallery and certificates.
 * Arrow keys / swipe move between photos, Esc or the backdrop closes it, the
 * page behind does not scroll, and focus returns to where it was.
 */
export const Lightbox: React.FC<LightboxProps> = ({ photos, index, onClose, onIndexChange, title, thumbnails = true }) => {
  const t = useT();
  const open = index !== null && photos.length > 0;
  const current = open ? Math.max(0, Math.min(photos.length - 1, index as number)) : 0;
  const many = photos.length > 1;
  const closeRef = useRef<HTMLButtonElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const go = useCallback(
    (delta: number) => {
      if (!many) return;
      onIndexChange((current + delta + photos.length) % photos.length);
    },
    [many, current, photos.length, onIndexChange]
  );

  useEffect(() => setLoaded(false), [current, open]);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      const rtl = document.documentElement.dir === 'rtl';
      if (event.key === 'ArrowRight') go(rtl ? -1 : 1);
      if (event.key === 'ArrowLeft') go(rtl ? 1 : -1);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open, go, onClose]);

  // Keep the current thumbnail in view
  useEffect(() => {
    if (!open || !thumbsRef.current) return;
    const node = thumbsRef.current.querySelector<HTMLElement>(`[data-thumb="${current}"]`);
    node?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [open, current]);

  if (!open || typeof document === 'undefined') return null;
  const photo = photos[current];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || t('Photos')}
      className="fixed inset-0 z-[1000] flex flex-col bg-[rgb(10,13,12)] text-white ds-fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* top bar */}
      <div className="shrink-0 flex items-center gap-(--ds-s-3) px-(--ds-s-4) h-14 sm:h-16">
        <div className="min-w-0 flex-1">
          {title && <p className="text-(length:--ds-fs-md) font-(--ds-fw-bold) truncate text-white">{title}</p>}
          {many && (
            <p className="text-(length:--ds-fs-xs) text-white/70 ds-num" aria-live="polite">
              {t('Photo {n} of {total}', { n: current + 1, total: photos.length })}
            </p>
          )}
        </div>
        <a
          href={photo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-10 px-(--ds-s-3) rounded-(--ds-r-full) bg-white/10 hover:bg-white/20 text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-white transition-colors"
        >
          <ExternalLink className="w-4 h-4" aria-hidden />
          <span className="hidden sm:inline">{t('Full size')}</span>
        </a>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t('Close')}
          className="w-11 h-11 rounded-(--ds-r-full) bg-white/10 hover:bg-white/20 inline-flex items-center justify-center cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* photo */}
      <div
        className="relative flex-1 min-h-0 flex items-center justify-center px-(--ds-s-2) sm:px-(--ds-s-16)"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        onTouchStart={(event) => {
          touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const dx = event.changedTouches[0].clientX - start.x;
          const dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            const rtl = document.documentElement.dir === 'rtl';
            go((dx < 0) !== rtl ? 1 : -1);
          }
        }}
      >
        {!loaded && <div className="absolute w-10 h-10 rounded-(--ds-r-full) border-2 border-white/25 border-t-white animate-spin" aria-hidden />}
        <img
          key={photo.url}
          src={sized(photo.url, 1600)}
          alt={photo.caption || title || ''}
          onLoad={() => setLoaded(true)}
          onError={(event) => {
            const img = event.currentTarget;
            if (img.src !== photo.url) img.src = photo.url;
            else setLoaded(true);
          }}
          className={`max-w-full max-h-full object-contain rounded-(--ds-r-md) shadow-2xl select-none transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          draggable={false}
        />
        {many && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={t('Previous photo')}
              className="absolute start-(--ds-s-2) sm:start-(--ds-s-4) top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-(--ds-r-full) bg-white/12 hover:bg-white/25 backdrop-blur inline-flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-6 h-6 rtl:rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={t('Next photo')}
              className="absolute end-(--ds-s-2) sm:end-(--ds-s-4) top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-(--ds-r-full) bg-white/12 hover:bg-white/25 backdrop-blur inline-flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronRight className="w-6 h-6 rtl:rotate-180" />
            </button>
          </>
        )}
      </div>

      {/* caption + thumbnails */}
      <div className="shrink-0 px-(--ds-s-4) pt-(--ds-s-3) pb-[calc(var(--ds-s-4)+env(safe-area-inset-bottom))] space-y-(--ds-s-3)">
        {photo.caption && <p className="text-center text-(length:--ds-fs-base) text-white/90 max-w-3xl mx-auto">{photo.caption}</p>}
        {thumbnails && many && (
          <div ref={thumbsRef} className="flex justify-start sm:justify-center gap-(--ds-s-2) overflow-x-auto ds-scroll-hide pb-1">
            {photos.map((item, i) => (
              <button
                key={`${item.url}-${i}`}
                type="button"
                data-thumb={i}
                onClick={() => onIndexChange(i)}
                aria-label={t('Photo {n} of {total}', { n: i + 1, total: photos.length })}
                aria-current={i === current}
                className={`shrink-0 w-16 h-12 sm:w-20 sm:h-14 rounded-(--ds-r-md) overflow-hidden cursor-pointer transition-[opacity,box-shadow] ${
                  i === current ? 'ring-2 ring-white opacity-100' : 'opacity-50 hover:opacity-90'
                }`}
              >
                <img src={sized(item.url, 160)} alt="" loading="lazy" className="w-full h-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
