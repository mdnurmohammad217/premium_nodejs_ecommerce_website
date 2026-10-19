import React, { useRef, useSyncExternalStore } from 'react';
import { responsiveImg } from '../../lib/img.ts';

/** How wide a card's picture is on each screen (2 a row on phones … 5 on computers) */
const CARD_SIZES = '(min-width: 1280px) 240px, (min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 480px) 33vw, 50vw';
import {
  ShoppingCart,
  Heart,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Zap,
  ImageOff,
  Eye,
  Star,
  ShoppingBag,
  Maximize2,
} from 'lucide-react';
import { useT } from '../../lib/i18n.tsx';
import { CountdownBoxes } from './glow/GlowParts.tsx';
import { IMAGE_PLACEHOLDER } from '../../lib/placeholder.ts';
import { Product, ProductCardConfig } from '../../types/index.ts';
import { useCart } from '../../context/CartContext.tsx';
import { routeToPath, isPlainClick } from './Header.tsx';
import { ctaAnimation } from '../../lib/ctaAnimation.ts';
import { flyToCart } from '../../lib/flyToCart.ts';
import { cachedGet } from '../../lib/dataCache.ts';

interface ProductCardProps {
  product: Product;
  config?: ProductCardConfig;
  onViewDetails?: (product: Product) => void;
  onSelect?: (product: Product) => void;
  onQuickBuy?: (product: Product) => void;
  /** v3.12 — one of the first cards on screen: load its picture at once (not lazily) */
  priority?: boolean;
  /** v3.13 — draw this design whatever Dashboard → Product Card says (the Glow theme) */
  design?: ProductCardStyle;
  /** v3.13 — Glow card: a live countdown on the picture (offer end, ms) */
  countdownTo?: number | null;
}

/** The card designs offered in Dashboard → Product Card → Card design */
export type ProductCardStyle = 'classic' | 'modern' | 'minimal' | 'compact' | 'glow' | 'luxe' | 'boutique' | 'editorial' | 'spotlight';
const CARD_STYLES: ProductCardStyle[] = ['classic', 'modern', 'minimal', 'compact', 'glow', 'luxe', 'boutique', 'editorial', 'spotlight'];

type CardConfig = ProductCardConfig & { cardStyle?: ProductCardStyle };

/**
 * Products with variations are picked on their own page: their Add to Cart and
 * Buy Now look exactly like any other product's and open that page.
 */
const needsOptions = (product: Product) => Boolean((product as Product & { hasVariations?: boolean }).hasVariations);

/* ---------------------------------------------------------------------------
 * Button animation settings.
 *
 * Every parent hands the card only `product_card_config`, while the attention
 * animation lives in its own setting (`cta_animation_config`). App already
 * loads /api/settings through the shared data cache, so the cards read that
 * same cached response: one copy shared by every card on the page, no extra
 * request in the normal case. After an admin save the next read skips the
 * cache so the new choice shows without a reload.
 * ------------------------------------------------------------------------- */
type CtaSource = { cta_animation_config?: unknown } | null;

let ctaSource: CtaSource = null;
let ctaStale = true;
let ctaForce = false;
const ctaListeners = new Set<() => void>();

const applyCtaSource = (data: unknown) => {
  const next =
    data && typeof data === 'object' ? (data as { cta_animation_config?: unknown }).cta_animation_config : undefined;
  if (ctaSource && JSON.stringify(ctaSource.cta_animation_config) === JSON.stringify(next)) return;
  ctaSource = { cta_animation_config: next };
  ctaListeners.forEach((listener) => listener());
};

const loadCtaSource = () => {
  const force = ctaForce;
  ctaStale = false;
  ctaForce = false;
  cachedGet('/api/settings', { force, onFresh: applyCtaSource })
    .then(applyCtaSource)
    .catch(() => {
      ctaStale = true;
    });
};

const subscribeCta = (listener: () => void) => {
  ctaListeners.add(listener);
  if (ctaStale) loadCtaSource();
  return () => {
    ctaListeners.delete(listener);
  };
};

if (typeof window !== 'undefined') {
  const markStale = () => {
    ctaStale = true;
    ctaForce = true;
    if (ctaListeners.size > 0) loadCtaSource();
  };
  window.addEventListener('pharma:settings-updated', markStale);
  window.addEventListener('pharma:cache-version-changed', markStale);
}

const getCtaSource = () => ctaSource;
const getServerCtaSource = () => null;

const NO_ANIMATION = { className: '', style: {} as React.CSSProperties };

