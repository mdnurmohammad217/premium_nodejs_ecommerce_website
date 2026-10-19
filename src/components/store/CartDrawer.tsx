import { wholesaleQuantityProblems } from '../../lib/wholesale.ts';
import { FreeDeliveryProgress } from './FreeDeliveryProgress.tsx';
import type { SiteSettings } from '../../types/index.ts';
import React, { useEffect, useState } from 'react';
import { responsiveImg, sized } from '../../lib/img.ts';
import { X, Trash2, Plus, Minus, ArrowRight, Tag, ShoppingBag, Check } from 'lucide-react';
import { useCart } from '../../context/CartContext.tsx';
import { IMAGE_PLACEHOLDER } from '../../lib/placeholder.ts';

interface CartDrawerProps {
  onCheckout: () => void;
  onContinueShopping: () => void;
  settings?: SiteSettings;
}

/** The cart context may carry a variation per line; read it without depending on its type. */
const variationLabelOf = (item: any): string => String(item?.variationLabel || '');
const lineKeyOf = (item: any) => `${item.product.id}:${item?.variationId ?? ''}`;
const money = (value: number) => `৳${value.toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;

export const CartDrawer: React.FC<CartDrawerProps> = ({ onCheckout, onContinueShopping, settings }) => {
  const {
    items,
    updateQuantity,
    removeFromCart,
    subtotal,
    isCartDrawerOpen,
    setIsCartDrawerOpen,
    appliedCoupon,
    couponDiscount,
    applyCouponCode,
    removeCoupon,
  } = useCart();

  const [couponInput, setCouponInput] = useState('');
  const [couponMsg, setCouponMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  // Escape closes the drawer, and the page behind it stops scrolling while open
  useEffect(() => {
    if (!isCartDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsCartDrawerOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isCartDrawerOpen, setIsCartDrawerOpen]);

  if (!isCartDrawerOpen) return null;

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;

    setIsValidatingCoupon(true);
    setCouponMsg(null);
    const result = await applyCouponCode(couponInput.trim());
    setIsValidatingCoupon(false);

    if (result.success) {
      setCouponMsg({ text: result.message || 'Coupon applied.', isError: false });
      setCouponInput('');
    } else {
      setCouponMsg({ text: result.message || "This coupon code isn't valid.", isError: true });
    }
  };

  const grandTotal = Math.max(0, subtotal - couponDiscount);
  const wholesaleProblems = wholesaleQuantityProblems(items);

  const close = () => setIsCartDrawerOpen(false);

  return (
    <div className="fixed inset-0 z-(--ds-z-modal)" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title">
      <div onClick={close} className="absolute inset-0 bg-(--ds-overlay) ds-fade-in" />

      <div className="absolute inset-y-0 right-0 w-full max-w-md flex flex-col bg-(--ds-surface) shadow-(--ds-shadow-xl) ds-slide-right">
        {/* Header */}
        <div className="px-(--ds-s-4) h-14 shrink-0 border-b border-(--ds-border) flex items-center justify-between gap-(--ds-s-3)">
          <div className="flex items-center gap-(--ds-s-2) min-w-0">
            <ShoppingBag className="w-5 h-5 text-(--primary) shrink-0" />
            <h2 id="cart-drawer-title" className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">
              Your Cart
            </h2>
            {items.length > 0 && <span className="ds-badge ds-badge-neutral ds-num">{items.length} {items.length === 1 ? 'item' : 'items'}</span>}
          </div>
          <button onClick={close} aria-label="Close cart" className="ds-btn ds-btn-ghost ds-btn-icon">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lines */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-(--ds-s-6) py-(--ds-s-12)">
              <span className="w-16 h-16 rounded-(--ds-r-xl) bg-(--ds-surface-3) text-(--ds-text-faint) inline-flex items-center justify-center">
                <ShoppingBag className="w-7 h-7" />
              </span>
              <h3 className="mt-(--ds-s-4) text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">
                Your cart is empty
              </h3>
              <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-muted) max-w-xs leading-(--ds-lh-bn)">
                Add products you like to your cart and you can check out right from here.
              </p>
              <button
                onClick={() => {
                  close();
                  onContinueShopping();
                }}
                className="ds-btn ds-btn-primary mt-(--ds-s-5)"
              >
                Start Shopping
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-(--ds-border-soft)">
              {items.map((item) => {
                const { product, quantity } = item;
                const unit = Number(product.salePrice) > 0 ? Number(product.salePrice) : Number(product.price);
                const variation = variationLabelOf(item);
                return (
                  <li key={lineKeyOf(item)} className="flex gap-(--ds-s-3) px-(--ds-s-4) py-(--ds-s-4)">
                    <img
                      src={product.image ? sized(product.image, 160) : IMAGE_PLACEHOLDER}
                      alt={product.name}
                      loading="lazy"
                      onError={(event) => {
                        const img = event.currentTarget;
                        img.onerror = null;
                        img.src = IMAGE_PLACEHOLDER;
                      }}
                      className="w-16 h-16 object-cover rounded-(--ds-r-md) bg-(--ds-surface-2) border border-(--ds-border-soft) shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-(--ds-s-2)">
                        <div className="min-w-0">
                          <h4 className="text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text) leading-(--ds-lh-snug) ds-clamp-2">
                            {product.name}
                          </h4>
                          {variation ? (
                            <p className="text-(length:--ds-fs-xs) text-(--ds-text-muted) mt-0.5">{variation}</p>
                          ) : (
                            product.genericName && (
                              <p className="text-(length:--ds-fs-xs) text-(--ds-text-muted) mt-0.5 truncate">
                                {product.genericName}
                              </p>
                            )
                          )}
                        </div>
                        <button
                          onClick={() => removeFromCart(product.id, (item as any).variationId)}
                          aria-label={`Remove ${product.name}`}
                          title="Remove"
                          className="ds-btn ds-btn-ghost ds-btn-icon ds-btn-sm shrink-0 hover:text-(--ds-danger)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-(--ds-s-2) mt-(--ds-s-2)">
                        <div className="inline-flex items-center rounded-(--ds-r-md) border border-(--ds-border-strong)">
                          <button
                            onClick={() => updateQuantity(product.id, quantity - 1, (item as any).variationId)}
                            aria-label="Decrease quantity"
                            className="w-(--ds-h-sm) h-(--ds-h-sm) inline-flex items-center justify-center text-(--ds-text-soft) hover:bg-(--ds-surface-3) rounded-l-(--ds-r-md) cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-8 text-center text-(length:--ds-fs-base) font-(--ds-fw-bold) ds-num">
                            {quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(product.id, quantity + 1, (item as any).variationId)}
                            aria-label="Increase quantity"
                            className="w-(--ds-h-sm) h-(--ds-h-sm) inline-flex items-center justify-center text-(--ds-text-soft) hover:bg-(--ds-surface-3) rounded-r-(--ds-r-md) cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-right">
                          <span className="block text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text) ds-num">
                            {money(unit * quantity)}
                          </span>
                          <span className="block text-(length:--ds-fs-2xs) text-(--ds-text-faint) ds-num">
                            {money(unit)}
                            {product.unit ? ` / ${product.unit}` : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="shrink-0 border-t border-(--ds-border) bg-(--ds-surface-2) p-(--ds-s-4) space-y-(--ds-s-3)">
            <form onSubmit={handleApplyCoupon}>
              {appliedCoupon ? (
                <div className="flex items-center justify-between gap-(--ds-s-2) rounded-(--ds-r-md) bg-(--ds-success-soft) text-(--ds-success-text) px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm)">
                  <span className="flex items-center gap-(--ds-s-2) min-w-0">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      Coupon <strong className="font-(--ds-fw-bold)">{appliedCoupon.code}</strong> applied{' '}
                      <span className="ds-num">(−{money(couponDiscount)})</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      removeCoupon();
                      setCouponMsg(null);
                    }}
                    className="font-(--ds-fw-semibold) hover:underline cursor-pointer shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-(--ds-s-2)">
                  <div className="relative flex-1 min-w-0">
                    <Tag className="w-3.5 h-3.5 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Coupon code"
                      aria-label="Coupon code"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      className="ds-input pl-8 uppercase placeholder:normal-case"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isValidatingCoupon || !couponInput.trim()}
                    className="ds-btn ds-btn-secondary shrink-0"
                  >
                    {isValidatingCoupon ? <span className="ds-spinner" /> : 'Apply'}
                  </button>
                </div>
              )}

              {couponMsg && (
                <p
                  className={`mt-(--ds-s-2) text-(length:--ds-fs-xs) font-(--ds-fw-medium) ${
                    couponMsg.isError ? 'text-(--ds-danger-text)' : 'text-(--ds-success-text)'
                  }`}
                >
                  {couponMsg.text}
                </p>
              )}
            </form>

            <FreeDeliveryProgress settings={settings} items={items} subtotal={subtotal} className="mb-(--ds-s-3)" />
            <dl className="space-y-(--ds-s-1) text-(length:--ds-fs-base)">
              <div className="flex justify-between gap-(--ds-s-3) text-(--ds-text-soft)">
                <dt>Subtotal</dt>
                <dd className="font-(--ds-fw-semibold) text-(--ds-text) ds-num">{money(subtotal)}</dd>
              </div>
              {couponDiscount > 0 && (
                <div className="flex justify-between gap-(--ds-s-3) text-(--ds-success-text)">
                  <dt>Discount</dt>
                  <dd className="font-(--ds-fw-semibold) ds-num">−{money(couponDiscount)}</dd>
                </div>
              )}
              {settings?.checkout_config?.deliveryEnabled === false ? (
                settings?.checkout_config?.deliveryOffNote ? (
                  <div className="flex justify-between gap-(--ds-s-3) text-(length:--ds-fs-sm) text-(--ds-text-muted)">
                    <dt>Delivery</dt>
                    <dd className="text-right">{settings.checkout_config.deliveryOffNote}</dd>
                  </div>
                ) : null
              ) : (
                <div className="flex justify-between gap-(--ds-s-3) text-(length:--ds-fs-sm) text-(--ds-text-muted)">
                  <dt>Delivery Charge</dt>
                  <dd>Calculated at checkout</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-(--ds-s-3) pt-(--ds-s-2) mt-(--ds-s-1) border-t border-(--ds-border)">
                <dt className="font-(--ds-fw-bold) text-(--ds-text)">Total</dt>
                <dd className="text-(length:--ds-fs-xl) font-(--ds-fw-black) text-(--primary) ds-num">{money(grandTotal)}</dd>
              </div>
            </dl>

{wholesaleProblems.length > 0 && (
              <div role="alert" className="rounded-(--ds-r-md) bg-(--ds-warning-soft) text-(--ds-warning-text) px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm) font-(--ds-fw-medium) space-y-0.5">
                {wholesaleProblems.map((problem) => (
                  <p key={problem}>{problem}</p>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                close();
                onCheckout();
              }}
              disabled={wholesaleProblems.length > 0}
              className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                close();
                onContinueShopping();
              }}
              className="ds-btn ds-btn-ghost ds-btn-sm ds-btn-block"
            >
              View Full Cart
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
