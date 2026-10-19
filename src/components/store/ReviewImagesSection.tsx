import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { responsiveImg, sized } from '../../lib/img.ts';
import { ChevronDown, ChevronLeft, ChevronRight, Expand, MessageSquareQuote, X } from 'lucide-react';
import { ReviewImagesConfig } from '../../types/index.ts';
import { blogLang, safeImageSrc } from '../../lib/blogFormat.tsx';
import { RailArrows, useRail } from './ProductRail.tsx';

type ReviewImage = { id: string; url: string; caption?: string };

/** Desktop shows this many at first; the rest are one click away */
const DESKTOP_INITIAL = 10;

/* -------------------------------------------------------------------------- */
/* Lightbox                                                                    */
/* -------------------------------------------------------------------------- */

const Lightbox: React.FC<{
  images: ReviewImage[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  title: string;
}> = ({ images, index, onIndex, onClose, title }) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const count = images.length;
  const image = images[index];

  const go = useCallback((step: 1 | -1) => onIndex((index + step + count) % count), [index, count, onIndex]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight' && count > 1) go(1);
      else if (event.key === 'ArrowLeft' && count > 1) go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, count]);

  // Warm the neighbours so swiping feels instant
  useEffect(() => {
    if (count < 2) return;
    [images[(index + 1) % count], images[(index - 1 + count) % count]].forEach((item) => {
      const preload = new Image();
      preload.src = item.url;
    });
  }, [index, images, count]);

  if (!image) return null;

  const onTouchStart = (event: React.TouchEvent) => {
    const point = event.touches[0];
    touch.current = { x: point.clientX, y: point.clientY };
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2 && count > 1) go(dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose();
  };

  const navButton = (step: 1 | -1) => (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        go(step);
      }}
      aria-label={step === 1 ? 'Next image' : 'Previous image'}
      className={`absolute top-1/2 -translate-y-1/2 ${step === 1 ? 'right-2 sm:right-5' : 'left-2 sm:left-5'} w-11 h-11 sm:w-12 sm:h-12 inline-flex items-center justify-center rounded-(--ds-r-full) bg-white/12 hover:bg-white/22 text-white backdrop-blur-md transition-colors cursor-pointer`}
    >
      {step === 1 ? <ChevronRight className="w-6 h-6" /> : <ChevronLeft className="w-6 h-6" />}
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title}: image ${index + 1} of ${count}`}
      className="fixed inset-0 flex flex-col bg-[rgba(10,13,18,0.94)] ds-fade-in select-none"
      style={{ zIndex: 'var(--ds-z-modal)' as any }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center justify-between gap-(--ds-s-3) px-(--ds-s-4) h-14 shrink-0 text-white">
        <span className="ds-num text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-white/80" aria-live="polite">
          {index + 1} / {count}
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-10 h-10 inline-flex items-center justify-center rounded-(--ds-r-full) bg-white/12 hover:bg-white/22 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-(--ds-s-2) sm:px-(--ds-s-16)" onClick={onClose}>
        <img
          key={image.id || image.url}
          src={sized(image.url, 1280)}
          alt={image.caption || `Customer review ${index + 1}`}
          onClick={(event) => event.stopPropagation()}
          className="max-w-full max-h-full object-contain rounded-(--ds-r-md) shadow-(--ds-shadow-xl) ds-scale-in"
          draggable={false}
        />
        {count > 1 && navButton(-1)}
        {count > 1 && navButton(1)}
      </div>

      <div className="shrink-0 min-h-14 px-(--ds-s-4) py-(--ds-s-3) text-center">
        {image.caption ? (
          <p lang={blogLang(image.caption)} className="max-w-2xl mx-auto text-(length:--ds-fs-md) text-white/90 leading-(--ds-lh-normal)">
            {image.caption}
          </p>
        ) : count > 1 ? (
          <p className="text-(length:--ds-fs-xs) text-white/50 sm:hidden">Swipe to see more</p>
        ) : null}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* One tile                                                                    */
/* -------------------------------------------------------------------------- */

const ReviewTile: React.FC<{
  image: ReviewImage;
  index: number;
  onOpen: (index: number) => void;
  onBroken: (id: string) => void;
}> = ({ image, index, onOpen, onBroken }) => {
  const [tall, setTall] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={image.caption ? `Open review: ${image.caption}` : `Open customer review ${index + 1}`}
      className="group relative block w-full text-left overflow-hidden rounded-(--ds-r-xl) border border-(--ds-border) bg-(--ds-surface) shadow-(--ds-shadow-sm) transition-[box-shadow,transform] duration-(--ds-dur) ease-(--ds-ease) hover:-translate-y-0.5 hover:shadow-(--ds-shadow-lg) focus-visible:shadow-(--ds-ring) cursor-zoom-in"
    >
      {/* Phones: every tile the same shape so the row lines up; larger screens: natural height, capped */}
      <span className="relative block overflow-hidden bg-(--ds-surface-2) aspect-[4/5] sm:aspect-auto sm:max-h-[420px]">
        <img
          {...responsiveImg(image.url, '(min-width: 1024px) 300px, (min-width: 640px) 33vw, 50vw', 400)}
          alt={image.caption || `Customer review ${index + 1}`}
          loading="lazy"
          decoding="async"
          onLoad={(event) => {
            const img = event.currentTarget;
            if (img.naturalWidth) setTall(img.naturalHeight / img.naturalWidth > 1.7);
          }}
          onError={() => onBroken(image.id)}
          className="absolute inset-0 w-full h-full object-cover object-top sm:static sm:block sm:h-auto transition-transform duration-500 ease-(--ds-ease) group-hover:scale-[1.03]"
        />
        {/* A long chat screenshot fades out at the bottom: tap to read the whole thing */}
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(to_top,var(--ds-surface),transparent)] ${tall ? 'sm:block' : 'sm:hidden'} hidden`}
        />
        <span
          aria-hidden
          className="absolute top-(--ds-s-2) right-(--ds-s-2) w-8 h-8 inline-flex items-center justify-center rounded-(--ds-r-full) bg-(--ds-surface)/90 text-(--ds-text-soft) shadow-(--ds-shadow-sm) opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
        >
          <Expand className="w-4 h-4" />
        </span>
      </span>
      {image.caption && (
        <span
          lang={blogLang(image.caption)}
          className="block px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-xs) sm:text-(length:--ds-fs-sm) text-(--ds-text-soft) leading-(--ds-lh-snug) ds-clamp-2 border-t border-(--ds-border-soft)"
        >
          {image.caption}
        </span>
      )}
    </button>
  );
};

