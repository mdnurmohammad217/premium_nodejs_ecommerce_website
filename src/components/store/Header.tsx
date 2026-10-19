import { useLandedCartCount } from '../../lib/flyToCart.ts';
import { hasDashboardAccess, hasPosAccess } from '../../lib/permissions.ts';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';
import { useT } from '../../lib/i18n.tsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sized } from '../../lib/img.ts';
import {
  Search,
  ShoppingCart,
  Heart,
  Pill,
  LayoutDashboard,
  Compass,
  Menu,
  User,
  ChevronDown,
  ChevronRight,
  LogOut,
  Zap,
  ShoppingBag,
  Home,
  Info,
  Phone,
  HelpCircle,
  LayoutGrid,
  MessageCircle,
  Tag,
  Package,
  Gift,
  Truck,
  Star,
  Sparkles,
  HeartPulse,
  ShieldAlert,
  ShieldCheck,
  Baby,
  Activity,
  Syringe,
  Thermometer,
  Stethoscope,
  Loader2,
  X,
  CircleUserRound,
  UserRound,
  Camera,
} from 'lucide-react';
import { TypingPlaceholder } from './TypingPlaceholder.tsx';

/** v3.11 — search by photo opens in its own window, loaded only when used */
const ImageSearchModal = React.lazy(() => import('./ImageSearchModal.tsx').then((m) => ({ default: m.ImageSearchModal })));
import { useCart } from '../../context/CartContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { Product, Category, SiteSettings, NavigationMenuItem } from '../../types/index.ts';
import { IMAGE_PLACEHOLDER } from '../../lib/placeholder.ts';
import { cachedGet } from '../../lib/dataCache.ts';

/* ===========================================================================
   STOREFRONT ROUTING
   The storefront is a single-page app, but every link is a real <a href> so
   ctrl/cmd/middle-click and "Open in new tab" work. These helpers turn a view
   into a URL and back; App, the header, drawer, bottom bar and footer all use
   them so a link and the page it opens can never disagree.
   =========================================================================== */

export interface StoreRoute {
  view: string;
  params: any;
}

const KNOWN_VIEWS = [
  'home', 'shop', 'offers', 'wishlist', 'account', 'cart', 'checkout',
  'login', 'signup', 'pos', 'track', 'order-success', 'reset-password',
];

/** Short menu URLs the dashboard has always accepted, mapped to real views */
const VIEW_ALIASES: Record<string, string> = {
  products: 'shop',
  medicine: 'shop',
  medicines: 'shop',
  'todays-offers': 'offers',
  'order-tracking': 'track',
};

/** Policy and CMS pages that can be linked by their bare slug */
const PAGE_ALIASES: Record<string, string> = {
  about: 'about',
  contact: 'contact',
  faq: 'faq',
  terms: 'terms',
  privacy: 'privacy',
  refund: 'return',
  return: 'return',
  shipping: 'shipping',
};

export const pathToRoute = (pathname: string, search: string): StoreRoute => {
  const clean = pathname.replace(/^\/+|\/+$/g, '');
  const query = new URLSearchParams(search);
  if (!clean) return { view: 'home', params: {} };

  const [first, rawSecond] = clean.split('/');

  // Bengali slugs arrive percent-encoded in the pathname. Without decoding here,
  // opening a product link directly (or in a new tab, or refreshing the page)
  // looked up the encoded text and showed "product not found".
  const second = (() => {
    if (!rawSecond) return rawSecond;
    try {
      return decodeURIComponent(rawSecond);
    } catch {
      return rawSecond;
    }
  })();

  if (first === 'product' && second) return { view: 'product', params: { slug: second } };
  // v3.6 — blog, landing pages and the online-payment result page
  if (first === 'blog') {
    if (second) return { view: 'blog-post', params: { slug: second } };
    return { view: 'blog', params: { category: query.get('category') || undefined } };
  }
  if ((first === 'lp' || first === 'offer') && second) return { view: 'landing', params: { slug: second } };
  if (first === 'payment' && rawSecond === 'result')
    return {
      view: 'payment-result',
      params: {
        order: query.get('order') || '',
        status: query.get('status') || '',
        gateway: query.get('gateway') || '',
        message: query.get('message') || '',
      },
    };
  if (first === 'page' && second) return { view: 'page', params: { slug: second } };
  if (first === 'shop')
    return {
      view: 'shop',
      params: {
        category: query.get('category') || undefined,
        flashSale: query.get('flashSale') === '1' || undefined,
        newArrival: query.get('newArrival') === '1' || undefined,
        search: query.get('search') || undefined,
        brand: query.get('brand') || undefined,
        generic: query.get('generic') || undefined,
      },
    };
  if (first === 'signup') return { view: 'signup', params: { type: query.get('type') === 'wholesale' ? 'wholesale' : undefined } };
  if (first === 'wholesale') return { view: 'signup', params: { type: 'wholesale' } };
  if (first === 'track') return { view: 'track', params: query.get('order') ? { orderNumber: query.get('order') } : {} };
  if (first === 'reset-password') return { view: 'reset-password', params: { token: query.get('token') || '' } };
  // Customer-facing invoice: /invoice/<orderNumber>?phone=01XXXXXXXXX
  if (first === 'invoice' && second)
    return { view: 'invoice', params: { orderNumber: second, phone: query.get('phone') || '' } };

  // /admin/<tab> keeps the dashboard page in the URL too
  if (first === 'admin' || first === 'dashboard') {
    // Tabs that no longer exist land on the nearest page that does, so an old
    // bookmark opens something useful instead of a blank panel.
    const RETIRED: Record<string, string> = {
      backup: 'cfg-shipping',
      settings: 'cfg-shipping',
      theme: 'cfg-theme',
    };
    const tab = second || 'dashboard';
    return { view: 'admin', params: { tab: RETIRED[tab] || tab } };
  }

  // Short page addresses people type or share: /contact, /about, /faq, /privacy…
  // (they used to fall through to the home page)
  if (PAGE_ALIASES[first] && !rawSecond) return { view: 'page', params: { slug: PAGE_ALIASES[first] } };
  if (VIEW_ALIASES[first] && !rawSecond) {
    const view = VIEW_ALIASES[first];
    return view === 'shop' ? { view: 'shop', params: {} } : { view, params: {} };
  }

  return KNOWN_VIEWS.includes(first) ? { view: first, params: {} } : { view: 'home', params: {} };
};

export const routeToPath = (view: string, params: any = {}): string => {
  switch (view) {
    case 'home':
      return '/';
    case 'product':
      // Encoded on the way out, decoded on the way in, so a Bengali slug
      // survives a copied link, a new tab and a refresh.
      return `/product/${encodeURIComponent(params.slug || '')}`;
    case 'page':
      return `/page/${encodeURIComponent(params.slug || '')}`;
    case 'blog':
      return `/blog${params.category ? `?category=${encodeURIComponent(params.category)}` : ''}`;
    case 'blog-post':
      return `/blog/${encodeURIComponent(params.slug || '')}`;
    case 'landing':
      return `/lp/${encodeURIComponent(params.slug || '')}`;
    case 'track':
      return params.orderNumber ? `/track?order=${encodeURIComponent(params.orderNumber)}` : '/track';
    case 'payment-result': {
      const query = new URLSearchParams();
      for (const key of ['order', 'status', 'gateway', 'message']) if (params[key]) query.set(key, params[key]);
      const qs = query.toString();
      return `/payment/result${qs ? `?${qs}` : ''}`;
    }
    case 'shop': {
      const query = new URLSearchParams();
      if (params.category) query.set('category', params.category);
      if (params.flashSale) query.set('flashSale', '1');
      if (params.newArrival) query.set('newArrival', '1');
      if (params.search) query.set('search', params.search);
      if (params.brand) query.set('brand', params.brand);
      if (params.generic) query.set('generic', params.generic);
      const qs = query.toString();
      return `/shop${qs ? `?${qs}` : ''}`;
    }
    case 'signup':
      return params.type === 'wholesale' ? '/signup?type=wholesale' : '/signup';
    case 'admin':
    case 'dashboard':
      return `/admin/${params.tab || 'dashboard'}`;
    case 'order-success':
      return '/order-success';
    case 'reset-password':
      return `/reset-password${params.token ? `?token=${encodeURIComponent(params.token)}` : ''}`;
    case 'invoice':
      return `/invoice/${params.orderNumber || ''}${params.phone ? `?phone=${encodeURIComponent(params.phone)}` : ''}`;
    default:
      return `/${view}`;
  }
};

