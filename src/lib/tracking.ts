/**
 * Centralised tracking for Meta Pixel, Google Tag Manager and GA4.
 *
 * Two things this module is strict about:
 *
 * 1. **No duplicate events.** The pixel snippet used to fire `PageView` itself
 *    *and* the router fired one on the first render, so every session started
 *    with two PageViews. Init no longer tracks anything; every event goes
 *    through `emit()`, which drops a repeat of the same event + payload inside
 *    a short window, and `Purchase` is remembered permanently per order id so a
 *    refresh of the thank-you page cannot double count a sale.
 *
 * 2. **Browser and server events are deduplicated by Meta.** Every event gets a
 *    generated `eventID`; the same id is sent to the Conversions API from the
 *    server, which is exactly what Meta matches on to merge the pair.
 *
 * 3. **Nothing is lost before the settings load.** The pixel id arrives with
 *    the site settings, a moment after the first render. Events fired before
 *    that (the first PageView, ViewContent on a product link someone opened
 *    directly) used to be dropped for good. They now wait in a queue and are
 *    sent, with their original event ids, as soon as the pixel is ready.
 */

declare global {
  interface Window {
    dataLayer: any[];
    fbq?: any;
    gtag?: any;
    _pharmaTracking?: {
      pixelId?: string;
      gtmId?: string;
      ga4Id?: string;
      capi?: boolean;
      currency?: string;
      pixelEnabled?: boolean;
      initialised?: boolean;
      /** GA4 loaded directly with gtag.js (no GTM) — events go to gtag('event') too */
      ga4Direct?: boolean;
      /** Put customer details into the purchase dataLayer event (default on) */
      customerData?: boolean;
    };
  }
}

interface MarketingConfig {
  /** Include the buyer's details in the purchase dataLayer event (default on) */
  dataLayerCustomerData?: boolean;
  metaPixelId?: string;
  gtmId?: string;
  ga4Id?: string;
  /** Server-side Conversions API is configured (token lives on the server only) */
  capiEnabled?: boolean;
  /** Dashboard switch; only an explicit `false` turns the browser pixel off */
  enableMetaPixel?: boolean;
  /** ISO 4217 code from Settings → General (`currencyCode`); falls back to BDT */
  currency?: string;
  /**
   * v3.15 — where the Meta Pixel runs. 'site' (default): this website loads the
   * pixel and sends every event. 'gtm': the pixel tag lives in the shop's GTM
   * container, so the website must not fire fbq itself — doing both counted
   * every PageView, AddToCart and Purchase twice in Ads Manager. The dataLayer
   * events carry `event_id` for the GTM tag, and the Conversions API keeps
   * using the same ids, so Meta still merges browser + server copies.
   */
  pixelSource?: 'site' | 'gtm';
}

const DEFAULT_CURRENCY = 'BDT';
/** Two events with the same signature inside this window are treated as one */
const DEDUPE_WINDOW_MS = 1500;
const PURCHASE_KEY = 'pharma:tracked-purchases';

const recentEvents = new Map<string, number>();

/** Meta's standard events; anything else must go through trackCustom */
const STANDARD_FB_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'Search',
  'AddToCart',
  'AddToWishlist',
  'InitiateCheckout',
  'AddPaymentInfo',
  'Purchase',
  'Lead',
  'CompleteRegistration',
  'Contact',
]);

/** Pixel/CAPI sends waiting for init(); kept short so a page without a pixel cannot grow it forever */
const pendingSends: Array<() => void> = [];
const MAX_PENDING = 40;

const readCookie = (name: string): string => {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
};