/** Small pill shown to approved wholesale buyers on wholesale-priced products */
export const WholesalePill: React.FC<{ className?: string }> = ({ className = '' }) => {
  const t = useT();
  return (
    <span
      className={`inline-flex items-center h-5 px-(--ds-s-2) rounded-(--ds-r-full) bg-(--ds-indigo) text-(--ds-text-invert) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) tracking-[0.06em] shadow-(--ds-shadow-sm) ${className}`}
    >
      {t('WHOLESALE')}
    </span>
  );
};

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  config,
  onViewDetails,
  onSelect,
  onQuickBuy,
  priority = false,
  design: forcedDesign,
  countdownTo = null,
}) => {
  const t = useT();
  const { addToCart, isInWishlist, toggleWishlist, setIsCartDrawerOpen } = useCart();
  const inWishlist = isInWishlist(product.id);

  const mediaRef = useRef<HTMLAnchorElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Until the setting has been read, buttons stay still rather than starting
  // the default animation and then switching to the owner's choice.
  const cta = useSyncExternalStore(subscribeCta, getCtaSource, getServerCtaSource);
  const buyCta = cta ? ctaAnimation(cta, 'buyNow') : NO_ANIMATION;
  const addCta = cta ? ctaAnimation(cta, 'addToCart') : NO_ANIMATION;

  const cfg = config as CardConfig | undefined;
  const design: ProductCardStyle = forcedDesign && CARD_STYLES.includes(forcedDesign)
    ? forcedDesign
    : CARD_STYLES.includes(cfg?.cardStyle as ProductCardStyle)
    ? (cfg?.cardStyle as ProductCardStyle)
    : 'classic';

  const showAddToCart = cfg?.showAddToCart ?? true;
  const showBuyNow = cfg?.showBuyNow ?? true;
  const showWishlist = cfg?.showWishlist ?? true;
  const showPrice = cfg?.showPrice ?? true;
  const showOldPrice = cfg?.showOldPrice ?? true;
  const showDiscount = cfg?.showDiscount ?? true;
  const showCategory = cfg?.showCategory ?? false;
  const showGenericName = cfg?.showGenericName ?? false;
  const showBrand = (cfg as any)?.showBrand ?? false;
  const showDescription = cfg?.showDescription ?? false;
  const showStockText = cfg?.showStockText ?? false;
  // Button captions are editable from Dashboard → Product Card
  const addToCartLabel = t(cfg?.addToCartLabel || 'Add to Cart');
  const buyNowLabel = t(cfg?.buyNowLabel || 'Buy Now');

  const hasOptions = needsOptions(product);
  const href = routeToPath('product', { slug: product.slug || product.id });

  const openDetails = () => {
    if (onSelect) onSelect(product);
    else if (onViewDetails) onViewDetails(product);
  };

  // A real link, taken over only for a plain left click so ctrl/middle-click
  // and "open in new tab" still reach the product URL.
  const handleLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event) || (!onSelect && !onViewDetails)) return;
    event.preventDefault();
    openDetails();
  };

  const price = Number(product.price);
  const salePrice = product.salePrice ? Number(product.salePrice) : null;
  const currentPrice = salePrice || price;
  const hasDiscount = Boolean(salePrice && salePrice < price);
  const discountPercent = hasDiscount && salePrice ? Math.round(((price - salePrice) / price) * 100) : 0;
  const isOutOfStock = !hasOptions && product.stock <= 0;

  const handleBuyNow = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (hasOptions) return openDetails();
    if (isOutOfStock) return;
    // `false` = don't open the cart drawer; Buy Now goes straight to checkout
    addToCart(product, 1, false);
    onQuickBuy?.(product);
  };

  const handleAddToCart = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (hasOptions) return openDetails();
    if (isOutOfStock) return;
    // The item is in the cart at once; the drawer waits for the image to land
    flyToCart(imageRef.current || mediaRef.current, { onLand: () => setIsCartDrawerOpen(true) });
    addToCart(product, 1, false);
  };

  const formatMoney = (value: number) =>
    value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const showButtons = showAddToCart || showBuyNow;
  const wishlistLabel = inWishlist ? t('Remove from wishlist') : t('Add to wishlist');

  /* ---- Shared pieces ------------------------------------------------------ */

  const mediaImage = product.image ? (
    <img
      ref={imageRef}
      {...responsiveImg(product.image, CARD_SIZES, 320)}
      alt={product.name}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className="absolute inset-0 w-full h-full product-img object-center transition-transform duration-(--ds-dur-slow) ease-(--ds-ease) group-hover:scale-[1.04]"
      // A dead image URL must not leave alt text sprawling across the card
      onError={(event) => {
        const img = event.currentTarget;
        img.onerror = null;
        img.removeAttribute('srcset');
        img.src = IMAGE_PLACEHOLDER;
      }}
    />
  ) : (
    <span className="absolute inset-0 flex items-center justify-center text-(--ds-text-faint)">
      <ImageOff className="w-6 h-6" />
    </span>
  );

  const media = (frameClass: string) => (
    <a
      ref={mediaRef}
      href={href}
      onClick={handleLinkClick}
      className={`relative block product-frame w-full bg-(--ds-surface-2) overflow-hidden ${frameClass}`}
      aria-label={product.name}
    >
      {mediaImage}
    </a>
  );

  const badges = (withDiscount: boolean) =>
    (withDiscount && showDiscount && hasDiscount) || product.requiresPrescription || product.isWholesale ? (
      <div className="absolute top-(--ds-s-2) left-(--ds-s-2) flex flex-wrap items-center gap-(--ds-s-1) pointer-events-none">
        {product.isWholesale && <WholesalePill />}
        {withDiscount && showDiscount && hasDiscount && (
          <span className="inline-flex items-center h-5 px-(--ds-s-2) rounded-(--ds-r-full) bg-(--ds-danger) text-(--ds-text-invert) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) ds-num shadow-(--ds-shadow-sm)">
            -{discountPercent}%
          </span>
        )}
        {product.requiresPrescription && (
          <span className="inline-flex items-center gap-0.5 h-5 px-(--ds-s-2) rounded-(--ds-r-full) bg-(--ds-surface) text-(--ds-danger-text) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) shadow-(--ds-shadow-sm)">
            <FileText className="w-3 h-3" />
            Rx
          </span>
        )}
      </div>
    ) : null;

  const wishlistButton = (extraClass = '') => (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        toggleWishlist(product);
      }}
      aria-label={wishlistLabel}
      aria-pressed={inWishlist}
      title={wishlistLabel}
      className={`w-(--ds-h-sm) h-(--ds-h-sm) flex items-center justify-center rounded-(--ds-r-full) bg-(--ds-surface) shadow-(--ds-shadow-sm) border transition-[color,opacity,transform] duration-(--ds-dur-fast) cursor-pointer active:scale-90 ${
        inWishlist
          ? 'border-(--ds-rose) text-(--ds-rose)'
          : 'border-(--ds-border) text-(--ds-text-muted) hover:text-(--ds-rose)'
      } ${extraClass}`}
    >
      <Heart className={`w-4 h-4 ${inWishlist ? 'fill-current' : ''}`} />
    </button>
  );

  const nameLink = (sizeClass: string) => (
    <a
      href={href}
      onClick={handleLinkClick}
      title={product.name}
      className={`ds-clamp-2 leading-(--ds-lh-snug) text-(--ds-text) hover:text-(--primary) transition-colors ${sizeClass}`}
    >
      {product.name}
    </a>
  );

  // Optional lines render only when they have something to say, so no empty
  // row ever sits between the name and the price.
  const categoryLine =
    showCategory && product.categoryName ? (
      <span className="self-start max-w-full truncate text-(length:--ds-fs-2xs) font-(--ds-fw-semibold) text-(--ds-text-muted)">
        {product.categoryName}
      </span>
    ) : null;

  // v3.10 — the brand's name on the card (Dashboard → Product Card → Brand name)
  const brandLine =
    showBrand && product.brandName ? (
      <span className="self-start max-w-full truncate text-(length:--ds-fs-2xs) font-(--ds-fw-bold) uppercase tracking-[0.04em] text-(--primary)">
        {product.brandName}
      </span>
    ) : null;

  const genericText = product.genericName || product.brandName;
  const genericLine =
    showGenericName && genericText ? (
      <p className="ds-clamp-1 text-(length:--ds-fs-xs) text-(--ds-text-muted)">{genericText}</p>
    ) : null;

  const descriptionText = product.shortDescription || product.description;
  const descriptionLine =
    showDescription && descriptionText ? (
      <p className="ds-clamp-2 text-(length:--ds-fs-xs) text-(--ds-text-soft)">{descriptionText}</p>
    ) : null;

  const stockLine = isOutOfStock ? (
    <span className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-xs) font-(--ds-fw-semibold) text-(--ds-danger-text)">
      <AlertTriangle className="w-3.5 h-3.5" />
      {t('Out of stock')}
    </span>
  ) : showStockText && !hasOptions ? (
    <span className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-xs) font-(--ds-fw-medium) text-(--ds-success-text)">
      <CheckCircle2 className="w-3.5 h-3.5" />
      {t('In stock')} (<span className="ds-num">{product.stock}</span>)
    </span>
  ) : null;

  const currentPriceTag = (sizeClass: string) => (
    <span
      className={`ds-num inline-flex items-baseline font-(--ds-fw-black) text-(--ds-text) leading-(--ds-lh-tight) ${sizeClass}`}
    >
      <span className="mr-0.5 text-(--primary)">৳</span>
      {formatMoney(currentPrice)}
    </span>
  );

  const oldPriceTag = (sizeClass: string) =>
    showOldPrice && hasDiscount ? (
      <span className={`ds-num text-(--ds-text-soft) line-through ${sizeClass}`}>৳{formatMoney(price)}</span>
    ) : null;

  const addButton = (className: string, labelClass = '') => (
    <button
      type="button"
      disabled={isOutOfStock}
      onClick={handleAddToCart}
      title={addToCartLabel}
      aria-label={addToCartLabel}
      className={`ds-btn ds-btn-soft cta-atc cta-card min-w-0 ${className} ${addCta.className}`}
      style={addCta.style}
    >
      <ShoppingCart className="w-4 h-4 shrink-0" />
      <span className={`truncate ${labelClass}`}>{addToCartLabel}</span>
    </button>
  );

  const buyButton = (className: string) => (
    <button
      type="button"
      disabled={isOutOfStock}
      onClick={handleBuyNow}
      title={buyNowLabel}
      className={`ds-btn ds-btn-primary cta-buy cta-card min-w-0 ${className} ${buyCta.className}`}
      style={buyCta.style}
    >
      <Zap className="w-4 h-4 shrink-0" />
      <span className="truncate">{buyNowLabel}</span>
    </button>
  );

  /* ---- Designs ------------------------------------------------------------ */

  /*
   * v3.13 — Glow: rounded picture with an "x% off" pill, quick actions on the
   * picture (wishlist, open, add to bag), an optional live countdown, then the
   * category with the star rating, the name and the price in the accent colour.
   * On phones the actions stay visible and Buy Now sits under the price, so
   * ordering takes one tap.
   */
  if (design === 'glow') {
    const rating = Number(product.rating || 0);
    const actionBase =
      'w-9 h-9 flex items-center justify-center rounded-full bg-(--ds-surface) text-(--ds-text) shadow-(--ds-shadow-sm) transition-[opacity,transform,color,background-color] duration-(--ds-dur-fast) hover:bg-(--primary) hover:text-(--primary-foreground) cursor-pointer';
    const reveal =
      'pointer-fine:opacity-0 pointer-fine:translate-x-2 rtl:pointer-fine:-translate-x-2 pointer-fine:group-hover:opacity-100 pointer-fine:group-hover:translate-x-0 focus-visible:opacity-100 focus-visible:translate-x-0';
    return (
      <article className="@container group relative flex flex-col h-full min-w-0">
        <div className="relative rounded-[18px] overflow-hidden bg-(--glow-soft)">
          {media('rounded-[18px]')}
          <div className="absolute top-(--ds-s-2) start-(--ds-s-2) flex flex-wrap items-center gap-(--ds-s-1) pointer-events-none">
            {showDiscount && hasDiscount && (
              <span className="inline-flex items-center h-7 px-(--ds-s-3) rounded-full bg-(--primary) text-(--primary-foreground) text-(length:--ds-fs-xs) font-(--ds-fw-semibold) ds-num shadow-(--ds-shadow-sm)">
                {t('{n}% off', { n: discountPercent })}
              </span>
            )}
            {product.isWholesale && <WholesalePill />}
            {product.requiresPrescription && (
              <span className="inline-flex items-center gap-0.5 h-6 px-(--ds-s-2) rounded-full bg-(--ds-surface) text-(--ds-danger-text) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) shadow-(--ds-shadow-sm)">
                <FileText className="w-3 h-3" />
                Rx
              </span>
            )}
          </div>

          <div className="absolute top-(--ds-s-2) end-(--ds-s-2) flex flex-col gap-(--ds-s-2)">
            {showWishlist && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleWishlist(product);
                }}
                aria-label={wishlistLabel}
                aria-pressed={inWishlist}
                title={wishlistLabel}
                className={`${actionBase} ${inWishlist ? 'text-(--ds-rose)' : reveal}`}
              >
                <Heart className={`w-4 h-4 ${inWishlist ? 'fill-current' : ''}`} />
              </button>
            )}
            <a href={href} onClick={handleLinkClick} aria-label={t('Quick view')} title={t('Quick view')} className={`hidden sm:flex ${actionBase} ${reveal}`}>
              <Maximize2 className="w-4 h-4" />
            </a>
            {showAddToCart && !isOutOfStock && (
              <button
                type="button"
                onClick={handleAddToCart}
                aria-label={addToCartLabel}
                title={addToCartLabel}
                className={`${actionBase} ${reveal}`}
              >
                <ShoppingBag className="w-4 h-4" />
              </button>
            )}
          </div>

          {countdownTo && !isOutOfStock && (
            <div className="absolute inset-x-(--ds-s-2) bottom-(--ds-s-2)">
              <CountdownBoxes end={countdownTo} variant="chip" />
            </div>
          )}
          {isOutOfStock && (
            <span className="absolute bottom-(--ds-s-2) start-(--ds-s-2) inline-flex items-center h-7 px-(--ds-s-3) rounded-full bg-(--ds-surface)/95 text-(--ds-danger-text) text-(length:--ds-fs-xs) font-(--ds-fw-bold) shadow-(--ds-shadow-sm)">
              {t('Out of stock')}
            </span>
          )}
        </div>

        <div className="flex flex-col flex-1 gap-1 pt-(--ds-s-3)">
          {(product.categoryName || rating > 0) && (
            <div className="flex items-center justify-between gap-(--ds-s-2) min-w-0">
              <span className="min-w-0 truncate text-(length:--ds-fs-sm) text-(--ds-text-muted)">{product.categoryName}</span>
              {rating > 0 && (
                <span className="shrink-0 inline-flex items-center gap-1 text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text)">
                  <Star className="w-4 h-4 fill-(--ds-amber) text-(--ds-amber)" />
                  <span className="ds-num">{rating.toFixed(1)}</span>
                </span>
              )}
            </div>
          )}
          {brandLine}
          {nameLink('text-(length:--ds-fs-md) @[12rem]:text-(length:--ds-fs-lg) font-(--ds-fw-medium)')}
          {genericLine}
          {descriptionLine}
          {showPrice && (
            <div className="flex flex-wrap items-baseline gap-x-(--ds-s-2)">
              <span className="ds-num text-(length:--ds-fs-lg) @[12rem]:text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--glow-accent-ink)">
                ৳{formatMoney(currentPrice)}
              </span>
              {showOldPrice && hasDiscount && (
                <span className="ds-num text-(length:--ds-fs-sm) @[12rem]:text-(length:--ds-fs-md) text-(--ds-text-muted) line-through">৳{formatMoney(price)}</span>
              )}
            </div>
          )}
          {showStockText && stockLine}
          {showBuyNow && (
            <div className="mt-auto pt-(--ds-s-2)">
              <button
                type="button"
                disabled={isOutOfStock}
                onClick={handleBuyNow}
                title={buyNowLabel}
                className={`cta-buy cta-card w-full inline-flex items-center justify-center gap-(--ds-s-2) h-10 px-(--ds-s-3) rounded-full bg-(--primary) text-(--primary-foreground) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) transition-colors hover:bg-(--primary-hover) disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${buyCta.className}`}
                style={buyCta.style}
              >
                <Zap className="w-4 h-4 shrink-0" />
                <span className="truncate">{buyNowLabel}</span>
              </button>
            </div>
          )}
        </div>
      </article>
    );
  }

  /* ---- v3.15 premium designs ---------------------------------------------- */

  const rating = Number(product.rating || 0);
  const reviewCount = Number(product.reviewCount || 0);
  const saveAmount = hasDiscount && salePrice ? price - salePrice : 0;
  const stars = (sizeClass = 'w-3.5 h-3.5') =>
    rating > 0 ? (
      <span className="inline-flex items-center gap-1 min-w-0" aria-label={`${rating.toFixed(1)} / 5`}>
        <span className="inline-flex shrink-0">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`${sizeClass} ${n <= Math.round(rating) ? 'fill-(--ds-amber) text-(--ds-amber)' : 'text-(--ds-border-strong)'}`}
            />
          ))}
        </span>
        {reviewCount > 0 && <span className="ds-num text-(length:--ds-fs-2xs) text-(--ds-text-muted)">({reviewCount})</span>}
      </span>
    ) : null;
  const soldOutTag = isOutOfStock ? (
    <span className="absolute bottom-(--ds-s-2) start-(--ds-s-2) inline-flex items-center h-6 px-(--ds-s-2) rounded-(--ds-r-full) bg-(--ds-surface)/95 text-(--ds-danger-text) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) uppercase tracking-[0.06em] shadow-(--ds-shadow-sm) pointer-events-none">
      {t('Out of stock')}
    </span>
  ) : null;
  const extraBadges = (product.isWholesale || product.requiresPrescription) && (
    <>
      {product.isWholesale && <WholesalePill />}
      {product.requiresPrescription && (
        <span className="inline-flex items-center gap-0.5 h-5 px-(--ds-s-2) rounded-(--ds-r-full) bg-(--ds-surface) text-(--ds-danger-text) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) shadow-(--ds-shadow-sm)">
          <FileText className="w-3 h-3" />
          Rx
        </span>
      )}
    </>
  );

  /*
   * v3.15 — Luxe: the Shopify-boutique look. No frame; a soft picture with
   * rounded corners, a "Sale" tag, and Add to Cart sliding up over the
   * picture on hover (always shown under the price on touch screens). Brand
   * in small capitals, the name in the heading font, centred.
   */
  if (design === 'luxe') {
    return (
      <article className="@container group relative flex flex-col h-full min-w-0 text-center">
        <div className="relative overflow-hidden rounded-(--ds-r-lg) bg-(--ds-surface-2)">
          {media('rounded-(--ds-r-lg)')}
          <div className="absolute top-(--ds-s-2) start-(--ds-s-2) flex flex-wrap items-center gap-(--ds-s-1) pointer-events-none">
            {showDiscount && hasDiscount && (
              <span className="inline-flex items-center h-6 px-(--ds-s-2) rounded-(--ds-r-full) bg-(--ds-text) text-(--ds-text-invert) text-(length:--ds-fs-2xs) font-(--ds-fw-semibold) uppercase tracking-[0.08em]">
                {t('Sale')} −{discountPercent}%
              </span>
            )}
            {extraBadges}
          </div>
          {showWishlist && (
            <div className="absolute top-(--ds-s-2) end-(--ds-s-2)">
              {wishlistButton(inWishlist ? '' : 'pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100')}
            </div>
          )}
          {soldOutTag}
          {showAddToCart && !isOutOfStock && (
            <div className="hidden pointer-fine:block absolute inset-x-(--ds-s-2) bottom-(--ds-s-2) translate-y-[calc(100%+12px)] opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 transition-[transform,opacity] duration-(--ds-dur) ease-(--ds-ease)">
              {addButton('ds-btn-block h-(--ds-h-md) px-(--ds-s-2) text-(length:--ds-fs-sm) bg-(--ds-surface)/95 backdrop-blur shadow-(--ds-shadow-md)')}
            </div>
          )}
        </div>
        <div className="flex flex-col flex-1 items-center gap-1 pt-(--ds-s-3) px-(--ds-s-1)">
          {product.brandName && (showBrand || !showCategory) ? (
            <span className="max-w-full truncate text-(length:--ds-fs-2xs) font-(--ds-fw-semibold) uppercase tracking-[0.14em] text-(--ds-text-muted)">
              {product.brandName}
            </span>
          ) : (
            categoryLine
          )}
          <a
            href={href}
            onClick={handleLinkClick}
            title={product.name}
            className="ds-clamp-2 leading-(--ds-lh-snug) text-(--ds-text) hover:underline underline-offset-4 decoration-1 text-(length:--ds-fs-md) @[12rem]:text-(length:--ds-fs-lg) font-(--ds-fw-medium) [font-family:var(--font-display)]"
          >
            {product.name}
          </a>
          {genericLine}
          {descriptionLine}
          {stars()}
          {showPrice && (
            <div className="flex flex-wrap items-baseline justify-center gap-x-(--ds-s-2)">
              <span className={`ds-num text-(length:--ds-fs-md) @[12rem]:text-(length:--ds-fs-lg) font-(--ds-fw-semibold) ${hasDiscount ? 'text-(--ds-danger-text)' : 'text-(--ds-text)'}`}>
                ৳{formatMoney(currentPrice)}
              </span>
              {oldPriceTag('text-(length:--ds-fs-sm)')}
            </div>
          )}
          {showStockText && stockLine}
          {showButtons && (
            <div className={`mt-auto pt-(--ds-s-2) w-full grid gap-(--ds-s-2) ${showAddToCart && showBuyNow ? 'grid-cols-[auto_minmax(0,1fr)] pointer-fine:grid-cols-1' : 'grid-cols-1'}`}>
              {showAddToCart && (
                <div className="pointer-fine:hidden">
                  {addButton(`h-(--ds-h-md) text-(length:--ds-fs-sm) ${showBuyNow ? 'w-(--ds-h-md) px-0' : 'ds-btn-block px-(--ds-s-2)'}`, showBuyNow ? 'hidden' : '')}
                </div>
              )}
              {showBuyNow && buyButton('ds-btn-block h-(--ds-h-md) px-(--ds-s-2) text-(length:--ds-fs-sm)')}
            </div>
          )}
        </div>
      </article>
    );
  }

  /*
   * v3.15 — Boutique: a framed card with a tinted picture well, a round
   * discount seal, stars with the number of reviews, the price with
   * "Save ৳…", and a square cart button next to a wide Buy Now.
   */
  if (design === 'boutique') {
    return (
      <article className="@container group relative flex flex-col h-full min-w-0 p-(--ds-s-2) bg-(--ds-surface) border border-(--ds-border-soft) rounded-[20px] shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_-12px_rgba(16,24,40,.12)] transition-[box-shadow,transform] duration-(--ds-dur) ease-(--ds-ease) hover:shadow-[0_2px_4px_rgba(16,24,40,.05),0_18px_40px_-16px_rgba(16,24,40,.22)] hover:-translate-y-1">
        <div className="relative overflow-hidden rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_6%,var(--ds-surface-2))]">
          {media('rounded-[14px]')}
          {showDiscount && hasDiscount && (
            <span className="absolute top-(--ds-s-2) start-(--ds-s-2) w-11 h-11 flex flex-col items-center justify-center rounded-full bg-(--ds-danger) text-(--ds-text-invert) leading-none shadow-(--ds-shadow-md) pointer-events-none">
              <span className="ds-num text-(length:--ds-fs-sm) font-(--ds-fw-black)">{discountPercent}%</span>
              <span className="text-[9px] font-(--ds-fw-bold) uppercase">{t('Off')}</span>
            </span>
          )}
          <div className={`absolute ${showDiscount && hasDiscount ? 'top-[60px]' : 'top-(--ds-s-2)'} start-(--ds-s-2) flex flex-col items-start gap-(--ds-s-1) pointer-events-none`}>
            {extraBadges}
          </div>
          {showWishlist && <div className="absolute top-(--ds-s-2) end-(--ds-s-2)">{wishlistButton()}</div>}
          {soldOutTag}
        </div>
        <div className="flex flex-col flex-1 gap-(--ds-s-2) px-(--ds-s-1) pt-(--ds-s-3) pb-(--ds-s-1)">
          <div className="flex flex-col gap-1">
            {(categoryLine || brandLine) && (
              <div className="flex items-center gap-(--ds-s-2) min-w-0">
                {brandLine}
                {categoryLine}
              </div>
            )}
            {nameLink('text-(length:--ds-fs-md) @[12rem]:text-(length:--ds-fs-lg) font-(--ds-fw-semibold)')}
            {genericLine}
            {descriptionLine}
            {stars()}
            {showPrice && (
              <div className="flex flex-wrap items-center gap-x-(--ds-s-2) gap-y-1 mt-0.5">
                {currentPriceTag('text-(length:--ds-fs-lg) @[12rem]:text-(length:--ds-fs-xl)')}
                {oldPriceTag('text-(length:--ds-fs-sm)')}
                {showDiscount && saveAmount > 0 && (
                  <span className="inline-flex items-center h-5 px-(--ds-s-2) rounded-(--ds-r-full) bg-(--ds-success-soft) text-(--ds-success-text) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) ds-num">
                    {t('Save {amount}', { amount: `৳${formatMoney(saveAmount)}` })}
                  </span>
                )}
              </div>
            )}
            {stockLine}
          </div>
          {showButtons && (
            <div className={`mt-auto grid gap-(--ds-s-2) ${showAddToCart && showBuyNow ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1'}`}>
              {showAddToCart &&
                addButton(
                  `h-(--ds-h-md) rounded-[12px] text-(length:--ds-fs-sm) ${showBuyNow ? 'w-(--ds-h-md) px-0' : 'px-(--ds-s-2)'}`,
                  showBuyNow ? 'hidden' : ''
                )}
              {showBuyNow && buyButton('h-(--ds-h-md) rounded-[12px] px-(--ds-s-2) text-(length:--ds-fs-sm)')}
            </div>
          )}
        </div>
      </article>
    );
  }

  /*
   * v3.15 — Editorial: magazine-style. A tall picture with square corners,
   * the name large in the heading font, a hairline, the price, and two
   * understated buttons in small capitals.
   */
  if (design === 'editorial') {
    return (
      <article className="@container group relative flex flex-col h-full min-w-0">
        <div className="relative overflow-hidden bg-(--ds-surface-2)">
          {media('')}
          <div className="absolute top-0 start-0 flex flex-wrap items-center gap-(--ds-s-1) p-(--ds-s-2) pointer-events-none">
            {showDiscount && hasDiscount && (
              <span className="inline-flex items-center h-6 px-(--ds-s-2) bg-(--ds-surface) text-(--ds-text) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) uppercase tracking-[0.12em] ds-num">
                −{discountPercent}%
              </span>
            )}
            {extraBadges}
          </div>
          {showWishlist && <div className="absolute top-(--ds-s-2) end-(--ds-s-2)">{wishlistButton('rounded-none')}</div>}
          {soldOutTag}
        </div>
        <div className="flex flex-col flex-1 gap-(--ds-s-2) pt-(--ds-s-3)">
          <div className="flex items-center justify-between gap-(--ds-s-2) min-w-0">
            <span className="min-w-0 truncate text-(length:--ds-fs-2xs) font-(--ds-fw-semibold) uppercase tracking-[0.16em] text-(--ds-text-muted)">
              {product.brandName || product.categoryName || ''}
            </span>
            {rating > 0 && (
              <span className="shrink-0 inline-flex items-center gap-0.5 text-(length:--ds-fs-2xs) font-(--ds-fw-semibold) text-(--ds-text)">
                <Star className="w-3 h-3 fill-(--ds-text) text-(--ds-text)" />
                <span className="ds-num">{rating.toFixed(1)}</span>
              </span>
            )}
          </div>
          <a
            href={href}
            onClick={handleLinkClick}
            title={product.name}
            className="ds-clamp-2 leading-[1.2] text-(--ds-text) hover:opacity-70 transition-opacity text-(length:--ds-fs-lg) @[13rem]:text-(length:--ds-fs-xl) font-(--ds-fw-medium) [font-family:var(--font-display)]"
          >
            {product.name}
          </a>
          {genericLine}
          {descriptionLine}
          {showPrice && (
            <div className="flex flex-wrap items-baseline gap-x-(--ds-s-2) pt-(--ds-s-2) border-t border-(--ds-border-soft)">
              <span className="ds-num text-(length:--ds-fs-md) @[12rem]:text-(length:--ds-fs-lg) font-(--ds-fw-semibold) text-(--ds-text)">৳{formatMoney(currentPrice)}</span>
              {oldPriceTag('text-(length:--ds-fs-sm)')}
            </div>
          )}
          {stockLine}
          {showButtons && (
            <div className={`mt-auto grid gap-(--ds-s-2) ${showAddToCart && showBuyNow ? 'grid-cols-1 @[18rem]:grid-cols-2' : 'grid-cols-1'}`}>
              {showAddToCart && addButton('ds-btn-block h-(--ds-h-md) px-(--ds-s-2) rounded-none uppercase tracking-[0.08em] text-(length:--ds-fs-xs)')}
              {showBuyNow && buyButton('ds-btn-block h-(--ds-h-md) px-(--ds-s-2) rounded-none uppercase tracking-[0.08em] text-(length:--ds-fs-xs)')}
            </div>
          )}
        </div>
      </article>
    );
  }

  /*
   * v3.15 — Spotlight: a dark-footed premium card. The picture fills the top,
   * the details sit on a soft panel that lifts on hover, the price is large
   * with the saving underneath, and Buy Now spans the card with the cart
   * button beside it.
   */
  if (design === 'spotlight') {
    return (
      <article className="@container group relative flex flex-col h-full min-w-0 overflow-hidden rounded-[22px] bg-(--ds-surface) ring-1 ring-(--ds-border-soft) transition-[box-shadow,transform] duration-(--ds-dur) ease-(--ds-ease) hover:shadow-(--ds-shadow-lg) hover:-translate-y-0.5">
        <div className="relative">
          {media('')}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-black/25 to-transparent pointer-events-none" />
          <div className="absolute top-(--ds-s-2) start-(--ds-s-2) flex flex-wrap items-center gap-(--ds-s-1) pointer-events-none">
            {showDiscount && hasDiscount && (
              <span className="inline-flex items-center gap-1 h-7 px-(--ds-s-3) rounded-(--ds-r-full) bg-(--primary) text-(--primary-foreground) text-(length:--ds-fs-xs) font-(--ds-fw-bold) ds-num shadow-(--ds-shadow-sm)">
                <Zap className="w-3.5 h-3.5" />
                {t('{n}% off', { n: discountPercent })}
              </span>
            )}
            {extraBadges}
          </div>
          {showWishlist && (
            <div className="absolute top-(--ds-s-2) end-(--ds-s-2)">
              {wishlistButton('bg-(--ds-surface)/90 backdrop-blur')}
            </div>
          )}
          {soldOutTag}
          {rating > 0 && !isOutOfStock && (
            <span className="absolute bottom-(--ds-s-2) start-(--ds-s-2) inline-flex items-center gap-1 h-6 px-(--ds-s-2) rounded-(--ds-r-full) bg-(--ds-surface)/95 text-(length:--ds-fs-2xs) font-(--ds-fw-bold) text-(--ds-text) shadow-(--ds-shadow-sm) pointer-events-none">
              <Star className="w-3 h-3 fill-(--ds-amber) text-(--ds-amber)" />
              <span className="ds-num">{rating.toFixed(1)}</span>
              {reviewCount > 0 && <span className="ds-num font-(--ds-fw-medium) text-(--ds-text-muted)">({reviewCount})</span>}
            </span>
          )}
        </div>
        <div className="flex flex-col flex-1 gap-(--ds-s-2) p-(--ds-s-3) bg-[linear-gradient(180deg,var(--ds-surface),color-mix(in_srgb,var(--primary)_5%,var(--ds-surface)))]">
          <div className="flex flex-col gap-1">
            {brandLine}
            {categoryLine}
            {nameLink('text-(length:--ds-fs-md) @[12rem]:text-(length:--ds-fs-lg) font-(--ds-fw-bold)')}
            {genericLine}
            {descriptionLine}
            {showPrice && (
              <div className="flex flex-col mt-0.5">
                <div className="flex flex-wrap items-baseline gap-x-(--ds-s-2)">
                  {currentPriceTag('text-(length:--ds-fs-xl) @[13rem]:text-(length:--ds-fs-2xl)')}
                  {oldPriceTag('text-(length:--ds-fs-sm)')}
                </div>
                {showDiscount && saveAmount > 0 && (
                  <span className="ds-num text-(length:--ds-fs-xs) font-(--ds-fw-semibold) text-(--ds-success-text)">
                    {t('Save {amount}', { amount: `৳${formatMoney(saveAmount)}` })}
                  </span>
                )}
              </div>
            )}
            {stockLine}
          </div>
          {showButtons && (
            <div className={`mt-auto grid gap-(--ds-s-2) ${showAddToCart && showBuyNow ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1'}`}>
              {showBuyNow && buyButton('h-(--ds-h-md) rounded-(--ds-r-full) px-(--ds-s-2) text-(length:--ds-fs-sm)')}
              {showAddToCart &&
                addButton(
                  `h-(--ds-h-md) rounded-(--ds-r-full) text-(length:--ds-fs-sm) ${showBuyNow ? 'w-(--ds-h-md) px-0' : 'px-(--ds-s-2)'}`,
                  showBuyNow ? 'hidden' : ''
                )}
            </div>
          )}
        </div>
      </article>
    );
  }

  if (design === 'modern') {
    return (
      <article className="@container group relative flex flex-col h-full min-w-0 p-(--ds-s-2) bg-(--ds-surface) border border-(--ds-border-soft) rounded-(--ds-r-xl) shadow-(--ds-shadow-sm) transition-[box-shadow,transform] duration-(--ds-dur) ease-(--ds-ease) hover:shadow-(--ds-shadow-lg) hover:-translate-y-0.5">
        <div className="relative">
          {media('rounded-(--ds-r-lg)')}
          {badges(true)}

          {/* Quick actions: revealed on hover where the device can hover, always
              visible on touch screens. A saved item keeps its heart showing. */}
          <div className="absolute top-(--ds-s-2) right-(--ds-s-2) flex flex-col gap-(--ds-s-1)">
            {showWishlist &&
              wishlistButton(
                inWishlist
                  ? ''
                  : 'pointer-fine:opacity-0 pointer-fine:translate-x-1 pointer-fine:group-hover:opacity-100 pointer-fine:group-hover:translate-x-0 focus-visible:opacity-100 focus-visible:translate-x-0'
              )}
            <a
              href={href}
              onClick={handleLinkClick}
              aria-label={t('Quick view')}
              title={t('Quick view')}
              className="w-(--ds-h-sm) h-(--ds-h-sm) flex items-center justify-center rounded-(--ds-r-full) bg-(--ds-surface) border border-(--ds-border) text-(--ds-text-muted) shadow-(--ds-shadow-sm) hover:text-(--primary) transition-[color,opacity,transform] duration-(--ds-dur-fast) pointer-fine:opacity-0 pointer-fine:translate-x-1 pointer-fine:group-hover:opacity-100 pointer-fine:group-hover:translate-x-0 focus-visible:opacity-100 focus-visible:translate-x-0"
            >
              <Eye className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div className="flex flex-col flex-1 gap-(--ds-s-3) px-(--ds-s-1) pt-(--ds-s-3) pb-(--ds-s-1)">
          <div className="flex flex-col gap-(--ds-s-1)">
            {categoryLine}
          {brandLine}
            {nameLink('text-(length:--ds-fs-lg) font-(--ds-fw-semibold)')}
            {genericLine}
            {descriptionLine}
            {showPrice && (
              <div className="mt-(--ds-s-1) flex flex-wrap items-baseline gap-x-(--ds-s-2)">
                {currentPriceTag('text-(length:--ds-fs-lg) sm:text-(length:--ds-fs-xl)')}
                {oldPriceTag('text-(length:--ds-fs-sm)')}
              </div>
            )}
            {stockLine}
          </div>

          {showButtons && (
            <div className="mt-auto">
              {(
                <div
                  className={`grid gap-(--ds-s-2) ${
                    showAddToCart && showBuyNow ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1'
                  }`}
                >
                  {showAddToCart &&
                    addButton(
                      `h-(--ds-h-md) text-(length:--ds-fs-sm) ${
                        showBuyNow ? 'w-(--ds-h-md) px-0 @[14rem]:w-auto @[14rem]:px-(--ds-s-3)' : 'px-(--ds-s-2)'
                      }`,
                      showBuyNow ? 'hidden @[14rem]:inline' : ''
                    )}
                  {showBuyNow && buyButton('h-(--ds-h-md) px-(--ds-s-2) text-(length:--ds-fs-sm)')}
                </div>
              )}
            </div>
          )}
        </div>
      </article>
    );
  }

  if (design === 'minimal') {
    const cartIcon = showAddToCart && (
      <button
        type="button"
        disabled={isOutOfStock}
        onClick={handleAddToCart}
        title={addToCartLabel}
        aria-label={addToCartLabel}
        className={`ds-btn ds-btn-soft cta-atc cta-card cta-icon shrink-0 w-(--ds-h-sm) h-(--ds-h-sm) p-0 rounded-(--ds-r-full) ${addCta.className}`}
        style={addCta.style}
      >
        <ShoppingCart className="w-4 h-4" />
      </button>
    );

    return (
      <article className="group relative flex flex-col h-full min-w-0 p-(--ds-s-2) bg-(--ds-surface) rounded-(--ds-r-lg) transition-shadow duration-(--ds-dur) ease-(--ds-ease) hover:shadow-(--ds-shadow-md)">
        <div className="relative">
          {media('rounded-(--ds-r-md)')}
          {badges(true)}
          {showWishlist && (
            <div className="absolute top-(--ds-s-2) right-(--ds-s-2)">{wishlistButton()}</div>
          )}
        </div>

        <div className="flex flex-col flex-1 gap-(--ds-s-3) px-(--ds-s-1) pt-(--ds-s-3) pb-(--ds-s-1)">
          <div className="flex flex-col gap-(--ds-s-1)">
            {categoryLine}
          {brandLine}
            {nameLink('text-(length:--ds-fs-lg) font-(--ds-fw-medium)')}
            {genericLine}
            {descriptionLine}
            {(showPrice || cartIcon) && (
              <div className="mt-(--ds-s-1) flex items-center justify-between gap-(--ds-s-2)">
                {showPrice ? (
                  <div className="min-w-0 flex flex-wrap items-baseline gap-x-(--ds-s-2)">
                    {currentPriceTag('text-(length:--ds-fs-lg) font-(--ds-fw-bold)')}
                    {oldPriceTag('text-(length:--ds-fs-xs)')}
                  </div>
                ) : (
                  <span />
                )}
                {cartIcon}
              </div>
            )}
            {stockLine}
          </div>

          {(
            showBuyNow && (
              <div className="mt-auto">
                {buyButton('ds-btn-block h-(--ds-h-md) px-(--ds-s-2) rounded-(--ds-r-full) text-(length:--ds-fs-sm)')}
              </div>
            )
          )}
        </div>
      </article>
    );
  }

  if (design === 'compact') {
    return (
      <article className="@container group relative flex flex-col h-full min-w-0 bg-(--ds-surface) border border-(--ds-border) rounded-(--ds-r-md) overflow-hidden transition-[border-color,box-shadow] duration-(--ds-dur) ease-(--ds-ease) hover:border-(--ds-border-strong) hover:shadow-(--ds-shadow-sm)">
        <div className="relative">
          {media('')}
          {badges(false)}
          {showWishlist && (
            <div className="absolute top-(--ds-s-1) right-(--ds-s-1)">{wishlistButton()}</div>
          )}
        </div>

        <div className="flex flex-col flex-1 gap-(--ds-s-2) p-(--ds-s-2)">
          <div className="flex flex-col gap-(--ds-s-1)">
            {categoryLine}
          {brandLine}
            {nameLink('text-(length:--ds-fs-md) sm:text-(length:--ds-fs-lg) font-(--ds-fw-semibold)')}
            {genericLine}
            {descriptionLine}
            {showPrice && (
              <div className="flex flex-wrap items-center gap-x-(--ds-s-1) gap-y-0.5">
                {currentPriceTag('text-(length:--ds-fs-md)')}
                {oldPriceTag('text-(length:--ds-fs-2xs)')}
                {showDiscount && hasDiscount && (
                  <span className="inline-flex items-center px-(--ds-s-1) rounded-(--ds-r-xs) bg-(--ds-danger-soft) text-(--ds-danger-text) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) ds-num">
                    -{discountPercent}%
                  </span>
                )}
              </div>
            )}
            {stockLine}
          </div>

          {showButtons && (
            <div className="mt-auto">
              {(
                <div
                  className={`grid gap-(--ds-s-1) ${
                    showAddToCart && showBuyNow ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1'
                  }`}
                >
                  {showAddToCart &&
                    addButton(
                      `ds-btn-sm gap-(--ds-s-1) text-(length:--ds-fs-xs) ${
                        showBuyNow ? 'w-(--ds-h-sm) px-0 @[12.5rem]:w-auto @[12.5rem]:px-(--ds-s-2)' : 'px-(--ds-s-2)'
                      }`,
                      showBuyNow ? 'hidden @[12.5rem]:inline' : ''
                    )}
                  {showBuyNow && buyButton('ds-btn-sm gap-(--ds-s-1) px-(--ds-s-2) text-(length:--ds-fs-xs)')}
                </div>
              )}
            </div>
          )}
        </div>
      </article>
    );
  }

  // Classic
  return (
    <article className="group relative flex flex-col h-full min-w-0 bg-(--ds-surface) border border-(--ds-border) rounded-(--ds-r-lg) overflow-hidden shadow-(--ds-shadow-xs) transition-[box-shadow,border-color,transform] duration-(--ds-dur) ease-(--ds-ease) hover:shadow-(--ds-shadow-md) hover:border-(--ds-border-strong) hover:-translate-y-0.5">
      <div className="relative">
        {media('')}
        {badges(true)}
        {showWishlist && <div className="absolute top-(--ds-s-2) right-(--ds-s-2)">{wishlistButton()}</div>}
      </div>

      <div className="flex flex-col flex-1 gap-(--ds-s-3) p-(--ds-s-3)">
        <div className="flex flex-col gap-(--ds-s-1)">
          {categoryLine}
          {brandLine}
          {nameLink('text-(length:--ds-fs-lg) font-(--ds-fw-semibold)')}
          {genericLine}
          {descriptionLine}
          {showPrice && (
            <div className="mt-(--ds-s-1) flex flex-wrap items-baseline gap-x-(--ds-s-2)">
              {currentPriceTag('text-(length:--ds-fs-lg) sm:text-(length:--ds-fs-xl)')}
              {oldPriceTag('text-(length:--ds-fs-sm)')}
            </div>
          )}
          {stockLine}
        </div>

        {showButtons && (
          <div className="mt-auto flex flex-col gap-(--ds-s-2)">
            {(
              <>
                {showAddToCart &&
                  addButton('ds-btn-block h-(--ds-h-md) px-(--ds-s-2) text-(length:--ds-fs-sm) sm:text-(length:--ds-fs-base)')}
                {showBuyNow &&
                  buyButton('ds-btn-block h-(--ds-h-md) px-(--ds-s-2) text-(length:--ds-fs-sm) sm:text-(length:--ds-fs-base)')}
              </>
            )}
          </div>
        )}
      </div>
    </article>
  );
};
