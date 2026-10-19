import React, { useEffect, useMemo, useState } from 'react';
import { cachedGet } from '../../lib/dataCache.ts';
import { Tag, ArrowRight } from 'lucide-react';
import { Product, SiteSettings } from '../../types/index.ts';
import { ProductCard } from './ProductCard.tsx';
import { StoreLink } from './Header.tsx';

interface OffersViewProps {
  products: Product[];
  settings?: SiteSettings;
  onSelectProduct: (product: Product) => void;
  onNavigate: (view: string, param?: any) => void;
  onQuickBuy?: (product: Product) => void;
}

const discountOf = (p: Product) => {
  const regular = Number(p.price) || 0;
  const sale = p.salePrice ? Number(p.salePrice) : 0;
  return regular > 0 && sale > 0 && sale < regular ? Math.round(((regular - sale) / regular) * 100) : 0;
};

const SORTS = [
  { value: 'discount', label: 'Biggest Discount First' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
];

export const OffersView: React.FC<OffersViewProps> = ({
  products,
  settings,
  onSelectProduct,
  onNavigate,
  onQuickBuy,
}) => {
  const [sortBy, setSortBy] = useState('discount');

  // v3.14 — every discounted product from the server (up to 2,000), not only
  // those among the newest 100 the storefront keeps in memory
  const [allOnSale, setAllOnSale] = useState<Product[] | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const found: Product[] = [];
      for (let offset = 0; offset < 2000; offset += 100) {
        const page = await cachedGet(`/api/products?onSale=true&limit=100&offset=${offset}`).catch(() => null);
        if (!Array.isArray(page)) return;
        found.push(...(page as Product[]));
        if (page.length < 100) break;
      }
      if (alive) setAllOnSale(found);
    })();
    return () => {
      alive = false;
    };
  }, []);
  const source = allOnSale ?? products;

  // Only products that are actually cheaper than their regular price
  const offers = useMemo(() => {
    const priceOf = (p: Product) => Number(p.salePrice || p.price) || 0;
    return source
      .filter((p) => discountOf(p) > 0)
      .sort((a, b) => {
        if (sortBy === 'price-low') return priceOf(a) - priceOf(b);
        if (sortBy === 'price-high') return priceOf(b) - priceOf(a);
        return discountOf(b) - discountOf(a);
      });
  }, [source, sortBy]);

  const heading = settings?.offers_config?.heading?.trim() || 'Offers';

  return (
    <div className="max-w-(--ds-page-max) mx-auto px-(--ds-gutter) py-(--ds-s-6) sm:py-(--ds-s-8) space-y-(--ds-s-5)">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-(--ds-s-3) pb-(--ds-s-4) border-b border-(--ds-border)">
        <div className="flex items-center gap-(--ds-s-3) min-w-0">
          <span className="shrink-0 w-11 h-11 rounded-(--ds-r-md) bg-(--ds-danger-soft) text-(--ds-danger-text) flex items-center justify-center">
            <Tag className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text) truncate">{heading}</h1>
            <p className="text-(length:--ds-fs-base) text-(--ds-text-muted)">
              <span className="ds-num font-(--ds-fw-semibold) text-(--ds-text-soft)">{offers.length}</span> discounted {offers.length === 1 ? 'product' : 'products'}
            </p>
          </div>
        </div>
        {offers.length > 1 && (
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="ds-select h-(--ds-h-md) sm:w-52"
            aria-label="Sort by"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </header>

      {offers.length === 0 ? (
        <div className="ds-card-flat px-(--ds-s-6) py-(--ds-s-16) text-center">
          <div className="w-14 h-14 mx-auto mb-(--ds-s-4) rounded-(--ds-r-full) bg-(--ds-surface-3) text-(--ds-text-muted) flex items-center justify-center">
            <Tag className="w-6 h-6" />
          </div>
          <h3 className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">
            No active offers right now
          </h3>
          <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-muted)">Take a look at our regular products in the meantime.</p>
          <StoreLink
            to={{ view: 'shop', params: {} }}
            onNavigate={onNavigate}
            className="ds-btn ds-btn-primary mt-(--ds-s-5)"
          >
            View All Products
            <ArrowRight className="w-4 h-4" />
          </StoreLink>
        </div>
      ) : (
        <div data-reveal-stagger className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-(--ds-s-2) min-[480px]:gap-(--ds-s-3) md:gap-(--ds-s-4)">
          {offers.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              config={settings?.product_card_config}
              onSelect={onSelectProduct}
              onQuickBuy={onQuickBuy}
            />
          ))}
        </div>
      )}
    </div>
  );
};
