import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CreditCard,
  RefreshCw,
  Globe,
  LayoutDashboard,
  ShoppingBag,
  Package,
  Boxes,
  Truck,
  Users,
  Settings,
  Search,
  FileText,
  X,
  Save,
  Layers,
  KeyRound,
  AlertTriangle,
  SlidersHorizontal,
  Bell,
  Menu as MenuIcon,
  LogOut,
  ShieldCheck,
  BarChart3,
  ShieldAlert,
  UserCog,
  Ticket,
  ListTree,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Calculator as CalculatorIcon,
  PackageX,
  ShoppingCart,
  User as UserIcon,
  Store,
  Megaphone,
  MessageSquare,
  ShoppingBag as CatalogIcon,
  Construction,
  MessageCircle as ChatIcon,
  Rocket,
  LayoutTemplate,
  Newspaper,
  Images,
  Code2,
  Receipt,
  Palette,
  Languages,
  MessagesSquare,
} from 'lucide-react';
import { useTheme, THEME_PRESETS } from '../../context/ThemeContext.tsx';
import { ThemeColorFields } from './ThemeColorFields.tsx';
import { useLicense } from '../../lib/license.ts';
import { AdminLicensePage } from './AdminLicensePage.tsx';
import { Product, Category, Brand, Order, Supplier, Customer, Coupon, SiteSettings } from '../../types/index.ts';
import type { ConfigSection } from './AdminSystemConfig.tsx';
import { SidebarItem, SidebarGroup, SidebarSection, SidebarAccessContext } from './AdminSidebarNav.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { canOpenTab, firstAllowedTab, hasModule, hasPosAccess, isAdminUser, type PermissionModule } from '../../lib/permissions.ts';
import { Button, Card, Field, IconButton, useToasts, tint, ErrorState, SectionLoader } from './ui.tsx';
import { MiniCalculator } from './MiniCalculator.tsx';
import { dropAllCachedResponses, syncCacheVersion } from '../../lib/dataCache.ts';
import { PageErrorBoundary } from './PageErrorBoundary.tsx';

/* v3.9 — every dashboard page loads on first use (smaller first download) */
const lazyPage = <T extends React.ComponentType<any>>(load: () => Promise<T>) => React.lazy(() => load().then((component) => ({ default: component })));
const AdminOffersTab = lazyPage(() => import('./AdminOffersTab.tsx').then((m) => m.AdminOffersTab));
const AdminPagesTab = lazyPage(() => import('./AdminPagesTab.tsx').then((m) => m.AdminPagesTab));
const AdminHeaderLogoTab = lazyPage(() => import('./AdminHeaderLogoTab.tsx').then((m) => m.AdminHeaderLogoTab));
const AdminCategoryManager = lazyPage(() => import('./AdminCategoryManager.tsx').then((m) => m.AdminCategoryManager));
const AdminOrdersPage = lazyPage(() => import('./AdminOrdersPage.tsx').then((m) => m.AdminOrdersPage));
const AdminIncompleteOrdersPage = lazyPage(() => import('./AdminIncompleteOrdersPage.tsx').then((m) => m.AdminIncompleteOrdersPage));
const AdminAccountSettingsTab = lazyPage(() => import('./AdminAccountSettingsTab.tsx').then((m) => m.AdminAccountSettingsTab));
const AdminBannerTab = lazyPage(() => import('./AdminBannerTab.tsx').then((m) => m.AdminBannerTab));
const AdminCheckoutTab = lazyPage(() => import('./AdminCheckoutTab.tsx').then((m) => m.AdminCheckoutTab));
const AdminSystemConfig = lazyPage(() => import('./AdminSystemConfig.tsx').then((m) => m.AdminSystemConfig));
const AdminWebsiteSettings = lazyPage(() => import('./AdminWebsiteSettings.tsx').then((m) => m.AdminWebsiteSettings));
const AdminDashboardHome = lazyPage(() => import('./AdminDashboardHome.tsx').then((m) => m.AdminDashboardHome));
const AdminProductsPage = lazyPage(() => import('./AdminProductsPage.tsx').then((m) => m.AdminProductsPage));
const AdminSuppliersPage = lazyPage(() => import('./AdminSuppliersPage.tsx').then((m) => m.AdminSuppliersPage));
const AdminCouponsPage = lazyPage(() => import('./AdminCouponsPage.tsx').then((m) => m.AdminCouponsPage));
const AdminCustomersPage = lazyPage(() => import('./AdminCustomersPage.tsx').then((m) => m.AdminCustomersPage));
const AdminAttributesPage = lazyPage(() => import('./AdminAttributesPage.tsx').then((m) => m.AdminAttributesPage));
const AdminBrandsPage = lazyPage(() => import('./AdminBrandsPage.tsx').then((m) => m.AdminBrandsPage));
const AdminWholesalePage = lazyPage(() => import('./AdminWholesalePage.tsx').then((m) => m.AdminWholesalePage));
const AdminSalesReportPage = lazyPage(() => import('./AdminSalesReportPage.tsx').then((m) => m.AdminSalesReportPage));
const AdminWholesalePricesPage = lazyPage(() => import('./AdminWholesalePricesPage.tsx').then((m) => m.AdminWholesalePricesPage));
const AdminGenericsPage = lazyPage(() => import('./AdminGenericsPage.tsx').then((m) => m.AdminGenericsPage));
const AdminReturnsPage = lazyPage(() => import('./AdminReturnsPage.tsx').then((m) => m.AdminReturnsPage));
const AdminMessagesPage = lazyPage(() => import('./AdminMessagesPage.tsx').then((m) => m.AdminMessagesPage));
const AdminLiveChatPage = lazyPage(() => import('./AdminLiveChatPage.tsx').then((m) => m.AdminLiveChatPage));
const AdminSmsPage = lazyPage(() => import('./AdminSmsPage.tsx').then((m) => m.AdminSmsPage));
const AdminFraudPage = lazyPage(() => import('./AdminFraudPage.tsx').then((m) => m.AdminFraudPage));
const AdminCatalogPage = lazyPage(() => import('./AdminCatalogPage.tsx').then((m) => m.AdminCatalogPage));
const AdminChatWidgetPage = lazyPage(() => import('./AdminChatWidgetPage.tsx').then((m) => m.AdminChatWidgetPage));
const AdminIpBlockPage = lazyPage(() => import('./AdminIpBlockPage.tsx').then((m) => m.AdminIpBlockPage));
const AdminStaffPage = lazyPage(() => import('./AdminStaffPage.tsx').then((m) => m.AdminStaffPage));
const AdminReportsPage = lazyPage(() => import('./AdminReportsPage.tsx').then((m) => m.AdminReportsPage));
const AdminCourierReportPage = lazyPage(() => import('./AdminCourierReportPage.tsx').then((m) => m.AdminCourierReportPage));
const AdminMenuBuilder = lazyPage(() => import('./AdminMenuBuilder.tsx').then((m) => m.AdminMenuBuilder));
const AdminInventoryPage = lazyPage(() => import('./AdminInventoryPage.tsx').then((m) => m.AdminInventoryPage));
const AdminFooterTab = lazyPage(() => import('./AdminFooterTab.tsx').then((m) => m.AdminFooterTab));
const AdminProductCardTab = lazyPage(() => import('./AdminProductCardTab.tsx').then((m) => m.AdminProductCardTab));
const AdminSizeGuidesPage = lazyPage(() => import('./AdminSizeGuidesPage.tsx').then((m) => m.AdminSizeGuidesPage));
const AdminReviewsPage = lazyPage(() => import('./AdminReviewsPage.tsx').then((m) => m.AdminReviewsPage));
const AdminProductPageTab = lazyPage(() => import('./AdminProductPageTab.tsx').then((m) => m.AdminProductPageTab));
const AdminBlogPage = lazyPage(() => import('./AdminBlogPage.tsx').then((m) => m.AdminBlogPage));
const AdminReviewImagesPage = lazyPage(() => import('./AdminReviewImagesPage.tsx').then((m) => m.AdminReviewImagesPage));
const AdminLandingPages = lazyPage(() => import('./AdminLandingPages.tsx').then((m) => m.AdminLandingPages));
const AdminExpensesPage = lazyPage(() => import('./AdminExpensesPage.tsx').then((m) => m.AdminExpensesPage));


interface AdminLayoutProps {
  onBackToStore: () => void;
  onOpenPos: () => void;
  /** Tab taken from the URL (/admin/<tab>) */
  initialTab?: string;
  /** Reports the active tab back so the URL can be updated */
  onTabChange?: (tab: string) => void;
}

/** Where the collapsed/expanded choice is remembered, per browser */
const SIDEBAR_KEY = 'admin:sidebar-collapsed';

