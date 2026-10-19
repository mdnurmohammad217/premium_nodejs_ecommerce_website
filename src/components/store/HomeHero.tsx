import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, LayoutGrid, ArrowRight } from 'lucide-react';
import { Category, HeroBanner, SiteSettings } from '../../types/index.ts';
import { heroLayoutOf, type HeroHeight } from '../../lib/homeExtras.ts';
import { sized } from '../../lib/img.ts';
import { useT } from '../../lib/i18n.tsx';
import { HeroSlider } from './HeroSlider.tsx';
import { StoreLink, iconFor } from './Header.tsx';

type NavigateFn = (view: string, params?: any) => void;

interface HomeHeroProps {
  settings?: SiteSettings;
  banners?: HeroBanner[];
  loading?: boolean;
  /** Category tree (main categories with their sub-categories) */
  categoryTree?: Category[];
  onNavigate: NavigateFn;
  onActionClick?: (url?: string | null) => void;
}

/**
 * Height of the split hero on computers. The box follows the shape of the
 * first banner (so a normal wide banner fills it without being cut), within
 * these limits; before that is known, the CSS fallback is used.
 */
const HEIGHTS: Record<HeroHeight, { min: number; max: number; css: string }> = {
  small: { min: 300, max: 400, css: 'clamp(300px, 28vw, 400px)' },
  medium: { min: 330, max: 460, css: 'clamp(340px, 32vw, 460px)' },
  large: { min: 380, max: 540, css: 'clamp(380px, 36vw, 540px)' },
};

const isWide = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 1024px)').matches);

