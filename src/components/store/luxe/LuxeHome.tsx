import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Brand, Category, HeroBanner, Product, SiteSettings } from '../../../types/index.ts';
import { luxeHomeOf, type LuxeSectionId, type LuxeSections, type LuxePromoTile } from '../../../lib/luxeTheme.ts';
import { useT } from '../../../lib/i18n.tsx';
import { cachedGet } from '../../../lib/dataCache.ts';
import { responsiveImg } from '../../../lib/img.ts';
import { HomeHero } from '../HomeHero.tsx';
import { ProductCard, type ProductCardStyle } from '../ProductCard.tsx';
import { CategorySection, ProductCardSkeleton } from '../CategorySection.tsx';
import { FlashSaleSection } from '../FlashSaleSection.tsx';
import { HomeBrandsSection } from '../HomeBrandsSection.tsx';
import { ServiceFeatures } from '../ServiceFeatures.tsx';
import { DeferredSection } from '../DeferredSection.tsx';
import { StoreLink } from '../Header.tsx';
import { AccentTitle } from '../glow/GlowParts.tsx';

const ReviewImagesSection = React.lazy(() => import('../ReviewImagesSection.tsx').then((m) => ({ default: m.ReviewImagesSection })));
const BlogSection = React.lazy(() => import('../BlogSection.tsx').then((m) => ({ default: m.BlogSection })));
const HomeContactSection = React.lazy(() => import('../HomeContactSection.tsx').then((m) => ({ default: m.HomeContactSection })));
const TrustSection = React.lazy(() => import('../TrustSection.tsx'));
const FacilitySection = React.lazy(() => import('../FacilitySection.tsx'));
const HomeVideosSection = React.lazy(() => import('../HomeVideosSection.tsx').then((m) => ({ default: m.HomeVideosSection })));

type NavigateFn = (view: string, params?: any) => void;

export interface LuxeHomeProps {
  settings: SiteSettings;
  products: Product[];
  categories: Category[];
  homeCategories: Category[];
  categoryTree?: Category[];
  brands: Brand[];
  banners: HeroBanner[];
  catalogLoading: boolean;
  settingsLoading: boolean;
  onNavigate: NavigateFn;
  onSelectProduct: (product: Product) => void;
  onQuickBuy: () => void;
  onHeroAction: (url?: string) => void;
}

const WRAP = 'max-w-7xl mx-auto px-(--ds-s-4)';
const GRID = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-(--ds-s-3) gap-y-(--ds-s-8) sm:gap-x-(--ds-s-6) sm:gap-y-(--ds-s-10)';

const discountOf = (product: Product) => {
  const price = Number(product.price) || 0;
  const sale = Number(product.salePrice) || 0;
  return sale > 0 && sale < price ? (price - sale) / price : 0;
};

/** Products from the API (cached), or null while loading */
function useProducts(url: string | null): Product[] | null {
  const [items, setItems] = useState<Product[] | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const apply = (data: unknown) => {
      if (!cancelled) setItems(Array.isArray(data) ? (data as Product[]) : []);
    };
    cachedGet(url, { onFresh: apply })
      .then(apply)
      .catch(() => apply([]));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return items;
}

/**
 * v3.15 — the Luxe home page. Sections follow the order set in Dashboard →
 * Website → Themes; a switched-off section, or one with nothing to show, is
 * left out.
 */
