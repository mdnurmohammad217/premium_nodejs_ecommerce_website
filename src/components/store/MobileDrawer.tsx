import { LanguageSwitcher } from './LanguageSwitcher.tsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { responsiveImg, sized } from '../../lib/img.ts';
import { hasDashboardAccess, hasPosAccess } from '../../lib/permissions.ts';
import { X, ChevronDown, LayoutDashboard, LogOut, LayoutGrid, ArrowRight, CircleUserRound } from 'lucide-react';
import { Category, SiteSettings } from '../../types/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { BrandLogo, SearchBox, StoreLink, MenuNode, buildMenu, isRouteActive, resolveMenuUrl } from './Header.tsx';

export type DrawerSection = 'menu' | 'categories';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: string, params?: any) => void;
  settings?: SiteSettings;
  /** Nested categories from `/api/categories?tree=1` */
  categoryTree?: Category[];
  /** Scroll straight to this section when the drawer opens */
  focusSection?: DrawerSection;
  currentView?: string;
  currentParams?: any;
  onOpenAdmin?: () => void;
  /** Category tree is still loading — show a skeleton instead of hiding it */
  categoriesLoading?: boolean;
}

/** Dashboard → Website → Mobile Nav → Mobile menu (side drawer) */
export interface MobileDrawerConfig {
  subtitle?: string;
  /** Picture on the right of the welcome banner (transparent PNG works best) */
  bannerImage?: string;
  menuTitle?: string;
  promo?: {
    enabled?: boolean;
    title?: string;
    highlight?: string;
    subtitle?: string;
    buttonText?: string;
    link?: string;
    image?: string;
  };
  showCategories?: boolean;
  categoriesTitle?: string;
  maxCategories?: number;
}

export const DEFAULT_MOBILE_DRAWER: Required<Omit<MobileDrawerConfig, 'promo'>> & { promo: Required<NonNullable<MobileDrawerConfig['promo']>> } = {
  subtitle: 'Discover Amazing Products at Great Prices',
  bannerImage: '',
  menuTitle: 'Menu',
  promo: {
    enabled: true,
    title: 'Big',
    highlight: 'Discounts',
    subtitle: 'On All Categories',
    buttonText: 'Shop Now',
    link: 'offers',
    image: '',
  },
  showCategories: true,
  categoriesTitle: 'Categories',
  maxCategories: 12,
};

export const mobileDrawerConfigOf = (settings?: SiteSettings) => {
  const raw = ((settings as any)?.mobile_drawer_config || {}) as MobileDrawerConfig;
  return {
    ...DEFAULT_MOBILE_DRAWER,
    ...raw,
    promo: { ...DEFAULT_MOBILE_DRAWER.promo, ...(raw.promo || {}) },
    maxCategories: Math.min(30, Math.max(4, Number(raw.maxCategories) || DEFAULT_MOBILE_DRAWER.maxCategories)),
  };
};

/** A simple shopping-bag drawing for the banners when no picture is uploaded */
const BagArt: React.FC<{ percent?: boolean; className?: string }> = ({ percent, className = '' }) => (
  <svg viewBox="0 0 120 120" className={className} aria-hidden>
    <defs>
      <linearGradient id={percent ? 'bag-p' : 'bag-w'} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={percent ? '#fdba74' : '#fff7ed'} />
        <stop offset="1" stopColor={percent ? '#ea580c' : '#fed7aa'} />
      </linearGradient>
    </defs>
    <path d="M40 40c0-12 9-22 20-22s20 10 20 22" fill="none" stroke={percent ? '#c2410c' : '#9a3412'} strokeWidth="6" strokeLinecap="round" />
    <path d="M22 40h76l-7 66a8 8 0 0 1-8 7H37a8 8 0 0 1-8-7z" fill={`url(#${percent ? 'bag-p' : 'bag-w'})`} />
    <path d="M22 40h76l-1.5 12H23.5z" fill="#000" opacity=".08" />
    {percent ? (
      <g fill="#fff">
        <circle cx="48" cy="70" r="7" />
        <circle cx="74" cy="92" r="7" />
        <rect x="57" y="58" width="7" height="46" rx="3.5" transform="rotate(35 60 81)" />
      </g>
    ) : (
      <g>
        <path d="M84 22c10 4 16 14 14 26-9-3-15-11-14-26z" fill="#4d7c0f" opacity=".9" />
        <path d="M98 30c9 7 11 18 6 28-7-6-9-16-6-28z" fill="#65a30d" opacity=".85" />
      </g>
    )}
  </svg>
);

