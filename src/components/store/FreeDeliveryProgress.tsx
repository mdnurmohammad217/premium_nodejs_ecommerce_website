import { useT } from '../../lib/i18n.tsx';
import React from 'react';
import { Gift, PartyPopper } from 'lucide-react';
import { SiteSettings } from '../../types/index.ts';

/**
 * "Add ৳X more for free delivery" in the cart. The checkout shows the exact
 * charge per delivery area; here only the store-wide offer is summarised.
 */
export const FreeDeliveryProgress: React.FC<{
  settings?: SiteSettings;
  items: Array<{ quantity: number; product: any }>;
  subtotal: number;
  className?: string;
}> = ({ settings, items, subtotal, className = '' }) => {
  const t = useT();
  const rules = settings?.free_shipping_config;
  // v3.11 — delivery switched off at checkout: there is no charge to waive
  if (settings?.checkout_config?.deliveryEnabled === false) return null;
  if (!rules?.enabled || rules.showProgress === false || items.length === 0) return null;
  if (rules.excludeWholesale !== false && items.some((item) => item.product?.isWholesale)) return null;
  // Every product already ships free: nothing to chase
  if (items.every((item) => item.product?.freeShipping)) return null;

  const currency = settings?.general?.currency || '৳';
  const minSubtotal = Number(rules.minSubtotal) || 0;
  const minQuantity = Number(rules.minQuantity) || 0;
  if (!minSubtotal && !minQuantity) return null;
  const quantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const moneyLeft = minSubtotal ? Math.max(0, minSubtotal - subtotal) : Infinity;
  const itemsLeft = minQuantity ? Math.max(0, minQuantity - quantity) : Infinity;
  const reached = moneyLeft === 0 || itemsLeft === 0;
  const areas = rules.zones && rules.zones.length > 0;
  const progress = minSubtotal
    ? Math.min(100, Math.round((subtotal / minSubtotal) * 100))
    : Math.min(100, Math.round((quantity / minQuantity) * 100));
  const money = (value: number) => `${currency}${Math.ceil(value).toLocaleString('en-BD')}`;

  return (
    <div className={`rounded-(--ds-r-md) bg-(--ds-success-soft) text-(--ds-success-text) p-(--ds-s-3) space-y-(--ds-s-2) ${className}`}>
      <p className="flex items-start gap-(--ds-s-2) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) leading-(--ds-lh-snug)">
        {reached ? <PartyPopper className="w-4 h-4 shrink-0 mt-0.5" /> : <Gift className="w-4 h-4 shrink-0 mt-0.5" />}
        <span>
          {reached
            ? areas
              ? t('You get free delivery in eligible areas!')
              : t('You get free delivery!')
            : moneyLeft !== Infinity && itemsLeft !== Infinity
            ? t('Add {amount} more or {n} more item(s) for free delivery!', { amount: money(moneyLeft), n: itemsLeft })
            : moneyLeft !== Infinity
            ? t('Add {amount} more for free delivery!', { amount: money(moneyLeft) })
            : t('Add {n} more item(s) for free delivery!', { n: itemsLeft })}
        </span>
      </p>
      <span className="block h-1.5 rounded-(--ds-r-full) bg-[color-mix(in_srgb,var(--ds-success)_20%,transparent)] overflow-hidden">
        <span className="block h-full rounded-(--ds-r-full) bg-(--ds-success) transition-[width] duration-(--ds-dur)" style={{ width: `${reached ? 100 : progress}%` }} />
      </span>
    </div>
  );
};