export const LuxeHome: React.FC<LuxeHomeProps> = (props) => {
  const { settings } = props;
  const config = useMemo(() => luxeHomeOf(settings), [settings]);
  const s = config.sections;
  const design = config.cardDesign;
  const cardSettings = useMemo(
    () => ({ ...settings, product_card_config: { ...(settings?.product_card_config || {}), cardStyle: design } }) as SiteSettings,
    [settings, design]
  );

  const render = (id: LuxeSectionId): React.ReactNode => {
    if (!(s as any)[id]?.enabled) return null;
    switch (id) {
      case 'hero':
        return s.hero.style === 'editorial' ? (
          <EditorialHero key={id} cfg={s.hero} banners={props.banners} onNavigate={props.onNavigate} />
        ) : (
          <HomeHero
            key={id}
            settings={settings}
            banners={props.banners}
            loading={props.settingsLoading}
            categoryTree={props.categoryTree}
            onNavigate={props.onNavigate}
            onActionClick={props.onHeroAction}
          />
        );
      case 'marquee':
        return <Marquee key={id} cfg={s.marquee} />;
      case 'categories':
        return <CategoryTiles key={id} cfg={s.categories} categories={props.categories} loading={props.catalogLoading} onNavigate={props.onNavigate} />;
      case 'featured':
        return (
          <DeferredSection key={id} minHeight={520}>
            <Featured {...props} cfg={s.featured} design={design} />
          </DeferredSection>
        );
      case 'imageText':
        return (
          <DeferredSection key={id} minHeight={1}>
            <ImageWithText cfg={s.imageText} onNavigate={props.onNavigate} />
          </DeferredSection>
        );
      case 'newArrivals':
        return (
          <DeferredSection key={id} minHeight={1}>
            <NewArrivalsRow {...props} cfg={s.newArrivals} design={design} />
          </DeferredSection>
        );
      case 'promoGrid':
        return (
          <DeferredSection key={id} minHeight={1}>
            <PromoTiles tiles={s.promoGrid.tiles} onNavigate={props.onNavigate} />
          </DeferredSection>
        );
      case 'flashSale':
        return (
          <div key={id} className={`${WRAP} empty:hidden`}>
            <FlashSaleSection
              products={props.products}
              loading={props.catalogLoading}
              config={settings?.flash_sale_config}
              layout="auto"
              cardConfig={cardSettings.product_card_config}
              onSelectProduct={props.onSelectProduct}
              onQuickBuy={props.onQuickBuy}
              onViewAll={() => props.onNavigate('offers')}
            />
          </div>
        );
      case 'categorySections':
        return (
          <React.Fragment key={id}>
            {props.homeCategories.map((cat) => (
              <DeferredSection key={cat.id} minHeight={520}>
                <CategorySection
                  category={cat}
                  settings={cardSettings}
                  catalog={props.products}
                  limit={10}
                  onSelectProduct={props.onSelectProduct}
                  onQuickBuy={props.onQuickBuy}
                  onViewAll={(slug) => props.onNavigate('shop', { category: slug })}
                />
              </DeferredSection>
            ))}
          </React.Fragment>
        );
      case 'allProducts':
        return (
          <DeferredSection key={id} minHeight={1}>
            <AllProducts {...props} cfg={s.allProducts} design={design} />
          </DeferredSection>
        );
      case 'brands':
        return (
          <DeferredSection key={id} minHeight={1}>
            <HomeBrandsSection brands={props.brands} config={settings?.home_brands_config} loading={props.catalogLoading} onNavigate={props.onNavigate} />
          </DeferredSection>
        );
      case 'features':
        return (
          <DeferredSection key={id} minHeight={1}>
            <ServiceFeatures config={settings?.service_features} />
          </DeferredSection>
        );
      case 'trust':
        return (
          <DeferredSection key={id} minHeight={1}>
            <React.Suspense fallback={null}>
              <TrustSection settings={settings} variant="glow" />
            </React.Suspense>
          </DeferredSection>
        );
      case 'facility':
        return (
          <DeferredSection key={id} minHeight={1}>
            <React.Suspense fallback={null}>
              <FacilitySection settings={settings} variant="glow" />
            </React.Suspense>
          </DeferredSection>
        );
      case 'reviews':
        return (
          <DeferredSection key={id} minHeight={1}>
            <React.Suspense fallback={null}>
              <ReviewImagesSection config={settings?.review_images_config} />
            </React.Suspense>
          </DeferredSection>
        );
      case 'blog':
        return (
          <DeferredSection key={id} minHeight={1}>
            <React.Suspense fallback={null}>
              <BlogSection config={settings?.blog_config} onNavigate={props.onNavigate} />
            </React.Suspense>
          </DeferredSection>
        );
      case 'contact':
        return (
          <DeferredSection key={id} minHeight={1}>
            <React.Suspense fallback={null}>
              <HomeContactSection settings={settings} />
            </React.Suspense>
          </DeferredSection>
        );
      case 'videos':
        return (
          <DeferredSection key={id} minHeight={1}>
            <React.Suspense fallback={null}>
              <HomeVideosSection settings={settings} />
            </React.Suspense>
          </DeferredSection>
        );
      default:
        return null;
    }
  };

  // The hero and the band right under it sit edge to edge at the top
  const top: LuxeSectionId[] = [];
  for (const id of config.order) {
    if ((id === 'hero' || id === 'marquee') && top.length === config.order.indexOf(id)) top.push(id);
    else break;
  }
  const rest = config.order.filter((id) => !top.includes(id));
  return (
    <div className="luxe-home pb-(--ds-s-16)">
      {top.map((id) => render(id))}
      <div data-reveal-children className="space-y-(--ds-s-12) sm:space-y-(--ds-s-16) pt-(--ds-s-10) sm:pt-(--ds-s-12)">
        {rest.map((id) => render(id))}
      </div>
    </div>
  );
};

