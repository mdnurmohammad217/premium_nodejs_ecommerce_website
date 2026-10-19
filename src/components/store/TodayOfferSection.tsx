import React from 'react';
import { ArrowRight, Tag } from 'lucide-react';
import { Product, SiteSettings } from '../../types/index.ts';
import { ProductCard } from './ProductCard.tsx';
import { RAIL_ITEM, RAIL_TRACK, RailArrows, useRail } from './ProductRail.tsx';
import { ProductCardSkeleton } from './CategorySection.tsx';

interface TodayOfferSectionProps {
  products: Product[];
  settings?: SiteSettings;
  onSelectProduct: (product: Product) => void;
  onViewAllOffers: () => void;
  onQuickBuy?: (product: Product) => void;
  /** Catalogue still loading — show placeholder cards */
  loading?: boolean;
}

const ROW_ITEM = RAIL_ITEM;

const isDiscounted = (p: Product) =>
  Boolean(p.isFlashSale) || (Number(p.salePrice) > 0 && Number(p.salePrice) < Number(p.price));

/**
 * "Today's offers": the products the owner picked in Dashboard → Offers, or
 * failing that every product that genuinely carries a discount. With neither
 * there is no section — no invented percentages.
 */
export const TodayOfferSection: React.FC<TodayOfferSectionProps> = ({
  products = [],
  settings,
  onSelectProduct,
  onViewAllOffers,
  onQuickBuy,
  loading = false,
}) => {
  const offersConfig = settings?.offers_config;
  if (offersConfig && offersConfig.isEnabled === false) return null;

  const selectedIds = offersConfig?.selectedProductIds || [];
  const picked = selectedIds.length > 0 ? products.filter((p) => selectedIds.includes(p.id)) : [];
  const offerProducts = (picked.length > 0 ? picked : products.filter(isDiscounted)).slice(0, 10);

  const rail = useRail(offerProducts.length);
  if (!loading && offerProducts.length === 0) return null;

  const heading = offersConfig?.heading || "Today's Offers";

  return (
    <section className="max-w-7xl mx-auto px-(--ds-s-4)">
      <div className="flex items-center justify-between gap-(--ds-s-3) mb-(--ds-s-4)">
        <div className="flex items-center gap-(--ds-s-2) min-w-0">
          <span className="w-9 h-9 shrink-0 rounded-(--ds-r-md) bg-(--ds-rose-soft) text-(--ds-rose) inline-flex items-center justify-center">
            <Tag className="w-4 h-4" />
          </span>
          <h2 className="truncate text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">{heading}</h2>
          {offersConfig?.badgeText && (
            <span className="hidden sm:inline-flex ds-badge ds-badge-danger">{offersConfig.badgeText}</span>
          )}
        </div>

        <div className="flex items-center gap-(--ds-s-2) shrink-0">
        <RailArrows edges={rail.edges} step={rail.step} label="offers" />
        <a
          href="/offers"
          onClick={(e) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            onViewAllOffers();
          }}
          className="group shrink-0 inline-flex items-center gap-(--ds-s-1) h-(--ds-h-sm) px-(--ds-s-3) rounded-(--ds-r-full) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] transition-colors"
        >
          <span className="sm:hidden">View All</span>
          <span className="hidden sm:inline">View All Offers</span>
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </a>
        </div>
      </div>

      <div ref={rail.ref} className={RAIL_TRACK}>
        {loading && offerProducts.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`${ROW_ITEM} ${i === 3 ? 'sm:hidden md:block' : ''} ${i === 4 ? 'sm:hidden lg:block' : ''}`}>
                <ProductCardSkeleton />
              </div>
            ))
          : offerProducts.map((product) => (
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