export const isExternalUrl = (url?: string | null): boolean =>
  /^(https?:)?\/\//i.test(url || '') || /^(mailto|tel|sms):/i.test(url || '');

/**
 * Turns a dashboard-entered URL ("shop?category=x", "/about", "page/faq",
 * "offers") into a storefront route. Anything unrecognised is treated as a
 * CMS page slug, which is what the footer has always done.
 */
export const resolveMenuUrl = (url?: string | null): StoreRoute => {
  const raw = (url || '').trim().replace(/^\/+/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.replace(/\/+$/, '');
  const [first] = path.split('/');

  if (!path || path === 'home') return { view: 'home', params: {} };
  if (PAGE_ALIASES[first] && !path.includes('/')) return { view: 'page', params: { slug: PAGE_ALIASES[first] } };
  if (VIEW_ALIASES[first]) {
    const view = VIEW_ALIASES[first];
    return view === 'shop' ? pathToRoute('/shop', `?${queryPart}`) : { view, params: {} };
  }
  if (
    KNOWN_VIEWS.includes(first) ||
    ['product', 'page', 'invoice', 'admin', 'dashboard', 'blog', 'lp'].includes(first)
  ) {
    return pathToRoute(`/${path}`, queryPart ? `?${queryPart}` : '');
  }
  return { view: 'page', params: { slug: path } };
};

/** A plain left click with no modifier — the only click we take over */
export const isPlainClick = (event: React.MouseEvent): boolean =>
  !event.defaultPrevented &&
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

type NavigateFn = (view: string, params?: any) => void;

interface StoreLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** A dashboard URL string, or a route object */
  to: string | StoreRoute;
  onNavigate: NavigateFn;
  /** Open in a new tab even for an internal URL (dashboard "external" switch) */
  newTab?: boolean;
  /** Runs after a client-side navigation, e.g. to close a drawer */
  onNavigated?: () => void;
}

/**
 * The one link element of the storefront: a real anchor, navigated
 * client-side on a normal click and left to the browser for everything else.
 */
export const StoreLink = React.forwardRef<HTMLAnchorElement, StoreLinkProps>(
  ({ to, onNavigate, newTab, onNavigated, onClick, children, ...rest }, ref) => {
    const external = typeof to === 'string' && isExternalUrl(to);
    const route = typeof to === 'string' ? (external ? null : resolveMenuUrl(to)) : to;
    const href = route ? routeToPath(route.view, route.params) : (to as string);
    const opensElsewhere = external || newTab;

    return (
      <a
        ref={ref}
        href={href}
        target={opensElsewhere && !/^(mailto|tel|sms):/i.test(href) ? '_blank' : undefined}
        rel={opensElsewhere ? 'noopener noreferrer' : undefined}
        onClick={(event) => {
          onClick?.(event);
          if (opensElsewhere || !route || !isPlainClick(event)) {
            if (opensElsewhere) onNavigated?.();
            return;
          }
          event.preventDefault();
          (event.currentTarget as HTMLElement).blur();
          onNavigate(route.view, route.params);
          onNavigated?.();
        }}
        {...rest}
      >
        {children}
      </a>
    );
  }
);
StoreLink.displayName = 'StoreLink';

/** Whether a link points at the page currently on screen */
export const isRouteActive = (route: StoreRoute | null, currentView?: string, currentParams?: any): boolean => {
  if (!route || !currentView) return false;
  if (route.view !== currentView) return false;
  if (route.view === 'shop')
    return (
      (route.params?.category || '') === (currentParams?.category || '') &&
      (route.params?.brand || '') === (currentParams?.brand || '') &&
      (route.params?.generic || '') === (currentParams?.generic || '')
    );
  if (route.view === 'page' || route.view === 'product') return route.params?.slug === currentParams?.slug;
  return true;
};

/* ===========================================================================
   ICONS AND MENU DATA
   =========================================================================== */

type IconComponent = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

/** Lucide icon names the dashboard can store for menu, category and bottom-bar items */
export const STORE_ICONS: Record<string, IconComponent> = {
  Home,
  LayoutGrid,
  ShoppingCart,
  ShoppingBag,
  Compass,
  User,
  Heart,
  Search,
  Phone,
  MessageCircle,
  Tag,
  Zap,
  Menu,
  Pill,
  Info,
  HelpCircle,
  Package,
  Gift,
  Truck,
  Star,
  Sparkles,
  HeartPulse,
  ShieldAlert,
  ShieldCheck,
  Baby,
  Activity,
  Syringe,
  Thermometer,
  Stethoscope,
};

export const iconFor = (name?: string | null): IconComponent | null => (name && STORE_ICONS[name]) || null;

/** The menu row the dashboard saves under `navigation_menu` */
export interface MenuItemConfig
  extends Omit<NavigationMenuItem, 'isActive' | 'sortOrder' | 'children' | 'categoryId' | 'categorySlug'> {
  isActive?: boolean;
  sortOrder?: number;
  type?: 'link' | 'category';
  categoryId?: number | null;
  categorySlug?: string | null;
  includeChildren?: boolean;
  children?: MenuItemConfig[];
}

/** A menu entry ready to render — dashboard links and live categories look the same */
export interface MenuNode {
  id: string;
  title: string;
  icon?: string | null;
  url: string;
  newTab?: boolean;
  children: MenuNode[];
}

const bySortOrder = <T extends { sortOrder?: number | null }>(a: T, b: T) => (a.sortOrder || 0) - (b.sortOrder || 0);

export const findCategory = (tree: Category[], id?: number | null, slug?: string | null): Category | null => {
  for (const node of tree || []) {
    if ((id != null && node.id === Number(id)) || (slug && node.slug === slug)) return node;
    const hit = findCategory(node.children || [], id, slug);
    if (hit) return hit;
  }
  return null;
};

export const categoryToNode = (category: Category): MenuNode => ({
  id: `cat-${category.id}`,
  title: category.name,
  icon: category.icon,
  url: `shop?category=${category.slug}`,
  children: [...(category.children || [])].sort(bySortOrder).map(categoryToNode),
});

