import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { tracking } from './lib/tracking.ts';
import { cachedGet } from './lib/dataCache.ts';
import { peekBootProduct, readBoot } from './lib/boot.ts';
import { readableOnWhite, textOnColor, isHexColor, accentShades } from './lib/contrast.ts';
import { themeOf } from './lib/glowTheme.ts';
import { applyProductImageVars } from './lib/productImage.ts';
import { hasDashboardAccess as canUseDashboard, hasPosAccess } from './lib/permissions.ts';
import { RailArrows, railLayout, sectionLayoutOf, useRail, type HomeSectionsConfig, type SectionLayout } from './components/store/ProductRail.tsx';
import { TopBar } from './components/store/TopBar.tsx';
import { Header, pathToRoute, routeToPath, resolveMenuUrl, StoreLink } from './components/store/Header.tsx';
import { HeroSlider } from './components/store/HeroSlider.tsx';
import { HomeHero } from './components/store/HomeHero.tsx';
import { applyCtaStyle, ctaStyleOf, DEFAULT_CTA_STYLE } from './lib/ctaStyle.ts';
import { applyFontConfig, fontConfigOf } from './lib/fonts.ts';
import { ServiceFeatures } from './components/store/ServiceFeatures.tsx';
import { CategoryGrid } from './components/store/CategoryGrid.tsx';
import { HomeBrandsSection } from './components/store/HomeBrandsSection.tsx';
import { FlashSaleSection } from './components/store/FlashSaleSection.tsx';
import { ProductCard } from './components/store/ProductCard.tsx';

import { CategorySection, ProductCardSkeleton } from './components/store/CategorySection.tsx';

import type { DrawerSection } from './components/store/MobileDrawer.tsx';
import { MobileBottomNav, isMobileNavVisible } from './components/store/MobileBottomNav.tsx';
import { ScrollTopButton } from './components/store/ScrollTopButton.tsx';
import { BlockedScreen } from './components/store/BlockedScreen.tsx';
import { DeferredSection } from './components/store/DeferredSection.tsx';
import { NewArrivalSection } from './components/store/NewArrivalSection.tsx';

const SignupPage = React.lazy(() =>
  import('./components/store/SignupPage.tsx').then((m) => ({ default: m.SignupPage }))
);

const WishlistView = React.lazy(() =>
  import('./components/store/WishlistView.tsx').then((m) => ({ default: m.WishlistView }))
);
const AccountView = React.lazy(() =>
  import('./components/store/AccountView.tsx').then((m) => ({ default: m.AccountView }))
);

import { LicenseNotice } from './components/store/LicenseNotice.tsx';
const BlogListView = React.lazy(() => import('./components/store/BlogListView.tsx').then((m) => ({ default: m.BlogListView })));
const BlogPostView = React.lazy(() => import('./components/store/BlogPostView.tsx').then((m) => ({ default: m.BlogPostView })));
const LandingPageView = React.lazy(() =>
  import('./components/store/LandingPageView.tsx').then((m) => ({ default: m.LandingPageView }))
);
const PaymentResultView = React.lazy(() =>
  import('./components/store/PaymentResultView.tsx').then((m) => ({ default: m.PaymentResultView }))
);

const CheckoutView = React.lazy(() =>
  import('./components/store/CheckoutView.tsx').then((m) => ({ default: m.CheckoutView }))
);
const OrderSuccessView = React.lazy(() =>
  import('./components/store/OrderSuccessView.tsx').then((m) => ({ default: m.OrderSuccessView }))
);
const OrderTrackingView = React.lazy(() =>
  import('./components/store/OrderTrackingView.tsx').then((m) => ({ default: m.OrderTrackingView }))
);
const CustomerInvoiceView = React.lazy(() =>
  import('./components/store/CustomerInvoiceView.tsx').then((m) => ({ default: m.CustomerInvoiceView }))
);

// v3.14 — "Why choose us" + certificates, and the factory & lab gallery
const TrustSection = React.lazy(() => import('./components/store/TrustSection.tsx'));
const FacilitySection = React.lazy(() => import('./components/store/FacilitySection.tsx'));
const ContactView = React.lazy(() => import('./components/store/ContactView.tsx').then((m) => ({ default: m.ContactView })));
const LicenseGate = React.lazy(() =>
  import('./components/admin/LicenseGate.tsx').then((m) => ({ default: m.LicenseGate }))
);
const PosTerminal = React.lazy(() =>
  import('./components/pos/PosTerminal.tsx').then((m) => ({ default: m.PosTerminal }))
);
const AdminLayout = React.lazy(() =>
  import('./components/admin/AdminLayout.tsx').then((m) => ({ default: m.AdminLayout }))
);

/**
 * v3.10 — pages a visitor does not need for the first screen arrive in their
 * own small files (the home page downloads less), and are fetched quietly in
 * the background a moment later, so moving to them is still instant.
 */
