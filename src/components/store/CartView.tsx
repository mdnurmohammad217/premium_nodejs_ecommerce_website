import { useT } from '../../lib/i18n.tsx';
import { wholesaleQuantityProblems } from '../../lib/wholesale.ts';
import { FreeDeliveryProgress } from './FreeDeliveryProgress.tsx';
import React, { useState } from 'react';
import { responsiveImg, sized } from '../../lib/img.ts';
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, ArrowLeft, ShieldCheck, Truck } from 'lucide-react';
import { useCart } from '../../context/CartContext.tsx';
import { SiteSettings } from '../../types/index.ts';
import { IMAGE_PLACEHOLDER } from '../../lib/placeholder.ts';
import { StoreConfirm } from './StoreConfirm.tsx';

interface CartViewProps {
  settings?: SiteSettings;
  onNavigate: (view: string, params?: any) => void;
}

/** The cart context may carry a variation per line; read it without depending on its type. */
const variationLabelOf = (item: any): string => String(item?.variationLabel || '');
const lineKeyOf = (item: any) => `${item.product.id}:${item?.variationId ?? ''}`;

/**
 * Full cart page (`/cart`). The drawer is for a quick glance; this is the page
 * customers land on from the cart icon or a shared link, with room to review
 * quantities, line totals and the order summary before checkout.
 */