/** true on computers (1024px and wider), following window resizes */
function useWide(): boolean {
  const [wide, setWide] = useState(isWide);
  useEffect(() => {
    const query = window.matchMedia?.('(min-width: 1024px)');
    if (!query) return;
    const onChange = () => setWide(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  return wide;
}

const activeCount = (banners?: HeroBanner[]) => (banners || []).filter((b) => (b.status || 'active') === 'active' && b.imageUrl).length;

/** Small round picture of a category: its photo, its icon, or its first letter */
const CategoryThumb: React.FC<{ category: Category; size?: 'sm' | 'md' }> = ({ category, size = 'sm' }) => {
  const Icon = iconFor(category.icon);
  const box = size === 'md' ? 'w-10 h-10' : 'w-8 h-8';
  if (category.image) {
    return (
      <img
        src={sized(category.image, size === 'md' ? 96 : 64)}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className={`${box} shrink-0 rounded-(--ds-r-full) object-cover bg-(--ds-surface-3) ring-1 ring-(--ds-border-soft)`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${box} shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-(--primary) text-(length:--ds-fs-sm) font-(--ds-fw-bold)`}
    >
      {Icon ? <Icon className="w-4 h-4" /> : String(category.name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
};

/**
 * v3.14 — the hero at the top of the home page (Dashboard → Website →
 * Hero Banners → Hero layout):
 *
 *   full   the banners across the whole page (the design until v3.13)
 *   split  on computers, a list of the main categories on the left and the
 *          banners on the right; pointing at a category opens its
 *          sub-categories beside the list. Phones and tablets show the banner
 *          (and, if chosen, a row of category chips under it).
 *
 * Can be switched off completely. Used by both home designs.
 */
export const HomeHero: React.FC<HomeHeroProps> = ({ settings, banners, loading = false, categoryTree = [], onNavigate, onActionClick }) => {
  const t = useT();
  const cfg = useMemo(() => heroLayoutOf(settings), [settings]);
  const wide = useWide();
  const [openId, setOpenId] = useState<number | null>(null);
  /** Width of the banner column (computers), to size the box to the banner */
  const [columnWidth, setColumnWidth] = useState(0);
  const columnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = columnRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setColumnWidth(node.getBoundingClientRect().width));
    observer.observe(node);
    setColumnWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.enabled, cfg.style, loading, (banners || []).length]);
  const closeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const mains = useMemo(
    () => (Array.isArray(categoryTree) ? categoryTree : []).filter((cat) => cat && cat.slug).slice(0, cfg.count),
    [categoryTree, cfg.count]
  );
  const moreCount = Math.max(0, (categoryTree?.length || 0) - mains.length);

  if (!cfg.enabled) return null;
  if (cfg.style === 'full') {
    return <HeroSlider banners={banners} loading={loading} onActionClick={onActionClick} />;
  }

  // split: nothing uploaded and nothing loading → no hero at all (as the full style)
  if (!loading && activeCount(banners) === 0) return null;

  const hasList = mains.length > 0;
  const limits = HEIGHTS[cfg.height];
  const first = (banners || []).filter((b) => (b.status || 'active') === 'active' && b.imageUrl).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))[0] as any;
  const bannerRatio = Number(first?.ratio) || 0;
  const boxHeight =
    wide && columnWidth > 0 && bannerRatio > 0.5 && bannerRatio < 8
      ? `${Math.round(Math.max(limits.min, Math.min(limits.max, columnWidth / bannerRatio)))}px`
      : limits.css;
  const open = cfg.showSubcategories ? mains.find((cat) => cat.id === openId && (cat.children?.length || 0) > 0) : undefined;
  const keepOpen = () => window.clearTimeout(closeTimer.current);
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenId(null), 160);
  };
  const shopLink = (slug: string) => ({ view: 'shop', params: { category: slug } });

  return (
    <section aria-label={t('Banners')} className="max-w-7xl mx-auto px-(--ds-s-4) pt-(--ds-s-3) sm:pt-(--ds-s-5)">
      <div
        className={`relative lg:grid gap-(--ds-s-4) ${hasList ? 'lg:grid-cols-[16.5rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)]' : ''}`}
        style={wide ? { height: boxHeight } : undefined}
        onMouseLeave={closeSoon}
      >
        {/* ------------------------------------------------ category list */}
        {hasList && (
          <nav
            aria-label={t(cfg.title || 'All Categories')}
            className="hidden lg:flex flex-col min-h-0 rounded-(--ds-r-xl) border border-(--ds-border) bg-(--ds-surface) shadow-(--ds-shadow-xs) overflow-hidden"
          >
            <div className="shrink-0 flex items-center gap-(--ds-s-2) h-12 px-(--ds-s-4) bg-(--primary) text-(--primary-foreground)">
              <LayoutGrid className="w-[18px] h-[18px]" aria-hidden />
              <span className="text-(length:--ds-fs-md) font-(--ds-fw-bold) truncate">{t(cfg.title || 'All Categories')}</span>
            </div>
            <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-(--ds-s-1) hero-cat-scroll">
              {mains.map((cat) => {
                const subs = cat.children?.length || 0;
                const active = open?.id === cat.id;
                return (
                  <li key={cat.id}>
                    <StoreLink
                      to={shopLink(cat.slug)}
                      onNavigate={onNavigate}
                      onMouseEnter={() => {
                        keepOpen();
                        setOpenId(cat.id);
                      }}
                      onFocus={() => setOpenId(cat.id)}
                      aria-haspopup={cfg.showSubcategories && subs > 0 ? 'true' : undefined}
                      aria-expanded={cfg.showSubcategories && subs > 0 ? active : undefined}
                      className={`group/cat flex items-center gap-(--ds-s-3) mx-(--ds-s-1) px-(--ds-s-3) h-11 rounded-(--ds-r-md) text-(length:--ds-fs-base) transition-colors ${
                        active
                          ? 'bg-[color-mix(in_srgb,var(--primary)_9%,transparent)] text-(--primary)'
                          : 'text-(--ds-text) hover:bg-[color-mix(in_srgb,var(--primary)_7%,transparent)] hover:text-(--primary)'
                      }`}
                    >
                      {cfg.showImages && <CategoryThumb category={cat} />}
                      <span className="flex-1 min-w-0 truncate font-(--ds-fw-medium)">{cat.name}</span>
                      {cfg.showSubcategories && subs > 0 && (
                        <ChevronRight className="w-4 h-4 shrink-0 opacity-50 rtl:rotate-180 transition-transform group-hover/cat:translate-x-0.5 rtl:group-hover/cat:-translate-x-0.5" aria-hidden />
                      )}
                    </StoreLink>
                  </li>
                );
              })}
            </ul>
            <StoreLink
              to={{ view: 'shop', params: {} }}
              onNavigate={onNavigate}
              className="shrink-0 flex items-center justify-between gap-(--ds-s-2) h-11 px-(--ds-s-4) border-t border-(--ds-border-soft) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) hover:bg-(--ds-surface-2) transition-colors"
            >
              <span>
                {t('View all categories')}
                {moreCount > 0 && <span className="ds-num text-(--ds-text-muted) font-(--ds-fw-medium)"> (+{moreCount})</span>}
              </span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden />
            </StoreLink>
          </nav>
        )}

        {/* ------------------------------------------------------ banners */}
        <div ref={columnRef} className="min-w-0 h-full rounded-(--ds-r-xl) overflow-hidden shadow-(--ds-shadow-xs) isolate">
          <HeroSlider
            banners={banners}
            loading={loading}
            onActionClick={onActionClick}
            fill={wide}
            sizes={hasList ? '(min-width: 1280px) 960px, (min-width: 1024px) 72vw, 100vw' : '(min-width: 1280px) 1248px, 100vw'}
          />
        </div>

        {/* ---------------------------------------- sub-categories flyout */}
        {wide && open && (
          <div
            role="region"
            aria-label={open.name}
            onMouseEnter={keepOpen}
            onMouseLeave={closeSoon}
            className="absolute z-30 top-0 bottom-0 start-[calc(16.5rem+1rem)] xl:start-[calc(18rem+1rem)] w-[min(44rem,calc(100%-17.5rem))] xl:w-[min(46rem,calc(100%-19rem))] rounded-(--ds-r-xl) border border-(--ds-border) bg-(--ds-surface) shadow-(--ds-shadow-xl) p-(--ds-s-5) overflow-y-auto overscroll-contain ds-fade-in"
          >
            <div className="flex items-center justify-between gap-(--ds-s-3) pb-(--ds-s-3) mb-(--ds-s-4) border-b border-(--ds-border-soft)">
              <div className="flex items-center gap-(--ds-s-3) min-w-0">
                <CategoryThumb category={open} size="md" />
                <h3 className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text) truncate">{open.name}</h3>
              </div>
              <StoreLink
                to={shopLink(open.slug)}
                onNavigate={onNavigate}
                className="shrink-0 inline-flex items-center gap-1 text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) hover:underline"
              >
                {t('View all')}
                <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden />
              </StoreLink>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-(--ds-s-5) gap-y-(--ds-s-4)">
              {(open.children || []).map((sub) => (
                <div key={sub.id} className="min-w-0">
                  <StoreLink
                    to={shopLink(sub.slug)}
                    onNavigate={onNavigate}
                    className="group/sub flex items-center gap-(--ds-s-3) p-(--ds-s-2) -m-(--ds-s-2) rounded-(--ds-r-md) hover:bg-(--ds-surface-2) transition-colors"
                  >
                    {cfg.showImages && <CategoryThumb category={sub} size="md" />}
                    <span className="min-w-0 text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text) group-hover/sub:text-(--primary) truncate">{sub.name}</span>
                  </StoreLink>
                  {(sub.children?.length || 0) > 0 && (
                    <ul className="mt-(--ds-s-2) ps-(--ds-s-2) space-y-1">
                      {(sub.children || []).slice(0, 6).map((leaf) => (
                        <li key={leaf.id}>
                          <StoreLink
                            to={shopLink(leaf.slug)}
                            onNavigate={onNavigate}
                            className="block truncate text-(length:--ds-fs-sm) text-(--ds-text-soft) hover:text-(--primary) transition-colors"
                          >
                            {leaf.name}
                          </StoreLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------- phones: category chips */}
      {cfg.phoneChips && hasList && (
        <div className="lg:hidden -mx-(--ds-s-4) mt-(--ds-s-3)">
          <ul className="flex gap-(--ds-s-2) overflow-x-auto px-(--ds-s-4) pb-1 snap-x ds-scroll-hide" aria-label={t(cfg.title || 'All Categories')}>
            {mains.map((cat) => (
              <li key={cat.id} className="snap-start shrink-0">
                <StoreLink
                  to={shopLink(cat.slug)}
                  onNavigate={onNavigate}
                  className="inline-flex items-center gap-(--ds-s-2) h-11 ps-1.5 pe-(--ds-s-4) rounded-(--ds-r-full) border border-(--ds-border) bg-(--ds-surface) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text) whitespace-nowrap active:bg-(--ds-surface-3)"
                >
                  <CategoryThumb category={cat} />
                  {cat.name}
                </StoreLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