const loadShopView = () => import('./components/store/ShopView.tsx');
// v3.12 — the product page, drawers and footer are not needed to show the
// home page, so they arrive in their own files (see warmUpPages)
const loadProductView = () => import('./components/store/ProductDetailView.tsx');
const loadFooter = () => import('./components/store/Footer.tsx');
const loadCartDrawer = () => import('./components/store/CartDrawer.tsx');
const loadMobileDrawer = () => import('./components/store/MobileDrawer.tsx');
const ProductDetailView = React.lazy(() => loadProductView().then((m) => ({ default: m.ProductDetailView })));
const Footer = React.lazy(() => loadFooter().then((m) => ({ default: m.Footer })));
const CartDrawer = React.lazy(() => loadCartDrawer().then((m) => ({ default: m.CartDrawer })));
const MobileDrawer = React.lazy(() => loadMobileDrawer().then((m) => ({ default: m.MobileDrawer })));
const ReviewImagesSection = React.lazy(() =>
  import('./components/store/ReviewImagesSection.tsx').then((m) => ({ default: m.ReviewImagesSection }))
);
const BlogSection = React.lazy(() => import('./components/store/BlogSection.tsx').then((m) => ({ default: m.BlogSection })));
const HomeContactSection = React.lazy(() =>
  import('./components/store/HomeContactSection.tsx').then((m) => ({ default: m.HomeContactSection }))
);
const HomeVideosSection = React.lazy(() =>
  import('./components/store/HomeVideosSection.tsx').then((m) => ({ default: m.HomeVideosSection }))
);
const loadCartView = () => import('./components/store/CartView.tsx');
const loadLoginPage = () => import('./components/store/LoginPage.tsx');
const ShopView = React.lazy(() => loadShopView().then((m) => ({ default: m.ShopView })));
// v3.13 — the Glow home page arrives in its own file, fetched at once when the
// shop uses it (see readBoot below), so Classic shops download none of it
const loadGlowHome = () => import('./components/store/glow/GlowHome.tsx');
const GlowHome = React.lazy(() => loadGlowHome().then((m) => ({ default: m.GlowHome })));
const loadLuxeHome = () => import('./components/store/luxe/LuxeHome.tsx');
const LuxeHome = React.lazy(() => loadLuxeHome().then((m) => ({ default: m.LuxeHome })));
try {
  const bootTheme = (window as any).__PHARMA_BOOT__?.settings?.storefront_theme;
  if (bootTheme?.home === 'glow' && (window.location.pathname === '/' || window.location.pathname === '')) void loadGlowHome().catch(() => undefined);
  if (bootTheme?.home === 'luxe' && (window.location.pathname === '/' || window.location.pathname === '')) void loadLuxeHome().catch(() => undefined);
} catch {
  /* no boot data */
}
const CartView = React.lazy(() => loadCartView().then((m) => ({ default: m.CartView })));
const LoginPage = React.lazy(() => loadLoginPage().then((m) => ({ default: m.LoginPage })));
const ResetPasswordPage = React.lazy(() => import('./components/store/ResetPasswordPage.tsx').then((m) => ({ default: m.ResetPasswordPage })));
const OffersView = React.lazy(() => import('./components/store/OffersView.tsx').then((m) => ({ default: m.OffersView })));
const DynamicPageView = React.lazy(() => import('./components/store/DynamicPageView.tsx').then((m) => ({ default: m.DynamicPageView })));
const ChatWidget = React.lazy(() => import('./components/store/ChatWidget.tsx').then((m) => ({ default: m.ChatWidget })));
/**
 * Pages and parts a visitor may open next are fetched quietly once they start
 * using the page (first scroll / tap / key) — or 6 s after it loaded — so the
 * first screen is never slowed down by them and moving on is still instant.
 */
const warmUpPages = () => {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    events.forEach((name) => window.removeEventListener(name, run));
    const fetchAll = () => {
      void loadProductView().catch(() => undefined);
      void loadFooter().catch(() => undefined);
      void loadCartDrawer().catch(() => undefined);
      void loadMobileDrawer().catch(() => undefined);
      void loadShopView().catch(() => undefined);
      void loadCartView().catch(() => undefined);
      void import('./components/store/CheckoutView.tsx').catch(() => undefined);
    };
    const idle = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout: number }) => void);
    if (idle) idle(fetchAll, { timeout: 1500 });
    else window.setTimeout(fetchAll, 300);
  };
  const events = ['scroll', 'pointerdown', 'touchstart', 'keydown', 'mousemove'];
  events.forEach((name) => window.addEventListener(name, run, { passive: true, once: true }));
  const later = () => window.setTimeout(run, 6000);
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
};
import { useAuth } from './context/AuthContext.tsx';
import { useCart } from './context/CartContext.tsx';
import { Product, Category, Brand, Order, SiteSettings, HeroBanner } from './types/index.ts';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from './lib/i18n.tsx';

/** Routes a blocked visitor can still open: staff sign-in and the dashboards */
const BLOCK_EXEMPT_VIEWS = ['admin', 'dashboard', 'pos', 'login', 'reset-password'];

interface AccessState {
  blocked: boolean;
  message?: string | null;
  reason?: string | null;
}

