import React from 'react';
import { Home, LayoutGrid, ShoppingCart, User, Circle, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useCart } from '../../context/CartContext.tsx';
import { useLandedCartCount } from '../../lib/flyToCart.ts';
import { SiteSettings } from '../../types/index.ts';
import { StoreLink, StoreRoute, iconFor, isExternalUrl, resolveMenuUrl } from './Header.tsx';

export interface MobileNavItem {
  id: string;
  icon?: string;
  label: string;
  url: string;
  isActive?: boolean;
  /** Raised circular centre button */
  highlight?: boolean;
}

/** Settings key `mobile_nav_config` */
export interface MobileNavConfig {
  isEnabled?: boolean;
  showLabels?: boolean;
  items?: MobileNavItem[];
}

/**
 * Used only until the dashboard has saved a bar of its own. These are
 * navigation shortcuts to pages that always exist, not business content.
 */
const DEFAULT_ITEMS: MobileNavItem[] = [
  { id: 'home', icon: 'Home', label: 'Home', url: 'home', isActive: true },
  { id: 'categories', icon: 'LayoutGrid', label: 'Categories', url: 'categories', isActive: true },
  { id: 'cart', icon: 'ShoppingCart', label: 'Cart', url: 'cart', isActive: true, highlight: true },
  { id: 'track', icon: 'Compass', label: 'Track', url: 'track', isActive: true },
  { id: 'account', icon: 'User', label: 'Account', url: 'account', isActive: true },
];

const FALLBACK_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  categories: LayoutGrid,
  cart: ShoppingCart,
  account: User,
};

/** Views where the bar would cover the page's own bottom controls */
const HIDDEN_ON = ['checkout', 'product', 'admin', 'dashboard', 'pos', 'landing'];

/** The product page hides the bar only while it shows its own sticky buy bar */
const hiddenOn = (settings: SiteSettings | undefined, view: string) =>
  view === 'product' ? (settings as any)?.product_page_config?.stickyBuyBar !== false : HIDDEN_ON.includes(view);

export const getMobileNavConfig = (settings?: SiteSettings): MobileNavConfig | null => {
  const saved = (settings as any)?.mobile_nav_config as MobileNavConfig | undefined;
  if (saved && saved.isEnabled === false) return null;
  const items = (saved?.items?.length ? saved.items : DEFAULT_ITEMS).filter((item) => item && item.isActive !== false).slice(0, 5);
  if (items.length === 0) return null;
  return { isEnabled: true, showLabels: saved?.showLabels !== false, items };
};

/** Whether the bar is on screen for this view — App pads the page by its height */
export const isMobileNavVisible = (settings: SiteSettings | undefined, currentView: string) =>
  !hiddenOn(settings, currentView) && getMobileNavConfig(settings) !== null;

