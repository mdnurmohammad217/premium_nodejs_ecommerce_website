import React from 'react';
import { responsiveImg, sized } from '../../lib/img.ts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Brand, HomeBrandsConfig } from '../../types/index.ts';
import { StoreLink } from './Header.tsx';

interface HomeBrandsSectionProps {
  brands: Brand[];
  config?: HomeBrandsConfig;
  loading?: boolean;
  onNavigate: (view: string, params?: any) => void;
}

const TILE_BASIS =
  'shrink-0 snap-start basis-[calc((100%-2*var(--ds-s-3))/2.6)] sm:basis-[calc((100%-3*var(--ds-s-3))/4)] md:basis-[calc((100%-4*var(--ds-s-4))/5)] lg:basis-[calc((100%-5*var(--ds-s-4))/6)]';

/**
 * "Shop by brand" on the home page, under All Products. Switched on/off and
 * titled from Dashboard → Products → Brands. Every logo sits in the same
 * fixed frame (object-contain), so wide, tall and square logos all look
 * even, and each tile opens that brand's products.
 */
export const HomeBrandsSection: React.FC<HomeBrandsSectionProps> = ({ brands, config, loading, onNavigate }) => {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: true, end: false });

  // Brands with something to buy first; hide empty ones unless all are empty
  const list = React.useMemo(() => {
    const all = Array.isArray(brands) ? brands : [];
    const stocked = all.filter((brand) => (brand.productCount ?? 1) > 0);
    return stocked.length > 0 ? stocked : all;
  }, [brands]);

  const updateEdges = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // v3.14 — scrollLeft runs 0 → negative on a right-to-left page (Arabic)
    const pos = Math.abs(el.scrollLeft);
    setEdges({ start: pos <= 4, end: pos + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  React.useEffect(() => {
    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, [updateEdges, list.length]);

  if (config?.enabled === false) return null;
  if (!loading && list.length === 0) return null;

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy({ left: direction * (rtl ? -1 : 1) * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const showNames = config?.showNames !== false;
  const title = (config?.title || '').trim() || 'Shop by Brand';

  return (
    <section className="max-w-7xl mx-auto px-(--ds-s-4)" aria-label={title}>
      <div className="flex items-end justify-between gap-(--ds-s-3) mb-(--ds-s-4)">
        <h2 className="text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">{title}</h2>
        {list.length > 4 && (
          <div className="hidden sm:flex items-center gap-(--ds-s-1)">
            <button
              type="button"
              aria-label="Previous brands"
              disabled={edges.start}
              onClick={() => scrollBy(-1)}
              className="ds-btn ds-btn-secondary ds-btn-icon ds-btn-sm rounded-(--ds-r-full)"
            >
              <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
            </button>
            <button
              type="button"
              aria-label="Next brands"
              disabled={edges.end}
              onClick={() => scrollBy(1)}
              className="ds-btn ds-btn-secondary ds-btn-icon ds-btn-sm rounded-(--ds-r-full)"
            >
              <ChevronRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>
        )}
      </div>

      <div
        ref={scrollerRef}
        onScroll={updateEdges}
        className="ds-scroll-hide flex gap-(--ds-s-3) md:gap-(--ds-s-4) overflow-x-auto scroll-smooth snap-x snap-mandatory py-(--ds-s-1)"
      >
        {loading && list.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={TILE_BASIS}>
                <div className="ds-skeleton h-28 w-full rounded-(--ds-r-xl)" />
              </div>
            ))
          : list.map((brand) => (
              <BrandTile key={brand.id} brand={brand} showName={showNames} onNavigate={onNavigate} />
            ))}
      </div>
    </section>
  );
};

const BrandTile: React.FC<{
  brand: Brand;
  showName: boolean;
  onNavigate: (view: string, params?: any) => void;
}> = ({ brand, showName, onNavigate }) => {
  const [broken, setBroken] = React.useState(false);
  const hasLogo = Boolean(brand.logo) && !broken;

  return (
    <StoreLink
      to={{ view: 'shop', params: { brand: brand.slug || String(brand.id) } }}
      onNavigate={onNavigate}
      title={`${brand.name} products`}
      className={`${TILE_BASIS} group/brand flex flex-col items-center justify-center gap-(--ds-s-2) h-28 sm:h-32 px-(--ds-s-4) rounded-(--ds-r-xl) border border-(--ds-border) bg-(--ds-surface) transition-[border-color,box-shadow,transform] duration-(--ds-dur) hover:-translate-y-0.5 hover:border-(--primary) hover:shadow-(--ds-shadow-md)`}
    >
      {/* Fixed logo frame: every logo scales into the same box */}
      <span className="w-full h-12 sm:h-14 flex items-center justify-center">
        {hasLogo ? (
          <img
            src={sized(brand.logo as string, 320)}
            alt={brand.name}
            loading="lazy"
            onError={() => setBroken(true)}
            className="max-h-full max-w-[85%] w-auto object-contain grayscale-[35%] group-hover/brand:grayscale-0 transition-[filter] duration-(--ds-dur)"
          />
        ) : (
          <span className="w-12 h-12 rounded-(--ds-r-full) bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-(--primary) inline-flex items-center justify-center text-(length:--ds-fs-xl) font-(--ds-fw-black)">
            {brand.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      {(showName || !hasLogo) && (
        <span className="max-w-full truncate text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text-soft) group-hover/brand:text-(--primary)">
          {brand.name}
        </span>
      )}
    </StoreLink>
  );
};
