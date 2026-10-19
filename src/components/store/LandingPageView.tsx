import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeBdPhone } from '../../lib/phone.ts';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BadgeCheck,
  Banknote,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FlaskConical,
  Gift,
  Heart,
  Home,
  Leaf,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  PackageX,
  Palette,
  Phone,
  Play,
  Plus,
  Quote,
  RefreshCw,
  Ruler,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  Star,
  Timer,
  Truck,
  User,
  X,
  Zap,
} from 'lucide-react';
import type { SiteSettings } from '../../types/index.ts';
import {
  DEFAULT_LANDING_SHIPPING,
  normalizeLandingContent,
  videoEmbed,
  type LandingContent,
  type LandingTemplateId,
} from '../../lib/landingTemplates.ts';
import { cleanGeoConfig, zoneForPlace } from '../../lib/geoShipping.ts';
import { DistrictThanaFields } from './DistrictThanaFields.tsx';
import { ThankYouView } from './ThankYouView.tsx';
import { computeShipping, freeShippingLabel, parseCharges, type ShippingResult } from '../../lib/shipping.ts';
import { GATEWAY_LOOK, isOnlineGateway, startOnlinePayment } from '../../lib/onlinePayment.ts';
import { tracking } from '../../lib/tracking.ts';
import { IMAGE_PLACEHOLDER } from '../../lib/placeholder.ts';
import { ctaAnimation } from '../../lib/ctaAnimation.ts';

/**
 * Public landing page — /lp/:slug.
 *
 * A standalone one-offer page (no store header/footer) with its own checkout.
 * Both templates ('fashion' and 'organic') render the same content; only the
 * look differs. The owner's colours arrive as CSS variables (--lp-p, --lp-a,
 * --lp-bg) on the root, so every accent follows the dashboard.
 *
 * The same component renders the live preview inside the dashboard editor
 * (`preview` prop). It may then live inside an <iframe> (portal), so anything
 * that touches the document goes through the element's ownerDocument rather
 * than the global `document`/`window`.
 *
 * The delivery charge shown here comes from computeShipping() — the exact
 * function the server bills with — and the server re-prices everything, so
 * nothing the browser shows is trusted for money.
 */

type Mode = 'live' | 'draft' | 'preview';

interface Props {
  slug?: string;
  settings: SiteSettings;
  preview?: { page: any; products: any[] };
}

interface OptionGroup {
  name: string;
  values: string[];
}

interface LpVariation {
  id: number;
  label: string;
  combination: Record<string, string>;
  price: number;
  salePrice: number;
  stock: number;
  image: string;
  /** v3.15 — the option's own SKU (its id in the Meta catalog) */
  sku?: string;
}

interface LpProduct {
  id: number;
  name: string;
  sku: string;
  image: string;
  photos: string[];
  price: number;
  salePrice: number;
  stock: number;
  unit: string;
  hasVariations: boolean;
  freeShipping: boolean;
  charges: Record<string, number> | null;
  variations: LpVariation[];
  groups: OptionGroup[];
  preselect: boolean;
  qty: number;
  raw: any;
}

interface Pick {
  checked: boolean;
  qty: number;
  options: Record<string, string>;
}

interface Line {
  key: string;
  product: LpProduct;
  variation: LpVariation | null;
  qty: number;
  price: number;
  regular: number | null;
  lineTotal: number;
}

type IconType = React.ComponentType<{ className?: string; strokeWidth?: number }>;

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
/** Customers on a Bangla keyboard type ০১৭… — read those as 017… */
const asciiDigits = (value: string) => value.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/** Whatever is typed or pasted → at most 11 digits, "+8801…" / "8801…" folded to "01…" */
const normalizePhoneInput = (raw: string): string => normalizeBdPhone(asciiDigits(raw));

const PHONE_RE = /^01[3-9]\d{8}$/;

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

/** `image` first, then the JSON `images` array (strings or {url}) */
const photosOf = (raw: any): string[] => {
  const list: string[] = [];
  const push = (entry: unknown) => {
    const url =
      typeof entry === 'string'
        ? entry.trim()
        : entry && typeof entry === 'object' && typeof (entry as any).url === 'string'
        ? String((entry as any).url).trim()
        : '';
    if (url && !list.includes(url)) list.push(url);
  };
  push(raw?.image);
  let images = raw?.images;
  if (typeof images === 'string') {
    try {
      images = JSON.parse(images);
    } catch {
      images = images.startsWith('http') || images.startsWith('/') ? images.split(',') : [];
    }
  }
  if (Array.isArray(images)) images.forEach(push);
  return list;
};

const groupsOf = (variations: LpVariation[]): OptionGroup[] => {
  const groups: OptionGroup[] = [];
  variations.forEach((variation) => {
    Object.entries(variation.combination).forEach(([name, value]) => {
      let group = groups.find((g) => g.name === name);
      if (!group) {
        group = { name, values: [] };
        groups.push(group);
      }
      if (!group.values.includes(value)) group.values.push(value);
    });
  });
  return groups;
};

function normalizeProduct(raw: any): LpProduct | null {
  if (!raw || !Number(raw.id)) return null;
  const variations: LpVariation[] = (Array.isArray(raw.variations) ? raw.variations : [])
    .map((v: any) => {
      const combination = parseCombination(v?.combination);
      // A label-only option still has to be choosable
      if (Object.keys(combination).length === 0 && v?.label) combination['অপশন'] = String(v.label);
      return {
        id: Number(v?.id) || 0,
        label: String(v?.label || ''),
        combination,
        price: num(v?.price),
        salePrice: num(v?.salePrice),
        stock: Math.max(0, num(v?.stock)),
        image: String(v?.image || ''),
      };
    })
    .filter((v: LpVariation) => v.id > 0 && Object.keys(v.combination).length > 0);
  const photos = photosOf(raw);
  return {
    id: Number(raw.id),
    name: String(raw.name || ''),
    sku: String(raw.sku || ''),
    image: photos[0] || '',
    photos,
    price: num(raw.price),
    salePrice: num(raw.salePrice),
    stock: num(raw.stock),
    unit: String(raw.unit || ''),
    hasVariations: Boolean(raw.hasVariations),
    freeShipping: Boolean(raw.freeShipping),
    charges: parseCharges(raw.shippingCharges),
    variations,
    groups: groupsOf(variations),
    preselect: Boolean(raw.preselect),
    qty: Math.max(1, Math.min(99, Math.floor(num(raw.qty)) || 1)),
    raw,
  };
}

/** Same order the server bills with: option sale → option price → product sale → product price */
function priceFor(product: LpProduct, variation: LpVariation | null): { price: number; regular: number | null } {
  const productSale = product.salePrice > 0 ? product.salePrice : 0;
  const productPrice = productSale || product.price;
  const productRegular = productSale && product.price > productSale ? product.price : null;
  if (!variation) return { price: productPrice, regular: productRegular };
  if (variation.salePrice > 0) {
    const regular = variation.price > 0 ? variation.price : product.price;
    return { price: variation.salePrice, regular: regular > variation.salePrice ? regular : null };
  }
  if (variation.price > 0) return { price: variation.price, regular: null };
  return { price: productPrice, regular: productRegular };
}