const categorySlugFromUrl = (url?: string) => {
  const match = /[?&]category=([^&#]+)/.exec(url || '');
  return match ? decodeURIComponent(match[1]) : null;
};

/** Active items only, in dashboard order, with live sub-categories merged in */
export const buildMenu = (items: unknown, tree: Category[], options: { autoChildren?: boolean } = {}): MenuNode[] => {
  const list = (Array.isArray(items) ? (items as MenuItemConfig[]) : [])
    .filter((item) => item && item.isActive !== false)
    .sort(bySortOrder);

  return list.map((item) => {
    const slug = item.categorySlug || categorySlugFromUrl(item.url);
    const url = item.type === 'category' && !item.url && slug ? `shop?category=${slug}` : item.url || '';

    // autoChildren (the phone menu): an entry that points at a category opens
    // its sub-categories even when "include sub-categories" was not ticked
    const pointsAtCategory = item.type === 'category' || Boolean(slug);
    const hasOwnChildren = Array.isArray(item.children) && item.children.some((child: any) => child && child.isActive !== false);
    const liveChildren =
      (item.type === 'category' && item.includeChildren) || (options.autoChildren && pointsAtCategory && !hasOwnChildren)
        ? [...(findCategory(tree, item.type === 'category' ? item.categoryId : null, slug)?.children || [])].sort(bySortOrder).map(categoryToNode)
        : [];

    return {
      id: String(item.id),
      title: item.title,
      icon: item.icon,
      url,
      newTab: Boolean(item.isExternal) || isExternalUrl(url),
      children: [...liveChildren, ...buildMenu(item.children, tree, options)],
    };
  });
};

/* ===========================================================================
   HEADER
   v3.9 — four designs, picked in Dashboard → Website → Header:
     classic      logo · search · icons, menu bar below (the original)
     transparent  one row over the hero banner on the home page; turns solid
                  white as soon as the page scrolls (and on every other page)
     centered     boutique look: search left, logo centred, menu centred below
     market       marketplace look: brand-coloured bar with a wide search,
                  "All Categories" button and menu below
   Every design keeps the same parts: menu with dropdowns, live search,
   wishlist, cart (with the fly-to-cart target), My Account menu, and the
   phone row (menu button, logo, search, cart).
   =========================================================================== */

export type HeaderStyle = 'classic' | 'transparent' | 'centered' | 'market';

export interface HeaderConfig {
  style?: HeaderStyle;
  /** Transparent header: light (white) text for dark banners, dark text for light banners */
  transparentTone?: 'light' | 'dark';
  /** Transparent header: a white version of the logo for the see-through state */
  lightLogoUrl?: string;
  /** Marketplace header: show the hotline on the right of the menu bar */
  showHotline?: boolean;
}

export const headerConfigOf = (settings?: SiteSettings): Required<Pick<HeaderConfig, 'style' | 'transparentTone'>> & HeaderConfig => {
  const raw = ((settings as any)?.header_config || {}) as HeaderConfig;
  const style: HeaderStyle = ['classic', 'transparent', 'centered', 'market'].includes(String(raw.style)) ? (raw.style as HeaderStyle) : 'classic';
  return { ...raw, style, transparentTone: raw.transparentTone === 'dark' ? 'dark' : 'light' };
};

interface HeaderProps {
  currentView: string;
  onNavigate: (view: string, param?: any) => void;
  categories?: Category[];
  /** Nested categories (`/api/categories?tree=1`) for the menu dropdowns */
  categoryTree?: Category[];
  settings?: SiteSettings;
  onOpenLogin: () => void;
  onOpenCart?: () => void;
  onOpenPos?: () => void;
  onOpenAdmin?: () => void;
  /** Opens the mobile drawer; the hamburger is hidden when not provided */
  onOpenMenu?: () => void;
  /** Params of the current view, used to highlight the active menu link */
  currentParams?: any;
  /** A hero banner sits right under the header (home page) — the transparent design floats over it */
  heroBelow?: boolean;
}

type Tone = 'default' | 'light' | 'brand';

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  categoryTree = [],
  settings,
  onOpenCart,
  onOpenAdmin,
  onOpenMenu,
  currentParams,
  heroBelow = false,
}) => {
  const t = useT();
  const { totalItems, setIsCartDrawerOpen, wishlist = [] } = useCart();
  // Held back while an added item is still flying toward the icon
  const cartBadge = useLandedCartCount(totalItems);
  const { user, signOut } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  /** Transparent design, desktop: the search drops down under the bar */
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  /** Desktop only: scrolled down, so the main row slides away and the menu bar stays */
  const [condensed, setCondensed] = useState(false);
  const [mainRowHeight, setMainRowHeight] = useState(72);
  const mainRowRef = useRef<HTMLDivElement>(null);
  const cfg = headerConfigOf(settings);
  const style = cfg.style;

  const menu = useMemo(
    () => buildMenu(settings?.navigation_menu, categoryTree),
    [settings?.navigation_menu, categoryTree]
  );
  const hasNav = menu.length > 0;
  /** Designs whose menu sits in its own bar under the main row */
  const twoRow = style !== 'transparent';

  // The main row's real height, so the slide is exactly that far and never jumps
  useEffect(() => {
    const el = mainRowRef.current;
    if (!el) return;
    const measure = () => setMainRowHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [style]);

  /**
   * Scroll behaviour.
   * - Phones: the header simply stays stuck to the top.
   * - Desktop (two-row designs): scrolling down slides the logo/search row up
   *   out of view and leaves the menu bar pinned; scrolling up brings it back.
   * The header only moves with a GPU transform, so nothing below it is pushed
   * around (no layout jump), and scroll handling runs once per frame.
   */
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      setScrolled(y > 4);
      if (!desktop.matches || !hasNav || !twoRow) {
        setCondensed(false);
        lastY = y;
        return;
      }
      const delta = y - lastY;
      if (y < 140) {
        setCondensed(false);
        lastY = y;
      } else if (Math.abs(delta) > 8) {
        setCondensed(delta > 0);
        lastY = y;
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    desktop.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('scroll', onScroll);
      desktop.removeEventListener?.('change', update);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [hasNav, twoRow]);

  // An open account menu keeps the full header in place
  const hideMainRow = condensed && !isUserMenuOpen;

  /** Transparent design floating over the home hero, not yet scrolled */
  const overlay = style === 'transparent' && heroBelow && !scrolled && !mobileSearchOpen && !desktopSearchOpen && !isUserMenuOpen;
  const tone: Tone = overlay ? (cfg.transparentTone === 'dark' ? 'default' : 'light') : style === 'market' ? 'brand' : 'default';

  // Publish the header's visible height so sticky parts of a page (product
  // gallery, shop filters) sit just below it instead of sliding underneath.
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () => {
      setHeaderHeight(el.offsetHeight);
      const visible = Math.max(0, el.offsetHeight - (hideMainRow ? mainRowHeight : 0));
      document.documentElement.style.setProperty('--store-header-h', `${visible}px`);
    };
    publish();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hideMainRow, mainRowHeight, mobileSearchOpen, desktopSearchOpen, hasNav, style]);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      // The account menu is placed in more than one header row (phone/tablet
      // and desktop), so "inside" means inside ANY copy of it — a single ref
      // pointed at the hidden copy and closed the menu before a tap landed
      const target = e.target as Element | null;
      if (!target?.closest?.('[data-user-menu]')) setIsUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsUserMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isUserMenuOpen]);

  // A new page closes the search panels
  useEffect(() => {
    setMobileSearchOpen(false);
    setDesktopSearchOpen(false);
  }, [currentView, currentParams]);

  const openCart = () => {
    if (onOpenCart) onOpenCart();
    else setIsCartDrawerOpen(true);
  };

  /* ------------------------------------------------------------ shared parts */
  const toneText = tone === 'light' || tone === 'brand' ? 'text-white' : 'text-(--ds-text-soft)';
  // No display class here: each use says where it shows (inline-flex / md:inline-flex),
  // otherwise `inline-flex` overrides `hidden` and the icon leaks onto phones.
  const iconButton = `relative w-(--ds-h-lg) h-(--ds-h-lg) items-center justify-center rounded-(--ds-r-md) transition-colors cursor-pointer ${
    tone === 'default' ? 'text-(--ds-text-soft) hover:bg-(--ds-surface-3) hover:text-(--ds-text)' : 'text-white hover:bg-white/15'
  }`;
  const softIcon =
    tone === 'default'
      ? 'text-(--primary) bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_16%,transparent)]'
      : 'text-white bg-white/12 hover:bg-white/22 ring-1 ring-white/20';

  const menuButton = onOpenMenu && (
    <button
      type="button"
      onClick={onOpenMenu}
      aria-label="Open menu"
      className={`inline-flex lg:hidden -ml-(--ds-s-1) shrink-0 ${iconButton} ${tone === 'default' ? 'text-(--ds-text)' : ''}`}
    >
      <Menu className="w-5 h-5" />
    </button>
  );

  const mobileSearchButton = (
    <button
      type="button"
      onClick={() => setMobileSearchOpen((open) => !open)}
      aria-label={mobileSearchOpen ? 'Close search' : 'Search products'}
      aria-expanded={mobileSearchOpen}
      className={`inline-flex md:hidden ${iconButton} ${mobileSearchOpen ? 'bg-(--ds-surface-3) text-(--ds-text)' : ''}`}
    >
      {mobileSearchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
    </button>
  );

  const wishlistButton = (
    <StoreLink
      to={{ view: 'wishlist', params: {} }}
      onNavigate={onNavigate}
      aria-label="Wishlist"
      title="Wishlist"
      className={`relative hidden md:inline-flex w-(--ds-h-lg) h-(--ds-h-lg) items-center justify-center rounded-(--ds-r-md) transition-colors cursor-pointer ${softIcon}`}
    >
      <Heart className="w-5 h-5" />
      <CountBadge count={wishlist.length} />
    </StoreLink>
  );

  const cartButton = (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openCart();
      }}
      aria-label="Shopping cart"
      title="Shopping cart"
      data-cart-target="header"
      className={`relative w-(--ds-h-lg) h-(--ds-h-lg) inline-flex items-center justify-center rounded-(--ds-r-md) transition-colors cursor-pointer ${softIcon}`}
    >
      <ShoppingCart className="w-5 h-5" />
      <CountBadge count={cartBadge.count} popKey={cartBadge.popKey} />
    </button>
  );

  const firstName = String(user?.name || '').trim().split(/\s+/)[0] || '';
  const accountPill = `group h-(--ds-h-lg) pl-1 pr-(--ds-s-3) items-center gap-(--ds-s-2) rounded-(--ds-r-full) border transition-colors cursor-pointer ${
    tone === 'default'
      ? 'border-(--ds-border) bg-(--ds-surface) hover:border-[color-mix(in_srgb,var(--primary)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_5%,transparent)]'
      : 'border-white/30 bg-white/10 hover:bg-white/20'
  }`;
  const accountAvatar = (
    <span
      className={`w-9 h-9 rounded-(--ds-r-full) inline-flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
        tone === 'default' ? 'text-(--primary-foreground) shadow-(--ds-shadow-xs)' : 'bg-white text-(--primary)'
      }`}
      style={
        tone === 'default'
          ? { background: 'linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, #000))' }
          : undefined
      }
    >
      {user && firstName ? (
        <span className="text-(length:--ds-fs-sm) font-(--ds-fw-bold) uppercase">{firstName.slice(0, 1)}</span>
      ) : (
        <CircleUserRound className="w-5 h-5" strokeWidth={2} />
      )}
    </span>
  );
  // v3.12.1 — My Account and Track Order are for customers; the owner and
  // staff get their Dashboard instead
  const isCustomer = !user || user.role === 'customer';
  const accountText = (
    <span className="hidden xl:flex flex-col items-start leading-tight text-start whitespace-nowrap">
      <span className={`text-(length:--ds-fs-2xs) ${tone === 'default' ? 'text-(--ds-text-muted)' : 'text-white/80'}`}>
        {user ? t('Hello, {name}', { name: firstName || t('there') }) : t('Hello, sign in')}
      </span>
      <span className={`text-(length:--ds-fs-sm) font-(--ds-fw-bold) ${tone === 'default' ? 'text-(--ds-text)' : 'text-white'}`}>
        {isCustomer ? 'My Account' : user?.role === 'admin' ? 'Admin Panel' : 'Staff Panel'}
      </span>
    </span>
  );

  const accountControl = user ? (
    <div data-user-menu="" className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setIsUserMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={isUserMenuOpen}
        title={isCustomer ? 'My Account' : 'Account menu'}
        className={`inline-flex ${accountPill}`}
      >
        {accountAvatar}
        {accountText}
        <span className="xl:hidden text-(length:--ds-fs-sm) font-(--ds-fw-semibold)">{isCustomer ? 'Account' : 'Admin'}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''} ${tone === 'default' ? 'text-(--ds-text-muted)' : 'text-white'}`} />
      </button>

      {isUserMenuOpen && (
        <div
          role="menu"
          className="ds-scale-in absolute right-0 top-full mt-(--ds-s-2) w-60 bg-(--ds-surface) border border-(--ds-border) rounded-(--ds-r-lg) shadow-(--ds-shadow-lg) p-(--ds-s-1) z-(--ds-z-dropdown)"
        >
          {user.name && (
            <div className="px-(--ds-s-3) py-(--ds-s-2) border-b border-(--ds-border-soft) mb-(--ds-s-1)">
              <p className="text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text) truncate">{user.name}</p>
              {user.phone && <p className="text-(length:--ds-fs-xs) text-(--ds-text-muted) truncate ds-num">{user.phone}</p>}
              {!isCustomer && (
                <p className="text-(length:--ds-fs-xs) text-(--ds-text-muted) truncate">
                  {user.role === 'admin' ? 'Administrator' : user.jobRole || 'Staff'}
                  {user.email ? ` · ${user.email}` : ''}
                </p>
              )}
              {user.customerType === 'wholesale' && (
                <span
                  className={`mt-(--ds-s-1) inline-flex items-center h-5 px-(--ds-s-2) rounded-(--ds-r-full) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) tracking-wide ${
                    user.wholesaleStatus === 'approved' ? 'bg-(--ds-indigo-soft) text-(--ds-indigo)' : 'bg-(--ds-warning-soft) text-(--ds-warning-text)'
                  }`}
                >
                  {user.wholesaleStatus === 'approved' ? 'WHOLESALE' : `Wholesale: ${user.wholesaleStatus}`}
                </span>
              )}
            </div>
          )}
          {isCustomer && (
            <>
              <StoreLink
                to={{ view: 'account', params: {} }}
                onNavigate={onNavigate}
                onNavigated={() => setIsUserMenuOpen(false)}
                role="menuitem"
                className="flex items-center gap-(--ds-s-2) px-(--ds-s-3) h-(--ds-h-md) rounded-(--ds-r-sm) text-(length:--ds-fs-base) font-(--ds-fw-medium) text-(--ds-text) hover:bg-(--ds-surface-3)"
              >
                <UserRound className="w-4 h-4 text-(--ds-text-muted)" />
                <span>My Account</span>
              </StoreLink>
              <StoreLink
                to={{ view: 'track', params: {} }}
                onNavigate={onNavigate}
                onNavigated={() => setIsUserMenuOpen(false)}
                role="menuitem"
                className="flex items-center gap-(--ds-s-2) px-(--ds-s-3) h-(--ds-h-md) rounded-(--ds-r-sm) text-(length:--ds-fs-base) font-(--ds-fw-medium) text-(--ds-text) hover:bg-(--ds-surface-3)"
              >
                <Compass className="w-4 h-4 text-(--ds-text-muted)" />
                <span>Track Order</span>
              </StoreLink>
            </>
          )}
          {(hasDashboardAccess(user) || hasPosAccess(user)) && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsUserMenuOpen(false);
                if (onOpenAdmin) onOpenAdmin();
                else onNavigate('admin');
              }}
              className="w-full flex items-center gap-(--ds-s-2) px-(--ds-s-3) h-(--ds-h-md) rounded-(--ds-r-sm) text-(length:--ds-fs-base) font-(--ds-fw-medium) text-(--ds-text) hover:bg-(--ds-surface-3) cursor-pointer text-left"
            >
              <LayoutDashboard className="w-4 h-4 text-(--primary)" />
              <span>Dashboard</span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsUserMenuOpen(false);
              signOut();
              onNavigate('home');
            }}
            className="w-full flex items-center gap-(--ds-s-2) px-(--ds-s-3) h-(--ds-h-md) rounded-(--ds-r-sm) text-(length:--ds-fs-base) font-(--ds-fw-medium) text-(--ds-danger-text) hover:bg-(--ds-danger-soft) cursor-pointer text-left"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  ) : (
    <StoreLink to={{ view: 'login', params: {} }} onNavigate={onNavigate} title="My Account" className={`hidden md:inline-flex ${accountPill}`}>
      {accountAvatar}
      {accountText}
      <span className={`xl:hidden text-(length:--ds-fs-sm) font-(--ds-fw-semibold) ${tone === 'default' ? 'text-(--ds-text)' : 'text-white'}`}>My Account</span>
    </StoreLink>
  );

  // v3.13 — website language (Dashboard → Website → Languages)
  const languageControl = <LanguageSwitcher variant="header" tone={tone} />;

  const logoFor = (size: 'md' | 'sm') => (
    <BrandLogo
      settings={settings}
      onNavigate={onNavigate}
      size={size}
      lightUrl={tone !== 'default' ? cfg.lightLogoUrl : undefined}
      light={tone !== 'default'}
      // v3.10 — the see-through header shows the logo itself, with no white box behind it.
      // Only the brand-coloured Marketplace bar keeps the box (a logo in the brand colour would vanish on it).
      chip={style === 'market'}
    />
  );

  const mobileSearchPanel = mobileSearchOpen && (
    <div className="md:hidden px-(--ds-s-3) pb-(--ds-s-3) ds-fade-in">
      <SearchBox settings={settings} onNavigate={onNavigate} compact autoFocus onNavigated={() => setMobileSearchOpen(false)} />
    </div>
  );

  /** Phones (all designs): [menu] [logo] [search cart] */
  const phoneRow = (
    <div className="lg:hidden max-w-7xl mx-auto px-(--ds-s-3) sm:px-(--ds-s-4) h-16 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,30rem)_minmax(0,1fr)] items-center gap-(--ds-s-2) md:gap-(--ds-s-4)">
      <div className="flex items-center gap-(--ds-s-2) min-w-0">
        {menuButton}
        <div className="hidden md:flex min-w-0">{logoFor('md')}</div>
      </div>
      <div className="min-w-0 flex justify-center">
        <div className="md:hidden flex justify-center min-w-0">{logoFor('sm')}</div>
        <div className="hidden md:block w-full">
          <SearchBox settings={settings} onNavigate={onNavigate} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-(--ds-s-1) sm:gap-(--ds-s-2) min-w-0">
        {mobileSearchButton}
        <div className="hidden md:block">{languageControl}</div>
        {wishlistButton}
        {cartButton}
        {accountControl}
      </div>
    </div>
  );

  const navList = (variant: MenuVariant, center = false, compact = false) => (
    <ul className={`flex flex-wrap items-center ${compact ? 'gap-0' : 'gap-0.5'} py-(--ds-s-1) min-w-0 ${center ? 'justify-center' : ''}`}>
      {menu.map((node) => (
        <DesktopMenuItem
          key={node.id}
          node={node}
          onNavigate={onNavigate}
          currentView={currentView}
          currentParams={currentParams}
          variant={variant}
          compact={compact}
        />
      ))}
    </ul>
  );

  /** While the main row is tucked away, the cart stays one click away */
  const tuckedCart = (
    <button
      type="button"
      onClick={openCart}
      aria-label="Shopping cart"
      tabIndex={hideMainRow ? 0 : -1}
      data-cart-target="nav"
      className="relative w-(--ds-h-md) h-(--ds-h-md) inline-flex items-center justify-center rounded-(--ds-r-md) text-(--primary) bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] cursor-pointer"
      style={{ opacity: hideMainRow ? 1 : 0, visibility: hideMainRow ? 'visible' : 'hidden', transition: 'opacity 240ms ease, visibility 240ms' }}
    >
      <ShoppingCart className="w-4 h-4" />
      <CountBadge count={cartBadge.count} />
    </button>
  );

  /* ------------------------------------------------------- desktop layouts */
  let desktop: React.ReactNode = null;
  let desktopNav: React.ReactNode = null;

  if (style === 'classic') {
    desktop = (
      <div className="hidden lg:grid max-w-7xl mx-auto px-(--ds-s-4) h-18 grid-cols-[minmax(0,1fr)_minmax(0,40rem)_minmax(0,1fr)] items-center gap-(--ds-s-6)">
        <div className="flex min-w-0">{logoFor('md')}</div>
        <SearchBox settings={settings} onNavigate={onNavigate} />
        <div className="flex items-center justify-end gap-(--ds-s-2) min-w-0">
          {languageControl}
          {wishlistButton}
          {cartButton}
          {accountControl}
        </div>
      </div>
    );
    desktopNav = hasNav && (
      <nav aria-label="Main menu" className="hidden lg:block border-t border-(--ds-border-soft) bg-(--ds-surface)">
        <div className="relative max-w-7xl mx-auto px-(--ds-s-4) flex items-center justify-between gap-(--ds-s-4)">
          {navList('default')}
          <div className="shrink-0 flex items-center gap-(--ds-s-3)">{tuckedCart}</div>
        </div>
      </nav>
    );
  }

  if (style === 'centered') {
    desktop = (
      <div className="hidden lg:grid max-w-7xl mx-auto px-(--ds-s-4) h-20 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-(--ds-s-6)">
        <div className="min-w-0 max-w-[22rem]">
          <SearchBox settings={settings} onNavigate={onNavigate} compact />
        </div>
        <div className="flex justify-center min-w-0 scale-110">{logoFor('md')}</div>
        <div className="flex items-center justify-end gap-(--ds-s-2) min-w-0">
          {languageControl}
          {wishlistButton}
          {cartButton}
          {accountControl}
        </div>
      </div>
    );
    desktopNav = hasNav && (
      <nav aria-label="Main menu" className="hidden lg:block border-t border-(--ds-border-soft) bg-(--ds-surface)">
        <div className="relative max-w-7xl mx-auto px-(--ds-s-4) flex items-center justify-center gap-(--ds-s-4)">
          {navList('underline', true)}
          <div className="absolute right-(--ds-s-4) top-1/2 -translate-y-1/2">{tuckedCart}</div>
        </div>
      </nav>
    );
  }

  if (style === 'market') {
    const hotline = settings?.general?.phone || '';
    desktop = (
      <div className="hidden lg:grid max-w-7xl mx-auto px-(--ds-s-4) h-[76px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-(--ds-s-8)">
        <div className="flex min-w-0">{logoFor('md')}</div>
        <div className="market-search">
          <SearchBox settings={settings} onNavigate={onNavigate} />
        </div>
        <div className="flex items-center justify-end gap-(--ds-s-2) min-w-0">
          {languageControl}
          {wishlistButton}
          {cartButton}
          {accountControl}
        </div>
      </div>
    );
    desktopNav = (
      <nav aria-label="Main menu" className="hidden lg:block bg-(--ds-surface) border-b border-(--ds-border-soft)">
        <div className="relative max-w-7xl mx-auto px-(--ds-s-4) flex items-center gap-(--ds-s-4)">
          <AllCategoriesButton tree={categoryTree} onNavigate={onNavigate} />
          <div className="min-w-0 flex-1">{hasNav && navList('default', false, true)}</div>
          <div className="shrink-0 flex items-center gap-(--ds-s-3)">
            {tuckedCart}
            {cfg.showHotline !== false && hotline && (
              <a
                href={`tel:${hotline.replace(/[^\d+]/g, '')}`}
                className="hidden xl:inline-flex items-center gap-(--ds-s-2) h-10 px-(--ds-s-3) rounded-(--ds-r-full) bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] text-(--primary) font-(--ds-fw-semibold) text-(length:--ds-fs-sm)"
              >
                <Phone className="w-4 h-4" />
                <span className="ds-num">{hotline}</span>
              </a>
            )}
          </div>
        </div>
      </nav>
    );
  }

  if (style === 'transparent') {
    desktop = (
      <div className="hidden lg:flex max-w-7xl mx-auto px-(--ds-s-4) h-[76px] items-center gap-(--ds-s-6)">
        <div className="flex min-w-0 shrink-0">{logoFor('md')}</div>
        <nav aria-label="Main menu" className="relative flex-1 min-w-0 flex justify-center">
          {hasNav && navList(tone === 'light' ? 'light' : 'default', true, true)}
        </nav>
        <div className="flex items-center justify-end gap-(--ds-s-2) shrink-0">
          <button
            type="button"
            onClick={() => setDesktopSearchOpen((open) => !open)}
            aria-label={desktopSearchOpen ? 'Close search' : 'Search products'}
            aria-expanded={desktopSearchOpen}
            className={`inline-flex ${iconButton} ${desktopSearchOpen ? 'bg-(--ds-surface-3) text-(--ds-text)' : ''}`}
          >
            {desktopSearchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>
          {languageControl}
          {wishlistButton}
          {cartButton}
          {accountControl}
        </div>
      </div>
    );
    desktopNav = desktopSearchOpen && (
      <div className="hidden lg:block border-t border-(--ds-border-soft) ds-fade-in">
        <div className="max-w-3xl mx-auto px-(--ds-s-4) py-(--ds-s-3)">
          <SearchBox settings={settings} onNavigate={onNavigate} autoFocus onNavigated={() => setDesktopSearchOpen(false)} />
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ the header */
  const background =
    tone === 'light' || (overlay && tone === 'default')
      ? 'transparent'
      : style === 'market'
      ? 'var(--primary)'
      : style === 'transparent'
      ? 'color-mix(in srgb, var(--ds-surface) 92%, transparent)'
      : 'var(--ds-surface)';

  return (
    <header
      ref={headerRef}
      data-header-style={style}
      data-header-overlay={overlay || undefined}
      className={`sticky top-0 z-(--ds-z-header) ${toneText}`}
      style={{
        background,
        backdropFilter: style === 'transparent' && !overlay ? 'saturate(1.6) blur(14px)' : undefined,
        borderBottom: overlay ? '1px solid transparent' : style === 'market' ? 'none' : `1px solid ${scrolled ? 'transparent' : 'var(--ds-border)'}`,
        boxShadow: scrolled && !overlay ? 'var(--ds-shadow-md)' : 'none',
        // The transparent design lies over the hero instead of pushing it down
        marginBottom: style === 'transparent' && heroBelow ? -headerHeight : undefined,
        transform: hideMainRow ? `translate3d(0, -${mainRowHeight}px, 0)` : 'translate3d(0, 0, 0)',
        transition:
          'transform 340ms cubic-bezier(0.22, 1, 0.36, 1), background-color 260ms ease, box-shadow var(--ds-dur) var(--ds-ease), border-color var(--ds-dur) var(--ds-ease)',
        willChange: 'transform',
      }}
    >
      {/* Readability over a bright banner: a soft shade behind the see-through bar */}
      {overlay && tone === 'light' && (
        <span aria-hidden className="absolute inset-x-0 top-0 h-[150%] pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0))' }} />
      )}
      <div ref={mainRowRef} className="relative">
        {phoneRow}
        {desktop}
        {mobileSearchPanel}
      </div>
      <div className="relative" style={{ color: 'var(--ds-text)' }}>
        {desktopNav}
      </div>
    </header>
  );
};

/** "All Categories" — the marketplace design's category list, with sub-categories on hover */
const AllCategoriesButton: React.FC<{ tree: Category[]; onNavigate: NavigateFn }> = ({ tree, onNavigate }) => {
  const top = [...(tree || [])].sort(bySortOrder).slice(0, 14);
  return (
    <div className="group/all relative shrink-0">
      <StoreLink
        to={{ view: 'shop', params: {} }}
        onNavigate={onNavigate}
        className="inline-flex items-center gap-(--ds-s-2) h-11 my-(--ds-s-1) px-(--ds-s-4) rounded-(--ds-r-md) bg-(--primary) text-(--primary-foreground) font-(--ds-fw-semibold) text-(length:--ds-fs-md) shadow-(--ds-shadow-xs)"
      >
        <LayoutGrid className="w-4 h-4" />
        <span>All Categories</span>
        <ChevronDown className="w-4 h-4 opacity-80 transition-transform group-hover/all:rotate-180" />
      </StoreLink>
      {top.length > 0 && (
        <div className="invisible opacity-0 translate-y-1 group-hover/all:visible group-hover/all:opacity-100 group-hover/all:translate-y-0 group-focus-within/all:visible group-focus-within/all:opacity-100 transition-[opacity,transform,visibility] duration-(--ds-dur) absolute left-0 top-full pt-(--ds-s-1) z-(--ds-z-dropdown)">
          <ul className="w-64 bg-(--ds-surface) border border-(--ds-border) rounded-(--ds-r-lg) shadow-(--ds-shadow-xl) p-(--ds-s-1)">
            {top.map((cat) => {
              const kids = [...(cat.children || [])].sort(bySortOrder);
              return (
                <li key={cat.id} className="group/cat relative">
                  <StoreLink
                    to={{ view: 'shop', params: { category: cat.slug } }}
                    onNavigate={onNavigate}
                    className="flex items-center gap-(--ds-s-3) px-(--ds-s-3) h-11 rounded-(--ds-r-sm) text-(length:--ds-fs-md) font-(--ds-fw-medium) text-(--ds-text-soft) hover:bg-(--ds-surface-3) hover:text-(--primary)"
                  >
                    {cat.image ? (
                      <img src={sized(cat.image, 96)} alt="" className="w-7 h-7 rounded-(--ds-r-sm) object-cover bg-(--ds-surface-2)" loading="lazy" />
                    ) : (
                      <span className="w-7 h-7 rounded-(--ds-r-sm) bg-(--ds-surface-3)" />
                    )}
                    <span className="flex-1 truncate">{cat.name}</span>
                    {kids.length > 0 && <ChevronRight className="rtl:rotate-180 w-4 h-4 opacity-50" />}
                  </StoreLink>
                  {kids.length > 0 && (
                    <div className="invisible opacity-0 group-hover/cat:visible group-hover/cat:opacity-100 transition-opacity absolute left-full top-0 pl-(--ds-s-1)">
                      <ul className="w-56 bg-(--ds-surface) border border-(--ds-border) rounded-(--ds-r-lg) shadow-(--ds-shadow-xl) p-(--ds-s-1)">
                        {kids.map((child) => (
                          <li key={child.id}>
                            <StoreLink
                              to={{ view: 'shop', params: { category: child.slug } }}
                              onNavigate={onNavigate}
                              className="block px-(--ds-s-3) py-(--ds-s-2) rounded-(--ds-r-sm) text-(length:--ds-fs-md) text-(--ds-text-soft) hover:bg-(--ds-surface-3) hover:text-(--primary) truncate"
                            >
                              {child.name}
                            </StoreLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------------------
   Pieces
   --------------------------------------------------------------------------- */

export const CountBadge: React.FC<{ count: number; className?: string; popKey?: number }> = ({
  count,
  className = '',
  popKey,
}) =>
  count > 0 ? (
    <span
      key={popKey}
      className={`${popKey ? 'cart-badge-pop ' : ''}ds-num absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 rounded-(--ds-r-full) bg-(--primary) text-(--primary-foreground) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) leading-none inline-flex items-center justify-center ring-2 ring-(--ds-surface) ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  ) : null;

