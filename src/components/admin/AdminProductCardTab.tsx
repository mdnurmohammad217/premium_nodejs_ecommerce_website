import React, { useEffect, useRef, useState } from 'react';
import {
  Save,
  SlidersHorizontal,
  ShoppingCart,
  Zap,
  Heart,
  Type as TypeIcon,
  Eye,
  Minus,
  Plus,
  LayoutGrid,
  Sparkles,
  Check,
  Lock,
  Image as ImageIcon,
} from 'lucide-react';
import { PageHeader, Card, CardHeader, Button, Field, Toggle, useToasts, tint } from './ui.tsx';
import { CtaStyleCard } from './CtaStyleCard.tsx';
import { applyCtaStyle, ctaStyleOf, type CtaStyleConfig } from '../../lib/ctaStyle.ts';
import { SiteSettings, ProductCardConfig } from '../../types/index.ts';
import { IMAGE_PLACEHOLDER } from '../../lib/placeholder.ts';
import {
  CTA_ANIMATION_OPTIONS,
  CtaAnimation,
  CtaAnimationConfig,
  CtaTarget,
  ctaAnimation,
  resolveCtaConfig,
} from '../../lib/ctaAnimation.ts';
import { PRODUCT_RATIOS, ProductImageConfig, ProductRatio, productImageCss } from '../../lib/productImage.ts';

interface AdminProductCardTabProps {
  settings: SiteSettings;
  onSave: (updated: SiteSettings) => Promise<void>;
}

type CardStyle = 'classic' | 'modern' | 'minimal' | 'compact' | 'glow' | 'luxe' | 'boutique' | 'editorial' | 'spotlight';

/** The card config plus the design choice and the product page button captions */
type CardConfig = ProductCardConfig & {
  cardStyle?: CardStyle;
  productPageAddToCartLabel?: string;
  productPageBuyNowLabel?: string;
};

const DEFAULT_ADD = 'Add to Cart';
const DEFAULT_BUY = 'Buy Now';

type ToggleKey = Exclude<keyof ProductCardConfig, 'addToCartLabel' | 'buyNowLabel'>;

const TOGGLES: Array<{ key: ToggleKey; label: string; description: string; fallback: boolean }> = [
  { key: 'showAddToCart', label: 'Add to Cart button', description: 'Shows the Add to Cart button on the card', fallback: true },
  { key: 'showBuyNow', label: 'Buy Now button', description: 'Shows a Buy Now button that goes straight to checkout', fallback: true },
  { key: 'showPrice', label: 'Current price', description: "Shows the product's price", fallback: true },
  { key: 'showOldPrice', label: 'Previous price', description: 'Shows the old price struck through when discounted', fallback: true },
  { key: 'showDiscount', label: 'Discount badge', description: 'Shows the discount percentage', fallback: true },
  { key: 'showWishlist', label: 'Wishlist icon', description: 'Shows the wishlist heart on the card', fallback: true },
  { key: 'showCategory', label: 'Category tag', description: 'Default: hidden, for a cleaner look', fallback: false },
  { key: 'showBrand' as ToggleKey, label: 'Brand name', description: "Shows the product's brand above its name. Default: hidden", fallback: false },
  { key: 'showGenericName', label: 'Generic name', description: 'Default: hidden', fallback: false },
  { key: 'showStockText', label: 'Stock status text', description: 'Default: hidden', fallback: false },
  { key: 'showDescription', label: 'Short description', description: 'Default: hidden', fallback: false },
];

const DESIGNS: Array<{ id: CardStyle; label: string; description: string }> = [
  { id: 'classic', label: 'Classic', description: 'Both buttons stacked, full width' },
  { id: 'modern', label: 'Modern', description: 'Quick actions on hover, buttons side by side' },
  { id: 'minimal', label: 'Minimal', description: 'Round cart icon by the price, one Buy Now' },
  { id: 'compact', label: 'Compact', description: 'Denser, for crowded grids' },
  { id: 'glow', label: 'Glow', description: 'Rounded photo, rating, price in the accent colour, one Buy Now' },
  { id: 'luxe', label: 'Luxe', description: 'Premium boutique look: no frame, centred text, Add to Cart slides up over the photo' },
  { id: 'boutique', label: 'Boutique', description: 'Premium card: round discount seal, stars, "Save ৳…", cart icon + wide Buy Now' },
  { id: 'editorial', label: 'Editorial', description: 'Magazine style: square photo, large heading-font name, small-caps buttons' },
  { id: 'spotlight', label: 'Spotlight', description: 'Premium: rating on the photo, big price with the saving, wide Buy Now + cart icon' },
];

const CTA_TARGETS: Array<{ key: CtaTarget; label: string; where: string }> = [
  { key: 'buyNow', label: 'Buy Now', where: 'Product cards and the product page' },
  { key: 'placeOrder', label: 'Place order', where: 'The confirm button on checkout' },
  { key: 'addToCart', label: 'Add to Cart', where: 'Product cards and the product page' },
];

