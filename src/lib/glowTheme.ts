/**
 * v3.13 — website themes.
 *
 * Dashboard → Website → Themes chooses, separately, the design of the home
 * page and of the single product page:
 *   classic  the design every shop had up to v3.12 (unchanged)
 *   glow     a softer boutique look — rounded pictures, a second (gold)
 *            accent colour, promo cards, countdown, deals, FAQ …
 *
 * Setting keys:
 *   storefront_theme    { home, product, accentColor }
 *   glow_home_config    { order, sections }   — every Glow home section can
 *                        be switched off, moved up/down and re-worded
 *   glow_product_config { … }                  — switches for the Glow product page
 *
 * Titles may mark words with *stars*: "Our *Best Sellers* Products" draws
 * the starred words in the accent colour.
 */

export type ThemeId = 'classic' | 'glow';
/** v3.15 — the home page has a third design, Luxe (src/lib/luxeTheme.ts) */
export type HomeThemeId = ThemeId | 'luxe';

export interface StorefrontTheme {
  home?: HomeThemeId;
  product?: ThemeId;
  /** The second colour of the Glow theme (prices, highlights, Buy Now) */
  accentColor?: string;
}

export const DEFAULT_ACCENT = '#B8914A';

export const themeOf = (settings: any): Required<StorefrontTheme> => {
  const raw: StorefrontTheme = (settings && settings.storefront_theme) || {};
  return {
    home: raw.home === 'glow' || raw.home === 'luxe' ? raw.home : 'classic',
    product: raw.product === 'glow' ? 'glow' : 'classic',
    accentColor: /^#[0-9a-f]{6}$/i.test(String(raw.accentColor || '')) ? String(raw.accentColor) : DEFAULT_ACCENT,
  };
};

/* ------------------------------------------------------------- home page */

export type GlowSectionId =
  | 'hero'
  | 'categories'
  | 'promo'
  | 'bestSellers'
  | 'countdown'
  | 'deals'
  | 'weekly'
  | 'newArrivals'
  | 'flashSale'
  | 'allProducts'
  | 'categorySections'
  | 'brands'
  | 'features'
  | 'trust'
  | 'facility'
  | 'reviews'
  | 'blog'
  | 'faq'
  | 'contact'
  | 'videos';

