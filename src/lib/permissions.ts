/**
 * v3.10 — staff access, in one place.
 *
 * The owner ticks modules for each staff account (Staff & Access). This file
 * says what every module opens — which dashboard pages and which server
 * routes — and is used by BOTH sides:
 *   • the server refuses any request the account's modules do not cover;
 *   • the dashboard hides the menu entries and pages it cannot open.
 * So a staff member sees exactly what was ticked, and nothing else works even
 * if they type an address by hand.
 *
 * Administrators (the owner and "Administrator" accounts) open everything.
 * The License and the owner's own Account & Security stay with the owner.
 */

export const PERMISSION_MODULES = [
  'dashboard',
  'orders',
  'products',
  'categories',
  'brands',
  'attributes',
  'inventory',
  'suppliers',
  'purchases',
  'customers',
  'wholesale',
  'coupons',
  'landing',
  'pos',
  'reports',
  'expenses',
  'salaries',
  'website',
  'marketing',
  'settings',
  'users',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const MODULE_INFO: Record<PermissionModule, { label: string; description: string; group: 'Sales' | 'Catalog' | 'People' | 'Money' | 'Website' | 'System' }> = {
  dashboard: { label: 'Dashboard', description: 'Home page with sales, profit and stock numbers', group: 'Sales' },
  orders: { label: 'Orders', description: 'All orders, incomplete orders, returns, add / edit order, courier', group: 'Sales' },
  pos: { label: 'POS Terminal', description: 'Sell at the counter, hold bills, My Orders', group: 'Sales' },
  landing: { label: 'Landing Pages', description: 'Create and edit landing pages', group: 'Sales' },
  coupons: { label: 'Coupons', description: 'Discount codes', group: 'Sales' },
  products: { label: 'Products', description: 'Add / edit products, generic names, size guides, reviews, import / export', group: 'Catalog' },
  categories: { label: 'Categories', description: 'Product categories', group: 'Catalog' },
  brands: { label: 'Brands', description: 'Product brands', group: 'Catalog' },
  attributes: { label: 'Attributes', description: 'Colour, size and other option lists', group: 'Catalog' },
  inventory: { label: 'Stock Management', description: 'Stock list, adjustments, stock issues', group: 'Catalog' },
  customers: { label: 'Customers', description: 'Customer list, messages, IP block', group: 'People' },
  wholesale: { label: 'Wholesale', description: 'Wholesale customers and wholesale prices', group: 'People' },
  suppliers: { label: 'Suppliers', description: 'Supplier list and payments', group: 'People' },
  users: { label: 'Staff & Access', description: 'Create staff accounts and choose what they can open', group: 'People' },
  purchases: { label: 'Purchases', description: 'Stock purchases and purchase returns', group: 'Money' },
  expenses: { label: 'Expenses', description: 'Expense list, categories, monthly report', group: 'Money' },
  salaries: { label: 'Salaries', description: 'Salary payments (POS back office)', group: 'Money' },
  reports: { label: 'Reports', description: 'Sales report, POS sales report, courier report, profit & expenses', group: 'Money' },
  website: { label: 'Website Design', description: 'Logo, header, banners, menu, footer, product card / page, checkout text, offers, pages, blog', group: 'Website' },
  marketing: { label: 'Marketing & Tools', description: 'SMS messages, fraud checker, Meta catalog, chat widget', group: 'Website' },
  settings: { label: 'System Configuration', description: 'Shipping, payment gateways, courier, SMS gateway, pixel, theme, invoice, email, maintenance — for someone you trust fully', group: 'System' },
};

export const MODULE_GROUPS: Array<(typeof MODULE_INFO)[PermissionModule]['group']> = ['Sales', 'Catalog', 'People', 'Money', 'Website', 'System'];

export interface PermissionUser {
  role?: string;
  permissions?: string[] | null;
  uid?: string;
}

export const isAdminUser = (user?: PermissionUser | null) => user?.role === 'admin';

export function hasModule(user: PermissionUser | null | undefined, ...modules: PermissionModule[]): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'staff') return false;
  const list = Array.isArray(user.permissions) ? user.permissions : [];
  return modules.some((module) => list.includes(module));
}