export const CartView: React.FC<CartViewProps> = ({ settings, onNavigate }) => {
  const t = useT();
  const { items, subtotal, couponDiscount, appliedCoupon, updateQuantity, removeFromCart, clearCart } =
    useCart();
  const [confirmClear, setConfirmClear] = useState(false);

  const currency = settings?.general?.currency || '৳';
  const money = (value: number) => `${currency}${value.toLocaleString('en-BD')}`;
  const zones = settings?.shipping?.zones || [];
  // v3.11 — Dashboard → Checkout Page → Delivery switched off
  const deliveryOff = settings?.checkout_config?.deliveryEnabled === false;
  const deliveryOffNote = String(settings?.checkout_config?.deliveryOffNote || '').trim();
  const cheapestZone = zones.length
    ? zones.reduce((min: any, zone: any) => (Number(zone.charge) < Number(min.charge) ? zone : min))
    : null;

  const total = Math.max(0, subtotal - couponDiscount);
  const wholesaleProblems = wholesaleQuantityProblems(items);

  const unitCount = items.reduce((sum, item) => sum + item.quantity, 0);

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto px-(--ds-s-4) py-(--ds-s-16) text-center ds-fade-in">
        <span className="mx-auto w-16 h-16 rounded-(--ds-r-xl) inline-flex items-center justify-center bg-(--ds-surface-3) text-(--ds-text-faint)">
          <ShoppingBag className="w-7 h-7" />
        </span>
        <h1 className="mt-(--ds-s-4) text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text)">
          Your cart is empty
        </h1>
        <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-muted) leading-(--ds-lh-bn)">
          Add products you like to your cart, then complete your order from here.
        </p>
        <button onClick={() => onNavigate('shop')} className="ds-btn ds-btn-primary mt-(--ds-s-5)">
          Browse Products
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-(--ds-s-4) py-(--ds-s-6) sm:py-(--ds-s-8)">
      <button
        onClick={() => onNavigate('shop')}
        className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text-muted) hover:text-(--ds-text) transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Continue Shopping</span>
      </button>

      <div className="mt-(--ds-s-2) mb-(--ds-s-5) flex items-end justify-between gap-(--ds-s-3)">
        <div>
          <h1 className="text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">My Cart</h1>
          <p className="text-(length:--ds-fs-sm) text-(--ds-text-muted) mt-0.5 ds-num">{items.length} {items.length === 1 ? 'item' : 'items'}</p>
        </div>
        <button
          onClick={() => setConfirmClear(true)}
          className="ds-btn ds-btn-ghost ds-btn-sm hover:text-(--ds-danger-text)"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Remove All</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-(--ds-s-6) items-start">
        {/* Lines */}
        <ul className="ds-card divide-y divide-(--ds-border-soft) min-w-0">
          {items.map((item) => {
            const { product, quantity } = item;
            const unit = Number(product.salePrice) > 0 ? Number(product.salePrice) : Number(product.price);
            const old = product.salePrice && Number(product.salePrice) > 0 ? Number(product.price) : null;
            const maxQty = Math.max(1, product.stock ?? quantity);
            const variation = variationLabelOf(item);

            return (
              <li key={lineKeyOf(item)} className="p-(--ds-s-3) sm:p-(--ds-s-4) flex gap-(--ds-s-3) sm:gap-(--ds-s-4)">
                <button
                  onClick={() => onNavigate('product', { slug: product.slug, product })}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-(--ds-r-md) overflow-hidden bg-(--ds-surface-2) border border-(--ds-border-soft) shrink-0 cursor-pointer"
                  aria-label={product.name}
                >
                  <img
                    src={product.image ? sized(product.image, 200) : IMAGE_PLACEHOLDER}
                    alt={product.name}
                    loading="lazy"
                    onError={(event) => {
                      const img = event.currentTarget;
                      img.onerror = null;
                      img.src = IMAGE_PLACEHOLDER;
                    }}
                    className="w-full h-full object-cover"
                  />
                </button>

                <div className="min-w-0 flex-1 flex flex-col justify-between gap-(--ds-s-2)">
                  <div className="flex items-start justify-between gap-(--ds-s-2)">
                    <button
                      onClick={() => onNavigate('product', { slug: product.slug, product })}
                      className="text-left min-w-0 cursor-pointer group"
                    >
                      <span className="block text-(length:--ds-fs-md) font-(--ds-fw-semibold) text-(--ds-text) leading-(--ds-lh-snug) ds-clamp-2 group-hover:text-(--primary)">
                        {product.name}
                      </span>
                      {variation && (
                        <span className="block text-(length:--ds-fs-sm) text-(--ds-text-muted) mt-0.5">{variation}</span>
                      )}
                      <span className="block text-(length:--ds-fs-sm) text-(--ds-text-soft) mt-0.5 ds-num">
                        {money(unit)}
                        {old && old > unit && (
                          <span className="line-through ml-(--ds-s-2) text-(--ds-text-muted)">{money(old)}</span>
                        )}
                      </span>
                    </button>

                    <button
                      onClick={() => removeFromCart(product.id, (item as any).variationId)}
                      aria-label="Remove"
                      title="Remove"
                      className="ds-btn ds-btn-ghost ds-btn-icon ds-btn-sm shrink-0 hover:text-(--ds-danger)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-(--ds-s-3)">
                    <div className="inline-flex items-center rounded-(--ds-r-md) border border-(--ds-border-strong) bg-(--ds-surface)">
                      <button
                        onClick={() => updateQuantity(product.id, quantity - 1, (item as any).variationId)}
                        aria-label="Decrease quantity"
                        className="w-(--ds-h-sm) h-(--ds-h-sm) inline-flex items-center justify-center text-(--ds-text-soft) hover:bg-(--ds-surface-3) rounded-l-(--ds-r-md) cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-9 text-center text-(length:--ds-fs-base) font-(--ds-fw-bold) ds-num">{quantity}</span>
                      <button
                        onClick={() => updateQuantity(product.id, Math.min(maxQty, quantity + 1), (item as any).variationId)}
                        disabled={quantity >= maxQty}
                        aria-label="Increase quantity"
                        className="w-(--ds-h-sm) h-(--ds-h-sm) inline-flex items-center justify-center text-(--ds-text-soft) hover:bg-(--ds-surface-3) rounded-r-(--ds-r-md) cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <span className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text) ds-num">
                      {money(unit * quantity)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Summary */}
        <aside className="lg:sticky lg:top-(--ds-s-6) ds-card p-(--ds-card-pad)">
          <h2 className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text) pb-(--ds-s-4) mb-(--ds-s-4) border-b border-(--ds-border-soft)">
            Order Summary
          </h2>

          <FreeDeliveryProgress settings={settings} items={items} subtotal={subtotal} className="mb-(--ds-s-4)" />
          <dl className="space-y-(--ds-s-2) text-(length:--ds-fs-base)">
            <div className="flex justify-between gap-(--ds-s-3) text-(--ds-text-soft)">
              <dt>
                Subtotal <span className="ds-num">({unitCount})</span>
              </dt>
              <dd className="font-(--ds-fw-semibold) text-(--ds-text) ds-num">{money(subtotal)}</dd>
            </div>

            {couponDiscount > 0 && (
              <div className="flex justify-between gap-(--ds-s-3) text-(--ds-success-text)">
                <dt>Discount{appliedCoupon?.code ? ` (${appliedCoupon.code})` : ''}</dt>
                <dd className="font-(--ds-fw-semibold) ds-num">−{money(couponDiscount)}</dd>
              </div>
            )}

            {!deliveryOff && (
              <div className="flex justify-between gap-(--ds-s-3) text-(--ds-text-soft)">
                <dt>Delivery Charge</dt>
                <dd className="text-(length:--ds-fs-sm) text-right ds-num">
                  {cheapestZone
                    ? t('From {amount}', { amount: money(Number(cheapestZone.charge || 0)) })
                    : 'Calculated at checkout'}
                </dd>
              </div>
            )}
          </dl>

          <div className="flex items-baseline justify-between gap-(--ds-s-3) mt-(--ds-s-4) pt-(--ds-s-4) border-t border-(--ds-border-soft)">
            <span className="text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text)">Total</span>
            <span className="text-(length:--ds-fs-2xl) font-(--ds-fw-black) text-(--primary) ds-num">{money(total)}</span>
          </div>

          {deliveryOff ? (
            deliveryOffNote && <p className="mt-(--ds-s-1) text-(length:--ds-fs-xs) text-(--ds-text-muted)">{deliveryOffNote}</p>
          ) : (
            <p className="mt-(--ds-s-1) text-(length:--ds-fs-xs) text-(--ds-text-muted)">
              Delivery charge is added at checkout based on your area.
            </p>
          )}

          <div className="mt-(--ds-s-4)">
            {wholesaleProblems.length > 0 && (
              <div role="alert" className="rounded-(--ds-r-md) bg-(--ds-warning-soft) text-(--ds-warning-text) px-(--ds-s-3) py-(--ds-s-2) text-(length:--ds-fs-sm) font-(--ds-fw-medium) space-y-0.5">
                {wholesaleProblems.map((problem) => (
                  <p key={problem}>{problem}</p>
                ))}
              </div>
            )}
            </div>
          <button
            onClick={() => onNavigate('checkout')}
            disabled={wholesaleProblems.length > 0}
            className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block mt-(--ds-s-3)"
          >
            <span>Proceed to Checkout</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="grid grid-cols-2 gap-(--ds-s-2) mt-(--ds-s-4)">
            <div className="px-(--ds-s-3) py-(--ds-s-2) rounded-(--ds-r-md) bg-(--ds-surface-2) flex items-center gap-(--ds-s-2)">
              <ShieldCheck className="w-4 h-4 shrink-0 text-(--primary)" />
              <span className="text-(length:--ds-fs-xs) font-(--ds-fw-semibold) text-(--ds-text-soft)">Secure Payment</span>
            </div>
            <div className="px-(--ds-s-3) py-(--ds-s-2) rounded-(--ds-r-md) bg-(--ds-surface-2) flex items-center gap-(--ds-s-2)">
              <Truck className="w-4 h-4 shrink-0 text-(--primary)" />
              <span className="text-(length:--ds-fs-xs) font-(--ds-fw-semibold) text-(--ds-text-soft)">Fast Delivery</span>
            </div>
          </div>
        </aside>
      </div>

      <StoreConfirm
        open={confirmClear}
        title="Remove all products?"
        message={t('All {n} item(s) will be taken out of your cart.', { n: items.length })}
        confirmLabel="Remove All"
        onConfirm={() => {
          setConfirmClear(false);
          clearCart();
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
};
