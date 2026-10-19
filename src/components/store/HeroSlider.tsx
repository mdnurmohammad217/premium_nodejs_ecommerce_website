import React, { useCallback, useEffect, useRef, useState } from 'react';
import { responsiveImg, sized, srcSet } from '../../lib/img.ts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { HeroBanner } from '../../types/index.ts';

interface HeroSliderProps {
  banners?: HeroBanner[];
  onActionClick?: (url?: string | null) => void;
  /** Banners are still being fetched — hold the space with a skeleton */
  loading?: boolean;
  /**
   * v3.14 — fill the parent box (its height is set by the page, e.g. the
   * "categories + banner" hero) instead of taking the banner's own shape.
   * A banner close to the box's shape fills it; a very different one is shown
   * whole on a soft blurred copy of itself.
   */
  fill?: boolean;
  /** Extra classes for the frame (rounded corners in the split hero) */
  className?: string;
  /** How wide the banner is on the page, for picking the picture size */
  sizes?: string;
}

/**
 * One box for every slide and the skeleton. v3.9: the box takes the shape of
 * the uploaded banner itself (its real width ÷ height), so a banner is never
 * cut at the top, bottom or sides — whatever size was uploaded. Until the
 * first picture has loaded the last known shape is used (remembered per
 * device size), so the page below does not jump.
 */
const FRAME = 'relative w-full overflow-hidden';
const INTERVAL = 5500;
const DEFAULT_RATIO = { desktop: 1920 / 600, mobile: 16 / 9 };
const RATIO_KEY = 'hero:ratio:v1';

const isMobileViewport = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches;

function readSavedRatio(mobile: boolean): number {
  try {
    const saved = JSON.parse(localStorage.getItem(RATIO_KEY) || '{}');
    const value = Number(mobile ? saved.mobile : saved.desktop);
    if (value > 0.3 && value < 12) return value;
  } catch {
    /* storage unavailable */
  }
  return mobile ? DEFAULT_RATIO.mobile : DEFAULT_RATIO.desktop;
}

function saveRatio(mobile: boolean, value: number) {
  try {
    const saved = JSON.parse(localStorage.getItem(RATIO_KEY) || '{}');
    saved[mobile ? 'mobile' : 'desktop'] = value;
    localStorage.setItem(RATIO_KEY, JSON.stringify(saved));
  } catch {
    /* storage unavailable */
  }
}