/** Modules that open something in the website dashboard (everything but the POS-only ones) */
const DASHBOARD_MODULES = PERMISSION_MODULES.filter((module) => module !== 'pos' && module !== 'salaries');

export const hasDashboardAccess = (user?: PermissionUser | null) => hasModule(user, ...DASHBOARD_MODULES);
export const hasPosAccess = (user?: PermissionUser | null) => hasModule(user, 'pos');

/* ------------------------------------------------------------- dashboard */

/** Which module(s) open each dashboard page. 'owner' = administrators only. */
const TAB_MODULES: Record<string, PermissionModule[] | 'admin'> = {
  dashboard: ['dashboard'],
  'product-new': ['products'],
  products: ['products'],
  generics: ['products'],
  'size-guides': ['products'],
  reviews: ['products'],
  categories: ['categories'],
  brands: ['brands'],
  attributes: ['attributes'],
  orders: ['orders'],
  'orders-incomplete': ['orders'],
  returns: ['orders'],
  'landing-pages': ['landing'],
  inventory: ['inventory'],
  customers: ['customers'],
  messages: ['customers'],
  'ip-block': ['customers'],
  'wholesale-customers': ['wholesale'],
  'wholesale-prices': ['wholesale'],
  purchases: ['purchases', 'suppliers'],
  expenses: ['expenses'],
  'expense-categories': ['expenses'],
  'expense-report': ['expenses'],
  coupons: ['coupons'],
  reports: ['reports'],
  'reports-sales': ['reports'],
  'reports-pos': ['reports'],
  'reports-courier': ['reports', 'orders'],
  navigation: ['website'],
  'product-card': ['website'],
  'product-page': ['website'],
  blog: ['website'],
  'review-images': ['website'],
  checkout: ['website'],
  offers: ['website'],
  pages: ['website'],
  header: ['website'],
  footer: ['website'],
  banners: ['website'],
  sms: ['marketing'],
  fraud: ['marketing'],
  catalog: ['marketing'],
  'chat-widget': ['marketing'],
  // v3.14 — live chat inbox: whoever answers customers (messages) or handles orders
  'live-chat': ['customers', 'orders'],
  'cfg-code': 'admin',
  'cfg-backup': 'admin',
  backup: 'admin',
  staff: ['users'],
  license: 'admin',
  account: 'admin',
};

export function tabModules(tab: string): PermissionModule[] | 'admin' {
  if (TAB_MODULES[tab]) return TAB_MODULES[tab];
  if (tab.startsWith('web-')) return ['website'];
  if (tab.startsWith('cfg-') || tab === 'settings' || tab === 'maintenance' || tab === 'theme' || tab === 'backup') return ['settings'];
  return 'admin';
}

export function canOpenTab(user: PermissionUser | null | undefined, tab: string): boolean {
  if (isAdminUser(user)) return true;
  const needed = tabModules(tab);
  if (needed === 'admin') return false;
  return hasModule(user, ...needed);
}

/** The first page this account may open (where a staff member lands) */
const TAB_ORDER = [
  'dashboard', 'orders', 'products', 'categories', 'brands', 'attributes', 'inventory', 'customers', 'wholesale-customers',
  'purchases', 'expenses', 'coupons', 'reports-sales', 'landing-pages', 'web-branding', 'sms', 'cfg-shipping', 'staff',
];
export function firstAllowedTab(user: PermissionUser | null | undefined): string | null {
  return TAB_ORDER.find((tab) => canOpenTab(user, tab)) || null;
}

/* ---------------------------------------------------------------- server */

type Need = PermissionModule[] | 'any';
interface ApiRule {
  re: RegExp;
  /** GET / HEAD */
  read: Need;
  /** POST / PUT / PATCH / DELETE; omitted = same as read */
  write?: Need;
}

/**
 * First match wins. 'any' = every staff member with at least one dashboard
 * module. A path with no rule is for administrators only — so a route added
 * later is closed to staff until someone decides who may use it.
 */
