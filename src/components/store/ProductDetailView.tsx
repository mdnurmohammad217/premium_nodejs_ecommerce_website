import React, { useEffect, useMemo, useRef, useState } from 'react';
import { responsiveImg, sized } from '../../lib/img.ts';
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ShoppingCart,
  Zap,
  Star,
  Phone,
  MessageCircle,
  AlertTriangle,
  ImageOff,
  SlidersHorizontal,
  FileText,
  Play,
  Ruler,
  Truck,
  X,
  CheckCircle2,
  MessageSquareReply,
  Check,
  Settings2,
  ListChecks,
  Sparkles,
  Heart,
  Banknote,
  RotateCcw,
  Share2,
  Link2,
} from 'lucide-react';
import { BRAND_ICONS } from './BrandIcons.tsx';
import { HIGHLIGHT_ICONS, parseHighlights, parseOptionDisplay, swatchColor } from '../../lib/highlightIcons.ts';
import { RichText } from './RichText.tsx';
import { useCart } from '../../context/CartContext.tsx';
import { Product, ProductCardConfig, SiteSettings } from '../../types/index.ts';
import { ProductCard, WholesalePill } from './ProductCard.tsx';
import { StoreLink } from './Header.tsx';
import { tracking } from '../../lib/tracking.ts';
import { IMAGE_PLACEHOLDER } from '../../lib/placeholder.ts';
import { takeBootProduct } from '../../lib/boot.ts';
import { flyToCart } from '../../lib/flyToCart.ts';
import { ctaAnimation } from '../../lib/ctaAnimation.ts';
import { videoEmbed } from '../../lib/landingTemplates.ts';
import { RAIL_ITEM, RAIL_TRACK, RailArrows, useRail } from './ProductRail.tsx';
import { SizeGuide } from '../../types/index.ts';
import { useT } from '../../lib/i18n.tsx';
import { themeOf, glowProductOf } from '../../lib/glowTheme.ts';
import { AccentTitle } from './glow/GlowParts.tsx';

interface ProductDetailViewProps {
  slug?: string;
  initialProduct?: Product;
  settings?: SiteSettings;
  allProducts?: Product[];
  onNavigate: (view: string, params?: any) => void;
  onSelectProduct: (product: Product) => void;
}

type TabKey = 'description' | 'howto' | 'specification' | 'reviews';

interface ProductReview {
  id: number;
  customerName?: string | null;
  /** Older API builds sent the raw column name */
  userName?: string | null;
  rating: number;
  comment?: string | null;
  reply?: string | null;
  createdAt?: string | null;
}

/** YouTube thumbnail for a video link, when there is one */
const youtubeThumb = (src: string) => {
  const id = src.match(/embed\/([A-Za-z0-9_-]{6,20})/)?.[1];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
};

const Stars: React.FC<{ value: number; size?: string }> = ({ value, size = 'w-4 h-4' }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star
        key={n}
        className={`${size} ${n <= Math.round(value) ? 'fill-(--ds-amber) text-(--ds-amber)' : 'text-(--ds-border-strong)'}`}
      />
    ))}
  </span>
);

/** One sellable combination, as returned by GET /api/products/:slugOrId */
interface ProductVariation {
  id: number;
  label?: string | null;
  combination: Record<string, string>;
  sku?: string | null;
  price?: string | number | null;
  salePrice?: string | number | null;
  stock?: number | null;
  image?: string | null;
}

interface OptionGroup {
  name: string;
  values: string[];
}

type PageButtonConfig = ProductCardConfig & {
  productPageAddToCartLabel?: string;
  productPageBuyNowLabel?: string;
};

/** The API may send the combination as an object or as its JSON text */
const parseCombination = (raw: unknown): Record<string, string> => {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
    if (val !== null && val !== undefined && String(val).trim() !== '') out[key] = String(val);
  });
  return out;
};

const normaliseVariations = (raw: unknown): ProductVariation[] =>
  Array.isArray(raw)
    ? raw
        .filter((item: any) => item && item.id != null)
        .map((item: any) => ({ ...item, id: Number(item.id), combination: parseCombination(item.combination) }))
        .filter((item) => Object.keys(item.combination).length > 0)
    : [];

const stockOf = (variation: ProductVariation) => Math.max(0, Number(variation.stock) || 0);

const labelOf = (variation: ProductVariation) =>
  (variation.label && variation.label.trim()) ||
  Object.entries(variation.combination)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

const matchesSelection = (
  variation: ProductVariation,
  selection: Record<string, string>,
  ignore?: string
) =>
  Object.entries(selection).every(
    ([key, value]) => key === ignore || variation.combination[key] === value
  );

