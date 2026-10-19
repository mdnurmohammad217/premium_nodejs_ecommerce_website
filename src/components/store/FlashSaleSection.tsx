import React, { useState, useEffect, useMemo } from 'react';
import { Zap, Clock, ArrowRight } from 'lucide-react';
import { Product, FlashSaleConfig, ProductCardConfig } from '../../types/index.ts';
import { ProductCard } from './ProductCard.tsx';
import { RailArrows, railLayout, useRail, type SectionLayout } from './ProductRail.tsx';
import { ProductCardSkeleton } from './CategorySection.tsx';
import { cachedGet } from '../../lib/dataCache.ts';

interface FlashSaleSectionProps {
  products?: Product[];
  config?: FlashSaleConfig;
  cardConfig?: ProductCardConfig;
  onViewDetails?: (p: Product) => void;
  onSelectProduct?: (p: Product) => void;
  onQuickBuy?: (p: Product) => void;
  onViewAll?: () => void;
  /** Catalogue still loading — show placeholder cards */
  loading?: boolean;
  /** Grid or slide (Dashboard → Website → Home Sections) */
  layout?: SectionLayout;
}

/**
 * Today's Flash Sale strip. Worded and switched on/off from
 * Dashboard → Website → Hero Slider. Only real discounts appear, and the
 * countdown is shown only when the owner has set a duration.
 */
export const FlashSaleSection: React.FC<FlashSaleSectionProps> = ({
  products,
  config,
  cardConfig,
  onViewDetails,
  onSelectProduct,
  onQuickBuy,
  onViewAll,
  loading = false,
  layout = 'auto',
}) => {
  const look = railLayout(layout as SectionLayout);
  const ROW_ITEM = look.item;
  const hours = Number(config?.countdownHours) > 0 ? Number(config?.countdownHours) : 0;
  const [secondsLeft, setSecondsLeft] = useState(hours * 3600);

  useEffect(() => {
    setSecondsLeft(hours * 3600);
    if (!hours) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => (current <= 1 ? hours * 3600 : current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hours]);

  const clock = useMemo(() => {
    const h = Math.floor(secondsLeft / 3600);
    const m = Math.floor((secondsLeft % 3600) / 60);
    const s = secondsLeft % 60;
    return [h, m, s].map((value) => String(value).padStart(2, '0'));
  }, [secondsLeft]);

  // v3.14 — ask the server for discounted products, so older discounted
  // items appear too (the storefront keeps only the newest 100 in memory)
  const max = Math.max(1, Math.min(100, Number(config?.maxProducts) || 8));
  const [fromServer, setFromServer] = useState<Product[] | null>(null);
  useEffect(() => {
    if (config?.isEnabled === false) return;
    let alive = true;
    const apply = (data: unknown) => alive && Array.isArray(data) && setFromServer(data as Product[]);
    cachedGet(`/api/products?onSale=true&limit=${max}`, { onFresh: apply })
      .then(apply)
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [max, config?.isEnabled]);

  const displayList = useMemo(() => {
    if (fromServer && fromServer.length > 0) return fromServer.slice(0, max);
    const list = (Array.isArray(products) ? products : []).filter(
      (item) => item.isFlashSale || (Number(item.salePrice) > 0 && Number(item.salePrice) < Number(item.price))
    );
    return list.slice(0, Math.max(1, Number(config?.maxProducts) || 8));
  }, [products, config?.maxProducts, fromServer, max]);

  const rail = useRail(displayList.length);
  if (config?.isEnabled === false) return null;
  if (!loading && displayList.length === 0) return null;

  const heading = config?.heading || 'Flash Sale';

  return (
    <section className="rounded-(--ds-r-2xl) border border-(--ds-border) bg-[linear-gradient(135deg,var(--ds-amber-soft),var(--ds-surface)_45%,var(--ds-surface))] shadow-(--ds-shadow-sm) p-(--ds-s-4) sm:p-(--ds-s-6)">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-(--ds-s-3) mb-(--ds-s-4)">
        <div className="flex items-center gap-(--ds-s-3) min-w-0">
          <span className="w-11 h-11 shrink-0 rounded-(--ds-r-md) bg-(--ds-amber) text-(--ds-text-invert) inline-flex items-center justify-center shadow-(--ds-shadow-sm)">
            <Zap className="w-5 h-5 fill-current" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-(--ds-s-2) flex-wrap">
              <h2 className="text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">{heading}</h2>
              {config?.badgeText && <span className="ds-badge ds-badge-warning">{config.badgeText}</span>}
            </div>
            {config?.subheading && (
              <p className="mt-0.5 text-(length:--ds-fs-base) text-(--ds-text-soft)">{config.subheading}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-(--ds-s-3) shrink-0">
          <RailArrows edges={rail.edges} step={rail.step} label="flash sale products" layout={layout} />
          {hours > 0 && (
            <div className="flex items-center gap-(--ds-s-2) h-(--ds-h-md) px-(--ds-s-3) rounded-(--ds-r-md) bg-(--ds-surface) border border-(--ds-border)">
              <Clock className="w-4 h-4 text-(--ds-warning-text)" />
              <span className="hidden sm:inline text-(length:--ds-fs-sm) text-(--ds-text-soft)">Ends in</span>
              <div className="flex items-center gap-0.5 text-(length:--ds-fs-sm) font-(--ds-fw-bold) text-(--ds-text)" aria-label="Time remaining">
                {clock.map((part, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <span className="text-(--ds-text-muted)">:</span>}
                    <span className="ds-num min-w-7 text-center px-1 py-0.5 rounded-(--ds-r-xs) bg-(--ds-gray-900) text-(--ds-text-invert)">
                      {part}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
          {onViewAll && (
            <a
              href="/offers"
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                onViewAll();
              }}
              className="hidden sm:inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-warning-text) hover:underline"
            >
              <span>View All</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      <div ref={rail.ref} className={look.track}>
        {loading && displayList.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`${ROW_ITEM} ${layout === 'auto' && i === 3 ? 'sm:hidden md:block' : ''} ${layout === 'auto' && i === 4 ? 'sm:hidden lg:block' : ''}`}>
                <ProductCardSkeleton />
              </div>
            ))
          : displayList.map((product) => (
              <div key={product.id} className={ROW_ITEM}>
                <ProductCard
                  product={product}
                  config={cardConfig}
                  onViewDetails={onViewDetails}
                  onSelect={onSelectProduct || onViewDetails}
                  onQuickBuy={onQuickBuy}
                />
              </div>
            ))}
      </div>

      {onViewAll && (
        <a
          href="/offers"
          onClick={(e) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            onViewAll();
          }}
          className="sm:hidden mt-(--ds-s-4) ds-btn ds-btn-secondary ds-btn-block"
        >
          <span>View All Flash Sale Products</span>
          <ArrowRight className="w-4 h-4" />
        </a>
      )}
    </section>
  );
};