/**
 * The phone and tablet menu (v3.9 design): a welcome banner with the logo,
 * close button and search; the dashboard menu; an editable promo banner;
 * the categories as picture tiles; and the account button. Everything in it
 * is set in Dashboard → Website → Mobile Nav.
 */
export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  open,
  onClose,
  onNavigate,
  settings,
  categoryTree = [],
  focusSection = 'menu',
  currentView,
  currentParams,
  onOpenAdmin,
  categoriesLoading = false,
}) => {
  const { user, signOut } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);
  // Kept mounted for the length of the closing transition
  const [rendered, setRendered] = useState(open);
  // Flipped a frame after mounting so the panel slides in rather than appearing
  const [shown, setShown] = useState(false);
  const cfg = mobileDrawerConfigOf(settings);

  useEffect(() => {
    if (open) {
      setRendered(true);
      let second = 0;
      const first = window.requestAnimationFrame(() => {
        second = window.requestAnimationFrame(() => setShown(true));
      });
      return () => {
        window.cancelAnimationFrame(first);
        window.cancelAnimationFrame(second);
      };
    }
    setShown(false);
    const timer = window.setTimeout(() => setRendered(false), 260);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Body scroll lock and Escape to close
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      if (focusSection === 'categories' && categoriesRef.current && panelRef.current) {
        panelRef.current.scrollTo({ top: categoriesRef.current.offsetTop - 8, behavior: 'smooth' });
      } else {
        panelRef.current?.scrollTo({ top: 0 });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, focusSection]);

  const menu = useMemo(() => buildMenu(settings?.navigation_menu, categoryTree, { autoChildren: true }), [settings?.navigation_menu, categoryTree]);
  const topCategories = useMemo(
    () => [...categoryTree].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).slice(0, cfg.maxCategories),
    [categoryTree, cfg.maxCategories]
  );

  if (!rendered) return null;

  const promo = cfg.promo;
  const showPromo = promo.enabled !== false && Boolean(promo.title || promo.highlight || promo.subtitle);

  return (
    <div className="lg:hidden fixed inset-0 z-(--ds-z-modal)" role="dialog" aria-modal="true" aria-label="Menu">
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-(--ds-overlay) backdrop-blur-[2px] transition-opacity duration-(--ds-dur-slow) ${shown ? 'opacity-100' : 'opacity-0'}`}
      />

      <aside
        className={`absolute inset-y-0 left-0 w-[88vw] max-w-[390px] bg-(--ds-surface) shadow-(--ds-shadow-xl) flex flex-col rounded-r-[22px] overflow-hidden transition-transform duration-(--ds-dur-slow) ease-(--ds-ease-out) ${
          shown ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div ref={panelRef} className="relative flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-4 space-y-5">
          {/* Welcome banner: logo, close and search */}
          <section
            className="relative overflow-hidden rounded-[20px] p-4 pb-4 text-white shadow-(--ds-shadow-md)"
            style={{
              background:
                'radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--primary) 55%, #fff) 0%, transparent 55%), linear-gradient(135deg, color-mix(in srgb, var(--primary) 78%, #000), var(--primary))',
            }}
          >
            <div className="relative z-10 flex items-center justify-between gap-3">
              <span className="inline-flex items-center rounded-(--ds-r-md) bg-white px-2 py-1 shadow-(--ds-shadow-xs) max-w-[62%]">
                <BrandLogo settings={settings} onNavigate={onNavigate} onNavigated={onClose} size="sm" />
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-full bg-white text-(--ds-text) shadow-(--ds-shadow-sm) cursor-pointer active:scale-95 transition-transform"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative z-10 mt-3 flex items-end gap-2 min-h-[64px]">
              {cfg.subtitle && (
                <p className="flex-1 min-w-0 text-[15px] leading-snug font-(--ds-fw-medium) text-white/95 pr-2">{cfg.subtitle}</p>
              )}
              <span className="w-[86px] h-[76px] shrink-0 -mb-1 -mr-1">
                {cfg.bannerImage ? (
                  <img src={sized(cfg.bannerImage, 400)} alt="" className="w-full h-full object-contain drop-shadow-lg" />
                ) : (
                  <BagArt className="w-full h-full drop-shadow-lg" />
                )}
              </span>
            </div>
            <div className="relative z-10 mt-3 drawer-search">
              <SearchBox settings={settings} onNavigate={onNavigate} onNavigated={onClose} compact inlineResults />
            </div>
          </section>

          {/* v3.13 — website language, where phone visitors look first */}
          <LanguageSwitcher variant="drawer" />

          {/* Menu — plain rows, no icons */}
          {menu.length > 0 && (
            <section>
              <h3 className="px-1 pb-2 text-[13px] font-(--ds-fw-bold) uppercase tracking-[0.08em] text-(--ds-text-soft)">{cfg.menuTitle || 'Menu'}</h3>
              <div className="rounded-[16px] border border-(--ds-border-soft) bg-(--ds-surface) overflow-hidden divide-y divide-(--ds-border-soft)">
                {menu.map((node) => (
                  <TreeRow
                    key={node.id}
                    node={node}
                    depth={0}
                    onNavigate={onNavigate}
                    onClose={onClose}
                    currentView={currentView}
                    currentParams={currentParams}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Promo banner — text, button, link and picture from the dashboard */}
          {showPromo && (
            <StoreLink
              to={promo.link || 'offers'}
              onNavigate={onNavigate}
              onNavigated={onClose}
              className="relative flex items-center gap-2 overflow-hidden rounded-[18px] p-4 border border-[color-mix(in_srgb,var(--primary)_18%,transparent)]"
              style={{
                background: 'linear-gradient(120deg, color-mix(in srgb, var(--primary) 6%, #fff), color-mix(in srgb, var(--primary) 16%, #fff))',
              }}
            >
              <span className="relative z-10 min-w-0 flex-1">
                {promo.title && <span className="block text-[26px] leading-none font-(--ds-fw-black) text-(--ds-text)">{promo.title}</span>}
                {promo.highlight && (
                  <span className="block text-[26px] leading-tight font-(--ds-fw-black) text-(--primary)">{promo.highlight}</span>
                )}
                {promo.subtitle && <span className="block mt-0.5 text-[14px] font-(--ds-fw-medium) text-(--ds-text-soft)">{promo.subtitle}</span>}
                {promo.buttonText && (
                  <span className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-(--primary) text-(--primary-foreground) text-[14px] font-(--ds-fw-semibold) shadow-(--ds-shadow-sm)">
                    {promo.buttonText}
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </span>
              <span className="w-[112px] h-[104px] shrink-0">
                {promo.image ? (
                  <img src={sized(promo.image, 400)} alt="" className="w-full h-full object-contain" />
                ) : (
                  <BagArt percent className="w-full h-full drop-shadow-md" />
                )}
              </span>
            </StoreLink>
          )}

          {/* Categories as picture tiles */}
          <div ref={categoriesRef}>
            {cfg.showCategories && (categoriesLoading || topCategories.length > 0) && (
              <section>
                <div className="flex items-center justify-between px-1 pb-2">
                  <h3 className="inline-flex items-center gap-2 text-[13px] font-(--ds-fw-bold) uppercase tracking-[0.08em] text-(--ds-text-soft)">
                    <LayoutGrid className="w-4 h-4" />
                    {cfg.categoriesTitle || 'Categories'}
                  </h3>
                  <StoreLink
                    to={{ view: 'shop', params: {} }}
                    onNavigate={onNavigate}
                    onNavigated={onClose}
                    className="inline-flex items-center gap-1 text-[14px] font-(--ds-fw-semibold) text-(--primary)"
                  >
                    View All <ArrowRight className="w-4 h-4" />
                  </StoreLink>
                </div>
                {/* One sliding row: four and a half tiles show, so it is clear there is more to swipe */}
                {topCategories.length === 0 ? (
                  <div className="flex gap-2.5 overflow-hidden">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="ds-skeleton aspect-square rounded-[14px] shrink-0 basis-[calc((100%-4*10px)/4.5)]" />
                    ))}
                  </div>
                ) : (
                  <div className="ds-scroll-hide -mx-3 px-3 flex gap-2.5 overflow-x-auto snap-x scroll-px-3 pb-1">
                    {topCategories.map((cat, index) => {
                      const active = currentView === 'shop' && currentParams?.category === cat.slug;
                      const tints = ['#fde2e4', '#dcfce7', '#e0f2fe', '#ede9fe', '#fef3c7', '#ffe4e6', '#ccfbf1', '#f1f5f9'];
                      return (
                        <StoreLink
                          key={cat.id}
                          to={{ view: 'shop', params: { category: cat.slug } }}
                          onNavigate={onNavigate}
                          onNavigated={onClose}
                          className="group flex flex-col items-center gap-1.5 min-w-0 shrink-0 snap-start basis-[calc((100%-4*10px)/4.5)]"
                        >
                          <span
                            className={`w-full aspect-square rounded-[14px] overflow-hidden flex items-center justify-center transition-transform group-active:scale-95 ${
                              active ? 'ring-2 ring-inset ring-(--primary)' : ''
                            }`}
                            style={{ background: tints[index % tints.length] }}
                          >
                            {cat.image ? (
                              <img src={sized(cat.image, 160)} alt="" loading="lazy" className="w-full h-full object-cover" />
                            ) : (
                              <LayoutGrid className="w-6 h-6 text-(--ds-text-muted)" />
                            )}
                          </span>
                          <span className={`w-full text-center text-[12px] leading-tight font-(--ds-fw-medium) ds-clamp-2 [overflow-wrap:anywhere] ${active ? 'text-(--primary)' : 'text-(--ds-text)'}`}>
                            {cat.name}
                          </span>
                        </StoreLink>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

        {/* Account */}
        <div className="shrink-0 px-3 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))] space-y-2 bg-(--ds-surface)">
          {user && user.role !== 'customer' ? (
            // v3.12.1 — the owner and staff: their Dashboard, no customer pages
            <div className="flex gap-2">
              {(hasDashboardAccess(user) || hasPosAccess(user)) && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenAdmin) onOpenAdmin();
                    else onNavigate('admin');
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-[52px] rounded-[16px] bg-(--primary) text-(--primary-foreground) text-[17px] font-(--ds-fw-semibold) shadow-(--ds-shadow-md) cursor-pointer"
                >
                  <LayoutDashboard className="w-5 h-5" />
                  <span>Dashboard</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  signOut();
                  onNavigate('home');
                }}
                className="ds-btn ds-btn-secondary h-[52px] px-5 text-(--ds-danger-text)"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : user ? (
            <>
              <StoreLink
                to={{ view: 'account', params: {} }}
                onNavigate={onNavigate}
                onNavigated={onClose}
                className="w-full inline-flex items-center justify-center gap-2 h-[52px] rounded-[16px] bg-(--primary) text-(--primary-foreground) text-[17px] font-(--ds-fw-semibold) shadow-(--ds-shadow-md)"
              >
                <CircleUserRound className="w-5 h-5" />
                <span>My Account</span>
              </StoreLink>
              <div className="flex gap-2">
                {(hasDashboardAccess(user) || hasPosAccess(user)) && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (onOpenAdmin) onOpenAdmin();
                      else onNavigate('admin');
                    }}
                    className="ds-btn ds-btn-secondary ds-btn-sm flex-1"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    signOut();
                    onNavigate('home');
                  }}
                  className="ds-btn ds-btn-ghost ds-btn-sm flex-1 text-(--ds-danger-text)"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          ) : (
            <StoreLink
              to={{ view: 'login', params: {} }}
              onNavigate={onNavigate}
              onNavigated={onClose}
              className="w-full inline-flex items-center justify-center gap-2 h-[52px] rounded-[16px] bg-(--primary) text-(--primary-foreground) text-[17px] font-(--ds-fw-semibold) shadow-(--ds-shadow-md)"
            >
              <CircleUserRound className="w-5 h-5" />
              <span>My Account</span>
            </StoreLink>
          )}
        </div>
      </aside>
    </div>
  );
};

/** One row of the menu; rows with children expand in place */
/**
 * One row of the phone menu.
 * v3.10 — a row with a sub-menu opens it when tapped (the arrow turns), and
 * the sub-menu starts with "All …" so the parent page is still one tap away.
 * A row without a sub-menu has no arrow at all and simply opens its page.
 */
const TreeRow: React.FC<{
  node: MenuNode;
  depth: number;
  onNavigate: (view: string, params?: any) => void;
  onClose: () => void;
  currentView?: string;
  currentParams?: any;
}> = ({ node, depth, onNavigate, onClose, currentView, currentParams }) => {
  const route = node.newTab ? null : resolveMenuUrl(node.url);
  const active = isRouteActive(route, currentView, currentParams);
  const hasChildren = node.children.length > 0;
  const containsActive = (item: MenuNode): boolean =>
    item.children.some((child) => isRouteActive(child.newTab ? null : resolveMenuUrl(child.url), currentView, currentParams) || containsActive(child));
  // Opens by itself when the page being viewed is inside it
  const [expanded, setExpanded] = useState(() => hasChildren && containsActive(node));
  const indent = { paddingLeft: `calc(16px + ${depth} * 14px)` };
  const rowText = `${depth === 0 ? 'h-[54px] text-[17px] font-(--ds-fw-semibold)' : 'h-11 text-[15px] font-(--ds-fw-medium)'} transition-colors ${
    active ? 'text-(--primary)' : depth === 0 ? 'text-(--ds-text)' : 'text-(--ds-text-soft)'
  }`;

  return (
    <div>
      <div className={active && depth === 0 ? 'bg-[color-mix(in_srgb,var(--primary)_9%,transparent)]' : ''}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            style={indent}
            className={`w-full min-w-0 flex items-center justify-between gap-2 pr-3.5 text-left cursor-pointer ${rowText}`}
          >
            <span className="truncate">{node.title}</span>
            <span
              className={`w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-full transition-colors ${
                expanded ? 'bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-(--primary)' : 'text-(--ds-text-muted)'
              }`}
            >
              <ChevronDown className={`w-[18px] h-[18px] transition-transform duration-(--ds-dur) ${expanded ? 'rotate-180' : ''}`} />
            </span>
          </button>
        ) : (
          <StoreLink
            to={node.url}
            newTab={node.newTab}
            onNavigate={onNavigate}
            onNavigated={onClose}
            style={indent}
            className={`w-full min-w-0 flex items-center pr-4 ${rowText}`}
          >
            <span className="truncate">{node.title}</span>
          </StoreLink>
        )}
      </div>

      {hasChildren && (
        <div className="grid transition-[grid-template-rows] duration-(--ds-dur-slow) ease-(--ds-ease)" style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}>
          <div className="overflow-hidden">
            <div className={depth === 0 ? 'bg-(--ds-surface-2) py-1' : ''}>
              {node.url && (
                <StoreLink
                  to={node.url}
                  newTab={node.newTab}
                  onNavigate={onNavigate}
                  onNavigated={onClose}
                  style={{ paddingLeft: `calc(16px + ${depth + 1} * 14px)` }}
                  className={`flex items-center pr-4 h-11 text-[15px] font-(--ds-fw-semibold) ${active ? 'text-(--primary)' : 'text-(--ds-text)'}`}
                >
                  <span className="truncate">{/^shop(\?|$)/.test(node.url) ? `All ${node.title}` : `Go to ${node.title}`}</span>
                </StoreLink>
              )}
              {node.children.map((child) => (
                <TreeRow
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  onNavigate={onNavigate}
                  onClose={onClose}
                  currentView={currentView}
                  currentParams={currentParams}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