const asArray = <T,>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : []);

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { setIsCartDrawerOpen, isCartDrawerOpen } = useCart();
  // v3.12 — the drawers' code is fetched the first time one is opened
  const [cartDrawerUsed, setCartDrawerUsed] = useState(false);
  const [menuDrawerUsed, setMenuDrawerUsed] = useState(false);
  useEffect(() => {
    if (isCartDrawerOpen) setCartDrawerUsed(true);
  }, [isCartDrawerOpen]);

  // Navigation State — initialised from the URL so a refresh keeps the page
  const initialRoute = pathToRoute(window.location.pathname, window.location.search);
  const [currentView, setCurrentView] = useState<string>(initialRoute.view);
  // A product page opened directly already has the product in the page (v3.12)
  const [viewParams, setViewParams] = useState<any>(() => {
    if (initialRoute.view !== 'product') return initialRoute.params;
    const product = peekBootProduct(initialRoute.params.slug);
    return product ? { ...initialRoute.params, product } : initialRoute.params;
  });

  // Data Store
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryTree, setCategoryTree] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  // The page arrives with the shop's settings and banners (src/lib/boot.ts),
  // so the very first render already shows the shop's own logo, colours and hero
  const boot = readBoot();
  const [banners, setBanners] = useState<HeroBanner[]>(() => (Array.isArray(boot?.banners) ? (boot!.banners as HeroBanner[]) : []));
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => (boot?.settings as SiteSettings) || {});
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [isSettingsLoading, setIsSettingsLoading] = useState(!boot?.settings);
  const [lastPlacedOrder, setLastPlacedOrder] = useState<Order | null>(null);
  const [trackingOrderNumber, setTrackingOrderNumber] = useState<string | undefined>(undefined);
  const [access, setAccess] = useState<AccessState | null>(null);

  // Mobile drawer, shared by the header hamburger and the bottom bar
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerSection, setDrawerSection] = useState<DrawerSection>('menu');
  const openDrawer = useCallback((section: DrawerSection = 'menu') => {
    setDrawerSection(section);
    setMenuDrawerUsed(true);
    setIsDrawerOpen(true);
  }, []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  // Fetch the next pages in the background once the first screen is up
  useEffect(() => {
    warmUpPages();
  }, []);

  // v3.9 — product picture shape follows Dashboard → Product Card
  useEffect(() => {
    applyProductImageVars((siteSettings as any)?.product_image_config);
  }, [siteSettings]);

  const applySettings = useCallback((data: unknown) => {
    setSiteSettings(data && typeof data === 'object' && !Array.isArray(data) ? (data as SiteSettings) : {});
  }, []);
  const applyBanners = useCallback((data: unknown) => setBanners(asArray<HeroBanner>(data)), []);

  // Settings are re-read whenever the admin saves, so storefront changes
  // (logo, banners, menu, footer, policies) show up without a hard reload.
  // Cached reads paint instantly; `force` skips the cache after a save.
  const refreshSettings = useCallback(
    async (force = false) => {
      try {
        const [sData, bData] = await Promise.all([
          cachedGet('/api/settings', { force, onFresh: applySettings }),
          cachedGet('/api/banners', { force, onFresh: applyBanners }).catch(() => []),
        ]);
        applySettings(sData);
        applyBanners(bData);
      } catch (err) {
        console.error('Failed to refresh site settings:', err);
      } finally {
        setIsSettingsLoading(false);
      }
    },
    [applySettings, applyBanners]
  );

  const loadCatalog = useCallback(async (force = false) => {
    setIsCatalogLoading(true);
    const read = <T,>(url: string, apply: (rows: T[]) => void) =>
      cachedGet(url, { force, onFresh: (data) => apply(asArray<T>(data)) })
        .then((data) => apply(asArray<T>(data)))
        .catch((err) => {
          console.error(`Failed loading ${url}:`, err);
          apply([]);
        });

    await Promise.all([
      read<Product>('/api/products?limit=100', setProducts),
      read<Category>('/api/categories', setCategories),
      read<Category>('/api/categories?tree=1', setCategoryTree),
      read<Brand>('/api/brands', setBrands),
    ]);
    setIsCatalogLoading(false);
  }, []);

  // A landing page needs only the settings; the catalogue loads the moment the
  // visitor moves on to any other page (keeps ad traffic fast on phones).
  const catalogRequested = React.useRef(false);
  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);
  useEffect(() => {
    if (catalogRequested.current || currentView === 'landing') return;
    catalogRequested.current = true;
    loadCatalog();
  }, [loadCatalog, currentView]);

  // Any admin save broadcasts this event; the storefront picks the change up
  // live, bypassing the cache. A cache-version bump from another device does
  // the same for settings and the catalogue.
  useEffect(() => {
    const onSettingsSaved = () => refreshSettings(true);
    const onVersionChanged = () => {
      refreshSettings(true);
      loadCatalog(true);
    };
    // Signing in/out as a wholesale buyer changes prices and the product list
    const onTierChanged = () => loadCatalog(true);
    window.addEventListener('pharma:settings-updated', onSettingsSaved);
    window.addEventListener('pharma:cache-version-changed', onVersionChanged);
    window.addEventListener('pharma:tier-changed', onTierChanged);
    return () => {
      window.removeEventListener('pharma:settings-updated', onSettingsSaved);
      window.removeEventListener('pharma:cache-version-changed', onVersionChanged);
      window.removeEventListener('pharma:tier-changed', onTierChanged);
    };
  }, [refreshSettings, loadCatalog]);

  // Blocked visitors get a notice instead of a storefront whose requests
  // would all be refused. Never cached: an unblock must take effect at once.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/access-check', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setAccess({ blocked: Boolean(data.blocked), message: data.message, reason: data.reason });
      })
      .catch(() => {
        /* the check failing must never hide the shop */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply the theme primary colour from settings to the CSS variables
  useEffect(() => {
    const primary = siteSettings?.theme?.primaryColor;
    const hover = siteSettings?.theme?.primaryHover;
    if (primary && isHexColor(primary)) {
      document.documentElement.style.setProperty('--primary', primary);
      document.documentElement.style.setProperty('--primary-ink', readableOnWhite(primary, 5.4));
      document.documentElement.style.setProperty('--primary-foreground', textOnColor(primary));
    }
    if (hover && isHexColor(hover)) document.documentElement.style.setProperty('--primary-hover', hover);
  }, [siteSettings?.theme?.primaryColor, siteSettings?.theme?.primaryHover]);

  // v3.13 — website theme (Dashboard → Website → Themes) and its accent colour
  const storeTheme = themeOf(siteSettings);
  useEffect(() => {
    const primary = isHexColor(siteSettings?.theme?.primaryColor || '') ? String(siteSettings?.theme?.primaryColor) : '#059669';
    const shades = accentShades(storeTheme.accentColor, primary);
    const root = document.documentElement.style;
    root.setProperty('--glow-accent', shades.accent);
    root.setProperty('--glow-accent-title', shades.title);
    root.setProperty('--glow-accent-ink', shades.ink);
    root.setProperty('--glow-accent-fg', shades.fg);
    root.setProperty('--glow-accent-on-primary', shades.onPrimary);
  }, [storeTheme.accentColor, siteSettings?.theme?.primaryColor]);

  // v3.15 — Add to Cart / Buy Now colours and text size (Dashboard → Product Card)
  // (not on the dashboard, where the Product Card page previews unsaved choices)
  const ctaOnSite = !['admin', 'dashboard', 'pos'].includes(currentView);
  useEffect(() => {
    applyCtaStyle(ctaOnSite ? ctaStyleOf(siteSettings) : DEFAULT_CTA_STYLE);
  }, [JSON.stringify((siteSettings as any)?.cta_button_style || null), ctaOnSite]);

  // v3.15 — website and dashboard fonts (System Configuration → Fonts)
  const fontSide = ['admin', 'dashboard', 'pos'].includes(currentView) ? 'dashboard' : 'website';
  useEffect(() => {
    applyFontConfig(fontConfigOf(siteSettings), fontSide);
  }, [JSON.stringify((siteSettings as any)?.font_config || null), fontSide]);

  // v3.13 — website languages: the switcher's settings, and the dashboard /
  // POS always in English
  const { configure: configureLanguage } = useLanguage();
  const storefrontView = !['admin', 'dashboard', 'pos'].includes(currentView);
  useEffect(() => {
    configureLanguage(siteSettings, storefrontView);
  }, [siteSettings, storefrontView, configureLanguage]);

  /**
   * Browser tab title, meta description and favicon come from
   * Dashboard → Website → Branding. The server already writes the title into
   * index.html, so with nothing configured the tab is left as it is.
   */
  useEffect(() => {
    const seo = siteSettings?.seo_config;
    const title = (seo?.siteTitle || siteSettings?.general?.storeName || '').trim();
    // Landing pages, blog posts and (v3.15) product pages set their own tab title
    if (['landing', 'blog-post', 'blog', 'product'].includes(currentView)) return;
    if (title) document.title = title;
    if (!seo) return;

    const setMeta = (selector: string, attrs: Record<string, string>) => {
      let tag = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement('meta');
        Object.entries(attrs).forEach(([key, value]) => key !== 'content' && tag!.setAttribute(key, value));
        document.head.appendChild(tag);
      }
      if (attrs.content) tag.setAttribute('content', attrs.content);
    };

    if (seo.metaDescription) {
      setMeta('meta[name="description"]', { name: 'description', content: seo.metaDescription });
      setMeta('meta[property="og:description"]', { property: 'og:description', content: seo.metaDescription });
    }
    if (seo.metaKeywords) setMeta('meta[name="keywords"]', { name: 'keywords', content: seo.metaKeywords });
    if (seo.siteTitle) setMeta('meta[property="og:title"]', { property: 'og:title', content: seo.siteTitle });
    if (seo.ogImageUrl) setMeta('meta[property="og:image"]', { property: 'og:image', content: seo.ogImageUrl });

    if (seo.faviconUrl) {
      let icon = document.head.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
      if (!icon) {
        icon = document.createElement('link');
        icon.rel = 'icon';
        document.head.appendChild(icon);
      }
      icon.href = seo.faviconUrl;
    }
  }, [siteSettings?.seo_config, siteSettings?.general?.storeName, currentView]);

  /**
   * Analytics. init() is idempotent, so a settings refresh cannot inject a
   * second pixel, and PageView is fired only from here — the pixel snippet no
   * longer tracks one itself, which is what used to double every session.
   */
  useEffect(() => {
    const marketing = siteSettings?.marketing;
    if (!marketing) return;
    tracking.init({
      metaPixelId: marketing.metaPixelId,
      gtmId: marketing.gtmId,
      ga4Id: marketing.ga4Id,
      capiEnabled: Boolean(marketing.capiEnabled),
      enableMetaPixel: marketing.enableMetaPixel,
      // v3.15 — these two switches never reached the website before
      pixelSource: marketing.pixelSource === 'gtm' ? 'gtm' : 'site',
      dataLayerCustomerData: marketing.dataLayerCustomerData,
      currency: siteSettings?.general?.currencyCode,
    });
  }, [
    siteSettings?.marketing?.metaPixelId,
    siteSettings?.marketing?.gtmId,
    siteSettings?.marketing?.ga4Id,
    siteSettings?.marketing?.capiEnabled,
    siteSettings?.marketing?.enableMetaPixel,
    siteSettings?.marketing?.pixelSource,
    siteSettings?.marketing?.dataLayerCustomerData,
    siteSettings?.general?.currencyCode,
  ]);

  // One PageView per route change (the dedupe window swallows StrictMode's
  // double-invoked effects in development).
  useEffect(() => {
    tracking.pageView(window.location.pathname + window.location.search, document.title);
  }, [currentView, JSON.stringify(viewParams)]);

  // Maintenance switched on while this tab was open: reload, and the server
  // answers with the maintenance page (the dashboard, login and POS stay open)
  useEffect(() => {
    if (['admin', 'login', 'pos', 'reset-password'].includes(currentView)) return;
    let stopped = false;
    const check = () =>
      fetch('/api/maintenance/status', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!stopped && data?.enabled && !data?.preview) window.location.reload();
        })
        .catch(() => undefined);
    check();
    const timer = window.setInterval(check, 3 * 60 * 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [currentView]);

  const handleNavigate = useCallback((view: string, params?: any) => {
    setIsDrawerOpen(false);
    setCurrentView(view);
    setViewParams(params || {});

    // Keep the address bar in sync so reload / back / share all work
    const nextPath = routeToPath(view, params);
    if (nextPath !== window.location.pathname + window.location.search) {
      window.history.pushState({ view, params }, '', nextPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Browser back / forward
  useEffect(() => {
    const onPopState = () => {
      const route = pathToRoute(window.location.pathname, window.location.search);
      setIsDrawerOpen(false);
      setCurrentView(route.view);
      setViewParams(route.params);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /**
   * There is one login page for everyone. Opening /admin or /pos without the
   * right account sends the visitor to that page (with the normal site header
   * and footer) and remembers where they were going, so after the owner signs
   * in they land on exactly the dashboard screen they asked for.
   */
  const RETURN_KEY = 'pharma:return-to';
  const needsDashboard = currentView === 'admin' || currentView === 'dashboard';
  const needsCounter = currentView === 'pos';
  // v3.10 — staff open the dashboard / POS according to the modules ticked for them
  const hasDashboardAccess = canUseDashboard(user);
  const hasCounterAccess = hasPosAccess(user);
  const isBackoffice = user?.role === 'admin' || user?.role === 'staff';
  // Signed-in staff are never sent to the login page: they go to the side they
  // may use, or see a short "no access yet" note.
  const gateBlocked =
    !authLoading && !isBackoffice && ((needsDashboard && !hasDashboardAccess) || (needsCounter && !hasCounterAccess));

  useEffect(() => {
    if (authLoading || user?.role !== 'staff') return;
    if (needsDashboard && !hasDashboardAccess && hasCounterAccess) handleNavigate('pos');
    else if (needsCounter && !hasCounterAccess && hasDashboardAccess) handleNavigate('admin');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.role, needsDashboard, needsCounter, hasDashboardAccess, hasCounterAccess]);

  useEffect(() => {
    if (!gateBlocked) return;
    const here = window.location.pathname;
    // Only a dashboard or POS address is worth returning to. The effect can
    // run again once the address already reads /login, and saving that would
    // "return" the owner to the login page after a successful sign-in.
    if (/^\/(admin|dashboard|pos)(\/|$)/.test(here)) {
      try {
        sessionStorage.setItem(RETURN_KEY, here + window.location.search);
      } catch {
        /* private mode — the visitor simply lands on the default page after login */
      }
    }
    const nextPath = routeToPath('login');
    // Replace rather than push, so Back does not bounce the visitor straight
    // into the gate again.
    if (here !== nextPath) window.history.replaceState({ view: 'login', params: {} }, '', nextPath);
    setCurrentView('login');
    setViewParams({});
  }, [gateBlocked]);

  /** Where to go after a successful sign-in */
  const afterSignIn = (loggedUser?: { role?: string; permissions?: string[] } | null) => {
    let back = '';
    try {
      back = sessionStorage.getItem(RETURN_KEY) || '';
      sessionStorage.removeItem(RETURN_KEY);
    } catch {
      back = '';
    }
    if (back) {
      const [pathPart, queryPart = ''] = back.split('?');
      const route = pathToRoute(pathPart, queryPart ? `?${queryPart}` : '');
      const allowed =
        route.view === 'admin' || route.view === 'dashboard'
          ? canUseDashboard(loggedUser)
          : route.view === 'pos'
          ? hasPosAccess(loggedUser)
          : true;
      if (allowed) {
        handleNavigate(route.view, route.params);
        return;
      }
    }
    handleNavigate(landingViewForRole(loggedUser));
  };

  /** Shown above the login form when the visitor was sent here from a dashboard link */
  const loginNotice = (() => {
    try {
      const back = sessionStorage.getItem(RETURN_KEY) || '';
      if (back.startsWith('/admin') || back.startsWith('/dashboard')) {
        return 'Sign in with the store owner account to open the dashboard.';
      }
      if (back.startsWith('/pos')) return 'Sign in with an owner or staff account to open the POS.';
    } catch {
      /* ignore */
    }
    return '';
  })();

  /** A hero banner's button: another site opens in a new tab, a shop link in place */
  const openHeroLink = (url?: string) => {
    if (!url) return;
    if (/^(https?:)?\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      const route = resolveMenuUrl(url);
      handleNavigate(route.view, route.params);
    }
  };

  // Product click -> real single product page (no modal / quick-view popup)
  const handleSelectProduct = (product: Product) => {
    handleNavigate('product', { slug: product.slug, id: product.id, product });
  };

  // Buy Now must not open the side cart — it goes straight to checkout.
  // (Add to cart is what opens the drawer.)
  const handleQuickBuy = () => {
    setIsCartDrawerOpen(false);
    handleNavigate('checkout');
  };

  const handleOrderSuccess = (order: Order) => {
    setLastPlacedOrder(order);
    handleNavigate('order-success');
  };

  const handleTrackOrder = (orderNum: string) => {
    setTrackingOrderNumber(orderNum);
    handleNavigate('track');
  };

  // Role based landing after login
  const landingViewForRole = (who?: { role?: string; permissions?: string[] } | null) => {
    if (who?.role === 'admin') return 'admin';
    // Staff land in the dashboard when they have a dashboard module, else at the counter
    if (who?.role === 'staff') return canUseDashboard(who) || !hasPosAccess(who) ? 'admin' : 'pos';
    return 'account';
  };

  // v3.10 — grid or slide for each home section (Dashboard → Website → Home Sections).
  // "All Products" was always a grid, so its "auto" stays a grid.
  const homeSections = (siteSettings as any)?.home_sections_config as HomeSectionsConfig | undefined;
  const allProductsChoice = sectionLayoutOf(homeSections, 'allProducts');
  const allProductsLayout: SectionLayout = allProductsChoice === 'auto' ? 'grid' : allProductsChoice;
  const allRail = useRail(Math.min(10, products.length));

  // Every category flagged for the home page, at any depth, in dashboard order
  const homeCategories = useMemo(() => {
    const flagged: Category[] = [];
    const walk = (nodes: Category[]) =>
      nodes.forEach((node) => {
        if (node.showOnHome) flagged.push(node);
        walk(node.children || []);
      });
    walk(categoryTree);
    return flagged.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [categoryTree]);

  if (access?.blocked && !BLOCK_EXEMPT_VIEWS.includes(currentView)) {
    return (
      <BlockedScreen
        message={access.message}
        reason={access.reason}
        storeName={siteSettings?.logo_config?.pharmacyName || siteSettings?.general?.storeName || ''}
      />
    );
  }

  // Fullscreen POS Terminal (staff + admin only)
  if (currentView === 'pos') {
    // Without access the effect above moves the visitor to the login page
    if (authLoading) return <FullScreenLoader />;
    if (!hasCounterAccess) return isBackoffice && !hasDashboardAccess ? <NoAccessScreen onHome={() => handleNavigate('home')} onSignOut={signOut} name={user?.name} /> : <FullScreenLoader />;
    return (
      <React.Suspense fallback={<FullScreenLoader />}>
        <LicenseGate
          mode="pos"
          onBackToStore={() => handleNavigate('home')}
          onOpenLicense={() => handleNavigate('admin', { tab: 'license' })}
          storeName={siteSettings?.logo_config?.pharmacyName || siteSettings?.general?.storeName}
          logoUrl={siteSettings?.logo_config?.desktopLogoUrl}
        >
          <PosTerminal
            onBackToStore={() => handleNavigate('home')}
            onOpenDashboard={hasDashboardAccess ? () => handleNavigate('admin', {}) : undefined}
          />
        </LicenseGate>
      </React.Suspense>
    );
  }

  // Admin dashboard (admin only)
  if (currentView === 'admin' || currentView === 'dashboard') {
    if (authLoading) return <FullScreenLoader />;
    if (!hasDashboardAccess) return isBackoffice && !hasCounterAccess ? <NoAccessScreen onHome={() => handleNavigate('home')} onSignOut={signOut} name={user?.name} /> : <FullScreenLoader />;
    return (
      <React.Suspense fallback={<FullScreenLoader />}>
        <LicenseGate mode="admin">
        <AdminLayout
          initialTab={viewParams.tab || 'dashboard'}
          onTabChange={(tab: string) => {
            // Keep the dashboard page in the address bar so a reload or a
            // shared link opens the same screen.
            setViewParams((prev: any) => ({ ...prev, tab }));
            const nextPath = `/admin/${tab}`;
            if (window.location.pathname !== nextPath) {
              window.history.pushState({ view: 'admin', tab }, '', nextPath);
            }
          }}
          onBackToStore={() => {
            refreshSettings(true);
            loadCatalog(true);
            handleNavigate('home');
          }}
          onOpenPos={() => handleNavigate('pos')}
        />
        </LicenseGate>
      </React.Suspense>
    );
  }

  // Landing pages stand alone: no store header, footer, menus or chat
  if (currentView === 'landing') {
    return (
      <React.Suspense fallback={<FullScreenLoader />}>
        <LandingPageView slug={viewParams.slug} settings={siteSettings} />
        <LicenseNotice />
      </React.Suspense>
    );
  }

  const header = (
    <Header
      settings={siteSettings}
      categories={categories}
      categoryTree={categoryTree}
      onNavigate={handleNavigate}
      onOpenCart={() => setIsCartDrawerOpen(true)}
      onOpenLogin={() => handleNavigate('login')}
      onOpenPos={() => handleNavigate('pos')}
      onOpenAdmin={() => handleNavigate('admin')}
      onOpenMenu={() => openDrawer('menu')}
      currentView={currentView}
      currentParams={viewParams}
      heroBelow={currentView === 'home' && banners.some((banner) => (banner.status || 'active') === 'active' && banner.imageUrl)}
    />
  );
  const footer = (
    // No grey stand-in: a painted block here would be pushed down as the page
    // above it grows, which counts as layout shift (CLS)
    <React.Suspense fallback={null}>
      <Footer settings={siteSettings} onNavigate={handleNavigate} />
    </React.Suspense>
  );
  const drawer = menuDrawerUsed ? (
    <React.Suspense fallback={null}>
    <MobileDrawer
      open={isDrawerOpen}
      onClose={closeDrawer}
      onNavigate={handleNavigate}
      settings={siteSettings}
      categoryTree={categoryTree}
      categoriesLoading={isCatalogLoading}
      focusSection={drawerSection}
      currentView={currentView}
      currentParams={viewParams}
      onOpenAdmin={() => handleNavigate('admin')}
    />
    </React.Suspense>
  ) : null;

  if (currentView === 'signup') {
    return (
      <>
        <React.Suspense fallback={<FullScreenLoader />}>
          <SignupPage
            key={viewParams.type || 'regular'}
            mode={viewParams.type === 'wholesale' ? 'wholesale' : 'regular'}
            onSwitchMode={(mode) => handleNavigate('signup', mode === 'wholesale' ? { type: 'wholesale' } : {})}
            settings={siteSettings}
            onSignupSuccess={(newUser) => handleNavigate(landingViewForRole(newUser))}
            onOpenLogin={() => handleNavigate('login')}
            header={header}
            footer={footer}
          />
        </React.Suspense>
        {drawer}
      </>
    );
  }

  // Standalone login page — wrapped in the storefront header/footer
  if (currentView === 'login') {
    return (
      <>
        <React.Suspense fallback={<FullScreenLoader />}>
        <LoginPage
          settings={siteSettings}
          notice={loginNotice}
          onBackToHome={() => handleNavigate('home')}
          onLoginSuccess={afterSignIn}
          onOpenSignup={() => handleNavigate('signup')}
          onOpenWholesaleSignup={() => handleNavigate('signup', { type: 'wholesale' })}
          header={header}
          footer={footer}
        />
        </React.Suspense>
        {drawer}
      </>
    );
  }

  if (currentView === 'reset-password') {
    return (
      <>
        <React.Suspense fallback={<FullScreenLoader />}>
          <ResetPasswordPage token={viewParams.token} onNavigate={handleNavigate} header={header} footer={footer} />
        </React.Suspense>
        {drawer}
      </>
    );
  }

  const bottomNavVisible = isMobileNavVisible(siteSettings, currentView);
  // v3.11 — the checkout's order bar and the product page's buy bar also sit
  // fixed at the bottom on phones; keep the footer's last line above them
  const pageBottomBar =
    currentView === 'checkout' ||
    (currentView === 'product' && (siteSettings as any)?.product_page_config?.stickyBuyBar !== false);

  return (
    <div
      className={`min-h-screen bg-(--ds-bg) text-(--ds-text) flex flex-col font-sans overflow-x-clip ${
        bottomNavVisible || pageBottomBar ? 'pb-[calc(var(--ds-s-16)+env(safe-area-inset-bottom))] lg:pb-0' : ''
      }`}
    >
      <TopBar
        settings={siteSettings}
        onTrackOrder={() => handleNavigate('track')}
        onOpenPos={() => handleNavigate('pos')}
        onOpenAdmin={() => handleNavigate('admin')}
      />

      {header}

      <main className="flex-1">
        {/* One boundary for every lazily loaded route below */}
        <React.Suspense fallback={<RouteSkeleton />}>
          {currentView === 'home' && storeTheme.home === 'glow' && (
            <React.Suspense
              fallback={
                <>
                  <HeroSlider banners={banners} loading={isSettingsLoading} />
                  <RouteSkeleton />
                </>
              }
            >
              <GlowHome
                settings={siteSettings}
                products={products}
                categories={categories}
                homeCategories={homeCategories}
                categoryTree={categoryTree}
                brands={brands}
                banners={banners}
                catalogLoading={isCatalogLoading}
                settingsLoading={isSettingsLoading}
                onNavigate={handleNavigate}
                onSelectProduct={handleSelectProduct}
                onQuickBuy={handleQuickBuy}
                onHeroAction={openHeroLink}
              />
            </React.Suspense>
          )}

          {currentView === 'home' && storeTheme.home === 'luxe' && (
            <React.Suspense
              fallback={
                <>
                  <HeroSlider banners={banners} loading={isSettingsLoading} />
                  <RouteSkeleton />
                </>
              }
            >
              <LuxeHome
                settings={siteSettings}
                products={products}
                categories={categories}
                homeCategories={homeCategories}
                categoryTree={categoryTree}
                brands={brands}
                banners={banners}
                catalogLoading={isCatalogLoading}
                settingsLoading={isSettingsLoading}
                onNavigate={handleNavigate}
                onSelectProduct={handleSelectProduct}
                onQuickBuy={handleQuickBuy}
                onHeroAction={openHeroLink}
              />
            </React.Suspense>
          )}

          {currentView === 'home' && storeTheme.home === 'classic' && (
            <div className="pb-(--ds-s-12)">
              {/* Hero: banners across the page, or categories + banner (v3.14, Website → Hero Banners) */}
              <HomeHero
                settings={siteSettings}
                banners={banners}
                loading={isSettingsLoading}
                categoryTree={categoryTree}
                onNavigate={handleNavigate}
                onActionClick={openHeroLink}
              />

              {/* Each home section rises into view as it is scrolled to (src/lib/reveal.ts) */}
              <div data-reveal-children className="space-y-(--ds-s-10) sm:space-y-(--ds-s-12) pt-(--ds-s-8) sm:pt-(--ds-s-10)">
                <div className="max-w-7xl mx-auto px-(--ds-s-4) empty:hidden">
                  <FlashSaleSection
                    products={products}
                    loading={isCatalogLoading}
                    config={siteSettings?.flash_sale_config}
                    layout={sectionLayoutOf(homeSections, 'flashSale')}
                    cardConfig={siteSettings?.product_card_config}
                    onSelectProduct={handleSelectProduct}
                    onQuickBuy={handleQuickBuy}
                    onViewAll={() => handleNavigate('offers')}
                  />
                </div>

                <CategoryGrid
                  categories={categories}
                  loading={isCatalogLoading}
                  autoSlide={homeSections?.categoryAutoSlide !== false}
                  slideSeconds={homeSections?.categorySlideSeconds}
                  layout={homeSections?.categoryLayout === 'grid' ? 'grid' : 'slide'}
                  gridColumnsMobile={homeSections?.categoryGridMobile}
                  gridColumnsDesktop={homeSections?.categoryGridDesktop}
                  design={homeSections?.categoryDesign}
                  onSelectCategory={(slug) => handleNavigate('shop', slug ? { category: slug } : {})}
                />

                {/* v3.12 — the products the owner marked "New Arrival" */}
                <DeferredSection minHeight={1}>
                  <NewArrivalSection
                    settings={siteSettings}
                    onSelectProduct={handleSelectProduct}
                    onQuickBuy={handleQuickBuy}
                    onViewAll={() => handleNavigate('shop', { newArrival: true })}
                  />
                </DeferredSection>

                <DeferredSection minHeight={560}>
                <section className="max-w-7xl mx-auto px-(--ds-s-4)">
                  <div className="flex items-center justify-between gap-(--ds-s-3) mb-(--ds-s-4)">
                    <h2 className="text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">
                      All Products
                    </h2>
                    <div className="flex items-center gap-(--ds-s-2) shrink-0">
                      {allProductsLayout === 'slide' && <RailArrows edges={allRail.edges} step={allRail.step} label="products" layout="slide" />}
                      <StoreLink
                        to={{ view: 'shop', params: {} }}
                        onNavigate={handleNavigate}
                        className="group shrink-0 inline-flex items-center gap-(--ds-s-1) h-(--ds-h-sm) px-(--ds-s-3) rounded-(--ds-r-full) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] transition-colors"
                      >
                        <span className="sm:hidden">View All</span>
                        <span className="hidden sm:inline">View All Products</span>
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                      </StoreLink>
                    </div>
                  </div>

                  {isCatalogLoading && products.length === 0 ? (
                    <ProductGridSkeleton />
                  ) : products.length === 0 ? (
                    <EmptyState message="No products have been added yet." />
                  ) : (
                    <div ref={allRail.ref} className={railLayout(allProductsLayout).track}>
                      {products.slice(0, 10).map((prod) => (
                        <div key={prod.id} className={railLayout(allProductsLayout).item}>
                          <ProductCard
                            product={prod}
                            config={siteSettings?.product_card_config}
                            onSelect={handleSelectProduct}
                            onQuickBuy={handleQuickBuy}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                </DeferredSection>

                {/* Brand logos, right under All Products (on/off in Dashboard → Brands) */}
                <DeferredSection minHeight={1}>
                <HomeBrandsSection
                  brands={brands}
                  config={siteSettings?.home_brands_config}
                  loading={isCatalogLoading}
                  onNavigate={handleNavigate}
                />
                </DeferredSection>

                {/* One section per category the admin flagged for the home page */}
                {homeCategories.map((cat) => (
                  <DeferredSection key={cat.id} minHeight={520}>
                    <CategorySection
                      category={cat}
                      settings={siteSettings}
                      catalog={products}
                      limit={10}
                      onSelectProduct={handleSelectProduct}
                      onQuickBuy={handleQuickBuy}
                      onViewAll={(slug) => handleNavigate('shop', { category: slug })}
                    />
                  </DeferredSection>
                ))}

                {/* Business information, review screenshots, the latest blog posts
                    and the videos — the last things before the footer (each hides
                    itself when off or empty) */}
                {/* v3.14 — trust & certificates, then the factory & lab (each on/off in Website → Trust & Facility) */}
                <DeferredSection minHeight={1}>
                  <React.Suspense fallback={null}>
                    <div className="space-y-(--ds-s-10) sm:space-y-(--ds-s-12) empty:hidden">
                      <TrustSection settings={siteSettings} />
                      <FacilitySection settings={siteSettings} />
                    </div>
                  </React.Suspense>
                </DeferredSection>

                <DeferredSection minHeight={240}>
                  <ServiceFeatures config={siteSettings?.service_features} />
                  <React.Suspense fallback={null}>
                    <ReviewImagesSection config={siteSettings?.review_images_config} />
                    <BlogSection config={siteSettings?.blog_config} onNavigate={handleNavigate} />
                  </React.Suspense>
                </DeferredSection>

                {/* v3.12 — call / WhatsApp / short message form, then the
                    YouTube videos right above the footer (each on/off in
                    Dashboard → Website → Home Sections) */}
                <DeferredSection minHeight={1}>
                  <React.Suspense fallback={null}>
                    <HomeContactSection settings={siteSettings} />
                    <HomeVideosSection settings={siteSettings} />
                  </React.Suspense>
                </DeferredSection>
              </div>
            </div>
          )}

          {currentView === 'shop' && (
            <ShopView
              key={`${viewParams.category || ''}|${viewParams.flashSale ? 1 : 0}|${viewParams.newArrival ? 1 : 0}|${viewParams.search || ''}|${viewParams.brand || ''}|${viewParams.generic || ''}`}
              products={products}
              initialSearch={viewParams.search}
              isLoading={isCatalogLoading}
              categories={categories}
              brands={brands}
              initialCategory={viewParams.category}
              initialFlashSale={viewParams.flashSale}
              initialNewArrival={viewParams.newArrival}
              onSelectProduct={handleSelectProduct}
              settings={siteSettings}
              onQuickBuy={handleQuickBuy}
              initialBrand={viewParams.brand}
              initialGeneric={viewParams.generic}
              onNavigate={handleNavigate}
            />
          )}

          {currentView === 'product' && (
            <ProductDetailView
              slug={viewParams.slug}
              initialProduct={viewParams.product}
              settings={siteSettings}
              allProducts={products}
              onNavigate={handleNavigate}
              onSelectProduct={handleSelectProduct}
            />
          )}

          {currentView === 'offers' && (
            <OffersView
              products={products}
              settings={siteSettings}
              onSelectProduct={handleSelectProduct}
              onNavigate={handleNavigate}
              onQuickBuy={handleQuickBuy}
            />
          )}

          {currentView === 'wishlist' && (
            <WishlistView onSelectProduct={handleSelectProduct} onNavigate={handleNavigate} />
          )}

          {currentView === 'account' && (
            <AccountView
              onNavigate={handleNavigate}
              onOpenLogin={() => handleNavigate('login')}
              settings={siteSettings}
            />
          )}

          {/* CMS / policy pages (about, contact, faq, privacy, terms, return, shipping) */}
          {currentView === 'page' && viewParams.slug === 'contact' && <ContactView settings={siteSettings} />}
          {currentView === 'page' && viewParams.slug !== 'contact' && (
            <DynamicPageView
              slug={viewParams.slug}
              settings={siteSettings}
              onBackToHome={() => handleNavigate('home')}
            />
          )}

          {currentView === 'cart' && <CartView settings={siteSettings} onNavigate={handleNavigate} />}

          {currentView === 'checkout' && (
            <CheckoutView
              onBack={() => handleNavigate('home')}
              onOrderSuccess={handleOrderSuccess}
              settings={siteSettings}
            />
          )}

          {currentView === 'order-success' && lastPlacedOrder && (
            <OrderSuccessView
              order={lastPlacedOrder}
              settings={siteSettings}
              onTrack={(ordNum) => handleTrackOrder(ordNum)}
              onContinueShopping={() => handleNavigate('shop')}
            />
          )}

          {currentView === 'invoice' && viewParams?.orderNumber && (
            <CustomerInvoiceView
              orderNumber={viewParams.orderNumber}
              phone={viewParams.phone}
              currency={siteSettings?.general?.currency || '৳'}
              onClose={() => handleNavigate('home')}
            />
          )}

          {currentView === 'track' && (
            <OrderTrackingView initialOrderNumber={viewParams?.orderNumber || trackingOrderNumber} settings={siteSettings} />
          )}

          {currentView === 'blog' && (
            <BlogListView config={siteSettings?.blog_config} initialCategory={viewParams.category} onNavigate={handleNavigate} />
          )}
          {currentView === 'blog-post' && viewParams.slug && <BlogPostView key={viewParams.slug} slug={viewParams.slug} onNavigate={handleNavigate} />}

          {currentView === 'payment-result' && (
            <PaymentResultView
              params={viewParams}
              settings={siteSettings}
              onNavigate={handleNavigate}
              onTrack={(orderNumber) => handleTrackOrder(orderNumber)}
            />
          )}
        </React.Suspense>
      </main>

      {/* The footer is drawn when the visitor scrolls near it (DeferredSection) */}
      <DeferredSection minHeight={420}>{footer}</DeferredSection>

      {/* Cart drawer is driven by a single source of truth (CartContext) */}
      {cartDrawerUsed && (
      <React.Suspense fallback={null}>
      <CartDrawer
        settings={siteSettings}
        onCheckout={() => {
          setIsCartDrawerOpen(false);
          handleNavigate('checkout');
        }}
        onContinueShopping={() => {
          setIsCartDrawerOpen(false);
          handleNavigate('cart');
        }}
      />
      </React.Suspense>
      )}

      {drawer}

      <MobileBottomNav
        settings={siteSettings}
        currentView={currentView}
        currentParams={viewParams}
        onNavigate={handleNavigate}
        onOpenCategories={() => openDrawer('categories')}
        onOpenCart={() => setIsCartDrawerOpen(true)}
      />

      <LicenseNotice />

      {/* v3.11 — back-to-top button, kept clear of the bottom bars and the chat button */}
      <ScrollTopButton settings={siteSettings} currentView={currentView} />

      <React.Suspense fallback={null}>
      <ChatWidget
        settings={siteSettings}
        raised={bottomNavVisible || pageBottomBar}
        currentView={currentView}
        currentProduct={(() => {
          if (currentView !== 'product') return null;
          const viewed =
            products.find(
              (item) => item.slug === viewParams.slug || String(item.id) === String(viewParams.id || viewParams.slug)
            ) || (viewParams.product?.slug ? viewParams.product : null);
          return viewed ? { name: viewed.name, url: `${window.location.origin}/product/${viewed.slug}` } : null;
        })()}
      />
      </React.Suspense>
    </div>
  );
}

/** v3.10 — a staff account with nothing ticked in Staff & Access */
const NoAccessScreen: React.FC<{ name?: string; onHome: () => void; onSignOut: () => void }> = ({ name, onHome, onSignOut }) => (
  <div className="min-h-screen flex items-center justify-center bg-(--ds-bg) px-(--ds-s-4)">
    <div className="ds-card p-(--ds-s-8) text-center max-w-md">
      <h1 className="text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text)">No access yet{name ? `, ${name}` : ''}</h1>
      <p className="mt-(--ds-s-2) text-(length:--ds-fs-base) text-(--ds-text-soft) leading-(--ds-lh-normal)">
        Your account is active, but nothing has been turned on for it. Ask the shop owner to tick the pages you need in
        Dashboard → Staff &amp; Access, then reload this page.
      </p>
      <div className="mt-(--ds-s-5) flex items-center justify-center gap-(--ds-s-2)">
        <button type="button" className="ds-btn ds-btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
        <button type="button" className="ds-btn ds-btn-secondary" onClick={onHome}>
          Website
        </button>
        <button
          type="button"
          className="ds-btn ds-btn-ghost"
          onClick={() => {
            onSignOut();
            onHome();
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  </div>
);

const FullScreenLoader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-(--ds-bg)">
    <div className="flex flex-col items-center gap-(--ds-s-3)">
      <span className="ds-spinner w-8 h-8" />
      <span className="text-(length:--ds-fs-sm) font-(--ds-fw-medium) text-(--ds-text-soft)">Loading...</span>
    </div>
  </div>
);

/** Stand-in for a lazily loaded page while its code arrives */
const RouteSkeleton: React.FC = () => (
  <div className="max-w-7xl mx-auto px-(--ds-s-4) py-(--ds-s-8) space-y-(--ds-s-6)" aria-busy="true">
    <div className="ds-skeleton h-7 w-48" />
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-(--ds-s-6)">
      <div className="lg:col-span-2 space-y-(--ds-s-3)">
        <div className="ds-skeleton h-24 rounded-(--ds-r-lg)" />
        <div className="ds-skeleton h-24 rounded-(--ds-r-lg)" />
        <div className="ds-skeleton h-24 rounded-(--ds-r-lg)" />
      </div>
      <div className="ds-skeleton h-64 rounded-(--ds-r-lg)" />
    </div>
  </div>
);

const ProductGridSkeleton: React.FC = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-(--ds-s-2) min-[480px]:gap-(--ds-s-3) md:gap-(--ds-s-4)">
    {Array.from({ length: 10 }).map((_, i) => (
      <ProductCardSkeleton key={i} />
    ))}
  </div>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="py-(--ds-s-16) text-center border border-dashed border-(--ds-border-strong) rounded-(--ds-r-lg) bg-(--ds-surface)">
    <p className="text-(length:--ds-fs-base) font-(--ds-fw-medium) text-(--ds-text-soft)">{message}</p>
  </div>
);