const INTENSITIES: Array<{ id: CtaAnimationConfig['intensity']; label: string }> = [
  { id: 'subtle', label: 'Subtle' },
  { id: 'normal', label: 'Normal' },
  { id: 'strong', label: 'Strong' },
];

/* ---------------------------------------------------------------------------
 * Mock card — a miniature of each storefront design, drawn from the settings
 * being edited so every toggle, caption and animation shows up immediately.
 * ------------------------------------------------------------------------- */

const MockCard: React.FC<{
  design: CardStyle;
  config: CardConfig;
  animation: { cta_animation_config: CtaAnimationConfig };
  large?: boolean;
}> = ({ design, config, animation, large }) => {
  const on = (key: ToggleKey, fallback: boolean) => (config[key] as boolean | undefined) ?? fallback;
  const add = config.addToCartLabel || DEFAULT_ADD;
  const buy = config.buyNowLabel || DEFAULT_BUY;
  const addCta = ctaAnimation(animation, 'addToCart');
  const buyCta = ctaAnimation(animation, 'buyNow');

  const showAdd = on('showAddToCart', true);
  const showBuy = on('showBuyNow', true);
  const showDiscount = on('showDiscount', true);

  const text = {
    name: large ? 'text-(length:--ds-fs-base)' : 'text-(length:--ds-fs-2xs)',
    price: large ? 'text-(length:--ds-fs-lg)' : 'text-(length:--ds-fs-sm)',
    small: large ? 'text-(length:--ds-fs-xs)' : 'text-(length:--ds-fs-2xs)',
  };
  const btnHeight = large ? 'h-(--ds-h-sm)' : 'h-(--ds-s-6)';
  const icon = large ? 'w-3.5 h-3.5' : 'w-3 h-3';

  const button = (kind: 'soft' | 'solid', label: string | null, Icon: typeof Zap, extra = '') => {
    const cta = kind === 'solid' ? buyCta : addCta;
    return (
      <span
        className={`ds-btn ${kind === 'solid' ? 'ds-btn-primary cta-buy' : 'ds-btn-soft cta-atc'} cta-card ${btnHeight} ${text.small} gap-1 px-(--ds-s-2) min-w-0 ${extra} ${cta.className}`}
        style={cta.style}
      >
        <Icon className={`${icon} shrink-0`} />
        {label && <span className="truncate">{label}</span>}
      </span>
    );
  };

  const image = (radius: string, withBadge: boolean, quickActions = false) => (
    <span className={`relative block product-frame overflow-hidden bg-(--ds-surface-2) ${radius}`}>
      <img src={IMAGE_PLACEHOLDER} alt="" loading="lazy" className="absolute inset-0 w-full h-full product-img" />
      {withBadge && showDiscount && (
        <span
          className={`absolute top-1.5 left-1.5 inline-flex items-center px-1.5 rounded-(--ds-r-full) bg-(--ds-danger) text-(--ds-text-invert) font-(--ds-fw-bold) ds-num ${text.small}`}
        >
          -15%
        </span>
      )}
      {on('showWishlist', true) && (
        <span className="absolute top-1.5 right-1.5 flex flex-col gap-1">
          <span className="w-5 h-5 inline-flex items-center justify-center rounded-(--ds-r-full) bg-(--ds-surface) text-(--ds-text-muted) shadow-(--ds-shadow-sm)">
            <Heart className="w-3 h-3" />
          </span>
          {quickActions && (
            <span className="w-5 h-5 inline-flex items-center justify-center rounded-(--ds-r-full) bg-(--ds-surface) text-(--ds-text-muted) shadow-(--ds-shadow-sm)">
              <Eye className="w-3 h-3" />
            </span>
          )}
        </span>
      )}
    </span>
  );

  const info = (nameWeight: string, priceWeight: string, inlineDiscount = false, trailing?: React.ReactNode) => (
    <span className="flex flex-col gap-0.5 min-w-0">
      {on('showCategory', false) && (
        <span className={`font-(--ds-fw-semibold) text-(--ds-text-muted) ${text.small}`}>Category</span>
      )}
      <span className={`ds-clamp-2 leading-(--ds-lh-snug) text-(--ds-text) ${nameWeight} ${text.name}`}>
        Product name
      </span>
      {on('showGenericName', false) && <span className={`text-(--ds-text-muted) ${text.small}`}>Generic name</span>}
      {on('showDescription', false) && (
        <span className={`ds-clamp-1 text-(--ds-text-soft) ${text.small}`}>A short product description.</span>
      )}
      {(on('showPrice', true) || trailing) && (
        <span className="mt-0.5 flex items-center justify-between gap-1">
          {on('showPrice', true) ? (
            <span className="flex flex-wrap items-baseline gap-x-1 min-w-0">
              <span className={`ds-num text-(--ds-text) leading-(--ds-lh-tight) ${priceWeight} ${text.price}`}>
                <span className="text-(--primary)">৳</span>250
              </span>
              {on('showOldPrice', true) && (
                <span className={`ds-num line-through text-(--ds-text-faint) ${text.small}`}>৳300</span>
              )}
              {inlineDiscount && showDiscount && (
                <span
                  className={`ds-num px-1 rounded-(--ds-r-xs) bg-(--ds-danger-soft) text-(--ds-danger-text) font-(--ds-fw-bold) ${text.small}`}
                >
                  -15%
                </span>
              )}
            </span>
          ) : (
            <span />
          )}
          {trailing}
        </span>
      )}
      {on('showStockText', false) && (
        <span className={`font-(--ds-fw-medium) text-(--ds-success-text) ${text.small}`}>In stock</span>
      )}
    </span>
  );

  if (design === 'modern') {
    return (
      <span className="flex flex-col gap-2 h-full p-1.5 rounded-(--ds-r-lg) bg-(--ds-surface) border border-(--ds-border-soft) shadow-(--ds-shadow-sm)">
        {image('rounded-(--ds-r-md)', true, true)}
        <span className="px-0.5">{info('font-(--ds-fw-semibold)', 'font-(--ds-fw-black)')}</span>
        {(showAdd || showBuy) && (
          <span className={`mt-auto grid gap-1 ${showAdd && showBuy ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1'}`}>
            {showAdd && button('soft', showBuy && !large ? null : add, ShoppingCart)}
            {showBuy && button('solid', buy, Zap)}
          </span>
        )}
      </span>
    );
  }

  if (design === 'minimal') {
    const cartIcon = showAdd ? (
      <span
        className={`ds-btn ds-btn-soft cta-atc cta-card cta-icon shrink-0 p-0 rounded-(--ds-r-full) ${large ? 'w-(--ds-h-sm) h-(--ds-h-sm)' : 'w-(--ds-s-6) h-(--ds-s-6)'} ${addCta.className}`}
        style={addCta.style}
      >
        <ShoppingCart className={icon} />
      </span>
    ) : undefined;
    return (
      <span className="flex flex-col gap-2 h-full p-1.5 rounded-(--ds-r-lg) bg-(--ds-surface)">
        {image('rounded-(--ds-r-md)', true)}
        <span className="px-0.5">{info('font-(--ds-fw-medium)', 'font-(--ds-fw-bold)', false, cartIcon)}</span>
        {showBuy && <span className="mt-auto grid">{button('solid', buy, Zap, 'rounded-(--ds-r-full)')}</span>}
      </span>
    );
  }

  if (design === 'glow') {
    return (
      <span className="flex flex-col gap-1.5 h-full">
        {image('rounded-[12px]', true)}
        <span className={`flex items-center justify-between text-(--ds-text-muted) ${text.small}`}>
          <span>Category</span>
          <span className="text-(--ds-text) font-(--ds-fw-semibold)">★ 4.8</span>
        </span>
        <span className={`ds-clamp-2 leading-(--ds-lh-snug) text-(--ds-text) font-(--ds-fw-medium) ${text.name}`}>Product name</span>
        {on('showPrice', true) && (
          <span className="flex items-baseline gap-1">
            <span className={`ds-num font-(--ds-fw-bold) text-(--glow-accent-ink) ${text.price}`}>৳250</span>
            {on('showOldPrice', true) && <span className={`ds-num line-through text-(--ds-text-faint) ${text.small}`}>৳300</span>}
          </span>
        )}
        {showBuy && <span className="mt-auto grid">{button('solid', buy, Zap, 'rounded-(--ds-r-full)')}</span>}
      </span>
    );
  }

  if (design === 'luxe') {
    return (
      <span className="flex flex-col items-center gap-1 h-full text-center">
        <span className="relative block w-full">
          {image('rounded-(--ds-r-md)', false)}
          {showDiscount && (
            <span className={`absolute top-1.5 left-1.5 px-1.5 rounded-(--ds-r-full) bg-(--ds-text) text-(--ds-text-invert) font-(--ds-fw-semibold) uppercase ${text.small}`}>Sale</span>
          )}
          {showAdd && <span className="absolute inset-x-1.5 bottom-1.5 grid">{button('soft', add, ShoppingCart, 'bg-(--ds-surface)')}</span>}
        </span>
        <span className={`uppercase tracking-[0.14em] text-(--ds-text-muted) ${text.small}`}>Brand</span>
        <span className={`ds-clamp-2 leading-(--ds-lh-snug) text-(--ds-text) font-(--ds-fw-medium) [font-family:var(--font-display)] ${text.name}`}>Product name</span>
        <span className={`text-(--ds-amber) ${text.small}`}>★★★★★</span>
        {on('showPrice', true) && (
          <span className="flex items-baseline gap-1">
            <span className={`ds-num font-(--ds-fw-semibold) text-(--ds-danger-text) ${text.price}`}>৳250</span>
            {on('showOldPrice', true) && <span className={`ds-num line-through text-(--ds-text-faint) ${text.small}`}>৳300</span>}
          </span>
        )}
        {showBuy && <span className="mt-auto grid w-full">{button('solid', buy, Zap)}</span>}
      </span>
    );
  }

  if (design === 'boutique') {
    return (
      <span className="flex flex-col gap-1.5 h-full p-1.5 rounded-[14px] bg-(--ds-surface) border border-(--ds-border-soft) shadow-(--ds-shadow-sm)">
        <span className="relative block">
          {image('rounded-[10px]', false)}
          {showDiscount && (
            <span className="absolute top-1.5 left-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-(--ds-danger) text-(--ds-text-invert) font-(--ds-fw-black) ds-num text-[8px]">15%</span>
          )}
        </span>
        <span className={`ds-clamp-2 leading-(--ds-lh-snug) text-(--ds-text) font-(--ds-fw-semibold) ${text.name}`}>Product name</span>
        <span className={`text-(--ds-amber) ${text.small}`}>★★★★★ <span className="text-(--ds-text-muted)">(24)</span></span>
        {on('showPrice', true) && (
          <span className="flex flex-wrap items-center gap-1">
            <span className={`ds-num font-(--ds-fw-black) text-(--ds-text) ${text.price}`}>
              <span className="text-(--primary)">৳</span>250
            </span>
            {showDiscount && <span className={`ds-num px-1 rounded-(--ds-r-full) bg-(--ds-success-soft) text-(--ds-success-text) font-(--ds-fw-bold) ${text.small}`}>Save ৳50</span>}
          </span>
        )}
        {(showAdd || showBuy) && (
          <span className={`mt-auto grid gap-1 ${showAdd && showBuy ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1'}`}>
            {showAdd && button('soft', showBuy ? null : add, ShoppingCart)}
            {showBuy && button('solid', buy, Zap)}
          </span>
        )}
      </span>
    );
  }

  if (design === 'editorial') {
    return (
      <span className="flex flex-col gap-1.5 h-full">
        {image('', true)}
        <span className={`uppercase tracking-[0.16em] text-(--ds-text-muted) ${text.small}`}>Brand</span>
        <span className={`ds-clamp-2 leading-[1.2] text-(--ds-text) font-(--ds-fw-medium) [font-family:var(--font-display)] ${large ? 'text-(length:--ds-fs-lg)' : 'text-(length:--ds-fs-xs)'}`}>Product name</span>
        {on('showPrice', true) && (
          <span className="flex items-baseline gap-1 pt-1 border-t border-(--ds-border-soft)">
            <span className={`ds-num font-(--ds-fw-semibold) text-(--ds-text) ${text.price}`}>৳250</span>
            {on('showOldPrice', true) && <span className={`ds-num line-through text-(--ds-text-faint) ${text.small}`}>৳300</span>}
          </span>
        )}
        {(showAdd || showBuy) && (
          <span className="mt-auto grid gap-1">
            {showAdd && button('soft', add, ShoppingCart, 'rounded-none uppercase tracking-[0.08em]')}
            {showBuy && button('solid', buy, Zap, 'rounded-none uppercase tracking-[0.08em]')}
          </span>
        )}
      </span>
    );
  }

  if (design === 'spotlight') {
    return (
      <span className="flex flex-col h-full rounded-[14px] overflow-hidden bg-(--ds-surface) ring-1 ring-(--ds-border-soft)">
        <span className="relative block">
          {image('', true)}
          <span className={`absolute bottom-1.5 left-1.5 px-1.5 rounded-(--ds-r-full) bg-(--ds-surface) font-(--ds-fw-bold) text-(--ds-text) ${text.small}`}>
            <span className="text-(--ds-amber)">★</span> 4.8
          </span>
        </span>
        <span className="flex flex-col flex-1 gap-1 p-1.5 bg-[linear-gradient(180deg,var(--ds-surface),color-mix(in_srgb,var(--primary)_6%,var(--ds-surface)))]">
          <span className={`ds-clamp-2 leading-(--ds-lh-snug) text-(--ds-text) font-(--ds-fw-bold) ${text.name}`}>Product name</span>
          {on('showPrice', true) && (
            <span className="flex flex-col">
              <span className={`ds-num font-(--ds-fw-black) text-(--ds-text) ${large ? 'text-(length:--ds-fs-xl)' : 'text-(length:--ds-fs-md)'}`}>
                <span className="text-(--primary)">৳</span>250
              </span>
              {showDiscount && <span className={`ds-num font-(--ds-fw-semibold) text-(--ds-success-text) ${text.small}`}>Save ৳50</span>}
            </span>
          )}
          {(showAdd || showBuy) && (
            <span className={`mt-auto grid gap-1 ${showAdd && showBuy ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1'}`}>
              {showBuy && button('solid', buy, Zap, 'rounded-(--ds-r-full)')}
              {showAdd && button('soft', showBuy ? null : add, ShoppingCart, 'rounded-(--ds-r-full)')}
            </span>
          )}
        </span>
      </span>
    );
  }

  if (design === 'compact') {
    return (
      <span className="flex flex-col h-full rounded-(--ds-r-md) overflow-hidden bg-(--ds-surface) border border-(--ds-border)">
        {image('', false)}
        <span className="flex flex-col flex-1 gap-1.5 p-1.5">
          {info('font-(--ds-fw-semibold)', 'font-(--ds-fw-black)', true)}
          {(showAdd || showBuy) && (
            <span className={`mt-auto grid gap-1 ${showAdd && showBuy ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1'}`}>
              {showAdd && button('soft', showBuy ? null : add, ShoppingCart)}
              {showBuy && button('solid', buy, Zap)}
            </span>
          )}
        </span>
      </span>
    );
  }

  return (
    <span className="flex flex-col h-full rounded-(--ds-r-lg) overflow-hidden bg-(--ds-surface) border border-(--ds-border) shadow-(--ds-shadow-xs)">
      {image('', true)}
      <span className="flex flex-col flex-1 gap-2 p-2">
        {info('font-(--ds-fw-semibold)', 'font-(--ds-fw-black)')}
        {(showAdd || showBuy) && (
          <span className="mt-auto grid gap-1">
            {showAdd && button('soft', add, ShoppingCart)}
            {showBuy && button('solid', buy, Zap)}
          </span>
        )}
      </span>
    </span>
  );
};

