import React, { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { ProductCard } from './ProductCard.tsx';
import { ProductCardSkeleton } from './CategorySection.tsx';
import { RailArrows, railLayout, sectionLayoutOf, useRail, type HomeSectionsConfig } from './ProductRail.tsx';
import { Product, SiteSettings } from '../../types/index.ts';
import { cachedGet } from '../../lib/dataCache.ts';

/**
 * v3.12 — "New Arrivals" on the home page, right under the categories.
 *
 * Shows exactly the products the owner picked (Dashboard → Website → Home
 * Sections → New Arrival, or the "New Arrival" switch on a product), newest
 * first. Hidden when it is switched off or nothing is picked.
 */
export interface NewArrivalConfig {
  enabled?: boolean;
  title?: string;
  /** How many products the section shows (4–24) */
  limit?: number;
}

export const newArrivalConfigOf = (settings?: SiteSettings) => {
  const raw = (((settings as any)?.home_sections_config || {}) as HomeSectionsConfig & { newArrivalSection?: NewArrivalConfig })
    .newArrivalSection || {};
  return {
    enabled: raw.enabled !== false,
    title: String(raw.title || '').trim() || 'New Arrivals',
    limit: Math.min(24, Math.max(4, Number(raw.limit) || 10)),
  };
};

export const NewArrivalSection: React.FC<{
  settings?: SiteSettings;
  onSelectProduct: (product: Product) => void;
  onQuickBuy: () => void;
  onViewAll: () => void;
}> = ({ settings, onSelectProduct, onQuickBuy, onViewAll }) => {
  const cfg = newArrivalConfigOf(settings);
  const [items, setItems] = useState<Product[] | null>(null);

  useEffect(() => {
    if (!cfg.enabled) return;
    let cancelled = false;
    const apply = (data: unknown) => {
      if (!cancelled) setItems(Array.isArray(data) ? (data as Product[]) : []);
    };
    cachedGet(`/api/products?newArrival=true&limit=${cfg.limit}`, { onFresh: apply })
      .then(apply)
      .catch(() => apply([]));
    return () => {
      cancelled = true;
    };
  }, [cfg.enabled, cfg.limit]);

  const layout = sectionLayoutOf((settings as any)?.home_sections_config as HomeSectionsConfig, 'newArrival');
  const look = railLayout(layout);
  const rail = useRail(items?.length || 0);

  if (!cfg.enabled || (items !== null && items.length === 0)) return null;

  return (
    <section className="max-w-7xl mx-auto px-(--ds-s-4)" aria-labelledby="new-arrivals-title">
      <div className="flex items-center justify-between gap-(--ds-s-3) mb-(--ds-s-4)">
        <h2
          id="new-arrivals-title"
          className="min-w-0 flex items-center gap-(--ds-s-2) text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)"
        >
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-(--ds-r-md) text-(--primary) bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
          >
            <Sparkles className="w-5 h-5" />
          </span>
          <span className="truncate">{cfg.title}</span>
        </h2>
        <div className="flex items-center gap-(--ds-s-2) shrink-0">
          <RailArrows edges={rail.edges} step={rail.step} label="new arrivals" layout={layout} />
          <a
            href="/shop?newArrival=1"
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onViewAll();
            }}
            className="group shrink-0 inline-flex items-center gap-(--ds-s-1) h-(--ds-h-sm) px-(--ds-s-3) rounded-(--ds-r-full) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] transition-colors"
          >
            <span>View All</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>

      <div ref={rail.ref} className={look.track}>
        {items === null
          ? Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className={`${look.item} ${layout === 'auto' && index === 3 ? 'sm:hidden md:block' : ''} ${layout === 'auto' && index === 4 ? 'sm:hidden lg:block' : ''}`}
              >
                <ProductCardSkeleton />
              </div>
            ))
          : items.map((product) => (
              <div key={product.id} className={look.item}>
                <ProductCard product={product} config={settings?.product_card_config} onSelect={onSelectProduct} onQuickBuy={onQuickBuy} />
              </div>
            ))}
      </div>
    </section>
  );
};
