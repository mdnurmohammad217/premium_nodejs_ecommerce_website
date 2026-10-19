import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Product rows on the home page.
 *
 * v3.10 — each section can be shown three ways (Dashboard → Website → Home
 * Sections), and Grid / Slide look the same on every device:
 *   • auto  — a swipeable row on phones, a grid from tablets up (as before)
 *   • grid  — always a grid (two cards per row on a phone)
 *   • slide — always one sliding row with arrows (2 cards on a phone, up to 5 on a desktop)
 * A row always shows whole cards — never half of one. The space between cards
 * is tighter on phones (8px) so the cards themselves are larger.
 */
export type SectionLayout = 'auto' | 'grid' | 'slide';

export interface HomeSectionsConfig {
  /** Used by every section that has no choice of its own */
  default?: SectionLayout;
  flashSale?: SectionLayout;
  allProducts?: SectionLayout;
  /** v3.12 — the New Arrival section */
  newArrival?: SectionLayout;
  /** By category id */
  categories?: Record<string, SectionLayout>;
  /** v3.12 — the category slider moves by itself (default on) */
  categoryAutoSlide?: boolean;
  /** v3.12 — seconds between two steps of the category slider (2–10) */
  categorySlideSeconds?: number;
  /** v3.12.2 — category row: one sliding row (default) or a grid of rows */
  categoryLayout?: 'slide' | 'grid';
  /** v3.12.2 — grid: categories per row on phones (2–4, default 2) */
  categoryGridMobile?: number;
  /** v3.12.2 — grid: categories per row on computers (4–8, default 6) */
  categoryGridDesktop?: number;
  /** v3.13 — how each category looks: tile, circle, card or chip */
  categoryDesign?: 'tile' | 'circle' | 'card' | 'chip';
  /** v3.12 — New Arrival section: on/off, title, how many products */
  newArrivalSection?: { enabled?: boolean; title?: string; limit?: number };
  /** v3.12 — "Contact us" block above the footer: on/off, texts */
  contactSection?: { enabled?: boolean; title?: string; subtitle?: string };
}

const asLayout = (value: any): SectionLayout | null => (value === 'grid' || value === 'slide' || value === 'auto' ? value : null);

export function sectionLayoutOf(
  config: HomeSectionsConfig | null | undefined,
  key: 'flashSale' | 'allProducts' | 'newArrival' | { category: number | string }
): SectionLayout {
  const own = typeof key === 'string' ? asLayout(config?.[key]) : asLayout(config?.categories?.[String(key.category)]);
  return own || asLayout(config?.default) || 'auto';
}

const GAP = 'gap-(--ds-s-2) min-[480px]:gap-(--ds-s-3) sm:gap-(--ds-s-4)';
const SLIDE_TRACK = `ds-scroll-hide flex ${GAP} overflow-x-auto snap-x snap-mandatory scroll-smooth py-(--ds-s-2) -my-(--ds-s-2)`;

const LAYOUTS: Record<SectionLayout, { track: string; item: string; arrows: string }> = {
  auto: {
    track: `${SLIDE_TRACK} sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:overflow-visible sm:py-0 sm:my-0`,
    item: 'shrink-0 snap-start basis-[calc((100%-var(--ds-s-2))/2)] min-[480px]:basis-[calc((100%-2*var(--ds-s-3))/3)] sm:basis-auto min-w-0',
    arrows: 'flex sm:hidden',
  },
  grid: {
    track: `grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${GAP}`,
    item: 'min-w-0',
    arrows: 'hidden',
  },
  slide: {
    track: SLIDE_TRACK,
    item: 'shrink-0 snap-start min-w-0 basis-[calc((100%-var(--ds-s-2))/2)] min-[480px]:basis-[calc((100%-2*var(--ds-s-3))/3)] sm:basis-[calc((100%-2*var(--ds-s-4))/3)] md:basis-[calc((100%-3*var(--ds-s-4))/4)] lg:basis-[calc((100%-4*var(--ds-s-4))/5)]',
    arrows: 'flex',
  },
};

export const railLayout = (layout: SectionLayout = 'auto') => LAYOUTS[layout] || LAYOUTS.auto;

/** The default row (auto): used by related products and other rows without a setting */
export const RAIL_TRACK = LAYOUTS.auto.track;
export const RAIL_ITEM = LAYOUTS.auto.item;

export function useRail(itemCount: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const scrollable = el.scrollWidth - el.clientWidth > 4;
    // v3.14 — scrollLeft runs 0 → negative on a right-to-left page (Arabic)
    const pos = Math.abs(el.scrollLeft);
    setEdges({ prev: scrollable && pos > 4, next: scrollable && pos < el.scrollWidth - el.clientWidth - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, itemCount]);

  /** One screenful of cards per tap */
  const step = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy({ left: direction * (rtl ? -1 : 1) * (el.clientWidth - 8), behavior: 'smooth' });
  };

  return { ref, edges, step };
}

/** Round prev/next buttons: wherever the row slides (phones in auto, every screen in slide) */
export const RailArrows: React.FC<{
  edges: { prev: boolean; next: boolean };
  step: (direction: 1 | -1) => void;
  label?: string;
  layout?: SectionLayout;
}> = ({ edges, step, label = 'products', layout = 'auto' }) => {
  if (!edges.prev && !edges.next) return null;
  const button = (direction: 1 | -1, enabled: boolean) => (
    <button
      type="button"
      onClick={() => step(direction)}
      disabled={!enabled}
      aria-label={direction === 1 ? `Next ${label}` : `Previous ${label}`}
      className="w-(--ds-h-sm) h-(--ds-h-sm) inline-flex items-center justify-center rounded-(--ds-r-full) border border-(--ds-border) bg-(--ds-surface) text-(--ds-text) shadow-(--ds-shadow-xs) transition-opacity disabled:opacity-35 cursor-pointer disabled:cursor-default"
    >
      {direction === 1 ? <ChevronRight className="w-4 h-4 rtl:rotate-180" /> : <ChevronLeft className="w-4 h-4 rtl:rotate-180" />}
    </button>
  );
  return (
    <div className={`${railLayout(layout as SectionLayout).arrows} items-center gap-1.5 shrink-0`}>
      {button(-1, edges.prev)}
      {button(1, edges.next)}
    </div>
  );
};