const API_RULES: ApiRule[] = [
  // The dashboard shell itself
  { re: /^\/api\/admin\/settings$/, read: 'any' },
  { re: /^\/api\/admin\/notifications(\/|$)/, read: 'any', write: 'any' },
  // v3.15 — top search box; the server only searches what this account may open
  { re: /^\/api\/admin\/search$/, read: 'any' },
  { re: /^\/api\/dashboard\/stats$/, read: ['dashboard'] },

  // Pictures: every editor uploads; removing files is for whoever manages content
  { re: /^\/api\/admin\/media(\/|$)/, read: 'any' },
  { re: /^\/api\/media\/upload(-bulk)?$/, read: 'any', write: 'any' },
  { re: /^\/api\/media(\/|$)/, read: 'any', write: ['website', 'products', 'landing'] },

  // Sales
  { re: /^\/api\/admin\/orders-staff$/, read: ['orders', 'users'] },
  { re: /^\/api\/admin\/orders-customer-lookup$/, read: ['orders'] },
  { re: /^\/api\/admin\/orders(\/|$)/, read: ['orders'] },
  { re: /^\/api\/admin\/incomplete-orders(\/|$)/, read: ['orders'] },
  { re: /^\/api\/admin\/returns(\/|$)/, read: ['orders'] },
  { re: /^\/api\/admin\/payment-transactions(\/|$)/, read: ['orders'] },
  { re: /^\/api\/admin\/courier\/(settings|test)$/, read: ['settings'] },
  { re: /^\/api\/admin\/courier(\/|$)/, read: ['orders', 'settings'] },
  { re: /^\/api\/admin\/fraud\/config$/, read: ['marketing'] },
  { re: /^\/api\/admin\/fraud(\/|$)/, read: ['orders', 'marketing', 'customers'] },
  // The orders screen names the landing page an order came from
  { re: /^\/api\/admin\/landing-pages$/, read: ['landing', 'orders'], write: ['landing'] },
  { re: /^\/api\/admin\/landing-pages(\/|$)/, read: ['landing'] },
  { re: /^\/api\/admin\/coupons(\/|$)/, read: ['coupons'] },

  // Catalog
  { re: /^\/api\/admin\/products\/(export|import|import-latest|bulk)(\/|$)/, read: ['products'] },
  { re: /^\/api\/admin\/products\/\d+\/(variations|attributes)$/, read: ['products', 'orders', 'landing', 'inventory', 'purchases', 'wholesale'], write: ['products'] },
  {
    re: /^\/api\/admin\/products(\/|$)/,
    read: ['products', 'orders', 'inventory', 'purchases', 'suppliers', 'brands', 'landing', 'website', 'coupons', 'wholesale', 'reports'],
    write: ['products'],
  },
  { re: /^\/api\/admin\/(generics|size-guides|reviews)(\/|$)/, read: ['products'] },
  // v3.11 — search-by-photo index (made in the browser from the product pictures)
  { re: /^\/api\/admin\/image-index(\/|$)/, read: ['products', 'website'], write: ['products', 'website'] },
  { re: /^\/api\/admin\/attributes(\/|$)/, read: ['attributes', 'products'], write: ['attributes'] },
  { re: /^\/api\/admin\/categories\/reorder$/, read: ['categories', 'website'] },
  { re: /^\/api\/admin\/categories(\/|$)/, read: ['categories'] },
  { re: /^\/api\/admin\/brands(\/|$)/, read: ['brands'] },
  { re: /^\/api\/admin\/inventory(\/|$)/, read: ['inventory'] },

  // People
  { re: /^\/api\/admin\/customers\/\d+\/orders$/, read: ['customers', 'orders'] },
  { re: /^\/api\/admin\/customers(\/|$)/, read: ['customers'] },
  { re: /^\/api\/admin\/(contact-messages|blocked-ips)(\/|$)/, read: ['customers'] },
  // v3.14 — live chat inbox
  { re: /^\/api\/admin\/live-chat(\/|$)/, read: ['customers', 'orders'] },
  { re: /^\/api\/admin\/wholesale(\/|$)/, read: ['wholesale'] },
  { re: /^\/api\/admin\/suppliers(\/|$)/, read: ['suppliers', 'purchases'], write: ['suppliers'] },
  { re: /^\/api\/admin\/(users|permission-modules)(\/|$)/, read: ['users'] },

  // Money
  { re: /^\/api\/admin\/purchases(\/|$)/, read: ['purchases', 'suppliers'], write: ['purchases'] },
  { re: /^\/api\/admin\/(expenses|expense-categories)(\/|$)/, read: ['expenses'] },
  { re: /^\/api\/admin\/reports\/couriers$/, read: ['reports', 'orders'] },
  { re: /^\/api\/admin\/reports(\/|$)/, read: ['reports'] },

  // Website and marketing
  { re: /^\/api\/admin\/(banners|blog|contact-page)(\/|$)/, read: ['website'] },
  // v3.12 — the title of a pasted YouTube link (Home Sections → Videos)
  { re: /^\/api\/admin\/video-info$/, read: ['website'] },
  { re: /^\/api\/admin\/new-arrivals$/, read: ['website', 'products'] },
  { re: /^\/api\/admin\/(sms|catalog)(\/|$)/, read: ['marketing'] },
  // /api/admin/custom-code has no rule on purpose: code that runs on every page is for administrators

  // "Clear Cache" in the top bar deletes nothing; every dashboard user may press it
  { re: /^\/api\/admin\/cache\/flush$/, read: 'any', write: 'any' },

  // System Configuration
  // /api/admin/backup has no rule on purpose: a backup holds every account and every key, so it stays with administrators
  { re: /^\/api\/admin\/(email|cache|system|maintenance|order-numbering|payment-gateways|pixel|password-resets|social-login)(\/|$)/, read: ['settings'] },
];