/** Logo, or the store name when no logo is uploaded. Nothing is invented. */
export const BrandLogo: React.FC<{
  settings?: SiteSettings;
  onNavigate: NavigateFn;
  onNavigated?: () => void;
  size?: 'md' | 'sm';
  /** On a dark / see-through header: white text, and the white logo when one is uploaded */
  light?: boolean;
  lightUrl?: string;
  /** Put a coloured logo on a soft white box (brand-coloured bar only) */
  chip?: boolean;
}> = ({ settings, onNavigate, onNavigated, size = 'md', light = false, lightUrl, chip: wantChip = false }) => {
  const logo = settings?.logo_config;
  const storeName = logo?.pharmacyName || settings?.general?.storeName || '';
  const tagline = logo?.tagline || settings?.general?.tagline || '';
  const desktopLogoUrl = light && lightUrl ? lightUrl : logo?.desktopLogoUrl;
  const mobileLogoUrl = light && lightUrl ? lightUrl : logo?.mobileLogoUrl || desktopLogoUrl;
  const [broken, setBroken] = useState(false);
  // A new logo gets its own chance to load
  useEffect(() => setBroken(false), [desktopLogoUrl, mobileLogoUrl]);
  // A normal (coloured) logo on a dark bar sits on a soft white chip so it stays readable
  const chip = light && !lightUrl && wantChip ? 'bg-white/95 rounded-(--ds-r-md) px-2 py-1 shadow-(--ds-shadow-xs)' : '';
  // Over a banner photo a soft shadow keeps the bare logo readable
  const overPhoto = light && !chip ? 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]' : '';

  return (
    <StoreLink
      to={{ view: 'home', params: {} }}
      onNavigate={onNavigate}
      onNavigated={onNavigated}
      // A picture logo needs a name; a text logo is read out as it is written
      aria-label={(desktopLogoUrl || mobileLogoUrl) && !broken ? storeName || 'Home' : undefined}
      className="flex items-center gap-(--ds-s-2) min-w-0 shrink md:shrink-0 select-none"
    >
      {(desktopLogoUrl || mobileLogoUrl) && !broken ? (
        <span className={`inline-flex items-center ${chip} ${overPhoto}`}>
          <img
            src={sized(mobileLogoUrl || desktopLogoUrl, 400)}
            alt={storeName}
            onError={() => setBroken(true)}
            className={`${size === 'sm' ? '' : 'md:hidden'} ${chip ? 'h-8' : 'h-9'} w-auto max-w-[140px] object-contain`}
          />
          {size === 'md' && (
            <img
              src={sized(desktopLogoUrl || mobileLogoUrl, 400)}
              alt={storeName}
              onError={() => setBroken(true)}
              className={`hidden md:block ${chip ? 'h-10' : 'h-11'} w-auto max-w-[200px] object-contain`}
            />
          )}
        </span>
      ) : (
        <>
          <span
            className={`w-9 h-9 rounded-(--ds-r-md) inline-flex items-center justify-center shrink-0 shadow-(--ds-shadow-xs) ${
              light ? 'bg-white text-(--primary)' : 'bg-(--primary) text-(--primary-foreground)'
            }`}
          >
            <ShoppingBag className="w-5 h-5" />
          </span>
          {storeName && (
            <span className="min-w-0">
              <span
                className={`block text-(length:--ds-fs-lg) sm:text-(length:--ds-fs-xl) font-(--ds-fw-black) leading-tight truncate max-w-[180px] sm:max-w-[240px] ${
                  light ? 'text-white' : 'text-(--ds-text)'
                }`}
              >
                {storeName}
              </span>
              {logo?.badgeText && size === 'md' && (
                <span className={`hidden sm:inline-block text-(length:--ds-fs-2xs) font-(--ds-fw-bold) ${light ? 'text-white/85' : 'text-(--primary)'}`}>
                  {logo.badgeText}
                </span>
              )}
              {tagline && size === 'md' && !logo?.badgeText && (
                <span className={`hidden xl:block text-(length:--ds-fs-xs) truncate max-w-[240px] ${light ? 'text-white/80' : 'text-(--ds-text-muted)'}`}>
                  {tagline}
                </span>
              )}
            </span>
          )}
        </>
      )}
    </StoreLink>
  );
};

