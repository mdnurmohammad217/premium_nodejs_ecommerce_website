import React from 'react';
import { responsiveImg } from '../../lib/img.ts';
import {
  Pill,
  HeartPulse,
  ShieldAlert,
  Baby,
  Sparkles,
  Activity,
  Syringe,
  Thermometer,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';
import { Category } from '../../types/index.ts';
import { useT } from '../../lib/i18n.tsx';

/**
 * v3.13 — how one category looks (Dashboard → Website → Home Sections →
 * Categories → Design). Every design works as a sliding row or as a grid.
 *   tile    square picture, name under it (the design up to v3.12)
 *   circle  round picture in a soft ring, name under it
 *   card    tall picture card, name and "Shop now" on the picture
 *   chip    small round picture and name in a pill (compact, good on phones)
 */
export type CategoryDesign = 'tile' | 'circle' | 'card' | 'chip';
export const CATEGORY_DESIGNS: CategoryDesign[] = ['tile', 'circle', 'card', 'chip'];
export const categoryDesignOf = (value: unknown): CategoryDesign =>
  CATEGORY_DESIGNS.includes(value as CategoryDesign) ? (value as CategoryDesign) : 'tile';

interface CategoryGridProps {
  categories?: Category[];
  selectedCategorySlug?: string | null;
  onSelectCategory: (slug: string | null) => void;
  /** Catalogue still loading — show placeholder tiles */
  loading?: boolean;
  title?: string;
  /** v3.13 — a heading of its own (the Glow theme's two-colour title) */
  heading?: React.ReactNode;
  /** v3.12 — move along by itself (Dashboard → Website → Home Sections) */
  autoSlide?: boolean;
  /** Seconds between two steps */
  slideSeconds?: number;
  /** v3.12.2 — one sliding row (default) or rows of tiles */
  layout?: 'slide' | 'grid';
  /** v3.12.2 — grid: tiles per row on phones */
  gridColumnsMobile?: number;
  /** v3.12.2 — grid: tiles per row on computers */
  gridColumnsDesktop?: number;
  /** v3.13 — how each category looks */
  design?: CategoryDesign;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Pill,
  HeartPulse,
  ShieldAlert,
  Baby,
  Sparkles,
  Activity,
  Syringe,
  Thermometer,
  Stethoscope,
};

/** Width of one item in the sliding row, per design (phones · tablets · computers) */
const SLIDE_BASIS: Record<CategoryDesign, string> = {
  tile: 'shrink-0 snap-start basis-[calc((100%-2*var(--ds-s-3))/3.3)] sm:basis-[calc((100%-4*var(--ds-s-3))/5)] lg:basis-[calc((100%-7*var(--ds-s-4))/8)]',
  circle:
    'shrink-0 snap-start basis-[calc((100%-3*var(--ds-s-3))/4.2)] sm:basis-[calc((100%-5*var(--ds-s-3))/6)] lg:basis-[calc((100%-8*var(--ds-s-4))/9)]',
  card: 'shrink-0 snap-start basis-[calc((100%-1*var(--ds-s-3))/2.25)] sm:basis-[calc((100%-3*var(--ds-s-3))/4)] lg:basis-[calc((100%-5*var(--ds-s-4))/6)]',
  chip: 'shrink-0 snap-start',
};

/** Picture width the browser should fetch, per design */
const SLIDE_SIZES: Record<CategoryDesign, [string, number]> = {
  tile: ['(min-width: 1024px) 150px, (min-width: 640px) 20vw, 30vw', 240],
  circle: ['(min-width: 1024px) 130px, (min-width: 640px) 16vw, 24vw', 240],
  card: ['(min-width: 1024px) 210px, (min-width: 640px) 25vw, 45vw', 400],
  chip: ['48px', 160],
};

const isRtl = (el: HTMLElement) => getComputedStyle(el).direction === 'rtl';

/**
 * The home page categories. Only categories marked "featured" appear, and
 * this is the one place on the storefront that shows a category's image.
 */
export const CategoryGrid: React.FC<CategoryGridProps> = ({
  categories,
  selectedCategorySlug,
  onSelectCategory,
  loading = false,
  title = 'Categories',
  heading,
  autoSlide = true,
  slideSeconds = 3,
  layout = 'slide',
  gridColumnsMobile = 2,
  gridColumnsDesktop = 6,
  design: designProp = 'tile',
}) => {
  const t = useT();
  const design = categoryDesignOf(designProp);
  const isGrid = layout === 'grid';
  // Grid columns: phones 2–4, computers 4–8, tablets in between
  const colsSm = Math.min(4, Math.max(2, Math.round(Number(gridColumnsMobile) || 2)));
  const colsLg = Math.min(8, Math.max(4, Math.round(Number(gridColumnsDesktop) || 6)));
  const colsMd = Math.max(colsSm, Math.min(colsLg, 4));
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: true, end: false });
  /** Auto-slide waits while the visitor is pointing at, touching or using the row */
  const holdUntil = React.useRef(0);
  const hovering = React.useRef(false);

  const featured = (Array.isArray(categories) ? categories : [])
    .filter((cat) => cat.featured)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  // scrollLeft runs 0 → negative in a right-to-left page (Arabic), so the
  // position is measured as a distance from the start either way
  const updateEdges = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const pos = Math.abs(el.scrollLeft);
    setEdges({ start: pos <= 4, end: pos + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  React.useEffect(() => {
    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, [updateEdges, featured.length, isGrid]);

  // One "page" is most of the visible width, so a tile stays in view as a reference
  const scrollBy = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    holdUntil.current = Date.now() + 8000;
    const sign = isRtl(el) ? -1 : 1;
    el.scrollBy({ left: sign * direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  /**
   * v3.12 — the row glides one category along every few seconds and goes
   * back to the start at the end. It waits while the visitor points at it,
   * touches or scrolls it, uses the arrows, while it is off screen or the
   * tab is hidden, and never moves for people who ask for reduced motion.
   */
  const seconds = Math.min(10, Math.max(2, Number(slideSeconds) || 3));
  React.useEffect(() => {
    if (isGrid || !autoSlide || featured.length < 2) return;
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    } catch {
      /* old browser: slide */
    }
    const el = scrollerRef.current;
    if (!el) return;
    let onScreen = true;
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting)) : null;
    observer?.observe(el);
    const hold = () => (holdUntil.current = Date.now() + 8000);
    el.addEventListener('pointerdown', hold, { passive: true });
    el.addEventListener('touchstart', hold, { passive: true });
    el.addEventListener('wheel', hold, { passive: true });
    el.addEventListener('focusin', hold);
    const timer = window.setInterval(() => {
      if (!onScreen || document.hidden || hovering.current || Date.now() < holdUntil.current) return;
      const room = el.scrollWidth - el.clientWidth;
      if (room < 8) return;
      const tile = el.firstElementChild as HTMLElement | null;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 12;
      const step = tile ? tile.getBoundingClientRect().width + gap : el.clientWidth / 2;
      const sign = isRtl(el) ? -1 : 1;
      const pos = Math.abs(el.scrollLeft);
      const atEnd = pos >= room - 4;
      el.scrollTo({ left: atEnd ? 0 : sign * Math.min(room, pos + step), behavior: 'smooth' });
    }, seconds * 1000);
    return () => {
      window.clearInterval(timer);
      observer?.disconnect();
      el.removeEventListener('pointerdown', hold);
      el.removeEventListener('touchstart', hold);
      el.removeEventListener('wheel', hold);
      el.removeEventListener('focusin', hold);
    };
  }, [isGrid, autoSlide, seconds, featured.length]);

  if (!loading && featured.length === 0) return null;

  const gridSizes = `(min-width: 1024px) ${Math.round(1248 / colsLg)}px, (min-width: 640px) ${Math.round(100 / colsMd)}vw, ${Math.round(100 / colsSm)}vw`;
  const tile = (cat: Category, className: string, sizes: string, maxWidth: number) => (
    <CategoryTile
      key={cat.id}
      category={cat}
      design={design}
      selected={selectedCategorySlug === cat.slug}
      onSelect={() => onSelectCategory(selectedCategorySlug === cat.slug ? null : cat.slug)}
      className={className}
      sizes={design === 'chip' ? '48px' : sizes}
      maxWidth={design === 'chip' ? 160 : maxWidth}
    />
  );
  const skeleton = (key: number, className: string) => (
    <div key={key} className={className}>
      {design === 'chip' ? (
        <div className="ds-skeleton h-14 w-40 rounded-(--ds-r-full)" />
      ) : (
        <>
          <div className={`ds-skeleton w-full ${design === 'card' ? 'aspect-[4/5] rounded-(--ds-r-2xl)' : design === 'circle' ? 'aspect-square rounded-full' : 'aspect-square rounded-(--ds-r-xl)'}`} />
          {design !== 'card' && <div className="ds-skeleton h-3 w-3/4 mx-auto mt-(--ds-s-2)" />}
        </>
      )}
    </div>
  );

  return (
    <section className="max-w-7xl mx-auto px-(--ds-s-4)">
      <div className="flex items-end justify-between gap-(--ds-s-3) mb-(--ds-s-4)">
        {heading || (
          <h2 className="text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">{t(title)}</h2>
        )}
        <div className="flex items-center gap-(--ds-s-2)">
          {selectedCategorySlug && (
            <button type="button" onClick={() => onSelectCategory(null)} className="ds-btn ds-btn-ghost ds-btn-sm">
              {t('View All')}
            </button>
          )}
          {!isGrid && featured.length > 3 && (
            <div className="hidden sm:flex items-center gap-(--ds-s-1)">
              <button
                type="button"
                aria-label={t('Previous categories')}
                disabled={edges.start}
                onClick={() => scrollBy(-1)}
                className="ds-btn ds-btn-secondary ds-btn-icon ds-btn-sm rounded-(--ds-r-full)"
              >
                <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
              </button>
              <button
                type="button"
                aria-label={t('Next categories')}
                disabled={edges.end}
                onClick={() => scrollBy(1)}
                className="ds-btn ds-btn-secondary ds-btn-icon ds-btn-sm rounded-(--ds-r-full)"
              >
                <ChevronRight className="w-4 h-4 rtl:rotate-180" />
              </button>
            </div>
          )}
        </div>
      </div>

      {isGrid ? (
        <div
          className={`cat-grid ${design === 'chip' ? 'cat-grid-chip' : ''}`}
          style={{ '--cat-cols-sm': colsSm, '--cat-cols-md': colsMd, '--cat-cols-lg': colsLg } as React.CSSProperties}
        >
          {loading && featured.length === 0
            ? Array.from({ length: colsLg }).map((_, i) => skeleton(i, 'min-w-0'))
            : featured.map((cat) => tile(cat, 'min-w-0', gridSizes, colsSm <= 2 ? 400 : 240))}
        </div>
      ) : (
        <div
          ref={scrollerRef}
          onScroll={updateEdges}
          onMouseEnter={() => (hovering.current = true)}
          onMouseLeave={() => (hovering.current = false)}
          className={`ds-scroll-hide flex ${design === 'chip' ? 'gap-(--ds-s-2)' : 'gap-(--ds-s-3) lg:gap-(--ds-s-4)'} overflow-x-auto scroll-smooth snap-x snap-mandatory pb-(--ds-s-1) ${
            design === 'circle' ? 'pt-1' : ''
          }`}
        >
          {loading && featured.length === 0
            ? Array.from({ length: 8 }).map((_, i) => skeleton(i, SLIDE_BASIS[design]))
            : featured.map((cat) => tile(cat, SLIDE_BASIS[design], SLIDE_SIZES[design][0], SLIDE_SIZES[design][1]))}
        </div>
      )}
    </section>
  );
};

const CategoryTile: React.FC<{
  category: Category;
  design: CategoryDesign;
  selected: boolean;
  onSelect: () => void;
  className: string;
  sizes: string;
  maxWidth: number;
}> = ({ category, design, selected, onSelect, className, sizes, maxWidth }) => {
  const t = useT();
  const [broken, setBroken] = React.useState(false);
  const Icon = (category.icon && ICON_MAP[category.icon]) || Pill;
  const hasImage = Boolean(category.image && !broken);

  const picture = (imgClass: string) =>
    hasImage ? (
      <img
        {...responsiveImg(category.image, sizes, maxWidth)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={imgClass}
      />
    ) : (
      <div className="w-full h-full flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] text-(--primary)">
        <Icon className={design === 'chip' ? 'w-5 h-5' : 'w-7 h-7'} />
      </div>
    );

  const link = (body: React.ReactNode, extra = '') => (
    <a
      href={`/shop?category=${encodeURIComponent(category.slug)}`}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onSelect();
      }}
      aria-current={selected ? 'true' : undefined}
      className={`${className} group/cat ${extra}`}
    >
      {body}
    </a>
  );

  const name = (extra: string) => (
    <span
      className={`block mt-(--ds-s-2) px-0.5 text-(length:--ds-fs-sm) font-(--ds-fw-semibold) ds-clamp-2 leading-snug ${
        selected ? 'text-(--primary)' : 'text-(--ds-text) group-hover/cat:text-(--primary)'
      } ${extra}`}
    >
      {category.name}
    </span>
  );

  if (design === 'circle') {
    return link(
      <>
        <div
          className={`relative aspect-square w-full rounded-full p-[3px] transition-transform duration-(--ds-dur) group-hover/cat:-translate-y-0.5 ${
            selected ? 'bg-(--primary)' : 'bg-[conic-gradient(from_200deg,color-mix(in_srgb,var(--primary)_55%,transparent),color-mix(in_srgb,var(--primary)_12%,transparent),color-mix(in_srgb,var(--primary)_55%,transparent))]'
          }`}
        >
          <div className="w-full h-full rounded-full overflow-hidden bg-(--ds-surface) ring-[3px] ring-(--ds-surface)">
            {picture('w-full h-full object-cover transition-transform duration-(--ds-dur-slow) group-hover/cat:scale-110')}
          </div>
        </div>
        {name('text-center')}
      </>,
      'text-center'
    );
  }

  if (design === 'card') {
    return link(
      <div
        className={`relative aspect-[4/5] w-full rounded-(--ds-r-2xl) overflow-hidden bg-(--ds-surface-2) shadow-(--ds-shadow-sm) transition-[box-shadow,transform] duration-(--ds-dur) group-hover/cat:shadow-(--ds-shadow-lg) group-hover/cat:-translate-y-0.5 ${
          selected ? 'ring-2 ring-(--primary) ring-offset-2' : ''
        }`}
      >
        {picture('absolute inset-0 w-full h-full object-cover transition-transform duration-(--ds-dur-slow) group-hover/cat:scale-105')}
        <div className="absolute inset-x-0 bottom-0 pt-12 pb-(--ds-s-3) px-(--ds-s-3) bg-[linear-gradient(180deg,transparent,rgba(10,14,20,0.78))]">
          <span className="block text-white text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) font-(--ds-fw-bold) leading-tight ds-clamp-2">{category.name}</span>
          <span className="mt-1 inline-flex items-center gap-1 text-white/85 text-(length:--ds-fs-xs) font-(--ds-fw-semibold)">
            {t('Shop now')} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/cat:translate-x-0.5 rtl:rotate-180" />
          </span>
        </div>
      </div>
    );
  }

  if (design === 'chip') {
    return link(
      <span
        className={`flex items-center gap-(--ds-s-2) h-14 ps-1.5 pe-(--ds-s-4) rounded-(--ds-r-full) border transition-[border-color,background-color,box-shadow] duration-(--ds-dur) ${
          selected
            ? 'border-(--primary) bg-[color-mix(in_srgb,var(--primary)_10%,var(--ds-surface))]'
            : 'border-(--ds-border) bg-(--ds-surface) group-hover/cat:border-(--primary) group-hover/cat:shadow-(--ds-shadow-sm)'
        }`}
      >
        <span className="w-11 h-11 shrink-0 rounded-full overflow-hidden bg-(--ds-surface-2)">
          {picture('w-full h-full object-cover')}
        </span>
        <span
          className={`min-w-0 truncate text-(length:--ds-fs-base) font-(--ds-fw-semibold) ${
            selected ? 'text-(--primary)' : 'text-(--ds-text) group-hover/cat:text-(--primary)'
          }`}
        >
          {category.name}
        </span>
      </span>,
      'block min-w-0'
    );
  }

  // tile — the design up to v3.12
  return link(
    <>
      <div
        className={`aspect-square w-full rounded-(--ds-r-xl) overflow-hidden border bg-(--ds-surface) transition-[border-color,box-shadow,transform] duration-(--ds-dur) group-hover/cat:-translate-y-0.5 group-hover/cat:shadow-(--ds-shadow-md) ${
          selected ? 'border-(--primary) shadow-(--ds-ring)' : 'border-(--ds-border) group-hover/cat:border-(--ds-border-strong)'
        }`}
      >
        {picture('w-full h-full object-cover transition-transform duration-(--ds-dur-slow) group-hover/cat:scale-105')}
      </div>
      {name('')}
    </>,
    'text-center'
  );
};