/* -------------------------------------------------------------------------- */
/* Section                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Screenshots of real customer messages and reviews, on the home page above
 * the blog. Managed in Dashboard → Customer Reviews.
 */
export const ReviewImagesSection: React.FC<{ config?: ReviewImagesConfig; className?: string }> = ({
  config,
  className = '',
}) => {
  const [broken, setBroken] = useState<string[]>([]);
  const source = config?.images;
  const images: ReviewImage[] = useMemo(
    () =>
      (Array.isArray(source) ? source : [])
        .filter((image) => image && typeof image.url === 'string' && safeImageSrc(image.url))
        .map((image, i) => ({ ...image, id: image.id || `review-${i}` }))
        .filter((image) => !broken.includes(image.id)),
    [source, broken]
  );
  const markBroken = useCallback((id: string) => setBroken((list) => (list.includes(id) ? list : [...list, id])), []);

  const [open, setOpen] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const rail = useRail(images.length);

  if (config?.isEnabled === false || images.length === 0) return null;

  const title = (config?.title || '').trim() || 'What Our Customers Say';
  const subtitle = (config?.subtitle || '').trim();
  const hiddenOnDesktop = !expanded && images.length > DESKTOP_INITIAL ? images.length - DESKTOP_INITIAL : 0;

  return (
    <section className={`max-w-7xl mx-auto px-(--ds-s-4) ${className}`} aria-labelledby="home-reviews-title">
      <div className="flex items-end justify-between gap-(--ds-s-3) mb-(--ds-s-4) sm:mb-(--ds-s-5)">
        <div className="min-w-0 flex items-start gap-(--ds-s-3)">
          <span className="hidden sm:inline-flex w-11 h-11 shrink-0 items-center justify-center rounded-(--ds-r-lg) bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-(--primary)">
            <MessageSquareQuote className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2
              id="home-reviews-title"
              lang={blogLang(title)}
              className="text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)"
            >
              {title}
            </h2>
            {subtitle && (
              <p lang={blogLang(subtitle)} className="mt-(--ds-s-1) text-(length:--ds-fs-sm) sm:text-(length:--ds-fs-md) text-(--ds-text-muted) ds-clamp-2">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <RailArrows edges={rail.edges} step={rail.step} label="reviews" />
      </div>

      {/* Phones: a swipe row, two across. Larger screens: masonry columns. */}
      <div
        ref={rail.ref}
        className="ds-scroll-hide -mx-(--ds-s-4) px-(--ds-s-4) scroll-px-(--ds-s-4) flex items-start gap-(--ds-s-4) overflow-x-auto snap-x snap-mandatory scroll-smooth pb-(--ds-s-2) sm:mx-0 sm:px-0 sm:pb-0 sm:block sm:columns-3 lg:columns-4 xl:columns-5 sm:gap-(--ds-s-4) sm:overflow-visible"
      >
        {images.map((image, i) => (
          <div
            key={image.id}
            className={`shrink-0 snap-start basis-[calc((100%-var(--ds-s-4))/2)] min-w-0 sm:mb-(--ds-s-4) sm:break-inside-avoid ${
              hiddenOnDesktop && i >= DESKTOP_INITIAL ? 'sm:hidden' : ''
            }`}
          >
            <ReviewTile image={image} index={i} onOpen={setOpen} onBroken={markBroken} />
          </div>
        ))}
      </div>

      {hiddenOnDesktop > 0 && (
        <div className="hidden sm:flex justify-center mt-(--ds-s-2)">
          <button type="button" onClick={() => setExpanded(true)} className="ds-btn ds-btn-secondary rounded-(--ds-r-full) px-(--ds-s-6)">
            Show {hiddenOnDesktop} more
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      )}

      {open !== null && images[open] && (
        <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} title={title} />
      )}
    </section>
  );
};