function rangeOf(product: LpProduct): { min: number; max: number } {
  const pool = product.variations.some((v) => v.stock > 0) ? product.variations.filter((v) => v.stock > 0) : product.variations;
  const prices = pool.map((v) => priceFor(product, v).price).filter((p) => p > 0);
  if (prices.length === 0) {
    const base = priceFor(product, null).price;
    return { min: base, max: base };
  }
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

const matchesSelection = (variation: LpVariation, selection: Record<string, string>, ignore?: string) =>
  Object.entries(selection).every(([key, value]) => key === ignore || variation.combination[key] === value);

const findVariation = (product: LpProduct, selection: Record<string, string>): LpVariation | null => {
  if (!product.hasVariations || product.groups.length === 0) return null;
  if (!product.groups.every((g) => Boolean(selection[g.name]))) return null;
  return product.variations.find((v) => product.groups.every((g) => v.combination[g.name] === selection[g.name])) || null;
};


/** The photo every still-matching option shares, e.g. after picking a colour */
const sharedImage = (product: LpProduct, selection: Record<string, string>): string => {
  if (!product.hasVariations || Object.keys(selection).length === 0) return '';
  const images = Array.from(new Set(product.variations.filter((v) => matchesSelection(v, selection)).map((v) => v.image || '')));
  return images.length === 1 ? images[0] : '';
};

const isAvailable = (product: LpProduct) =>
  product.hasVariations ? product.variations.some((v) => v.stock > 0) : product.stock > 0;

function initialPick(product: LpProduct): Pick {
  const options: Record<string, string> = {};
  if (product.hasVariations) {
    // v3.8: the first option in stock is chosen from the start
    const first = product.variations.find((v) => v.stock > 0) || product.variations[0];
    if (first) Object.assign(options, first.combination);
  }
  return { checked: product.preselect && isAvailable(product), qty: product.qty, options };
}

const variationText = (variation: LpVariation | null) =>
  variation ? Object.values(variation.combination).join(' / ') || variation.label : '';

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR_RE = /^(rgb|rgba|hsl|hsla)\([\d\s.,%/-]+\)$/i;
const safeColor = (value: unknown, fallback: string) => {
  const text = String(value || '').trim();
  return HEX_RE.test(text) || FUNC_COLOR_RE.test(text) ? text : fallback;
};

/** White text unless the colour is so light that white would be unreadable (AA large, 3:1) */
function readableOn(color: string): string {
  const match = HEX_RE.exec(color);
  if (!match) return '#ffffff';
  let hex = match[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return 1.05 / (lum + 0.05) >= 3 ? '#ffffff' : '#111827';
}

/** A hex colour mixed toward black (factor 1 = unchanged); anything else is returned as is */
function darken(color: string, factor: number): string {
  const match = HEX_RE.exec(color);
  if (!match) return color;
  let hex = match[1].slice(0, match[1].length === 8 ? 6 : match[1].length);
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const channel = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * factor).toString(16).padStart(2, '0');
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

const waHref = (raw: string): string => {
  let digits = asciiDigits(String(raw || '')).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = `88${digits}`;
  return `https://wa.me/${digits}`;
};
const telHref = (raw: string) => `tel:${asciiDigits(String(raw || '')).replace(/[^\d+]/g, '')}`;

const fallbackImage = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const img = event.currentTarget;
  img.onerror = null;
  img.src = IMAGE_PLACEHOLDER;
};

const FEATURE_ICONS: Array<[RegExp, IconType]> = [
  [/ডেলিভারি|delivery|shipping|পৌঁছ/i, Truck],
  [/ভেজাল|খাঁটি|pure|original|আসল|নিরাপদ|safe|গ্যারান্টি|guarantee|warranty|ওয়ারেন্টি/i, ShieldCheck],
  [/প্যাক|pack/i, Package],
  [/কাপড়|কাপড়|fabric|cotton|কটন|শার্ট|shirt|পোশাক/i, Shirt],
  [/রং|রঙ|colou?r/i, Palette],
  [/ফিটিং|সাইজ|size|fit/i, Ruler],
  [/প্রাকৃতিক|natural|organic|অর্গানিক|সংগ্রহ|fresh|তাজা|মৌচাক/i, Leaf],
  [/টেস্ট|ল্যাব|lab|test/i, FlaskConical],
  [/দ্রুত|fast|quick/i, Zap],
  [/কোয়ালিটি|quality|প্রিমিয়াম|premium|সেরা|best/i, Award],
  [/স্বাস্থ্য|health|যত্ন|care|পরিবার|family/i, Heart],
  [/অফার|offer|gift|উপহার|ছাড়|discount/i, Gift],
  [/ক্যাশ|cash|টাকা|payment|পেমেন্ট/i, Banknote],
];
const FALLBACK_ICONS: IconType[] = [BadgeCheck, Sparkles, ShieldCheck, Award, Heart, Zap];
const iconFor = (text: string, index: number): IconType =>
  FEATURE_ICONS.find(([re]) => re.test(text))?.[1] || FALLBACK_ICONS[index % FALLBACK_ICONS.length];

const lpSessionKey = (pageId: number): string => {
  const storageKey = `pharma:lp-checkout-key:${pageId}`;
  const make = () => {
    try {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    } catch {
      /* fall through */
    }
    return `lp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  };
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = make();
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return make();
  }
};
const clearLpSessionKey = (pageId: number) => {
  try {
    sessionStorage.removeItem(`pharma:lp-checkout-key:${pageId}`);
  } catch {
    /* private mode */
  }
};

/* ========================================================================== */
/* Extra Meta Pixel for this page                                              */
/* ========================================================================== */

/**
 * The store pixel (System Configuration → Pixel) is set up by App.tsx and
 * fires on landing pages as usual. A page may add its own pixel: it is
 * initialised on the same fbq, so every standard event the store sends with
 * fbq('track') reaches it too. When the store is not relaying (pixel switched
 * off, or tracking never initialised) the events are sent to this pixel alone
 * with trackSingle, so it is never left without data and never counted twice.
 */
function ensureFbq(): any {
  const w = window as any;
  if (typeof w.fbq === 'function') return w.fbq;
  const n: any = function (...args: any[]) {
    if (n.callMethod) n.callMethod.apply(n, args);
    else n.queue.push(args);
  };
  w.fbq = n;
  if (!w._fbq) w._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  if (!document.querySelector('script[src*="connect.facebook.net/en_US/fbevents.js"]')) {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
  return n;
}

const extraPixel = (() => {
  let current = '';
  const store = () => ((window as any)._pharmaTracking || {}) as { initialised?: boolean; pixelEnabled?: boolean };
  /** Calls back once we know whether the store's fbq('track') calls reach this pixel */
  const whenDecided = (callback: (storeRelays: boolean) => void) => {
    const check = () => {
      const state = store();
      if (!state.initialised) return false;
      callback(state.pixelEnabled !== false);
      return true;
    };
    if (check()) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (check()) window.clearInterval(timer);
      else if (tries > 40) {
        window.clearInterval(timer);
        callback(false);
      }
    }, 250);
  };
  return {
    init(id: string) {
      if (!id || current === id) return;
      const initialisedBefore = Boolean(store().initialised);
      const fbq = ensureFbq();
      current = id;
      try {
        fbq('init', id);
      } catch {
        return;
      }
      // App.tsx sends the store PageView once tracking is initialised. If that
      // already happened this pixel missed it; otherwise the queued PageView
      // will reach it — unless the store turns out not to relay at all.
      if (initialisedBefore) {
        fbq('trackSingle', id, 'PageView');
      } else {
        whenDecided((relays) => {
          if (!relays) window.fbq?.('trackSingle', id, 'PageView');
        });
      }
    },
    mirror(event: string, payload: Record<string, any>) {
      const id = current;
      if (!id) return;
      whenDecided((relays) => {
        if (!relays) {
          try {
            window.fbq?.('trackSingle', id, event, payload);
          } catch {
            /* tracking must never break the page */
          }
        }
      });
    },
  };
})();

/* ========================================================================== */
/* Scoped styles                                                               */
/* ========================================================================== */

const CSS = `
.lp-root{--lp-p-soft:color-mix(in srgb,var(--lp-p) 10%,#fff);--lp-p-dark:color-mix(in srgb,var(--lp-p) 72%,#000);--lp-a-soft:color-mix(in srgb,var(--lp-a) 14%,#fff);--lp-cta:#16a34a;--lp-cta-dark:#15803d;font-size:15px;color:var(--lp-ink);background:var(--lp-bg);-webkit-tap-highlight-color:transparent;overflow-wrap:anywhere}
@media (min-width:640px){.lp-root{font-size:16px}}
.lp-root[data-tpl="fashion"]{--lp-ink:#0f172a;--lp-muted:#475569;--lp-card:#ffffff;--lp-line:#e2e8f0;--lp-radius:1.25rem;--lp-shadow:0 18px 40px -24px rgba(15,23,42,.35)}
.lp-root[data-tpl="organic"]{--lp-ink:#3b2a14;--lp-muted:#7c6547;--lp-card:#fffdf8;--lp-line:#efe2c6;--lp-radius:1.75rem;--lp-shadow:0 18px 44px -24px rgba(146,64,14,.35)}
.lp-root :is(h1,h2,h3,h4){color:inherit;letter-spacing:0}
.lp-fade{animation:lp-fade .55s cubic-bezier(.2,.8,.3,1) both}
@keyframes lp-fade{from{opacity:0;transform:translateY(10px)}}
.lp-pop{animation:lp-pop .55s cubic-bezier(.3,.7,.4,1.4) both}
@keyframes lp-pop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
.lp-float{animation:lp-float 6s ease-in-out infinite}
@keyframes lp-float{50%{transform:translateY(-8px)}}
@media (prefers-reduced-motion:reduce){.lp-fade,.lp-pop,.lp-float{animation:none}}
`;

/* ========================================================================== */
/* Small pieces                                                                */
/* ========================================================================== */

const Stars: React.FC<{ value: number; className?: string }> = ({ value, className = 'w-4 h-4' }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${value} / 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} className={`${className} ${i <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
    ))}
  </span>
);

const SectionTitle: React.FC<{ organic: boolean; children: React.ReactNode; sub?: string }> = ({ organic, children, sub }) => (
  <div className="mb-7 text-center sm:mb-10">
    {organic && (
      <span className="inline-flex items-center gap-2 text-(--lp-p)" aria-hidden>
        <span className="h-px w-8 bg-current opacity-40" />
        <Leaf className="h-4 w-4" />
        <span className="h-px w-8 bg-current opacity-40" />
      </span>
    )}
    <h2 className="mt-1 text-[22px] font-bold leading-[1.4] sm:text-[30px]">{children}</h2>
    {!organic && <span className="mx-auto mt-3 block h-1 w-14 rounded-full bg-(--lp-a)" aria-hidden />}
    {sub && <p className="mx-auto mt-3 max-w-2xl text-(--lp-muted)">{sub}</p>}
  </div>
);

const Countdown: React.FC<{ endsAt: number; onEnd: () => void }> = ({ endsAt, onEnd }) => {
  const [now, setNow] = useState(() => Date.now());
  const endedRef = useRef(false);
  useEffect(() => {
    endedRef.current = false;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);
  const left = Math.max(0, endsAt - now);
  useEffect(() => {
    if (left <= 0 && !endedRef.current) {
      endedRef.current = true;
      onEnd();
    }
  }, [left, onEnd]);
  const cells: Array<[number, string]> = [
    [Math.floor(left / 86400000), 'দিন'],
    [Math.floor(left / 3600000) % 24, 'ঘণ্টা'],
    [Math.floor(left / 60000) % 60, 'মিনিট'],
    [Math.floor(left / 1000) % 60, 'সেকেন্ড'],
  ];
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3" role="timer">
      {cells.map(([value, label]) => (
        <div key={label} className="w-[64px] rounded-2xl border border-white/25 bg-white/15 py-2.5 text-center sm:w-20 sm:py-3">
          <div className="ds-num text-2xl font-extrabold leading-none sm:text-3xl">{String(value).padStart(2, '0')}</div>
          <div className="mt-1.5 text-[11px] opacity-90 sm:text-xs">{label}</div>
        </div>
      ))}
    </div>
  );
};

const Lightbox: React.FC<{ images: string[]; index: number; onClose: () => void; onIndex: (index: number) => void }> = ({
  images,
  index,
  onClose,
  onIndex,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const count = images.length;
  const go = useCallback((step: number) => onIndex((index + step + count) % count), [index, count, onIndex]);

  useEffect(() => {
    const doc = ref.current?.ownerDocument || document;
    const previous = doc.body.style.overflow;
    doc.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      doc.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const doc = ref.current?.ownerDocument || document;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight' && count > 1) go(1);
      else if (event.key === 'ArrowLeft' && count > 1) go(-1);
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [go, onClose, count]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="ছবি"
      className="lp-fade fixed inset-0 z-[80] flex items-center justify-center bg-black/90 outline-none"
      onClick={onClose}
      onTouchStart={(event) => {
        touchX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchX.current === null || count < 2) return;
        const dx = (event.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <img
        src={images[index]}
        alt=""
        decoding="async"
        onError={fallbackImage}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[86vh] max-w-[92vw] select-none rounded-lg object-contain"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="বন্ধ করুন"
        className="absolute right-3 top-3 grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <X className="h-6 w-6" />
      </button>
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="আগের ছবি"
            onClick={(event) => {
              event.stopPropagation();
              go(-1);
            }}
            className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 sm:left-5"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="পরের ছবি"
            onClick={(event) => {
              event.stopPropagation();
              go(1);
            }}
            className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 sm:right-5"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <span className="ds-num absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-sm text-white">
            {index + 1} / {count}
          </span>
        </>
      )}
    </div>
  );
};

/** YouTube: a thumbnail until tapped (the player is ~1 MB); others: a lazy iframe */
const VideoBlock: React.FC<{ url: string; title: string }> = ({ url, title }) => {
  const embed = useMemo(() => videoEmbed(url), [url]);
  const [playing, setPlaying] = useState(false);
  useEffect(() => setPlaying(false), [url]);
  if (!embed) return null;
  const youtubeId = embed.kind === 'youtube' ? /embed\/([^?]+)/.exec(embed.src)?.[1] || '' : '';
  const frameClass = `mx-auto overflow-hidden rounded-(--lp-radius) bg-black shadow-(--lp-shadow) ${
    embed.vertical ? 'aspect-[9/16] w-full max-w-[340px]' : 'aspect-video w-full'
  }`;
  return (
    <div className={frameClass}>
      {embed.kind === 'file' ? (
        <video src={embed.src} controls playsInline preload="metadata" className="h-full w-full bg-black object-contain" />
      ) : youtubeId && !playing ? (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`${title || 'Video'} — play`}
          className="group relative block h-full w-full cursor-pointer"
        >
          <img
            src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(event) => {
              event.currentTarget.style.visibility = 'hidden';
            }}
            className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100"
          />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-red-600 text-white shadow-xl transition group-hover:scale-110 sm:h-20 sm:w-20">
              <Play className="ml-1 h-8 w-8 fill-white" />
            </span>
          </span>
        </button>
      ) : (
        <iframe
          src={youtubeId ? `${embed.src}&autoplay=1` : embed.src}
          title={title || 'Video'}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full border-0"
        />
      )}
    </div>
  );
};

/* ========================================================================== */
/* Loader / empty states                                                       */
/* ========================================================================== */

const LoadingView: React.FC = () => (
  <div className="min-h-screen bg-slate-50" aria-busy="true" aria-label="Loading">
    <div className="h-9 bg-slate-200/70" />
    <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:py-16">
      <div className="space-y-4">
        <span className="ds-skeleton block h-7 w-32 rounded-full" />
        <span className="ds-skeleton block h-10 w-full" />
        <span className="ds-skeleton block h-10 w-4/5" />
        <span className="ds-skeleton block h-4 w-full" />
        <span className="ds-skeleton block h-4 w-3/4" />
        <span className="ds-skeleton block h-14 w-56 rounded-full" />
      </div>
      <span className="ds-skeleton mx-auto block aspect-square w-full max-w-md rounded-3xl" />
    </div>
    <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 pb-16 sm:px-6 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="ds-skeleton block h-32 rounded-2xl" />
      ))}
    </div>
  </div>
);

const UnavailableView: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <div lang="bn" className="grid min-h-screen place-items-center bg-slate-50 px-4 py-16">
    <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-50 text-amber-600">
        {onRetry ? <AlertCircle className="h-8 w-8" /> : <PackageX className="h-8 w-8" />}
      </span>
      <h1 className="mt-5 text-xl font-bold text-slate-900">
        {onRetry ? 'The page could not be loaded' : 'This offer is not available'}
      </h1>
      <p className="mt-2 leading-relaxed text-slate-600">
        {onRetry
          ? 'ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।'
          : 'এই অফারটি এখন চালু নেই, অথবা লিংকটি ভুল। আমাদের অন্যান্য পণ্য দেখতে হোম পেজে যান।'}
      </p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-200 px-6 font-semibold text-slate-800 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> আবার চেষ্টা করুন
          </button>
        )}
        <a
          href="/"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-slate-900 px-6 font-semibold text-white hover:bg-slate-800"
        >
          <Home className="h-4 w-4" /> হোম পেজে যান
        </a>
      </div>
    </div>
  </div>
);

