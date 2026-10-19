/**
 * v3.15 — the Luxe home page (Dashboard → Website → Themes → Home page: Luxe).
 *
 * A premium, Shopify-style storefront: lots of white space, large pictures,
 * centred headings in the heading font, a moving announcement band, image
 * tiles for categories, a featured collection with tabs, an image-with-text
 * story block and a sliding new-arrivals row. Every section can be switched
 * off, moved up or down and re-worded.
 *
 * Setting key: luxe_home_config { order, sections, cardDesign }
 * Titles may mark words with *stars* (drawn in the theme's accent colour).
 */
import type { ProductCardStyle } from '../components/store/ProductCard.tsx';

export type LuxeSectionId =
  | 'hero'
  | 'marquee'
  | 'categories'
  | 'featured'
  | 'imageText'
  | 'newArrivals'
  | 'promoGrid'
  | 'flashSale'
  | 'categorySections'
  | 'allProducts'
  | 'brands'
  | 'features'
  | 'trust'
  | 'facility'
  | 'reviews'
  | 'blog'
  | 'contact'
  | 'videos';

export interface LuxePromoTile {
  smallTitle?: string;
  title?: string;
  button?: string;
  link?: string;
  image?: string;
}

export interface LuxeSections {
  hero: {
    enabled: boolean;
    /** banners = the Hero Banners slider; editorial = one big picture with words over it */
    style: 'banners' | 'editorial';
    image: string;
    mobileImage: string;
    smallTitle: string;
    title: string;
    text: string;
    button: string;
    link: string;
    secondButton: string;
    secondLink: string;
    /** Where the words sit on the picture */
    align: 'start' | 'center';
  };
  marquee: { enabled: boolean; items: string[]; speed: 'slow' | 'normal' | 'fast' };
  categories: { enabled: boolean; smallTitle: string; title: string; limit: number };
  featured: { enabled: boolean; smallTitle: string; title: string; limit: number; showTabs: boolean; button: string };
  imageText: {
    enabled: boolean;
    image: string;
    imageSide: 'start' | 'end';
    smallTitle: string;
    title: string;
    text: string;
    button: string;
    link: string;
  };
  newArrivals: { enabled: boolean; smallTitle: string; title: string; limit: number };
  promoGrid: { enabled: boolean; tiles: LuxePromoTile[] };
  flashSale: { enabled: boolean };
  categorySections: { enabled: boolean };
  allProducts: { enabled: boolean; title: string; limit: number };
  brands: { enabled: boolean };
  features: { enabled: boolean };
  trust: { enabled: boolean };
  facility: { enabled: boolean };
  reviews: { enabled: boolean };
  blog: { enabled: boolean };
  contact: { enabled: boolean };
  videos: { enabled: boolean };
}

export interface LuxeHomeConfig {
  order: LuxeSectionId[];
  sections: LuxeSections;
  /** The product card design used on this home page */
  cardDesign: ProductCardStyle;
}

export const LUXE_SECTION_INFO: Array<{ id: LuxeSectionId; name: string; note: string }> = [
  { id: 'hero', name: 'Hero', note: 'Your banner slider, or one big picture with words and buttons' },
  { id: 'marquee', name: 'Announcement band', note: 'Short promises moving across the page' },
  { id: 'categories', name: 'Shop by category', note: 'Large picture tiles of your featured categories' },
  { id: 'featured', name: 'Featured collection', note: 'Best sellers / New / On sale with tabs' },
  { id: 'imageText', name: 'Image with text', note: 'A big picture beside your story and a button' },
  { id: 'newArrivals', name: 'New arrivals', note: 'A sliding row of the newest products' },
  { id: 'promoGrid', name: 'Promo tiles', note: 'Two or three picture tiles with a title and a link' },
  { id: 'flashSale', name: 'Flash sale strip', note: 'The Flash Sale strip (Website → Hero Banners)' },
  { id: 'categorySections', name: 'Category sections', note: 'One row per category marked “Show on home page”' },
  { id: 'allProducts', name: 'All products', note: 'The latest products as a grid' },
  { id: 'brands', name: 'Brands', note: 'Brand logos (on/off also in Brands)' },
  { id: 'features', name: 'Service features', note: 'The trust cards (Website → Footer & Social)' },
  { id: 'trust', name: 'Trust & certificates', note: 'Why choose us + certificate badges (Website → Trust & Facility)' },
  { id: 'facility', name: 'Factory & lab', note: 'Company profile with a photo gallery (Website → Trust & Facility)' },
  { id: 'reviews', name: 'Review screenshots', note: 'Customer review pictures' },
  { id: 'blog', name: 'Blog', note: 'Latest blog posts' },
  { id: 'contact', name: '“Need help?” block', note: 'Call / WhatsApp / message form' },
  { id: 'videos', name: 'Videos', note: 'YouTube videos above the footer' },
];

export const DEFAULT_LUXE_ORDER: LuxeSectionId[] = LUXE_SECTION_INFO.map((item) => item.id);