export interface PromoCard {
  badge?: string;
  title?: string;
  text?: string;
  button?: string;
  link?: string;
  image?: string;
  /** light = soft grey card, dark = card in the shop colour */
  tone?: 'light' | 'dark';
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface GlowSections {
  hero: { enabled: boolean };
  categories: { enabled: boolean; title: string };
  promo: { enabled: boolean; cards: PromoCard[] };
  bestSellers: { enabled: boolean; title: string; button: string; limit: number; showTabs: boolean; source: 'bestSeller' | 'rating' | 'newest' };
  countdown: {
    enabled: boolean;
    smallTitle: string;
    title: string;
    subtitle: string;
    /** "2026-12-31T23:59" — empty = counts down to the end of every day */
    endsAt: string;
    button: string;
    link: string;
    leftImage: string;
    rightImage: string;
  };
  deals: { enabled: boolean; title: string; limit: number };
  weekly: { enabled: boolean; smallTitle: string; title: string; text: string; button: string; link: string; image: string };
  newArrivals: {
    enabled: boolean;
    smallTitle: string;
    title: string;
    text: string;
    limit: number;
    promoImage: string;
    promoTitle: string;
    promoSubtitle: string;
    promoButton: string;
    promoLink: string;
  };
  flashSale: { enabled: boolean };
  allProducts: { enabled: boolean; title: string; limit: number };
  categorySections: { enabled: boolean };
  brands: { enabled: boolean };
  features: { enabled: boolean };
  /** v3.14 — content lives in Website → Trust & Facility (shared with Classic) */
  trust: { enabled: boolean };
  facility: { enabled: boolean };
  reviews: { enabled: boolean };
  blog: { enabled: boolean };
  faq: {
    enabled: boolean;
    smallTitle: string;
    title: string;
    items: FaqItem[];
    cardTitle: string;
    cardText: string;
    cardButton: string;
    cardLink: string;
  };
  contact: { enabled: boolean };
  videos: { enabled: boolean };
}

export interface GlowHomeConfig {
  order: GlowSectionId[];
  sections: GlowSections;
}

/** Name and one-line note of every section, in the default order */
export const GLOW_SECTION_INFO: Array<{ id: GlowSectionId; name: string; note: string }> = [
  { id: 'hero', name: 'Hero banners', note: 'Your banners from Website → Hero Banners' },
  { id: 'categories', name: 'Categories', note: 'Featured categories (design and slide/grid in Home Sections)' },
  { id: 'promo', name: 'Promo cards', note: 'Two offer cards side by side' },
  { id: 'bestSellers', name: 'Best sellers', note: 'Products with category tabs' },
  { id: 'countdown', name: 'Countdown offer', note: 'Big offer card with a live countdown and two pictures' },
  { id: 'deals', name: 'Deals of the day', note: 'Discounted products as wide cards' },
  { id: 'weekly', name: 'Wide banner', note: 'One wide offer banner' },
  { id: 'newArrivals', name: 'New arrivals', note: 'Tall promo picture beside the newest products' },
  { id: 'flashSale', name: 'Flash sale strip', note: 'The classic Flash Sale strip (Website → Hero Banners)' },
  { id: 'allProducts', name: 'All products', note: 'The latest products as a grid' },
  { id: 'categorySections', name: 'Category sections', note: 'One row per category marked “Show on home page”' },
  { id: 'brands', name: 'Brands', note: 'Brand logos (on/off also in Brands)' },
  { id: 'features', name: 'Service features', note: 'The trust cards (Website → Footer & Social)' },
  { id: 'trust', name: 'Trust & certificates', note: 'Why choose us + certificate badges (Website → Trust & Facility)' },
  { id: 'facility', name: 'Factory & lab', note: 'Company profile with a photo gallery (Website → Trust & Facility)' },
  { id: 'reviews', name: 'Review screenshots', note: 'Customer review pictures' },
  { id: 'blog', name: 'Blog', note: 'Latest blog posts' },
  { id: 'faq', name: 'FAQ', note: 'Questions and answers with a contact card' },
  { id: 'contact', name: '“Need help?” block', note: 'Call / WhatsApp / message form' },
  { id: 'videos', name: 'Videos', note: 'YouTube videos above the footer' },
];

export const DEFAULT_GLOW_ORDER: GlowSectionId[] = GLOW_SECTION_INFO.map((item) => item.id);

export const DEFAULT_GLOW_SECTIONS: GlowSections = {
  hero: { enabled: true },
  categories: { enabled: true, title: 'Shop by *Category*' },
  promo: {
    enabled: true,
    cards: [
      {
        badge: 'Flat 25% Discount',
        title: 'Special *Care* Deals',
        text: 'Handpicked favourites at a gentle price, for a limited time.',
        button: 'Shop Now',
        link: '/offers',
        image: '',
        tone: 'light',
      },
      {
        badge: 'Flat 20% Discount',
        title: 'Save Big on *Best Sellers*',
        text: 'The products our customers love most, now for less.',
        button: 'Shop Now',
        link: '/shop',
        image: '',
        tone: 'dark',
      },
    ],
  },
  bestSellers: { enabled: true, title: 'Our *Best Sellers* Products', button: 'View All Products', limit: 8, showTabs: true, source: 'bestSeller' },
  countdown: {
    enabled: true,
    smallTitle: 'Special Savings',
    title: 'Today’s *Glow* Deals',
    subtitle: 'Big savings on favourites. Limited time offer!',
    endsAt: '',
    button: 'Shop Now',
    link: '/offers',
    leftImage: '',
    rightImage: '',
  },
  deals: { enabled: true, title: 'Deals of the *Day*', limit: 4 },
  weekly: {
    enabled: true,
    smallTitle: 'Weekly Deals',
    title: 'Amazing Savings: *Weekly Must-Haves*',
    text: 'New offers every week on the things you buy most.',
    button: 'Shop Now',
    link: '/offers',
    image: '',
  },
  newArrivals: {
    enabled: true,
    smallTitle: 'New Arrival',
    title: '*New Arrival* Products',
    text: 'Fresh picks that just landed in our shop.',
    limit: 6,
    promoImage: '',
    promoTitle: 'New Season',
    promoSubtitle: 'Just arrived',
    promoButton: 'Shop Now',
    promoLink: '/shop?newArrival=1',
  },
  flashSale: { enabled: false },
  allProducts: { enabled: true, title: 'All *Products*', limit: 10 },
  categorySections: { enabled: true },
  brands: { enabled: true },
  features: { enabled: true },
  trust: { enabled: true },
  facility: { enabled: true },
  reviews: { enabled: true },
  blog: { enabled: true },
  faq: {
    enabled: true,
    smallTitle: 'FAQs',
    title: 'Question? *Look here.*',
    items: [
      { q: 'How do I place an order?', a: 'Choose a product, press Buy Now, fill in your name, phone number and address, and confirm. We call you to confirm the order.' },
      { q: 'Do you offer cash on delivery?', a: 'Yes. You can pay in cash when the parcel reaches you. Online payment is also available where shown at checkout.' },
      { q: 'How long does delivery take?', a: 'Inside the city usually 1–2 days, outside the city 2–4 days.' },
      { q: 'Can I return a product?', a: 'Yes. If a product is damaged or wrong, contact us within 3 days and we will replace it or refund you.' },
      { q: 'How do I track my order?', a: 'Open Track Order and enter your order number and phone number to see where your parcel is.' },
    ],
    cardTitle: 'Have a different question?',
    cardText: 'Our team will answer all your questions. We reply quickly.',
    cardButton: 'Contact Us',
    cardLink: '/page/contact',
  },
  contact: { enabled: true },
  videos: { enabled: true },
};

const num = (value: any, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= min ? Math.min(max, n) : fallback;
};
const str = (value: any, fallback: string) => (typeof value === 'string' ? value : fallback);

/** The saved Glow home settings, every missing value filled with its default */
export function glowHomeOf(settings: any): GlowHomeConfig {
  const raw = (settings && settings.glow_home_config) || {};
  const saved = (raw.sections || {}) as Partial<Record<GlowSectionId, any>>;
  const sections = {} as GlowSections;
  (Object.keys(DEFAULT_GLOW_SECTIONS) as GlowSectionId[]).forEach((id) => {
    const base = DEFAULT_GLOW_SECTIONS[id] as any;
    const own = saved[id] && typeof saved[id] === 'object' ? saved[id] : {};
    const merged: any = { ...base };
    Object.keys(base).forEach((key) => {
      const value = own[key];
      if (value === undefined || value === null) return;
      if (typeof base[key] === 'boolean') merged[key] = Boolean(value);
      else if (typeof base[key] === 'number') merged[key] = num(value, 1, 48, base[key]);
      else if (typeof base[key] === 'string') merged[key] = str(value, base[key]);
      else if (Array.isArray(base[key]) && Array.isArray(value)) merged[key] = value;
    });
    (sections as any)[id] = merged;
  });
  sections.bestSellers.limit = num(sections.bestSellers.limit, 4, 24, 8);
  sections.deals.limit = num(sections.deals.limit, 2, 8, 4);
  sections.newArrivals.limit = num(sections.newArrivals.limit, 3, 12, 6);
  sections.allProducts.limit = num(sections.allProducts.limit, 4, 30, 10);
  if (!['bestSeller', 'rating', 'newest'].includes(sections.bestSellers.source)) sections.bestSellers.source = 'bestSeller';
  sections.promo.cards = (Array.isArray(sections.promo.cards) ? sections.promo.cards : [])
    .filter((card) => card && typeof card === 'object')
    .slice(0, 3);
  sections.faq.items = (Array.isArray(sections.faq.items) ? sections.faq.items : [])
    .filter((item) => item && typeof item === 'object' && String(item.q || '').trim())
    .slice(0, 20);

  const savedOrder: GlowSectionId[] = Array.isArray(raw.order) ? raw.order.filter((id: any) => DEFAULT_GLOW_ORDER.includes(id)) : [];
  // A section added in a later version goes in after the section that comes
  // before it in the default order (not at the very end of a saved list)
  const order = [...new Set(savedOrder)];
  DEFAULT_GLOW_ORDER.forEach((id, index) => {
    if (order.includes(id)) return;
    const before = DEFAULT_GLOW_ORDER.slice(0, index).reverse().find((prev) => order.includes(prev));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  return { order, sections };
}

/* ---------------------------------------------------------- product page */

export interface GlowProductConfig {
  showBreadcrumb: boolean;
  showRating: boolean;
  showStockPill: boolean;
  showWishlist: boolean;
  showMeta: boolean;
  showShare: boolean;
  showTrust: boolean;
  /** Up to three short promises under the buttons */
  trust: string[];
}

export const DEFAULT_GLOW_PRODUCT: GlowProductConfig = {
  showBreadcrumb: true,
  showRating: true,
  showStockPill: true,
  showWishlist: true,
  showMeta: true,
  showShare: true,
  showTrust: true,
  trust: ['Cash on delivery', 'Fast delivery', 'Easy returns'],
};

export function glowProductOf(settings: any): GlowProductConfig {
  const raw = (settings && settings.glow_product_config) || {};
  const out: GlowProductConfig = { ...DEFAULT_GLOW_PRODUCT };
  (Object.keys(DEFAULT_GLOW_PRODUCT) as Array<keyof GlowProductConfig>).forEach((key) => {
    if (key === 'trust') return;
    if (typeof raw[key] === 'boolean') (out as any)[key] = raw[key];
  });
  if (Array.isArray(raw.trust)) out.trust = raw.trust.map((item: any) => String(item || '')).slice(0, 3);
  return out;
}

/** "Our *Best* Sellers" → [{text:'Our ', accent:false}, {text:'Best', accent:true}, …] */
export function splitAccent(title: string): Array<{ text: string; accent: boolean }> {
  const parts: Array<{ text: string; accent: boolean }> = [];
  String(title || '')
    .split(/(\*[^*]+\*)/g)
    .filter(Boolean)
    .forEach((piece) => {
      const accent = /^\*[^*]+\*$/.test(piece);
      parts.push({ text: accent ? piece.slice(1, -1) : piece, accent });
    });
  return parts;
}

/** Title without the *stars* (for translation lookups and plain text) */
export const plainTitle = (title: string) => String(title || '').replace(/\*/g, '');
