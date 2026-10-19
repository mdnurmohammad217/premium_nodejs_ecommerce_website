import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Minus, Plus, MessagesSquare, Star, Sparkles } from 'lucide-react';
import { Brand, Category, HeroBanner, Product, SiteSettings } from '../../../types/index.ts';
import { glowHomeOf, type GlowSectionId, type PromoCard } from '../../../lib/glowTheme.ts';
import { useT } from '../../../lib/i18n.tsx';
import { cachedGet } from '../../../lib/dataCache.ts';
import { responsiveImg } from '../../../lib/img.ts';
import { HomeHero } from '../HomeHero.tsx';
import { heroLayoutOf } from '../../../lib/homeExtras.ts';
import { CategoryGrid } from '../CategoryGrid.tsx';
import { ProductCard } from '../ProductCard.tsx';
import { CategorySection, ProductCardSkeleton } from '../CategorySection.tsx';
import { FlashSaleSection } from '../FlashSaleSection.tsx';
import { HomeBrandsSection } from '../HomeBrandsSection.tsx';
import { ServiceFeatures } from '../ServiceFeatures.tsx';
import { DeferredSection } from '../DeferredSection.tsx';
import { StoreLink, routeToPath, isPlainClick } from '../Header.tsx';
import type { HomeSectionsConfig } from '../ProductRail.tsx';
import { AccentTitle, CountdownBoxes, Eyebrow, GlowButton, GlowPicture, countdownEnd } from './GlowParts.tsx';

const ReviewImagesSection = React.lazy(() => import('../ReviewImagesSection.tsx').then((m) => ({ default: m.ReviewImagesSection })));
const BlogSection = React.lazy(() => import('../BlogSection.tsx').then((m) => ({ default: m.BlogSection })));
const HomeContactSection = React.lazy(() => import('../HomeContactSection.tsx').then((m) => ({ default: m.HomeContactSection })));
const TrustSection = React.lazy(() => import('../TrustSection.tsx'));
const FacilitySection = React.lazy(() => import('../FacilitySection.tsx'));
const HomeVideosSection = React.lazy(() => import('../HomeVideosSection.tsx').then((m) => ({ default: m.HomeVideosSection })));

type NavigateFn = (view: string, params?: any) => void;