/* --------------------------------------------------------------- headings */

const SectionHead: React.FC<{ eyebrow?: string; title: string; action?: React.ReactNode }> = ({ eyebrow, title, action }) => {
  const t = useT();
  return (
    <div className="text-center mb-(--ds-s-8) sm:mb-(--ds-s-10)">
      {eyebrow && <p className="luxe-eyebrow">{t(eyebrow)}</p>}
      <AccentTitle title={title} className="luxe-title" />
      {action && <div className="mt-(--ds-s-3) flex justify-center">{action}</div>}
    </div>
  );
};

const TextLink: React.FC<{ to: string; label: string; onNavigate: NavigateFn }> = ({ to, label, onNavigate }) => {
  const t = useT();
  if (!label) return null;
  return (
    <StoreLink
      to={to}
      onNavigate={onNavigate}
      className="inline-flex items-center gap-1.5 text-(length:--ds-fs-sm) font-(--ds-fw-semibold) uppercase tracking-[0.12em] text-(--ds-text) underline underline-offset-[6px] decoration-1 hover:decoration-2"
    >
      {t(label)} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
    </StoreLink>
  );
};

const LuxeButton: React.FC<{ to?: string; label?: string; onNavigate: NavigateFn; tone?: 'dark' | 'light' | 'outline-light'; className?: string }> = ({
  to,
  label,
  onNavigate,
  tone = 'dark',
  className = '',
}) => {
  const t = useT();
  if (!label) return null;
  const toneClass =
    tone === 'light'
      ? 'bg-white text-[#111] hover:bg-white/90'
      : tone === 'outline-light'
      ? 'border border-white/80 text-white hover:bg-white hover:text-[#111]'
      : 'bg-(--ds-text) text-(--ds-text-invert) hover:opacity-90';
  return (
    <StoreLink
      to={to || '/shop'}
      onNavigate={onNavigate}
      className={`inline-flex items-center justify-center gap-2 h-12 px-(--ds-s-8) rounded-(--ds-r-full) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) uppercase tracking-[0.12em] transition-[background-color,color,opacity] duration-(--ds-dur) ${toneClass} ${className}`}
    >
      {t(label)}
    </StoreLink>
  );
};

/* ------------------------------------------------------------- hero */