/** Meta rejects symbols such as "৳", so anything that is not a 3-letter code falls back */
const currencyCode = (): string => {
  const code = String(state().currency || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : DEFAULT_CURRENCY;
};

/**
 * Prices arrive from MySQL as decimal strings, and an unset sale price is
 * often "0.00" — a truthy string — so `salePrice || price` reported a value
 * of 0 for every product without a discount.
 */
const num = (value: any): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const priceOf = (product: any): number => {
  const sale = num(product?.salePrice);
  return sale > 0 ? sale : num(product?.price);
};

const qtyOf = (value: any): number => {
  const parsed = Math.floor(num(value));
  return parsed > 0 ? parsed : 1;
};

/** One id per product everywhere, so ViewContent, AddToCart and Purchase match the catalogue */
/**
 * The content id sent to Meta/GA — must equal the product's `id` in the Meta
 * catalog feed: an option's own feed id, else the SKU, else the product id.
 */
const productIdOf = (product: any): string => String(product?.feedId || String(product?.sku || '').trim() || product?.id || '');

/**
 * Cart lines look like `{ product, quantity }`; order lines from the API look
 * like `{ productId, sku, productName, unitPrice, quantity }`. Both reduce to
 * the same shape here.
 */
const lineOf = (entry: any) => {
  const product = entry?.product;
  const id = String(product?.feedId || entry?.feedId || String(product?.sku || entry?.sku || '').trim() || product?.id || entry?.productId || '');
  const price = product ? priceOf(product) : num(entry?.unitPrice ?? entry?.price);
  return {
    id,
    name: product?.name || entry?.productName || entry?.name || '',
    price: price || num(entry?.unitPrice),
    quantity: qtyOf(entry?.quantity),
  };
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const state = (): NonNullable<Window['_pharmaTracking']> => {
  if (typeof window === 'undefined') return {};
  window._pharmaTracking = window._pharmaTracking || {};
  return window._pharmaTracking;
};

function newEventId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** true when this exact event was already sent moments ago */
function isRepeat(signature: string): boolean {
  const now = Date.now();
  for (const [key, time] of recentEvents) {
    if (now - time > DEDUPE_WINDOW_MS) recentEvents.delete(key);
  }
  if (recentEvents.has(signature)) return true;
  recentEvents.set(signature, now);
  return false;
}

function purchaseAlreadyTracked(orderId: string): boolean {
  try {
    const raw = localStorage.getItem(PURCHASE_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (list.includes(orderId)) return true;
    // Keep the list short — the last 50 orders is plenty to stop a refresh
    localStorage.setItem(PURCHASE_KEY, JSON.stringify([...list, orderId].slice(-50)));
    return false;
  } catch {
    // Private mode: fall back to the in-memory guard only
    return isRepeat(`purchase:${orderId}`);
  }
}

/** Mirror one event to the server so Meta can merge it with the browser event */
function sendToCapi(eventName: string, eventId: string, payload: Record<string, any>) {
  if (!state().capi) return;
  try {
    // _fbp/_fbc let Meta tie the server copy to the same browser as the pixel
    const body = JSON.stringify({
      eventName,
      eventId,
      eventSourceUrl: window.location.href,
      payload,
      fbp: readCookie('_fbp') || undefined,
      fbc: readCookie('_fbc') || undefined,
    });
    // keepalive lets the request survive the navigation that often follows
    fetch('/api/track/capi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* tracking must never break the storefront */
    });
  } catch {
    /* ignore */
  }
}

/**
 * The one place an event leaves the app: pushes to the dataLayer (GTM/GA4),
 * fires the pixel with an eventID and mirrors it to the Conversions API.
 */
function emit(
  options: {
    gtmEvent: string;
    fbEvent?: string;
    signature: string;
    /** Skip the dedupe window — used by Purchase, which has its own guard */
    force?: boolean;
    /** A stable id (the order number for Purchase) so Meta can dedupe across devices and the server */
    eventId?: string;
    /** The server already sends this event to the Conversions API itself (Purchase) */
    skipCapi?: boolean;
  },
  gtmPayload: Record<string, any>,
  fbPayload: Record<string, any> = {}
) {
  if (typeof window === 'undefined') return;
  if (!options.force && isRepeat(options.signature)) return;

  const eventId = options.eventId || newEventId();

  // GTM reads the dataLayer whenever its script arrives, so this can go now
  window.dataLayer = window.dataLayer || [];
  // Clearing ecommerce first stops GA4 merging the previous event's items in
  if (gtmPayload.ecommerce) window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({ event: options.gtmEvent, event_id: eventId, ...gtmPayload });

  const sendNow = () => {
    // GA4 loaded directly (no GTM): gtag only reads gtag() commands, never
    // plain dataLayer objects, so without this GA4 received no events at all.
    if (state().ga4Direct && typeof window.gtag === 'function') {
      const { ecommerce, customer, user_data, user_data_hashed, ...rest } = gtmPayload;
      // Enhanced conversions: gtag takes the buyer through 'set', not as event params
      if (user_data) window.gtag('set', 'user_data', user_data);
      window.gtag('event', options.gtmEvent, { ...rest, ...(ecommerce || {}), event_id: eventId });
    }
    if (!options.fbEvent) return;
    const payload = { ...fbPayload, currency: currencyCode() };
    if (state().pixelEnabled !== false && typeof window.fbq === 'function') {
      const method = STANDARD_FB_EVENTS.has(options.fbEvent) ? 'track' : 'trackCustom';
      window.fbq(method, options.fbEvent, payload, { eventID: eventId });
    }
    if (!options.skipCapi) sendToCapi(options.fbEvent, eventId, payload);
  };

  if (state().initialised) sendNow();
  else if (pendingSends.length < MAX_PENDING) pendingSends.push(sendNow);
}

const itemOf = (product: any, quantity = 1) => ({
  item_id: productIdOf(product),
  item_name: product?.name,
  item_category: product?.categoryName || product?.category?.name || 'Medicine',
  price: priceOf(product),
  quantity: qtyOf(quantity),
});

const contentIdsOf = (products: any[]) => products.map(productIdOf).filter(Boolean);


/* ------------------------------------------------------------------ customer */

/** 01XXXXXXXXX → +8801XXXXXXXXX (E.164, what Google and Meta match on) */
const toE164 = (raw: any): string => {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('880')) return `+${digits}`;
  if (digits.startsWith('0')) return `+88${digits}`;
  if (digits.length === 10 && digits.startsWith('1')) return `+880${digits}`;
  return `+${digits}`;
};

const sha256Hex = async (value: string): Promise<string> => {
  if (!value || typeof crypto === 'undefined' || !crypto.subtle) return '';
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * The buyer, in the shapes tags expect:
 *  customer          plain fields for GTM variables (name, phone, address…)
 *  user_data         Google's format (GA4 Enhanced Conversions / Google Ads)
 *  user_data_hashed  SHA-256 of normalised values, for server-side GTM
 */
async function customerBlocks(order: any) {
  const name = String(order?.customerName || '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || '';
  const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  const email = String(order?.customerEmail || order?.email || '').trim().toLowerCase();
  const phoneE164 = toE164(order?.customerPhone);
  const address = String(order?.customerAddress || '').trim();
  const city = String(order?.shippingZone || '').trim();
  const customer = {
    name,
    first_name: firstName,
    last_name: lastName,
    phone: String(order?.customerPhone || '').trim(),
    phone_e164: phoneE164,
    email,
    address,
    city,
    country: 'BD',
    customer_id: order?.customerId ?? null,
    customer_type: order?.isWholesale ? 'wholesale' : 'retail',
    payment_method: order?.paymentMethod || '',
  };
  const user_data: Record<string, any> = {
    ...(email ? { email } : {}),
    ...(phoneE164 ? { phone_number: phoneE164 } : {}),
    address: {
      ...(firstName ? { first_name: firstName } : {}),
      ...(lastName ? { last_name: lastName } : {}),
      ...(address ? { street: address } : {}),
      ...(city ? { city } : {}),
      country: 'BD',
    },
  };
  const [hEmail, hPhone, hFirst, hLast] = await Promise.all([
    sha256Hex(email),
    sha256Hex(phoneE164),
    sha256Hex(firstName.toLowerCase()),
    sha256Hex(lastName.toLowerCase()),
  ]).catch(() => ['', '', '', '']);
  const user_data_hashed = {
    ...(hEmail ? { sha256_email_address: hEmail } : {}),
    ...(hPhone ? { sha256_phone_number: hPhone } : {}),
    ...(hFirst ? { sha256_first_name: hFirst } : {}),
    ...(hLast ? { sha256_last_name: hLast } : {}),
  };
  // Meta pixel advanced matching (the pixel hashes these itself)
  const meta: Record<string, string> = {};
  if (phoneE164) meta.ph = phoneE164.replace(/\D/g, '');
  if (email) meta.em = email;
  if (firstName) meta.fn = firstName.toLowerCase();
  if (lastName) meta.ln = lastName.toLowerCase();
  if (city) meta.ct = city.toLowerCase().replace(/[^a-z]/g, '');
  meta.country = 'bd';
  if (order?.customerId) meta.external_id = String(order.customerId);
  return { customer, user_data, user_data_hashed, meta };
}

export const tracking = {
  /**
   * Loads GTM, the Meta Pixel and GA4 once per page load. Calling it again with
   * the same ids is a no-op, so a settings refresh cannot inject a second copy.
   */
  init(marketingConfig?: MarketingConfig) {
    if (typeof window === 'undefined') return;
    const store = state();
    window.dataLayer = window.dataLayer || [];
    store.capi = Boolean(marketingConfig?.capiEnabled);
    store.pixelEnabled = marketingConfig?.enableMetaPixel !== false && marketingConfig?.pixelSource !== 'gtm';
    store.customerData = marketingConfig?.dataLayerCustomerData !== false;
    if (marketingConfig?.currency) store.currency = marketingConfig.currency;

    // ---- Google Tag Manager
    if (marketingConfig?.gtmId && store.gtmId !== marketingConfig.gtmId && !document.getElementById('gtm-script')) {
      store.gtmId = marketingConfig.gtmId;
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      const script = document.createElement('script');
      script.id = 'gtm-script';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${marketingConfig.gtmId}`;
      document.head.appendChild(script);
    }

    // ---- GA4 directly, only when there is no GTM container. With GTM, add
    //      the GA4 tag inside GTM instead: loading both counts every event twice.
    if (
      marketingConfig?.ga4Id &&
      !marketingConfig?.gtmId &&
      store.ga4Id !== marketingConfig.ga4Id &&
      !document.getElementById('ga4-script')
    ) {
      store.ga4Direct = true;
      store.ga4Id = marketingConfig.ga4Id;
      const script = document.createElement('script');
      script.id = 'ga4-script';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${marketingConfig.ga4Id}`;
      document.head.appendChild(script);
      window.gtag =
        window.gtag ||
        function gtag() {
          // eslint-disable-next-line prefer-rest-params
          window.dataLayer.push(arguments);
        };
      window.gtag('js', new Date());
      // send_page_view is off because pageView() below owns page views
      window.gtag('config', marketingConfig.ga4Id, { send_page_view: false });
    }

    // ---- Meta Pixel. The snippet deliberately does NOT track PageView:
    //      pageView() fires it once, so init + router cannot double count.
    if (
      marketingConfig?.metaPixelId &&
      store.pixelEnabled !== false &&
      store.pixelId !== marketingConfig.metaPixelId &&
      !document.getElementById('meta-pixel-script')
    ) {
      store.pixelId = marketingConfig.metaPixelId;
      const script = document.createElement('script');
      script.id = 'meta-pixel-script';
      script.innerHTML = `
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${marketingConfig.metaPixelId}');
      `;
      document.head.appendChild(script);
    }

    store.initialised = true;

    // Send whatever happened before the settings arrived, in order
    const queued = pendingSends.splice(0, pendingSends.length);
    queued.forEach((send) => {
      try {
        send();
      } catch {
        /* one bad event must not stop the rest */
      }
    });
  },

  pageView(path: string, title?: string) {
    emit(
      { gtmEvent: 'page_view', fbEvent: 'PageView', signature: `pv:${path}` },
      { page_path: path, page_title: title || document.title }
    );
  },

  viewItem(product: any) {
    if (!product) return;
    const value = priceOf(product);
    emit(
      { gtmEvent: 'view_item', fbEvent: 'ViewContent', signature: `vi:${product.id}` },
      { ecommerce: { currency: currencyCode(), value, items: [itemOf(product)] } },
      {
        content_name: product.name,
        content_category: product.categoryName || 'Medicine',
        content_ids: contentIdsOf([product]),
        // A product with options is a group in the catalog
        content_type: product?.hasVariations ? 'product_group' : 'product',
        contents: [{ id: productIdOf(product), quantity: 1, item_price: value }],
        value,
      }
    );
  },

  viewCategory(category: any, products: any[] = []) {
    if (!category) return;
    emit(
      { gtmEvent: 'view_item_list', fbEvent: 'ViewCategory', signature: `vc:${category.slug || category.id}` },
      {
        ecommerce: {
          item_list_name: category.name,
          items: products.slice(0, 20).map((product) => itemOf(product)),
        },
      },
      {
        content_name: category.name,
        content_category: category.name,
        content_ids: contentIdsOf(products.slice(0, 20)),
        content_type: 'product',
      }
    );
  },

  search(term: string, resultCount = 0) {
    const query = String(term || '').trim();
    if (!query) return;
    emit(
      { gtmEvent: 'search', fbEvent: 'Search', signature: `se:${query.toLowerCase()}` },
      { search_term: query, result_count: resultCount },
      { search_string: query }
    );
  },

  addToCart(product: any, quantity = 1, variationId?: number | null) {
    if (!product) return;
    const price = priceOf(product);
    const qty = qtyOf(quantity);
    const value = round2(price * qty);
    emit(
      // The variation is part of the signature: two sizes added back to back are two events
      { gtmEvent: 'add_to_cart', fbEvent: 'AddToCart', signature: `atc:${product.id}:${variationId || ''}:${qty}` },
      { ecommerce: { currency: currencyCode(), value, items: [itemOf(product, qty)] } },
      {
        content_name: product.name,
        content_category: product.categoryName || 'Medicine',
        content_ids: contentIdsOf([product]),
        content_type: 'product',
        contents: [{ id: productIdOf(product), quantity: qty, item_price: price }],
        num_items: qty,
        value,
      }
    );
  },

  removeFromCart(product: any, quantity = 1) {
    if (!product) return;
    const qty = qtyOf(quantity);
    emit(
      { gtmEvent: 'remove_from_cart', signature: `rfc:${product.id}:${qty}` },
      { ecommerce: { currency: currencyCode(), value: round2(priceOf(product) * qty), items: [itemOf(product, qty)] } }
    );
  },

  addToWishlist(product: any) {
    if (!product) return;
    emit(
      { gtmEvent: 'add_to_wishlist', fbEvent: 'AddToWishlist', signature: `atw:${product.id}` },
      {
        ecommerce: {
          currency: currencyCode(),
          value: priceOf(product),
          items: [itemOf(product)],
        },
      },
      {
        content_name: product.name,
        content_ids: contentIdsOf([product]),
        content_type: 'product',
        contents: [{ id: productIdOf(product), quantity: 1, item_price: priceOf(product) }],
        value: priceOf(product),
      }
    );
  },

  viewCart(items: any[], total: number) {
    emit(
      { gtmEvent: 'view_cart', signature: `vcart:${items.length}:${total}` },
      {
        ecommerce: {
          currency: currencyCode(),
          value: num(total),
          items: items.map((entry) => itemOf(entry.product, entry.quantity)),
        },
      }
    );
  },

  initiateCheckout(items: any[], total: number) {
    const lines = (items || []).map(lineOf).filter((line) => line.id);
    const value = num(total) || round2(lines.reduce((sum, line) => sum + line.price * line.quantity, 0));
    emit(
      { gtmEvent: 'begin_checkout', fbEvent: 'InitiateCheckout', signature: `ic:${value}:${lines.length}` },
      {
        ecommerce: {
          currency: currencyCode(),
          value,
          items: lines.map((line) => ({ item_id: line.id, item_name: line.name, price: line.price, quantity: line.quantity })),
        },
      },
      {
        num_items: lines.reduce((sum, line) => sum + line.quantity, 0),
        content_ids: lines.map((line) => line.id),
        content_type: 'product',
        contents: lines.map((line) => ({ id: line.id, quantity: line.quantity, item_price: line.price })),
        value,
      }
    );
  },

  addPaymentInfo(method: string, total: number) {
    emit(
      { gtmEvent: 'add_payment_info', fbEvent: 'AddPaymentInfo', signature: `api:${method}:${total}` },
      { ecommerce: { currency: currencyCode(), value: num(total), payment_type: method } },
      { value: num(total) }
    );
  },

  /** Contact button / chat click — a Lead in Meta's vocabulary */
  contact(channel: string) {
    emit(
      { gtmEvent: 'contact', fbEvent: 'Contact', signature: `ct:${channel}` },
      { channel },
      { content_name: channel }
    );
  },

  completeRegistration(method = 'website') {
    emit(
      { gtmEvent: 'sign_up', fbEvent: 'CompleteRegistration', signature: `cr:${method}` },
      { method },
      { content_name: method, status: true }
    );
  },

  /**
   * Fired once per order id, ever. A refresh of the thank-you page, a back
   * navigation or a remount will not send a second Purchase.
   */
  purchase(order: any, items: any[]) {
    if (!order?.orderNumber) return;
    const orderId = String(order.orderNumber);
    if (purchaseAlreadyTracked(orderId)) return;
    void this.purchaseWithCustomer(order, items, orderId);
  },

  async purchaseWithCustomer(order: any, items: any[], orderId: string) {
    // Prefer the lines the server priced and saved; the cart is only a fallback.
    const source = Array.isArray(order.items) && order.items.length > 0 ? order.items : items || [];
    const lines = source.map(lineOf).filter((line: any) => line.id);
    const value = num(order.total) || round2(lines.reduce((sum: number, line: any) => sum + line.price * line.quantity, 0));

    const blocks = await customerBlocks(order).catch(() => null);
    const withCustomer = state().customerData !== false && blocks;
    // v3.15 — the pixel is no longer initialised a second time here (Meta
    // ignores a repeat init and Pixel Helper flags it as a duplicate pixel).
    // The buyer's phone / name reach Meta with the server's Purchase event
    // (Conversions API), which Meta merges with this browser event.

    emit(
      // The server sends Purchase to the Conversions API from the order route
      // with the same event id, so the browser does not relay it a second time.
      {
        gtmEvent: 'purchase',
        fbEvent: 'Purchase',
        signature: `pu:${orderId}`,
        force: true,
        eventId: orderId,
        skipCapi: true,
      },
      {
        ...(withCustomer
          ? { customer: blocks!.customer, user_data: blocks!.user_data, user_data_hashed: blocks!.user_data_hashed }
          : {}),
        ecommerce: {
          transaction_id: orderId,
          value,
          shipping: num(order.shippingCharge),
          currency: currencyCode(),
          items: lines.map((line: any) => ({
            item_id: line.id,
            item_name: line.name,
            price: line.price,
            quantity: line.quantity,
          })),
        },
      },
      {
        content_type: 'product',
        content_ids: lines.map((line: any) => line.id),
        contents: lines.map((line: any) => ({ id: line.id, quantity: line.quantity, item_price: line.price })),
        num_items: lines.reduce((sum: number, line: any) => sum + line.quantity, 0),
        value,
        order_id: orderId,
      }
    );
  },
};