/* ========================================================================== */
/* Loader                                                                      */
/* ========================================================================== */

export const LandingPageView: React.FC<Props> = ({ slug, settings, preview }) => {
  const [remote, setRemote] = useState<{
    state: 'loading' | 'ready' | 'missing' | 'error';
    page?: any;
    products?: any[];
    draft?: boolean;
  }>({ state: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (preview) return;
    if (!slug) {
      setRemote({ state: 'missing' });
      return;
    }
    let cancelled = false;
    setRemote({ state: 'loading' });
    fetch(`/api/lp/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setRemote({ state: 'missing' });
          return;
        }
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (cancelled) return;
        if (!data?.page) setRemote({ state: 'missing' });
        else setRemote({ state: 'ready', page: data.page, products: Array.isArray(data.products) ? data.products : [], draft: Boolean(data.preview) });
      })
      .catch(() => {
        if (!cancelled) setRemote({ state: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, preview, reloadKey]);

  if (preview) {
    return (
      <LandingPage
        page={preview.page || {}}
        products={Array.isArray(preview.products) ? preview.products : []}
        settings={settings}
        mode="preview"
        slug={preview.page?.slug || slug || ''}
      />
    );
  }
  if (remote.state === 'loading') return <LoadingView />;
  if (remote.state === 'missing') return <UnavailableView />;
  if (remote.state === 'error') return <UnavailableView onRetry={() => setReloadKey((k) => k + 1)} />;
  return (
    <LandingPage
      page={remote.page}
      products={remote.products || []}
      settings={settings}
      mode={remote.draft ? 'draft' : 'live'}
      slug={remote.page?.slug || slug || ''}
    />
  );
};

/* ========================================================================== */
/* The page                                                                    */
/* ========================================================================== */

const LandingPage: React.FC<{ page: any; products: any[]; settings: SiteSettings; mode: Mode; slug: string }> = ({
  page,
  products,
  settings,
  mode,
  slug,
}) => {
  const live = mode === 'live';
  const ordersOff = mode !== 'live';
  const template: LandingTemplateId = page?.template === 'organic' ? 'organic' : 'fashion';
  const organic = template === 'organic';
  const content: LandingContent = useMemo(() => normalizeLandingContent(page?.content, template), [page?.content, template]);
  const shippingCfg = useMemo(() => ({ ...DEFAULT_LANDING_SHIPPING, ...(page?.shipping || {}) }), [page?.shipping]);
  const items = useMemo(() => (products || []).map(normalizeProduct).filter((p): p is LpProduct => Boolean(p)), [products]);
  const pageId = Number(page?.id) || 0;

  const currency = settings?.general?.currency || '৳';
  const currencyCode = /^[A-Z]{3}$/.test(String(settings?.general?.currencyCode || '').toUpperCase())
    ? String(settings?.general?.currencyCode).toUpperCase()
    : 'BDT';
  const fmt = (value: number) => value.toLocaleString('en-BD', { maximumFractionDigits: 2 });
  const money = (value: number) => `${currency}${fmt(value)}`;
  const cta = ctaAnimation(settings, 'placeOrder');

  const defaults = organic
    ? { primary: '#d97706', accent: '#15803d', background: '#fffbeb' }
    : { primary: '#0d9488', accent: '#f59e0b', background: '#f0fdfa' };
  const primary = safeColor(content.theme?.primary, defaults.primary);
  const accent = safeColor(content.theme?.accent, defaults.accent);
  const background = safeColor(content.theme?.background, defaults.background);
  const rootStyle = {
    '--lp-p': primary,
    '--lp-a': accent,
    '--lp-bg': background,
    '--lp-on-p': readableOn(primary),
    '--lp-on-a': readableOn(accent),
    // The fashion hero is a gradient from a darkened primary: judge the text against its middle
    '--lp-on-hero': readableOn(darken(primary, 0.86)),
  } as React.CSSProperties;

  const rootRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef<HTMLElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  /* ---------------------------------------------------------------- choices */
  const signature = items
    .map((p) => `${p.id}:${p.preselect ? 1 : 0}:${p.qty}:${p.variations.map((v) => `${v.id}-${v.stock}`).join('.')}`)
    .join('|');
  const [picks, setPicks] = useState<Record<number, Pick>>(() => Object.fromEntries(items.map((p) => [p.id, initialPick(p)])));
  const signatureRef = useRef(signature);
  useEffect(() => {
    if (signatureRef.current === signature) return;
    signatureRef.current = signature;
    setPicks(Object.fromEntries(items.map((p) => [p.id, initialPick(p)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const lines: Line[] = useMemo(
    () =>
      items.flatMap((product) => {
        const pick = picks[product.id];
        if (!pick?.checked || !isAvailable(product)) return [];
        const variation = product.hasVariations ? findVariation(product, pick.options) : null;
        if (product.hasVariations && !variation) return [];
        const stock = variation ? variation.stock : product.stock;
        const qty = Math.max(1, Math.min(pick.qty, Math.max(1, stock)));
        const { price, regular } = priceFor(product, variation);
        return [{ key: `${product.id}:${variation?.id || ''}`, product, variation, qty, price, regular, lineTotal: price * qty }];
      }),
    [items, picks]
  );
  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.lineTotal, 0), [lines]);
  const quantity = useMemo(() => lines.reduce((sum, line) => sum + line.qty, 0), [lines]);

  /* --------------------------------------------------------------- delivery */
  const zonesLoaded = Boolean(settings?.shipping);
  // v3.11 — Dashboard → Checkout → Delivery off hides the area and its charge here too
  const deliveryOn = (settings as any)?.checkout_config?.deliveryEnabled !== false;
  const deliveryOffNote = String((settings as any)?.checkout_config?.deliveryOffNote || '');
  const zones = useMemo(
    () => (deliveryOn ? (settings?.shipping?.zones || []).filter((z: any) => z && z.id && z.enabled !== false) : []),
    [settings?.shipping?.zones, deliveryOn]
  );
  const [zoneId, setZoneId] = useState('');
  // v3.9 — district & thana, and the delivery area they imply
  const geo = useMemo(() => cleanGeoConfig((settings as any)?.checkout_geo_config), [settings]);
  const autoShip = deliveryOn && geo.enabled && geo.autoShipping;
  const [district, setDistrict] = useState('');
  const [thana, setThana] = useState('');
  const autoZone = autoShip ? zoneForPlace(geo, zones, district, thana) : '';
  useEffect(() => {
    if (autoShip) return;
    if (zones.length > 0 && !zones.some((z) => z.id === zoneId)) setZoneId(zones[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, autoShip]);
  useEffect(() => {
    if (autoShip) setZoneId(autoZone);
  }, [autoShip, autoZone]);
  const shippingLines = useMemo(
    () =>
      lines.map((line) => ({
        quantity: line.qty,
        lineTotal: line.lineTotal,
        freeShipping: line.product.freeShipping,
        charges: line.product.charges,
      })),
    [lines]
  );
  const quotes = useMemo(() => {
    const out: Record<string, ShippingResult> = {};
    zones.forEach((zone) => {
      out[zone.id] = computeShipping({
        zone,
        lines: shippingLines,
        rules: settings?.free_shipping_config || null,
        landing: shippingCfg,
      });
    });
    return out;
  }, [zones, shippingLines, settings?.free_shipping_config, shippingCfg]);
  const activeZone = zones.find((z) => z.id === zoneId) || null;
  const activeQuote = activeZone ? quotes[activeZone.id] : null;
  const shippingCharge = activeQuote?.charge || 0;
  const total = Math.max(0, subtotal + shippingCharge);

  /** "Add 1 more item for free delivery" */
  const freeHint = useMemo(() => {
    if (!activeQuote || activeQuote.charge <= 0 || lines.length === 0) return '';
    if (shippingCfg.mode === 'custom') {
      const minQty = num(shippingCfg.freeMinQuantity);
      const minSubtotal = num(shippingCfg.freeMinSubtotal);
      if (minQty > 0 && quantity < minQty) return `আর ${minQty - quantity}টি নিলে ডেলিভারি চার্জ ফ্রি!`;
      if (minSubtotal > 0 && subtotal < minSubtotal) return `আর ${money(minSubtotal - subtotal)} এর পণ্য নিলে ডেলিভারি চার্জ ফ্রি!`;
      return '';
    }
    if (shippingCfg.mode === 'store' && settings?.free_shipping_config?.showProgress !== false) {
      if (activeQuote.remainingItemsForFree > 0) return `আর ${activeQuote.remainingItemsForFree}টি নিলে ডেলিভারি চার্জ ফ্রি!`;
      if (activeQuote.remainingForFree > 0) return `আর ${money(activeQuote.remainingForFree)} এর পণ্য নিলে ডেলিভারি চার্জ ফ্রি!`;
    }
    return '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuote, lines.length, shippingCfg, quantity, subtotal, settings?.free_shipping_config?.showProgress, currency]);

  /* ---------------------------------------------------------------- payment */
  const payOptions = useMemo(() => {
    const methods = settings?.payment?.methods || [];
    const enabled = methods.filter((m) => m && m.enabled !== false);
    const codMethod = enabled.find((m) => m.id === 'cod');
    const list: Array<{ id: string; name: string; description: string; kind: 'cod' | 'online' | 'manual'; color: string; soft: string; short: string; logoUrl?: string }> = [];
    if (methods.length === 0 || codMethod) {
      list.push({
        id: 'cod',
        name: codMethod?.name || 'ক্যাশ অন ডেলিভারি',
        description: content.checkout.codText || codMethod?.description || '',
        kind: 'cod',
        color: '#16a34a',
        soft: '#dcfce7',
        short: 'COD',
        logoUrl: (codMethod as any)?.logoUrl || '',
      });
    }
    (settings?.online_payments || []).forEach((option) => {
      if (!isOnlineGateway(option?.id)) return;
      const look = GATEWAY_LOOK[option.id];
      list.push({
        id: option.id,
        name: option.name || look.short,
        description: option.description || '',
        kind: 'online',
        color: look.color,
        soft: look.soft,
        short: look.short,
        logoUrl: (option as any).logoUrl || '',
      });
    });
    if (list.length === 0) {
      // No COD and no gateway: offer whatever the shop enabled that needs no transaction id
      enabled
        .filter((m) => !m.requiresTxId && !isOnlineGateway(m.id))
        .forEach((m) =>
          list.push({ id: m.id, name: m.name, description: m.description || '', kind: 'manual', color: primary, soft: '#f1f5f9', short: m.name })
        );
    }
    return list;
  }, [settings?.payment?.methods, settings?.online_payments, content.checkout.codText, primary]);
  const [payment, setPayment] = useState('');
  useEffect(() => {
    if (payOptions.length > 0 && !payOptions.some((o) => o.id === payment)) setPayment(payOptions[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payOptions]);
  const codAllowed = payOptions.some((o) => o.id === 'cod');

  /* ------------------------------------------------------------------- form */
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [blocked, setBlocked] = useState<{ message: string; reason: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<'form' | 'redirecting' | 'payfail' | 'done'>('form');
  const [placed, setPlaced] = useState<any>(null);
  const [payError, setPayError] = useState('');
  const [codAfterFail, setCodAfterFail] = useState(false);
  const submittingRef = useRef(false);
  const checkoutTrackedRef = useRef(false);
  const orderPlacedRef = useRef(false);
  const sessionKeyRef = useRef('');
  const lastTrackRef = useRef('');

  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [faqOpen, setFaqOpen] = useState<number>(0);
  const [endedFor, setEndedFor] = useState<number | null>(null);
  const [checkoutInView, setCheckoutInView] = useState(false);

  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  /* --------------------------------------------------------------- tracking */
  const trackProduct = useCallback((product: LpProduct, variation: LpVariation | null) => {
    const { price, regular } = priceFor(product, variation);
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      hasVariations: product.hasVariations,
      price: String(regular ?? price),
      salePrice: regular ? String(price) : null,
      image: variation?.image || product.image,
      // Same rule as the Meta catalog feed (catalogItemId on the server)
      feedId: variation ? String(variation.sku || '').trim() || `${String(product.sku || '').trim() || product.id}-${variation.id}` : undefined,
    };
  }, []);

  const trackAdd = (product: LpProduct, variation: LpVariation | null, qty: number) => {
    if (!live) return;
    const item = trackProduct(product, variation);
    tracking.addToCart(item, qty, variation?.id || null);
    const { price } = priceFor(product, variation);
    extraPixel.mirror('AddToCart', {
      content_name: product.name,
      content_ids: [item.feedId || item.sku || String(item.id)],
      content_type: 'product',
      num_items: qty,
      value: Math.round(price * qty * 100) / 100,
      currency: currencyCode,
    });
  };

  // One visit per browser session; drafts and the dashboard preview are not counted
  useEffect(() => {
    if (!live || !pageId) return;
    const key = `pharma:lp-viewed:${pageId}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(key) === '1';
      if (!seen) sessionStorage.setItem(key, '1');
    } catch {
      /* private mode: count it */
    }
    if (!seen) fetch(`/api/lp/${pageId}/view`, { method: 'POST', keepalive: true }).catch(() => undefined);
  }, [live, pageId]);

  // Page pixel first, so the ViewContent below reaches it too
  useEffect(() => {
    if (!live) return;
    const pixelId = String(content.pixel?.metaPixelId || '').replace(/\D/g, '');
    if (pixelId.length >= 8) extraPixel.init(pixelId);
    const first = items[0];
    if (first) {
      const item = trackProduct(first, null);
      tracking.viewItem(item);
      extraPixel.mirror('ViewContent', {
        content_name: first.name,
        content_ids: [item.sku || String(item.id)],
        content_type: first.hasVariations ? 'product_group' : 'product',
        value: priceFor(first, null).price,
        currency: currencyCode,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, pageId]);

  // Tab title and share tags. Deferred a tick so App's own title effect (which
  // runs after this child effect) does not overwrite it.
  useEffect(() => {
    if (mode === 'preview') return;
    const timer = window.setTimeout(() => {
      const title = (content.seo.title || page?.title || content.hero.title || '').trim();
      if (title) document.title = title;
      const setMeta = (attr: 'name' | 'property', key: string, value: string) => {
        if (!value) return;
        let tag = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
        if (!tag) {
          tag = document.createElement('meta');
          tag.setAttribute(attr, key);
          document.head.appendChild(tag);
        }
        tag.setAttribute('content', value);
      };
      const description = (content.seo.description || content.hero.subtitle || '').trim().slice(0, 300);
      setMeta('name', 'description', description);
      setMeta('property', 'og:title', title);
      setMeta('property', 'og:description', description);
      setMeta('property', 'og:image', content.seo.image || content.hero.image || items[0]?.image || '');
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, page?.title, content.seo, content.hero.title, content.hero.subtitle, content.hero.image, settings?.seo_config, settings?.general?.storeName]);

  // The sticky phone button steps aside while the checkout is on screen
  useEffect(() => {
    const el = orderRef.current;
    if (!el) return;
    const view = (el.ownerDocument.defaultView || window) as Window & typeof globalThis;
    const Observer = view.IntersectionObserver || window.IntersectionObserver;
    if (!Observer) return;
    const observer = new Observer(([entry]) => setCheckoutInView(Boolean(entry?.isIntersecting)), {
      rootMargin: '0px 0px -25% 0px',
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (phase === 'done') successRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [phase]);

  /* ---------------------------------------- incomplete-order capture (live) */
  useEffect(() => {
    if (live && pageId) sessionKeyRef.current = lpSessionKey(pageId);
  }, [live, pageId]);

  const trackBody = useMemo(() => {
    if (!live) return '';
    return JSON.stringify({
      sessionKey: sessionKeyRef.current,
      customerName: name.trim(),
      customerPhone: phone,
      customerAddress: address.trim(),
      shippingZone: activeZone?.name || zoneId,
      district: district || undefined,
      thana: thana || undefined,
      paymentMethod: payment,
      items: lines.map((line) => ({
        productId: line.product.id,
        variationId: line.variation?.id || undefined,
        name: line.product.name,
        image: line.variation?.image || line.product.image || '',
        price: line.price,
        quantity: line.qty,
        variationLabel: variationText(line.variation) || undefined,
      })),
    });
  }, [live, name, phone, address, activeZone?.name, zoneId, payment, lines, district, thana]);

  const sendTrack = useCallback(() => {
    if (!live || orderPlacedRef.current || !trackBody || !sessionKeyRef.current) return;
    if (!name.trim() && phone.length < 6) return;
    if (trackBody === lastTrackRef.current) return;
    lastTrackRef.current = trackBody;
    fetch('/api/checkout/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: trackBody,
      keepalive: true,
    }).catch(() => undefined);
  }, [live, trackBody, name, phone]);

  useEffect(() => {
    if (!live || phase !== 'form') return;
    const timer = window.setTimeout(sendTrack, 1500);
    return () => window.clearTimeout(timer);
  }, [live, phase, sendTrack]);

  /* ---------------------------------------------------------------- actions */
  const goToOrder = () => orderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const toggleProduct = (product: LpProduct) => {
    if (!isAvailable(product) || phase !== 'form') return;
    const current = picks[product.id] || initialPick(product);
    const next = { ...current, checked: !current.checked };
    setPicks((prev) => ({ ...prev, [product.id]: next }));
    clearError('products');
    if (next.checked) trackAdd(product, findVariation(product, next.options), next.qty);
  };

  const pickOption = (product: LpProduct, group: string, value: string) => {
    if (phase !== 'form') return;
    const current = picks[product.id] || initialPick(product);
    let options: Record<string, string> = { ...current.options, [group]: value };
    // Only in stock with other choices: move to the closest in-stock option
    if (!product.variations.some((v) => v.stock > 0 && matchesSelection(v, options))) {
      let best: LpVariation | null = null;
      let bestScore = -1;
      for (const v of product.variations) {
        if (v.stock <= 0 || v.combination[group] !== value) continue;
        const score = Object.entries(current.options).filter(([key, chosen]) => v.combination[key] === chosen).length;
        if (score > bestScore) {
          best = v;
          bestScore = score;
        }
      }
      if (best) options = { ...best.combination };
    }
    const wasChecked = current.checked;
    const next = { ...current, options, checked: true };
    const before = findVariation(product, current.options);
    const after = findVariation(product, options);
    if (after) next.qty = Math.max(1, Math.min(next.qty, Math.max(1, after.stock)));
    setPicks((prev) => ({ ...prev, [product.id]: next }));
    clearError('products');
    if (after && (!wasChecked || after.id !== before?.id)) trackAdd(product, after, next.qty);
  };

  const setQty = (product: LpProduct, qty: number, max: number) => {
    if (phase !== 'form') return;
    const current = picks[product.id] || initialPick(product);
    const nextQty = Math.max(1, Math.min(max, qty));
    const next = { ...current, qty: nextQty, checked: current.checked || nextQty > current.qty };
    setPicks((prev) => ({ ...prev, [product.id]: next }));
    if (!current.checked && next.checked) {
      clearError('products');
      trackAdd(product, findVariation(product, next.options), nextQty);
    }
  };

  const trackItems = () => lines.map((line) => ({ product: trackProduct(line.product, line.variation), quantity: line.qty }));

  /** The customer starts typing their details — ticking a product alone is AddToCart */
  const onCheckoutFocus = (event: React.FocusEvent<HTMLFormElement>) => {
    const tag = (event.target as HTMLElement)?.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
    if (!live || checkoutTrackedRef.current) return;
    checkoutTrackedRef.current = true;
    tracking.initiateCheckout(trackItems(), subtotal);
    extraPixel.mirror('InitiateCheckout', {
      value: subtotal,
      currency: currencyCode,
      num_items: quantity,
      content_type: 'product',
      content_ids: lines.map((line) => String(line.product.sku || line.product.id)),
    });
  };

  const choosePayment = (id: string) => {
    if (phase !== 'form') return;
    setPayment(id);
    clearError('payment');
    if (live && isOnlineGateway(id)) {
      tracking.addPaymentInfo(id, total);
      extraPixel.mirror('AddPaymentInfo', { value: total, currency: currencyCode });
    }
  };

  const FIELD_ORDER = ['products', 'name', 'phone', 'district', 'thana', 'address', 'zone', 'payment'];

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    const checked = items.filter((p) => picks[p.id]?.checked && isAvailable(p));
    if (checked.length === 0) {
      errs.products = items.length === 0 ? 'এই অফারে এখন কোনো প্রোডাক্ট নেই।' : 'অন্তত একটি প্রোডাক্ট নির্বাচন করুন';
    } else {
      const missing = checked.find((p) => p.hasVariations && !findVariation(p, picks[p.id].options));
      if (missing) {
        const need = missing.groups.filter((g) => !picks[missing.id].options[g.name]).map((g) => g.name);
        errs.products = `"${missing.name}" — ${need.length ? need.join(', ') : 'অপশন'} বেছে নিন`;
      }
    }
    if (!name.trim()) errs.name = 'আপনার নাম লিখুন';
    if (!phone) errs.phone = 'মোবাইল নাম্বার লিখুন';
    else if (phone.length !== 11) errs.phone = `মোবাইল নাম্বার ১১ ডিজিটের হতে হবে (আপনি ${phone.length} ডিজিট দিয়েছেন)`;
    else if (!PHONE_RE.test(phone)) errs.phone = 'সঠিক মোবাইল নাম্বার দিন — 013 থেকে 019 দিয়ে শুরু (যেমন 01712345678)';
    const addr = address.trim();
    if (!addr) errs.address = 'সম্পূর্ণ ঠিকানা লিখুন';
    else if (addr.length < 5) errs.address = 'ঠিকানাটি আরও বিস্তারিত লিখুন (বাড়ি, রোড, এলাকা, থানা, জেলা)';
    if (geo.enabled && !district) errs.district = 'আপনার জেলা বাছাই করুন';
    else if (geo.enabled && geo.requireThana && !thana) errs.thana = 'আপনার থানা বাছাই করুন';
    if (zones.length > 0 && !activeZone && !(autoShip && !district)) errs.zone = 'ডেলিভারি এলাকা বেছে নিন';
    if (payOptions.length === 0) errs.payment = 'এই মুহূর্তে কোনো পেমেন্ট পদ্ধতি চালু নেই। আমাদের কল করুন।';
    else if (!payOptions.some((o) => o.id === payment)) errs.payment = 'পেমেন্ট পদ্ধতি বেছে নিন';
    return errs;
  };

  const focusFirst = (errs: Record<string, string>) => {
    const first = FIELD_ORDER.find((key) => errs[key]);
    if (!first) return;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = el.matches('input,textarea') ? el : el.querySelector<HTMLElement>('input,textarea');
    window.setTimeout(() => input?.focus({ preventScroll: true }), 350);
  };

  const redirectToGateway = async (order: any) => {
    setPhase('redirecting');
    setPayError('');
    try {
      await startOnlinePayment(
        {
          orderNumber: order.orderNumber,
          customerPhone: order.customerPhone || phone,
          paymentMethod: order.paymentMethod || payment,
        },
        '/lp/' + slug
      );
      // The browser is on its way to the gateway
    } catch (err: any) {
      setPayError(err?.message || 'পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।');
      setPhase('payfail');
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current || phase !== 'form') return;
    if (ordersOff) {
      setFormError(
        mode === 'preview' ? 'Preview — orders are turned off here.' : 'Draft preview — activate the page in the dashboard to take orders.'
      );
      return;
    }
    const errs = validate();
    setErrors(errs);
    const count = Object.keys(errs).length;
    if (count > 0) {
      setFormError(count === 1 ? Object.values(errs)[0] : 'লাল চিহ্নিত তথ্যগুলো ঠিক করে আবার চেষ্টা করুন।');
      focusFirst(errs);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setFormError('');
    setBlocked(null);
    const itemsForTracking = trackItems();
    if (!checkoutTrackedRef.current) {
      checkoutTrackedRef.current = true;
      tracking.initiateCheckout(itemsForTracking, subtotal);
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name.trim(),
          customerPhone: phone,
          customerAddress: address.trim(),
          shippingZone: activeZone?.id || '',
          district: geo.enabled ? district : undefined,
          thana: geo.enabled ? thana : undefined,
          paymentMethod: payment,
          notes: content.checkout.noteEnabled ? note.trim() : '',
          items: lines.map((line) =>
            line.variation
              ? { productId: line.product.id, quantity: line.qty, variationId: line.variation.id }
              : { productId: line.product.id, quantity: line.qty }
          ),
          landingPageId: pageId,
          checkoutSessionKey: sessionKeyRef.current || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data?.blocked) {
        setBlocked({ message: data.error || '', reason: data.reason || '' });
        return;
      }
      if (!res.ok || !data?.success || !data?.order) {
        throw new Error(data?.error || 'অর্ডারটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।');
      }

      const order = data.order;
      orderPlacedRef.current = true;
      clearLpSessionKey(pageId);
      setPlaced(order);
      // The server already sent this Purchase to the Conversions API with the
      // order number as event id; the browser copy is deduplicated against it.
      tracking.purchase(order, itemsForTracking);
      extraPixel.mirror('Purchase', {
        value: num(order.total) || total,
        currency: currencyCode,
        content_type: 'product',
        content_ids: lines.map((line) => String(line.product.sku || line.product.id)),
        num_items: quantity,
        order_id: order.orderNumber,
      });

      if (data.payment && isOnlineGateway(order.paymentMethod || payment)) {
        await redirectToGateway(order);
        return;
      }
      setPhase('done');
      import('canvas-confetti')
        .then((m) => m.default({ particleCount: 90, spread: 75, origin: { y: 0.6 } }))
        .catch(() => undefined);
    } catch (err: any) {
      setFormError(err?.message || 'অর্ডারটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------- derived views */
  const heroImage = content.hero.image || items[0]?.image || '';
  const teaser = useMemo(() => {
    const first = items[0];
    if (!first) return null;
    if (first.hasVariations) {
      const range = rangeOf(first);
      return { price: range.min, regular: null as number | null, from: range.max > range.min };
    }
    const { price, regular } = priceFor(first, null);
    return { price, regular, from: false };
  }, [items]);
  const teaserPct = teaser?.regular && teaser.regular > teaser.price ? Math.round(((teaser.regular - teaser.price) / teaser.regular) * 100) : 0;

  const bullets = content.hero.bullets.filter((b) => String(b || '').trim());
  const features = content.features.items.filter((f) => String(f?.title || '').trim() || String(f?.text || '').trim());
  const benefits = content.benefits.items.filter((b) => String(b || '').trim());
  const faqs = content.faq.items.filter((f) => String(f?.q || '').trim());
  const reviewImages = content.reviews.images.filter(Boolean);
  const reviewItems = content.reviews.items.filter((r) => String(r?.text || '').trim() || String(r?.name || '').trim());
  const galleryImages = useMemo(() => {
    const own = content.gallery.images.filter(Boolean);
    if (own.length > 0) return own;
    // Nothing uploaded yet: the products' own photos
    const pool = Array.from(new Set(items.flatMap((p) => [...p.photos, ...p.variations.map((v) => v.image)]).filter(Boolean)));
    return pool.length >= 2 ? pool.slice(0, 8) : [];
  }, [content.gallery.images, items]);
  const embed = content.video.enabled ? videoEmbed(content.video.url) : null;
  const endsAtMs = content.offer.endsAt ? Date.parse(content.offer.endsAt) : NaN;
  const hasCountdown = Number.isFinite(endsAtMs);
  const offerEnded = hasCountdown && (endedFor === endsAtMs || endsAtMs <= Date.now());
  const showOffer = content.offer.enabled && Boolean(content.offer.title || content.offer.text) && !offerEnded;
  const onOfferEnd = useCallback(() => setEndedFor(endsAtMs), [endsAtMs]);

  const footerPhone = content.footer.phone || settings?.general?.phone || '';
  const footerWhatsapp = content.footer.whatsapp || settings?.general?.whatsapp || '';
  const whatsappLink = waHref(footerWhatsapp);
  const storeName = settings?.general?.storeName || settings?.logo_config?.pharmacyName || '';
  const locked = phase !== 'form';
  const showSticky = phase !== 'done' && items.length > 0;

  const sectionPad = 'py-12 sm:py-16';
  // One max-width per element: two max-w-* classes on one element fight over order
  const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
  const container4 = 'mx-auto w-full max-w-4xl px-4 sm:px-6';
  const container3 = 'mx-auto w-full max-w-3xl px-4 sm:px-6';
  const card = organic
    ? 'rounded-(--lp-radius) border border-(--lp-line) bg-(--lp-card) shadow-(--lp-shadow)'
    : 'rounded-(--lp-radius) border border-(--lp-line) bg-(--lp-card) shadow-[0_10px_30px_-18px_rgba(15,23,42,0.28)]';
  const raised = organic ? 'bg-white/55' : 'bg-white';

  const ctaButton = (label: string, extra = '') => (
    <button
      type="button"
      onClick={goToOrder}
      className={`inline-flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-full bg-(--lp-a) px-7 py-3 text-[17px] font-bold text-(--lp-on-a) shadow-[0_14px_30px_-12px_rgba(0,0,0,0.45)] transition hover:brightness-110 active:scale-[0.98] sm:px-9 sm:text-lg ${extra}`}
    >
      <ShoppingBag className="h-5 w-5 shrink-0" />
      <span>{label || 'এখনই অর্ডার করুন'}</span>
      <ArrowRight className="h-5 w-5 shrink-0" />
    </button>
  );

  const teaserBlock = (onDark: boolean) =>
    teaser && teaser.price > 0 ? (
      <div className={`inline-flex flex-wrap items-baseline justify-center gap-x-2.5 gap-y-1 ${onDark ? '' : 'text-(--lp-ink)'}`}>
        <span className="text-sm opacity-80">মূল্য</span>
        <span className="ds-num text-3xl font-extrabold sm:text-4xl">{money(teaser.price)}</span>
        {teaser.from && <span className="text-sm opacity-80">থেকে</span>}
        {teaser.regular && <span className="ds-num text-lg line-through opacity-60">{money(teaser.regular)}</span>}
        {teaserPct > 0 && (
          <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">{teaserPct}% ছাড়</span>
        )}
      </div>
    ) : null;

  /* ------------------------------------------------------------------- hero */
  const heroFashion = (
    <section className="relative overflow-hidden bg-[linear-gradient(135deg,var(--lp-p-dark),var(--lp-p))] text-(--lp-on-hero)">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-(--lp-a)/25 blur-3xl" />
      <div
        className={`relative py-10 sm:py-14 lg:py-20 ${
          heroImage
            ? `${container} grid gap-7 [grid-template-areas:"head"_"media"_"body"] lg:grid-cols-2 lg:gap-x-12 lg:gap-y-6 lg:[grid-template-areas:"head_media"_"body_media"]`
            : container3
        }`}
      >
        <div className="lp-fade text-center [grid-area:head] lg:self-end lg:text-left">
          {content.hero.badge && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold ring-1 ring-white/25">
              <Sparkles className="h-4 w-4" /> {content.hero.badge}
            </span>
          )}
          <h1 className="mt-4 text-[28px] font-extrabold leading-[1.3] sm:text-[40px] lg:text-[48px]">{content.hero.title || page?.title}</h1>
          {content.hero.highlight && (
            <p className="mt-3 text-lg font-bold text-(--lp-a) sm:text-2xl">{content.hero.highlight}</p>
          )}
        </div>
        {heroImage && (
          <div className="lp-fade [grid-area:media] lg:self-center">
            <div className="relative mx-auto w-full max-w-[440px]">
              <div aria-hidden className="absolute inset-3 translate-x-3 translate-y-3 rounded-[2rem] bg-(--lp-a)/40" />
              <img
                src={heroImage}
                alt={content.hero.title || page?.title || ''}
                decoding="async"
                fetchPriority="high"
                onError={fallbackImage}
                className="relative aspect-square w-full rounded-[2rem] bg-white object-cover shadow-2xl ring-4 ring-white/80"
              />
            </div>
          </div>
        )}
        <div className="lp-fade text-center [grid-area:body] lg:self-start lg:text-left">
          {content.hero.subtitle && <p className="text-base opacity-90 sm:text-lg">{content.hero.subtitle}</p>}
          {bullets.length > 0 && (
            <ul className="mx-auto mt-5 inline-flex flex-col gap-2.5 text-left lg:mx-0">
              {bullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-(--lp-p)">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                  <span className="font-medium">{bullet}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex flex-col items-center gap-4 lg:items-start">
            {teaserBlock(true)}
            {ctaButton(content.hero.ctaText)}
          </div>
        </div>
      </div>
    </section>
  );

  const heroOrganic = (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-40 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-(--lp-p)/15 blur-3xl" />
      <div className={`relative ${container4} flex flex-col items-center py-10 text-center sm:py-14 lg:py-16`}>
        {content.hero.badge && (
          <span className="lp-fade inline-flex items-center gap-1.5 rounded-full bg-(--lp-a) px-4 py-1.5 text-sm font-semibold text-(--lp-on-a)">
            <Leaf className="h-4 w-4" /> {content.hero.badge}
          </span>
        )}
        <h1 className="lp-fade mt-4 text-[28px] font-extrabold leading-[1.3] sm:text-[40px] lg:text-[46px]">{content.hero.title || page?.title}</h1>
        {content.hero.highlight && <p className="lp-fade mt-3 text-lg font-bold text-(--lp-p) sm:text-2xl">{content.hero.highlight}</p>}
        {heroImage && (
          <div className="lp-fade relative mt-7 w-full max-w-[460px]">
            <div aria-hidden className="absolute -inset-3 rounded-[2.5rem] border-2 border-dashed border-(--lp-p)/30" />
            <img
              src={heroImage}
              alt={content.hero.title || page?.title || ''}
              decoding="async"
              fetchPriority="high"
              onError={fallbackImage}
              className="relative aspect-square w-full rounded-[2.25rem] bg-white object-cover shadow-(--lp-shadow)"
            />
          </div>
        )}
        {content.hero.subtitle && <p className="mt-7 max-w-2xl text-base text-(--lp-muted) sm:text-lg">{content.hero.subtitle}</p>}
        {bullets.length > 0 && (
          <ul className="mt-5 flex flex-wrap justify-center gap-2">
            {bullets.map((bullet, i) => (
              <li
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full border border-(--lp-line) bg-(--lp-card) px-3.5 py-2 text-sm font-semibold shadow-sm"
              >
                <Check className="h-4 w-4 text-(--lp-a)" strokeWidth={3} /> {bullet}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-7 flex flex-col items-center gap-4">
          {teaserBlock(false)}
          {ctaButton(content.hero.ctaText, 'lp-float')}
        </div>
      </div>
    </section>
  );

  /* --------------------------------------------------------- product cards */
  const renderProductCard = (product: LpProduct) => {
    const pick = picks[product.id] || initialPick(product);
    const available = isAvailable(product);
    const checked = pick.checked && available;
    const variation = product.hasVariations ? findVariation(product, pick.options) : null;
    const priced = product.hasVariations && !variation ? null : priceFor(product, variation);
    const range = product.hasVariations && !variation ? rangeOf(product) : null;
    const stock = variation ? variation.stock : product.hasVariations ? null : product.stock;
    const maxQty = stock !== null ? Math.max(1, stock) : 99;
    const img = variation?.image || sharedImage(product, pick.options) || product.image || IMAGE_PLACEHOLDER;
    const missing = checked && product.hasVariations && !variation ? product.groups.filter((g) => !pick.options[g.name]).map((g) => g.name) : [];

    return (
      <div
        key={product.id}
        role="checkbox"
        aria-checked={checked}
        aria-disabled={!available || locked}
        tabIndex={available && !locked ? 0 : -1}
        onClick={() => toggleProduct(product)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            toggleProduct(product);
          }
        }}
        className={`relative select-none rounded-2xl border-2 p-3 transition sm:p-4 ${
          checked
            ? 'border-(--lp-p) bg-(--lp-p-soft) shadow-[0_10px_24px_-16px_rgba(15,23,42,0.45)]'
            : 'border-(--lp-line) bg-white hover:border-(--lp-p)/50'
        } ${available && !locked ? 'cursor-pointer' : 'cursor-not-allowed'} ${available ? '' : 'opacity-60'}`}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition ${
              checked ? 'border-(--lp-p) bg-(--lp-p) text-(--lp-on-p)' : 'border-slate-300 bg-white'
            }`}
          >
            {checked && <Check className="h-4 w-4" strokeWidth={3} />}
          </span>
          <img
            src={img}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onError={fallbackImage}
            className="h-16 w-16 shrink-0 rounded-xl border border-(--lp-line) bg-white object-cover sm:h-20 sm:w-20"
          />
          <div className="min-w-0 flex-1">
            <p className="ds-clamp-2 font-semibold leading-snug">{product.name}</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {priced ? (
                <>
                  <span className="ds-num text-lg font-extrabold text-(--lp-p)">{money(priced.price)}</span>
                  {priced.regular && <span className="ds-num text-sm text-slate-400 line-through">{money(priced.regular)}</span>}
                </>
              ) : range ? (
                <span className="ds-num text-lg font-extrabold text-(--lp-p)">
                  {range.max > range.min ? `${money(range.min)} – ${money(range.max)}` : money(range.min)}
                </span>
              ) : null}
              {product.unit && <span className="text-xs text-(--lp-muted)">/ {product.unit}</span>}
            </div>
            {!available ? (
              <p className="mt-1 text-xs font-semibold text-red-600">স্টক শেষ</p>
            ) : stock !== null && stock <= 5 ? (
              <p className="mt-1 text-xs font-semibold text-amber-700">মাত্র {stock}টি বাকি</p>
            ) : null}
          </div>
        </div>

        {product.hasVariations && available && (
          <div className="mt-3 space-y-2.5" onClick={(event) => event.stopPropagation()}>
            {product.groups.map((group) => (
              <div key={group.name}>
                <p className="mb-1.5 text-xs font-semibold text-(--lp-muted)">
                  {group.name}
                  {pick.options[group.name] ? `: ${pick.options[group.name]}` : ''}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.values.map((value) => {
                    const selected = pick.options[group.name] === value;
                    const ok = product.variations.some((v) => v.stock > 0 && v.combination[group.name] === value);
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={selected}
                        disabled={(!ok && !selected) || locked}
                        onClick={() => pickOption(product, group.name, value)}
                        className={`h-9 min-w-10 rounded-lg border-2 px-3 text-sm font-semibold transition ${
                          selected
                            ? 'cursor-pointer border-(--lp-p) bg-(--lp-p) text-(--lp-on-p)'
                            : ok
                            ? 'cursor-pointer border-(--lp-line) bg-white hover:border-(--lp-p)'
                            : 'cursor-not-allowed border-dashed border-slate-200 bg-slate-50 text-slate-400 line-through'
                        }`}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {missing.length > 0 && (
              <p className="text-xs font-semibold text-(--lp-p)">↑ {missing.join(', ')} বেছে নিন</p>
            )}
          </div>
        )}

        {available && (
          <div
            className="mt-3 flex items-center gap-3 border-t border-(--lp-line) pt-3"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="text-sm text-(--lp-muted)">পরিমাণ</span>
            <div className="inline-flex items-center rounded-xl border-2 border-(--lp-line) bg-white">
              <button
                type="button"
                aria-label="কমান"
                disabled={pick.qty <= 1 || locked}
                onClick={() => setQty(product, pick.qty - 1, maxQty)}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-l-lg text-(--lp-ink) hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="ds-num w-9 text-center font-bold" aria-live="polite">
                {pick.qty}
              </span>
              <button
                type="button"
                aria-label="বাড়ান"
                disabled={pick.qty >= maxQty || locked}
                onClick={() => setQty(product, pick.qty + 1, maxQty)}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-r-lg text-(--lp-ink) hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {checked && priced && <span className="ds-num ml-auto font-bold">{money(priced.price * pick.qty)}</span>}
          </div>
        )}
      </div>
    );
  };

  /* -------------------------------------------------------------- checkout */
  const fieldClass = (key: string) =>
    `w-full rounded-xl border-2 bg-white px-3.5 text-base text-(--lp-ink) outline-none transition placeholder:text-slate-400 focus:border-(--lp-p) focus:ring-4 focus:ring-(--lp-p)/15 ${
      errors[key] ? 'border-red-400' : 'border-(--lp-line)'
    }`;
  const errorText = (key: string) =>
    errors[key] ? (
      <p className="mt-1.5 flex items-start gap-1 text-sm font-medium text-red-600">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{errors[key]}</span>
      </p>
    ) : null;
  const boxTitle = (icon: React.ReactNode, text: string) => (
    <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-(--lp-p-soft) text-(--lp-p)">{icon}</span>
      {text}
    </h3>
  );

  const offLabel = mode === 'preview' ? 'Preview — orders are turned off here' : 'Draft — orders are turned off';
  const submitLabel = ordersOff
    ? offLabel
    : submitting
    ? 'অর্ডার নেওয়া হচ্ছে…'
    : phase === 'redirecting'
    ? 'পেমেন্ট পেজে নেওয়া হচ্ছে…'
    : `${content.checkout.buttonText || 'অর্ডার কনফার্ম করুন'} — ${money(total)}`;

  const summaryCard = (
    <div className={`${card} p-4 sm:p-5`}>
      {boxTitle(<ShoppingBag className="h-4 w-4" />, 'আপনার অর্ডার')}
      {lines.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-(--lp-line) p-4 text-center text-sm text-(--lp-muted)">
          উপরে থেকে প্রোডাক্ট নির্বাচন করুন
        </p>
      ) : (
        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line.key} className="flex items-center gap-3">
              <img
                src={line.variation?.image || line.product.image || IMAGE_PLACEHOLDER}
                alt=""
                loading="lazy"
                decoding="async"
                onError={fallbackImage}
                className="h-11 w-11 shrink-0 rounded-lg border border-(--lp-line) bg-white object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="ds-clamp-1 text-sm font-semibold leading-snug">{line.product.name}</p>
                <p className="text-xs text-(--lp-muted)">
                  {variationText(line.variation) ? `${variationText(line.variation)} · ` : ''}
                  <span className="ds-num">
                    {money(line.price)} × {line.qty}
                  </span>
                </p>
              </div>
              <span className="ds-num shrink-0 font-bold">{money(line.lineTotal)}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-4 space-y-2 border-t border-(--lp-line) pt-4 text-[15px]">
        <div className="flex justify-between gap-3">
          <dt className="text-(--lp-muted)">সাবটোটাল</dt>
          <dd className="ds-num font-semibold">{money(subtotal)}</dd>
        </div>
        {deliveryOn ? (
          <div className="flex justify-between gap-3">
            <dt className="min-w-0 text-(--lp-muted)">
              ডেলিভারি চার্জ{activeZone ? <span className="text-xs"> ({activeZone.name})</span> : null}
            </dt>
            <dd className="ds-num shrink-0 font-semibold">
              {activeQuote && activeQuote.charge <= 0 ? <span className="text-emerald-600">ফ্রি</span> : money(shippingCharge)}
            </dd>
          </div>
        ) : deliveryOffNote ? (
          <p className="flex items-center gap-2 text-sm text-(--lp-muted)">
            <Truck className="h-4 w-4 shrink-0" /> {deliveryOffNote}
          </p>
        ) : null}
        <div className="flex items-baseline justify-between gap-3 border-t border-(--lp-line) pt-3">
          <dt className="font-bold">সর্বমোট</dt>
          <dd className="ds-num text-2xl font-extrabold text-(--lp-p)">{money(total)}</dd>
        </div>
      </dl>
      {freeHint && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          <Truck className="h-4 w-4 shrink-0" /> {freeHint}
        </p>
      )}
    </div>
  );

  const paymentCard = (
    <div className={`${card} p-4 sm:p-5`} data-field="payment">
      {boxTitle(<CreditCard className="h-4 w-4" />, 'পেমেন্ট পদ্ধতি')}
      {payOptions.length === 0 ? (
        <p className="text-sm text-(--lp-muted)">এই মুহূর্তে কোনো পেমেন্ট পদ্ধতি চালু নেই।</p>
      ) : (
        <div role="radiogroup" aria-label="পেমেন্ট পদ্ধতি" className="space-y-2.5">
          {payOptions.map((option) => {
            const active = option.id === payment;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={locked}
                onClick={() => choosePayment(option.id)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-left transition disabled:cursor-not-allowed ${
                  active ? '' : 'border-(--lp-line) bg-white hover:border-slate-300'
                }`}
                style={active ? { borderColor: option.color, background: option.soft } : undefined}
              >
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2"
                  style={{ borderColor: active ? option.color : '#cbd5e1' }}
                >
                  {active && <span className="h-2.5 w-2.5 rounded-full" style={{ background: option.color }} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">{option.name}</span>
                  {option.description && <span className="block text-xs text-(--lp-muted)">{option.description}</span>}
                </span>
                {option.logoUrl ? (
                  <img
                    src={option.logoUrl}
                    alt=""
                    className="h-10 w-auto max-w-20 shrink-0 object-contain"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                ) : option.kind === 'cod' ? (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: option.soft, color: option.color }}>
                    <Banknote className="h-5 w-5" />
                  </span>
                ) : option.id === 'sslcommerz' ? (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: option.soft, color: option.color }}>
                    <CreditCard className="h-5 w-5" />
                  </span>
                ) : option.kind === 'online' ? (
                  <span className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-extrabold text-white" style={{ background: option.color }}>
                    {option.short}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
      {errorText('payment')}
    </div>
  );

  // v3.9 — the same thank-you design as the website checkout (ThankYouView)
  const successPanel = placed ? (
    <div ref={successRef} className="lp-fade mx-auto max-w-3xl" role="status">
      <ThankYouView
        embedded
        orderNumber={placed.orderNumber}
        phone={placed.customerPhone || phone}
        fallback={{ ...placed, total: num(placed.total) || total }}
        settings={settings}
        accent="var(--lp-p)"
        notice={
          codAfterFail ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              অনলাইন পেমেন্ট হয়নি — পণ্য হাতে পেয়ে টাকা পরিশোধ করতে পারবেন।
            </p>
          ) : undefined
        }
      />
    </div>
  ) : null;

  const checkoutSection = (
    <section
      id="order"
      ref={orderRef}
      className={`scroll-mt-3 ${sectionPad} ${organic ? '' : 'bg-white'}`}
    >
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <div className="mb-7 text-center">
          <h2 className="text-[22px] font-bold leading-[1.4] sm:text-[30px]">{content.checkout.title}</h2>
          {content.checkout.subtitle && <p className="mx-auto mt-2 max-w-2xl text-(--lp-muted)">{content.checkout.subtitle}</p>}
        </div>

        {ordersOff && phase !== 'done' && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {mode === 'preview'
                ? 'Preview — orders are turned off here. Everything else works like the real page.'
                : 'Draft preview — only you can see this page. Activate it in the dashboard to take orders.'}
            </span>
          </div>
        )}

        {phase === 'done' ? (
          successPanel
        ) : (
          <form onSubmit={submit} onFocus={onCheckoutFocus} onBlur={sendTrack} noValidate>
            <div className={`${card} p-4 sm:p-5`} data-field="products">
              {boxTitle(<Package className="h-4 w-4" />, content.checkout.productsTitle || 'প্রোডাক্ট নির্বাচন করুন')}
              {items.length === 0 ? (
                <p className="rounded-xl border-2 border-dashed border-(--lp-line) p-5 text-center text-(--lp-muted)">
                  {mode === 'preview' ? 'Add products to this page in the Products section.' : 'এই অফারে এখন কোনো প্রোডাক্ট নেই।'}
                </p>
              ) : (
                <div className={`grid gap-3 ${items.length > 1 ? 'md:grid-cols-2' : ''}`}>{items.map(renderProductCard)}</div>
              )}
              {errorText('products')}
            </div>

            <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
              <div className={`min-w-0 space-y-5 ${locked ? 'pointer-events-none opacity-60' : ''}`}>
                <div className={`${card} p-4 sm:p-5`}>
                  {boxTitle(<User className="h-4 w-4" />, 'আপনার তথ্য')}
                  <div className="space-y-4">
                    <div data-field="name">
                      <label htmlFor="lp-name" className="mb-1.5 block text-sm font-semibold">
                        {content.checkout.nameLabel || 'আপনার নাম'} <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="lp-name"
                        autoComplete="name"
                        value={name}
                        onChange={(event) => {
                          setName(event.target.value);
                          clearError('name');
                        }}
                        aria-invalid={Boolean(errors.name) || undefined}
                        placeholder="যেমন: মোঃ রহিম উদ্দিন"
                        className={`h-12 ${fieldClass('name')}`}
                      />
                      {errorText('name')}
                    </div>

                    <div data-field="phone">
                      <label htmlFor="lp-phone" className="mb-1.5 block text-sm font-semibold">
                        {content.checkout.phoneLabel || 'মোবাইল নাম্বার'} <span className="text-red-500">*</span>
                      </label>
                      <div
                        className={`flex h-12 items-stretch overflow-hidden rounded-xl border-2 bg-white transition focus-within:border-(--lp-p) focus-within:ring-4 focus-within:ring-(--lp-p)/15 ${
                          errors.phone ? 'border-red-400' : 'border-(--lp-line)'
                        }`}
                      >
                        <span className="ds-num grid shrink-0 place-items-center border-r-2 border-(--lp-line) bg-slate-50 px-3 font-semibold text-(--lp-muted)">
                          +88
                        </span>
                        <input
                          id="lp-phone"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          value={phone}
                          onChange={(event) => {
                            setPhone(normalizePhoneInput(event.target.value));
                            clearError('phone');
                          }}
                          aria-invalid={Boolean(errors.phone) || undefined}
                          placeholder="01XXXXXXXXX"
                          className="ds-num min-w-0 flex-1 bg-transparent px-3 text-base tracking-wide text-(--lp-ink) outline-none placeholder:text-slate-400"
                        />
                        {PHONE_RE.test(phone) && (
                          <span className="grid shrink-0 place-items-center pr-3 text-emerald-600">
                            <BadgeCheck className="h-5 w-5" />
                          </span>
                        )}
                      </div>
                      {errorText('phone')}
                    </div>

                    {geo.enabled && (
                      <div data-field="district">
                        <DistrictThanaFields
                          config={geo}
                          district={district}
                          thana={thana}
                          variant="landing"
                          idPrefix="lp"
                          districtLabel={geo.language === 'en' ? 'District' : 'জেলা'}
                          thanaLabel={geo.language === 'en' ? 'Thana / Upazila' : 'থানা / উপজেলা'}
                          selectClassFor={(key) => fieldClass(key)}
                          errors={{ district: errors.district, thana: errors.thana }}
                          onChange={(next) => {
                            setDistrict(next.district);
                            setThana(next.thana);
                            clearError('district');
                            clearError('thana');
                            clearError('zone');
                          }}
                        />
                      </div>
                    )}

                    <div data-field="address">
                      <label htmlFor="lp-address" className="mb-1.5 block text-sm font-semibold">
                        {content.checkout.addressLabel || 'সম্পূর্ণ ঠিকানা'} <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id="lp-address"
                        rows={3}
                        autoComplete="street-address"
                        value={address}
                        onChange={(event) => {
                          setAddress(event.target.value);
                          clearError('address');
                        }}
                        aria-invalid={Boolean(errors.address) || undefined}
                        placeholder="বাড়ি/ফ্ল্যাট, রোড, এলাকা, থানা, জেলা"
                        className={`resize-none py-3 leading-relaxed ${fieldClass('address')}`}
                      />
                      {errorText('address')}
                    </div>

                    {content.checkout.noteEnabled && (
                      <div>
                        <label htmlFor="lp-note" className="mb-1.5 block text-sm font-semibold">
                          নোট <span className="font-normal text-(--lp-muted)">(ঐচ্ছিক)</span>
                        </label>
                        <textarea
                          id="lp-note"
                          rows={2}
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder={content.checkout.notePlaceholder || 'অতিরিক্ত কোনো তথ্য (ঐচ্ছিক)'}
                          className={`resize-none py-3 leading-relaxed ${fieldClass('note')}`}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {deliveryOn && (zones.length > 0 || autoShip || !zonesLoaded) && (
                <div className={`${card} p-4 sm:p-5`} data-field="zone">
                  {boxTitle(<MapPin className="h-4 w-4" />, 'ডেলিভারি এলাকা')}
                  {!zonesLoaded ? (
                    <div className="space-y-2.5">
                      <span className="ds-skeleton block h-14 rounded-xl" />
                      <span className="ds-skeleton block h-14 rounded-xl" />
                    </div>
                  ) : autoShip ? (
                    activeZone ? (
                      <div className="flex w-full items-center gap-3 rounded-xl border-2 border-(--lp-p) bg-(--lp-p-soft) p-3 sm:p-3.5">
                        <Truck className="h-5 w-5 shrink-0 text-(--lp-p)" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold leading-snug">{activeZone.name}</span>
                          <span className="block text-xs text-(--lp-muted)">{[thana, district].filter(Boolean).join(', ')} অনুযায়ী</span>
                        </span>
                        <span className="ds-num shrink-0 font-bold">
                          {activeQuote && activeQuote.charge <= 0 ? <span className="text-emerald-600">ফ্রি</span> : money(activeQuote?.charge || 0)}
                        </span>
                      </div>
                    ) : (
                      <p className="rounded-xl border-2 border-dashed border-(--lp-line) p-3 text-sm text-(--lp-muted)">
                        {district ? 'এই জেলার জন্য ডেলিভারি এলাকা ঠিক করা নেই — আমাদের কল করুন।' : 'জেলা বাছাই করলে ডেলিভারি চার্জ দেখাবে।'}
                      </p>
                    )
                  ) : zones.length === 0 ? (
                    <p className="text-sm text-(--lp-muted)">
                      {mode === 'preview'
                        ? 'No delivery zones are set up — add them in System Configuration → Shipping.'
                        : 'ডেলিভারি চার্জ অর্ডার কনফার্মের সময় জানানো হবে।'}
                    </p>
                  ) : (
                    <div role="radiogroup" aria-label="ডেলিভারি এলাকা" className="grid gap-2.5">
                      {zones.map((zone) => {
                        const active = zone.id === zoneId;
                        const quote = quotes[zone.id];
                        const isFree = quote ? quote.charge <= 0 : false;
                        const label = quote && isFree ? freeShippingLabel(quote.reason) : '';
                        return (
                          <button
                            key={zone.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => {
                              setZoneId(zone.id);
                              clearError('zone');
                            }}
                            className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-left transition sm:p-3.5 ${
                              active ? 'border-(--lp-p) bg-(--lp-p-soft)' : 'border-(--lp-line) bg-white hover:border-(--lp-p)/50'
                            }`}
                          >
                            <span
                              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                                active ? 'border-(--lp-p)' : 'border-slate-300'
                              }`}
                            >
                              {active && <span className="h-2.5 w-2.5 rounded-full bg-(--lp-p)" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold leading-snug">{zone.name}</span>
                              {zone.eta && <span className="block text-xs text-(--lp-muted)">{zone.eta}</span>}
                              {label && <span className="block text-xs font-semibold text-emerald-700">{label}</span>}
                            </span>
                            <span className="shrink-0 text-right">
                              {isFree ? (
                                <>
                                  <span className="block font-bold text-emerald-600">ফ্রি</span>
                                  {quote && quote.baseCharge > 0 && (
                                    <span className="ds-num block text-xs text-slate-400 line-through">{money(quote.baseCharge)}</span>
                                  )}
                                </>
                              ) : (
                                <span className="ds-num font-bold">{money(quote?.charge ?? num(zone.charge))}</span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {errorText('zone')}
                </div>
                )}
              </div>

              <div className="min-w-0 space-y-5">
                {summaryCard}
                <div className={locked ? 'pointer-events-none opacity-60' : ''}>{paymentCard}</div>

                {blocked && (
                  <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-bold">দুঃখিত, এই অর্ডারটি নেওয়া যাচ্ছে না</p>
                    {blocked.message && <p className="mt-1">{blocked.message}</p>}
                    {blocked.reason && <p className="mt-1 text-amber-800/80">কারণ: {blocked.reason}</p>}
                    {footerPhone && (
                      <a href={telHref(footerPhone)} className="mt-2 inline-flex items-center gap-1.5 font-semibold underline">
                        <Phone className="h-4 w-4" /> আমাদের কল করুন
                      </a>
                    )}
                  </div>
                )}

                {formError && phase === 'form' && (
                  <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {phase === 'payfail' && placed ? (
                  <div role="alert" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                    <p className="flex items-start gap-2 font-bold text-amber-900">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> পেমেন্ট শুরু করা যায়নি
                    </p>
                    {payError && <p className="mt-1 text-sm text-amber-900/90">{payError}</p>}
                    <p className="mt-2 text-sm text-amber-900">
                      আপনার অর্ডার (<span className="ds-num font-semibold">{placed.orderNumber}</span>) নেওয়া হয়েছে। আবার চেষ্টা করুন
                      {codAllowed ? ', অথবা পণ্য হাতে পেয়ে টাকা দিন।' : '।'}
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => redirectToGateway(placed)}
                        className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 font-bold text-white hover:bg-slate-800"
                      >
                        <RefreshCw className="h-4 w-4" /> আবার চেষ্টা করুন
                      </button>
                      {codAllowed && (
                        <button
                          type="button"
                          onClick={async () => {
                            // The same order switches to cash on delivery on the server
                            try {
                              const res = await fetch('/api/payments/switch-to-cod', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ orderNumber: placed.orderNumber, phone: placed.customerPhone || phone }),
                              });
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) throw new Error(data?.error || 'ক্যাশ অন ডেলিভারি চালু করা যায়নি। আবার চেষ্টা করুন।');
                              setCodAfterFail(true);
                              setPhase('done');
                            } catch (err: any) {
                              setPayError(err?.message || 'ক্যাশ অন ডেলিভারি চালু করা যায়নি।');
                            }
                          }}
                          className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 bg-white px-4 font-bold text-emerald-700 hover:bg-emerald-50"
                        >
                          <Banknote className="h-4 w-4" /> ক্যাশ অন ডেলিভারি
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={submitting || ordersOff || phase !== 'form'}
                    className={`inline-flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-(--lp-cta) px-4 py-3 text-[17px] font-extrabold leading-snug text-white shadow-[0_14px_30px_-12px_rgba(22,163,74,0.75)] transition hover:bg-(--lp-cta-dark) active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-75 sm:min-h-16 sm:text-lg ${cta.className}`}
                    style={cta.style}
                  >
                    {submitting || phase === 'redirecting' ? (
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                    ) : ordersOff ? (
                      <Lock className="h-5 w-5 shrink-0" />
                    ) : (
                      <ShoppingBag className="h-5 w-5 shrink-0" />
                    )}
                    <span className="ds-num min-w-0">{submitLabel}</span>
                  </button>
                )}
                <p className="flex items-center justify-center gap-1.5 text-xs text-(--lp-muted)">
                  <ShieldCheck className="h-3.5 w-3.5" /> আপনার তথ্য সম্পূর্ণ নিরাপদ
                </p>
              </div>
            </div>
          </form>
        )}
      </div>
    </section>
  );

  /* ================================================================ render */
  return (
    <div
      ref={rootRef}
      lang="bn"
      data-tpl={template}
      className={`lp-root min-h-screen overflow-x-clip ${showSticky ? 'pb-[76px] lg:pb-0' : ''}`}
      style={rootStyle}
    >
      <style>{CSS}</style>

      {mode === 'draft' && (
        <div className="fixed right-3 top-3 z-[60] inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg">
          <Lock className="h-3.5 w-3.5" /> Draft preview
        </div>
      )}

      {content.topBar.enabled && content.topBar.text && (
        <div
          className={`px-4 py-2 text-center text-[13px] font-semibold sm:text-sm ${
            organic ? 'bg-(--lp-a) text-(--lp-on-a)' : 'bg-(--lp-p-dark) text-white'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Truck className="h-4 w-4 shrink-0" />
            {content.topBar.text}
          </span>
        </div>
      )}

      {organic ? heroOrganic : heroFashion}

      {embed && (
        <section className={`${sectionPad} ${organic ? '' : raised}`}>
          <div className={container4}>
            {content.video.title && <SectionTitle organic={organic}>{content.video.title}</SectionTitle>}
            <VideoBlock url={content.video.url} title={content.video.title} />
          </div>
        </section>
      )}

      {content.features.enabled && features.length > 0 && (
        <section className={`${sectionPad} ${organic ? raised : ''}`}>
          <div className={container}>
            {content.features.title && <SectionTitle organic={organic}>{content.features.title}</SectionTitle>}
            <div
              className={`grid gap-3 sm:gap-4 ${
                features.length === 1
                  ? 'mx-auto max-w-md grid-cols-1'
                  : features.length === 2
                  ? 'mx-auto max-w-3xl grid-cols-2'
                  : features.length === 3
                  ? 'grid-cols-1 sm:grid-cols-3'
                  : features.length === 4
                  ? 'grid-cols-2 lg:grid-cols-4'
                  : 'grid-cols-2 lg:grid-cols-3'
              }`}
            >
              {features.map((feature, index) => {
                const Icon = iconFor(`${feature.title} ${feature.text}`, index);
                return (
                  <div
                    key={index}
                    className={`${card} flex flex-col items-center p-4 text-center transition hover:-translate-y-0.5 sm:p-6`}
                  >
                    <span
                      className={`grid h-12 w-12 place-items-center sm:h-14 sm:w-14 ${
                        organic ? 'rounded-full bg-(--lp-a-soft) text-(--lp-a)' : 'rounded-2xl bg-(--lp-p-soft) text-(--lp-p)'
                      }`}
                    >
                      <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
                    </span>
                    {feature.title && <h3 className="mt-3 text-[15px] font-bold leading-snug sm:text-lg">{feature.title}</h3>}
                    {feature.text && <p className="mt-1.5 text-[13px] leading-relaxed text-(--lp-muted) sm:text-sm">{feature.text}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {content.gallery.enabled && galleryImages.length > 0 && (
        <section className={`${sectionPad} ${organic ? '' : raised}`}>
          <div className={container}>
            {content.gallery.title && <SectionTitle organic={organic}>{content.gallery.title}</SectionTitle>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
              {galleryImages.map((src, index) => (
                <button
                  key={`${src}-${index}`}
                  type="button"
                  onClick={() => setLightbox({ images: galleryImages, index })}
                  aria-label={`ছবি ${index + 1}`}
                  className={`group aspect-square cursor-zoom-in overflow-hidden border border-(--lp-line) bg-white ${
                    organic ? 'rounded-3xl' : 'rounded-2xl'
                  }`}
                >
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={fallbackImage}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {content.benefits.enabled && benefits.length > 0 && (
        <section className={`${sectionPad} ${organic ? raised : ''}`}>
          <div className={container4}>
            {content.benefits.title && <SectionTitle organic={organic}>{content.benefits.title}</SectionTitle>}
            <ul className="grid gap-3 sm:grid-cols-2">
              {benefits.map((benefit, index) => (
                <li key={index} className={`${card} flex items-start gap-3 p-4`}>
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                      organic ? 'bg-(--lp-a) text-(--lp-on-a)' : 'bg-(--lp-p) text-(--lp-on-p)'
                    }`}
                  >
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                  <span className="pt-0.5 font-medium leading-relaxed">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {showOffer && (
        <section className={sectionPad}>
          <div className={container4}>
            <div
              className={`relative overflow-hidden bg-[linear-gradient(135deg,var(--lp-a),color-mix(in_srgb,var(--lp-a)_72%,#000))] p-6 text-center text-(--lp-on-a) shadow-[0_24px_50px_-26px_rgba(0,0,0,0.55)] sm:p-10 ${
                organic ? 'rounded-[2rem]' : 'rounded-3xl'
              }`}
            >
              <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
              <div aria-hidden className="pointer-events-none absolute -bottom-14 -left-10 h-44 w-44 rounded-full bg-white/10" />
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-sm font-bold">
                  <Timer className="h-4 w-4" /> অফার
                </span>
                {content.offer.title && <h2 className="mt-3 text-[22px] font-extrabold leading-snug sm:text-[32px]">{content.offer.title}</h2>}
                {content.offer.text && <p className="mx-auto mt-2 max-w-2xl opacity-95">{content.offer.text}</p>}
                {hasCountdown && (
                  <div className="mt-6">
                    <Countdown endsAt={endsAtMs} onEnd={onOfferEnd} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={goToOrder}
                  className="mt-7 inline-flex min-h-13 cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-7 py-3 font-bold text-slate-900 shadow-lg transition hover:bg-slate-100 active:scale-[0.98]"
                >
                  {content.hero.ctaText || 'এখনই অর্ডার করুন'} <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {content.reviews.enabled && (reviewImages.length > 0 || reviewItems.length > 0) && (
        <section className={`${sectionPad} ${organic ? raised : raised}`}>
          <div className={container}>
            {content.reviews.title && <SectionTitle organic={organic}>{content.reviews.title}</SectionTitle>}
            {reviewImages.length > 0 && (
              <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
                {reviewImages.map((src, index) => (
                  <button
                    key={`${src}-${index}`}
                    type="button"
                    onClick={() => setLightbox({ images: reviewImages, index })}
                    aria-label={`রিভিউ ${index + 1}`}
                    className="mb-3 block w-full cursor-zoom-in break-inside-avoid overflow-hidden rounded-2xl border border-(--lp-line) bg-white shadow-sm"
                  >
                    <img src={src} alt="" loading="lazy" decoding="async" onError={fallbackImage} className="h-auto w-full" />
                  </button>
                ))}
              </div>
            )}
            {reviewItems.length > 0 && (
              <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${reviewImages.length > 0 ? 'mt-6' : ''}`}>
                {reviewItems.map((review, index) => (
                  <figure key={index} className={`${card} flex flex-col p-5`}>
                    <div className="flex items-center justify-between gap-3">
                      <Stars value={Math.max(1, Math.min(5, Math.round(num(review.rating) || 5)))} />
                      <Quote className="h-6 w-6 text-(--lp-p)/30" />
                    </div>
                    <blockquote className="mt-3 flex-1 leading-relaxed">{review.text}</blockquote>
                    {review.name && (
                      <figcaption className="mt-4 flex items-center gap-2.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-(--lp-p) font-bold text-(--lp-on-p)">
                          {review.name.trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="font-semibold">{review.name}</span>
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {content.faq.enabled && faqs.length > 0 && (
        <section className={sectionPad}>
          <div className={container3}>
            {content.faq.title && <SectionTitle organic={organic}>{content.faq.title}</SectionTitle>}
            <div className="space-y-3">
              {faqs.map((item, index) => {
                const open = faqOpen === index;
                return (
                  <div key={index} className={`${card} overflow-hidden`}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setFaqOpen(open ? -1 : index)}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-4 text-left font-semibold sm:px-5"
                    >
                      <span>{item.q}</span>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-(--lp-p) transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && item.a && (
                      <div className="lp-fade border-t border-(--lp-line) px-4 py-4 leading-relaxed text-(--lp-muted) sm:px-5">{item.a}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {checkoutSection}

      <footer className={organic ? 'bg-[#3b2a14] text-amber-50' : 'bg-slate-900 text-slate-100'}>
        <div className={`${container} py-10 text-center`}>
          {content.footer.text && <p className="text-lg font-semibold">{content.footer.text}</p>}
          {(footerPhone || whatsappLink) && (
            <div className="mt-5 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              {footerPhone && (
                <a
                  href={telHref(footerPhone)}
                  onClick={() => live && tracking.contact('phone')}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 font-bold text-slate-900 hover:bg-slate-100"
                >
                  <Phone className="h-5 w-5" /> <span className="ds-num">{footerPhone}</span>
                </a>
              )}
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => live && tracking.contact('whatsapp')}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 font-bold text-white hover:brightness-105"
                >
                  <MessageCircle className="h-5 w-5" /> WhatsApp
                </a>
              )}
            </div>
          )}
          <p className="mt-8 text-xs opacity-60">
            © {new Date().getFullYear()} {storeName}
          </p>
        </div>
      </footer>

      {showSticky && (
        <div
          className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 lg:hidden ${
            checkoutInView ? 'pointer-events-none translate-y-full' : 'translate-y-0'
          }`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-hidden={checkoutInView}
        >
          <div className="flex items-center gap-3 border-t border-(--lp-line) bg-white/95 px-4 py-2.5 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.25)] backdrop-blur">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] leading-tight text-(--lp-muted)">{lines.length > 0 ? 'সর্বমোট' : 'মূল্য'}</div>
              <div className="ds-num truncate text-lg font-extrabold leading-tight text-(--lp-ink)">
                {lines.length > 0 ? money(total) : teaser && teaser.price > 0 ? `${money(teaser.price)}${teaser.from ? ' থেকে' : ''}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={goToOrder}
              tabIndex={checkoutInView ? -1 : 0}
              className="inline-flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-(--lp-cta) px-5 font-bold text-white shadow-md active:scale-[0.98]"
            >
              <ShoppingBag className="h-5 w-5" /> অর্ডার করুন
            </button>
          </div>
        </div>
      )}

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndex={(index) => setLightbox((current) => (current ? { ...current, index } : current))}
        />
      )}
    </div>
  );
};

export default LandingPageView;