export interface GlowHomeProps {
  settings: SiteSettings;
  products: Product[];
  categories: Category[];
  homeCategories: Category[];
  /** Main categories with their sub-categories (split hero) */
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
const GRID = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-(--ds-s-3) gap-y-(--ds-s-6) sm:gap-x-(--ds-s-5) sm:gap-y-(--ds-s-8)';

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
 * v3.13 — the Glow home page (Dashboard → Website → Themes → Home page: Glow).
 * Sections appear in the order set in the dashboard, and each one can be
 * switched off there; a section with nothing to show hides by itself.
 */
export const GlowHome: React.FC<GlowHomeProps> = (props) => {
  const { settings } = props;
  const config = useMemo(() => glowHomeOf(settings), [settings]);
  const s = config.sections;
  const countdownEndsAt = useMemo(() => countdownEnd(s.countdown.endsAt), [s.countdown.endsAt]);

  const render = (id: GlowSectionId): React.ReactNode => {
    if (!(s as any)[id]?.enabled) return null;
    switch (id) {
      case 'hero':
        return (
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
      case 'categories':
        return <GlowCategories key={id} {...props} title={s.categories.title} />;
      case 'promo':
        return <PromoCards key={id} cards={s.promo.cards} onNavigate={props.onNavigate} />;
      case 'bestSellers':
        return (
          <DeferredSection key={id} minHeight={520}>
            <BestSellers {...props} cfg={s.bestSellers} countdownTo={countdownEndsAt} />
          </DeferredSection>
        );
      case 'countdown':
        return (
          <DeferredSection key={id} minHeight={320}>
            <CountdownOffer cfg={s.countdown} end={countdownEndsAt} onNavigate={props.onNavigate} />
          </DeferredSection>
        );
      case 'deals':
        return (
          <DeferredSection key={id} minHeight={1}>
            <DealsOfDay {...props} cfg={s.deals} />
          </DeferredSection>
        );
      case 'weekly':
        return (
          <DeferredSection key={id} minHeight={1}>
            <WideBanner cfg={s.weekly} onNavigate={props.onNavigate} />
          </DeferredSection>
        );
      case 'newArrivals':
        return (
          <DeferredSection key={id} minHeight={1}>
            <NewArrivals {...props} cfg={s.newArrivals} />
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
              cardConfig={{ ...(settings?.product_card_config || {}), cardStyle: 'glow' } as any}
              onSelectProduct={props.onSelectProduct}
              onQuickBuy={props.onQuickBuy}
              onViewAll={() => props.onNavigate('offers')}
            />
          </div>
        );
      case 'allProducts':
        return (
          <DeferredSection key={id} minHeight={1}>
            <AllProducts {...props} cfg={s.allProducts} />
          </DeferredSection>
        );
      case 'categorySections': {
        const glowSettings = { ...settings, product_card_config: { ...(settings?.product_card_config || {}), cardStyle: 'glow' } } as SiteSettings;
        return (
          <React.Fragment key={id}>
            {props.homeCategories.map((cat) => (
              <DeferredSection key={cat.id} minHeight={520}>
                <CategorySection
                  category={cat}
                  settings={glowSettings}
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
      }
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
      case 'faq':
        return (
          <DeferredSection key={id} minHeight={1}>
            <Faq cfg={s.faq} onNavigate={props.onNavigate} />
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

  const heroFirst = config.order[0] === 'hero' && s.hero.enabled && heroLayoutOf(settings).enabled;
  return (
    <div className="glow-home pb-(--ds-s-12)">
      {heroFirst && render('hero')}
      <div data-reveal-children className={`space-y-(--ds-s-12) sm:space-y-(--ds-s-16) ${heroFirst ? 'pt-(--ds-s-8) sm:pt-(--ds-s-12)' : 'pt-(--ds-s-6)'}`}>
        {config.order.filter((id) => !(heroFirst && id === 'hero')).map((id) => render(id))}
      </div>
    </div>
  );
};

/* --------------------------------------------------------------- headings */

const SectionHead: React.FC<{
  eyebrow?: string;
  title: string;
  align?: 'start' | 'center';
  action?: React.ReactNode;
  text?: string;
}> = ({ eyebrow, title, align = 'start', action, text }) => {
  const t = useT();
  if (align === 'center') {
    return (
      <div className="text-center mb-(--ds-s-6) sm:mb-(--ds-s-8)">
        <Eyebrow text={eyebrow} />
        <AccentTitle title={title} className="glow-title" />
        {text && <p className="mt-(--ds-s-3) mx-auto max-w-2xl text-(length:--ds-fs-md) text-(--ds-text-soft)">{t(text)}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-(--ds-s-3) sm:gap-(--ds-s-6) mb-(--ds-s-5) sm:mb-(--ds-s-8)">
      <div className="min-w-0">
        <Eyebrow text={eyebrow} />
        <AccentTitle title={title} className="glow-title" />
      </div>
      {text ? <p className="sm:max-w-md text-(length:--ds-fs-md) leading-(--ds-lh-normal) text-(--ds-text-soft)">{t(text)}</p> : action}
    </div>
  );
};

/* ------------------------------------------------------------- categories */

const GlowCategories: React.FC<GlowHomeProps & { title: string }> = ({ settings, categories, catalogLoading, onNavigate, title }) => {
  const home = (settings as any)?.home_sections_config as HomeSectionsConfig | undefined;
  return (
    <CategoryGrid
      categories={categories}
      loading={catalogLoading}
      heading={<AccentTitle title={title} className="glow-title" />}
      autoSlide={home?.categoryAutoSlide !== false}
      slideSeconds={home?.categorySlideSeconds}
      layout={home?.categoryLayout === 'grid' ? 'grid' : 'slide'}
      gridColumnsMobile={home?.categoryGridMobile}
      gridColumnsDesktop={home?.categoryGridDesktop}
      design={home?.categoryDesign || 'circle'}
      onSelectCategory={(slug) => onNavigate('shop', slug ? { category: slug } : {})}
    />
  );
};

/* ------------------------------------------------------------ promo cards */

const PromoCards: React.FC<{ cards: PromoCard[]; onNavigate: NavigateFn }> = ({ cards, onNavigate }) => {
  const t = useT();
  const shown = cards.filter((card) => card.title || card.badge || card.image);
  if (!shown.length) return null;
  return (
    <section className={WRAP}>
      <div className={`grid gap-(--ds-s-4) sm:gap-(--ds-s-6) ${shown.length > 1 ? 'md:grid-cols-2' : ''} ${shown.length > 2 ? 'lg:grid-cols-3' : ''}`}>
        {shown.map((card, index) => {
          const dark = card.tone === 'dark';
          return (
            <article
              key={index}
              className={`group relative overflow-hidden rounded-[24px] min-h-[230px] sm:min-h-[270px] flex ${
                dark ? 'bg-(--primary) text-(--primary-foreground)' : 'bg-(--glow-soft) text-(--ds-text)'
              }`}
            >
              {card.image ? (
                <img
                  {...responsiveImg(card.image, '(min-width: 768px) 320px, 50vw', 640)}
                  alt=""
                  loading="lazy"
                  className="absolute bottom-0 end-0 h-full w-[46%] object-cover object-top transition-transform duration-(--ds-dur-slow) group-hover:scale-[1.03]"
                />
              ) : (
                <span aria-hidden className={`absolute -bottom-10 -end-10 w-56 h-56 rounded-full ${dark ? 'bg-white/10' : 'bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]'}`}>
                  <Sparkles className={`absolute top-14 start-14 w-12 h-12 ${dark ? 'text-(--glow-accent-on-primary)' : 'text-(--glow-accent)'}`} />
                </span>
              )}
              <div className="relative z-[1] flex flex-col items-start justify-center gap-(--ds-s-3) p-(--ds-s-5) sm:p-(--ds-s-8) w-[62%] sm:w-[58%]">
                {card.badge && (
                  <span
                    className={`inline-flex items-center h-8 sm:h-10 px-(--ds-s-3) sm:px-(--ds-s-4) rounded-full text-(length:--ds-fs-sm) sm:text-(length:--ds-fs-lg) font-(--ds-fw-medium) ${
                      dark ? 'bg-white/14 text-white' : 'bg-(--glow-accent-strong) text-(--glow-accent-fg)'
                    }`}
                  >
                    {t(card.badge)}
                  </span>
                )}
                {card.title && (
                  <AccentTitle
                    title={card.title}
                    as="h3"
                    className="text-[22px] sm:text-[32px] lg:text-[38px] font-(--ds-fw-bold) leading-[1.15] tracking-[-0.01em]"
                    color={dark ? 'var(--primary-foreground)' : undefined}
                    accentClass={dark ? 'text-(--glow-accent-on-primary)' : 'text-(--glow-accent-title)'}
                  />
                )}
                {card.text && (
                  <p className={`hidden sm:block text-(length:--ds-fs-md) leading-(--ds-lh-normal) ${dark ? 'text-white/85' : 'text-(--ds-text-soft)'}`}>{t(card.text)}</p>
                )}
                <GlowButton to={card.link} label={card.button} onNavigate={onNavigate} tone={dark ? 'white' : 'primary'} size="sm" className="mt-(--ds-s-1)" />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------ best sellers */

const BestSellers: React.FC<
  GlowHomeProps & { cfg: ReturnType<typeof glowHomeOf>['sections']['bestSellers']; countdownTo: number | null }
> = ({ products, catalogLoading, settings, onNavigate, onSelectProduct, onQuickBuy, cfg, countdownTo }) => {
  const t = useT();
  const flagged = useProducts(cfg.source === 'bestSeller' ? '/api/products?bestSeller=true&limit=24' : null);
  const [tab, setTab] = useState<string>('all');

  const items = useMemo(() => {
    if (cfg.source === 'bestSeller' && flagged && flagged.length > 0) return flagged;
    const list = [...products];
    if (cfg.source !== 'newest') list.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || Number(b.reviewCount || 0) - Number(a.reviewCount || 0));
    return list;
  }, [cfg.source, flagged, products]);

  const tabs = useMemo(() => {
    const seen = new Map<string, string>();
    items.forEach((item) => {
      if (item.categorySlug && item.categoryName && !seen.has(item.categorySlug)) seen.set(item.categorySlug, item.categoryName);
    });
    return Array.from(seen.entries()).slice(0, 8);
  }, [items]);

  const visible = (tab === 'all' ? items : items.filter((item) => item.categorySlug === tab)).slice(0, cfg.limit);
  const loading = (cfg.source === 'bestSeller' && flagged === null) || (catalogLoading && items.length === 0);
  if (!loading && items.length === 0) return null;

  return (
    <section className={WRAP}>
      <SectionHead title={cfg.title} action={<GlowButton to="/shop" label={cfg.button} onNavigate={onNavigate} size="sm" arrow={false} className="self-start sm:self-auto" />} />
      {cfg.showTabs && tabs.length > 1 && (
        <div role="tablist" className="ds-scroll-hide flex gap-(--ds-s-2) overflow-x-auto -mx-(--ds-s-4) px-(--ds-s-4) mb-(--ds-s-6)">
          {[['all', t('All')] as [string, string], ...tabs].map(([slug, name]) => {
            const on = tab === slug;
            return (
              <button
                key={slug}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(slug)}
                className={`shrink-0 h-10 sm:h-11 px-(--ds-s-4) sm:px-(--ds-s-5) rounded-full border text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) whitespace-nowrap transition-colors cursor-pointer ${
                  on
                    ? 'bg-(--primary) border-(--primary) text-(--primary-foreground)'
                    : 'bg-(--ds-surface) border-(--ds-border) text-(--ds-text-soft) hover:border-(--primary) hover:text-(--primary)'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
      <div className={GRID}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : visible.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                design="glow"
                config={settings?.product_card_config}
                onSelect={onSelectProduct}
                onQuickBuy={onQuickBuy}
                priority={index < 2}
                countdownTo={product.isFlashSale ? countdownTo : null}
              />
            ))}
      </div>
    </section>
  );
};

/* --------------------------------------------------------- countdown offer */

const CountdownOffer: React.FC<{
  cfg: ReturnType<typeof glowHomeOf>['sections']['countdown'];
  end: number | null;
  onNavigate: NavigateFn;
}> = ({ cfg, end, onNavigate }) => {
  const t = useT();
  if (!end) return null;
  const sides = Boolean(cfg.leftImage || cfg.rightImage);
  const side = (src: string) => (
    <div className="hidden md:block relative rounded-[22px] overflow-hidden bg-(--glow-soft)">
      <GlowPicture src={src} className="absolute inset-0" sizes="240px" width={480} />
      <span aria-hidden className="absolute inset-3 rounded-[16px] border-2 border-white/90 pointer-events-none" />
    </div>
  );
  return (
    <section className={WRAP}>
      <div className={`grid gap-(--ds-s-4) ${sides ? 'md:grid-cols-[minmax(0,0.36fr)_minmax(0,1fr)_minmax(0,0.36fr)]' : ''}`}>
        {sides && side(cfg.leftImage)}
        <div className="glow-leaves relative overflow-hidden rounded-[22px] bg-(--glow-soft) px-(--ds-s-5) py-(--ds-s-10) sm:py-(--ds-s-16) text-center">
          {cfg.smallTitle && <p className="text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) font-(--ds-fw-medium) text-(--ds-text)">{t(cfg.smallTitle)}</p>}
          <AccentTitle title={cfg.title} className="glow-title mt-(--ds-s-2)" />
          {cfg.subtitle && <p className="mt-(--ds-s-3) text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) text-(--ds-text-soft)">{t(cfg.subtitle)}</p>}
          <CountdownBoxes end={end} className="mt-(--ds-s-6)" />
          <GlowButton to={cfg.link} label={cfg.button} onNavigate={onNavigate} size="sm" className="mt-(--ds-s-8)" />
        </div>
        {sides && side(cfg.rightImage)}
      </div>
    </section>
  );
};

/* ---------------------------------------------------------- deals of the day */

const DealsOfDay: React.FC<GlowHomeProps & { cfg: ReturnType<typeof glowHomeOf>['sections']['deals'] }> = ({
  products,
  onSelectProduct,
  cfg,
}) => {
  const t = useT();
  const deals = useMemo(
    () =>
      products
        .filter((item) => discountOf(item) > 0)
        .sort((a, b) => discountOf(b) - discountOf(a))
        .slice(0, cfg.limit),
    [products, cfg.limit]
  );
  if (!deals.length) return null;
  return (
    <section className={WRAP}>
      <SectionHead title={cfg.title} align="center" />
      <div className="grid gap-(--ds-s-4) sm:gap-(--ds-s-6) md:grid-cols-2">
        {deals.map((product) => (
          <DealCard key={product.id} product={product} onSelect={onSelectProduct} shopNow={t('Shop Now')} offLabel={t('{n}% off', { n: Math.round(discountOf(product) * 100) })} />
        ))}
      </div>
    </section>
  );
};

const DealCard: React.FC<{ product: Product; onSelect: (p: Product) => void; shopNow: string; offLabel: string }> = ({ product, onSelect, shopNow, offLabel }) => {
  const href = routeToPath('product', { slug: product.slug || product.id });
  const open = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    onSelect(product);
  };
  const price = Number(product.price) || 0;
  const sale = Number(product.salePrice) || 0;
  const rating = Number(product.rating || 0);
  return (
    <article className="group flex gap-(--ds-s-3) sm:gap-(--ds-s-5) p-(--ds-s-2) rounded-[20px] border border-(--ds-border-soft) bg-(--ds-surface) transition-shadow duration-(--ds-dur) hover:shadow-(--ds-shadow-md)">
      <a href={href} onClick={open} className="relative shrink-0 w-[42%] max-w-[220px] aspect-square rounded-[16px] overflow-hidden bg-(--glow-soft)" aria-label={product.name}>
        {product.image && (
          <img
            {...responsiveImg(product.image, '(min-width: 768px) 220px, 42vw', 400)}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full product-img transition-transform duration-(--ds-dur-slow) group-hover:scale-105"
          />
        )}
        <span className="absolute top-(--ds-s-2) start-(--ds-s-2) inline-flex items-center h-6 sm:h-7 px-(--ds-s-2) sm:px-(--ds-s-3) rounded-full bg-(--primary) text-(--primary-foreground) text-(length:--ds-fs-2xs) sm:text-(length:--ds-fs-xs) font-(--ds-fw-semibold) ds-num">
          {offLabel}
        </span>
      </a>
      <div className="min-w-0 flex flex-col justify-center gap-1 sm:gap-(--ds-s-2) py-(--ds-s-1) pe-(--ds-s-2)">
        <div className="flex items-center justify-between gap-(--ds-s-2)">
          <span className="truncate text-(length:--ds-fs-xs) sm:text-(length:--ds-fs-sm) text-(--ds-text-muted)">{product.categoryName}</span>
          {rating > 0 && (
            <span className="shrink-0 inline-flex items-center gap-1 text-(length:--ds-fs-xs) sm:text-(length:--ds-fs-sm) font-(--ds-fw-semibold)">
              <Star className="w-3.5 h-3.5 fill-(--ds-amber) text-(--ds-amber)" />
              <span className="ds-num">{rating.toFixed(1)}</span>
            </span>
          )}
        </div>
        <a href={href} onClick={open} className="ds-clamp-2 text-(length:--ds-fs-md) sm:text-(length:--ds-fs-xl) font-(--ds-fw-medium) text-(--ds-text) hover:text-(--primary) leading-snug">
          {product.name}
        </a>
        <div className="flex flex-wrap items-baseline gap-x-(--ds-s-2)">
          <span className="ds-num text-(length:--ds-fs-lg) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--glow-accent-ink)">৳{(sale || price).toLocaleString('en-US')}</span>
          {sale > 0 && sale < price && <span className="ds-num text-(length:--ds-fs-sm) sm:text-(length:--ds-fs-lg) text-(--ds-text-muted) line-through">৳{price.toLocaleString('en-US')}</span>}
        </div>
        {product.shortDescription && <p className="hidden sm:block ds-clamp-2 text-(length:--ds-fs-sm) text-(--ds-text-soft)">{product.shortDescription}</p>}
        <a href={href} onClick={open} className="inline-flex items-center gap-1.5 text-(length:--ds-fs-sm) sm:text-(length:--ds-fs-md) font-(--ds-fw-semibold) text-(--primary-ink,var(--primary)) hover:underline underline-offset-4">
          {shopNow} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </a>
      </div>
    </article>
  );
};

/* -------------------------------------------------------------- wide banner */

const WideBanner: React.FC<{ cfg: ReturnType<typeof glowHomeOf>['sections']['weekly']; onNavigate: NavigateFn }> = ({ cfg, onNavigate }) => {
  const t = useT();
  if (!cfg.title && !cfg.image) return null;
  return (
    <section className={WRAP}>
      <div className="relative overflow-hidden rounded-[24px] bg-(--primary) text-(--primary-foreground) min-h-[260px] sm:min-h-[300px] flex items-center">
        <span aria-hidden className="absolute -top-24 -start-24 w-72 h-72 rounded-full bg-white/6" />
        {cfg.image ? (
          <img
            {...responsiveImg(cfg.image, '(min-width: 768px) 560px, 60vw', 1080)}
            alt=""
            loading="lazy"
            className="absolute bottom-0 end-0 h-full w-[48%] md:w-[46%] object-cover object-top"
          />
        ) : (
          <span aria-hidden className="absolute -bottom-16 -end-10 w-80 h-80 rounded-full bg-white/8">
            <Sparkles className="absolute top-20 start-20 w-16 h-16 text-(--glow-accent-on-primary)" />
          </span>
        )}
        <div className="relative z-[1] w-[64%] md:w-[55%] p-(--ds-s-6) sm:p-(--ds-s-10) space-y-(--ds-s-3)">
          {cfg.smallTitle && <p className="text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) text-white/90">{t(cfg.smallTitle)}</p>}
          <AccentTitle
            title={cfg.title}
            as="h3"
            className="text-[22px] sm:text-[34px] lg:text-[40px] font-(--ds-fw-bold) leading-[1.15]"
            color="var(--primary-foreground)"
            accentClass="text-(--glow-accent-on-primary)"
          />
          {cfg.text && <p className="hidden sm:block text-(length:--ds-fs-md) text-white/85 max-w-lg">{t(cfg.text)}</p>}
          <GlowButton to={cfg.link} label={cfg.button} onNavigate={onNavigate} tone="white" size="sm" className="mt-(--ds-s-2)" />
        </div>
      </div>
    </section>
  );
};

/* -------------------------------------------------------------- new arrivals */

const NewArrivals: React.FC<GlowHomeProps & { cfg: ReturnType<typeof glowHomeOf>['sections']['newArrivals'] }> = ({
  products,
  catalogLoading,
  settings,
  onNavigate,
  onSelectProduct,
  onQuickBuy,
  cfg,
}) => {
  const t = useT();
  const flagged = useProducts(`/api/products?newArrival=true&limit=${cfg.limit}`);
  const items = (flagged && flagged.length ? flagged : products).slice(0, cfg.limit);
  const loading = flagged === null || (catalogLoading && items.length === 0);
  if (!loading && items.length === 0) return null;
  const hasPromo = Boolean(cfg.promoImage || cfg.promoTitle);
  return (
    <section className={WRAP}>
      <SectionHead eyebrow={cfg.smallTitle} title={cfg.title} text={cfg.text} />
      <div className={`grid gap-(--ds-s-5) ${hasPromo ? 'lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]' : ''}`}>
        {hasPromo && (
          <StoreLink
            to={cfg.promoLink || '/shop?newArrival=1'}
            onNavigate={onNavigate}
            className="group relative block overflow-hidden rounded-[22px] bg-(--primary) min-h-[220px] aspect-[16/9] sm:aspect-[21/9] lg:aspect-auto"
          >
            {cfg.promoImage && (
              <img
                {...responsiveImg(cfg.promoImage, '(min-width: 1024px) 300px, 100vw', 800)}
                alt=""
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-(--ds-dur-slow) group-hover:scale-105"
              />
            )}
            <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.05)_30%,rgba(0,0,0,0.55))]" />
            <span aria-hidden className="absolute inset-3 rounded-[16px] border-2 border-white/85" />
            <span className="absolute inset-x-0 bottom-(--ds-s-8) flex flex-col items-center text-center text-white px-(--ds-s-4)">
              {cfg.promoTitle && <span className="text-[26px] sm:text-[32px] font-(--ds-fw-semibold) leading-tight">{t(cfg.promoTitle)}</span>}
              {cfg.promoSubtitle && <span className="mt-1 text-(length:--ds-fs-md) opacity-90">{t(cfg.promoSubtitle)}</span>}
              {cfg.promoButton && (
                <span className="mt-(--ds-s-4) text-(length:--ds-fs-md) font-(--ds-fw-semibold) uppercase tracking-wide underline underline-offset-[6px]">{t(cfg.promoButton)}</span>
              )}
            </span>
          </StoreLink>
        )}
        <div className={`grid grid-cols-2 md:grid-cols-3 gap-x-(--ds-s-3) gap-y-(--ds-s-6) sm:gap-x-(--ds-s-5)`}>
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : items.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  design="glow"
                  config={settings?.product_card_config}
                  onSelect={onSelectProduct}
                  onQuickBuy={onQuickBuy}
                />
              ))}
        </div>
      </div>
    </section>
  );
};

/* -------------------------------------------------------------- all products */

const AllProducts: React.FC<GlowHomeProps & { cfg: ReturnType<typeof glowHomeOf>['sections']['allProducts'] }> = ({
  products,
  catalogLoading,
  settings,
  onNavigate,
  onSelectProduct,
  onQuickBuy,
  cfg,
}) => {
  const t = useT();
  if (!catalogLoading && products.length === 0) return null;
  return (
    <section className={WRAP}>
      <SectionHead title={cfg.title} action={
          <span className="hidden sm:block">
            <GlowButton to="/shop" label="View All Products" onNavigate={onNavigate} size="sm" tone="outline" />
          </span>
        } />
      <div className={`${GRID} xl:grid-cols-5`}>
        {catalogLoading && products.length === 0
          ? Array.from({ length: 5 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : products.slice(0, cfg.limit).map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                design="glow"
                config={settings?.product_card_config}
                onSelect={onSelectProduct}
                onQuickBuy={onQuickBuy}
              />
            ))}
      </div>
      <div className="sm:hidden mt-(--ds-s-6) flex justify-center">
        <GlowButton to="/shop" label="View All Products" onNavigate={onNavigate} size="sm" />
      </div>
    </section>
  );
};

/* --------------------------------------------------------------------- FAQ */

const Faq: React.FC<{ cfg: ReturnType<typeof glowHomeOf>['sections']['faq']; onNavigate: NavigateFn }> = ({ cfg, onNavigate }) => {
  const t = useT();
  const [open, setOpen] = useState(0);
  if (!cfg.items.length) return null;
  return (
    <section className={WRAP}>
      <SectionHead eyebrow={cfg.smallTitle} title={cfg.title} align="center" />
      <div className="grid gap-(--ds-s-5) lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] items-start">
        <div className="space-y-(--ds-s-3)">
          {cfg.items.map((item, index) => {
            const on = open === index;
            const id = `glow-faq-${index}`;
            return (
              <div
                key={index}
                className={`rounded-[18px] border transition-colors duration-(--ds-dur) ${
                  on ? 'bg-(--primary) border-(--primary) text-(--primary-foreground)' : 'bg-(--ds-surface) border-(--ds-border)'
                }`}
              >
                <button
                  type="button"
                  aria-expanded={on}
                  aria-controls={id}
                  onClick={() => setOpen(on ? -1 : index)}
                  className="w-full flex items-center justify-between gap-(--ds-s-4) px-(--ds-s-4) sm:px-(--ds-s-5) py-(--ds-s-4) text-start cursor-pointer"
                >
                  <span className={`text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) font-(--ds-fw-semibold) ${on ? '' : 'text-(--ds-text)'}`}>{t(item.q)}</span>
                  {on ? <Minus className="w-5 h-5 shrink-0" /> : <Plus className="w-5 h-5 shrink-0 text-(--ds-text-soft)" />}
                </button>
                {on && (
                  <p id={id} className="px-(--ds-s-4) sm:px-(--ds-s-5) pb-(--ds-s-4) -mt-(--ds-s-1) text-(length:--ds-fs-base) sm:text-(length:--ds-fs-md) leading-(--ds-lh-normal) opacity-90 whitespace-pre-line">
                    {t(item.a)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {(cfg.cardTitle || cfg.cardButton) && (
          <aside className="rounded-[22px] bg-(--primary) text-(--primary-foreground) px-(--ds-s-6) py-(--ds-s-8) text-center lg:sticky lg:top-[calc(var(--store-header-h,72px)+16px)]">
            <span className="relative inline-flex w-14 h-14 items-center justify-center">
              <MessagesSquare className="w-12 h-12 text-white" strokeWidth={1.6} />
              <span aria-hidden className="absolute -bottom-1 -end-1 w-6 h-6 rounded-full bg-(--glow-accent)" />
            </span>
            {cfg.cardTitle && (
              <h3 className="mt-(--ds-s-4) text-(length:--ds-fs-xl) font-(--ds-fw-bold)" style={{ color: 'var(--primary-foreground)' }}>
                {t(cfg.cardTitle)}
              </h3>
            )}
            {cfg.cardText && <p className="mt-(--ds-s-2) text-(length:--ds-fs-base) text-white/85">{t(cfg.cardText)}</p>}
            <GlowButton to={cfg.cardLink} label={cfg.cardButton} onNavigate={onNavigate} tone="white" size="sm" arrow={false} className="mt-(--ds-s-5)" />
          </aside>
        )}
      </div>
    </section>
  );
};
