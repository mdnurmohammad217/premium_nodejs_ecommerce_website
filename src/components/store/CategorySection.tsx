import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ProductCard } from './ProductCard.tsx';
import { RailArrows, railLayout, sectionLayoutOf, useRail, type HomeSectionsConfig } from './ProductRail.tsx';
import { Category, Product, SiteSettings } from '../../types/index.ts';
import { cachedGet } from '../../lib/dataCache.ts';

interface CategorySectionProps {
  category: Category;
  settings?: SiteSettings;
  onSelectProduct: (product: Product) => void;
  onQuickBuy: () => void;
  onViewAll: (slug: string) => void;
  /** Already-loaded catalog; fills in products from sub-categories */
  catalog?: Product[];
  limit?: number;
}

/**
 * One home-page section per category flagged "Show Section (Home Page)" in
 * Dashboard → Category Manager. Each section loads its own products, so a
 * slow category never holds up the rest of the page.
 */
export const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  settings,
  onSelectProduct,
  onQuickBuy,
  onViewAll,
  catalog = [],
  limit = 10,
}) => {
  const [fetched, setFetched] = useState<Product[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `/api/products?category=${encodeURIComponent(category.slug)}&limit=${limit}`;
    const apply = (data: unknown) => {
      if (!cancelled) setFetched(Array.isArray(data) ? data : []);
    };
    cachedGet(url, { onFresh: apply })
      .then(apply)
      .catch(() => apply([]));
    return () => {
      cancelled = true;
    };
  }, [category.slug, limit]);

  // The API filters on the category itself; products filed under its
  // sub-categories come from the catalogue the page already holds.
  const childIds = useMemo(() => {
    const ids = new Set<number>([category.id]);
    const walk = (nodes?: Category[]) =>
      (nodes || []).forEach((child) => {
        ids.add(child.id);
        walk(child.children);
      });
    walk(category.children);
    return ids;
  }, [category]);

  const products = useMemo(() => {
    if (fetched === null) return null;
    const seen = new Set<number>();
    const merged: Product[] = [];
    for (const product of [...fetched, ...catalog.filter((p) => p.categoryId && childIds.has(p.categoryId))]) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      merged.push(product);
    }
    return merged.slice(0, limit);
  }, [fetched, catalog, childIds, limit]);

  const rail = useRail(products?.length || 0);
  // Grid or slide, as chosen in Dashboard → Website → Home Sections
  const layout = sectionLayoutOf((settings as any)?.home_sections_config as HomeSectionsConfig, { category: category.id });
  const look = railLayout(layout);
  const ROW_ITEM = look.item;

  // A category with nothing in it shouldn't leave an empty band on the page
  if (products !== null && products.length === 0) return null;

  const href = `/shop?category=${encodeURIComponent(category.slug)}`;

  return (
    <section className="max-w-7xl mx-auto px-(--ds-s-4)" aria-labelledby={`cat-section-${category.id}`}>
      <div className="flex items-center justify-between gap-(--ds-s-3) mb-(--ds-s-4)">
        <h2
          id={`cat-section-${category.id}`}
          className="min-w-0 truncate text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)"
        >
          {category.name}
        </h2>
        <div className="flex items-center gap-(--ds-s-2) shrink-0">
        <RailArrows edges={rail.edges} step={rail.step} label={`${category.name} products`} layout={layout} />
        <a
          href={href}
          onClick={(e) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            onViewAll(category.slug);
          }}
          className="group shrink-0 inline-flex items-center gap-(--ds-s-1) h-(--ds-h-sm) px-(--ds-s-3) rounded-(--ds-r-full) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] transition-colors"
        >
          <span>View All</span>
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </a>
        </div>
      </div>

      <div ref={rail.ref} className={look.track}>
        {products === null
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`${ROW_ITEM} ${layout === 'auto' && i === 3 ? 'sm:hidden md:block' : ''} ${layout === 'auto' && i === 4 ? 'sm:hidden lg:block' : ''}`}>
                <ProductCardSkeleton />
              </div>
            ))
          : products.map((product) => (
              <div key={product.id} className={ROW_ITEM}>
                <ProductCard
                  product={product}
                  config={settings?.product_card_config}
                  onSelect={onSelectProduct}
                  onQuickBuy={onQuickBuy}
                />
              </div>
            ))}
      </div>
    </section>
  );
};

export const ProductCardSkeleton: React.FC = () => (
  <div className="ds-card-flat overflow-hidden" aria-hidden>
    <div className="ds-skeleton product-frame rounded-none" />
    <div className="p-(--ds-s-3) space-y-(--ds-s-2)">
      <div className="ds-skeleton h-3" />
      <div className="ds-skeleton h-3 w-2/3" />
      <div className="ds-skeleton h-(--ds-h-sm) rounded-(--ds-r-md)" />
    </div>
  </div>
);