/* ---------------------------------------------------------------------------
 * Tab
 * ------------------------------------------------------------------------- */

export const AdminProductCardTab: React.FC<AdminProductCardTabProps> = ({ settings, onSave }) => {
  const toasts = useToasts();
  const [cardConfig, setCardConfig] = useState<CardConfig>(
    () =>
      (settings.product_card_config as CardConfig) || {
        cardStyle: 'classic',
        showAddToCart: true,
        showBuyNow: true,
        showWishlist: true,
        showPrice: true,
        showOldPrice: true,
        showDiscount: true,
        showCategory: false,
        showGenericName: false,
        showDescription: false,
        showStockText: false,
      }
  );
  // The button animation is its own setting, shared by the cards, the product
  // page and checkout.
  const [cta, setCta] = useState<CtaAnimationConfig>(() =>
    resolveCtaConfig((settings as SiteSettings & { cta_animation_config?: unknown }).cta_animation_config)
  );
  // v3.9 — the shape of product pictures (square, 400 × 600 portrait …)
  const [imageShape, setImageShape] = useState<ProductImageConfig>(() => ({
    ratio: '1:1',
    fit: 'cover',
    width: 400,
    height: 600,
    ...((settings as any).product_image_config || {}),
  }));
  // v3.15 — Add to Cart / Buy Now colours and text size
  const [ctaStyle, setCtaStyle] = useState<CtaStyleConfig>(() => ctaStyleOf(settings));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        ...settings,
        product_card_config: cardConfig,
        cta_animation_config: cta,
        product_image_config: imageShape,
        cta_button_style: ctaStyle,
      } as SiteSettings);
      toasts.push('Product card settings saved');
    } catch (e) {
      console.error(e);
      toasts.push('Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const is = (key: ToggleKey, fallback: boolean) => (cardConfig[key] as boolean | undefined) ?? fallback;
  const setLabel = (key: keyof CardConfig, value: string) => setCardConfig((prev) => ({ ...prev, [key]: value }));
  const setCtaField = <K extends keyof CtaAnimationConfig>(key: K, value: CtaAnimationConfig[K]) =>
    setCta((prev) => ({ ...prev, [key]: value }));

  const design: CardStyle = DESIGNS.some((d) => d.id === cardConfig.cardStyle)
    ? (cardConfig.cardStyle as CardStyle)
    : 'classic';
  const animation = { cta_animation_config: cta };
  // Remounting the previews restarts their animation, so a change is visible
  // at once instead of on the next cycle.
  const animationKey = JSON.stringify(cta);

  const cardAdd = cardConfig.addToCartLabel ?? DEFAULT_ADD;
  const cardBuy = cardConfig.buyNowLabel ?? DEFAULT_BUY;
  const pageAdd = cardConfig.productPageAddToCartLabel ?? DEFAULT_ADD;
  const pageBuy = cardConfig.productPageBuyNowLabel ?? DEFAULT_BUY;

  const labelInputs: Array<[keyof CardConfig, string, string]> = [
    ['addToCartLabel', 'Card: Add to Cart button', cardAdd],
    ['buyNowLabel', 'Card: Buy Now button', cardBuy],
    ['productPageAddToCartLabel', 'Product page: Add to Cart button', pageAdd],
    ['productPageBuyNowLabel', 'Product page: Buy Now button', pageBuy],
  ];

  const previewAdd = ctaAnimation(animation, 'addToCart');
  const previewBuy = ctaAnimation(animation, 'buyNow');
  const previewOrder = ctaAnimation(animation, 'placeOrder');

  const tileStyle = (selected: boolean): React.CSSProperties => ({
    borderRadius: 'var(--ds-r-lg)',
    background: selected ? tint(0.04) : 'var(--a-surface)',
    border: `1px solid ${selected ? 'var(--primary)' : 'var(--a-border)'}`,
    boxShadow: selected ? 'var(--ds-ring)' : undefined,
  });

  const selectedMark = (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded-(--ds-r-full)"
      style={{
        width: 'var(--ds-icon-md)',
        height: 'var(--ds-icon-md)',
        background: 'var(--primary)',
        color: 'var(--primary-foreground)',
      }}
    >
      <Check className="w-3 h-3" />
    </span>
  );

  const shapeCss = productImageCss(imageShape);
  const shapeVars = { '--product-ratio': shapeCss.ratio, '--product-fit': shapeCss.fit } as React.CSSProperties;
  const uploadHint = (() => {
    if (imageShape.ratio === 'custom') return `${imageShape.width || '?'} × ${imageShape.height || '?'} px`;
    const preset = PRODUCT_RATIOS.find((r) => r.id === (imageShape.ratio || '1:1')) || PRODUCT_RATIOS[0];
    return preset.size;
  })();

  // v3.15 — the previews follow the button colours being edited
  const tabRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    applyCtaStyle(ctaStyle, tabRef.current);
  }, [ctaStyle]);

  return (
    <div ref={tabRef} style={shapeVars}>
      {toasts.node}
      <PageHeader
        title="Product card"
        subtitle="Choose the card design, what it shows, the button text and the button animation"
        icon={SlidersHorizontal}
        actions={
          <Button variant="primary" icon={Save} onClick={handleSave} loading={saving}>
            Save settings
          </Button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5">
        <div className="space-y-5 min-w-0">
          <CtaStyleCard value={ctaStyle} onChange={setCtaStyle} />

          {/* ------------------------------------------------ card design */}
          <Card>
            <CardHeader
              title="Card design"
              subtitle="How every product card in the store looks. Previews update as you change the options below."
              icon={LayoutGrid}
            />
            <div role="radiogroup" aria-label="Card design" className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-3">
              {DESIGNS.map((option) => {
                const selected = option.id === design;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCardConfig((prev) => ({ ...prev, cardStyle: option.id }))}
                    className="flex flex-col text-left cursor-pointer min-w-0 transition-[border-color,box-shadow,background-color] duration-(--ds-dur-fast)"
                    style={{ ...tileStyle(selected), padding: 'var(--ds-s-2)' }}
                  >
                    <span
                      key={animationKey}
                      className="block flex-1"
                      style={{ padding: 'var(--ds-s-2)', borderRadius: 'var(--ds-r-md)', background: 'var(--ds-bg)' }}
                    >
                      <MockCard design={option.id} config={cardConfig} animation={animation} />
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-1 px-0.5">
                      <span className="font-bold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {option.label}
                      </span>
                      {selected && selectedMark}
                    </span>
                    <span className="px-0.5" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* ------------------------------------------------ picture shape */}
          <Card>
            <CardHeader
              title="Product image shape"
              subtitle="The shape of product pictures on every card and on the product page. Pick square, 400 × 600 portrait or your own size."
              icon={ImageIcon}
            />
            <div role="radiogroup" aria-label="Product image shape" className="grid grid-cols-3 md:grid-cols-6 gap-2.5">
              {PRODUCT_RATIOS.map((option) => {
                const selected = (imageShape.ratio || '1:1') === option.id;
                const preview = option.id === 'custom' ? productImageCss({ ...imageShape, ratio: 'custom' }).ratio : `${option.w} / ${option.h}`;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setImageShape((prev) => ({ ...prev, ratio: option.id as ProductRatio }))}
                    className="flex flex-col items-center text-center cursor-pointer min-w-0 transition-[border-color,box-shadow,background-color] duration-(--ds-dur-fast)"
                    style={{ ...tileStyle(selected), padding: 'var(--ds-s-2)' }}
                  >
                    <span className="flex items-end justify-center w-full" style={{ height: 64 }}>
                      <span
                        className="block"
                        style={{
                          aspectRatio: preview,
                          maxHeight: 60,
                          maxWidth: '80%',
                          height: '100%',
                          borderRadius: 6,
                          border: `2px solid ${selected ? 'var(--primary)' : 'var(--a-border-strong)'}`,
                          background: selected ? tint(0.12) : 'var(--a-surface-2)',
                        }}
                      />
                    </span>
                    <span className="mt-2 font-bold leading-tight" style={{ fontSize: 'var(--a-fs-sm)' }}>
                      {option.label}
                    </span>
                    <span className="leading-tight" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>
            {imageShape.ratio === 'custom' && (
              <div className="mt-4 grid grid-cols-2 gap-3 max-w-md">
                <Field label="Width (px)">
                  <input
                    className="a-field"
                    type="number"
                    min={50}
                    max={5000}
                    value={imageShape.width ?? ''}
                    onChange={(event) => setImageShape((prev) => ({ ...prev, width: Number(event.target.value) || undefined }))}
                  />
                </Field>
                <Field label="Height (px)">
                  <input
                    className="a-field"
                    type="number"
                    min={50}
                    max={5000}
                    value={imageShape.height ?? ''}
                    onChange={(event) => setImageShape((prev) => ({ ...prev, height: Number(event.target.value) || undefined }))}
                  />
                </Field>
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {(
                [
                  ['cover', 'Fill the frame', 'Pictures fill the whole frame; a picture of a different shape is trimmed at the edges.'],
                  ['contain', 'Show the whole picture', 'Nothing is ever cut; a picture of a different shape gets a little empty space.'],
                ] as const
              ).map(([value, label, text]) => {
                const selected = (imageShape.fit || 'cover') === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setImageShape((prev) => ({ ...prev, fit: value }))}
                    className="flex items-start gap-2 text-left cursor-pointer"
                    style={{ ...tileStyle(selected), padding: 'var(--ds-s-3)' }}
                  >
                    {selected ? selectedMark : <span className="shrink-0" style={{ width: 'var(--ds-icon-md)', height: 'var(--ds-icon-md)', borderRadius: 999, border: '2px solid var(--a-border-strong)' }} />}
                    <span>
                      <span className="block font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {label}
                      </span>
                      <span className="block" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                        {text}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
              Best upload size for this shape: <b style={{ color: 'var(--a-text)' }}>{uploadHint}</b> (or any size with the same shape).
            </p>
          </Card>

          {/* ------------------------------------------------ button animation */}
          <Card>
            <CardHeader
              title="Button animation"
              subtitle="A short burst of motion every few seconds that draws the eye. It pauses on hover."
              icon={Sparkles}
            />

            <div className="space-y-5">
              {CTA_TARGETS.map((target) => {
                const current = cta[target.key];
                const currentOption = CTA_ANIMATION_OPTIONS.find((o) => o.id === current);
                return (
                  <div key={target.key}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-2">
                      <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {target.label}
                        <span className="font-normal" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          {' '}
                          · {target.where}
                        </span>
                      </span>
                      <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                        {currentOption?.description}
                      </span>
                    </div>
                    <div
                      role="radiogroup"
                      aria-label={`${target.label} animation`}
                      className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                    >
                      {CTA_ANIMATION_OPTIONS.map((option) => {
                        const selected = option.id === current;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            title={option.description}
                            onClick={() => setCtaField(target.key, option.id as CtaAnimation)}
                            className="font-semibold cursor-pointer truncate transition-[border-color,background-color,color] duration-(--ds-dur-fast)"
                            style={{
                              height: 'var(--ds-h-md)',
                              padding: '0 var(--ds-s-3)',
                              fontSize: 'var(--a-fs-sm)',
                              borderRadius: 'var(--ds-r-md)',
                              border: `1px solid ${selected ? 'var(--primary)' : 'var(--a-border)'}`,
                              background: selected ? tint(0.1) : 'var(--a-surface)',
                              color: selected ? 'var(--primary-ink, var(--primary))' : 'var(--a-text-soft)',
                            }}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Repeat every" hint="Seconds between bursts">
                  <div className="flex items-center gap-3" style={{ height: 'var(--ds-h-md)' }}>
                    <input
                      type="range"
                      min={1.5}
                      max={10}
                      step={0.1}
                      value={cta.interval}
                      onChange={(e) => setCtaField('interval', Number(e.target.value))}
                      aria-label="Seconds between bursts"
                      className="flex-1 min-w-0 cursor-pointer"
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span
                      className="ds-num font-bold shrink-0 text-right"
                      style={{ fontSize: 'var(--a-fs-md)', minWidth: 'var(--ds-s-10)' }}
                    >
                      {cta.interval.toFixed(1)}s
                    </span>
                  </div>
                </Field>

                <Field label="Intensity">
                  <div
                    role="radiogroup"
                    aria-label="Intensity"
                    className="grid grid-cols-3 gap-1"
                    style={{
                      padding: 'var(--ds-s-1)',
                      borderRadius: 'var(--ds-r-md)',
                      background: 'var(--a-surface-3)',
                    }}
                  >
                    {INTENSITIES.map((option) => {
                      const selected = option.id === cta.intensity;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setCtaField('intensity', option.id)}
                          className="font-semibold cursor-pointer transition-[background-color,color,box-shadow] duration-(--ds-dur-fast)"
                          style={{
                            height: 'calc(var(--ds-h-md) - var(--ds-s-2))',
                            fontSize: 'var(--a-fs-sm)',
                            borderRadius: 'var(--ds-r-sm)',
                            background: selected ? 'var(--a-surface)' : 'transparent',
                            color: selected ? 'var(--a-text)' : 'var(--a-text-muted)',
                            boxShadow: selected ? 'var(--ds-shadow-sm)' : undefined,
                          }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>

              <div
                style={{
                  padding: 'var(--ds-s-4)',
                  borderRadius: 'var(--ds-r-md)',
                  background: 'var(--a-surface-2)',
                  border: '1px dashed var(--a-border-strong)',
                }}
              >
                <span className="a-label flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Live preview
                </span>
                <div key={animationKey} aria-hidden className="flex flex-wrap items-center gap-3">
                  <span className={`ds-btn ds-btn-soft ${previewAdd.className}`} style={previewAdd.style}>
                    <ShoppingCart className="w-4 h-4" />
                    {cardAdd || DEFAULT_ADD}
                  </span>
                  <span className={`ds-btn ds-btn-primary ${previewBuy.className}`} style={previewBuy.style}>
                    <Zap className="w-4 h-4" />
                    {cardBuy || DEFAULT_BUY}
                  </span>
                  <span className={`ds-btn ds-btn-primary ds-btn-lg ${previewOrder.className}`} style={previewOrder.style}>
                    <Lock className="w-4 h-4" />
                    {settings.checkout_config?.submitLabel || 'Confirm order'}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* ------------------------------------------------ captions */}
          <Card>
            <CardHeader
              title="Button text"
              subtitle="What shoppers read — set separately for the card and the product page"
              icon={TypeIcon}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {labelInputs.map(([key, name, value]) => (
                <Field key={key} label={name}>
                  <input
                    className="a-field"
                    value={value}
                    onChange={(e) => setLabel(key, e.target.value)}
                    placeholder={key.toLowerCase().includes('buy') ? DEFAULT_BUY : DEFAULT_ADD}
                  />
                </Field>
              ))}
            </div>
          </Card>

          {/* ------------------------------------------------ what shows */}
          <Card>
            <CardHeader title="What the card shows" icon={SlidersHorizontal} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {TOGGLES.map((t) => (
                <div
                  key={t.key}
                  style={{
                    padding: 'var(--ds-s-3)',
                    borderRadius: 'var(--ds-r-md)',
                    background: t.fallback ? 'var(--a-surface-2)' : 'var(--ds-warning-soft)',
                    border: '1px solid var(--a-border)',
                  }}
                >
                  <Toggle
                    checked={is(t.key, t.fallback)}
                    onChange={(value) => setCardConfig((prev) => ({ ...prev, [t.key]: value }))}
                    label={t.label}
                    description={t.description}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ------------------------------------------------------- preview */}
        <div className="min-w-0">
          <div className="xl:sticky xl:top-4 space-y-4">
            <Card>
              <span className="a-label flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Product card · {DESIGNS.find((d) => d.id === design)?.label}
              </span>
              <div
                className="flex justify-center"
                style={{ padding: 'var(--ds-s-4)', borderRadius: 'var(--ds-r-md)', background: 'var(--ds-bg)' }}
              >
                <div key={animationKey} className="w-full" style={{ maxWidth: 'calc(var(--ds-s-16) * 3.5)' }}>
                  <MockCard design={design} config={cardConfig} animation={animation} large />
                </div>
              </div>
            </Card>

            <Card>
              <span className="a-label">Product page</span>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                    Quantity
                  </span>
                  <span
                    className="inline-flex items-center"
                    style={{ border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-r-sm)' }}
                  >
                    <span
                      className="inline-flex items-center justify-center"
                      style={{ width: 'var(--ds-h-sm)', height: 'var(--ds-h-sm)' }}
                    >
                      <Minus className="w-3 h-3" />
                    </span>
                    <span className="ds-num font-bold px-2" style={{ fontSize: 'var(--a-fs-md)' }}>
                      1
                    </span>
                    <span
                      className="inline-flex items-center justify-center"
                      style={{ width: 'var(--ds-h-sm)', height: 'var(--ds-h-sm)' }}
                    >
                      <Plus className="w-3 h-3" />
                    </span>
                  </span>
                </div>
                <div key={animationKey} className="grid grid-cols-2 gap-2">
                  <span
                    className={`ds-btn ds-btn-soft min-w-0 px-2 ${previewAdd.className}`}
                    style={{ height: 'var(--ds-h-lg)', ...previewAdd.style }}
                  >
                    <ShoppingCart className="w-4 h-4 shrink-0" />
                    <span className="truncate">{pageAdd || DEFAULT_ADD}</span>
                  </span>
                  <span
                    className={`ds-btn ds-btn-primary min-w-0 px-2 ${previewBuy.className}`}
                    style={{ height: 'var(--ds-h-lg)', ...previewBuy.style }}
                  >
                    <Zap className="w-4 h-4 shrink-0" />
                    <span className="truncate">{pageBuy || DEFAULT_BUY}</span>
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