export const ProductDetailView: React.FC<ProductDetailViewProps> = ({
  slug,
  initialProduct,
  settings,
  allProducts = [],
  onNavigate,
  onSelectProduct,
}) => {
  const t = useT();
  const { addToCart, setIsCartDrawerOpen, isInWishlist, toggleWishlist } = useCart();
  // v3.13 — Dashboard → Website → Themes → Product page: Classic or Glow
  const glow = themeOf(settings).product === 'glow';
  const glowCfg = glowProductOf(settings);
  const [copied, setCopied] = useState(false);
  const tabsRef = useRef<HTMLElement | null>(null);

  const [product, setProduct] = useState<Product | null>(initialProduct || null);
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [hasVariationsFlag, setHasVariationsFlag] = useState(false);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [ratingBreakdown, setRatingBreakdown] = useState<Record<string, number>>({});
  const [sizeGuide, setSizeGuide] = useState<SizeGuide | null>(null);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [relatedFromApi, setRelatedFromApi] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(!initialProduct);
  const [loadError, setLoadError] = useState('');
  const [quantity, setQuantity] = useState(1);
  /** What is typed in the quantity box; may be empty while the shopper types */
  const [qtyText, setQtyText] = useState('1');
  const [qtyNotice, setQtyNotice] = useState('');
  const [brandLogoFailed, setBrandLogoFailed] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('description');
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});
  // A variation's own photo leads until the shopper browses the gallery
  const [preferVariationImage, setPreferVariationImage] = useState(true);
  const [pickerHint, setPickerHint] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const imageFrameRef = useRef<HTMLDivElement | null>(null);

  const currency = settings?.general?.currency || '৳';
  const buttonCfg = settings?.product_card_config as PageButtonConfig | undefined;
  const addToCartLabel = t(buttonCfg?.productPageAddToCartLabel || buttonCfg?.addToCartLabel || 'Add to Cart');
  const buyNowLabel = t(buttonCfg?.productPageBuyNowLabel || buttonCfg?.buyNowLabel || 'Buy Now');
  const buyCta = ctaAnimation(settings, 'buyNow');
  const addCta = ctaAnimation(settings, 'addToCart');
  // Dashboard → Product Page switches
  const pageCfg = settings?.product_page_config || {};
  const showSpecsTab = pageCfg.showSpecifications !== false;
  const showReviewsTab = pageCfg.showReviews !== false;
  const allowReviews = showReviewsTab && pageCfg.allowReviews !== false;
  const stickyBar = pageCfg.stickyBuyBar !== false;
  const relatedRail = useRail(relatedFromApi.length + allProducts.length);

  // Always confirm against the API so price/stock are never stale
  useEffect(() => {
    const key = slug || initialProduct?.slug || initialProduct?.id;
    if (!key) return;

    let cancelled = false;
    setIsLoading(!initialProduct);
    setLoadError('');

    // `refresh`: the live copy arriving after the page's own copy is already
    // shown — prices, stock and options are updated, but nothing the shopper
    // has already chosen (option, quantity, photo) is reset
    let shown = false;
    const apply = (data: any, refresh = false) => {
        if (cancelled || !data) return;
        // Endpoint returns { product, related, reviews }; older builds returned a flat product.
        const loaded: any = data.product || (data.id ? data : undefined);
        if (!loaded) return;
        const list = normaliseVariations(data.variations ?? loaded.variations);
        setProduct(loaded);
        setVariations(list);
        setHasVariationsFlag(Boolean(data.hasVariations ?? loaded.hasVariations) || list.length > 0);
        setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        setRatingBreakdown(data.ratingBreakdown && typeof data.ratingBreakdown === 'object' ? data.ratingBreakdown : {});
        setSizeGuide(data.sizeGuide && Array.isArray(data.sizeGuide.columns) ? data.sizeGuide : null);
        setRelatedFromApi(Array.isArray(data.related) ? data.related : []);
        if (refresh) {
          // A wholesale buyer's live copy may carry a minimum quantity
          if (loaded.isWholesale && Number(loaded.wholesaleMinQty) > 1) {
            const min = Number(loaded.wholesaleMinQty);
            setQuantity((current) => Math.max(current, min));
            setQtyText((current) => String(Math.max(Number(current) || 0, min)));
          }
          return;
        }
        shown = true;
        setShowVideo(false);
        setActiveImage(0);
        const startQty = loaded.isWholesale && Number(loaded.wholesaleMinQty) > 1 ? Number(loaded.wholesaleMinQty) : 1;
        setQuantity(startQty);
        setQtyText(String(startQty));
        setQtyNotice('');
        setBrandLogoFailed(false);
        setPickerHint(false);
        setPreferVariationImage(true);

        // v3.8: the page opens with the first option already chosen (the first
        // one in stock, in the order set in the dashboard), so price, stock and
        // Add to Cart are ready at once. The shopper can change it freely.
        const firstInStock = list.find((v) => stockOf(v) > 0);
        const initial = firstInStock || list[0] || null;
        setSelection(initial ? { ...initial.combination } : {});
    };

    // Opened directly: the product came with the page — show it now, then
    // confirm price and stock with the API (a wholesale buyer gets their price)
    const preloaded = takeBootProduct(key);
    if (preloaded) apply(preloaded);

    fetch(`/api/products/${encodeURIComponent(String(key))}`)
      .then(async (r) => {
        // The shop says this product does not exist for this visitor (e.g. not
        // in a wholesale buyer's catalogue): say so even if a copy is on screen
        if (r.status === 404) {
          const body = await r.json().catch(() => ({}));
          if (!cancelled) setLoadError(body?.wholesaleOnly ? String(body.error || 'Product not found') : 'Product not found');
          throw new Error('not found');
        }
        if (!r.ok) throw new Error('failed');
        return r.json();
      })
      .then((data) => apply(data, shown))
      .catch(() => {
        if (!cancelled && !initialProduct && !shown) setLoadError((current) => current || 'Product not found');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, initialProduct?.id]);

  // Meta/GA "view item" — the dedupe window keeps StrictMode's double effect to one
  useEffect(() => {
    if (product?.id) tracking.viewItem(product);
  }, [product?.id]);

  // v3.15 — the browser tab shows the product (its SEO title when set)
  useEffect(() => {
    if (!product?.id) return;
    const store = String((settings as any)?.general?.storeName || (settings as any)?.seo_config?.siteTitle || '').trim();
    const own = String((product as any).seoTitle || '').trim();
    document.title = own || `${product.name}${store ? ` | ${store}` : ''}`;
  }, [product?.id, (product as any)?.seoTitle, settings]);

  const gallery = useMemo(() => {
    if (!product) return [] as string[];
    const list: string[] = [];
    if (product.image) list.push(product.image);

    if (product.images) {
      try {
        const parsed = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
        if (Array.isArray(parsed)) {
          parsed.forEach((img: any) => {
            const url = typeof img === 'string' ? img : img?.url;
            if (url && !list.includes(url)) list.push(url);
          });
        }
      } catch {
        if (typeof product.images === 'string' && product.images.startsWith('http')) {
          product.images
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s && !list.includes(s))
            .forEach((s) => list.push(s));
        }
      }
    }
    return list;
  }, [product]);

  const video = useMemo(
    () => (pageCfg.showVideo !== false && product?.videoUrl ? videoEmbed(product.videoUrl) : null),
    [product?.videoUrl, pageCfg.showVideo]
  );

  // One group per attribute, in the order the attributes and values first appear
  const optionGroups = useMemo<OptionGroup[]>(() => {
    const groups: OptionGroup[] = [];
    variations.forEach((variation) => {
      Object.entries(variation.combination).forEach(([name, value]) => {
        let group = groups.find((g) => g.name === name);
        if (!group) {
          group = { name, values: [] };
          groups.push(group);
        }
        if (!group.values.includes(String(value))) group.values.push(String(value));
      });
    });
    return groups;
  }, [variations]);

  /** v3.9 — Products → edit → Variations → "Show as" (text, picture or colour dot) */
  const optionDisplay = useMemo(() => parseOptionDisplay((product as any)?.optionDisplay), [product]);
  const imageForValue = (group: string, value: string): string | null =>
    variations.find((v) => v.combination[group] === value && (v as any).image)?.image || null;
  const hasVariations = hasVariationsFlag && optionGroups.length > 0;
  const selectionComplete = hasVariations && optionGroups.every((g) => Boolean(selection[g.name]));

  const selectedVariation = useMemo(() => {
    if (!selectionComplete) return null;
    return (
      variations.find((v) =>
        optionGroups.every((g) => v.combination[g.name] === selection[g.name])
      ) || null
    );
  }, [selectionComplete, variations, optionGroups, selection]);

  // Photo for the current (possibly partial) choice: the selected variation's,
  // or the one every still-matching variation shares, e.g. after picking a colour.
  const variationImage = useMemo(() => {
    if (!hasVariations) return null;
    if (selectedVariation?.image) return selectedVariation.image;
    if (Object.keys(selection).length === 0) return null;
    const images: string[] = Array.from(
      new Set<string>(variations.filter((v) => matchesSelection(v, selection)).map((v) => v.image || ''))
    );
    return images.length === 1 && images[0] ? images[0] : null;
  }, [hasVariations, selectedVariation, selection, variations]);

  const related = useMemo(() => {
    if (!product) return [];
    if (relatedFromApi.length > 0) return relatedFromApi.slice(0, 10);
    return allProducts
      .filter((p) => p.id !== product.id && p.categoryId === product.categoryId)
      .slice(0, 10);
  }, [product, allProducts, relatedFromApi]);

  const variationStock = selectedVariation ? stockOf(selectedVariation) : 0;

  // Quantity can never exceed what the chosen variation has in stock
  useEffect(() => {
    if (selectedVariation) setQuantity((q) => Math.max(1, Math.min(q, variationStock || 1)));
  }, [selectedVariation?.id, variationStock]);

  // Keep the typed box in step when the quantity changes from +/- or a clamp
  useEffect(() => {
    setQtyText(String(quantity));
  }, [quantity]);

  if (isLoading) {
    return (
      // Its own key: the page that replaces it is a new block, not this one moved
      <div key="product-loading" className="max-w-(--ds-page-max) mx-auto px-(--ds-gutter) pt-(--ds-s-4) sm:pt-(--ds-s-6) pb-(--ds-s-10)" aria-busy>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-(--ds-s-8)">
          <div className="space-y-(--ds-s-3)">
            <div className="ds-skeleton product-frame rounded-(--ds-r-xl)" />
            <div className="flex gap-(--ds-s-2)">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="ds-skeleton w-16 h-16 rounded-(--ds-r-md)" />
              ))}
            </div>
          </div>
          <div className="space-y-(--ds-s-4)">
            <div className="ds-skeleton h-8 w-3/4" />
            <div className="ds-skeleton h-5 w-1/3" />
            <div className="ds-skeleton h-10 w-1/2" />
            <div className="ds-skeleton h-24" />
            <div className="ds-skeleton h-(--ds-h-lg) rounded-(--ds-r-md)" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !product) {
    return (
      <div className="max-w-xl mx-auto px-(--ds-gutter) py-(--ds-s-16) text-center">
        <div className="w-14 h-14 mx-auto mb-(--ds-s-4) rounded-(--ds-r-full) bg-(--ds-warning-soft) text-(--ds-warning-text) flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h1 className="text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text)">
          {t(loadError || 'Product not found')}
        </h1>
        <StoreLink
          to={{ view: 'shop', params: {} }}
          onNavigate={onNavigate}
          className="ds-btn ds-btn-primary mt-(--ds-s-6)"
        >
          {t('Browse all products')}
        </StoreLink>
      </div>
    );
  }

  /* ---- Price and stock for the current choice ---------------------------- */
  const priceOfVariation = (variation: ProductVariation) => {
    const regular = Number(variation.price ?? product.price) || 0;
    const sale =
      variation.salePrice !== null && variation.salePrice !== undefined && variation.salePrice !== ''
        ? Number(variation.salePrice)
        : null;
    return { regular, sale: sale && sale > 0 && sale < regular ? sale : null };
  };

  let price: number;
  let oldPrice: number | null;
  let priceRange: { min: number; max: number } | null = null;

  if (selectedVariation) {
    const { regular, sale } = priceOfVariation(selectedVariation);
    price = sale ?? regular;
    oldPrice = sale ? regular : null;
  } else {
    price = Number(product.salePrice || product.price);
    oldPrice = product.salePrice && Number(product.salePrice) < Number(product.price) ? Number(product.price) : null;
    if (hasVariations) {
      const effective = variations.map((v) => {
        const { regular, sale } = priceOfVariation(v);
        return sale ?? regular;
      });
      const min = Math.min(...effective);
      const max = Math.max(...effective);
      if (min !== max) priceRange = { min, max };
      else {
        price = min;
        oldPrice = null;
      }
    }
  }

  const discount = oldPrice && oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  const anyVariationInStock = variations.some((v) => stockOf(v) > 0);
  const availableStock = hasVariations ? variationStock : Math.max(0, product.stock ?? 0);
  const inStock = hasVariations ? (selectedVariation ? variationStock > 0 : anyVariationInStock) : availableStock > 0;
  const canPurchase = hasVariations ? Boolean(selectedVariation && variationStock > 0) : availableStock > 0;
  // Wholesale buyers: the product's own minimum/maximum order quantity applies
  const wholesaleMin = product.isWholesale && Number(product.wholesaleMinQty) > 0 ? Number(product.wholesaleMinQty) : 1;
  const wholesaleMax = product.isWholesale && Number(product.wholesaleMaxQty) > 0 ? Number(product.wholesaleMaxQty) : Infinity;
  const minQty = Math.max(1, wholesaleMin);
  const maxQty = Math.max(1, Math.min(availableStock || 1, wholesaleMax));

  /** Apply a typed or stepped quantity, keeping it inside min/max and saying why when it moves */
  const commitQuantity = (raw: number) => {
    if (!Number.isFinite(raw) || raw < 1) raw = minQty;
    let next = Math.floor(raw);
    let notice = '';
    if (next > maxQty) {
      next = maxQty;
      notice =
        maxQty === availableStock
          ? t('Only {n} in stock.', { n: availableStock })
          : t('Maximum wholesale quantity is {n}.', { n: maxQty });
    }
    if (next < minQty) {
      next = minQty;
      notice = t('Minimum wholesale quantity is {n}.', { n: minQty });
    }
    setQuantity(next);
    setQtyText(String(next));
    setQtyNotice(notice);
  };
  const lowStockThreshold = product.lowStockThreshold || 10;
  const sku = selectedVariation?.sku || product.sku;

  const fmt = (value: number) => value.toLocaleString('en-BD');

  /* ---- Option picker ------------------------------------------------------ */
  /** In stock with some combination — such a value can always be picked */
  const isValueInStock = (name: string, value: string) =>
    variations.some((v) => stockOf(v) > 0 && v.combination[name] === value);

  const pickValue = (name: string, value: string) => {
    setPickerHint(false);
    setPreferVariationImage(true);
    setSelection((prev) => {
      if (prev[name] === value) return prev;
      const wanted = { ...prev, [name]: value };
      const exact = variations.find((v) => stockOf(v) > 0 && matchesSelection(v, wanted));
      if (exact || !isValueInStock(name, value)) return wanted;
      // That value is only in stock with other choices (e.g. White comes only in
      // 42/44): switch to the in-stock option that keeps most of the current
      // choices, instead of leaving the shopper with a dead combination.
      let best: ProductVariation | null = null;
      let bestScore = -1;
      for (const v of variations) {
        if (stockOf(v) <= 0 || v.combination[name] !== value) continue;
        const score = Object.entries(prev).filter(([key, current]) => v.combination[key] === current).length;
        if (score > bestScore) {
          best = v;
          bestScore = score;
        }
      }
      return best ? { ...best.combination } : wanted;
    });
  };

  /* ---- Cart --------------------------------------------------------------- */
  // A variation line carries the variation's own price, stock, SKU and photo,
  // so the cart subtotal, stock caps and AddToCart tracking all see them.
  const purchase = (openDrawer: boolean) => {
    if (!canPurchase) {
      if (hasVariations) revealPicker();
      return false;
    }
    if (quantity < minQty || quantity > maxQty) {
      commitQuantity(quantity);
      return false;
    }
    if (selectedVariation) {
      const { regular, sale } = priceOfVariation(selectedVariation);
      const lineProduct: Product = {
        ...product,
        price: String(regular),
        salePrice: sale !== null ? String(sale) : null,
        stock: variationStock,
        sku: selectedVariation.sku || product.sku,
        image: selectedVariation.image || product.image,
        // The id Meta's catalog lists this option under (see /feeds/meta-catalog)
        feedId: String(selectedVariation.sku || '').trim() || `${String(product.sku || '').trim() || product.id}-${selectedVariation.id}`,
      } as Product;
      addToCart(lineProduct, quantity, openDrawer, {
        id: selectedVariation.id,
        label: labelOf(selectedVariation),
      });
    } else {
      addToCart(product, quantity, openDrawer);
    }
    return true;
  };

  /**
   * The photo on screen flies into the cart icon. The line is added at once
   * (the cart itself is unchanged); only the drawer waits for the landing.
   * When the photo has been scrolled out of view — the sticky phone bar — there
   * is nothing to watch fly, so the drawer opens straight away.
   */
  const handleAddToCart = () => {
    if (!canPurchase) {
      if (hasVariations) revealPicker();
      return;
    }
    if (quantity < minQty || quantity > maxQty) {
      commitQuantity(quantity);
      return;
    }
    const frame = imageFrameRef.current;
    const rect = frame?.getBoundingClientRect();
    const onScreen = Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight);
    const photo = frame?.querySelector('img') || frame;
    flyToCart(onScreen ? photo : null, { onLand: () => setIsCartDrawerOpen(true) });
    purchase(false);
  };

  const handleBuyNow = () => {
    if (!purchase(false)) return;
    setIsCartDrawerOpen(false);
    onNavigate('checkout');
  };

  const revealPicker = () => {
    setPickerHint(true);
    pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  /* ---- Contact buttons (Dashboard → Checkout & Payment → Product page buttons) */
  const contactCfg = settings?.product_contact_config;
  const showCallButton = Boolean(contactCfg?.showCallButton && contactCfg?.callNumber);
  const rawWhatsapp = (contactCfg?.whatsappNumber || '').replace(/[^\d]/g, '');
  const intlWhatsapp = rawWhatsapp.startsWith('880')
    ? rawWhatsapp
    : rawWhatsapp.startsWith('0')
    ? `88${rawWhatsapp}`
    : rawWhatsapp;
  const showWhatsappButton = Boolean(contactCfg?.showWhatsappButton && intlWhatsapp);
  const whatsappHref = `https://wa.me/${intlWhatsapp}?text=${encodeURIComponent(
    `${product.name}${selectedVariation ? ` (${labelOf(selectedVariation)})` : ''}`
  )}`;

  /* ---- Gallery ------------------------------------------------------------ */
  const mainImage = (preferVariationImage && variationImage) || gallery[activeImage];
  const stepImage = (direction: 1 | -1) => {
    if (gallery.length < 2) return;
    setPreferVariationImage(false);
    setActiveImage((i) => (i + direction + gallery.length) % gallery.length);
  };
  const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;

  const rating = Number(product.rating || 0);
  const reviewCount = Number(product.reviewCount || reviews.length || 0);
  const showRating = showReviewsTab && reviewCount > 0;

  const howToUse = String((product as any).howToUse || '').trim();
  const highlights = parseHighlights((product as any).highlights);
  const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
    { key: 'description', label: t(pageCfg.descriptionTabLabel || 'Description'), icon: FileText },
    ...(howToUse ? [{ key: 'howto' as TabKey, label: t(pageCfg.howToUseTabLabel || 'How To Use'), icon: Settings2 }] : []),
    ...(showSpecsTab ? [{ key: 'specification' as TabKey, label: t('Specifications'), icon: ListChecks }] : []),
    ...(showReviewsTab ? [{ key: 'reviews' as TabKey, label: t('Reviews ({n})', { n: reviewCount }), icon: Star }] : []),
  ];
  const descriptionImage = (() => {
    const list = Array.isArray(product.images) ? product.images : [];
    return (list.find((url: string) => url && url !== product.image) as string) || product.image || '';
  })();
  const currentTab: TabKey = tabs.some((tab) => tab.key === activeTab) ? activeTab : 'description';
  const unitLabel = (product.unit || '').trim();

  const specRows: Array<[string, string | null | undefined]> = [
    [t('Product'), product.name],
    [t('Generic name'), product.genericName],
    [t('Brand'), product.brandName],
    [t('Category'), product.categoryName],
    ...(selectedVariation
      ? (Object.entries(selectedVariation.combination) as Array<[string, string]>)
      : []),
    [t('Unit'), product.unit],
    [t('Dosage'), product.dosage],
    [t('SKU'), sku],
    [t('Batch number'), product.batchNumber],
    [t('Expiry'), product.expiryDate ? new Date(product.expiryDate).toLocaleDateString('en-GB') : null],
  ];

  const priceText = priceRange
    ? `${currency}${fmt(priceRange.min)} – ${currency}${fmt(priceRange.max)}`
    : `${currency}${fmt(price)}`;

  const renderOptionPicker = (glowLook = false) =>
    hasVariations ? (
              <div
                ref={pickerRef}
                className={`space-y-(--ds-s-4) rounded-(--ds-r-lg) transition-shadow duration-(--ds-dur) ${
                  pickerHint ? 'outline-2 outline-offset-8 outline-(--ds-danger)' : ''
                }`}
              >
                {optionGroups.map((group) => (
                  <fieldset key={group.name} className="space-y-(--ds-s-2) min-w-0">
                    <legend className={`flex items-baseline gap-(--ds-s-2) mb-(--ds-s-2) ${glowLook ? 'text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg)' : 'text-(length:--ds-fs-sm)'}`}>
                      <span className={`text-(--ds-text) ${glowLook ? 'font-(--ds-fw-medium)' : 'font-(--ds-fw-semibold)'}`}>{group.name}</span>
                      {selection[group.name] ? (
                        <span className="text-(--ds-text-muted)">{selection[group.name]}</span>
                      ) : (
                        pickerHint && <span className="text-(--ds-danger-text)">{t('Choose one')}</span>
                      )}
                    </legend>
                    <div className="flex flex-wrap gap-(--ds-s-2)">
                      {group.values.map((value) => {
                        const selected = selection[group.name] === value;
                        // Pickable whenever it is in stock in any combination; the
                        // other choices adjust if needed (see pickValue)
                        const available = isValueInStock(group.name, value);
                        const mode = optionDisplay[group.name] || 'text';
                        const picture = mode === 'image' ? imageForValue(group.name, value) : null;
                        const dot = mode === 'color' ? swatchColor(value) : null;
                        if (picture) {
                          return (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={selected}
                              aria-label={value}
                              disabled={!available && !selected}
                              onClick={() => pickValue(group.name, value)}
                              title={available ? value : `${value} — ${t('unavailable')}`}
                              className={`group/sw relative w-[68px] flex flex-col items-center gap-1 p-1 rounded-(--ds-r-md) border-2 transition-all duration-(--ds-dur-fast) ${
                                selected
                                  ? 'border-(--primary) bg-[color-mix(in_srgb,var(--primary)_7%,transparent)] shadow-(--ds-shadow-sm) cursor-pointer'
                                  : available
                                  ? 'border-(--ds-border) bg-(--ds-surface) hover:border-(--primary) cursor-pointer'
                                  : 'border-dashed border-(--ds-border) opacity-45 cursor-not-allowed'
                              }`}
                            >
                              <img src={sized(picture, 240)} alt="" loading="lazy" className="w-full aspect-square object-cover rounded-[6px] bg-(--ds-surface-2)" />
                              <span className={`w-full truncate text-center text-(length:--ds-fs-xs) font-(--ds-fw-semibold) ${selected ? 'text-(--primary)' : 'text-(--ds-text-soft)'}`}>
                                {value}
                              </span>
                              {selected && (
                                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-(--primary) text-(--primary-foreground) inline-flex items-center justify-center shadow-(--ds-shadow-sm)">
                                  <Check className="w-3 h-3" strokeWidth={3} />
                                </span>
                              )}
                            </button>
                          );
                        }
                        if (dot) {
                          return (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={selected}
                              disabled={!available && !selected}
                              onClick={() => pickValue(group.name, value)}
                              title={available ? value : `${value} — ${t('unavailable')}`}
                              className={`inline-flex items-center gap-(--ds-s-2) h-(--ds-h-md) pl-1.5 pr-(--ds-s-3) rounded-(--ds-r-full) border text-(length:--ds-fs-base) font-(--ds-fw-medium) transition-colors duration-(--ds-dur-fast) ${
                                selected
                                  ? 'border-(--primary) ring-2 ring-[color-mix(in_srgb,var(--primary)_25%,transparent)] text-(--ds-text) cursor-pointer'
                                  : available
                                  ? 'border-(--ds-border-strong) bg-(--ds-surface) text-(--ds-text) hover:border-(--primary) cursor-pointer'
                                  : 'border-dashed border-(--ds-border) text-(--ds-text-muted) line-through cursor-not-allowed'
                              }`}
                            >
                              <span className="w-6 h-6 rounded-full border border-black/10 shadow-inner" style={{ background: dot }} />
                              {value}
                            </button>
                          );
                        }
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={selected}
                            disabled={!available && !selected}
                            onClick={() => pickValue(group.name, value)}
                            title={available ? value : `${value} — ${t('unavailable')}`}
                            dir="auto"
                            className={`border transition-colors duration-(--ds-dur-fast) ${
                              glowLook
                                ? 'min-w-[4.5rem] h-11 sm:h-12 px-(--ds-s-5) rounded-full text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg)'
                                : 'min-w-(--ds-h-lg) h-(--ds-h-md) px-(--ds-s-3) rounded-(--ds-r-md) text-(length:--ds-fs-base) font-(--ds-fw-medium)'
                            } ${
                              selected
                                ? 'border-(--primary) bg-(--primary) text-(--primary-foreground) cursor-pointer'
                                : available
                                ? 'border-(--ds-border-strong) bg-(--ds-surface) text-(--ds-text) hover:border-(--primary) hover:text-(--primary) cursor-pointer'
                                : 'border-dashed border-(--ds-border) bg-(--ds-surface-2) text-(--ds-text-muted) line-through cursor-not-allowed'
                            }`}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
          
    ) : null;

  const renderStepper = (glowLook = false) => (
  <div
    className={`inline-flex items-center border border-(--ds-border-strong) bg-(--ds-surface) overflow-hidden ${
      glowLook ? 'h-12 sm:h-14 rounded-full' : 'h-(--ds-h-lg) rounded-(--ds-r-md)'
    }`}
  >
    <button
      type="button"
      aria-label={t('Decrease quantity')}
      onClick={() => commitQuantity(quantity - 1)}
      disabled={quantity <= minQty || !canPurchase}
      className="w-(--ds-h-lg) sm:w-14 h-full flex items-center justify-center text-(--ds-text-soft) hover:bg-(--ds-surface-3) disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
    >
      <Minus className="w-4 h-4" />
    </button>
    {/* Type any amount; it is kept within stock (and wholesale limits) on leaving the box */}
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={t('Quantity')}
      value={qtyText}
      disabled={!canPurchase}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
        setQtyText(digits);
        setQtyNotice('');
        const typed = Number(digits);
        if (digits && typed >= 1 && typed <= maxQty) setQuantity(typed);
      }}
      onBlur={() => commitQuantity(Number(qtyText))}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur();
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          commitQuantity(quantity + 1);
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          commitQuantity(quantity - 1);
        }
      }}
      onFocus={(event) => event.currentTarget.select()}
      className="ds-num w-16 h-full text-center text-(length:--ds-fs-md) font-(--ds-fw-bold) bg-transparent border-x border-(--ds-border) outline-none focus:bg-(--ds-surface-2) disabled:opacity-60"
    />
    <button
      type="button"
      aria-label={t('Increase quantity')}
      onClick={() => commitQuantity(quantity + 1)}
      disabled={quantity >= maxQty || !canPurchase}
      className="w-(--ds-h-lg) sm:w-14 h-full flex items-center justify-center text-(--ds-text-soft) hover:bg-(--ds-surface-3) disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
    >
      <Plus className="w-4 h-4" />
    </button>
  </div>
  );

  const renderQtyNotice = () =>
    (qtyNotice || (product.isWholesale && (minQty > 1 || Number.isFinite(wholesaleMax)))) && (
    <p
      className={`mt-(--ds-s-1) text-(length:--ds-fs-xs) ${
        qtyNotice ? 'text-(--ds-warning-text) font-(--ds-fw-semibold)' : 'text-(--ds-text-muted)'
      }`}
      role={qtyNotice ? 'status' : undefined}
    >
      {qtyNotice ||
        [
          minQty > 1 ? t('Minimum {n}', { n: minQty }) : '',
          Number.isFinite(wholesaleMax) ? t('maximum {n}', { n: wholesaleMax }) : '',
        ]
          .filter(Boolean)
          .join(', ') + ' ' + t('per wholesale order')}
    </p>
  );

  /* ---- v3.13 — Glow product page (Dashboard → Website → Themes) ------------ */
  const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}/product/${product.slug || product.id}` : '';
  const shareLinks = [
    { name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`, icon: 'facebook' },
    { name: 'X', href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(product.name)}`, icon: 'x' },
    { name: 'Pinterest', href: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(pageUrl)}&description=${encodeURIComponent(product.name)}${product.image ? `&media=${encodeURIComponent(product.image.startsWith('http') ? product.image : `${window.location.origin}${product.image}`)}` : ''}`, icon: 'pinterest' },
    { name: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${product.name} ${pageUrl}`)}`, icon: 'whatsapp' },
  ];
  const inWishlist = isInWishlist(product.id);
  const tags = [product.brandName, product.genericName, product.unit].filter((item): item is string => Boolean(item && String(item).trim()));
  // v3.15 — the product's own tags (product form → SEO)
  const ownTags = String((product as any).tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const stockPill = !hasVariations || selectedVariation
    ? !inStock
      ? { text: t('Out of stock'), cls: 'border-(--ds-danger) text-(--ds-danger-text) bg-(--ds-danger-soft)' }
      : availableStock <= lowStockThreshold
      ? { text: t('Only {n} left', { n: availableStock }), cls: 'border-(--ds-warning) text-(--ds-warning-text) bg-(--ds-warning-soft)' }
      : { text: t('In Stock'), cls: 'border-(--ds-success) text-(--ds-success-text) bg-(--ds-success-soft)' }
    : anyVariationInStock
    ? { text: t('In Stock'), cls: 'border-(--ds-success) text-(--ds-success-text) bg-(--ds-success-soft)' }
    : { text: t('Out of stock'), cls: 'border-(--ds-danger) text-(--ds-danger-text) bg-(--ds-danger-soft)' };
  const openReviews = () => {
    setActiveTab('reviews');
    window.requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const copyLink = () => {
    try {
      void navigator.clipboard?.writeText(pageUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* no clipboard */
    }
  };
  const TRUST_ICONS = [Banknote, Truck, RotateCcw];

  const renderGlowTop = () => (
    <div className="space-y-(--ds-s-4)">
      {glowCfg.showBreadcrumb && (
        <nav aria-label={t('Breadcrumb')} className="flex items-center gap-1.5 min-w-0 text-(length:--ds-fs-sm) text-(--ds-text-muted)">
          <StoreLink to={{ view: 'home', params: {} }} onNavigate={onNavigate} className="shrink-0 hover:text-(--primary)">
            {t('Home')}
          </StoreLink>
          <ChevronRight className="w-3.5 h-3.5 shrink-0 rtl:rotate-180" />
          {product.categoryName && (
            <>
              <StoreLink
                to={{ view: 'shop', params: { category: product.categorySlug || product.categoryId } }}
                onNavigate={onNavigate}
                className="shrink-0 max-w-[40%] truncate hover:text-(--primary)"
              >
                {product.categoryName}
              </StoreLink>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 rtl:rotate-180" />
            </>
          )}
          <span className="truncate text-(--ds-text-soft)">{product.name}</span>
        </nav>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-(--ds-s-6) lg:gap-(--ds-s-12) items-start">
        {/* ---------------------------------------------------------------- Gallery */}
        <div className="lg:sticky store-sticky min-w-0 space-y-(--ds-s-3) sm:space-y-(--ds-s-4)">
          <div
            ref={imageFrameRef}
            className={`relative product-frame rounded-[22px] sm:rounded-[26px] bg-(--glow-soft) overflow-hidden select-none ${canHover && mainImage ? 'cursor-zoom-in' : ''}`}
            onMouseMove={(event) => {
              if (!canHover || !mainImage || showVideo) return;
              const rect = event.currentTarget.getBoundingClientRect();
              setZoom({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 });
            }}
            onMouseLeave={() => setZoom(null)}
            onTouchStart={(event) => {
              touchStartX.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const start = touchStartX.current;
              touchStartX.current = null;
              if (showVideo) return;
              const end = event.changedTouches[0]?.clientX;
              if (start === null || end === undefined) return;
              const delta = end - start;
              if (Math.abs(delta) > 40) stepImage(delta < 0 ? 1 : -1);
            }}
          >
            {showVideo && video ? (
              <div className="absolute inset-0 bg-black flex items-center justify-center">
                {video.kind === 'file' ? (
                  <video src={video.src} controls autoPlay playsInline className="w-full h-full object-contain" />
                ) : (
                  <iframe
                    src={`${video.src}${video.kind === 'youtube' ? '&autoplay=1' : '&autoplay=true'}`}
                    title={`${product.name} video`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className={video.vertical ? 'h-full aspect-[9/16] max-w-full border-0' : 'w-full aspect-video border-0'}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setShowVideo(false)}
                  aria-label={t('Close video')}
                  className="absolute top-(--ds-s-3) end-(--ds-s-3) w-9 h-9 rounded-full bg-white/90 text-[#0f172a] flex items-center justify-center shadow-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : mainImage ? (
              <img
                key={mainImage}
                {...responsiveImg(mainImage, '(min-width: 1024px) 600px, 100vw', 800, 320)}
                alt={product.name}
                loading="eager"
                draggable={false}
                className="w-full h-full product-img object-center transition-transform duration-(--ds-dur) ease-(--ds-ease)"
                style={zoom ? { transform: 'scale(2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
                onError={(event) => {
                  const img = event.currentTarget;
                  img.onerror = null;
                  img.removeAttribute('srcset');
                  img.src = IMAGE_PLACEHOLDER;
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-(--ds-text-faint)">
                <ImageOff className="w-10 h-10" />
              </div>
            )}

            {discount > 0 && !showVideo && (
              <span className="absolute top-(--ds-s-4) start-(--ds-s-4) inline-flex items-center h-8 px-(--ds-s-3) rounded-full bg-(--primary) text-(--primary-foreground) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) ds-num shadow-(--ds-shadow-sm)">
                {t('{n}% off', { n: discount })}
              </span>
            )}

            {video && !showVideo && (
              <button
                type="button"
                onClick={() => setShowVideo(true)}
                className="absolute bottom-(--ds-s-4) end-(--ds-s-4) inline-flex items-center gap-(--ds-s-1) h-9 ps-1 pe-(--ds-s-3) rounded-full bg-black/75 text-white text-(length:--ds-fs-xs) font-(--ds-fw-semibold) shadow-(--ds-shadow-md) cursor-pointer hover:bg-black/85"
              >
                <span className="w-7 h-7 rounded-full bg-white text-[#0f172a] flex items-center justify-center">
                  <Play className="w-3 h-3 ms-0.5 fill-current" />
                </span>
                {t('Watch video')}
              </button>
            )}

            {gallery.length > 1 && !showVideo && (
              <>
                <button type="button" aria-label={t('Previous image')} onClick={() => stepImage(-1)} className="glow-arrow absolute start-(--ds-s-3) sm:start-(--ds-s-6) top-1/2 -translate-y-1/2 bg-(--ds-surface) text-(--ds-text) hover:bg-white">
                  <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
                </button>
                <button type="button" aria-label={t('Next image')} onClick={() => stepImage(1)} className="glow-arrow absolute end-(--ds-s-3) sm:end-(--ds-s-6) top-1/2 -translate-y-1/2 bg-(--primary) text-(--primary-foreground) hover:bg-(--primary-hover)">
                  <ChevronRight className="w-5 h-5 rtl:rotate-180" />
                </button>
              </>
            )}
          </div>

          {(gallery.length > 1 || (video && gallery.length > 0)) && (
            <div className="grid grid-cols-4 gap-(--ds-s-2) sm:gap-(--ds-s-3)">
              {gallery.slice(0, video ? 3 : 4).map((img, i) => {
                const active = !showVideo && mainImage === img;
                return (
                  <button
                    type="button"
                    key={`${img}-${i}`}
                    onClick={() => {
                      setShowVideo(false);
                      setPreferVariationImage(false);
                      setActiveImage(i);
                    }}
                    aria-label={t('Image {n}', { n: i + 1 })}
                    aria-current={active}
                    className={`relative product-frame rounded-[14px] sm:rounded-[16px] overflow-hidden bg-(--glow-soft) border-2 transition-colors cursor-pointer ${
                      active ? 'border-(--primary)' : 'border-transparent hover:border-(--ds-border-strong)'
                    }`}
                  >
                    <img src={sized(img, 240)} alt="" loading="lazy" className="w-full h-full product-img" />
                    {i === (video ? 2 : 3) && gallery.length > (video ? 3 : 4) && (
                      <span className="absolute inset-0 bg-black/45 text-white flex items-center justify-center text-(length:--ds-fs-lg) font-(--ds-fw-bold)">
                        +{gallery.length - (video ? 3 : 4)}
                      </span>
                    )}
                  </button>
                );
              })}
              {video && (
                <button
                  type="button"
                  onClick={() => setShowVideo(true)}
                  aria-label={t('Play product video')}
                  aria-current={showVideo}
                  className={`relative product-frame rounded-[14px] sm:rounded-[16px] overflow-hidden border-2 cursor-pointer bg-[linear-gradient(135deg,#0f172a,#334155)] ${
                    showVideo ? 'border-(--primary)' : 'border-transparent'
                  }`}
                >
                  {youtubeThumb(video.src) && <img src={youtubeThumb(video.src)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-80" />}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-9 h-9 rounded-full bg-white/90 text-[#0f172a] flex items-center justify-center shadow-md">
                      <Play className="w-4 h-4 ms-0.5 fill-current" />
                    </span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------- Info */}
        <div className="min-w-0 space-y-(--ds-s-5)">
          <div className="space-y-(--ds-s-3)">
            <div className="flex flex-wrap items-center gap-(--ds-s-2)">
              {product.categoryName && (
                <StoreLink
                  to={{ view: 'shop', params: { category: product.categorySlug || product.categoryId } }}
                  onNavigate={onNavigate}
                  className="text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) text-(--ds-text-muted) hover:text-(--primary)"
                >
                  {product.categoryName}
                </StoreLink>
              )}
              {product.isWholesale && <WholesalePill />}
              {product.requiresPrescription && (
                <span className="ds-badge ds-badge-danger">
                  <FileText className="w-3 h-3" />
                  Rx
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-(--ds-s-3) gap-y-(--ds-s-2)">
              <h1 className="text-[26px] sm:text-[34px] font-(--ds-fw-semibold) leading-tight tracking-[-0.01em] text-(--ds-text) break-words">{product.name}</h1>
              {glowCfg.showStockPill && (
                <span className={`inline-flex items-center h-8 px-(--ds-s-3) rounded-full border text-(length:--ds-fs-sm) font-(--ds-fw-medium) ${stockPill.cls}`}>
                  {stockPill.text}
                </span>
              )}
            </div>
            {product.genericName && (
              <StoreLink
                to={{ view: 'shop', params: { generic: product.genericName } }}
                onNavigate={onNavigate}
                className="inline-block text-(length:--ds-fs-md) text-(--ds-text-soft) underline decoration-dotted underline-offset-4 hover:text-(--primary)"
              >
                {product.genericName}
              </StoreLink>
            )}
            {glowCfg.showRating && showRating && (
              <button type="button" onClick={openReviews} className="inline-flex items-center gap-(--ds-s-2) cursor-pointer">
                <Stars value={rating} size="w-5 h-5" />
                <span className="text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) text-(--ds-text) ds-num">
                  {rating.toFixed(1)} ({t('{n} Reviews', { n: reviewCount })})
                </span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-baseline gap-x-(--ds-s-3) gap-y-(--ds-s-1)">
            <span className="ds-num text-[28px] sm:text-[34px] font-(--ds-fw-semibold) leading-none text-(--glow-accent-ink)">
              {priceText}
              {unitLabel && <span className="ms-1 text-(length:--ds-fs-md) font-(--ds-fw-medium) text-(--ds-text-muted)">/ {unitLabel}</span>}
            </span>
            {oldPrice && !priceRange && (
              <span className="ds-num text-[20px] sm:text-[26px] text-(--ds-text-muted) line-through leading-none">
                {currency}
                {fmt(oldPrice)}
              </span>
            )}
          </div>
          {hasVariations && !selectedVariation && anyVariationInStock && (
            <p className="text-(length:--ds-fs-sm) text-(--ds-text-muted)">{t('Choose options to see price and stock')}</p>
          )}
          {product.freeShipping && (
            <span className="inline-flex items-center gap-(--ds-s-1) h-7 px-(--ds-s-3) rounded-full bg-(--ds-success-soft) text-(--ds-success-text) text-(length:--ds-fs-xs) font-(--ds-fw-bold)">
              <Truck className="w-3.5 h-3.5" /> {t('Free delivery')}
            </span>
          )}

          {product.shortDescription && (
            <p className="text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) leading-(--ds-lh-normal) text-(--ds-text-soft)">{product.shortDescription}</p>
          )}

          {product.requiresPrescription && (
            <div className="flex items-start gap-(--ds-s-2) p-(--ds-s-3) rounded-(--ds-r-md) bg-(--ds-warning-soft) text-(length:--ds-fs-sm) text-(--ds-warning-text)">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t('This medicine is sold only against a valid prescription. We will verify your prescription after you order.')}</span>
            </div>
          )}

          {renderOptionPicker(true)}

          {sizeGuide && pageCfg.showSizeGuide !== false && (
            <button
              type="button"
              onClick={() => setSizeGuideOpen(true)}
              className="inline-flex items-center gap-(--ds-s-2) h-9 px-(--ds-s-4) rounded-full border border-(--ds-border-strong) bg-(--ds-surface) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text) hover:border-(--primary) hover:text-(--primary) transition-colors cursor-pointer"
            >
              <Ruler className="w-4 h-4" /> {t('Size guide')}
            </button>
          )}

          {/* Quantity + buttons: one row on wide screens; on phones the
              buttons share the row under the quantity */}
          <div className="flex flex-wrap items-center gap-(--ds-s-3)">
            {renderStepper(true)}
            <div className="flex flex-1 min-w-[min(100%,18rem)] items-center gap-(--ds-s-2) sm:gap-(--ds-s-3)">
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!canPurchase}
                className={`cta-atc cta-page flex-1 min-w-0 inline-flex items-center justify-center gap-(--ds-s-2) h-12 sm:h-14 px-(--ds-s-4) rounded-full bg-(--primary) text-(--primary-foreground) text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) font-(--ds-fw-semibold) hover:bg-(--primary-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${addCta.className}`}
                style={addCta.style}
              >
                <span className="truncate">{addToCartLabel}</span>
              </button>
              <button
                type="button"
                onClick={handleBuyNow}
                disabled={!canPurchase}
                className={`cta-buy cta-page flex-1 min-w-0 inline-flex items-center justify-center gap-(--ds-s-2) h-12 sm:h-14 px-(--ds-s-4) rounded-full bg-(--glow-accent-strong) text-(--glow-accent-fg) text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) font-(--ds-fw-semibold) hover:brightness-95 transition-[filter] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${buyCta.className}`}
                style={buyCta.style}
              >
                <span className="truncate">{buyNowLabel}</span>
              </button>
              {glowCfg.showWishlist && (
                <button
                  type="button"
                  onClick={() => toggleWishlist(product)}
                  aria-label={inWishlist ? t('Remove from wishlist') : t('Add to wishlist')}
                  aria-pressed={inWishlist}
                  className={`shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full border inline-flex items-center justify-center transition-colors cursor-pointer ${
                    inWishlist ? 'border-(--ds-rose) text-(--ds-rose)' : 'border-(--ds-border-strong) text-(--ds-text) hover:border-(--primary) hover:text-(--primary)'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${inWishlist ? 'fill-current' : ''}`} />
                </button>
              )}
            </div>
          </div>
          {renderQtyNotice()}

          {(showCallButton || showWhatsappButton) && (
            <div className={`grid gap-(--ds-s-3) ${showCallButton && showWhatsappButton ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {showCallButton && (
                <a
                  href={`tel:${contactCfg?.callNumber || ''}`}
                  onClick={() => tracking.contact('phone')}
                  className="inline-flex items-center justify-center gap-(--ds-s-2) h-11 rounded-full text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text-invert) hover:opacity-90"
                  style={{ backgroundColor: contactCfg?.callBgColor || 'var(--primary)' }}
                >
                  <Phone className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t(contactCfg?.callLabel || 'Call us')}</span>
                </a>
              )}
              {showWhatsappButton && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => tracking.contact('whatsapp')}
                  className="inline-flex items-center justify-center gap-(--ds-s-2) h-11 rounded-full text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text-invert) hover:opacity-90"
                  style={{ backgroundColor: contactCfg?.whatsappBgColor || 'var(--ds-success)' }}
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span className="truncate">{contactCfg?.whatsappLabel || 'WhatsApp'}</span>
                </a>
              )}
            </div>
          )}

          {glowCfg.showTrust && glowCfg.trust.some((item) => item.trim()) && (
            <ul className="grid grid-cols-3 gap-(--ds-s-2) rounded-[18px] bg-(--glow-soft) p-(--ds-s-3)">
              {glowCfg.trust.map((item, index) => {
                if (!item.trim()) return null;
                const Icon = TRUST_ICONS[index] || CheckCircle2;
                return (
                  <li key={index} className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-(--ds-s-2) text-center sm:text-start">
                    <span className="w-9 h-9 shrink-0 rounded-full bg-(--ds-surface) text-(--primary) inline-flex items-center justify-center shadow-(--ds-shadow-xs)">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-(length:--ds-fs-xs) sm:text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text) leading-tight">{t(item)}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {(glowCfg.showMeta || glowCfg.showShare) && (
            <div className="pt-(--ds-s-5) border-t border-(--ds-border) space-y-(--ds-s-3) text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg)">
              {glowCfg.showMeta && sku && (
                <p className="text-(--ds-text-soft)">
                  <span className="font-(--ds-fw-semibold) text-(--ds-text)">{t('SKU')} :</span> <span className="ds-num">{sku}</span>
                </p>
              )}
              {glowCfg.showMeta && (product.categoryName || tags.length > 0 || ownTags.length > 0) && (
                <p className="text-(--ds-text-soft)">
                  <span className="font-(--ds-fw-semibold) text-(--ds-text)">{t('Tags')} :</span> {[product.categoryName, ...(ownTags.length ? ownTags : tags)].filter(Boolean).join(', ')}
                </p>
              )}
              {glowCfg.showShare && (
                <div className="flex flex-wrap items-center gap-(--ds-s-2)">
                  <span className="font-(--ds-fw-semibold) text-(--ds-text) me-1">{t('Share')} :</span>
                  {shareLinks.map((link) => {
                    const Icon = (BRAND_ICONS as any)[link.icon] || Share2;
                    return (
                      <a
                        key={link.name}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${t('Share')} — ${link.name}`}
                        title={link.name}
                        className="w-9 h-9 rounded-full bg-(--ds-text) text-white inline-flex items-center justify-center hover:bg-(--primary) transition-colors"
                      >
                        <Icon className="w-4 h-4" />
                      </a>
                    );
                  })}
                  <button
                    type="button"
                    onClick={copyLink}
                    aria-label={t('Copy link')}
                    title={t('Copy link')}
                    className="w-9 h-9 rounded-full bg-(--ds-text) text-white inline-flex items-center justify-center hover:bg-(--primary) transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                  </button>
                  {copied && <span className="text-(length:--ds-fs-sm) text-(--ds-success-text)">{t('Link copied')}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      key="product-page"
      className={`max-w-(--ds-page-max) mx-auto px-(--ds-gutter) pt-(--ds-s-4) sm:pt-(--ds-s-6) ${
        stickyBar ? 'pb-[calc(var(--ds-h-lg)+var(--ds-s-12))]' : 'pb-(--ds-s-10)'
      } lg:pb-(--ds-s-12) space-y-(--ds-s-10)`}
    >
      {glow ? renderGlowTop() : (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-(--ds-s-6) lg:gap-(--ds-s-10) items-start">
        {/* ---------------------------------------------------------------- Gallery */}
        {/* Thumbnails sit in a column on the LEFT of the photo (below it on phones) */}
        <div className="lg:sticky store-sticky min-w-0 flex flex-col-reverse sm:flex-row gap-(--ds-s-3)">
          {(gallery.length > 1 || (video && gallery.length > 0)) && (
            <div className="relative shrink-0 sm:w-[76px] lg:w-[88px]">
              <div className="flex sm:flex-col gap-(--ds-s-2) ds-scroll-x ds-scroll-hide sm:overflow-x-visible sm:overflow-y-auto pb-(--ds-s-1) sm:pb-0 sm:pr-0.5 sm:absolute sm:inset-0">
                {gallery.map((img, i) => {
                  const active = !showVideo && mainImage === img;
                  return (
                    <button
                      type="button"
                      key={`${img}-${i}`}
                      onClick={() => {
                        setShowVideo(false);
                        setPreferVariationImage(false);
                        setActiveImage(i);
                      }}
                      onMouseEnter={() => {
                        if (!canHover || showVideo) return;
                        setPreferVariationImage(false);
                        setActiveImage(i);
                      }}
                      aria-label={t('Image {n}', { n: i + 1 })}
                      aria-current={active}
                      className={`shrink-0 w-16 h-16 sm:w-full sm:h-auto sm:product-frame rounded-(--ds-r-md) border-2 bg-(--ds-surface) overflow-hidden transition-colors cursor-pointer ${
                        active ? 'border-(--primary)' : 'border-(--ds-border) hover:border-(--ds-border-strong)'
                      }`}
                    >
                      <img
                        src={sized(img, 200)}
                        alt=""
                        loading="lazy"
                        className="w-full h-full product-img"
                        onError={(event) => {
                          const el = event.currentTarget;
                          el.onerror = null;
                          el.src = IMAGE_PLACEHOLDER;
                        }}
                      />
                    </button>
                  );
                })}
                {video && (
                  <button
                    type="button"
                    onClick={() => setShowVideo(true)}
                    aria-label={t('Play product video')}
                    aria-current={showVideo}
                    className={`relative shrink-0 w-16 h-16 sm:w-full sm:h-auto sm:product-frame rounded-(--ds-r-md) border-2 overflow-hidden cursor-pointer bg-[linear-gradient(135deg,#0f172a,#334155)] ${
                      showVideo ? 'border-(--primary)' : 'border-(--ds-border) hover:border-(--ds-border-strong)'
                    }`}
                  >
                    {youtubeThumb(video.src) && (
                      <img
                        src={youtubeThumb(video.src)}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                        className="absolute inset-0 w-full h-full object-cover opacity-80"
                      />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-8 h-8 rounded-full bg-white/90 text-[#0f172a] flex items-center justify-center shadow-md">
                        <Play className="w-4 h-4 ml-0.5 fill-current" />
                      </span>
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0">
          <div
            ref={imageFrameRef}
            className={`relative product-frame rounded-(--ds-r-xl) border border-(--ds-border) bg-(--ds-surface) overflow-hidden select-none ${
              canHover && mainImage ? 'cursor-zoom-in' : ''
            }`}
            onMouseMove={(event) => {
              if (!canHover || !mainImage || showVideo) return;
              const rect = event.currentTarget.getBoundingClientRect();
              setZoom({
                x: ((event.clientX - rect.left) / rect.width) * 100,
                y: ((event.clientY - rect.top) / rect.height) * 100,
              });
            }}
            onMouseLeave={() => setZoom(null)}
            onTouchStart={(event) => {
              touchStartX.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const start = touchStartX.current;
              touchStartX.current = null;
              if (showVideo) return;
              const end = event.changedTouches[0]?.clientX;
              if (start === null || end === undefined) return;
              const delta = end - start;
              if (Math.abs(delta) > 40) stepImage(delta < 0 ? 1 : -1);
            }}
          >
            {showVideo && video ? (
              <div className="absolute inset-0 bg-black flex items-center justify-center">
                {video.kind === 'file' ? (
                  <video src={video.src} controls autoPlay playsInline className="w-full h-full object-contain" />
                ) : (
                  <iframe
                    src={`${video.src}${video.kind === 'youtube' ? '&autoplay=1' : '&autoplay=true'}`}
                    title={`${product.name} video`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className={video.vertical ? 'h-full aspect-[9/16] max-w-full border-0' : 'w-full aspect-video border-0'}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setShowVideo(false)}
                  aria-label={t('Close video')}
                  className="absolute top-(--ds-s-3) right-(--ds-s-3) w-9 h-9 rounded-full bg-white/90 text-[#0f172a] flex items-center justify-center shadow-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : mainImage ? (
              <img
                key={mainImage}
                {...responsiveImg(mainImage, '(min-width: 1024px) 560px, 100vw', 800, 320)}
                alt={product.name}
                loading="eager"
                draggable={false}
                className="w-full h-full product-img object-center transition-transform duration-(--ds-dur) ease-(--ds-ease)"
                style={
                  zoom
                    ? { transform: 'scale(2)', transformOrigin: `${zoom.x}% ${zoom.y}%` }
                    : undefined
                }
                onError={(event) => {
                  const img = event.currentTarget;
                  img.onerror = null;
                  img.removeAttribute('srcset');
                  img.src = IMAGE_PLACEHOLDER;
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-(--ds-text-faint)">
                <ImageOff className="w-10 h-10" />
              </div>
            )}

            {discount > 0 && !showVideo && (
              <span className="absolute top-(--ds-s-3) left-(--ds-s-3) inline-flex items-center h-6 px-(--ds-s-2) rounded-(--ds-r-full) bg-(--ds-danger) text-(--ds-text-invert) text-(length:--ds-fs-xs) font-(--ds-fw-bold) ds-num shadow-(--ds-shadow-sm)">
                -{discount}%
              </span>
            )}

            {video && !showVideo && (
              <button
                type="button"
                onClick={() => setShowVideo(true)}
                className="absolute bottom-(--ds-s-3) right-(--ds-s-3) inline-flex items-center gap-(--ds-s-1) h-8 pl-1 pr-(--ds-s-3) rounded-(--ds-r-full) bg-black/75 text-white text-(length:--ds-fs-xs) font-(--ds-fw-semibold) shadow-(--ds-shadow-md) backdrop-blur-sm cursor-pointer hover:bg-black/85"
              >
                <span className="w-6 h-6 rounded-full bg-white text-[#0f172a] flex items-center justify-center">
                  <Play className="w-3 h-3 ml-0.5 fill-current" />
                </span>
                {t('Watch video')}
              </button>
            )}

            {gallery.length > 1 && !showVideo && (
              <>
                <button
                  type="button"
                  aria-label={t('Previous image')}
                  onClick={() => stepImage(-1)}
                  className="hidden sm:flex absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 w-(--ds-h-md) h-(--ds-h-md) rounded-(--ds-r-full) bg-(--ds-surface) border border-(--ds-border) items-center justify-center shadow-(--ds-shadow-sm) text-(--ds-text-soft) hover:text-(--ds-text) cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label={t('Next image')}
                  onClick={() => stepImage(1)}
                  className="hidden sm:flex absolute right-(--ds-s-3) top-1/2 -translate-y-1/2 w-(--ds-h-md) h-(--ds-h-md) rounded-(--ds-r-full) bg-(--ds-surface) border border-(--ds-border) items-center justify-center shadow-(--ds-shadow-sm) text-(--ds-text-soft) hover:text-(--ds-text) cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                {/* Dots double as the swipe position indicator on phones */}
                <div className="sm:hidden absolute bottom-(--ds-s-3) inset-x-0 flex justify-center gap-(--ds-s-1)">
                  {gallery.map((img, i) => (
                    <span
                      key={`${img}-dot-${i}`}
                      className={`h-1.5 rounded-(--ds-r-full) transition-all duration-(--ds-dur) ${
                        i === activeImage && !(preferVariationImage && variationImage)
                          ? 'w-4 bg-(--primary)'
                          : 'w-1.5 bg-(--ds-border-strong)'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          </div>
        </div>

        {/* ---------------------------------------------------------------- Buy box */}
        <div className="min-w-0 space-y-(--ds-s-5)">
          <div className="space-y-(--ds-s-3)">
            {(product.categoryName || product.brandName || product.requiresPrescription || product.isWholesale) && (
              <div className="flex items-center justify-between gap-(--ds-s-3)">
                <div className="flex flex-wrap items-center gap-(--ds-s-2) min-w-0">
                  {product.categoryName && (
                    <StoreLink
                      to={{ view: 'shop', params: { category: product.categorySlug || product.categoryId } }}
                      onNavigate={onNavigate}
                      className="ds-badge ds-badge-primary hover:opacity-80 transition-opacity"
                    >
                      {product.categoryName}
                    </StoreLink>
                  )}
                  {product.requiresPrescription && (
                    <span className="ds-badge ds-badge-danger">
                      <FileText className="w-3 h-3" />
                      Rx
                    </span>
                  )}
                  {product.isWholesale && <WholesalePill />}
                </div>

                {/* Brand on the right: its logo in a fixed frame, linking to all its products */}
                {product.brandName && (
                  <StoreLink
                    to={{ view: 'shop', params: { brand: product.brandSlug || String(product.brandId || '') } }}
                    onNavigate={onNavigate}
                    title={t('More from {name}', { name: product.brandName || '' })}
                    aria-label={t('More from {name}', { name: product.brandName || '' })}
                    className="group shrink-0 inline-flex items-center justify-center h-12 w-28 sm:w-32 px-(--ds-s-2) rounded-(--ds-r-md) border border-(--ds-border) bg-(--ds-surface) hover:border-(--primary) hover:shadow-(--ds-shadow-sm) transition-[border-color,box-shadow]"
                  >
                    {product.brandLogo && !brandLogoFailed ? (
                      <img
                        src={product.brandLogo}
                        alt={product.brandName}
                        loading="lazy"
                        onError={() => setBrandLogoFailed(true)}
                        className="max-h-8 max-w-full w-auto object-contain"
                      />
                    ) : (
                      <span className="truncate text-(length:--ds-fs-sm) font-(--ds-fw-bold) text-(--ds-text-soft) group-hover:text-(--primary)">
                        {product.brandName}
                      </span>
                    )}
                  </StoreLink>
                )}
              </div>
            )}

            <h1 className="text-(length:--ds-fs-2xl) sm:text-(length:--ds-fs-3xl) font-(--ds-fw-bold) leading-(--ds-lh-snug) text-(--ds-text) break-words">
              {product.name}
            </h1>

            {product.genericName && (
              <StoreLink
                to={{ view: 'shop', params: { generic: product.genericName } }}
                onNavigate={onNavigate}
                title={t('All products with {name}', { name: product.genericName || '' })}
                className="inline-block text-(length:--ds-fs-md) text-(--ds-text-soft) underline decoration-dotted decoration-(--ds-border-strong) underline-offset-4 hover:text-(--primary) hover:decoration-(--primary) transition-colors"
              >
                {product.genericName}
              </StoreLink>
            )}

            <div className="flex flex-wrap items-center gap-x-(--ds-s-4) gap-y-(--ds-s-1) text-(length:--ds-fs-sm) text-(--ds-text-muted)">
              {showRating && (
                <button
                  type="button"
                  onClick={() => setActiveTab('reviews')}
                  className="inline-flex items-center gap-(--ds-s-1) cursor-pointer hover:text-(--ds-text)"
                >
                  <Star className="w-4 h-4 fill-(--ds-amber) text-(--ds-amber)" />
                  <span className="ds-num font-(--ds-fw-semibold) text-(--ds-text)">{rating.toFixed(1)}</span>
                  <span className="ds-num">({reviewCount})</span>
                </button>
              )}
              {sku && (
                <span>
                  {t('SKU')}: <span className="ds-num text-(--ds-text-soft)">{sku}</span>
                </span>
              )}
            </div>
          </div>

          {/* v3.15 — the product's tags; each one searches the shop */}
          {ownTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label={t('Tags')}>
              {ownTags.map((tag) => (
                <a
                  key={tag}
                  href={`/shop?search=${encodeURIComponent(tag)}`}
                  onClick={(event) => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
                    event.preventDefault();
                    onNavigate('shop', { search: tag });
                  }}
                  className="inline-flex items-center h-7 px-2.5 rounded-(--ds-r-full) bg-(--ds-surface-2) border border-(--ds-border-soft) text-(length:--ds-fs-xs) text-(--ds-text-soft) hover:text-(--primary) hover:border-(--primary) transition-colors"
                >
                  #{tag}
                </a>
              ))}
            </div>
          )}

          {/* Price */}
          <div className="rounded-(--ds-r-lg) bg-(--ds-surface-2) border border-(--ds-border-soft) p-(--ds-s-4) space-y-(--ds-s-2)">
            <div className="flex flex-wrap items-baseline gap-x-(--ds-s-3) gap-y-(--ds-s-1)">
              <span className="ds-num text-(length:--ds-fs-3xl) sm:text-(length:--ds-fs-4xl) font-(--ds-fw-black) leading-(--ds-lh-tight) text-(--ds-text)">
                {priceText}
                {unitLabel && (
                  <span className="ml-1 text-(length:--ds-fs-md) font-(--ds-fw-semibold) text-(--ds-text-muted)">/ {unitLabel}</span>
                )}
              </span>
              {oldPrice && !priceRange && (
                <span className="ds-num text-(length:--ds-fs-lg) text-(--ds-text-muted) line-through">
                  {currency}
                  {fmt(oldPrice)}
                </span>
              )}
              {discount > 0 && !priceRange && (
                <span className="ds-badge ds-badge-danger ds-num">-{discount}%</span>
              )}
            </div>

            <div className="text-(length:--ds-fs-sm) font-(--ds-fw-semibold)">
              {hasVariations && !selectedVariation ? (
                anyVariationInStock ? (
                  <span className="text-(--ds-text-muted)">{t('Choose options to see price and stock')}</span>
                ) : (
                  <span className="text-(--ds-danger-text)">{t('Out of stock')}</span>
                )
              ) : !inStock ? (
                <span className="text-(--ds-danger-text)">{t('Out of stock')}</span>
              ) : availableStock <= lowStockThreshold ? (
                <span className="text-(--ds-warning-text)">{t('Only {n} left', { n: availableStock })}</span>
              ) : (
                <span className="text-(--ds-success-text)">
                  {t('In stock')} (<span className="ds-num">{availableStock}</span>)
                </span>
              )}
            </div>
            {product.freeShipping && (
              <span className="inline-flex items-center gap-(--ds-s-1) h-6 px-(--ds-s-2) rounded-(--ds-r-full) bg-(--ds-success-soft) text-(--ds-success-text) text-(length:--ds-fs-xs) font-(--ds-fw-bold)">
                <Truck className="w-3.5 h-3.5" /> {t('Free delivery')}
              </span>
            )}
          </div>

          {product.shortDescription && (
            <p className="text-(length:--ds-fs-md) leading-(--ds-lh-normal) text-(--ds-text-soft)">
              {product.shortDescription}
            </p>
          )}

          {product.requiresPrescription && (
            <div className="flex items-start gap-(--ds-s-2) p-(--ds-s-3) rounded-(--ds-r-md) bg-(--ds-warning-soft) text-(length:--ds-fs-sm) text-(--ds-warning-text)">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t('This medicine is sold only against a valid prescription. We will verify your prescription after you order.')}</span>
            </div>
          )}

          {/* Option picker */}
          {renderOptionPicker(false)}
          {sizeGuide && pageCfg.showSizeGuide !== false && (
            <button
              type="button"
              onClick={() => setSizeGuideOpen(true)}
              className="inline-flex items-center gap-(--ds-s-2) h-(--ds-h-sm) px-(--ds-s-3) rounded-(--ds-r-full) border border-(--ds-border-strong) bg-(--ds-surface) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text) hover:border-(--primary) hover:text-(--primary) transition-colors cursor-pointer"
            >
              <Ruler className="w-4 h-4" /> {t('Size guide')}
            </button>
          )}

          {/* Quantity */}
          <div className="flex flex-wrap items-end justify-between gap-(--ds-s-4)">
            <div>
              <span className="ds-label">{t('Quantity')}{unitLabel ? ` (${unitLabel})` : ''}</span>
              {renderStepper(false)}
              {renderQtyNotice()}
            </div>

            {canPurchase && (
              <div className="text-right">
                <span className="block text-(length:--ds-fs-xs) text-(--ds-text-muted)">{t('Total')}</span>
                <span className="ds-num text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--primary)">
                  {currency}
                  {fmt(price * quantity)}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-(--ds-s-3)">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={!canPurchase}
              className={`ds-btn ds-btn-soft cta-atc cta-page ds-btn-lg ds-btn-block min-w-0 px-(--ds-s-3) text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) ${addCta.className}`}
              style={addCta.style}
            >
              <ShoppingCart className="w-5 h-5 shrink-0" />
              <span className="truncate">{addToCartLabel}</span>
            </button>
            <button
              type="button"
              onClick={handleBuyNow}
              disabled={!canPurchase}
              className={`ds-btn ds-btn-primary cta-buy cta-page ds-btn-lg ds-btn-block min-w-0 px-(--ds-s-3) text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) ${buyCta.className}`}
              style={buyCta.style}
            >
              <Zap className="w-5 h-5 shrink-0" />
              <span className="truncate">{buyNowLabel}</span>
            </button>
          </div>

          {(showCallButton || showWhatsappButton) && (
            <div className={`grid gap-(--ds-s-3) ${showCallButton && showWhatsappButton ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {showCallButton && (
                <a
                  href={`tel:${contactCfg?.callNumber || ''}`}
                  onClick={() => tracking.contact('phone')}
                  className="ds-btn ds-btn-block text-(--ds-text-invert) hover:opacity-90"
                  style={{ backgroundColor: contactCfg?.callBgColor || 'var(--primary)' }}
                >
                  <Phone className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t(contactCfg?.callLabel || 'Call us')}</span>
                </a>
              )}
              {showWhatsappButton && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => tracking.contact('whatsapp')}
                  className="ds-btn ds-btn-block text-(--ds-text-invert) hover:opacity-90"
                  style={{ backgroundColor: contactCfg?.whatsappBgColor || 'var(--ds-success)' }}
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span className="truncate">{contactCfg?.whatsappLabel || 'WhatsApp'}</span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ---------------------------------------------------------------- Tabs
          v3.9: a centred pill bar (the active tab filled, with a small pointer
          under it) over a soft card: heading with an accent line, the text,
          the product's highlights as icons, and a picture of the product. */}
      <section ref={tabsRef} className="space-y-(--ds-s-5) scroll-mt-[calc(var(--store-header-h,72px)+16px)]">
        <div className={glow ? 'flex justify-start sm:justify-center border-b border-(--ds-border) ds-scroll-x ds-scroll-hide' : 'flex justify-center'}>
          <div
            role="tablist"
            className={
              glow
                ? 'inline-flex items-center gap-(--ds-s-6) sm:gap-(--ds-s-10)'
                : 'max-w-full inline-flex items-center gap-1 p-1.5 rounded-full bg-(--ds-surface) border border-(--ds-border) shadow-(--ds-shadow-sm) ds-scroll-x ds-scroll-hide'
            }
          >
            {tabs.map((tab) => {
              const on = currentTab === tab.key;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActiveTab(tab.key)}
                  className={
                    glow
                      ? `relative shrink-0 inline-flex items-center h-12 sm:h-14 text-(length:--ds-fs-md) sm:text-(length:--ds-fs-xl) font-(--ds-fw-medium) whitespace-nowrap transition-colors cursor-pointer border-b-2 -mb-px ${
                          on ? 'border-(--primary) text-(--ds-text)' : 'border-transparent text-(--ds-text-muted) hover:text-(--ds-text)'
                        }`
                      : `relative shrink-0 inline-flex items-center gap-(--ds-s-2) h-11 px-(--ds-s-5) rounded-full text-(length:--ds-fs-base) font-(--ds-fw-semibold) whitespace-nowrap transition-all duration-(--ds-dur) cursor-pointer ${
                          on
                            ? 'bg-(--primary) text-(--primary-foreground) shadow-(--ds-shadow-md)'
                            : 'text-(--ds-text-soft) hover:text-(--ds-text) hover:bg-(--ds-surface-2)'
                        }`
                  }
                >
                  {!glow && <Icon className="w-4 h-4" />}
                  {tab.label}
                  {on && !glow && (
                    <span
                      aria-hidden
                      className="absolute left-1/2 -bottom-[7px] -translate-x-1/2 w-0 h-0 border-x-[7px] border-x-transparent border-t-[7px] border-t-(--primary)"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className={
            glow
              ? 'rounded-[22px] bg-(--glow-soft) p-(--ds-s-5) sm:p-(--ds-s-8) text-(length:--ds-fs-md) leading-(--ds-lh-bn) text-(--ds-text-soft)'
              : 'rounded-[22px] border border-(--ds-border-soft) p-(--ds-s-5) sm:p-(--ds-s-8) text-(length:--ds-fs-md) leading-(--ds-lh-bn) text-(--ds-text-soft) shadow-(--ds-shadow-sm)'
          }
          style={glow ? undefined : { background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 4%, var(--ds-surface)), var(--ds-surface) 60%)' }}
        >
          {currentTab === 'description' && (
            <div
              className={`grid gap-(--ds-s-6) items-center ${
                descriptionImage && highlights.length
                  ? 'lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,240px)]'
                  : descriptionImage
                  ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,260px)]'
                  : highlights.length
                  ? 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'
                  : ''
              }`}
            >
              <div className="min-w-0">
                <h2 className="flex items-center gap-(--ds-s-3) text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">
                  {pageCfg.descriptionTitle || t('Product details')}
                  <span aria-hidden className="h-0.5 w-10 rounded-full bg-(--primary) opacity-70" />
                </h2>
                <span aria-hidden className="block mt-2 mb-(--ds-s-4) h-1 w-10 rounded-full bg-(--primary)" />
                {product.description || product.shortDescription ? (
                  <RichText text={String(product.description || product.shortDescription)} />
                ) : (
                  <p className="text-(--ds-text-muted)">{t('No description has been added for this product yet.')}</p>
                )}
              </div>

              {highlights.length > 0 && (
                <ul className={`grid gap-(--ds-s-4) ${highlights.length > 2 ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4' : 'grid-cols-2'}`}>
                  {highlights.map((item, index) => {
                    const Icon = HIGHLIGHT_ICONS[item.icon]?.icon || Sparkles;
                    return (
                      <li key={index} className="flex flex-col items-center text-center gap-(--ds-s-2)">
                        <span
                          className="w-16 h-16 rounded-full inline-flex items-center justify-center text-(--primary) shadow-(--ds-shadow-xs) transition-transform duration-(--ds-dur) hover:-translate-y-0.5"
                          style={{ background: 'color-mix(in srgb, var(--primary) 12%, var(--ds-surface))' }}
                        >
                          <Icon className="w-7 h-7" strokeWidth={1.6} />
                        </span>
                        <span className="text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text) leading-snug">{item.text}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {descriptionImage && (
                <div className="hidden lg:block">
                  <img
                    {...responsiveImg(descriptionImage, '560px', 640, 320)}
                    alt={product.name}
                    loading="lazy"
                    className="w-full aspect-[4/3] object-cover rounded-[18px] shadow-(--ds-shadow-md)"
                  />
                </div>
              )}
            </div>
          )}

          {currentTab === 'howto' && (
            <div className="max-w-3xl">
              <h2 className="text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text)">{t(pageCfg.howToUseTabLabel || 'How To Use')}</h2>
              <span aria-hidden className="block mt-2 mb-(--ds-s-4) h-1 w-10 rounded-full bg-(--primary)" />
              <RichText text={howToUse} />
            </div>
          )}

          {currentTab === 'specification' && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-(--ds-s-8)">
              {specRows
                .filter(([, value]) => Boolean(value))
                .map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex justify-between gap-(--ds-s-4) py-(--ds-s-2) border-b border-dashed border-(--ds-border)"
                  >
                    <dt className="font-(--ds-fw-medium) text-(--ds-text)">{label}</dt>
                    <dd className="text-right min-w-0 break-words">{value}</dd>
                  </div>
                ))}
            </dl>
          )}

          {currentTab === 'reviews' && (
            <ReviewsPanel
              productId={product.id}
              reviews={reviews}
              rating={rating}
              reviewCount={reviewCount}
              breakdown={ratingBreakdown}
              allowReviews={allowReviews}
            />
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- Related */}
      {related.length > 0 && pageCfg.showRelated !== false && (
        <section className="space-y-(--ds-s-4)">
          <div className="flex items-center justify-between gap-(--ds-s-3)">
            {glow ? (
              <AccentTitle title="Related *Products*" className="glow-title" />
            ) : (
              <h2 className="text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text)">{t('Related products')}</h2>
            )}
            <RailArrows edges={relatedRail.edges} step={relatedRail.step} label={t('related products')} />
          </div>
          <div ref={relatedRail.ref} className={RAIL_TRACK}>
            {related.map((p) => (
              <div key={p.id} className={RAIL_ITEM}>
                <ProductCard
                  product={p}
                  config={settings?.product_card_config}
                  design={glow ? 'glow' : undefined}
                  onSelect={onSelectProduct}
                  onQuickBuy={() => onNavigate('checkout')}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- Mobile buy bar
          The global bottom nav is hidden on this page, so this bar owns the
          bottom edge on phones. */}
      {stickyBar && (
      <div data-bottom-bar className="lg:hidden fixed inset-x-0 bottom-0 z-(--ds-z-header) bg-(--ds-surface) border-t border-(--ds-border) shadow-(--ds-shadow-lg) px-(--ds-gutter) pt-(--ds-s-2) pb-[calc(var(--ds-s-2)+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-(--ds-s-2)">
          <div className="min-w-0 shrink">
            <span className="block text-(length:--ds-fs-2xs) text-(--ds-text-muted)">
              {canPurchase ? t('Total') : hasVariations && !selectedVariation ? t('Price') : ''}
            </span>
            <span className="ds-num block truncate text-(length:--ds-fs-lg) font-(--ds-fw-black) text-(--ds-text)">
              {canPurchase ? `${currency}${fmt(price * quantity)}` : priceText}
            </span>
          </div>
          {hasVariations && !selectedVariation && anyVariationInStock ? (
            <button
              type="button"
              onClick={revealPicker}
              className="ds-btn ds-btn-primary flex-1 h-(--ds-h-lg) min-w-0 px-(--ds-s-3) text-(length:--ds-fs-base)"
            >
              <SlidersHorizontal className="w-4 h-4 shrink-0" />
              <span className="truncate">{t('Choose options')}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!canPurchase}
                aria-label={addToCartLabel}
                className={`ds-btn ds-btn-soft cta-atc cta-page h-(--ds-h-lg) min-w-0 flex-1 px-(--ds-s-2) text-(length:--ds-fs-sm) ${glow ? 'rounded-full' : ''} ${addCta.className}`}
                style={addCta.style}
              >
                <ShoppingCart className="w-4 h-4 shrink-0" />
                <span className="truncate">{addToCartLabel}</span>
              </button>
              <button
                type="button"
                onClick={handleBuyNow}
                disabled={!canPurchase}
                aria-label={buyNowLabel}
                className={`ds-btn ds-btn-primary cta-buy cta-page h-(--ds-h-lg) min-w-0 flex-1 px-(--ds-s-2) text-(length:--ds-fs-sm) ${glow ? 'glow-buy-bar rounded-full' : ''} ${buyCta.className}`}
                style={buyCta.style}
              >
                <Zap className="w-4 h-4 shrink-0" />
                <span className="truncate">{buyNowLabel}</span>
              </button>
            </>
          )}
        </div>
      </div>
      )}

      {sizeGuide && sizeGuideOpen && <SizeGuideModal guide={sizeGuide} productName={product.name} onClose={() => setSizeGuideOpen(false)} />}
    </div>
  );
};

/* ------------------------------------------------------------------ Reviews */

const ReviewsPanel: React.FC<{
  productId: number;
  reviews: ProductReview[];
  rating: number;
  reviewCount: number;
  breakdown: Record<string, number>;
  allowReviews: boolean;
}> = ({ productId, reviews, rating, reviewCount, breakdown, allowReviews }) => {
  const t = useT();
  const [formOpen, setFormOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'' | 'approved' | 'pending'>('');
  const [visible, setVisible] = useState(10);

  const total = Object.values(breakdown).reduce((sum: number, n) => sum + (Number(n) || 0), 0) || reviewCount;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!stars) return setError(t('Please choose a star rating.'));
    if (!name.trim()) return setError(t('Please enter your name.'));
    if (comment.trim().length < 3) return setError(t('Please write a few words about the product.'));
    setSending(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, userName: name.trim(), userPhone: phone.trim(), rating: stars, comment: comment.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('Could not send your review. Please try again.'));
      setDone(data.pending ? 'pending' : 'approved');
      setStars(0);
      setComment('');
      setFormOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-(--ds-s-6)">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-(--ds-s-5) items-center">
        <div className="text-center sm:text-left">
          <div className="ds-num text-(length:--ds-fs-4xl) font-(--ds-fw-black) text-(--ds-text) leading-none">
            {reviewCount > 0 ? rating.toFixed(1) : '–'}
          </div>
          <div className="mt-(--ds-s-2)">
            <Stars value={reviewCount > 0 ? rating : 0} />
          </div>
          <p className="mt-(--ds-s-1) text-(length:--ds-fs-sm) text-(--ds-text-muted)">
            {reviewCount > 0 ? t('{n} Reviews', { n: reviewCount }) : t('No reviews yet')}
          </p>
        </div>
        <div className="space-y-(--ds-s-1)">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = Number(breakdown[String(n)]) || 0;
            const pct = total ? Math.round((count / total) * 100) : 0;
            return (
              <div key={n} className="flex items-center gap-(--ds-s-2) text-(length:--ds-fs-sm)">
                <span className="ds-num w-3 text-right text-(--ds-text-soft)">{n}</span>
                <Star className="w-3.5 h-3.5 fill-(--ds-amber) text-(--ds-amber)" />
                <span className="flex-1 h-2 rounded-(--ds-r-full) bg-(--ds-surface-3) overflow-hidden">
                  <span className="block h-full rounded-(--ds-r-full) bg-(--ds-amber)" style={{ width: `${pct}%` }} />
                </span>
                <span className="ds-num w-8 text-right text-(--ds-text-muted)">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {done && (
        <div role="status" className="flex items-start gap-(--ds-s-2) p-(--ds-s-3) rounded-(--ds-r-md) bg-(--ds-success-soft) text-(--ds-success-text) text-(length:--ds-fs-sm) font-(--ds-fw-medium)">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          {done === 'pending'
            ? t('Thank you! Your review will appear after the shop checks it.')
            : t('Thank you! Your review has been added — refresh the page to see it.')}
        </div>
      )}

      {allowReviews && !formOpen && (
        <button type="button" onClick={() => setFormOpen(true)} className="ds-btn ds-btn-primary">
          <Star className="w-4 h-4" /> {t('Write a review')}
        </button>
      )}

      {allowReviews && formOpen && (
        <form onSubmit={submit} className="rounded-(--ds-r-lg) border border-(--ds-border) bg-(--ds-surface-2) p-(--ds-s-4) sm:p-(--ds-s-5) space-y-(--ds-s-4)">
          <div className="flex items-center justify-between gap-(--ds-s-3)">
            <h3 className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">{t('Write a review')}</h3>
            <button type="button" onClick={() => setFormOpen(false)} aria-label={t('Close')} className="w-8 h-8 inline-flex items-center justify-center rounded-(--ds-r-full) hover:bg-(--ds-surface-3) cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <span className="ds-label">{t('Your rating')}</span>
            <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  aria-pressed={stars === n}
                  onClick={() => setStars(n)}
                  onMouseEnter={() => setHover(n)}
                  className="p-1 cursor-pointer"
                >
                  <Star className={`w-7 h-7 transition-colors ${n <= (hover || stars) ? 'fill-(--ds-amber) text-(--ds-amber)' : 'text-(--ds-border-strong)'}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-(--ds-s-3)">
            <label className="block">
              <span className="ds-label">{t('Your name')}</span>
              <input className="ds-input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <label className="block">
              <span className="ds-label">{t('Phone (optional, not shown)')}</span>
              <input className="ds-input" value={phone} maxLength={20} inputMode="tel" onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </label>
          </div>
          <label className="block">
            <span className="ds-label">{t('Your review')}</span>
            <textarea className="ds-textarea min-h-28" value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} placeholder={t('What did you like? How was the quality?')} />
          </label>
          {error && <p role="alert" className="text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-danger-text)">{error}</p>}
          <button type="submit" disabled={sending} className="ds-btn ds-btn-primary">
            {sending ? t('Sending…') : t('Submit review')}
          </button>
        </form>
      )}

      {reviews.length === 0 ? (
        <p className="text-(--ds-text-muted)">{allowReviews ? t('Be the first to review this product.') : t('This product has no reviews yet.')}</p>
      ) : (
        <ul className="space-y-(--ds-s-3)">
          {reviews.slice(0, visible).map((review) => {
            const who = review.customerName || review.userName || t('Customer');
            return (
              <li key={review.id} className="rounded-(--ds-r-lg) border border-(--ds-border-soft) bg-(--ds-surface) p-(--ds-s-4)">
                <div className="flex items-start gap-(--ds-s-3)">
                  <span className="shrink-0 w-10 h-10 rounded-(--ds-r-full) bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-(--primary) flex items-center justify-center font-(--ds-fw-bold)">
                    {who.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-(--ds-s-2) gap-y-0.5">
                      <span className="text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text)">{who}</span>
                      {review.createdAt && (
                        <span className="ds-num text-(length:--ds-fs-xs) text-(--ds-text-muted)">
                          {new Date(review.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <Stars value={review.rating} size="w-3.5 h-3.5" />
                    {review.comment && <p className="mt-(--ds-s-2) text-(length:--ds-fs-base) whitespace-pre-line break-words">{review.comment}</p>}
                    {review.reply && (
                      <div className="mt-(--ds-s-3) rounded-(--ds-r-md) bg-(--ds-surface-2) border-l-4 border-(--primary) p-(--ds-s-3)">
                        <span className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-xs) font-(--ds-fw-bold) text-(--primary)">
                          <MessageSquareReply className="w-3.5 h-3.5" /> {t('Reply from the shop')}
                        </span>
                        <p className="mt-(--ds-s-1) text-(length:--ds-fs-sm) whitespace-pre-line break-words">{review.reply}</p>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {reviews.length > visible && (
        <button type="button" onClick={() => setVisible((n) => n + 10)} className="ds-btn ds-btn-soft">
          {t('Show more reviews')}
        </button>
      )}
    </div>
  );
};

/* --------------------------------------------------------------- Size guide */

const SizeGuideModal: React.FC<{ guide: SizeGuide; productName: string; onClose: () => void }> = ({ guide, productName, onClose }) => {
  const t = useT();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-(--ds-s-4)" role="dialog" aria-modal="true" aria-labelledby="size-guide-title">
      <div className="absolute inset-0 bg-black/45 ds-fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl max-h-[88vh] flex flex-col bg-(--ds-surface) rounded-t-(--ds-r-2xl) sm:rounded-(--ds-r-2xl) shadow-(--ds-shadow-lg) ds-scale-in overflow-hidden">
        <div className="flex items-start justify-between gap-(--ds-s-3) px-(--ds-s-5) pt-(--ds-s-5) pb-(--ds-s-3) border-b border-(--ds-border)">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-xs) font-(--ds-fw-bold) uppercase tracking-wide text-(--primary)">
              <Ruler className="w-3.5 h-3.5" /> {t('Size guide')}
            </p>
            <h2 id="size-guide-title" className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text) truncate">
              {guide.name}
            </h2>
            <p className="text-(length:--ds-fs-sm) text-(--ds-text-muted) truncate">{productName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('Close')} className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-(--ds-r-full) hover:bg-(--ds-surface-3) cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-(--ds-s-5) py-(--ds-s-4) space-y-(--ds-s-4)">
          {guide.description && <p className="text-(length:--ds-fs-sm) text-(--ds-text-soft) whitespace-pre-line">{guide.description}</p>}
          <div className="overflow-x-auto rounded-(--ds-r-lg) border border-(--ds-border)">
            <table className="w-full text-(length:--ds-fs-sm) border-collapse">
              <thead>
                <tr>
                  {guide.columns.map((column, index) => (
                    <th
                      key={index}
                      scope="col"
                      className={`px-(--ds-s-3) py-(--ds-s-2) text-left font-(--ds-fw-bold) whitespace-nowrap bg-[color-mix(in_srgb,var(--primary)_10%,var(--ds-surface))] text-(--ds-text) ${
                        index === 0 ? 'sticky left-0' : ''
                      }`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {guide.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="odd:bg-(--ds-surface) even:bg-(--ds-surface-2)">
                    {guide.columns.map((_, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={`ds-num px-(--ds-s-3) py-(--ds-s-2) whitespace-nowrap border-t border-(--ds-border-soft) ${
                          cellIndex === 0 ? 'sticky left-0 font-(--ds-fw-semibold) text-(--ds-text) bg-inherit' : 'text-(--ds-text-soft)'
                        }`}
                      >
                        {row[cellIndex] || '–'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {guide.image && <img src={guide.image} alt={guide.name} loading="lazy" className="w-full rounded-(--ds-r-lg) border border-(--ds-border)" />}
          {guide.note && (
            <p className="text-(length:--ds-fs-sm) text-(--ds-text-muted) whitespace-pre-line rounded-(--ds-r-md) bg-(--ds-surface-2) p-(--ds-s-3)">{guide.note}</p>
          )}
        </div>
      </div>
    </div>
  );
};