/** Product search with live suggestions */
export const SearchBox: React.FC<{
  settings?: SiteSettings;
  onNavigate: NavigateFn;
  compact?: boolean;
  onNavigated?: () => void;
  autoFocus?: boolean;
  /**
   * v3.15 — results in the page flow under the box (phone menu), not as a
   * floating card: the menu's banner clips anything that floats out of it,
   * which hid the results behind the language buttons.
   */
  inlineResults?: boolean;
}> = ({ settings, onNavigate, compact, onNavigated, autoFocus, inlineResults = false }) => {
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const currency = settings?.general?.currency || '৳';

  // v3.11 — Dashboard → Website → Search Box
  const searchCfg: any = (settings as any)?.search_config || {};
  const placeholderText = t(String(searchCfg.placeholder || '').trim() || 'Search products.....');
  const typingOn = searchCfg.typingEnabled !== false;
  const typingPhrases: string[] = (Array.isArray(searchCfg.typingPhrases) ? searchCfg.typingPhrases : [])
    .map((phrase: any) => String(phrase || '').trim())
    .filter(Boolean);
  const photoSearch = Boolean(searchCfg.imageSearchEnabled);
  const showTyping = typingOn && !focused && !query;

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await cachedGet(`/api/products?search=${encodeURIComponent(term)}&limit=6`, { ttl: 30_000 });
        if (!cancelled) {
          setResults(Array.isArray(data) ? data : []);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const term = query.trim();
    if (!term) return;
    setOpen(false);
    onNavigate('shop', { search: term });
    onNavigated?.();
  };

  const close = () => {
    setOpen(false);
    setQuery('');
    onNavigated?.();
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <form onSubmit={submit} role="search" className="relative">
        <Search className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setFocused(true);
            if (results.length > 0) setOpen(true);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          // The animated hint is drawn over the box; the real placeholder stays for screen readers and while typing
          placeholder={showTyping ? '' : placeholderText}
          aria-label={placeholderText.replace(/\.+$/, '') || 'Search products'}
          className={`ds-input pl-9 ${compact ? (photoSearch ? 'pr-11' : '') : photoSearch ? 'pr-34' : 'pr-24'} rounded-(--ds-r-full) bg-(--ds-surface-2) focus:bg-(--ds-surface) ${
            compact ? 'h-(--ds-h-md)' : 'h-(--ds-h-lg)'
          }`}
        />
        {showTyping && (
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 left-9 flex items-center overflow-hidden text-(length:--ds-fs-md) ${
              compact ? (photoSearch ? 'right-11' : 'right-3') : photoSearch ? 'right-34' : 'right-24'
            }`}
          >
            <TypingPlaceholder
              phrases={typingPhrases.length > 0 ? typingPhrases.map((phrase: string) => t(phrase)) : [placeholderText]}
              fallback={placeholderText}
              speed={searchCfg.typingSpeed || 'normal'}
            />
          </span>
        )}
        {loading && (
          <Loader2
            className={`w-4 h-4 animate-spin text-(--ds-text-faint) absolute top-1/2 -translate-y-1/2 ${
              compact ? (photoSearch ? 'right-11' : 'right-(--ds-s-3)') : photoSearch ? 'right-34' : 'right-24'
            }`}
          />
        )}
        {photoSearch && (
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            aria-label={searchCfg.imageSearchTitle || 'Search by photo'}
            title={searchCfg.imageSearchTitle || 'Search by photo'}
            // v3.15 — a slightly deeper tint on hover (a full brand-colour fill turned it black on dark brands)
            className={`search-camera-btn absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-(--ds-r-full) inline-flex items-center justify-center text-(--primary) bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] active:scale-95 transition-[background-color,transform] cursor-pointer ${
              compact ? 'right-1.5' : 'right-[5.6rem]'
            }`}
          >
            <Camera className="w-4 h-4" />
          </button>
        )}
        {!compact && (
          <button
            type="submit"
            className="ds-btn ds-btn-primary ds-btn-sm absolute right-1.5 top-1/2 -translate-y-1/2 rounded-(--ds-r-full)"
          >
            Search
          </button>
        )}
      </form>

      {photoOpen && (
        <React.Suspense fallback={null}>
          <ImageSearchModal
            settings={settings}
            onClose={() => setPhotoOpen(false)}
            onNavigate={(view, params) => {
              setPhotoOpen(false);
              onNavigate(view as any, params);
              onNavigated?.();
            }}
          />
        </React.Suspense>
      )}

      {open && query.trim() && (
        <div
          className={`ds-scale-in bg-(--ds-surface) border border-(--ds-border) rounded-(--ds-r-lg) shadow-(--ds-shadow-xl) overflow-hidden text-(--ds-text) ${
            inlineResults ? 'relative mt-(--ds-s-2)' : 'absolute left-0 right-0 top-full mt-(--ds-s-2) z-(--ds-z-dropdown)'
          }`}
        >
          {results.length === 0 ? (
            <p className="px-(--ds-s-4) py-(--ds-s-6) text-center text-(length:--ds-fs-sm) text-(--ds-text-muted)">
              No products found for &quot;{query.trim()}&quot;
            </p>
          ) : (
            <>
              <ul className={`${inlineResults ? 'max-h-[45vh]' : 'max-h-80'} overflow-y-auto overscroll-contain divide-y divide-(--ds-border-soft)`}>
                {results.map((p) => {
                  const price = Number(p.salePrice) > 0 ? p.salePrice : p.price;
                  return (
                    <li key={p.id}>
                      <StoreLink
                        to={{ view: 'product', params: { slug: p.slug, id: p.id, product: p } }}
                        onNavigate={onNavigate}
                        onNavigated={close}
                        className="flex items-center gap-(--ds-s-3) px-(--ds-s-3) py-(--ds-s-2) hover:bg-(--ds-surface-2) transition-colors"
                      >
                        <img
                          src={p.image ? sized(p.image, 96) : IMAGE_PLACEHOLDER}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = IMAGE_PLACEHOLDER;
                          }}
                          className="w-10 h-10 object-contain rounded-(--ds-r-sm) bg-(--ds-surface-2) border border-(--ds-border-soft) p-0.5 shrink-0"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text) truncate">
                            {p.name}
                          </span>
                          {(p.genericName || p.unit) && (
                            <span className="block text-(length:--ds-fs-xs) text-(--ds-text-muted) truncate">
                              {[p.genericName, p.unit].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                        <span className="ds-num shrink-0 text-(length:--ds-fs-sm) font-(--ds-fw-bold) text-(--primary)">
                          {currency}
                          {Number(price).toLocaleString('en-US')}
                        </span>
                      </StoreLink>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => submit()}
                className="w-full px-(--ds-s-4) h-(--ds-h-md) border-t border-(--ds-border-soft) bg-(--ds-surface-2) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) hover:bg-(--ds-surface-3) cursor-pointer"
              >
                View All Results for &quot;{query.trim()}&quot;
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/** Menu bar links: 14.5px (v3.12.2 — one step smaller than the 16px of v3.10–3.12.1); v3.14 — less space between them */
export type MenuVariant = 'default' | 'light' | 'underline';
const menuLinkClass = (active: boolean, variant: MenuVariant = 'default') => {
  // v3.14 — tighter: 10px each side (was 12px) and a 6px icon gap (was 8px)
  const base = 'inline-flex items-center gap-1.5 h-11 px-2.5 rounded-(--ds-r-md) text-(length:--ds-fs-md) font-(--ds-fw-semibold) transition-colors';
  if (variant === 'light') {
    return `${base} ${active ? 'text-white bg-white/18' : 'text-white/90 hover:text-white hover:bg-white/12'}`;
  }
  if (variant === 'underline') {
    // Boutique look: a thin line grows under the link
    return `${base} relative rounded-none after:absolute after:left-2.5 after:right-2.5 after:bottom-1.5 after:h-0.5 after:rounded-full after:bg-(--primary) after:origin-center after:transition-transform after:duration-300 ${
      active ? 'text-(--primary) after:scale-x-100' : 'text-(--ds-text-soft) hover:text-(--ds-text) after:scale-x-0 hover:after:scale-x-100'
    }`;
  }
  return `${base} ${
    active
      ? 'text-(--primary) bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]'
      : 'text-(--ds-text-soft) hover:text-(--ds-text) hover:bg-(--ds-surface-3)'
  }`;
};

const DesktopMenuItem: React.FC<{
  node: MenuNode;
  onNavigate: NavigateFn;
  currentView: string;
  currentParams?: any;
  variant?: MenuVariant;
  /** Single-row headers: no icons and a slightly smaller label, so the whole menu fits on one line */
  compact?: boolean;
}> = ({ node, onNavigate, currentView, currentParams, variant = 'default', compact = false }) => {
  const Icon = iconFor(node.icon);
  const route = node.newTab ? null : resolveMenuUrl(node.url);
  const active = isRouteActive(route, currentView, currentParams);
  const hasChildren = node.children.length > 0;
  // A second level with its own children reads best as columns across the nav
  const isMega = node.children.some((child) => child.children.length > 0);

  const link = (
    <StoreLink
      to={node.url}
      newTab={node.newTab}
      onNavigate={onNavigate}
      aria-haspopup={hasChildren ? 'true' : undefined}
      className={`${menuLinkClass(active, variant as MenuVariant)} ${compact ? '!text-(length:--ds-fs-base) !px-(--ds-s-2) !h-10' : ''}`}
    >
      {Icon && !compact && <Icon className="w-4 h-4" />}
      <span className="whitespace-nowrap">{node.title}</span>
      {hasChildren && (
        <ChevronDown className="w-3.5 h-3.5 opacity-60 transition-transform group-hover/menu:rotate-180" />
      )}
    </StoreLink>
  );

  if (!hasChildren) return <li>{link}</li>;

  // Hover, or keyboard focus anywhere inside, opens the panel. The transparent
  // top padding bridges the gap so the pointer can travel into the panel.
  const panelVisibility =
    'invisible opacity-0 translate-y-1 group-hover/menu:visible group-hover/menu:opacity-100 group-hover/menu:translate-y-0 group-focus-within/menu:visible group-focus-within/menu:opacity-100 group-focus-within/menu:translate-y-0 transition-[opacity,transform,visibility] duration-(--ds-dur) ease-(--ds-ease)';

  if (isMega) {
    return (
      <li className="group/menu">
        {link}
        <div className={`absolute left-(--ds-s-4) right-(--ds-s-4) top-full pt-(--ds-s-1) z-(--ds-z-dropdown) ${panelVisibility}`}>
          <div className="bg-(--ds-surface) border border-(--ds-border) rounded-(--ds-r-xl) shadow-(--ds-shadow-xl) p-(--ds-s-6) max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-3 xl:grid-cols-4 gap-x-(--ds-s-8) gap-y-(--ds-s-6)">
              {node.children.map((column) => (
                <div key={column.id} className="min-w-0">
                  <StoreLink
                    to={column.url}
                    newTab={column.newTab}
                    onNavigate={onNavigate}
                    className="inline-flex items-center gap-(--ds-s-2) text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text) hover:text-(--primary) transition-colors"
                  >
                    {column.title}
                  </StoreLink>
                  {column.children.length > 0 && (
                    <ul className="mt-(--ds-s-2) space-y-(--ds-s-1)">
                      {column.children.map((leaf) => (
                        <li key={leaf.id}>
                          <StoreLink
                            to={leaf.url}
                            newTab={leaf.newTab}
                            onNavigate={onNavigate}
                            className="block py-0.5 text-(length:--ds-fs-md) text-(--ds-text-soft) hover:text-(--primary) transition-colors truncate"
                          >
                            {leaf.title}
                          </StoreLink>
                          {leaf.children.length > 0 && (
                            <ul className="pl-(--ds-s-3) border-l border-(--ds-border-soft) ml-0.5 mt-0.5">
                              {leaf.children.map((deep) => (
                                <li key={deep.id}>
                                  <StoreLink
                                    to={deep.url}
                                    newTab={deep.newTab}
                                    onNavigate={onNavigate}
                                    className="block py-0.5 text-(length:--ds-fs-sm) text-(--ds-text-muted) hover:text-(--primary) transition-colors truncate"
                                  >
                                    {deep.title}
                                  </StoreLink>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            {route && (
              <div className="mt-(--ds-s-6) pt-(--ds-s-4) border-t border-(--ds-border-soft)">
                <StoreLink
                  to={node.url}
                  onNavigate={onNavigate}
                  className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) hover:underline"
                >
                  <span>View All {node.title}</span>
                  <ChevronRight className="rtl:rotate-180 w-4 h-4" />
                </StoreLink>
              </div>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="group/menu relative">
      {link}
      <div className={`absolute left-0 top-full pt-(--ds-s-1) z-(--ds-z-dropdown) ${panelVisibility}`}>
        <ul className="min-w-56 max-w-80 bg-(--ds-surface) border border-(--ds-border) rounded-(--ds-r-lg) shadow-(--ds-shadow-lg) p-(--ds-s-1) max-h-[70vh] overflow-y-auto">
          {node.children.map((child) => {
            const ChildIcon = iconFor(child.icon);
            return (
              <li key={child.id}>
                <StoreLink
                  to={child.url}
                  newTab={child.newTab}
                  onNavigate={onNavigate}
                  className="flex items-center gap-(--ds-s-2) px-(--ds-s-3) h-10 rounded-(--ds-r-sm) text-(length:--ds-fs-md) font-(--ds-fw-medium) text-(--ds-text-soft) hover:bg-(--ds-surface-3) hover:text-(--ds-text) transition-colors"
                >
                  {ChildIcon && <ChildIcon className="w-4 h-4 text-(--ds-text-muted)" />}
                  <span className="truncate">{child.title}</span>
                </StoreLink>
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
};