interface MobileBottomNavProps {
  settings?: SiteSettings;
  currentView: string;
  currentParams?: any;
  onNavigate: (view: string, params?: any) => void;
  /** Opens the side drawer scrolled to the category tree */
  onOpenCategories: () => void;
  /** Opens the cart the same way the header cart button does */
  onOpenCart: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  settings,
  currentView,
  currentParams,
  onNavigate,
  onOpenCategories,
  onOpenCart,
}) => {
  const { totalItems, wishlist = [] } = useCart();
  // v3.12.1 — for the owner and staff the "Account" button opens the Dashboard
  // and there is no Track Order button
  const { user } = useAuth();
  const staffUser = Boolean(user && user.role !== 'customer');
  const cartBadge = useLandedCartCount(totalItems);
  const config = getMobileNavConfig(settings);
  if (!config || hiddenOn(settings, currentView)) return null;

  const showLabels = config.showLabels !== false;
  // Track Order is a shopper's shortcut, so the owner and staff don't get it
  const items = (config.items || []).filter(
    (item) => !(staffUser && /^\/*track(\?|$)/i.test(String(item.url || '').trim()))
  );

  return (
    <nav
      data-bottom-bar
      aria-label="Mobile navigation"
      className="lg:hidden fixed inset-x-0 bottom-0 z-(--ds-z-header) bg-(--ds-surface)/95 backdrop-blur-md border-t border-(--ds-border) shadow-(--ds-shadow-lg) print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul
        className="grid h-16 max-w-xl mx-auto"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const key = (item.url || '').replace(/^\/+/, '').toLowerCase();
          const asDashboard = staffUser && key === 'account';
          const Icon = asDashboard ? LayoutDashboard : iconFor(item.icon) || FALLBACK_ICON[key] || Circle;
          const label = asDashboard ? 'Dashboard' : item.label;
          const count = key === 'cart' ? cartBadge.count : key === 'wishlist' ? wishlist.length : 0;

          const action: 'categories' | 'cart' | null =
            key === 'categories' ? 'categories' : key === 'cart' ? 'cart' : null;
          const route: StoreRoute | null = asDashboard
            ? { view: 'admin', params: {} }
            : action || isExternalUrl(item.url)
              ? null
              : resolveMenuUrl(item.url);
          const active =
            (key === 'cart' && currentView === 'cart') ||
            (route !== null &&
              route.view === currentView &&
              (route.view !== 'shop' || (route.params?.category || '') === (currentParams?.category || '')) &&
              (route.view !== 'page' || route.params?.slug === currentParams?.slug));

          const body = item.highlight ? (
            <>
              <span
                data-cart-target={key === 'cart' ? 'bottom-nav' : undefined}
                className={`relative -mt-7 w-14 h-14 rounded-(--ds-r-full) bg-(--primary) text-(--primary-foreground) inline-flex items-center justify-center shadow-(--ds-shadow-lg) ring-4 ring-(--ds-surface) transition-transform active:scale-95 ${
                  active ? 'scale-105' : ''
                }`}
              >
                <Icon className="w-6 h-6" />
                <Badge count={count} popKey={key === 'cart' ? cartBadge.popKey : undefined} />
              </span>
              {showLabels && (
                <span className={`mt-0.5 text-(length:--ds-fs-2xs) font-(--ds-fw-semibold) truncate max-w-full ${active ? 'text-(--primary)' : 'text-(--ds-text-soft)'}`}>
                  {label}
                </span>
              )}
            </>
          ) : (
            <>
              <span
                data-cart-target={key === 'cart' ? 'bottom-nav' : undefined}
                className={`relative inline-flex items-center justify-center w-11 h-7 rounded-(--ds-r-full) transition-colors ${
                  active ? 'bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-(--primary)' : 'text-(--ds-text-muted)'
                }`}
              >
                <Icon className="w-5 h-5" />
                <Badge count={count} popKey={key === 'cart' ? cartBadge.popKey : undefined} />
              </span>
              {showLabels && (
                <span className={`text-(length:--ds-fs-2xs) font-(--ds-fw-semibold) truncate max-w-full ${active ? 'text-(--primary)' : 'text-(--ds-text-soft)'}`}>
                  {label}
                </span>
              )}
            </>
          );

          const cellClass =
            'w-full h-full flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer select-none [-webkit-tap-highlight-color:transparent]';

          return (
            <li key={item.id} className="min-w-0">
              {action ? (
                <button
                  type="button"
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  onClick={action === 'cart' ? onOpenCart : onOpenCategories}
                  className={cellClass}
                >
                  {body}
                </button>
              ) : (
                <StoreLink
                  to={route || item.url}
                  onNavigate={onNavigate}
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  className={cellClass}
                >
                  {body}
                </StoreLink>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

const Badge: React.FC<{ count: number; popKey?: number }> = ({ count, popKey }) =>
  count > 0 ? (
    <span
      key={popKey}
      className={`${popKey ? 'cart-badge-pop ' : ''}ds-num absolute -top-1 right-0 translate-x-1/3 min-w-4.5 h-4.5 px-1 rounded-(--ds-r-full) bg-(--ds-danger) text-(--ds-text-invert) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) leading-none inline-flex items-center justify-center ring-2 ring-(--ds-surface)`}
    >
      {count > 99 ? '99+' : count}
    </span>
  ) : null;