const EditorialHero: React.FC<{ cfg: LuxeSections['hero']; banners: HeroBanner[]; onNavigate: NavigateFn }> = ({ cfg, banners, onNavigate }) => {
  const t = useT();
  // Banner pictures usually carry their own words, so they are not reused
  // here; without a picture the hero is drawn in the brand colour.
  void banners;
  const image = cfg.image;
  const center = cfg.align === 'center';
  return (
    <section className="relative overflow-hidden bg-(--primary) text-white min-h-[460px] sm:min-h-[560px] lg:min-h-[640px] flex">
      {image ? (
        <picture>
          {cfg.mobileImage && <source media="(max-width: 639px)" srcSet={responsiveImg(cfg.mobileImage, '100vw', 800).srcSet} />}
          <img
            {...responsiveImg(image, '100vw', 1600)}
            alt=""
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
        </picture>
      ) : (
        <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,color-mix(in_srgb,var(--glow-accent)_45%,transparent),transparent_55%),linear-gradient(135deg,var(--primary),color-mix(in_srgb,var(--primary)_60%,#000))]" />
      )}
      <span
        aria-hidden
        className={`absolute inset-0 ${center ? 'bg-black/35' : 'bg-[linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.15)_60%,transparent)] rtl:bg-[linear-gradient(270deg,rgba(0,0,0,.55),rgba(0,0,0,.15)_60%,transparent)]'}`}
      />
      <div className={`relative z-[1] w-full ${WRAP} flex items-end sm:items-center py-(--ds-s-12) ${center ? 'justify-center text-center' : ''}`}>
        <div className={`max-w-xl space-y-(--ds-s-4) ${center ? 'mx-auto' : ''}`}>
          {cfg.smallTitle && <p className="text-(length:--ds-fs-sm) font-(--ds-fw-semibold) uppercase tracking-[0.2em] text-white/85">{t(cfg.smallTitle)}</p>}
          <AccentTitle
            title={cfg.title}
            as="h1"
            className="text-[34px] sm:text-[48px] lg:text-[60px] leading-[1.05] font-(--ds-fw-semibold) tracking-[-0.02em] [font-family:var(--font-display)]"
            color="#fff"
            accentClass="italic text-(--glow-accent-on-primary)"
          />
          {cfg.text && <p className="text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) leading-(--ds-lh-normal) text-white/85">{t(cfg.text)}</p>}
          <div className={`flex flex-wrap gap-(--ds-s-3) pt-(--ds-s-2) ${center ? 'justify-center' : ''}`}>
            <LuxeButton to={cfg.link} label={cfg.button} onNavigate={onNavigate} tone="light" />
            <LuxeButton to={cfg.secondLink} label={cfg.secondButton} onNavigate={onNavigate} tone="outline-light" />
          </div>
        </div>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------- marquee */

const Marquee: React.FC<{ cfg: LuxeSections['marquee'] }> = ({ cfg }) => {
  const t = useT();
  if (!cfg.items.length) return null;
  const seconds = Math.max(12, cfg.items.join(' ').length * (cfg.speed === 'slow' ? 0.55 : cfg.speed === 'fast' ? 0.2 : 0.35));
  // Repeated so one copy is always wider than the screen
  const copies = Math.max(2, Math.ceil(12 / cfg.items.length));
  const row = Array.from({ length: copies }).flatMap(() => cfg.items);
  const strip = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {row.map((item, index) => (
        <li key={index} className="flex items-center gap-(--ds-s-6) pe-(--ds-s-6) whitespace-nowrap">
          <span>{t(item)}</span>
          <Sparkles className="w-3.5 h-3.5 text-(--glow-accent-on-primary)" aria-hidden />
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label={t('Announcements')} className="luxe-marquee overflow-hidden bg-(--ds-text) text-(--ds-text-invert) py-(--ds-s-3)">
      <div className="luxe-marquee-track flex w-max text-(length:--ds-fs-sm) font-(--ds-fw-medium) uppercase tracking-[0.14em]" style={{ ['--luxe-marquee-dur' as any]: `${seconds}s` }}>
        {strip(false)}
        {strip(true)}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------- categories */

const CategoryTiles: React.FC<{ cfg: LuxeSections['categories']; categories: Category[]; loading: boolean; onNavigate: NavigateFn }> = ({
  cfg,
  categories,
  loading,
  onNavigate,
}) => {
  const t = useT();
  const shown = categories.slice(0, cfg.limit);
  if (!loading && shown.length === 0) return null;
  const cols = shown.length >= 6 ? 'lg:grid-cols-6' : shown.length === 5 ? 'lg:grid-cols-5' : shown.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3';
  return (
    <section className={WRAP}>
      <SectionHead eyebrow={cfg.smallTitle} title={cfg.title} />
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${cols} gap-(--ds-s-3) sm:gap-(--ds-s-5)`}>
        {loading && shown.length === 0
          ? Array.from({ length: 6 }).map((_, i) => <span key={i} className="block aspect-[4/5] rounded-(--ds-r-lg) bg-(--ds-surface-2) animate-pulse" />)
          : shown.map((category) => (
              <StoreLink
                key={category.id}
                to={`/shop?category=${encodeURIComponent(category.slug)}`}
                onNavigate={onNavigate}
                className="group relative block aspect-[4/5] overflow-hidden rounded-(--ds-r-lg) bg-(--glow-soft)"
              >
                {category.image ? (
                  <img
                    {...responsiveImg(category.image, '(min-width: 1024px) 200px, (min-width: 640px) 33vw, 50vw', 480)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-(--ds-dur-slow) ease-(--ds-ease) group-hover:scale-[1.06]"
                  />
                ) : (
                  <span aria-hidden className="absolute inset-0 glow-placeholder flex items-center justify-center text-[56px] font-(--ds-fw-semibold) text-(--primary) opacity-60 [font-family:var(--font-display)]">
                    {category.name.slice(0, 1)}
                  </span>
                )}
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/65 via-black/15 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-(--ds-s-3) sm:p-(--ds-s-4) text-white">
                  <span className="block ds-clamp-2 text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) font-(--ds-fw-semibold) leading-tight [font-family:var(--font-display)]">{category.name}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-(length:--ds-fs-2xs) font-(--ds-fw-semibold) uppercase tracking-[0.14em] text-white/85">
                    {t('Shop Now')} <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                  </span>
                </span>
              </StoreLink>
            ))}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------- featured */

type FeaturedTab = 'best' | 'new' | 'sale';

const Featured: React.FC<LuxeHomeProps & { cfg: LuxeSections['featured']; design: ProductCardStyle }> = ({
  products,
  catalogLoading,
  settings,
  onNavigate,
  onSelectProduct,
  onQuickBuy,
  cfg,
  design,
}) => {
  const t = useT();
  const [tab, setTab] = useState<FeaturedTab>('best');
  const best = useProducts('/api/products?bestSeller=true&limit=24');
  const fresh = useProducts(cfg.showTabs || tab === 'new' ? `/api/products?newArrival=true&limit=${cfg.limit}` : null);

  const lists = useMemo(() => {
    const rated = [...products].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || Number(b.reviewCount || 0) - Number(a.reviewCount || 0));
    const sale = products.filter((item) => discountOf(item) > 0).sort((a, b) => discountOf(b) - discountOf(a));
    return {
      best: best && best.length ? best : rated,
      new: fresh && fresh.length ? fresh : products,
      sale,
    } as Record<FeaturedTab, Product[]>;
  }, [products, best, fresh]);

  const tabs: Array<[FeaturedTab, string]> = (
    [
      ['best', t('Best Sellers')],
      ['new', t('New Arrivals')],
      ['sale', t('On Sale')],
    ] as Array<[FeaturedTab, string]>
  ).filter(([id]) => lists[id].length > 0);
  const current = cfg.showTabs && lists[tab].length ? tab : 'best';
  const items = lists[current].slice(0, cfg.limit);
  const loading = (best === null && current === 'best') || (catalogLoading && items.length === 0);
  if (!loading && items.length === 0) return null;

  return (
    <section className={WRAP}>
      <SectionHead eyebrow={cfg.smallTitle} title={cfg.title} />
      {cfg.showTabs && tabs.length > 1 && (
        <div role="tablist" className="ds-scroll-hide flex justify-start sm:justify-center gap-(--ds-s-6) overflow-x-auto -mx-(--ds-s-4) px-(--ds-s-4) -mt-(--ds-s-4) mb-(--ds-s-8)">
          {tabs.map(([id, label]) => {
            const on = current === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(id)}
                className={`shrink-0 pb-1.5 border-b-2 text-(length:--ds-fs-md) font-(--ds-fw-semibold) whitespace-nowrap transition-colors cursor-pointer ${
                  on ? 'border-(--ds-text) text-(--ds-text)' : 'border-transparent text-(--ds-text-muted) hover:text-(--ds-text)'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      <div className={GRID}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : items.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                design={design}
                config={settings?.product_card_config}
                onSelect={onSelectProduct}
                onQuickBuy={onQuickBuy}
                priority={index < 2}
              />
            ))}
      </div>
      {cfg.button && (
        <div className="mt-(--ds-s-10) flex justify-center">
          <LuxeButton to={current === 'sale' ? '/offers' : current === 'new' ? '/shop?newArrival=1' : '/shop'} label={cfg.button} onNavigate={onNavigate} />
        </div>
      )}
    </section>
  );
};

/* ------------------------------------------------------------- image with text */

const ImageWithText: React.FC<{ cfg: LuxeSections['imageText']; onNavigate: NavigateFn }> = ({ cfg, onNavigate }) => {
  const t = useT();
  if (!cfg.title && !cfg.text && !cfg.image) return null;
  return (
    <section className={WRAP}>
      <div className="grid items-center gap-(--ds-s-8) md:grid-cols-2 md:gap-(--ds-s-12) lg:gap-(--ds-s-16)">
        <div className={`relative aspect-[4/5] sm:aspect-[5/4] md:aspect-[4/5] overflow-hidden rounded-(--ds-r-xl) ${cfg.imageSide === 'end' ? 'md:order-2' : ''}`}>
          {cfg.image ? (
            <img
              {...responsiveImg(cfg.image, '(min-width: 768px) 50vw, 100vw', 1080)}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <span aria-hidden className="absolute inset-0 glow-placeholder flex items-center justify-center">
              <Sparkles className="w-16 h-16 text-(--glow-accent)" strokeWidth={1.4} />
            </span>
          )}
        </div>
        <div className="max-w-lg">
          {cfg.smallTitle && <p className="luxe-eyebrow">{t(cfg.smallTitle)}</p>}
          <AccentTitle title={cfg.title} className="luxe-title text-start!" accentClass="italic text-(--glow-accent-title)" />
          {cfg.text && <p className="mt-(--ds-s-5) text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) leading-[1.75] text-(--ds-text-soft) whitespace-pre-line">{t(cfg.text)}</p>}
          <LuxeButton to={cfg.link} label={cfg.button} onNavigate={onNavigate} className="mt-(--ds-s-8)" />
        </div>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------- new arrivals row */

const NewArrivalsRow: React.FC<LuxeHomeProps & { cfg: LuxeSections['newArrivals']; design: ProductCardStyle }> = ({
  products,
  catalogLoading,
  settings,
  onNavigate,
  onSelectProduct,
  onQuickBuy,
  cfg,
  design,
}) => {
  const t = useT();
  const flagged = useProducts(`/api/products?newArrival=true&limit=${cfg.limit}`);
  const items = (flagged && flagged.length ? flagged : products).slice(0, cfg.limit);
  const loading = flagged === null || (catalogLoading && items.length === 0);
  const rowRef = useRef<HTMLDivElement>(null);
  if (!loading && items.length === 0) return null;
  const scroll = (direction: 1 | -1) => {
    const row = rowRef.current;
    if (!row) return;
    const rtl = getComputedStyle(row).direction === 'rtl';
    row.scrollBy({ left: direction * (rtl ? -1 : 1) * row.clientWidth * 0.85, behavior: 'smooth' });
  };
  const arrow = 'w-11 h-11 inline-flex items-center justify-center rounded-full border border-(--ds-border) bg-(--ds-surface) text-(--ds-text) hover:bg-(--ds-text) hover:text-(--ds-text-invert) hover:border-(--ds-text) transition-colors cursor-pointer';
  return (
    <section className={WRAP}>
      <div className="flex items-end justify-between gap-(--ds-s-4) mb-(--ds-s-8)">
        <div className="min-w-0">
          {cfg.smallTitle && <p className="luxe-eyebrow text-start!">{t(cfg.smallTitle)}</p>}
          <AccentTitle title={cfg.title} className="luxe-title text-start!" />
        </div>
        <div className="flex items-center gap-(--ds-s-2) shrink-0">
          <span className="hidden sm:inline-flex me-(--ds-s-3)">
            <TextLink to="/shop?newArrival=1" label="View all" onNavigate={onNavigate} />
          </span>
          <button type="button" className={`hidden md:inline-flex ${arrow}`} aria-label={t('Previous')} onClick={() => scroll(-1)}>
            <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
          </button>
          <button type="button" className={`hidden md:inline-flex ${arrow}`} aria-label={t('Next')} onClick={() => scroll(1)}>
            <ChevronRight className="w-5 h-5 rtl:rotate-180" />
          </button>
        </div>
      </div>
      <div ref={rowRef} className="ds-scroll-hide flex gap-(--ds-s-3) sm:gap-(--ds-s-6) overflow-x-auto snap-x snap-mandatory -mx-(--ds-s-4) px-(--ds-s-4) scroll-px-(--ds-s-4) pb-(--ds-s-2)">
        {(loading ? Array.from({ length: 5 }) : items).map((product: any, index) => (
          <div key={loading ? index : product.id} className="snap-start shrink-0 w-[46%] sm:w-[31%] lg:w-[23%] xl:w-[19%]">
            {loading ? (
              <ProductCardSkeleton />
            ) : (
              <ProductCard product={product} design={design} config={settings?.product_card_config} onSelect={onSelectProduct} onQuickBuy={onQuickBuy} />
            )}
          </div>
        ))}
      </div>
      <div className="sm:hidden mt-(--ds-s-6) flex justify-center">
        <TextLink to="/shop?newArrival=1" label="View all" onNavigate={onNavigate} />
      </div>
    </section>
  );
};

/* ------------------------------------------------------------- promo tiles */

const PromoTiles: React.FC<{ tiles: LuxePromoTile[]; onNavigate: NavigateFn }> = ({ tiles, onNavigate }) => {
  const t = useT();
  const shown = tiles.filter((tile) => tile.title || tile.image);
  if (!shown.length) return null;
  return (
    <section className={WRAP}>
      <div className={`grid gap-(--ds-s-4) sm:gap-(--ds-s-6) ${shown.length > 1 ? 'md:grid-cols-2' : ''} ${shown.length > 2 ? 'lg:grid-cols-3' : ''}`}>
        {shown.map((tile, index) => (
          <StoreLink
            key={index}
            to={tile.link || '/shop'}
            onNavigate={onNavigate}
            className="group relative block overflow-hidden rounded-(--ds-r-xl) aspect-[4/3] sm:aspect-[16/10] bg-(--primary)"
          >
            {tile.image ? (
              <img
                {...responsiveImg(tile.image, shown.length > 1 ? '(min-width: 768px) 50vw, 100vw' : '100vw', 1080)}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.2s] ease-(--ds-ease) group-hover:scale-[1.05]"
              />
            ) : (
              <span
                aria-hidden
                className={`absolute inset-0 ${
                  index % 2
                    ? 'bg-[radial-gradient(circle_at_85%_15%,color-mix(in_srgb,var(--glow-accent)_55%,transparent),transparent_55%),linear-gradient(135deg,color-mix(in_srgb,var(--primary)_80%,#000),var(--primary))]'
                    : 'bg-[radial-gradient(circle_at_15%_85%,color-mix(in_srgb,var(--glow-accent)_45%,transparent),transparent_55%),linear-gradient(135deg,var(--primary),color-mix(in_srgb,var(--primary)_65%,#000))]'
                }`}
              />
            )}
            <span aria-hidden className="absolute inset-0 bg-linear-to-t from-black/60 via-black/10 to-transparent" />
            <span className="absolute inset-x-0 bottom-0 p-(--ds-s-6) sm:p-(--ds-s-8) text-white">
              {tile.smallTitle && <span className="block text-(length:--ds-fs-xs) font-(--ds-fw-semibold) uppercase tracking-[0.2em] text-white/85">{t(tile.smallTitle)}</span>}
              {tile.title && (
                <span className="mt-1 block text-[24px] sm:text-[32px] leading-[1.1] font-(--ds-fw-semibold) [font-family:var(--font-display)]">{t(tile.title)}</span>
              )}
              {tile.button && (
                <span className="mt-(--ds-s-4) inline-flex items-center gap-1.5 text-(length:--ds-fs-sm) font-(--ds-fw-semibold) uppercase tracking-[0.12em] underline underline-offset-[6px]">
                  {t(tile.button)} <ArrowRight className="w-4 h-4 rtl:rotate-180 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                </span>
              )}
            </span>
          </StoreLink>
        ))}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------- all products */

const AllProducts: React.FC<LuxeHomeProps & { cfg: LuxeSections['allProducts']; design: ProductCardStyle }> = ({
  products,
  catalogLoading,
  settings,
  onNavigate,
  onSelectProduct,
  onQuickBuy,
  cfg,
  design,
}) => {
  if (!catalogLoading && products.length === 0) return null;
  return (
    <section className={WRAP}>
      <SectionHead title={cfg.title} action={<TextLink to="/shop" label="View all" onNavigate={onNavigate} />} />
      <div className={`${GRID} xl:grid-cols-5`}>
        {catalogLoading && products.length === 0
          ? Array.from({ length: 5 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : products.slice(0, cfg.limit).map((product) => (
              <ProductCard key={product.id} product={product} design={design} config={settings?.product_card_config} onSelect={onSelectProduct} onQuickBuy={onQuickBuy} />
            ))}
      </div>
    </section>
  );
};