export const DEFAULT_LUXE_SECTIONS: LuxeSections = {
  hero: {
    enabled: true,
    style: 'banners',
    image: '',
    mobileImage: '',
    smallTitle: 'New Collection',
    title: 'Care that *feels* premium',
    text: 'Original products, delivered to your door with cash on delivery.',
    button: 'Shop Now',
    link: '/shop',
    secondButton: 'View Offers',
    secondLink: '/offers',
    align: 'start',
  },
  marquee: {
    enabled: true,
    items: ['Cash on delivery', 'Fast home delivery', '100% original products', 'Easy returns'],
    speed: 'normal',
  },
  categories: { enabled: true, smallTitle: 'Collections', title: 'Shop by *Category*', limit: 6 },
  featured: { enabled: true, smallTitle: 'Our picks', title: 'Featured *Collection*', limit: 8, showTabs: true, button: 'View All Products' },
  imageText: {
    enabled: true,
    image: '',
    imageSide: 'start',
    smallTitle: 'Our Story',
    title: 'Made with *care*, chosen with love',
    text: 'Every product in our shop is checked for quality before it reaches you. Fast delivery, honest prices and a team that answers when you call.',
    button: 'Discover More',
    link: '/shop',
  },
  newArrivals: { enabled: true, smallTitle: 'Just in', title: '*New* Arrivals', limit: 12 },
  promoGrid: {
    enabled: true,
    tiles: [
      { smallTitle: 'Limited time', title: 'Up to 30% off', button: 'Shop Offers', link: '/offers', image: '' },
      { smallTitle: 'Best sellers', title: 'Loved by our customers', button: 'Shop Now', link: '/shop', image: '' },
    ],
  },
  flashSale: { enabled: false },
  categorySections: { enabled: true },
  allProducts: { enabled: false, title: 'All *Products*', limit: 10 },
  brands: { enabled: true },
  features: { enabled: true },
  trust: { enabled: true },
  facility: { enabled: true },
  reviews: { enabled: true },
  blog: { enabled: true },
  contact: { enabled: false },
  videos: { enabled: true },
};

const CARD_DESIGNS: ProductCardStyle[] = ['luxe', 'boutique', 'editorial', 'spotlight', 'classic', 'modern', 'minimal', 'compact', 'glow'];

const num = (value: any, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= min ? Math.min(max, n) : fallback;
};

/** The saved Luxe settings, every missing value filled with its default */
export function luxeHomeOf(settings: any): LuxeHomeConfig {
  const raw = (settings && settings.luxe_home_config) || {};
  const saved = (raw.sections || {}) as Partial<Record<LuxeSectionId, any>>;
  const sections = {} as LuxeSections;
  (Object.keys(DEFAULT_LUXE_SECTIONS) as LuxeSectionId[]).forEach((id) => {
    const base = DEFAULT_LUXE_SECTIONS[id] as any;
    const own = saved[id] && typeof saved[id] === 'object' ? saved[id] : {};
    const merged: any = { ...base };
    Object.keys(base).forEach((key) => {
      const value = own[key];
      if (value === undefined || value === null) return;
      if (typeof base[key] === 'boolean') merged[key] = Boolean(value);
      else if (typeof base[key] === 'number') merged[key] = num(value, 1, 48, base[key]);
      else if (typeof base[key] === 'string') merged[key] = typeof value === 'string' ? value : base[key];
      else if (Array.isArray(base[key]) && Array.isArray(value)) merged[key] = value;
    });
    (sections as any)[id] = merged;
  });
  const h = sections.hero;
  if (!['banners', 'editorial'].includes(h.style)) h.style = 'banners';
  if (!['start', 'center'].includes(h.align)) h.align = 'start';
  if (!['slow', 'normal', 'fast'].includes(sections.marquee.speed)) sections.marquee.speed = 'normal';
  sections.marquee.items = sections.marquee.items.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12);
  sections.categories.limit = num(sections.categories.limit, 2, 12, 6);
  sections.featured.limit = num(sections.featured.limit, 4, 24, 8);
  sections.newArrivals.limit = num(sections.newArrivals.limit, 4, 24, 12);
  sections.allProducts.limit = num(sections.allProducts.limit, 4, 30, 10);
  if (!['start', 'end'].includes(sections.imageText.imageSide)) sections.imageText.imageSide = 'start';
  sections.promoGrid.tiles = sections.promoGrid.tiles.filter((tile) => tile && typeof tile === 'object').slice(0, 3);

  const savedOrder: LuxeSectionId[] = Array.isArray(raw.order) ? raw.order.filter((id: any) => DEFAULT_LUXE_ORDER.includes(id)) : [];
  const order = [...new Set(savedOrder)];
  DEFAULT_LUXE_ORDER.forEach((id, index) => {
    if (order.includes(id)) return;
    const before = DEFAULT_LUXE_ORDER.slice(0, index).reverse().find((prev) => order.includes(prev));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  return { order, sections, cardDesign: CARD_DESIGNS.includes(raw.cardDesign) ? raw.cardDesign : 'luxe' };
}
