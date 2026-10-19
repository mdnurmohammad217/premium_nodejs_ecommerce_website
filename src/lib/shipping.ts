/**
 * Delivery charge rules — ONE implementation used by both the server (which
 * decides what the customer is billed) and the checkout page (which only
 * displays it). The server never trusts a charge sent by the browser.
 *
 * Order of rules:
 *   1. A landing page can set its own charges or make delivery free.
 *   2. Products marked "free delivery" cost nothing to ship; if every product
 *      in the order is like that, the delivery is free.
 *   3. A product can have its own charge per zone (heavy/bulky items). When
 *      products with different charges are in one order, the highest single
 *      charge applies — it is one parcel.
 *   4. Store-wide free delivery: order total at least X, and/or at least N
 *      items, optionally only for some zones.
 */

export interface ShippingZoneLike {
  id: string;
  name: string;
  charge: number;
  eta?: string;
  enabled?: boolean;
}

export interface FreeShippingRules {
  enabled?: boolean;
  /** Free when the products total (after nothing else) reaches this amount */
  minSubtotal?: number | null;
  /** Free when the order has at least this many items */
  minQuantity?: number | null;
  /** Zone ids where these rules apply; empty = every zone */
  zones?: string[];
  /** Wholesale orders pay delivery even when the rule matches */
  excludeWholesale?: boolean;
  /** Show "add ৳X more for free delivery" in the cart and checkout */
  showProgress?: boolean;
}

export interface LandingShipping {
  /** 'store' = the shop's normal charges and rules, 'custom' = charges below, 'free' = always free */
  mode?: 'store' | 'custom' | 'free';
  charges?: Record<string, number | string | null>;
  freeMinQuantity?: number | null;
  freeMinSubtotal?: number | null;
}

export interface ShippingLine {
  quantity: number;
  /** Price × quantity for this line */
  lineTotal: number;
  freeShipping?: boolean;
  /** Own delivery charge per zone id; missing zones use the zone charge */
  charges?: Record<string, number | string | null> | null;
}

export interface ShippingResult {
  charge: number;
  /** What the delivery would cost without any free-delivery rule */
  baseCharge: number;
  free: boolean;
  reason: '' | 'landing' | 'products' | 'subtotal' | 'quantity';
  /** Money still missing for store-wide free delivery (0 when not applicable) */
  remainingForFree: number;
  /** Items still missing for store-wide free delivery (0 when not applicable) */
  remainingItemsForFree: number;
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

/** Reads the per-product JSON column safely */
export function parseCharges(raw: unknown): Record<string, number> | null {
  if (!raw) return null;
  let value: any = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [zone, charge] of Object.entries(value)) {
    const parsed = num(charge);
    if (parsed !== null) out[String(zone)] = parsed;
  }
  return Object.keys(out).length ? out : null;
}

export function computeShipping(input: {
  zone: ShippingZoneLike | null | undefined;
  lines: ShippingLine[];
  rules?: FreeShippingRules | null;
  landing?: LandingShipping | null;
  wholesale?: boolean;
}): ShippingResult {
  const { zone, lines } = input;
  const rules = input.rules || {};
  const landing = input.landing && input.landing.mode && input.landing.mode !== 'store' ? input.landing : null;
  const subtotal = lines.reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0);
  const quantity = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const zoneId = zone?.id || '';
  let zoneCharge = num(zone?.charge) ?? 0;

  const result = (charge: number, baseCharge: number, reason: ShippingResult['reason'], remaining = 0, remainingItems = 0): ShippingResult => ({
    charge: Math.max(0, Math.round(charge * 100) / 100),
    baseCharge: Math.max(0, Math.round(baseCharge * 100) / 100),
    free: charge <= 0 && baseCharge > 0 ? true : reason !== '',
    reason,
    remainingForFree: Math.max(0, Math.round(remaining * 100) / 100),
    remainingItemsForFree: Math.max(0, remainingItems),
  });

  // 1. Landing page
  if (landing?.mode === 'free') return result(0, zoneCharge, 'landing');
  if (landing?.mode === 'custom') {
    const own = num(landing.charges?.[zoneId]);
    if (own !== null) zoneCharge = own;
  }

  // 2 + 3. Products
  const payable = lines.filter((line) => !line.freeShipping);
  if (lines.length > 0 && payable.length === 0) return result(0, zoneCharge, 'products');
  let base = 0;
  if (payable.length === 0) base = zoneCharge;
  for (const line of payable) {
    const own = landing ? null : num(line.charges?.[zoneId]);
    base = Math.max(base, own ?? zoneCharge);
  }

  // Landing page thresholds replace the store-wide ones
  if (landing?.mode === 'custom') {
    const minQty = num(landing.freeMinQuantity);
    const minSubtotal = num(landing.freeMinSubtotal);
    if (minQty && quantity >= minQty) return result(0, base, 'quantity');
    if (minSubtotal && subtotal >= minSubtotal) return result(0, base, 'subtotal');
    return result(base, base, '');
  }

  // 4. Store-wide free delivery
  const applies =
    rules.enabled &&
    base > 0 &&
    !(input.wholesale && rules.excludeWholesale) &&
    (!rules.zones || rules.zones.length === 0 || rules.zones.includes(zoneId));
  if (applies) {
    const minSubtotal = num(rules.minSubtotal);
    const minQty = num(rules.minQuantity);
    if (minSubtotal && subtotal >= minSubtotal) return result(0, base, 'subtotal');
    if (minQty && quantity >= minQty) return result(0, base, 'quantity');
    return result(base, base, '', minSubtotal ? minSubtotal - subtotal : 0, minQty ? minQty - quantity : 0);
  }
  return result(base, base, '');
}

/** Short customer-facing reason, e.g. under the delivery line at checkout */
export function freeShippingLabel(reason: ShippingResult['reason']): string {
  switch (reason) {
    case 'landing':
      return 'Free delivery on this offer';
    case 'products':
      return 'Free delivery on these products';
    case 'subtotal':
      return 'Free delivery — order total reached';
    case 'quantity':
      return 'Free delivery — item count reached';
    default:
      return '';
  }
}
