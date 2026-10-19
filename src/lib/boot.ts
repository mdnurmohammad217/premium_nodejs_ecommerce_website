/**
 * Data the server sends inside the page (window.__PHARMA_BOOT__): the shop's
 * public settings and hero banners. The storefront's first render uses them,
 * so it opens with the shop's own colours, logo and banners instead of the
 * software's defaults.
 */
export interface BootData {
  settings?: Record<string, any>;
  banners?: any[];
}

let cached: BootData | null | undefined;

export function readBoot(): BootData | null {
  if (cached !== undefined) return cached;
  try {
    const raw = typeof window !== 'undefined' ? (window as any).__PHARMA_BOOT__ : null;
    cached = raw && typeof raw === 'object' && raw.settings && typeof raw.settings === 'object' ? (raw as BootData) : null;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * v3.12 — a product page opened directly comes with that product's data in
 * the page (window.__PHARMA_PRODUCT__), as a retail visitor sees it. It is
 * handed out once, for that product only; the page still checks the live
 * price and stock with the API right after it is shown.
 */
let productTaken = false;
export function takeBootProduct(key: string | number | undefined | null): any | null {
  if (productTaken || key === undefined || key === null || key === '') return null;
  try {
    const raw = typeof window !== 'undefined' ? (window as any).__PHARMA_PRODUCT__ : null;
    if (!raw || typeof raw !== 'object' || !raw.data?.product) return null;
    const wanted = String(key);
    const product = raw.data.product;
    if (String(raw.slug) !== wanted && String(product.slug) !== wanted && String(product.id) !== wanted) return null;
    productTaken = true;
    return raw.data;
  } catch {
    return null;
  }
}

/** The product of the page the visitor opened, without using it up */
export function peekBootProduct(key: string | undefined | null): any | null {
  try {
    const raw = typeof window !== 'undefined' ? (window as any).__PHARMA_PRODUCT__ : null;
    if (!key || !raw?.data?.product) return null;
    return String(raw.slug) === String(key) || String(raw.data.product.slug) === String(key) ? raw.data.product : null;
  } catch {
    return null;
  }
}

/**
 * v3.12 — a /shop link opened directly comes with its first page of products
 * (window.__PHARMA_SHOP__ = { key, data }), so the grid shows without a
 * second request. Used once, only for exactly that request, and only for a
 * visitor who is not signed in (signed-in wholesale buyers see other prices).
 */
let shopUsed = false;
/** Read-only (safe inside render: React may render a component more than once) */
export function peekBootShop(key: string, signedIn: boolean): any | null {
  if (shopUsed || signedIn) return null;
  try {
    const raw = typeof window !== 'undefined' ? (window as any).__PHARMA_SHOP__ : null;
    if (!raw || raw.key !== key || !raw.data || !Array.isArray(raw.data.items)) return null;
    return raw.data;
  } catch {
    return null;
  }
}
/** Called once the page is on screen: later visits to the shop fetch fresh data */
export function markBootShopUsed(): void {
  shopUsed = true;
}