const hrefFor = (url?: string | null) => {
  if (!url) return undefined;
  if (/^(https?:)?\/\//i.test(url)) return url;
  return `/${url.replace(/^\/+/, '')}`;
};

/**
 * Hero renders ONLY what the admin uploaded in Dashboard -> Banner Management.
 * No demo images, no hardcoded marketing copy.
 *
 * v3.8: the slides sit on one track that glides sideways (with a copy of the
 * first and last slide at the ends, so it loops forward without rewinding).
 * The current picture drifts in slowly, its text rises in, the dots fill up
 * while a slide is showing, and a finger drag moves the track live. Pauses on
 * hover, while dragging and while the tab is hidden.
 */
export const HeroSlider: React.FC<HeroSliderProps> = ({ banners, onActionClick, loading = false, fill = false, className = '', sizes = '100vw' }) => {
  const activeBanners = (banners || [])
    .filter((b) => (b.status || 'active') === 'active' && b.imageUrl)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const count = activeBanners.length;
  const looping = count > 1;

  // Track position: with looping, slot 0 is a copy of the last slide and slot
  // count+1 a copy of the first, so real slides are slots 1..count.
  const [slot, setSlot] = useState(looping ? 1 : 0);
  const [animated, setAnimated] = useState(true);
  const [paused, setPaused] = useState(false);
  const [dragPx, setDragPx] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [cycle, setCycle] = useState(0);
  /** Real width ÷ height of every loaded banner picture (for the current screen size) */
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [mobile, setMobile] = useState<boolean>(() => Boolean(isMobileViewport()));
  const frameRef = useRef<HTMLElement | null>(null);
  /** fill mode: the real width ÷ height of the box the banner sits in */
  const [boxRatio, setBoxRatio] = useState(0);
  const drag = useRef<{ x: number; y: number; dx: number; active: boolean; horizontal: boolean | null } | null>(null);
  const busy = useRef(false);

  const current = looping ? (((slot - 1) % count) + count) % count : 0;

  // A different set of banners (dashboard change) starts from the first one
  useEffect(() => {
    setAnimated(false);
    setSlot(count > 1 ? 1 : 0);
  }, [count]);

  /**
   * v3.12.1 — after a glide onto one of the end copies the track jumps (without
   * animation) to the real slide. That used to wait for the browser's
   * "transition ended" signal only — which never comes when the computer has
   * animations turned off (Windows "Animation effects" off / reduced motion)
   * or the tab was in the background. The track then went one step past the
   * end and the banner stayed white. Now a timer settles it as well, and the
   * track can never be sent past either end.
   */
  const slotRef = useRef(slot);
  slotRef.current = slot;
  const settleTimer = useRef<number | undefined>(undefined);
  const settle = useCallback(() => {
    window.clearTimeout(settleTimer.current);
    busy.current = false;
    if (!looping) return;
    const at = slotRef.current;
    if (at <= 0 || at >= count + 1) {
      setAnimated(false);
      setSlot(at <= 0 ? count : 1);
    }
  }, [looping, count]);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  const go = useCallback(
    (nextSlot: number) => {
      if (!looping) return;
      // Still standing on an end copy (its end signal was missed): settle first
      const at = slotRef.current;
      if (at <= 0 || at >= count + 1) {
        settle();
        setCycle((value) => value + 1);
        return;
      }
      if (busy.current) return;
      busy.current = true;
      setAnimated(true);
      setSlot(Math.max(0, Math.min(count + 1, nextSlot)));
      setCycle((value) => value + 1);
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(settle, 950);
    },
    [looping, count, settle]
  );

  const next = useCallback(() => go(slot + 1), [go, slot]);
  const prev = useCallback(() => go(slot - 1), [go, slot]);
  const goTo = (index: number) => go(index + 1);

  // Arriving on a copy at either end: jump (without animation) to the real slide
  const onTransitionEnd = (event: React.TransitionEvent) => {
    if (event.target !== event.currentTarget) return;
    settle();
  };

  // Re-enable the glide on the frame after an instant jump
  useEffect(() => {
    if (animated) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAnimated(true)));
    return () => cancelAnimationFrame(id);
  }, [animated]);

  // Autoplay: one timer per shown slide, restarted after a pause (the active
  // dot restarts with it, so the two always agree)
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    if (!looping || paused) return;
    const timer = window.setTimeout(() => nextRef.current(), INTERVAL);
    return () => window.clearTimeout(timer);
  }, [looping, paused, cycle]);

  // Phone ↔ desktop: the <picture> swaps to the other banner file, whose shape may differ
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 767px)');
    if (!query) return;
    const onChange = () => setMobile(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const onVisibility = () => setPaused(document.visibilityState !== 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // fill mode: follow the box's shape as the window is resized
  useEffect(() => {
    if (!fill) return;
    const node = frameRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width > 0 && height > 0) setBoxRatio(width / height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [fill, count]);

  const firstKey = count > 0 ? `${String(activeBanners[0].id ?? 0)}:${mobile ? 'm' : 'd'}` : '';
  // The server knows the first banner's real shape (v3.12): no jump when it loads
  const serverRatio = count > 0 ? Number((mobile && activeBanners[0].mobileImageUrl ? activeBanners[0].mobileRatio : activeBanners[0].ratio) || 0) : 0;
  const ownFrameRatio = ratios[firstKey] || (serverRatio > 0.3 && serverRatio < 12 ? serverRatio : readSavedRatio(mobile));
  const frameRatio = fill && boxRatio > 0 ? boxRatio : ownFrameRatio;
  const frameStyle: React.CSSProperties = fill ? {} : { aspectRatio: String(frameRatio) };
  // fill mode crops a little rather than showing bars; the page sets the box
  const tolerance = fill ? 0.22 : 0.02;

  if (count === 0) {
    // Nothing uploaded -> nothing rendered, rather than fake content
    return loading ? <div className={`${FRAME} ds-skeleton ${fill ? 'h-full' : 'rounded-none'} ${className}`} style={frameStyle} aria-hidden /> : null;
  }

  /* ------------------------------------------------------------ touch drag */
  const onTouchStart = (e: React.TouchEvent) => {
    if (!looping) return;
    drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, active: true, horizontal: null };
    setPaused(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const state = drag.current;
    if (!state?.active) return;
    const dx = e.touches[0].clientX - state.x;
    const dy = e.touches[0].clientY - state.y;
    if (state.horizontal === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) state.horizontal = Math.abs(dx) > Math.abs(dy);
    if (!state.horizontal) return;
    state.dx = dx;
    setAnimated(false);
    setDragPx(dx);
  };
  const onTouchEnd = () => {
    const state = drag.current;
    drag.current = null;
    setPaused(false);
    if (!state?.horizontal) {
      setDragPx(0);
      return;
    }
    const width = frameRef.current?.clientWidth || 1;
    // Read from the ref: the last move and the lift can arrive before a re-render
    const moved = state.dx;
    setDragPx(0);
    setAnimated(true);
    if (Math.abs(moved) > Math.min(80, width * 0.18)) {
      busy.current = false;
      if (moved < 0) go(slot + 1);
      else go(slot - 1);
    }
  };

  const follow = (url?: string | null) => (e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    onActionClick?.(url);
  };

  const slides = looping ? [activeBanners[count - 1], ...activeBanners, activeBanners[0]] : activeBanners;

  return (
    <section
      ref={frameRef as any}
      aria-roledescription="carousel"
      aria-label="Banners"
      // v3.14 — the slide track always runs left to right; in Arabic (right to
      // left) it used to slide the wrong way and show an empty box. The text
      // on a banner still follows its own language (dir="auto" below).
      dir="ltr"
      className={`${FRAME} bg-(--ds-surface-3) select-none ${fill ? 'h-full' : ''} ${className}`}
      style={{ ...frameStyle, ['--hero-interval' as any]: `${INTERVAL}ms` }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className={`hero-track ${animated && dragPx === 0 ? 'is-animated' : ''}`}
        style={{ transform: `translate3d(calc(${-slot * 100}% + ${dragPx}px), 0, 0)` }}
        onTransitionEnd={onTransitionEnd}
      >
        {slides.map((banner, position) => {
          const realIndex = looping ? (((position - 1) % count) + count) % count : position;
          const isCurrent = position === slot;
          const isFirst = realIndex === 0;
          const isCopy = looping && (position === 0 || position === count + 1);
          const key = `${banner.id ?? realIndex}-${position}`;
          const href = hrefFor(banner.buttonUrl);
          const hasOverlayText = Boolean(banner.title || banner.subtitle || banner.badge);
          const external = href ? /^(https?:)?\/\//i.test(href) : false;
          const loadKey = String(banner.id ?? realIndex);
          const ratioKey = `${loadKey}:${mobile ? 'm' : 'd'}`;
          // A banner of another shape than the frame is shown whole, on a soft
          // blurred copy of itself instead of empty bars
          const ownRatio = ratios[ratioKey];
          const differs = Boolean(ownRatio && Math.abs(ownRatio - frameRatio) / frameRatio > tolerance);
          const shownSrc = mobile && banner.mobileImageUrl ? banner.mobileImageUrl : banner.imageUrl;

          const image = (
            <picture className="hero-picture absolute inset-0 block">
              {differs && (
                <img
                  src={sized(shownSrc, 240)}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-70"
                />
              )}
              {banner.mobileImageUrl && (
                <source media="(max-width: 767px)" srcSet={srcSet(banner.mobileImageUrl, 960, 320) || banner.mobileImageUrl} sizes={sizes} />
              )}
              <img
                {...responsiveImg(banner.imageUrl, sizes, 1920, 320)}
                alt={isCopy ? '' : banner.title || 'Banner'}
                loading={isFirst && !isCopy ? 'eager' : 'lazy'}
                fetchPriority={isFirst && !isCopy ? 'high' : 'low'}
                decoding={isFirst && !isCopy ? 'sync' : 'async'}
                draggable={false}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  setLoaded((prevState) => ({ ...prevState, [loadKey]: true }));
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    const value = img.naturalWidth / img.naturalHeight;
                    setRatios((prevState) => (prevState[ratioKey] === value ? prevState : { ...prevState, [ratioKey]: value }));
                    if (realIndex === 0) saveRatio(mobile, value);
                  }
                }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                  setLoaded((prevState) => ({ ...prevState, [loadKey]: true }));
                }}
                className={`absolute inset-0 w-full h-full object-center ${differs ? 'object-contain' : 'object-cover'}`}
              />
            </picture>
          );

          return (
            <div
              key={key}
              aria-hidden={!isCurrent || isCopy}
              className={`hero-slide ${isCurrent ? 'is-current' : ''}`}
            >
              {!loaded[loadKey] && <div className="absolute inset-0 ds-skeleton rounded-none" />}

              {href ? (
                <a
                  href={href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noopener noreferrer' : undefined}
                  onClick={follow(banner.buttonUrl)}
                  tabIndex={isCurrent && !isCopy ? 0 : -1}
                  aria-label={banner.title || banner.buttonText || 'Banner'}
                  className="absolute inset-0"
                  draggable={false}
                >
                  {image}
                </a>
              ) : (
                image
              )}

              {hasOverlayText && (
                <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(90deg,color-mix(in_srgb,var(--ds-gray-900)_60%,transparent),color-mix(in_srgb,var(--ds-gray-900)_20%,transparent)_55%,transparent)]">
                  <div className="h-full max-w-7xl mx-auto px-(--ds-s-6) md:px-(--ds-s-12) flex items-center">
                    <div dir="auto" className="hero-copy max-w-xl text-(--ds-text-invert) space-y-(--ds-s-2) md:space-y-(--ds-s-3)">
                      {banner.badge && (
                        <span className="inline-block px-(--ds-s-3) py-(--ds-s-1) rounded-(--ds-r-full) text-(length:--ds-fs-xs) font-(--ds-fw-semibold) bg-(--ds-surface)/20 backdrop-blur-sm">
                          {banner.badge}
                        </span>
                      )}
                      {banner.title && (
                        <h2 className="text-(length:--ds-fs-lg) sm:text-(length:--ds-fs-2xl) md:text-(length:--ds-fs-4xl) font-(--ds-fw-bold) leading-tight text-(--ds-text-invert) ds-clamp-2">
                          {banner.title}
                        </h2>
                      )}
                      {banner.subtitle && (
                        <p className="hidden sm:[display:-webkit-box] text-(length:--ds-fs-base) md:text-(length:--ds-fs-md) text-(--ds-text-invert)/90 ds-clamp-2">
                          {banner.subtitle}
                        </p>
                      )}
                      {banner.buttonText && href && (
                        <a
                          href={href}
                          target={external ? '_blank' : undefined}
                          rel={external ? 'noopener noreferrer' : undefined}
                          onClick={follow(banner.buttonUrl)}
                          tabIndex={isCurrent && !isCopy ? 0 : -1}
                          className="pointer-events-auto ds-btn ds-btn-primary ds-btn-sm mt-(--ds-s-1) shadow-(--ds-shadow-lg)"
                        >
                          {banner.buttonText}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {looping && (
        <>
          <button
            type="button"
            aria-label="Previous banner"
            onClick={prev}
            className="hidden sm:inline-flex absolute left-(--ds-s-3) md:left-(--ds-s-5) top-1/2 -translate-y-1/2 z-20 w-(--ds-h-md) h-(--ds-h-md) md:w-(--ds-h-lg) md:h-(--ds-h-lg) rounded-(--ds-r-full) bg-(--ds-surface)/85 hover:bg-(--ds-surface) text-(--ds-text) items-center justify-center shadow-(--ds-shadow-md) transition-[background-color,transform] duration-(--ds-dur) hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Next banner"
            onClick={next}
            className="hidden sm:inline-flex absolute right-(--ds-s-3) md:right-(--ds-s-5) top-1/2 -translate-y-1/2 z-20 w-(--ds-h-md) h-(--ds-h-md) md:w-(--ds-h-lg) md:h-(--ds-h-lg) rounded-(--ds-r-full) bg-(--ds-surface)/85 hover:bg-(--ds-surface) text-(--ds-text) items-center justify-center shadow-(--ds-shadow-md) transition-[background-color,transform] duration-(--ds-dur) hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-sm"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="absolute bottom-(--ds-s-2) md:bottom-(--ds-s-4) left-1/2 -translate-x-1/2 z-20 flex items-center">
            {activeBanners.map((_, i) => {
              const active = i === current;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to banner ${i + 1}`}
                  aria-current={active}
                  onClick={() => goTo(i)}
                  // v3.12 — a 24 px tap area around the small dot (easy to hit on a phone)
                  className="group/dot h-6 min-w-6 px-1.5 inline-flex items-center justify-center cursor-pointer"
                >
                  <span
                    className={`relative block h-2 overflow-hidden rounded-(--ds-r-full) transition-[width,background-color] duration-(--ds-dur-slow) ease-(--ds-ease) ${
                      active ? 'w-8 bg-(--ds-surface)/45' : 'w-2 bg-(--ds-surface)/55 group-hover/dot:bg-(--ds-surface)/80'
                    }`}
                  >
                    {active && (
                      <span
                        key={`fill-${cycle}-${i}-${paused ? 'p' : 'r'}`}
                        className={`hero-dot-fill absolute inset-0 rounded-(--ds-r-full) bg-(--ds-surface) ${paused ? 'is-running is-paused' : 'is-running'}`}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};