const CONFIG_SECTIONS: ConfigSection[] = ['shipping', 'payments', 'integrations', 'pixel', 'tags', 'social', 'theme', 'fonts', 'maintenance', 'email', 'invoice', 'orders', 'code', 'demo'];

/** Every tab that opens System Configuration (old links like /admin/maintenance included) */
const isConfigTab = (tab: string) => tab.startsWith('cfg-') || tab === 'settings' || tab === 'maintenance';

const configSectionOf = (tab: string): ConfigSection => {
  if (tab === 'maintenance') return 'maintenance';
  const section = tab.replace(/^cfg-/, '') as ConfigSection;
  return CONFIG_SECTIONS.includes(section) ? section : 'shipping';
};

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  onBackToStore,
  onOpenPos,
  initialTab,
  onTabChange,
}) => {
  const { colors, setPreset, setCustomColors, saveThemeToServer, loading: themeSaving } = useTheme();

  const [requestedTab, setActiveTabState] = useState<string>(initialTab || 'dashboard');
  const licenseCtx = useLicense();
  const licenseStatus = licenseCtx.status;
  /**
   * No active license: the dashboard opens, but only its License page (and
   * Account & Security) — everything else waits until the key is activated.
   * The server refuses those APIs anyway; this keeps the screen calm.
   */
  const licenseLocked = Boolean(licenseStatus && (!licenseStatus.operational || !licenseStatus.domainMatches));
  const LICENSE_FREE_TABS = ['license', 'account'];

  /**
   * v3.10 — staff accounts. `can(tab)` says whether the signed-in account may
   * open a page; `has(module)` whether a module was ticked for it. The menu,
   * the pages and the data this shell loads all follow it (the server checks
   * the same list on every request).
   */
  const { user } = useAuth();
  const isAdmin = isAdminUser(user);
  const permissionKey = isAdmin ? 'admin' : (user?.permissions || []).join(',');
  const has = useCallback((...modules: PermissionModule[]) => hasModule(user, ...modules), [permissionKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const can = useCallback(
    (tab: string) => (tab === 'pos-link' ? hasPosAccess(user) : canOpenTab(user, tab)),
    [permissionKey] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const homeTab = firstAllowedTab(user) || 'dashboard';
  const permittedTab = can(requestedTab) ? requestedTab : homeTab;
  const noAccessHere = !can(permittedTab);
  const activeTab = licenseLocked && !LICENSE_FREE_TABS.includes(requestedTab) ? 'license' : permittedTab;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const lockedNoticeAt = useRef(0);
  const setActiveTab = (tab: string) => {
    if (!licenseLocked && !can(tab)) {
      window.dispatchEvent(new CustomEvent('pharma:admin-toast', { detail: { message: 'Your account does not have access to that page.', kind: 'info' } }));
      return;
    }
    const next = licenseLocked && !LICENSE_FREE_TABS.includes(tab) ? 'license' : tab;
    if (next !== tab && Date.now() - lockedNoticeAt.current > 4000) {
      lockedNoticeAt.current = Date.now();
      window.dispatchEvent(new CustomEvent('pharma:admin-toast', { detail: { message: 'Activate your license first — the rest of the dashboard opens right after.', kind: 'info' } }));
    }
    setActiveTabState(next);
    onTabChange?.(next);
  };

  useEffect(() => {
    if (initialTab && initialTab !== requestedTab) setActiveTabState(initialTab);
  }, [initialTab]);
  // A staff member who opens a page they cannot use lands on their first allowed page
  useEffect(() => {
    if (!licenseLocked && activeTab !== requestedTab && can(activeTab)) onTabChange?.(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, requestedTab, licenseLocked]);

  // Scroll back to the top when the page changes — a long table left the next
  // page scrolled halfway down.
  const contentRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  /* ------------------------------------------------------------------ data */
  const [stats, setStats] = useState<any>(null);
  const [ordersList, setOrdersList] = useState<Order[]>([]);
  const [productsList, setProductsList] = useState<Product[]>([]);
  /** The Offers picker lists only published products, as before */
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [brandsList, setBrandsList] = useState<Brand[]>([]);
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
  const [couponsList, setCouponsList] = useState<Coupon[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [inventoryData, setInventoryData] = useState<{ stockList: any[]; recentTransactions: any[] }>({
    stockList: [],
    recentTransactions: [],
  });
  const [incompleteCount, setIncompleteCount] = useState(0);
  /** Stored notifications (e.g. new wholesale registrations) + pending wholesale count */
  const [storedNotes, setStoredNotes] = useState<{
    notifications: Array<{ id: number; title: string; body?: string; linkTab?: string; isRead: boolean; createdAt?: string }>;
    unread: number;
    pendingWholesale: number;
    newMessages?: number;
  }>({ notifications: [], unread: 0, pendingWholesale: 0, newMessages: 0 });
  /** An order handed over from Orders → "Return items" */
  const [returnOrderNumber, setReturnOrderNumber] = useState<string | undefined>(undefined);
  /** Orders list opened from a landing page's order count */
  const [ordersLandingPageId, setOrdersLandingPageId] = useState<number | undefined>(undefined);

  const loadNotifications = useCallback(() => {
    fetch('/api/admin/notifications')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setStoredNotes(data))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (licenseLocked) return;
    loadNotifications();
    // New registrations show up without reloading the dashboard
    const timer = window.setInterval(loadNotifications, 60000);
    return () => window.clearInterval(timer);
  }, [loadNotifications, licenseLocked]);
  const markNotificationRead = (id?: number) => {
    fetch('/api/admin/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { id } : {}),
    })
      .then(loadNotifications)
      .catch(() => undefined);
  };
  /* v3.14 — live chat: unread count for the sidebar badge, with a sound and
     the count in the browser tab when a customer writes */
  const [liveChat, setLiveChat] = useState({ unread: 0, enabled: false, latest: -1 });
  const liveLatest = useRef(-1);
  const canLiveChat = has('customers', 'orders');
  const loadLiveChat = useCallback(() => {
    fetch('/api/admin/live-chat/summary', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const latest = Number(data.latestCustomerMessageId) || 0;
        const unread = Number(data.unreadConversations) || 0;
        if (liveLatest.current >= 0 && latest > liveLatest.current && unread > 0 && activeTabRef.current !== 'live-chat') {
          import('./AdminLiveChatPage.tsx').then((m) => m.soundOn() && m.playChatSound()).catch(() => undefined);
        }
        liveLatest.current = latest;
        setLiveChat({ unread, enabled: Boolean(data.enabled), latest });
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (licenseLocked || !canLiveChat) return;
    loadLiveChat();
    const timer = window.setInterval(() => document.visibilityState === 'visible' && loadLiveChat(), 15000);
    return () => window.clearInterval(timer);
  }, [loadLiveChat, licenseLocked, canLiveChat]);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
    document.title = liveChat.unread > 0 ? `(${liveChat.unread}) ${base}` : base;
  }, [liveChat.unread]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({});
  const maintenanceOn = Boolean((siteSettings as any)?.maintenance_config?.enabled);

  // During maintenance the owner still sees the real site (signed preview cookie)
  useEffect(() => {
    if (maintenanceOn && !licenseLocked && has('settings')) fetch('/api/admin/maintenance/preview', { method: 'POST' }).catch(() => undefined);
  }, [maintenanceOn, licenseLocked, has]);

  const currency = siteSettings?.general?.currency || '৳';
  const storeName = siteSettings?.general?.storeName || '';

  // The session token is attached by the global fetch interceptor (src/lib/api.ts)
  const authed = (url: string) => fetch(url);

  const loadDashboard = useCallback(() => {
    if (!has('dashboard')) return;
    fetch('/api/dashboard/stats')
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setStats({
            ...data,
            last7DaysData: Array.isArray(data.last7DaysData) ? data.last7DaysData : [],
            paymentChart: Array.isArray(data.paymentChart) ? data.paymentChart : [],
            recentOrders: Array.isArray(data.recentOrders) ? data.recentOrders : [],
          });
        }
      })
      .catch(() => {
        /* the dashboard shows its own empty state */
      });
  }, [has]);

  const loadOrders = useCallback(() => {
    authed('/api/admin/orders?status=all')
      .then((res) => res.json())
      .then((data) => setOrdersList(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // v3.15 — the dashboard no longer keeps the whole catalogue in memory: the
  // top search asks the server, and the Offers page loads its own products.
  const loadProducts = useCallback(() => undefined, []);

  const loadInventory = useCallback(() => {
    if (!has('inventory')) return;
    // v3.15 — only the products that need attention (low or out), counted on the server
    authed('/api/admin/inventory?filter=alert&pageSize=100')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data === 'object') {
          setInventoryData({
            stockList: Array.isArray(data.stockList) ? data.stockList : [],
            alertCount: Number(data.total) || (Array.isArray(data.stockList) ? data.stockList.length : 0),
            recentTransactions: Array.isArray(data.recentTransactions) ? data.recentTransactions : [],
          });
        }
      })
      .catch(() => {});
  }, [has]);

  const loadCategories = useCallback(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setCategoriesList(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const loadIncomplete = useCallback(() => {
    authed('/api/admin/incomplete-orders')
      .then((res) => res.json())
      .then((data) => setIncompleteCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
  }, []);

  /**
   * What the server holds for each settings key, as last loaded or saved here.
   * A save sends only the keys that differ from it, so an old copy of one
   * section can never overwrite what was changed elsewhere (another tab,
   * another device, an upload) — that is how a new logo or banner used to be
   * quietly replaced by the previous one.
   */
  const savedSettingsRef = React.useRef<Record<string, string>>({});
  const snapshotSettings = (data: Record<string, any>) => {
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(data || {})) next[key] = JSON.stringify(value ?? null);
    savedSettingsRef.current = next;
  };

  const [settingsState, setSettingsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const loadSettings = useCallback(
    () =>
      authed('/api/admin/settings')
        .then((res) => (res.ok ? res.json() : fetch('/api/settings').then((plain) => plain.json())))
        .then((data) => {
          const clean = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
          if (!clean) throw new Error('bad settings');
          snapshotSettings(clean);
          setSiteSettings(clean);
          setSettingsState('ready');
        })
        .catch(() => setSettingsState((current) => (current === 'ready' ? 'ready' : 'error'))),
    []
  );

  /** Screens whose forms start from the saved settings */
  const SETTINGS_SCREENS = [
    'product-page', 'blog', 'review-images', 'chat-widget', 'live-chat', 'offers', 'navigation',
    'pages', 'header', 'checkout', 'footer', 'product-card',
  ];
  const holdForSettings =
    settingsState !== 'ready' &&
    (SETTINGS_SCREENS.includes(activeTab) || activeTab.startsWith('web-') || isConfigTab(activeTab));
  const shownTab = holdForSettings || (noAccessHere && !licenseLocked) ? '' : activeTab;

  useEffect(() => {
    // Logo and store name for the header, licensed or not
    loadSettings();
    if (licenseLocked) return;
    // Only what this account may read is asked for (the server would refuse the rest)
    if (has('dashboard')) loadDashboard();
    if (has('orders')) loadOrders();
    loadProducts();
    if (has('inventory')) loadInventory();
    loadCategories();
    if (has('orders')) loadIncomplete();
    fetch('/api/brands').then((r) => r.json()).then((d) => setBrandsList(Array.isArray(d) ? d : [])).catch(() => {});
    if (has('suppliers', 'purchases')) authed('/api/admin/suppliers').then((r) => r.json()).then((d) => setSuppliersList(Array.isArray(d) ? d : [])).catch(() => {});
    if (has('coupons')) authed('/api/admin/coupons').then((r) => r.json()).then((d) => setCouponsList(Array.isArray(d) ? d : [])).catch(() => {});
  }, [licenseLocked, has]);

  /** Re-pull everything this shell owns. Used by Clear Cache and after imports. */
  const refreshAll = async () => {
    if (has('dashboard')) loadDashboard();
    if (has('orders')) loadOrders();
    loadProducts();
    if (has('inventory')) loadInventory();
    loadCategories();
    if (has('orders')) loadIncomplete();
    await Promise.all([
      loadSettings(),
      fetch('/api/brands').then((r) => r.json()).then((d) => setBrandsList(Array.isArray(d) ? d : [])).catch(() => {}),
      has('suppliers', 'purchases') ? authed('/api/admin/suppliers').then((r) => r.json()).then((d) => setSuppliersList(Array.isArray(d) ? d : [])).catch(() => {}) : null,
      has('coupons') ? authed('/api/admin/coupons').then((r) => r.json()).then((d) => setCouponsList(Array.isArray(d) ? d : [])).catch(() => {}) : null,

    ]);
  };

  /** Shop details for invoices: plus the website logo and payment method names */
  const invoiceGeneral = useMemo(
    () => ({
      ...(siteSettings?.general || {}),
      logoUrl: (siteSettings as any)?.logo_config?.desktopLogoUrl || (siteSettings as any)?.logo_config?.mobileLogoUrl || '',
      paymentMethods: ((siteSettings as any)?.payment?.methods || []).map((method: any) => ({ id: method?.id, name: method?.name })),
    }),
    [siteSettings]
  );

  /* --------------------------------------------------------------- settings */
  const [settingsSaved, setSettingsSaved] = useState(false);

  const handleSaveFullSettings = async (newSettings: SiteSettings) => {
    try {
      const changed: Record<string, any> = {};
      for (const [key, value] of Object.entries(newSettings || {})) {
        if (JSON.stringify(value ?? null) !== savedSettingsRef.current[key]) changed[key] = value;
      }
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changed),
      });
      // A refused save used to be reported as saved, so the storefront never
      // changed and nothing said why.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Could not save settings.');
      }
      // Images pasted into a setting come back as uploaded file links
      const saved = await res.json().catch(() => null);
      const stored = saved?.data && typeof saved.data === 'object' ? { ...newSettings, ...saved.data } : newSettings;
      for (const key of Object.keys(changed)) {
        savedSettingsRef.current[key] = JSON.stringify((stored as any)[key] ?? null);
      }
      setSiteSettings(stored);
      setSettingsSaved(true);
      // The storefront listens for this and re-reads settings, so a logo, menu or
      // footer change shows up without anyone reloading the page.
      window.dispatchEvent(new CustomEvent('pharma:settings-updated'));
      window.setTimeout(() => setSettingsSaved(false), 3000);
    } catch (error: any) {
      toasts.push(error?.message || 'Could not save settings.', 'error');
      // Callers (every settings screen) show their own "could not save" state
      throw error;
    }
  };

  /* ------------------------------------------------------------------ shell */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userCollapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'true';
    } catch {
      return false;
    }
  });
  /**
   * v3.10 — on a narrow desktop window (small laptop, or the browser zoomed to
   * 125–150%) the menu folds to its icon rail by itself, so tables keep their
   * columns instead of turning into cards. The arrow at the bottom still opens
   * it, and that choice holds until the window is wide again.
   */
  const [narrowDesktop, setNarrowDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches);
  const [openedWhileNarrow, setOpenedWhileNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1279px)');
    const onChange = () => {
      setNarrowDesktop(query.matches);
      if (!query.matches) setOpenedWhileNarrow(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  const collapsed = narrowDesktop ? !openedWhileNarrow : userCollapsed;
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const toasts = useToasts();
  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.message) toasts.push(detail.message, detail.kind || 'info');
    };
    window.addEventListener('pharma:admin-toast', onToast);
    return () => window.removeEventListener('pharma:admin-toast', onToast);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCollapsed = () => {
    if (narrowDesktop) {
      setOpenedWhileNarrow((value) => !value);
      return;
    }
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next));
      } catch {
        /* the choice just won't persist */
      }
      return next;
    });
  };

  /**
   * Clear Cache.
   *
   * It bumps a version counter stored in the database and drops the cached
   * COPIES held in this browser. Nothing in the backend is deleted and nobody is
   * signed out — which is what used to go wrong: clearing after a colour change
   * appeared to lose data. Every device picks the new version up on its next
   * request and re-reads from the database. The page is never reloaded; only the
   * icon spins.
   */
  const handleClearCache = async () => {
    if (cacheBusy) return;
    setCacheBusy(true);
    try {
      await fetch('/api/admin/cache/flush', {
        method: 'POST',
      });
    } catch {
      /* the local drop below is still worth doing */
    }

    try {
      dropAllCachedResponses();
      await syncCacheVersion(true);
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      /* private mode blocks storage — the refetch below still runs */
    }

    try {
      await refreshAll();
      window.dispatchEvent(new CustomEvent('pharma:settings-updated'));
      toasts.push('Cache cleared. No data was deleted and everything has been reloaded.');
    } catch {
      toasts.push('Some data could not be refreshed.', 'error');
    } finally {
      setCacheBusy(false);
    }
  };

  /* ---------------------------------------------------------- global search */
  /**
   * Searches what is already in memory — orders, products and customers — so
   * results appear as the operator types, with no request per keystroke.
   */
  /**
   * v3.15 — asks the server (a few orders, products and customers that match),
   * 250 ms after the last key. It used to search lists kept in the browser,
   * which meant loading every product and customer when the dashboard opened.
   */
  const [searchHits, setSearchHits] = useState<{ orders: any[]; products: any[]; customers: any[] }>({ orders: [], products: [], customers: [] });
  useEffect(() => {
    const term = globalSearch.trim();
    if (term.length < 2) {
      setSearchHits({ orders: [], products: [], customers: [] });
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      authed(`/api/admin/search?q=${encodeURIComponent(term)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => !cancelled && data && setSearchHits({ orders: data.orders || [], products: data.products || [], customers: data.customers || [] }))
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [globalSearch]);
  const searchResults = useMemo(() => {
    if (globalSearch.trim().length < 2) return [];
    const results: Array<{ kind: string; label: string; detail: string; icon: any; onOpen: () => void }> = [];
    searchHits.orders.forEach((order: any) =>
      results.push({
        kind: 'Order',
        label: order.orderNumber,
        detail: `${order.customerName || ''} · ${currency}${order.total}`,
        icon: ShoppingCart,
        onOpen: () => setActiveTab('orders'),
      })
    );
    searchHits.products.forEach((product: any) =>
      results.push({
        kind: 'Product',
        label: product.name,
        detail: `${product.sku || ''} · Stock ${product.stock}`,
        icon: Package,
        onOpen: () => setActiveTab('products'),
      })
    );
    searchHits.customers.forEach((customer: any) =>
      results.push({
        kind: 'Customer',
        label: customer.name,
        detail: customer.phone || '',
        icon: UserIcon,
        onOpen: () => setActiveTab('customers'),
      })
    );
    return results.slice(0, 12);
  }, [globalSearch, searchHits, currency]);

  /* Notifications: things that actually need attention right now */
  const notifications = useMemo(() => {
    const list: Array<{ text: string; tone: string; onOpen: () => void; sub?: string }> = [];
    if (liveChat.unread > 0) {
      list.push({
        text: `${liveChat.unread} live chat${liveChat.unread === 1 ? '' : 's'} waiting for a reply`,
        tone: 'var(--ds-danger)',
        onOpen: () => setActiveTab('live-chat'),
      });
    }
    if ((storedNotes.newMessages || 0) > 0) {
      list.push({
        text: `${storedNotes.newMessages} new message${storedNotes.newMessages === 1 ? '' : 's'} from the Contact page`,
        tone: 'var(--ds-info)',
        onOpen: () => setActiveTab('messages'),
      });
    }
    if (maintenanceOn) {
      list.push({
        text: 'Maintenance mode is ON — visitors cannot see the website',
        tone: 'var(--ds-warning)',
        onOpen: () => setActiveTab('cfg-maintenance'),
      });
    }
    if (storedNotes.pendingWholesale > 0) {
      list.push({
        text: `${storedNotes.pendingWholesale} wholesale ${
          storedNotes.pendingWholesale === 1 ? 'registration is' : 'registrations are'
        } waiting for approval`,
        tone: 'var(--ds-indigo)',
        onOpen: () => setActiveTab('wholesale-customers'),
      });
    }
    storedNotes.notifications
      .filter((note) => !note.isRead)
      .slice(0, 6)
      .forEach((note) => {
        list.push({
          text: note.title,
          sub: note.body || undefined,
          tone: 'var(--primary)',
          onOpen: () => {
            markNotificationRead(note.id);
            if (note.linkTab) setActiveTab(note.linkTab as any);
          },
        });
      });
    if (stats?.pendingOrders > 0) {
      list.push({
        text: `${stats.pendingOrders} ${stats.pendingOrders === 1 ? 'order' : 'orders'} waiting to be processed`,
        tone: 'var(--ds-info)',
        onOpen: () => setActiveTab('orders'),
      });
    }
    if (incompleteCount > 0) {
      list.push({
        text: `${incompleteCount} incomplete ${incompleteCount === 1 ? 'order' : 'orders'}. A quick call could recover the sale.`,
        tone: 'var(--ds-amber)',
        onOpen: () => setActiveTab('orders-incomplete'),
      });
    }
    const lowStock = (inventoryData as any).alertCount ?? inventoryData.stockList.length;
    if (lowStock > 0) {
      list.push({
        text: `${lowStock} ${lowStock === 1 ? 'product is' : 'products are'} low on stock`,
        tone: 'var(--ds-danger)',
        onOpen: () => setActiveTab('inventory'),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, incompleteCount, inventoryData, storedNotes, maintenanceOn]);

  /* ------------------------------------------------------------ theme panel */
  /* Theme & Styling lives inside System Configuration, built once here. */
  const THEME_PANEL = (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="font-bold" style={{ fontSize: 'var(--a-fs-xl)' }}>
          Theme & Colors
        </h2>
        <p style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
          Pick a preset or your own colour. You see it here straight away — press{' '}
          <b>Save Theme</b> to put it on the website, dashboard and POS for everyone.
        </p>
      </div>

      <Card>
        <h3 className="font-bold mb-3" style={{ fontSize: 'var(--a-fs-md)' }}>
          Presets
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {Object.entries(THEME_PRESETS).map(([key, value]) => {
            const isSelected = colors.preset === key;
            return (
              <button
                key={key}
                onClick={() => setPreset(key)}
                className="p-3 text-left transition-all cursor-pointer"
                style={{
                  borderRadius: 'var(--ds-r-lg)',
                  border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--a-border)'}`,
                  background: isSelected ? tint(0.07) : 'var(--a-surface)',
                  boxShadow: isSelected ? 'var(--ds-ring)' : 'none',
                }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className="rounded-full"
                    style={{ width: 20, height: 20, backgroundColor: value.primaryColor }}
                  />
                  <span
                    className="rounded-full"
                    style={{ width: 13, height: 13, backgroundColor: value.primaryHover }}
                  />
                </div>
                <div
                  className="font-bold uppercase"
                  style={{ fontSize: 'var(--a-fs-sm)', letterSpacing: '0.04em' }}
                >
                  {key}
                </div>
                <div
                  className="ds-num mt-0.5"
                  style={{ fontSize: 'var(--a-fs-2xs)', color: 'var(--a-text-faint)' }}
                >
                  {value.primaryColor}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-3" style={{ fontSize: 'var(--a-fs-md)' }}>
          Your own colour
        </h3>
        <ThemeColorFields colors={colors} setCustomColors={setCustomColors} />

        <div
          className="mt-4 pt-4 flex items-center justify-between gap-3 flex-wrap"
          style={{ borderTop: '1px solid var(--a-border)' }}
        >
          <span style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
            Saved colors are stored in the database, so clearing the cache will not reset them.
          </span>
          <Button
            variant="primary"
            icon={Save}
            loading={themeSaving}
            onClick={async () => {
              try {
                await saveThemeToServer();
                toasts.push('Theme saved — the website now uses these colours.', 'success');
              } catch (error: any) {
                toasts.push(error?.message || 'Could not save the theme.', 'error');
              }
            }}
          >
            Save Theme
          </Button>
        </div>
      </Card>
    </div>
  );

  const lowStockRows = inventoryData.stockList.filter(
    (item: any) => item.stock <= (item.lowStockThreshold ?? 10)
  );

  const sidebarWidth = collapsed ? 'var(--a-sidebar-w-collapsed)' : 'var(--a-sidebar-w)';

  /* ------------------------------------------------------------------ render */
  return (
    <div className="admin-shell admin-dash min-h-screen flex flex-col">
      {toasts.node}

      {/* =====================================================================
          HEADER — global search, cache, calculator, POS, storefront, account
          ===================================================================== */}
      <header
        className="sticky top-0 flex items-center gap-2 sm:gap-3 px-3 sm:px-5 border-b shrink-0"
        style={{
          height: 'var(--a-header-h)',
          background: 'var(--a-surface)',
          borderColor: 'var(--a-border)',
          zIndex: 'var(--ds-z-header)' as any,
        }}
      >
        <button
          onClick={() => setMobileNavOpen(true)}
          className="lg:hidden inline-flex items-center justify-center cursor-pointer shrink-0"
          style={{
            width: 'var(--ds-h-md)',
            height: 'var(--ds-h-md)',
            borderRadius: 'var(--ds-r-md)',
            background: 'var(--a-surface-2)',
            border: '1px solid var(--a-border)',
          }}
          aria-label="Open navigation"
        >
          <MenuIcon className="w-4 h-4" />
        </button>

        {/* Brand. The logo alone when there is one (it already carries the name);
            the store name only stands in when no logo has been uploaded. */}
        <div
          className="hidden lg:flex items-center gap-2.5 shrink-0 overflow-hidden"
          style={{ width: sidebarWidth, transition: 'width var(--ds-dur) var(--ds-ease)' }}
        >
          {siteSettings?.logo_config?.desktopLogoUrl ? (
            <img
              src={siteSettings.logo_config.desktopLogoUrl}
              alt={storeName || 'Store'}
              className="h-10 w-auto object-contain shrink-0"
              style={{ maxWidth: collapsed ? 40 : 200 }}
            />
          ) : (
            <span
              className="inline-flex items-center justify-center font-bold text-(--primary-foreground) shrink-0"
              style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--ds-r-md)',
                background: 'var(--primary)',
                fontSize: 'var(--a-fs-lg)',
              }}
            >
              {(storeName || 'S').charAt(0).toUpperCase()}
            </span>
          )}
          {!collapsed && storeName && !siteSettings?.logo_config?.desktopLogoUrl && (
            <span className="font-bold truncate" style={{ fontSize: 'var(--a-fs-lg)' }}>
              {storeName}
            </span>
          )}
        </div>

        {/* Global search */}
        <div className="flex-1 min-w-0 max-w-xl relative">
          <Search
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--a-text-muted)' }}
          />
          <input
            value={globalSearch}
            onChange={(event) => {
              setGlobalSearch(event.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearchOpen(false);
              if (event.key === 'Enter' && searchResults[0]) {
                searchResults[0].onOpen();
                setSearchOpen(false);
              }
            }}
            placeholder="Search orders, products or customers..."
            className="w-full outline-none"
            style={{
              height: 'var(--ds-h-md)',
              paddingLeft: 38,
              paddingRight: 12,
              borderRadius: 'var(--ds-r-md)',
              background: 'var(--a-surface-2)',
              border: '1px solid var(--a-border)',
              fontSize: 'var(--a-fs-md)',
            }}
          />

          {searchOpen && globalSearch.trim().length >= 2 && (
            <>
              <div className="fixed inset-0" onClick={() => setSearchOpen(false)} />
              <div
                className="absolute left-0 right-0 mt-1.5 p-1.5 ds-fade-in"
                style={{
                  background: 'var(--a-surface)',
                  border: '1px solid var(--a-border)',
                  borderRadius: 'var(--ds-r-lg)',
                  boxShadow: 'var(--ds-shadow-lg)',
                  zIndex: 'var(--ds-z-dropdown)' as any,
                }}
              >
                {searchResults.length === 0 ? (
                  <p
                    className="px-3 py-4 text-center"
                    style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}
                  >
                    No results found
                  </p>
                ) : (
                  searchResults.map((result, index) => {
                    const ResultIcon = result.icon;
                    return (
                      <button
                        key={index}
                        onClick={() => {
                          result.onOpen();
                          setSearchOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left cursor-pointer transition-colors"
                        style={{ borderRadius: 'var(--ds-r-sm)' }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.background = 'var(--a-surface-2)';
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span
                          className="inline-flex items-center justify-center shrink-0"
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 'var(--ds-r-sm)',
                            background: tint(0.1),
                            color: 'var(--primary-ink, var(--primary))',
                          }}
                        >
                          <ResultIcon className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                            {result.label}
                          </span>
                          <span
                            className="block truncate"
                            style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                          >
                            {result.detail}
                          </span>
                        </span>
                        <span
                          className="shrink-0 px-1.5 py-0.5 font-semibold"
                          style={{
                            fontSize: 'var(--a-fs-2xs)',
                            borderRadius: 'var(--ds-r-xs)',
                            background: 'var(--a-surface-3)',
                            color: 'var(--a-text-muted)',
                          }}
                        >
                          {result.kind}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={handleClearCache}
            disabled={cacheBusy}
            title="Clear cache. No data is deleted and the page does not reload."
            className="font-semibold items-center gap-2 cursor-pointer hidden sm:inline-flex disabled:opacity-70"
            style={{
              height: 'var(--ds-h-md)',
              padding: '0 12px',
              borderRadius: 'var(--ds-r-md)',
              background: 'var(--a-surface)',
              border: '1px solid var(--a-border-strong)',
              color: 'var(--a-text-soft)',
              fontSize: 'var(--a-fs-md)',
            }}
          >
            <RefreshCw className={`w-4 h-4 ${cacheBusy ? 'animate-spin' : ''}`} />
            <span className="hidden xl:inline">Clear Cache</span>
          </button>

          {/* Calculator */}
          <div className="relative">
            <button
              onClick={() => setCalcOpen((value) => !value)}
              title="Calculator"
              className="inline-flex items-center justify-center cursor-pointer"
              style={{
                width: 'var(--ds-h-md)',
                height: 'var(--ds-h-md)',
                borderRadius: 'var(--ds-r-md)',
                background: calcOpen ? tint(0.12) : 'var(--a-surface-2)',
                border: `1px solid ${calcOpen ? tint(0.28) : 'var(--a-border)'}`,
                color: calcOpen ? 'var(--primary-ink, var(--primary))' : 'var(--a-text-soft)',
              }}
            >
              <CalculatorIcon className="w-4 h-4" />
            </button>
            <MiniCalculator
              open={calcOpen}
              onClose={() => setCalcOpen(false)}
              currency={currency}
            />
          </div>

          {can('pos-link') && (
          <button
            onClick={onOpenPos}
            className="font-bold text-(--primary-foreground) cursor-pointer inline-flex items-center gap-2"
            style={{
              height: 'var(--ds-h-md)',
              padding: '0 14px',
              borderRadius: 'var(--ds-r-md)',
              background: 'var(--primary)',
              fontSize: 'var(--a-fs-md)',
            }}
          >
            <CreditCard className="w-4 h-4" />
            <span>POS</span>
          </button>
          )}

          {maintenanceOn && (
            <button
              type="button"
              onClick={() => setActiveTab('cfg-maintenance')}
              title="The website is closed for maintenance"
              className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 font-bold cursor-pointer"
              style={{
                borderRadius: 'var(--ds-r-full)',
                background: 'var(--ds-warning-soft)',
                color: 'var(--ds-warning-text)',
                fontSize: 'var(--a-fs-sm)',
              }}
            >
              <Construction className="w-4 h-4" />
              Maintenance ON
            </button>
          )}

          {/* Opens the live storefront in a new tab so the dashboard stays open */}
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            title="View website (opens in a new tab)"
            aria-label="View website in a new tab"
            className="hidden sm:inline-flex items-center justify-center cursor-pointer"
            style={{
              width: 'var(--ds-h-md)',
              height: 'var(--ds-h-md)',
              borderRadius: 'var(--ds-r-md)',
              background: 'var(--a-surface-2)',
              border: '1px solid var(--a-border)',
            }}
          >
            <Globe className="w-4 h-4" style={{ color: 'var(--a-text-soft)' }} />
          </a>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotifyOpen((value) => !value)}
              title="Notifications"
              className="relative inline-flex items-center justify-center cursor-pointer"
              style={{
                width: 'var(--ds-h-md)',
                height: 'var(--ds-h-md)',
                borderRadius: 'var(--ds-r-md)',
                background: 'var(--a-surface-2)',
                border: '1px solid var(--a-border)',
              }}
            >
              <Bell className="w-4 h-4" style={{ color: 'var(--a-text-soft)' }} />
              {notifications.length > 0 && (
                <span
                  className="absolute -top-1 -right-1 px-1 rounded-full text-white font-bold flex items-center justify-center ds-num"
                  style={{ minWidth: 17, height: 17, background: 'var(--ds-danger)', fontSize: 10 }}
                >
                  {notifications.length}
                </span>
              )}
            </button>

            {notifyOpen && (
              <>
                <div className="fixed inset-0" onClick={() => setNotifyOpen(false)} />
                <div
                  className="absolute right-0 mt-2 p-1.5 ds-fade-in"
                  style={{
                    width: 290,
                    background: 'var(--a-surface)',
                    border: '1px solid var(--a-border)',
                    borderRadius: 'var(--ds-r-lg)',
                    boxShadow: 'var(--ds-shadow-lg)',
                    zIndex: 'var(--ds-z-dropdown)' as any,
                  }}
                >
                  {notifications.length === 0 ? (
                    <p
                      className="px-3 py-4 text-center"
                      style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}
                    >
                      You're all caught up
                    </p>
                  ) : (
                    notifications.map((item, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          item.onOpen();
                          setNotifyOpen(false);
                        }}
                        className="w-full flex items-start gap-2.5 px-2.5 py-2.5 text-left cursor-pointer transition-colors"
                        style={{ borderRadius: 'var(--ds-r-sm)' }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.background = 'var(--a-surface-2)';
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span
                          className="rounded-full shrink-0 mt-1.5"
                          style={{ width: 7, height: 7, background: item.tone }}
                        />
                        <span className="min-w-0">
                          <span className="block" style={{ fontSize: 'var(--a-fs-md)' }}>{item.text}</span>
                          {item.sub && (
                            <span className="block truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                              {item.sub}
                            </span>
                          )}
                        </span>
                      </button>
                    ))
                  )}
                  {storedNotes.unread > 0 && (
                    <button
                      type="button"
                      onClick={() => markNotificationRead()}
                      className="w-full text-center py-2 cursor-pointer font-semibold"
                      style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--primary-ink, var(--primary))', borderTop: '1px solid var(--a-border)' }}
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Account */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((value) => !value)}
              className="flex items-center gap-2 cursor-pointer"
              style={{
                height: 'var(--ds-h-md)',
                padding: '0 6px 0 4px',
                borderRadius: 'var(--ds-r-md)',
                background: 'var(--a-surface-2)',
                border: '1px solid var(--a-border)',
              }}
            >
              <span
                className="inline-flex items-center justify-center font-bold text-(--primary-foreground)"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: 'var(--primary)',
                  fontSize: 'var(--a-fs-sm)',
                }}
              >
                {(user?.name || 'A').trim().charAt(0).toUpperCase() || 'A'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 hidden md:block" style={{ color: 'var(--a-text-muted)' }} />
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0" onClick={() => setUserMenuOpen(false)} />
                <div
                  className="absolute right-0 mt-2 py-1.5 ds-fade-in"
                  style={{
                    width: 216,
                    background: 'var(--a-surface)',
                    border: '1px solid var(--a-border)',
                    borderRadius: 'var(--ds-r-lg)',
                    boxShadow: 'var(--ds-shadow-lg)',
                    zIndex: 'var(--ds-z-dropdown)' as any,
                  }}
                >
                  {!isAdmin && (
                    <div className="px-4 pt-1.5 pb-2" style={{ borderBottom: '1px solid var(--a-border)' }}>
                      <div className="font-bold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>{user?.name || 'Staff'}</div>
                      <div className="truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{user?.jobRole || 'Staff account'}</div>
                    </div>
                  )}
                  {[
                    { label: 'Account & Security', icon: KeyRound, tab: 'account' },
                    { label: 'Staff & Access', icon: UserCog, tab: 'staff' },
                    { label: 'System Configuration', icon: Settings, tab: 'cfg-shipping' },
                  ].filter((entry) => can(entry.tab)).map((entry) => {
                    const EntryIcon = entry.icon;
                    return (
                      <button
                        key={entry.tab}
                        onClick={() => {
                          setActiveTab(entry.tab);
                          setUserMenuOpen(false);
                        }}
                        className="w-full px-4 py-2.5 text-left font-semibold flex items-center gap-2.5 cursor-pointer transition-colors"
                        style={{ fontSize: 'var(--a-fs-md)' }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.background = 'var(--a-surface-2)';
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <EntryIcon className="w-4 h-4" style={{ color: 'var(--a-text-muted)' }} />
                        {entry.label}
                      </button>
                    );
                  })}

                  <span
                    className="block my-1"
                    style={{ height: 1, background: 'var(--a-border)' }}
                  />

                  <button
                    onClick={() => {
                      localStorage.removeItem('pharma_token');
                      window.location.href = '/login';
                    }}
                    className="w-full px-4 py-2.5 text-left font-semibold flex items-center gap-2.5 cursor-pointer transition-colors"
                    style={{ fontSize: 'var(--a-fs-md)', color: 'var(--ds-danger-text)' }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = 'var(--ds-danger-soft)';
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <LogOut className="w-4 h-4" /> Log Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* =====================================================================
          SHELL — sidebar + content
          ===================================================================== */}
      <div className="flex-1 flex min-h-0">
        {mobileNavOpen && (
          <div
            className="fixed inset-0 lg:hidden ds-fade-in"
            style={{ background: 'var(--ds-overlay)', zIndex: 'var(--ds-z-sidebar)' as any }}
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        <aside
          className={`${
            mobileNavOpen ? 'fixed inset-y-0 left-0 flex' : 'hidden lg:flex'
          } shrink-0 flex-col border-r`}
          style={{
            width: mobileNavOpen ? 272 : sidebarWidth,
            background: 'var(--a-surface)',
            borderColor: 'var(--a-border)',
            zIndex: mobileNavOpen ? ('calc(var(--ds-z-sidebar) + 1)' as any) : undefined,
            transition: 'width var(--ds-dur) var(--ds-ease)',
          }}
        >
          <div
            className="lg:hidden flex items-center justify-between px-4 shrink-0 border-b"
            style={{ height: 'var(--a-header-h)', borderColor: 'var(--a-border)' }}
          >
            <span className="font-bold">Menu</span>
            <IconButton icon={X} label="Close menu" onClick={() => setMobileNavOpen(false)} />
          </div>

          <SidebarAccessContext.Provider value={can}>
          <nav
            className="flex-1 overflow-y-auto p-2.5 space-y-0.5"
            onClick={() => setMobileNavOpen(false)}
          >
            <SidebarItem
              id="dashboard"
              label="Dashboard"
              icon={LayoutDashboard}
              activeTab={activeTab}
              onSelect={setActiveTab}
              collapsed={collapsed && !mobileNavOpen}
            />

            {/* v3.15 — every page appears once, grouped by what the owner is doing:
                selling, the catalogue, customers, money, the online store,
                marketing and settings. */}
            <SidebarSection title="Sales" tabs={['orders', 'live-chat', 'landing-pages', 'pos-link']} collapsed={collapsed && !mobileNavOpen} />

            <SidebarGroup
              label="Orders"
              icon={ShoppingBag}
              activeTab={activeTab}
              badge={(stats?.pendingOrders || 0) + incompleteCount}
              collapsed={collapsed && !mobileNavOpen}
              items={[
                { id: 'orders', label: 'All Orders', badge: stats?.pendingOrders },
                { id: 'orders-incomplete', label: 'Incomplete Orders', badge: incompleteCount },
                { id: 'returns', label: 'Returns' },
              ]}
              onSelect={(tab: string) => {
                if (tab === 'orders') setOrdersLandingPageId(undefined);
                setActiveTab(tab);
              }}
            />
            {/* v3.14 — chats from the website's chat box */}
            <SidebarItem
              id="live-chat"
              label="Live Chat"
              icon={MessagesSquare}
              activeTab={activeTab}
              onSelect={setActiveTab}
              badge={liveChat.unread}
              collapsed={collapsed && !mobileNavOpen}
            />
            <SidebarItem
              id="landing-pages"
              label="Landing Pages"
              icon={Rocket}
              activeTab={activeTab}
              onSelect={setActiveTab}
              collapsed={collapsed && !mobileNavOpen}
            />
            <SidebarItem
              id="pos-link"
              label="POS Terminal"
              icon={CreditCard}
              activeTab={activeTab}
              onSelect={() => onOpenPos?.()}
              collapsed={collapsed && !mobileNavOpen}
            />

            <SidebarSection title="Catalog" tabs={['products', 'categories', 'brands', 'attributes', 'inventory', 'purchases']} collapsed={collapsed && !mobileNavOpen} />

            <SidebarGroup
              label="Products"
              icon={Package}
              activeTab={activeTab}
              collapsed={collapsed && !mobileNavOpen}
              items={[
                { id: 'product-new', label: 'Add New Product' },
                { id: 'products', label: 'All Products' },
                { id: 'categories', label: 'Categories' },
                { id: 'brands', label: 'Brands' },
                { id: 'generics', label: 'Generic Names' },
                { id: 'attributes', label: 'Attributes' },
                { id: 'size-guides', label: 'Size Guides' },
                { id: 'reviews', label: 'Reviews' },
              ]}
              onSelect={setActiveTab}
            />
            <SidebarItem
              id="inventory"
              label="Stock Management"
              icon={Boxes}
              activeTab={activeTab}
              onSelect={setActiveTab}
              alert={lowStockRows.length > 0}
              collapsed={collapsed && !mobileNavOpen}
            />
            <SidebarItem
              id="purchases"
              label="Suppliers & Purchases"
              icon={Truck}
              activeTab={activeTab}
              onSelect={setActiveTab}
              collapsed={collapsed && !mobileNavOpen}
            />

            <SidebarSection title="Customers" tabs={['customers', 'messages', 'wholesale-customers']} collapsed={collapsed && !mobileNavOpen} />

            <SidebarGroup
              label="Customers"
              icon={Users}
              activeTab={activeTab}
              badge={storedNotes.pendingWholesale + (storedNotes.newMessages || 0)}
              collapsed={collapsed && !mobileNavOpen}
              items={[
                { id: 'customers', label: 'All Customers' },
                { id: 'messages', label: 'Messages', badge: storedNotes.newMessages },
                { id: 'wholesale-customers', label: 'Wholesale Customers', badge: storedNotes.pendingWholesale },
                { id: 'wholesale-prices', label: 'Wholesale Prices' },
                { id: 'ip-block', label: 'IP Block' },
              ]}
              onSelect={setActiveTab}
            />

            <SidebarSection title="Finance" tabs={['expenses', 'reports', 'reports-sales', 'reports-pos']} collapsed={collapsed && !mobileNavOpen} />

            <SidebarGroup
              label="Reports"
              icon={BarChart3}
              activeTab={activeTab}
              collapsed={collapsed && !mobileNavOpen}
              items={[
                { id: 'reports-sales', label: 'Sales Report' },
                { id: 'reports-pos', label: 'POS Sales Report' },
                { id: 'reports-courier', label: 'Courier Report' },
                { id: 'reports', label: 'Profit & Expenses' },
              ]}
              onSelect={setActiveTab}
            />
            <SidebarGroup
              label="Expenses"
              icon={Receipt}
              activeTab={activeTab}
              collapsed={collapsed && !mobileNavOpen}
              items={[
                { id: 'expenses', label: 'Expense List' },
                { id: 'expense-categories', label: 'Categories' },
                { id: 'expense-report', label: 'Monthly Report' },
              ]}
              onSelect={setActiveTab}
            />

            <SidebarSection title="Online Store" tabs={['web-branding']} collapsed={collapsed && !mobileNavOpen} />

            <SidebarGroup
              label="Store Design"
              icon={Palette}
              activeTab={activeTab}
              collapsed={collapsed && !mobileNavOpen}
              items={[
                { id: 'web-theme', label: 'Themes' },
                { id: 'web-home', label: 'Home Sections' },
                { id: 'web-hero', label: 'Hero Banners' },
                { id: 'web-header', label: 'Header Design' },
                { id: 'product-card', label: 'Product Card' },
                { id: 'product-page', label: 'Product Page' },
                { id: 'checkout', label: 'Checkout Page' },
                { id: 'web-footer', label: 'Footer & Social' },
                { id: 'web-mobile', label: 'Mobile Menu' },
              ]}
              onSelect={setActiveTab}
            />
            <SidebarGroup
              label="Store Content"
              icon={Globe}
              activeTab={activeTab}
              collapsed={collapsed && !mobileNavOpen}
              items={[
                { id: 'web-branding', label: 'Branding & SEO' },
                { id: 'navigation', label: 'Menu Builder' },
                { id: 'web-legal', label: 'Pages & Policies' },
                { id: 'web-trust', label: 'Trust & Facility' },
                { id: 'blog', label: 'Blog' },
                { id: 'review-images', label: 'Review Screenshots' },
                { id: 'web-search', label: 'Search & Shop' },
                { id: 'web-languages', label: 'Languages' },
              ]}
              onSelect={setActiveTab}
            />

            <SidebarSection title="Marketing" tabs={['offers', 'coupons', 'sms', 'catalog', 'chat-widget', 'fraud']} collapsed={collapsed && !mobileNavOpen} />
            {(
              [
                ['offers', 'Offers & Flash Sale', Layers],
                ['coupons', 'Coupons', Ticket],
                ['sms', 'SMS', MessageSquare],
                ['catalog', 'Meta Catalog', CatalogIcon],
                ['chat-widget', 'Chat Widget', ChatIcon],
                ['fraud', 'Fraud Checker', ShieldAlert],
              ] as const
            ).map(([id, label, icon]) => (
              <SidebarItem
                key={id}
                id={id}
                label={label}
                icon={icon}
                activeTab={activeTab}
                onSelect={setActiveTab}
                collapsed={collapsed && !mobileNavOpen}
              />
            ))}

            <SidebarSection title="Settings" tabs={['cfg-shipping', 'staff', 'license', 'account']} collapsed={collapsed && !mobileNavOpen} />

            {/* Shipping, payments, pixel, tags, colours, fonts, maintenance, custom code … */}
            <SidebarItem
              id="cfg-shipping"
              label="System Configuration"
              icon={Settings}
              activeTab={isConfigTab(activeTab) ? 'cfg-shipping' : activeTab}
              onSelect={setActiveTab}
              alert={maintenanceOn}
              collapsed={collapsed && !mobileNavOpen}
            />
            <SidebarItem
              id="staff"
              label="Staff & Access"
              icon={UserCog}
              activeTab={activeTab}
              onSelect={setActiveTab}
              collapsed={collapsed && !mobileNavOpen}
            />
            <SidebarItem
              id="account"
              label="Account & Security"
              icon={ShieldCheck}
              activeTab={activeTab}
              onSelect={setActiveTab}
              collapsed={collapsed && !mobileNavOpen}
            />
            <SidebarItem
              id="license"
              label="License"
              icon={KeyRound}
              activeTab={activeTab}
              onSelect={setActiveTab}
              alert={licenseStatus?.state === 'warning'}
              collapsed={collapsed && !mobileNavOpen}
            />
          </nav>
          </SidebarAccessContext.Provider>

          {/* Foot: the signed-in user, and the collapse control */}
          <div
            className="shrink-0 p-2.5 border-t"
            style={{ borderColor: 'var(--a-border)' }}
          >
            <div className={`flex items-center gap-2 ${collapsed && !mobileNavOpen ? 'justify-center' : ''}`}>
              <button
                onClick={() => (can('account') ? setActiveTab('account') : undefined)}
                className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer transition-colors"
                style={{
                  padding: collapsed && !mobileNavOpen ? 0 : '6px 8px',
                  borderRadius: 'var(--ds-r-md)',
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = 'var(--a-surface-3)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent';
                }}
              >
                <span
                  className="inline-flex items-center justify-center font-bold text-(--primary-foreground) shrink-0"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    background: 'var(--primary)',
                    fontSize: 'var(--a-fs-sm)',
                  }}
                >
                  {(user?.name || 'A').trim().charAt(0).toUpperCase() || 'A'}
                </span>
                {(!collapsed || mobileNavOpen) && (
                  <span className="min-w-0 text-left leading-tight">
                    <span className="block font-bold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                      {user?.name || 'Admin'}
                    </span>
                    <span
                      className="block truncate"
                      style={{ fontSize: 'var(--a-fs-2xs)', color: 'var(--a-text-muted)' }}
                    >
                      {isAdmin ? 'Administrator' : user?.jobRole || 'Staff'}
                    </span>
                  </span>
                )}
              </button>

              {(!collapsed || mobileNavOpen) && (
                <IconButton
                  icon={LogOut}
                  tone="plain"
                  size="sm"
                  label="Log out"
                  onClick={() => {
                    localStorage.removeItem('pharma_token');
                    window.location.href = '/login';
                  }}
                />
              )}
            </div>

            <button
              onClick={toggleCollapsed}
              className="hidden lg:flex items-center justify-center gap-2 w-full mt-2 cursor-pointer font-semibold transition-colors"
              style={{
                height: 32,
                borderRadius: 'var(--ds-r-md)',
                background: 'var(--a-surface-2)',
                border: '1px solid var(--a-border)',
                color: 'var(--a-text-muted)',
                fontSize: 'var(--a-fs-sm)',
              }}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronsRight className="w-4 h-4" />
              ) : (
                <>
                  <ChevronsLeft className="w-4 h-4" />
                  <span>Collapse</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* ------------------------------------------------------------ content */}
        <main
          ref={contentRef as any}
          className="flex-1 min-w-0 overflow-y-auto"
          style={{ padding: 'var(--ds-gutter)' }}
        >
          <div className="mx-auto w-full" style={{ maxWidth: 'var(--ds-page-max)' }}>
            <PageErrorBoundary resetKey={shownTab}>
            <React.Suspense
              fallback={
                <Card>
                  <SectionLoader lines={6} />
                </Card>
              }
            >
            {/* License grace period: the shop keeps working, the owner is told clearly */}
            {licenseStatus?.state === 'warning' && activeTab !== 'license' && (
              <div
                role="alert"
                className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 p-3.5"
                style={{
                  borderRadius: 'var(--ds-r-lg)',
                  background: 'var(--ds-warning-soft)',
                  color: 'var(--ds-warning-text)',
                  border: '1px solid color-mix(in srgb, var(--ds-warning) 35%, transparent)',
                }}
              >
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div className="flex-1 min-w-0" style={{ fontSize: 'var(--a-fs-md)' }}>
                  <span className="font-bold">License: </span>
                  {licenseStatus.message}
                  {licenseStatus.blockAt && !licenseStatus.scheduledOnly
                    ? ` The dashboard, POS and online orders lock on ${new Date(licenseStatus.blockAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}.`
                    : ''}
                </div>
                <Button size="sm" onClick={() => setActiveTab('license')} className="shrink-0">
                  Open License
                </Button>
              </div>
            )}

            {/* Settings screens open only once the saved settings have arrived: a
                form that started from an empty copy would show an empty logo
                or banner field, and saving it would erase the real values. */}
            {holdForSettings && (
              settingsState === 'error' ? (
                <ErrorState message="Could not load your saved settings. Check the connection and try again." onRetry={() => loadSettings()} />
              ) : (
                <Card>
                  <SectionLoader lines={5} />
                </Card>
              )
            )}

            {noAccessHere && !licenseLocked && (
              <Card>
                <div className="text-center py-8">
                  <h2 className="font-bold" style={{ fontSize: 'var(--a-fs-xl)' }}>No dashboard pages are turned on for your account</h2>
                  <p className="mt-2" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
                    Ask the owner to tick what you need in Staff &amp; Access, then reload this page.
                  </p>
                </div>
              </Card>
            )}

            {shownTab === 'license' && licenseStatus && (
              <AdminLicensePage status={licenseStatus} onStatus={licenseCtx.setStatus} onRefresh={licenseCtx.refresh} />
            )}

            {shownTab === 'dashboard' && (
              <AdminDashboardHome
                stats={stats}
                recentOrders={Array.isArray(stats?.recentOrders) ? stats.recentOrders : ordersList}
                lowStock={lowStockRows}
                onOpenOrders={() => setActiveTab('orders')}
                onOpenOrder={() => setActiveTab('orders')}
                onOpenInventory={() => setActiveTab('inventory')}
                onOpenProducts={() => setActiveTab('products')}
                onOpenAccount={can('account') ? () => setActiveTab('account') : undefined}
                currency={currency}
              />
            )}

            {shownTab === 'orders' && (
              <AdminOrdersPage
                key={ordersLandingPageId || 'all'}
                initialLandingPageId={ordersLandingPageId}
                settings={siteSettings}
                mode="all"
                currency={currency}
                invoiceConfig={siteSettings?.invoice_config}
                general={invoiceGeneral}
                onCreateReturn={(orderNumber) => {
                  setReturnOrderNumber(orderNumber);
                  setActiveTab('returns');
                }}
              />
            )}

            {/* Abandoned checkouts — a different dataset, so a page of its own */}
            {shownTab === 'orders-incomplete' && <AdminIncompleteOrdersPage currency={currency} />}

            {shownTab === 'inventory' && (
              <AdminInventoryPage
                onRefresh={() => {
                  loadInventory();
                  loadProducts();
                  loadDashboard();
                }}
              />
            )}

            {(shownTab === 'products' || shownTab === 'product-new') && (
              <AdminProductsPage
                key={shownTab}
                categories={categoriesList}
                brands={brandsList}
                currency={currency}
                onRefresh={() => {
                  loadProducts();
                  loadDashboard();
                }}
                startCreating={shownTab === 'product-new'}
                onOpenTab={setActiveTab}
                shippingZones={siteSettings?.shipping?.zones}
              />
            )}

            {shownTab === 'size-guides' && <AdminSizeGuidesPage />}
            {shownTab === 'reviews' && <AdminReviewsPage onOpenTab={setActiveTab} />}
            {shownTab === 'product-page' && (
              <AdminProductPageTab settings={siteSettings} onSave={handleSaveFullSettings} onOpenTab={setActiveTab} />
            )}
            {shownTab === 'blog' && <AdminBlogPage settings={siteSettings} onSaveSettings={handleSaveFullSettings} />}
            {shownTab === 'review-images' && (
              <AdminReviewImagesPage settings={siteSettings} onSaveSettings={handleSaveFullSettings} />
            )}
            {shownTab === 'landing-pages' && (
              <AdminLandingPages
                currency={currency}
                shippingZones={siteSettings?.shipping?.zones || []}
                onOpenOrders={(landingPageId) => {
                  setOrdersLandingPageId(landingPageId);
                  setActiveTab('orders');
                }}
              />
            )}

            {shownTab === 'purchases' && (
              <AdminSuppliersPage currency={currency} onRefresh={refreshAll} />
            )}

            {shownTab === 'coupons' && <AdminCouponsPage currency={currency} />}

            {(shownTab === 'expenses' || shownTab === 'expense-categories' || shownTab === 'expense-report') && (
              <AdminExpensesPage
                view={shownTab === 'expenses' ? 'list' : shownTab === 'expense-categories' ? 'categories' : 'report'}
                currency={currency}
                onOpenView={(view) => setActiveTab(view === 'list' ? 'expenses' : view === 'categories' ? 'expense-categories' : 'expense-report')}
              />
            )}

            {shownTab === 'customers' && <AdminCustomersPage currency={currency} />}

            {shownTab === 'ip-block' && <AdminIpBlockPage />}

            {shownTab === 'returns' && (
              <AdminReturnsPage
                currency={currency}
                initialOrderNumber={returnOrderNumber}
                onConsumedInitial={() => setReturnOrderNumber(undefined)}
              />
            )}
            {shownTab === 'messages' && <AdminMessagesPage onChanged={loadNotifications} />}
            {shownTab === 'live-chat' && (
              <AdminLiveChatPage settings={siteSettings} onOpenSettings={() => setActiveTab('chat-widget')} onChanged={loadLiveChat} />
            )}
            {shownTab === 'sms' && <AdminSmsPage />}
            {shownTab === 'fraud' && <AdminFraudPage />}
            {shownTab === 'catalog' && <AdminCatalogPage />}
            {shownTab === 'chat-widget' && (
              <AdminChatWidgetPage settings={siteSettings} onSaveSettings={handleSaveFullSettings} />
            )}

            {shownTab === 'wholesale-customers' && (
              <AdminWholesalePage currency={currency} onChanged={loadNotifications} />
            )}
            {shownTab === 'wholesale-prices' && <AdminWholesalePricesPage currency={currency} categories={categoriesList as any} />}

            {shownTab === 'generics' && <AdminGenericsPage />}

            {shownTab === 'attributes' && <AdminAttributesPage />}

            {shownTab === 'staff' && <AdminStaffPage />}

            {shownTab === 'reports' && <AdminReportsPage currency={currency} />}
            {shownTab === 'reports-courier' && <AdminCourierReportPage currency={currency} />}
            {shownTab === 'reports-sales' && (
              <AdminSalesReportPage key="online" channel="online" currency={currency} storeName={siteSettings?.general?.storeName || ''} />
            )}
            {shownTab === 'reports-pos' && (
              <AdminSalesReportPage key="pos" channel="pos" currency={currency} storeName={siteSettings?.general?.storeName || ''} />
            )}

            {shownTab === 'brands' && (
              <AdminBrandsPage
                onRefresh={() => {
                  fetch('/api/brands')
                    .then((res) => res.json())
                    .then((data) => setBrandsList(Array.isArray(data) ? data : []))
                    .catch(() => {});
                }}
              />
            )}

            {shownTab === 'categories' && <AdminCategoryManager onRefreshCategories={loadCategories} />}

            {shownTab === 'offers' && (
              <AdminOffersTab
                products={[]}
                settings={siteSettings}
                onSaveSettings={handleSaveFullSettings}
              />
            )}

            {shownTab === 'navigation' && (
              <AdminMenuBuilder settings={siteSettings} onSaveSettings={handleSaveFullSettings} />
            )}

            {/* Website: branding, footer, hero, legal pages, mobile nav */}
            {shownTab.startsWith('web-') && (
              <AdminWebsiteSettings
                settings={siteSettings}
                onSaveSettings={handleSaveFullSettings}
                initialTab={
                  shownTab === 'web-theme'
                    ? 'theme'
                    : shownTab === 'web-languages'
                    ? 'languages'
                    : shownTab === 'web-header'
                    ? 'header'
                    : shownTab === 'web-home'
                    ? 'home'
                    : shownTab === 'web-trust'
                    ? 'trust'
                    : shownTab === 'web-footer'
                    ? 'footer'
                    : shownTab === 'web-hero'
                    ? 'hero'
                    : shownTab === 'web-legal'
                    ? 'legal'
                    : shownTab === 'web-mobile'
                    ? 'mobile'
                    : shownTab === 'web-search'
                    ? 'search'
                    : 'branding'
                }
                key={shownTab}
              />
            )}

            {/* System configuration: shipping, payments, integrations, pixel, tags,
                theme, maintenance mode, email & password reset, database */}
            {isConfigTab(shownTab) && (
              <AdminSystemConfig
                settings={siteSettings}
                onSaveSettings={handleSaveFullSettings}
                themePanel={THEME_PANEL}
                initialSection={configSectionOf(shownTab)}
                onSectionChange={(section) => setActiveTab(`cfg-${section}`)}
                onOpenTab={setActiveTab}
              />
            )}

            {shownTab === 'pages' && (
              <AdminPagesTab settings={siteSettings} onSaveSettings={handleSaveFullSettings} />
            )}

            {shownTab === 'header' && (
              <AdminHeaderLogoTab settings={siteSettings} onSaveSettings={handleSaveFullSettings} />
            )}

            {shownTab === 'checkout' && (
              <AdminCheckoutTab settings={siteSettings} onSaveSettings={handleSaveFullSettings} />
            )}

            {shownTab === 'banners' && <AdminBannerTab onChanged={() => setSettingsSaved(true)} />}

            {shownTab === 'footer' && (
              <AdminFooterTab settings={siteSettings} onSave={handleSaveFullSettings} />
            )}

            {shownTab === 'product-card' && (
              <AdminProductCardTab settings={siteSettings} onSave={handleSaveFullSettings} />
            )}

            {shownTab === 'account' && <AdminAccountSettingsTab />}
            </React.Suspense>
            </PageErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
};