/** May this staff account make this request? (Administrators are let through before this is asked.) */
export function staffMayCall(user: PermissionUser, method: string, path: string): boolean {
  const clean = String(path || '').toLowerCase().replace(/\/+$/, '') || '/';
  const rule = API_RULES.find((item) => item.re.test(clean));
  if (!rule) return false;
  const reading = method === 'GET' || method === 'HEAD';
  const need = reading ? rule.read : rule.write ?? rule.read;
  if (need === 'any') return hasDashboardAccess(user);
  return hasModule(user, ...need);
}

/* ------------------------------------------------------------- settings */

/**
 * Website settings are stored as named keys. A staff member saves only the
 * keys their modules own; anything else in the request is left untouched.
 */
const WEBSITE_KEYS = new Set([
  'logo_config', 'navigation_menu', 'pages', 'offers_config', 'footer_config', 'homepage_sections', 'product_card_config',
  'product_image_config', 'cta_animation_config', 'header_config', 'mobile_drawer_config', 'mobile_nav_config',
  'checkout_config', 'thank_you_config', 'product_contact_config', 'product_page_config', 'seo_config', 'social_config',
  'service_features', 'flash_sale_config', 'blog_config', 'review_images_config', 'home_sections_config',
  'shop_config', 'topbar', 'footer',
  // v3.11 — back-to-top button, search box (typing text, photo search)
  'scroll_top_config', 'search_config',
  // v3.12 — home page videos
  'home_videos_config',
  // v3.13 — website themes (Classic / Glow) and languages
  'storefront_theme', 'glow_home_config', 'glow_product_config', 'language_config',
  // v3.14 — hero layout (categories + banner), trust & certificates, factory & lab
  'hero_layout_config', 'trust_section_config', 'facility_section_config',
  // v3.15 — Add to Cart / Buy Now colours and text size; the Luxe home page
  'cta_button_style', 'luxe_home_config',
]);
const MARKETING_KEYS = new Set(['chat_config']);

export function settingKeyModules(key: string): PermissionModule[] {
  if (WEBSITE_KEYS.has(key)) return ['website'];
  if (MARKETING_KEYS.has(key)) return ['marketing'];
  // Store name, phone and address sit on the Branding screen as well as in System Configuration
  if (key === 'general') return ['website', 'settings'];
  // The "show brands on the home page" switch sits on the Brands screen
  if (key === 'home_brands_config') return ['website', 'brands'];
  return ['settings'];
}
