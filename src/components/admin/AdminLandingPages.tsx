import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Copy,
  Eye,
  ExternalLink,
  FileText,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  LayoutTemplate,
  Link2,
  ListChecks,
  Loader2,
  Megaphone,
  Monitor,
  MousePointerClick,
  Package,
  Paintbrush,
  PanelTop,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Rocket,
  RotateCcw,
  Save,
  Settings2,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Tag,
  Timer,
  Trash2,
  Truck,
  Video,
  X,
} from 'lucide-react';
import {
  ACCENTS,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  FilterPills,
  IconButton,
  LoadingRows,
  Modal,
  Money,
  PageHeader,
  SearchInput,
  StatCard,
  TableWrap,
  Thumb,
  Toggle,
  mix,
  tint,
  useDebounced,
  useToasts,
} from './ui.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import { LandingPageView } from '../store/LandingPageView.tsx';
import {
  DEFAULT_LANDING_SHIPPING,
  LANDING_TEMPLATES,
  defaultLandingContent,
  normalizeLandingContent,
  videoEmbed,
  type LandingContent,
  type LandingProductLink,
  type LandingShippingConfig,
  type LandingTemplateId,
} from '../../lib/landingTemplates.ts';
import type { ShippingZoneConfig, SiteSettings } from '../../types/index.ts';

/**
 * Landing pages — one-page offers with their own checkout, built for
 * Facebook/Instagram ads.
 *
 *   List      every page with its views, orders and revenue, plus the actions
 *   Create    one click: pick a template (and optionally products) → a ready page
 *   Editor    section cards on the left, a live phone/desktop preview on the
 *             right. The preview is the real storefront component rendered in
 *             an iframe, so it looks exactly like the published page.
 */

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
type PageStatus = 'draft' | 'active' | 'inactive';

interface Props {
  currency: string;
  shippingZones: ShippingZoneConfig[];
  onOpenOrders?: (landingPageId: number) => void;
}

interface LandingRow {
  id: number;
  title: string;
  slug: string;
  template: LandingTemplateId;
  status: PageStatus;
  productCount: number;
  views: number;
  orders: number;
  revenue: number;
  image: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Draft {
  title: string;
  slug: string;
  template: LandingTemplateId;
  status: PageStatus;
  content: LandingContent;
  products: LandingProductLink[];
  shipping: LandingShippingConfig;
}

interface CatalogEntry {
  product: any;
  /** Every active option of a variable product (admin list); null while loading */
  variations: any[] | null;
  /** Options the page response carried (only the offered ones) — used until the full list arrives */
  seedVariations: any[];
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

const MAX_PRODUCTS = 30;

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Same rules as the server's slugifyText, so the URL preview matches what is saved */
const slugify = (input: string): string =>
  String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 150);

const pagePath = (slug: string) => `/lp/${slug}`;
const pageUrl = (slug: string) => `${window.location.origin}/lp/${encodeURIComponent(slug)}`;

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall back below */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const photoOf = (product: any): string => {
  if (!product) return '';
  if (product.image) return String(product.image);
  try {
    const list = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
    if (Array.isArray(list) && list.length) return typeof list[0] === 'string' ? list[0] : list[0]?.url || '';
  } catch {
    /* no gallery */
  }
  return '';
};

const productPrice = (product: any): { price: number; regular: number | null } => {
  const sale = num(product?.salePrice);
  const price = num(product?.price);
  if (sale > 0) return { price: sale, regular: price > sale ? price : null };
  return { price, regular: null };
};

const variationPrice = (variation: any, product: any): number => {
  const sale = num(variation?.salePrice);
  if (sale > 0) return sale;
  const price = num(variation?.price);
  if (price > 0) return price;
  return productPrice(product).price;
};

const variationName = (variation: any): string => {
  const combo = variation?.combination && typeof variation.combination === 'object' ? Object.values(variation.combination).join(' / ') : '';
  return String(variation?.label || combo || `#${variation?.id}`);
};

const parseCombination = (raw: unknown): Record<string, string> => {
  let value: any = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
};

const TEMPLATE_TONE: Record<LandingTemplateId, { bg: string; fg: string }> = {
  fashion: { bg: 'var(--ds-teal-soft)', fg: 'var(--ds-teal)' },
  organic: { bg: 'var(--ds-amber-soft)', fg: 'var(--ds-warning-text)' },
};
const templateInfo = (id: LandingTemplateId) => LANDING_TEMPLATES.find((t) => t.id === id) || LANDING_TEMPLATES[0];

const toDraft = (page: any): Draft => {
  const template: LandingTemplateId = page?.template === 'organic' ? 'organic' : 'fashion';
  const status: PageStatus = page?.status === 'active' || page?.status === 'inactive' ? page.status : 'draft';
  const shipping = { ...DEFAULT_LANDING_SHIPPING, ...(page?.shipping || {}) };
  return {
    title: String(page?.title || ''),
    slug: String(page?.slug || ''),
    template,
    status,
    content: normalizeLandingContent(page?.content, template),
    products: (Array.isArray(page?.products) ? page.products : [])
      .map((link: any) => ({
        productId: Number(link?.productId) || 0,
        variationIds: Array.isArray(link?.variationIds) ? link.variationIds.map(Number).filter(Boolean) : [],
        preselect: Boolean(link?.preselect),
        qty: Math.min(99, Math.max(1, Number(link?.qty) || 1)),
      }))
      .filter((link: LandingProductLink) => link.productId > 0),
    shipping: {
      mode: shipping.mode === 'custom' || shipping.mode === 'free' ? shipping.mode : 'store',
      charges: { ...(shipping.charges || {}) },
      freeMinQuantity: shipping.freeMinQuantity ?? null,
      freeMinSubtotal: shipping.freeMinSubtotal ?? null,
    },
  };
};

/** What the storefront would receive from GET /api/lp/:slug, built from the editor's own data */
function buildPreviewProducts(links: LandingProductLink[], catalog: Record<number, CatalogEntry>) {
  const out: any[] = [];
  for (const link of links) {
    const entry = catalog[link.productId];
    const product = entry?.product;
    if (!product?.name) continue;
    if (product.status && product.status !== 'active') continue;
    const hasVariations = Boolean(product.hasVariations);
    let variations: any[] = [];
    if (hasVariations) {
      const pool = entry.variations ?? entry.seedVariations ?? [];
      const allowed = link.variationIds && link.variationIds.length ? new Set(link.variationIds.map(Number)) : null;
      variations = pool.filter((v) => !allowed || allowed.has(Number(v.id)));
      if (variations.length === 0) continue;
    }
    out.push({
      id: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      image: product.image,
      images: product.images,
      price: product.price,
      salePrice: product.salePrice,
      stock: product.stock,
      unit: product.unit,
      hasVariations,
      freeShipping: Boolean(product.freeShipping),
      shippingCharges: product.shippingCharges || null,
      variations,
      preselect: Boolean(link.preselect),
      qty: Math.max(1, Number(link.qty) || 1),
    });
  }
  return out;
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const toLocalInput = (iso: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const fromLocalInput = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};
const timeLeft = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${Math.max(1, minutes)}m`;
};

const muted: React.CSSProperties = { fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' };

/* ========================================================================== */
/* Small building blocks                                                       */
/* ========================================================================== */

/** A miniature of each template, drawn with its swatch colours */
const TemplateThumb: React.FC<{ id: LandingTemplateId; swatch: [string, string] }> = ({ id, swatch }) => {
  const [primary, accent] = swatch;
  const dark = `color-mix(in srgb, ${primary} 72%, #000)`;
  if (id === 'organic') {
    return (
      <div className="relative overflow-hidden" style={{ height: 136, background: '#fffbeb' }} aria-hidden>
        <div style={{ height: 8, background: accent }} />
        <div className="flex flex-col items-center" style={{ paddingTop: 10 }}>
          <span style={{ width: 46, height: 8, borderRadius: 99, background: accent }} />
          <span style={{ marginTop: 7, width: 116, height: 9, borderRadius: 4, background: '#3b2a14', opacity: 0.8 }} />
          <span style={{ marginTop: 5, width: 80, height: 7, borderRadius: 4, background: primary }} />
          <span
            style={{
              marginTop: 9,
              width: 54,
              height: 54,
              borderRadius: 16,
              background: `color-mix(in srgb, ${primary} 30%, #fff)`,
              outline: `2px dashed color-mix(in srgb, ${primary} 45%, transparent)`,
              outlineOffset: 3,
            }}
          />
          <span style={{ marginTop: 9, width: 72, height: 12, borderRadius: 99, background: accent }} />
        </div>
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden" style={{ height: 136, background: '#fff' }} aria-hidden>
      <div style={{ height: 8, background: dark }} />
      <div className="flex items-center gap-3 px-3" style={{ height: 80, background: `linear-gradient(135deg, ${dark}, ${primary})` }}>
        <div className="flex-1 space-y-1.5">
          <span className="block" style={{ width: 38, height: 7, borderRadius: 99, background: 'rgba(255,255,255,.4)' }} />
          <span className="block" style={{ width: '100%', height: 9, borderRadius: 4, background: 'rgba(255,255,255,.92)' }} />
          <span className="block" style={{ width: '72%', height: 9, borderRadius: 4, background: 'rgba(255,255,255,.92)' }} />
          <span className="block" style={{ width: 50, height: 11, borderRadius: 99, background: accent }} />
        </div>
        <span style={{ width: 54, height: 54, borderRadius: 12, background: 'rgba(255,255,255,.92)' }} />
      </div>
      <div className="flex gap-1.5 px-3" style={{ paddingTop: 10 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex-1" style={{ height: 30, borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc' }} />
        ))}
      </div>
    </div>
  );
};

/** Searchable product list used by the create dialog and the editor's "Add products" */
const ProductSearchList: React.FC<{
  currency: string;
  selectedIds: number[];
  disabledIds?: number[];
  onToggle: (product: any) => void;
  maxHeight?: number;
}> = ({ currency, selectedIds, disabledIds = [], onToggle, maxHeight = 300 }) => {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 300);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const term = debounced.trim();
    fetch(`/api/admin/products?limit=40${term ? `&search=${encodeURIComponent(term)}` : ''}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => {
        if (err?.name !== 'AbortError') setError('Could not load products.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debounced, reload]);

  return (
    <div>
      <SearchInput value={query} onChange={setQuery} placeholder="Search products by name or SKU" />
      <div
        className="mt-2 overflow-y-auto"
        style={{ maxHeight, border: '1px solid var(--a-border)', borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface)' }}
      >
        {loading && rows.length === 0 ? (
          <div className="p-3 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="ds-skeleton block h-11" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 text-center" style={muted}>
            {error}{' '}
            <button type="button" className="font-semibold underline cursor-pointer" onClick={() => setReload((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center" style={muted}>
            {debounced.trim() ? `No products match "${debounced.trim()}".` : 'No products yet — add products first.'}
          </div>
        ) : (
          <ul>
            {rows.map((product) => {
              const selected = selectedIds.includes(product.id);
              const inactive = product.status && product.status !== 'active';
              const already = disabledIds.includes(product.id);
              const disabled = inactive || already;
              const { price, regular } = productPrice(product);
              return (
                <li key={product.id} style={{ borderBottom: '1px solid var(--a-border-soft)' }}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggle(product)}
                    aria-pressed={selected}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-55"
                    style={{ background: selected ? tint(0.07) : undefined }}
                  >
                    <span
                      className="inline-flex items-center justify-center shrink-0"
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        background: selected || already ? 'var(--primary)' : 'var(--a-surface)',
                        border: `1.5px solid ${selected || already ? 'var(--primary)' : 'var(--a-border-strong)'}`,
                        color: '#fff',
                      }}
                    >
                      {(selected || already) && <Check className="w-3 h-3" />}
                    </span>
                    <Thumb src={photoOf(product)} alt={product.name || '?'} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {product.name}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5" style={muted}>
                        {product.sku && <span className="ds-num">{product.sku}</span>}
                        <span className="ds-num">Stock {num(product.stock)}</span>
                        {already && <span style={{ color: 'var(--primary-ink, var(--primary))', fontWeight: 600 }}>Already on the page</span>}
                        {inactive && <span style={{ color: 'var(--ds-danger-text)', fontWeight: 600 }}>Inactive</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {product.hasVariations ? (
                        <Badge tone={{ bg: 'var(--ds-violet-soft)', fg: 'var(--ds-violet)' }}>Variable</Badge>
                      ) : (
                        <>
                          <Money value={price} currency={currency} bold className="block" />
                          {regular && (
                            <span className="ds-num line-through" style={muted}>
                              {currency}
                              {regular.toLocaleString('en-US')}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

/** Renders children into a same-origin iframe, so the preview gets a real phone/desktop viewport */
const SRC_DOC =
  '<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';

const PreviewFrame: React.FC<{ width: number; height: number; scale: number; children: React.ReactNode }> = ({
  width,
  height,
  scale,
  children,
}) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  const setup = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc || !doc.body || !doc.head) return;
    const existing = doc.getElementById('lp-preview-root');
    if (existing) {
      setMount(existing);
      return;
    }
    // The app's stylesheets (Tailwind, fonts, tokens) into the frame
    document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => doc.head.appendChild(node.cloneNode(true)));
    const extra = doc.createElement('style');
    extra.textContent = 'html{scrollbar-width:none}html::-webkit-scrollbar{display:none}body{margin:0;background:#fff}';
    doc.head.appendChild(extra);
    const rootStyle = document.documentElement.getAttribute('style');
    if (rootStyle) doc.documentElement.setAttribute('style', rootStyle);
    const root = doc.createElement('div');
    root.id = 'lp-preview-root';
    doc.body.appendChild(root);
    setMount(root);
  }, []);

  // The load event can fire before React attaches the listener in rare cases
  useEffect(() => {
    const doc = ref.current?.contentDocument;
    if (doc && doc.readyState === 'complete' && doc.URL === 'about:srcdoc') setup();
  }, [setup]);

  // Stylesheets added later (lazy chunks) follow into the frame
  useEffect(() => {
    if (!mount) return;
    const doc = mount.ownerDocument;
    const observer = new MutationObserver((records) =>
      records.forEach((record) =>
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLStyleElement || (node instanceof HTMLLinkElement && node.rel === 'stylesheet')) {
            doc.head.appendChild(node.cloneNode(true));
          }
        })
      )
    );
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, [mount]);

  return (
    <div style={{ width: width * scale, height: height * scale, overflow: 'hidden', flexShrink: 0 }}>
      <iframe
        ref={ref}
        title="Landing page preview"
        srcDoc={SRC_DOC}
        onLoad={setup}
        style={{
          width,
          height,
          border: 0,
          display: 'block',
          background: '#fff',
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
        }}
      />
      {mount && createPortal(children, mount)}
    </div>
  );
};

type Device = 'phone' | 'desktop';

const PreviewPane: React.FC<{ page: any; products: any[]; settings: SiteSettings; device: Device }> = ({
  page,
  products,
  settings,
  device,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  let frame: { width: number; height: number; scale: number; bezel: boolean };
  if (device === 'desktop') {
    const width = 1280;
    const scale = Math.max(0.1, box.w / width);
    frame = { width, height: box.h / scale, scale, bezel: false };
  } else if (box.w < 430) {
    frame = { width: box.w, height: box.h, scale: 1, bezel: false };
  } else {
    const width = 390;
    const scale = Math.min(1, (box.w - 20) / width);
    frame = { width, height: (box.h - 20) / scale, scale, bezel: true };
  }

  const view = <LandingPageView preview={{ page, products }} settings={settings} />;
  const ready = box.w > 0 && box.h > 40 && page;

  return (
    <div ref={boxRef} className="relative flex h-full w-full min-h-0 justify-center overflow-hidden">
      {ready &&
        (frame.bezel ? (
          <div style={{ padding: 10, borderRadius: 34, background: '#0f172a', boxShadow: 'var(--ds-shadow-xl)', alignSelf: 'flex-start' }}>
            <div style={{ borderRadius: 26, overflow: 'hidden', background: '#fff' }}>
              <PreviewFrame width={frame.width} height={frame.height} scale={frame.scale}>
                {view}
              </PreviewFrame>
            </div>
          </div>
        ) : (
          <div
            style={{
              borderRadius: device === 'desktop' ? 'var(--ds-r-md)' : 0,
              overflow: 'hidden',
              border: device === 'desktop' ? '1px solid var(--a-border)' : undefined,
              alignSelf: 'flex-start',
            }}
          >
            <PreviewFrame width={frame.width} height={frame.height} scale={frame.scale}>
              {view}
            </PreviewFrame>
          </div>
        ))}
    </div>
  );
};

const DeviceSwitch: React.FC<{ device: Device; onChange: (device: Device) => void }> = ({ device, onChange }) => (
  <div className="inline-flex p-0.5" style={{ background: 'var(--a-surface-3)', borderRadius: 'var(--ds-r-md)' }} role="tablist">
    {(
      [
        ['phone', Smartphone, 'Phone'],
        ['desktop', Monitor, 'Desktop'],
      ] as Array<[Device, IconType, string]>
    ).map(([id, Icon, label]) => (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={device === id}
        onClick={() => onChange(id)}
        className="inline-flex items-center gap-1.5 px-2.5 cursor-pointer font-semibold"
        style={{
          height: 30,
          borderRadius: 'var(--ds-r-sm)',
          fontSize: 'var(--a-fs-sm)',
          background: device === id ? 'var(--a-surface)' : 'transparent',
          color: device === id ? 'var(--a-text)' : 'var(--a-text-muted)',
          boxShadow: device === id ? 'var(--ds-shadow-xs)' : undefined,
        }}
      >
        <Icon className="w-3.5 h-3.5" />
        {label}
      </button>
    ))}
  </div>
);

/** A collapsible card in the editor, with the section's on/off switch in its header */
const EditorSection: React.FC<{
  id: string;
  title: string;
  description?: string;
  icon: IconType;
  accent?: string;
  open: boolean;
  onToggle: (id: string) => void;
  enabled?: boolean;
  onEnabled?: (value: boolean) => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, title, description, icon: Icon, accent = 'var(--primary)', open, onToggle, enabled, onEnabled, badge, children }) => (
  <section className="a-card overflow-hidden" id={`lp-section-${id}`}>
    <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
      >
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 34,
            height: 34,
            borderRadius: 'var(--ds-r-md)',
            background: mix(accent, onEnabled && !enabled ? 0.06 : 0.12),
            color: onEnabled && !enabled ? 'var(--a-text-faint)' : accent,
          }}
        >
          <Icon className="w-4 h-4" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="font-bold truncate" style={{ fontSize: 'var(--a-fs-lg)' }}>
              {title}
            </span>
            {onEnabled && !enabled && (
              <Badge tone={{ bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)' }} className="shrink-0">
                Hidden
              </Badge>
            )}
          </span>
          {description && (
            <span className="block truncate" style={muted}>
              {description}
            </span>
          )}
        </span>
      </button>
      {badge && <span className="hidden sm:inline-flex shrink-0">{badge}</span>}
      {onEnabled && (
        <span className="shrink-0" title={enabled ? 'Shown on the page' : 'Hidden from the page'}>
          <Toggle checked={Boolean(enabled)} onChange={onEnabled} />
        </span>
      )}
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
        className="inline-flex items-center justify-center shrink-0 cursor-pointer"
        style={{ width: 30, height: 30, borderRadius: 'var(--ds-r-sm)', color: 'var(--a-text-muted)' }}
      >
        <ChevronDown className="w-4 h-4" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform var(--ds-dur)' }} />
      </button>
    </div>
    {open && (
      <div className="space-y-4 border-t px-3 py-4 sm:px-5 sm:py-5 ds-fade-in" style={{ borderColor: 'var(--a-border)' }}>
        {children}
      </div>
    )}
  </section>
);

const RowTools: React.FC<{ index: number; count: number; onMove: (index: number, dir: -1 | 1) => void; onRemove: (index: number) => void; label: string }> = ({
  index,
  count,
  onMove,
  onRemove,
  label,
}) => (
  <div className="flex items-center gap-1 shrink-0">
    <IconButton icon={ArrowUp} size="sm" tone="plain" label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(index, -1)} />
    <IconButton icon={ArrowDown} size="sm" tone="plain" label={`Move ${label} down`} disabled={index === count - 1} onClick={() => onMove(index, 1)} />
    <IconButton icon={Trash2} size="sm" tone="danger" label={`Remove ${label}`} onClick={() => onRemove(index)} />
  </div>
);

const moveItem = <T,>(list: T[], index: number, dir: -1 | 1): T[] => {
  const target = index + dir;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

const StringListEditor: React.FC<{
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  max?: number;
}> = ({ values, onChange, placeholder, addLabel = 'Add item', max = 12 }) => (
  <div className="space-y-2">
    {values.map((value, index) => (
      <div key={index} className="flex items-center gap-2">
        <span className="ds-num shrink-0 text-center font-bold" style={{ width: 20, ...muted }}>
          {index + 1}
        </span>
        <input
          className="a-field min-w-0 flex-1"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(values.map((v, i) => (i === index ? event.target.value : v)))}
        />
        <RowTools
          index={index}
          count={values.length}
          label="item"
          onMove={(i, dir) => onChange(moveItem(values, i, dir))}
          onRemove={(i) => onChange(values.filter((_, j) => j !== i))}
        />
      </div>
    ))}
    {values.length < max && (
      <Button size="sm" variant="soft" icon={Plus} onClick={() => onChange([...values, ''])}>
        {addLabel}
      </Button>
    )}
  </div>
);

function ListEditor<T>({
  items,
  onChange,
  render,
  make,
  addLabel,
  max = 12,
  itemLabel,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => React.ReactNode;
  make: () => T;
  addLabel: string;
  max?: number;
  itemLabel: (item: T, index: number) => string;
}) {
  return (
    <div className="space-y-2.5">
      {items.map((item, index) => (
        <div
          key={index}
          className="p-3"
          style={{ border: '1px solid var(--a-border)', borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)' }}
        >
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
              <span className="ds-num" style={{ color: 'var(--a-text-muted)' }}>
                #{index + 1}
              </span>{' '}
              {itemLabel(item, index)}
            </span>
            <RowTools
              index={index}
              count={items.length}
              label="item"
              onMove={(i, dir) => onChange(moveItem(items, i, dir))}
              onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
            />
          </div>
          {render(item, (patch) => onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it))), index)}
        </div>
      ))}
      {items.length < max && (
        <Button size="sm" variant="soft" icon={Plus} onClick={() => onChange([...items, make()])}>
          {addLabel}
        </Button>
      )}
    </div>
  );
}

const ColorField: React.FC<{ label: string; value: string; fallback: string; onChange: (value: string) => void }> = ({
  label,
  value,
  fallback,
  onChange,
}) => {
  const valid = HEX_RE.test(value);
  let swatch = valid ? value : fallback;
  if (/^#[0-9a-f]{3}$/i.test(swatch)) swatch = `#${swatch.slice(1).split('').map((c) => c + c).join('')}`;
  const picker = /^#[0-9a-f]{6}$/i.test(swatch) ? swatch : swatch.slice(0, 7);
  return (
    <Field label={label} error={value && !valid ? 'Use a hex colour like #0d9488' : undefined}>
      <div className="flex items-center gap-2">
        <label
          className="relative shrink-0 cursor-pointer overflow-hidden"
          style={{ width: 44, height: 38, borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border-strong)', background: swatch }}
          title="Pick a colour"
        >
          <input
            type="color"
            value={picker}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={label}
          />
        </label>
        <input
          className="a-field ds-num min-w-0 flex-1"
          value={value}
          maxLength={9}
          placeholder={fallback}
          onChange={(event) => onChange(event.target.value.trim())}
        />
      </div>
    </Field>
  );
};

const Note: React.FC<{ tone?: 'info' | 'warning' | 'success'; children: React.ReactNode; icon?: IconType }> = ({ tone = 'info', children, icon }) => {
  const tones = {
    info: { bg: 'var(--ds-info-soft)', fg: 'var(--ds-info-text)', Icon: AlertCircle },
    warning: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', Icon: AlertCircle },
    success: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', Icon: CheckCircle2 },
  }[tone];
  const Icon = icon || tones.Icon;
  return (
    <div
      className="flex items-start gap-2 px-3 py-2.5"
      style={{ borderRadius: 'var(--ds-r-md)', background: tones.bg, color: tones.fg, fontSize: 'var(--a-fs-base)', lineHeight: 1.55 }}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
};

/* ========================================================================== */
/* Dialogs                                                                     */
/* ========================================================================== */

const CreateLandingModal: React.FC<{
  open: boolean;
  onClose: () => void;
  currency: string;
  onCreated: (page: any) => void;
}> = ({ open, onClose, currency, onCreated }) => {
  const [template, setTemplate] = useState<LandingTemplateId>('fashion');
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTemplate('fashion');
    setTitle('');
    setSelected([]);
    setError('');
    setCreating(false);
  }, [open]);

  const toggle = (product: any) =>
    setSelected((list) =>
      list.some((p) => p.id === product.id) ? list.filter((p) => p.id !== product.id) : list.length >= MAX_PRODUCTS ? list : [...list, product]
    );

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/landing-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template,
          title: title.trim() || undefined,
          // Only the first product starts ticked, so a multi-product page does not open with everything in the order
          products: selected.map((product, index) => ({ productId: product.id, preselect: index === 0, qty: 1 })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !data?.page) throw new Error(data?.error || 'Could not create the landing page.');
      onCreated(data.page);
    } catch (err: any) {
      setError(err?.message || 'Could not create the landing page.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !creating && onClose()}
      title="Create a landing page"
      subtitle="Pick a look — the page comes ready with text you can change later."
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button variant="primary" icon={Rocket} onClick={create} loading={creating}>
            Create page
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error && <Note tone="warning">{error}</Note>}

        <div>
          <p className="a-label">1. Template</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Template">
            {LANDING_TEMPLATES.map((item) => {
              const active = template === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTemplate(item.id)}
                  className="relative overflow-hidden text-left cursor-pointer transition-all"
                  style={{
                    borderRadius: 'var(--ds-r-lg)',
                    border: `2px solid ${active ? 'var(--primary)' : 'var(--a-border)'}`,
                    boxShadow: active ? 'var(--ds-ring)' : undefined,
                    background: 'var(--a-surface)',
                  }}
                >
                  <TemplateThumb id={item.id} swatch={item.swatch} />
                  <div className="p-3" style={{ borderTop: '1px solid var(--a-border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="flex gap-1" aria-hidden>
                        {item.swatch.map((color) => (
                          <span key={color} style={{ width: 12, height: 12, borderRadius: 99, background: color }} />
                        ))}
                      </span>
                      <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {item.name}
                      </span>
                    </div>
                    <p className="mt-1" style={muted}>
                      {item.description}
                    </p>
                  </div>
                  {active && (
                    <span
                      className="absolute right-2 top-2 inline-flex items-center justify-center"
                      style={{ width: 26, height: 26, borderRadius: 99, background: 'var(--primary)', color: '#fff', boxShadow: 'var(--ds-shadow-md)' }}
                    >
                      <Check className="w-4 h-4" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="a-label">2. Products (optional)</p>
            <span style={muted}>You can add or change them later</span>
          </div>
          {selected.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selected.map((product, index) => (
                <span
                  key={product.id}
                  className="inline-flex max-w-full items-center gap-1.5 py-1 pl-1 pr-1.5"
                  style={{ borderRadius: 99, background: tint(0.1), color: 'var(--primary-ink, var(--primary))', fontSize: 'var(--a-fs-sm)', fontWeight: 600 }}
                >
                  <Thumb src={photoOf(product)} alt={product.name} size={22} />
                  <span className="truncate" style={{ maxWidth: 180 }}>
                    {product.name}
                  </span>
                  {index === 0 && <span style={{ opacity: 0.7 }}>· ticked</span>}
                  <button type="button" aria-label={`Remove ${product.name}`} onClick={() => toggle(product)} className="cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <ProductSearchList currency={currency} selectedIds={selected.map((p) => p.id)} onToggle={toggle} maxHeight={260} />
        </div>

        <Field label="3. Page title (optional)" hint="Leave empty to use the first product's name. Also used for the link, e.g. /lp/honey-offer">
          <input className="a-field" value={title} maxLength={191} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Sundarban Honey Offer" />
        </Field>
      </div>
    </Modal>
  );
};

const ProductPickerModal: React.FC<{
  open: boolean;
  onClose: () => void;
  currency: string;
  existingIds: number[];
  room: number;
  onAdd: (products: any[]) => void;
}> = ({ open, onClose, currency, existingIds, room, onAdd }) => {
  const [picked, setPicked] = useState<any[]>([]);
  useEffect(() => {
    if (open) setPicked([]);
  }, [open]);
  const toggle = (product: any) =>
    setPicked((list) =>
      list.some((p) => p.id === product.id) ? list.filter((p) => p.id !== product.id) : list.length >= room ? list : [...list, product]
    );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add products"
      subtitle={room > 0 ? `Simple and variable products. Up to ${room} more on this page.` : 'This page already has the maximum of 30 products.'}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={Plus}
            disabled={picked.length === 0}
            onClick={() => {
              onAdd(picked);
              onClose();
            }}
          >
            {picked.length > 0 ? `Add ${picked.length} product${picked.length === 1 ? '' : 's'}` : 'Add products'}
          </Button>
        </>
      }
    >
      <ProductSearchList
        currency={currency}
        selectedIds={picked.map((p) => p.id)}
        disabledIds={existingIds}
        onToggle={toggle}
        maxHeight={420}
      />
    </Modal>
  );
};

/* ========================================================================== */
/* Editor                                                                      */
/* ========================================================================== */

const SECTION_IDS = [
  'general',
  'products',
  'delivery',
  'theme',
  'topbar',
  'hero',
  'video',
  'features',
  'gallery',
  'benefits',
  'offer',
  'reviews',
  'faq',
  'checkout',
  'footer',
  'pixel',
  'seo',
];

const LandingEditor: React.FC<{
  id: number;
  currency: string;
  shippingZones: ShippingZoneConfig[];
  onBack: () => void;
  onOpenOrders?: (landingPageId: number) => void;
}> = ({ id, currency, shippingZones, onBack, onOpenOrders }) => {
  const toasts = useToasts();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [stats, setStats] = useState<{ views: number; orders: number }>({ views: 0, orders: 0 });
  const [catalog, setCatalog] = useState<Record<number, CatalogEntry>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ general: true, products: true });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [device, setDevice] = useState<Device>('phone');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const variationRequests = useRef(new Set<number>());

  const draftJson = useMemo(() => (draft ? JSON.stringify(draft) : ''), [draft]);
  const dirty = Boolean(draft) && draftJson !== savedJson;
  const savedSlug = useMemo(() => {
    try {
      return savedJson ? String(JSON.parse(savedJson).slug || '') : '';
    } catch {
      return '';
    }
  }, [savedJson]);

  /* ------------------------------------------------------------- loading */
  const seedCatalog = useCallback((products: any[]) => {
    if (!Array.isArray(products)) return;
    setCatalog((prev) => {
      const next = { ...prev };
      products.forEach((product) => {
        if (!product?.id) return;
        const existing = prev[product.id];
        const { variations, preselect, qty, ...base } = product;
        next[product.id] = {
          product: { ...(existing?.product || {}), ...base, status: base.status || existing?.product?.status || 'active' },
          variations: existing?.variations ?? null,
          seedVariations: Array.isArray(variations) ? variations : existing?.seedVariations || [],
        };
      });
      return next;
    });
  }, []);

  const loadVariations = useCallback(async (productId: number) => {
    if (variationRequests.current.has(productId)) return;
    variationRequests.current.add(productId);
    try {
      const res = await fetch(`/api/admin/products/${productId}/variations`);
      const rows = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(rows)) throw new Error('failed');
      const active = rows
        .filter((v: any) => (v.status || 'active') === 'active')
        .map((v: any) => ({
          id: Number(v.id),
          label: v.label || '',
          combination: parseCombination(v.combination),
          price: v.price,
          salePrice: v.salePrice,
          stock: Number(v.stock || 0),
          image: v.image || '',
          sku: v.sku || '',
        }));
      setCatalog((prev) => ({
        ...prev,
        [productId]: { ...(prev[productId] || { product: { id: productId }, seedVariations: [] }), variations: active },
      }));
    } catch {
      variationRequests.current.delete(productId);
      setCatalog((prev) =>
        prev[productId] ? { ...prev, [productId]: { ...prev[productId], variations: prev[productId].variations ?? prev[productId].seedVariations ?? [] } } : prev
      );
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/admin/landing-pages/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.page) throw new Error(data?.error || 'Could not load the landing page.');
      const next = toDraft(data.page);
      setDraft(next);
      setSavedJson(JSON.stringify(next));
      setStats({ views: num(data.page.views), orders: num(data.page.ordersCount) });
      const products = Array.isArray(data.products) ? data.products : [];
      seedCatalog(products);
      products.forEach((product: any) => {
        if (product?.hasVariations) void loadVariations(Number(product.id));
      });
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load the landing page.');
    } finally {
      setLoading(false);
    }
  }, [id, seedCatalog, loadVariations]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data === 'object' && !Array.isArray(data)) setSettings(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const zones = useMemo(
    () => ((shippingZones && shippingZones.length ? shippingZones : settings?.shipping?.zones || []) as ShippingZoneConfig[]).filter((z) => z && z.enabled !== false),
    [shippingZones, settings?.shipping?.zones]
  );

  /* ------------------------------------------------------------- updates */
  const patch = (value: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...value } : current));
  const setSection = <K extends keyof LandingContent>(key: K, value: Partial<LandingContent[K]>) =>
    setDraft((current) =>
      current ? { ...current, content: { ...current.content, [key]: { ...(current.content[key] as any), ...value } } } : current
    );
  const setShipping = (value: Partial<LandingShippingConfig>) =>
    setDraft((current) => (current ? { ...current, shipping: { ...current.shipping, ...value } } : current));
  const setLinks = (updater: (links: LandingProductLink[]) => LandingProductLink[]) =>
    setDraft((current) => (current ? { ...current, products: updater(current.products) } : current));
  const updateLink = (index: number, value: Partial<LandingProductLink>) =>
    setLinks((links) => links.map((link, i) => (i === index ? { ...link, ...value } : link)));

  const switchTemplate = (template: LandingTemplateId) =>
    setDraft((current) => {
      if (!current || current.template === template) return current;
      const oldTheme = defaultLandingContent(current.template).theme;
      const untouched = (['primary', 'accent', 'background'] as const).every(
        (key) => String(current.content.theme[key] || '').toLowerCase() === oldTheme[key].toLowerCase()
      );
      // Colours the owner never changed follow the new template; custom colours stay
      return {
        ...current,
        template,
        content: untouched ? { ...current.content, theme: { ...defaultLandingContent(template).theme } } : current.content,
      };
    });

  const addProducts = (rows: any[]) => {
    if (!draft) return;
    const existing = new Set(draft.products.map((link) => link.productId));
    const fresh = rows.filter((row) => !existing.has(row.id)).slice(0, Math.max(0, MAX_PRODUCTS - draft.products.length));
    if (fresh.length === 0) return;
    setCatalog((prev) => {
      const next = { ...prev };
      fresh.forEach((row) => {
        next[row.id] = { product: row, variations: prev[row.id]?.variations ?? null, seedVariations: prev[row.id]?.seedVariations || [] };
      });
      return next;
    });
    fresh.forEach((row) => {
      if (row.hasVariations) void loadVariations(row.id);
    });
    const hadNone = draft.products.length === 0;
    setLinks((links) => [
      ...links,
      ...fresh.map((row, index) => ({ productId: row.id, variationIds: [], preselect: hadNone && index === 0, qty: 1 })),
    ]);
    toasts.push(`${fresh.length} product${fresh.length === 1 ? '' : 's'} added.`);
  };

  const toggleVariation = (index: number, variationId: number, allIds: number[]) => {
    if (!draft) return;
    const link = draft.products[index];
    const current = link.variationIds && link.variationIds.length ? link.variationIds : allIds;
    const next = current.includes(variationId) ? current.filter((vid) => vid !== variationId) : [...current, variationId];
    if (next.length === 0) {
      toasts.push('Keep at least one option on the page.', 'warning');
      return;
    }
    updateLink(index, { variationIds: allIds.every((vid) => next.includes(vid)) ? [] : allIds.filter((vid) => next.includes(vid)) });
  };

  /* ---------------------------------------------------------------- save */
  const validateDraft = (value: Draft): string => {
    if (!value.title.trim()) return 'Enter a page title.';
    if (value.status === 'active' && value.products.length === 0) return 'Add at least one product before making the page active.';
    const pixel = value.content.pixel.metaPixelId.trim();
    if (pixel && !/^\d{8,20}$/.test(pixel)) return 'The Meta Pixel ID should be digits only (usually 15–16 digits).';
    const theme = value.content.theme;
    if (![theme.primary, theme.accent, theme.background].every((color) => HEX_RE.test(String(color || '')))) {
      return 'Theme colours must be hex codes like #0d9488.';
    }
    return '';
  };

  const save = async (popup?: Window | null): Promise<boolean> => {
    if (!draft) return false;
    if (saving) {
      popup?.close();
      return false;
    }
    const problem = validateDraft(draft);
    if (problem) {
      setSaveError(problem);
      toasts.push(problem, 'error');
      popup?.close();
      return false;
    }
    const sentJson = JSON.stringify(draft);
    const wantedSlug = slugify(draft.slug);
    setSaving(true);
    setSaveError('');
    try {
      const body: Record<string, any> = {
        title: draft.title.trim(),
        template: draft.template,
        status: draft.status,
        content: draft.content,
        products: draft.products,
        shipping: draft.shipping,
      };
      if (draft.slug.trim()) body.slug = draft.slug.trim();
      const res = await fetch(`/api/admin/landing-pages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !data?.page) throw new Error(data?.error || 'Could not save. Please try again.');
      const next = toDraft(data.page);
      // Keep anything typed while the request was in flight
      setDraft((current) => (current && JSON.stringify(current) === sentJson ? next : current));
      setSavedJson(JSON.stringify(next));
      if (Array.isArray(data.products)) seedCatalog(data.products);
      if (wantedSlug && wantedSlug !== next.slug) {
        toasts.push(`Saved. That link was already taken, so the page is at ${pagePath(next.slug)}`, 'warning');
      } else {
        toasts.push('Landing page saved.');
      }
      if (popup) popup.location.href = pageUrl(next.slug);
      return true;
    } catch (err: any) {
      const message = err?.message || 'Could not save. Please try again.';
      setSaveError(message);
      toasts.push(message, 'error');
      popup?.close();
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAndView = () => {
    if (!draft) return;
    if (!dirty) {
      window.open(pageUrl(savedSlug || draft.slug), '_blank');
      return;
    }
    // Opened now, while the click still counts as a user gesture, so it is not blocked
    const popup = window.open('about:blank', '_blank');
    void save(popup);
  };

  const discard = () => {
    if (!savedJson) return;
    try {
      setDraft(JSON.parse(savedJson));
      setSaveError('');
    } catch {
      /* keep the draft */
    }
  };

  const requestBack = () => (dirty ? setConfirmLeave(true) : onBack());

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  /* ------------------------------------------------------------- preview */
  const deferred = useDeferredValue(draft);
  const previewPage = useMemo(
    () =>
      deferred
        ? {
            id,
            title: deferred.title,
            slug: deferred.slug,
            template: deferred.template,
            status: deferred.status,
            content: deferred.content,
            products: deferred.products,
            shipping: deferred.shipping,
          }
        : null,
    [deferred, id]
  );
  const previewProducts = useMemo(() => buildPreviewProducts(deferred?.products || [], catalog), [deferred?.products, catalog]);
  const previewSettings = useMemo<SiteSettings>(
    () => settings || ({ shipping: { zones: shippingZones as any } } as SiteSettings),
    [settings, shippingZones]
  );

  /* -------------------------------------------------------------- render */
  if (loading && !draft) {
    return (
      <div className="space-y-4">
        <span className="ds-skeleton block h-5 w-40" />
        <span className="ds-skeleton block h-8 w-72" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="ds-skeleton block h-16 rounded-[var(--ds-r-lg)]" />
            ))}
          </div>
          <span className="ds-skeleton hidden xl:block h-[600px] rounded-[var(--ds-r-xl)]" />
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div>
        <Button icon={ArrowLeft} variant="ghost" onClick={onBack} className="mb-3">
          Back to landing pages
        </Button>
        <Card>
          <ErrorState title="Could not open this page" message={loadError} onRetry={load} />
        </Card>
      </div>
    );
  }

  const c = draft.content;
  const templateDefaults = defaultLandingContent(draft.template);
  const liveUrl = pageUrl(slugify(draft.slug || draft.title) || draft.slug);
  const videoInfo = videoEmbed(c.video.url);
  const endsAtMs = c.offer.endsAt ? Date.parse(c.offer.endsAt) : NaN;
  const toggleOpen = (key: string) => setOpen((state) => ({ ...state, [key]: !state[key] }));
  const allOpen = SECTION_IDS.every((key) => open[key]);
  const zoneCount = zones.length;

  const sectionSummary = {
    products: draft.products.length
      ? `${draft.products.length} product${draft.products.length === 1 ? '' : 's'} · ${draft.products.filter((l) => l.preselect).length} ticked when the page opens`
      : 'No products yet — add at least one',
    delivery:
      draft.shipping.mode === 'free' ? 'Always free delivery' : draft.shipping.mode === 'custom' ? 'Custom charges for this page' : "The store's normal charges & rules",
  };

  const saveBar = (
    <div className="fixed inset-x-0 bottom-0 z-30 shrink-0 lg:static lg:z-auto lg:mt-3">
      <div
        className="flex items-center gap-2 px-3 py-2.5 sm:px-4 lg:rounded-[var(--ds-r-lg)] lg:border"
        style={{ background: 'var(--a-surface)', borderTop: '1px solid var(--a-border)', borderColor: 'var(--a-border)', boxShadow: 'var(--ds-shadow-lg)' }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2" style={{ fontSize: 'var(--a-fs-md)' }}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: 'var(--primary-ink, var(--primary))' }} />
              <span className="truncate font-semibold">Saving…</span>
            </>
          ) : dirty ? (
            <>
              <span className="shrink-0" style={{ width: 9, height: 9, borderRadius: 99, background: 'var(--ds-warning)' }} />
              <span className="truncate font-semibold" style={{ color: 'var(--ds-warning-text)' }}>
                Unsaved changes
              </span>
            </>
          ) : saveError ? (
            <>
              <AlertCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--ds-danger)' }} />
              <span className="truncate font-semibold" style={{ color: 'var(--ds-danger-text)' }} title={saveError}>
                {saveError}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--ds-success)' }} />
              <span className="truncate font-semibold" style={{ color: 'var(--ds-success-text)' }}>
                All changes saved
              </span>
            </>
          )}
        </div>
        {dirty && !saving && (
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={discard} className="hidden md:inline-flex">
            Discard
          </Button>
        )}
        <IconButton icon={Smartphone} label="Preview" tone="default" className="xl:hidden" onClick={() => setPreviewOpen(true)} />
        <Button icon={Eye} onClick={saveAndView} disabled={saving} className="hidden sm:inline-flex">
          {dirty ? 'Save & view' : 'View page'}
        </Button>
        <IconButton icon={Eye} label={dirty ? 'Save & view' : 'View page'} className="sm:hidden" onClick={saveAndView} disabled={saving} />
        <Button variant="primary" icon={Save} onClick={() => void save()} loading={saving} disabled={!dirty && !saving}>
          Save
        </Button>
      </div>
    </div>
  );

  return (
    <div>
      {toasts.node}

      <div className="lg:flex lg:flex-col lg:h-[calc(100dvh_-_var(--a-header-h)_-_2*var(--ds-gutter))]">
        {/* ---------------------------------------------------------- header */}
        <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={requestBack}
              className="inline-flex items-center gap-1.5 font-semibold cursor-pointer hover:underline"
              style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
            >
              <ArrowLeft className="w-4 h-4" /> Back to landing pages
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate font-bold" style={{ fontSize: 'var(--a-fs-title)', maxWidth: '100%' }}>
                {draft.title || 'Untitled page'}
              </h1>
              <Badge status={draft.status} dot />
              <Badge tone={TEMPLATE_TONE[draft.template]}>{templateInfo(draft.template).name}</Badge>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1" style={muted}>
              <span className="ds-num">{stats.views.toLocaleString('en-US')} views</span>
              {onOpenOrders ? (
                <button type="button" className="ds-num cursor-pointer font-semibold hover:underline" style={{ color: 'var(--primary-ink, var(--primary))' }} onClick={() => onOpenOrders(id)}>
                  {stats.orders.toLocaleString('en-US')} orders
                </button>
              ) : (
                <span className="ds-num">{stats.orders.toLocaleString('en-US')} orders</span>
              )}
              <span className="ds-num truncate">{pagePath(savedSlug || draft.slug)}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(allOpen ? {} : Object.fromEntries(SECTION_IDS.map((key) => [key, true])))}>
              {allOpen ? 'Collapse all' : 'Expand all'}
            </Button>
            <Button size="sm" icon={Smartphone} className="xl:hidden" onClick={() => setPreviewOpen(true)}>
              Preview
            </Button>
            <Button size="sm" icon={ExternalLink} onClick={() => window.open(pageUrl(savedSlug || draft.slug), '_blank')}>
              Open page
            </Button>
          </div>
        </div>

        {/* ------------------------------------------------------------ body */}
        <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col xl:grid xl:grid-cols-[minmax(0,1fr)_420px] xl:grid-rows-[minmax(0,1fr)] xl:gap-5">
          <div className="flex min-h-0 flex-col lg:flex-1 xl:h-full">
            <div className="min-h-0 flex-1 space-y-3 pb-24 lg:overflow-y-auto lg:pb-2 lg:pr-1">
              {/* ------------------------------------------------ General */}
              <EditorSection
                id="general"
                title="General"
                description="Title, link, template and status"
                icon={Settings2}
                open={Boolean(open.general)}
                onToggle={toggleOpen}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Page title" required hint="Shown in the dashboard and on order records">
                    <input className="a-field" value={draft.title} maxLength={191} onChange={(event) => patch({ title: event.target.value })} />
                  </Field>
                  <Field label="Link (slug)" hint="Letters, numbers and dashes. Bangla works too.">
                    <div className="flex items-stretch">
                      <span
                        className="inline-flex items-center px-2.5 shrink-0 ds-num"
                        style={{
                          border: '1px solid var(--a-border-strong)',
                          borderRight: 0,
                          borderRadius: 'var(--ds-r-md) 0 0 var(--ds-r-md)',
                          background: 'var(--a-surface-2)',
                          ...muted,
                        }}
                      >
                        /lp/
                      </span>
                      <input
                        className="a-field ds-num min-w-0 flex-1"
                        style={{ borderRadius: '0 var(--ds-r-md) var(--ds-r-md) 0' }}
                        value={draft.slug}
                        maxLength={150}
                        onChange={(event) => patch({ slug: event.target.value })}
                        onBlur={() => patch({ slug: slugify(draft.slug) })}
                      />
                    </div>
                  </Field>
                </div>
                <div
                  className="flex flex-wrap items-center gap-2 px-3 py-2.5"
                  style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border)' }}
                >
                  <Globe className="w-4 h-4 shrink-0" style={{ color: 'var(--a-text-muted)' }} />
                  <span className="ds-num min-w-0 flex-1 truncate" style={{ fontSize: 'var(--a-fs-md)' }} title={decodeURIComponent(liveUrl)}>
                    {decodeURIComponent(liveUrl)}
                  </span>
                  <IconButton
                    icon={Copy}
                    size="sm"
                    tone="plain"
                    label="Copy link"
                    onClick={async () => toasts.push((await copyText(liveUrl)) ? 'Link copied.' : 'Could not copy the link.', 'info')}
                  />
                </div>
                {slugify(draft.slug) !== savedSlug && savedSlug && (
                  <Note tone="warning">Changing the link breaks ads and posts that use the old one ({pagePath(savedSlug)}).</Note>
                )}

                <div>
                  <p className="a-label">Template</p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {LANDING_TEMPLATES.map((item) => {
                      const active = draft.template === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => switchTemplate(item.id)}
                          aria-pressed={active}
                          className="flex items-center gap-3 p-2.5 text-left cursor-pointer"
                          style={{
                            borderRadius: 'var(--ds-r-md)',
                            border: `2px solid ${active ? 'var(--primary)' : 'var(--a-border)'}`,
                            background: active ? tint(0.05) : 'var(--a-surface)',
                          }}
                        >
                          <span className="shrink-0 overflow-hidden" style={{ width: 64, borderRadius: 8, border: '1px solid var(--a-border)' }}>
                            <span className="block" style={{ transform: 'scale(0.36)', transformOrigin: '0 0', width: 178, height: 49 }}>
                              <TemplateThumb id={item.id} swatch={item.swatch} />
                            </span>
                          </span>
                          <span className="min-w-0">
                            <span className="block font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                              {item.name}
                            </span>
                            <span className="block" style={muted}>
                              {item.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5" style={muted}>
                    Switching keeps all your text and images.
                  </p>
                </div>

                <div>
                  <p className="a-label">Status</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(
                      [
                        ['draft', 'Draft', 'Only you can see it (Preview)'],
                        ['active', 'Active', 'Live — takes orders'],
                        ['inactive', 'Inactive', 'Switched off — link shows "not available"'],
                      ] as Array<[PageStatus, string, string]>
                    ).map(([value, label, hint]) => {
                      const active = draft.status === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => patch({ status: value })}
                          aria-pressed={active}
                          className="p-2.5 text-left cursor-pointer"
                          style={{
                            borderRadius: 'var(--ds-r-md)',
                            border: `2px solid ${active ? 'var(--primary)' : 'var(--a-border)'}`,
                            background: active ? tint(0.05) : 'var(--a-surface)',
                          }}
                        >
                          <Badge status={value} dot />
                          <span className="mt-1 block" style={muted}>
                            {hint}
                          </span>
                          <span className="sr-only">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </EditorSection>

              {/* ----------------------------------------------- Products */}
              <EditorSection
                id="products"
                title="Products"
                description={sectionSummary.products}
                icon={Package}
                accent={ACCENTS.violet}
                open={Boolean(open.products)}
                onToggle={toggleOpen}
                badge={<Badge tone={{ bg: 'var(--ds-violet-soft)', fg: 'var(--ds-violet)' }}>{draft.products.length}</Badge>}
              >
                {draft.products.length === 0 ? (
                  <EmptyState
                    icon={Package}
                    title="No products on this page"
                    description="Add the product(s) this offer sells. Customers pick from them in the order form."
                    action={
                      <Button variant="primary" icon={Plus} onClick={() => setPickerOpen(true)}>
                        Add products
                      </Button>
                    }
                  />
                ) : (
                  <div className="space-y-2.5">
                    {draft.products.map((link, index) => {
                      const entry = catalog[link.productId];
                      const product = entry?.product;
                      const known = Boolean(product?.name);
                      const inactive = known && product.status && product.status !== 'active';
                      const variable = Boolean(product?.hasVariations);
                      const allVariations: any[] | null = variable ? entry?.variations ?? null : null;
                      const allIds = (allVariations || []).map((v) => Number(v.id));
                      const offered = link.variationIds && link.variationIds.length ? link.variationIds : null;
                      const priceInfo = productPrice(product);
                      const variationPrices = (allVariations || []).map((v) => variationPrice(v, product)).filter((p) => p > 0);
                      const stock = variable ? (allVariations || []).reduce((sum, v) => sum + num(v.stock), 0) : num(product?.stock);
                      return (
                        <div
                          key={`${link.productId}-${index}`}
                          className="p-3 sm:p-4"
                          style={{ border: '1px solid var(--a-border)', borderRadius: 'var(--ds-r-lg)', background: 'var(--a-surface)' }}
                        >
                          <div className="flex items-start gap-3">
                            <Thumb src={photoOf(product)} alt={product?.name || `#${link.productId}`} size={52} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="min-w-0 truncate font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                                  {product?.name || `Product #${link.productId}`}
                                </span>
                                {variable && <Badge tone={{ bg: 'var(--ds-violet-soft)', fg: 'var(--ds-violet)' }}>Variable</Badge>}
                                {(!known || inactive) && <Badge status="inactive">Not available</Badge>}
                              </div>
                              {known && (
                                <div className="ds-num mt-0.5" style={muted}>
                                  {variable ? (
                                    variationPrices.length ? (
                                      <>
                                        {currency}
                                        {Math.min(...variationPrices).toLocaleString('en-US')}
                                        {Math.max(...variationPrices) > Math.min(...variationPrices) &&
                                          ` – ${currency}${Math.max(...variationPrices).toLocaleString('en-US')}`}
                                      </>
                                    ) : (
                                      'Priced per option'
                                    )
                                  ) : (
                                    <>
                                      {currency}
                                      {priceInfo.price.toLocaleString('en-US')}
                                      {priceInfo.regular && (
                                        <span className="line-through ml-1.5">
                                          {currency}
                                          {priceInfo.regular.toLocaleString('en-US')}
                                        </span>
                                      )}
                                    </>
                                  )}
                                  {' · '}
                                  <span style={{ color: stock > 0 ? undefined : 'var(--ds-danger-text)', fontWeight: stock > 0 ? undefined : 600 }}>
                                    {stock > 0 ? `${stock} in stock` : 'Out of stock'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <RowTools
                              index={index}
                              count={draft.products.length}
                              label={product?.name || 'product'}
                              onMove={(i, dir) => setLinks((links) => moveItem(links, i, dir))}
                              onRemove={(i) => setLinks((links) => links.filter((_, j) => j !== i))}
                            />
                          </div>

                          {(!known || inactive) && (
                            <div className="mt-3">
                              <Note tone="warning">
                                This product is not active (or was deleted), so it does not show on the page. Activate it in Products, or remove it here.
                              </Note>
                            </div>
                          )}

                          <div className="mt-3 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
                            <Toggle
                              checked={Boolean(link.preselect)}
                              onChange={(value) => updateLink(index, { preselect: value })}
                              label="Tick when page opens"
                              description="Already selected in the order form"
                            />
                            <Field label="Default qty">
                              <input
                                type="number"
                                min={1}
                                max={99}
                                className="a-field ds-num"
                                value={link.qty || 1}
                                onChange={(event) => updateLink(index, { qty: Math.min(99, Math.max(1, Math.floor(Number(event.target.value) || 1))) })}
                              />
                            </Field>
                          </div>

                          {variable && known && (
                            <div className="mt-3 p-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border-soft)' }}>
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="font-semibold" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
                                  Options offered{' '}
                                  <span style={{ fontWeight: 400, color: 'var(--a-text-muted)' }}>
                                    {offered ? `(${offered.length} of ${allIds.length})` : '(all)'}
                                  </span>
                                </span>
                                {offered && (
                                  <button
                                    type="button"
                                    className="font-semibold cursor-pointer hover:underline"
                                    style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--primary-ink, var(--primary))' }}
                                    onClick={() => updateLink(index, { variationIds: [] })}
                                  >
                                    Offer all
                                  </button>
                                )}
                              </div>
                              {allVariations === null ? (
                                <div className="flex items-center gap-2" style={muted}>
                                  <Loader2 className="w-4 h-4 animate-spin" /> Loading options…
                                </div>
                              ) : allVariations.length === 0 ? (
                                <p style={muted}>This product has no active options, so it cannot be ordered.</p>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {allVariations.map((variation) => {
                                    const on = !offered || offered.includes(Number(variation.id));
                                    const out = num(variation.stock) <= 0;
                                    return (
                                      <button
                                        key={variation.id}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => toggleVariation(index, Number(variation.id), allIds)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer transition-colors"
                                        style={{
                                          borderRadius: 'var(--ds-r-sm)',
                                          border: `1.5px solid ${on ? 'var(--primary)' : 'var(--a-border-strong)'}`,
                                          background: on ? tint(0.08) : 'var(--a-surface)',
                                          color: on ? 'var(--a-text)' : 'var(--a-text-muted)',
                                          fontSize: 'var(--a-fs-sm)',
                                        }}
                                      >
                                        <span
                                          className="inline-flex items-center justify-center"
                                          style={{
                                            width: 14,
                                            height: 14,
                                            borderRadius: 4,
                                            background: on ? 'var(--primary)' : 'transparent',
                                            border: on ? 0 : '1.5px solid var(--a-border-strong)',
                                            color: '#fff',
                                          }}
                                        >
                                          {on && <Check className="w-2.5 h-2.5" />}
                                        </span>
                                        <span className="font-semibold">{variationName(variation)}</span>
                                        <span className="ds-num" style={{ color: 'var(--a-text-muted)' }}>
                                          {currency}
                                          {variationPrice(variation, product).toLocaleString('en-US')}
                                        </span>
                                        <span className="ds-num" style={{ color: out ? 'var(--ds-danger-text)' : 'var(--a-text-faint)' }}>
                                          · {out ? 'out' : num(variation.stock)}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button variant="soft" icon={Plus} onClick={() => setPickerOpen(true)} disabled={draft.products.length >= MAX_PRODUCTS}>
                        Add products
                      </Button>
                      <span style={muted}>
                        {draft.products.length} / {MAX_PRODUCTS}
                      </span>
                    </div>
                  </div>
                )}
              </EditorSection>

              {/* ----------------------------------------------- Delivery */}
              <EditorSection
                id="delivery"
                title="Delivery"
                description={sectionSummary.delivery}
                icon={Truck}
                accent={ACCENTS.teal}
                open={Boolean(open.delivery)}
                onToggle={toggleOpen}
              >
                <div className="grid gap-2" role="radiogroup" aria-label="Delivery mode">
                  {(
                    [
                      ['store', 'Store charges & rules', 'Normal zone charges, per-product charges and the store-wide free-delivery rule.'],
                      ['custom', 'Custom charges', "This page's own charge per area, and when delivery becomes free."],
                      ['free', 'Always free', 'Delivery is free on every order from this page.'],
                    ] as Array<[LandingShippingConfig['mode'], string, string]>
                  ).map(([value, label, hint]) => {
                    const active = draft.shipping.mode === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setShipping({ mode: value })}
                        className="flex items-start gap-3 p-3 text-left cursor-pointer"
                        style={{
                          borderRadius: 'var(--ds-r-md)',
                          border: `2px solid ${active ? 'var(--primary)' : 'var(--a-border)'}`,
                          background: active ? tint(0.05) : 'var(--a-surface)',
                        }}
                      >
                        <span
                          className="mt-0.5 inline-flex items-center justify-center shrink-0"
                          style={{ width: 18, height: 18, borderRadius: 99, border: `2px solid ${active ? 'var(--primary)' : 'var(--a-border-strong)'}` }}
                        >
                          {active && <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--primary)' }} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                            {label}
                          </span>
                          <span className="block" style={muted}>
                            {hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {draft.shipping.mode === 'custom' && (
                  <div className="space-y-4 ds-fade-in">
                    {zoneCount === 0 ? (
                      <Note tone="warning">No delivery zones are set up. Add them in System Configuration → Shipping.</Note>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {zones.map((zone) => (
                          <Field key={zone.id} label={`${zone.name} (${currency})`} hint={`Store charge: ${currency}${num(zone.charge)} — leave empty to use it`}>
                            <input
                              type="number"
                              min={0}
                              className="a-field ds-num"
                              placeholder={String(num(zone.charge))}
                              value={draft.shipping.charges?.[zone.id] ?? ''}
                              onChange={(event) =>
                                setShipping({ charges: { ...(draft.shipping.charges || {}), [zone.id]: event.target.value === '' ? null : event.target.value } })
                              }
                            />
                          </Field>
                        ))}
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Free delivery from (items)" hint="e.g. 2 = free when 2 or more pieces are ordered">
                        <input
                          type="number"
                          min={0}
                          className="a-field ds-num"
                          placeholder="Off"
                          value={draft.shipping.freeMinQuantity ?? ''}
                          onChange={(event) => setShipping({ freeMinQuantity: event.target.value === '' ? null : Math.max(0, Math.floor(Number(event.target.value))) })}
                        />
                      </Field>
                      <Field label={`Free delivery from (${currency})`} hint="Order total (products only) at least this much">
                        <input
                          type="number"
                          min={0}
                          className="a-field ds-num"
                          placeholder="Off"
                          value={draft.shipping.freeMinSubtotal ?? ''}
                          onChange={(event) => setShipping({ freeMinSubtotal: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })}
                        />
                      </Field>
                    </div>
                  </div>
                )}
                {draft.shipping.mode === 'free' && <Note tone="success">Customers see "Free" on every delivery area.</Note>}
                <p style={muted}>The server bills with these exact rules — the order form shows the same charge.</p>
              </EditorSection>

              {/* ------------------------------------------------- Theme */}
              <EditorSection
                id="theme"
                title="Theme colours"
                description="Primary, accent and background"
                icon={Paintbrush}
                accent={ACCENTS.rose}
                open={Boolean(open.theme)}
                onToggle={toggleOpen}
                badge={
                  <span className="flex gap-1" aria-hidden>
                    {[c.theme.primary, c.theme.accent, c.theme.background].map((color, i) => (
                      <span key={i} style={{ width: 14, height: 14, borderRadius: 99, background: color, border: '1px solid var(--a-border)' }} />
                    ))}
                  </span>
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <ColorField label="Primary" value={c.theme.primary} fallback={templateDefaults.theme.primary} onChange={(value) => setSection('theme', { primary: value })} />
                  <ColorField label="Accent (buttons, badges)" value={c.theme.accent} fallback={templateDefaults.theme.accent} onChange={(value) => setSection('theme', { accent: value })} />
                  <ColorField label="Background" value={c.theme.background} fallback={templateDefaults.theme.background} onChange={(value) => setSection('theme', { background: value })} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span style={muted}>The order button is always green — it converts best.</span>
                  <Button size="sm" icon={RotateCcw} onClick={() => setSection('theme', { ...templateDefaults.theme })}>
                    Reset to template colours
                  </Button>
                </div>
              </EditorSection>

              {/* ------------------------------------------------ Top bar */}
              <EditorSection
                id="topbar"
                title="Top bar"
                description={c.topBar.text || 'A thin line above the page'}
                icon={PanelTop}
                accent={ACCENTS.indigo}
                open={Boolean(open.topbar)}
                onToggle={toggleOpen}
                enabled={c.topBar.enabled}
                onEnabled={(value) => setSection('topBar', { enabled: value })}
              >
                <Field label="Text">
                  <input className="a-field" value={c.topBar.text} onChange={(event) => setSection('topBar', { text: event.target.value })} />
                </Field>
              </EditorSection>

              {/* --------------------------------------------------- Hero */}
              <EditorSection
                id="hero"
                title="Hero"
                description="The first screen: headline, image and button"
                icon={Sparkles}
                accent={ACCENTS.amber}
                open={Boolean(open.hero)}
                onToggle={toggleOpen}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Badge">
                    <input className="a-field" value={c.hero.badge} onChange={(event) => setSection('hero', { badge: event.target.value })} placeholder="e.g. নতুন কালেকশন" />
                  </Field>
                  <Field label="Button text">
                    <input className="a-field" value={c.hero.ctaText} onChange={(event) => setSection('hero', { ctaText: event.target.value })} />
                  </Field>
                </div>
                <Field label="Headline">
                  <input className="a-field" value={c.hero.title} onChange={(event) => setSection('hero', { title: event.target.value })} />
                </Field>
                <Field label="Highlight line" hint="A coloured line under the headline">
                  <input className="a-field" value={c.hero.highlight} onChange={(event) => setSection('hero', { highlight: event.target.value })} />
                </Field>
                <Field label="Subtitle">
                  <textarea className="a-field" rows={3} value={c.hero.subtitle} onChange={(event) => setSection('hero', { subtitle: event.target.value })} />
                </Field>
                <MediaPicker label="Hero image" value={c.hero.image} onChange={(url) => setSection('hero', { image: url })} />
                <p style={muted}>Square images look best. Empty = the first product's photo.</p>
                <div>
                  <p className="a-label">Bullet points</p>
                  <StringListEditor
                    values={c.hero.bullets}
                    onChange={(values) => setSection('hero', { bullets: values })}
                    placeholder="e.g. পণ্য হাতে পেয়ে টাকা দিন"
                    addLabel="Add bullet"
                    max={8}
                  />
                </div>
              </EditorSection>

              {/* -------------------------------------------------- Video */}
              <EditorSection
                id="video"
                title="Video"
                description={videoInfo ? `${videoInfo.kind === 'youtube' ? 'YouTube' : videoInfo.kind === 'facebook' ? 'Facebook' : 'Video file'}${videoInfo.vertical ? ' · vertical' : ''}` : 'YouTube, Facebook or mp4'}
                icon={Video}
                accent={ACCENTS.danger}
                open={Boolean(open.video)}
                onToggle={toggleOpen}
                enabled={c.video.enabled}
                onEnabled={(value) => setSection('video', { enabled: value })}
              >
                <Field label="Section title">
                  <input className="a-field" value={c.video.title} onChange={(event) => setSection('video', { title: event.target.value })} />
                </Field>
                <Field
                  label="Video link"
                  hint="YouTube, YouTube Shorts, Facebook video/reel or an .mp4 link"
                  error={c.video.url.trim() && !videoInfo ? 'This link is not recognised as a YouTube, Facebook or mp4 video.' : undefined}
                >
                  <input className="a-field" value={c.video.url} onChange={(event) => setSection('video', { url: event.target.value })} placeholder="https://www.youtube.com/watch?v=…" />
                </Field>
                {videoInfo && (
                  <div
                    className="mx-auto overflow-hidden bg-black"
                    style={{ borderRadius: 'var(--ds-r-lg)', width: '100%', maxWidth: videoInfo.vertical ? 220 : 420, aspectRatio: videoInfo.vertical ? '9 / 16' : '16 / 9' }}
                  >
                    {videoInfo.kind === 'file' ? (
                      <video src={videoInfo.src} controls preload="metadata" className="h-full w-full" />
                    ) : (
                      <iframe src={videoInfo.src} title="Video preview" loading="lazy" allowFullScreen className="h-full w-full border-0" />
                    )}
                  </div>
                )}
              </EditorSection>

              {/* ----------------------------------------------- Features */}
              <EditorSection
                id="features"
                title="Features"
                description={`${c.features.items.length} item${c.features.items.length === 1 ? '' : 's'} — icons are picked automatically`}
                icon={ListChecks}
                accent={ACCENTS.success}
                open={Boolean(open.features)}
                onToggle={toggleOpen}
                enabled={c.features.enabled}
                onEnabled={(value) => setSection('features', { enabled: value })}
              >
                <Field label="Section title">
                  <input className="a-field" value={c.features.title} onChange={(event) => setSection('features', { title: event.target.value })} />
                </Field>
                <ListEditor
                  items={c.features.items}
                  onChange={(items) => setSection('features', { items })}
                  make={() => ({ title: '', text: '' })}
                  addLabel="Add feature"
                  itemLabel={(item) => item.title || 'Feature'}
                  render={(item, update) => (
                    <div className="grid gap-2">
                      <input className="a-field" placeholder="Title" value={item.title} onChange={(event) => update({ title: event.target.value })} />
                      <textarea className="a-field" rows={2} placeholder="Short description" value={item.text} onChange={(event) => update({ text: event.target.value })} />
                    </div>
                  )}
                />
              </EditorSection>

              {/* ------------------------------------------------ Gallery */}
              <EditorSection
                id="gallery"
                title="Gallery"
                description={c.gallery.images.length ? `${c.gallery.images.length} images` : "Empty — the products' own photos are shown"}
                icon={ImageIcon}
                accent={ACCENTS.info}
                open={Boolean(open.gallery)}
                onToggle={toggleOpen}
                enabled={c.gallery.enabled}
                onEnabled={(value) => setSection('gallery', { enabled: value })}
              >
                <Field label="Section title">
                  <input className="a-field" value={c.gallery.title} onChange={(event) => setSection('gallery', { title: event.target.value })} />
                </Field>
                <MediaPicker gallery values={c.gallery.images} onChangeMany={(urls) => setSection('gallery', { images: urls })} max={24} modalTitle="Gallery images" />
              </EditorSection>

              {/* ----------------------------------------------- Benefits */}
              <EditorSection
                id="benefits"
                title="Benefits"
                description="A checklist of reasons to buy / how to use"
                icon={CheckCircle2}
                accent={ACCENTS.success}
                open={Boolean(open.benefits)}
                onToggle={toggleOpen}
                enabled={c.benefits.enabled}
                onEnabled={(value) => setSection('benefits', { enabled: value })}
              >
                <Field label="Section title">
                  <input className="a-field" value={c.benefits.title} onChange={(event) => setSection('benefits', { title: event.target.value })} />
                </Field>
                <StringListEditor values={c.benefits.items} onChange={(items) => setSection('benefits', { items })} addLabel="Add line" max={16} />
              </EditorSection>

              {/* -------------------------------------------------- Offer */}
              <EditorSection
                id="offer"
                title="Offer & countdown"
                description={
                  Number.isFinite(endsAtMs)
                    ? endsAtMs > Date.now()
                      ? `Countdown ends in ${timeLeft(endsAtMs - Date.now())}`
                      : 'Ended — the banner is hidden'
                    : 'A highlighted banner, optional countdown'
                }
                icon={Timer}
                accent={ACCENTS.amber}
                open={Boolean(open.offer)}
                onToggle={toggleOpen}
                enabled={c.offer.enabled}
                onEnabled={(value) => setSection('offer', { enabled: value })}
              >
                <Field label="Title">
                  <input className="a-field" value={c.offer.title} onChange={(event) => setSection('offer', { title: event.target.value })} />
                </Field>
                <Field label="Text">
                  <textarea className="a-field" rows={2} value={c.offer.text} onChange={(event) => setSection('offer', { text: event.target.value })} />
                </Field>
                <Field label="Offer ends (optional)" hint="A live countdown shows until this time; after it the banner hides itself.">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="datetime-local"
                      className="a-field ds-num min-w-0 flex-1"
                      style={{ minWidth: 200 }}
                      value={toLocalInput(c.offer.endsAt)}
                      onChange={(event) => setSection('offer', { endsAt: fromLocalInput(event.target.value) })}
                    />
                    {[
                      ['+24h', 24],
                      ['+3 days', 72],
                      ['+7 days', 168],
                    ].map(([label, hours]) => (
                      <Button
                        key={label as string}
                        size="sm"
                        onClick={() => setSection('offer', { endsAt: new Date(Date.now() + Number(hours) * 3600 * 1000).toISOString() })}
                      >
                        {label}
                      </Button>
                    ))}
                    {c.offer.endsAt && (
                      <Button size="sm" variant="ghost" icon={X} onClick={() => setSection('offer', { endsAt: '' })}>
                        Clear
                      </Button>
                    )}
                  </div>
                </Field>
                {Number.isFinite(endsAtMs) && endsAtMs <= Date.now() && (
                  <Note tone="warning">This offer has ended, so the banner is hidden on the page. Pick a new end time to show it again.</Note>
                )}
              </EditorSection>

              {/* ------------------------------------------------ Reviews */}
              <EditorSection
                id="reviews"
                title="Reviews"
                description={`${c.reviews.images.length} screenshots · ${c.reviews.items.length} text reviews`}
                icon={Star}
                accent={ACCENTS.amber}
                open={Boolean(open.reviews)}
                onToggle={toggleOpen}
                enabled={c.reviews.enabled}
                onEnabled={(value) => setSection('reviews', { enabled: value })}
              >
                <Note tone="warning">Add real customer reviews only — screenshots of messages or comments you actually received.</Note>
                <Field label="Section title">
                  <input className="a-field" value={c.reviews.title} onChange={(event) => setSection('reviews', { title: event.target.value })} />
                </Field>
                <MediaPicker
                  gallery
                  label="Review screenshots"
                  values={c.reviews.images}
                  onChangeMany={(urls) => setSection('reviews', { images: urls })}
                  max={30}
                  modalTitle="Review screenshots"
                />
                <div>
                  <p className="a-label">Text reviews</p>
                  <ListEditor
                    items={c.reviews.items}
                    onChange={(items) => setSection('reviews', { items })}
                    make={() => ({ name: '', text: '', rating: 5 })}
                    addLabel="Add review"
                    max={24}
                    itemLabel={(item) => item.name || 'Review'}
                    render={(item, update) => (
                      <div className="grid gap-2">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                          <input className="a-field" placeholder="Customer name" value={item.name} onChange={(event) => update({ name: event.target.value })} />
                          <div className="flex items-center gap-0.5 px-1" role="radiogroup" aria-label="Rating">
                            {[1, 2, 3, 4, 5].map((value) => (
                              <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={item.rating === value}
                                aria-label={`${value} stars`}
                                onClick={() => update({ rating: value })}
                                className="cursor-pointer p-0.5"
                              >
                                <Star
                                  className="w-5 h-5"
                                  style={{ color: value <= (item.rating || 5) ? '#f59e0b' : 'var(--ds-gray-300)', fill: value <= (item.rating || 5) ? '#f59e0b' : 'transparent' }}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                        <textarea className="a-field" rows={2} placeholder="What the customer said" value={item.text} onChange={(event) => update({ text: event.target.value })} />
                      </div>
                    )}
                  />
                </div>
              </EditorSection>

              {/* ---------------------------------------------------- FAQ */}
              <EditorSection
                id="faq"
                title="FAQ"
                description={`${c.faq.items.length} question${c.faq.items.length === 1 ? '' : 's'}`}
                icon={HelpCircle}
                accent={ACCENTS.indigo}
                open={Boolean(open.faq)}
                onToggle={toggleOpen}
                enabled={c.faq.enabled}
                onEnabled={(value) => setSection('faq', { enabled: value })}
              >
                <Field label="Section title">
                  <input className="a-field" value={c.faq.title} onChange={(event) => setSection('faq', { title: event.target.value })} />
                </Field>
                <ListEditor
                  items={c.faq.items}
                  onChange={(items) => setSection('faq', { items })}
                  make={() => ({ q: '', a: '' })}
                  addLabel="Add question"
                  max={20}
                  itemLabel={(item) => item.q || 'Question'}
                  render={(item, update) => (
                    <div className="grid gap-2">
                      <input className="a-field" placeholder="Question" value={item.q} onChange={(event) => update({ q: event.target.value })} />
                      <textarea className="a-field" rows={2} placeholder="Answer" value={item.a} onChange={(event) => update({ a: event.target.value })} />
                    </div>
                  )}
                />
              </EditorSection>

              {/* ----------------------------------------------- Checkout */}
              <EditorSection
                id="checkout"
                title="Checkout texts"
                description="Every label in the order form"
                icon={ShoppingCart}
                accent={ACCENTS.success}
                open={Boolean(open.checkout)}
                onToggle={toggleOpen}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Title">
                    <input className="a-field" value={c.checkout.title} onChange={(event) => setSection('checkout', { title: event.target.value })} />
                  </Field>
                  <Field label="Subtitle">
                    <input className="a-field" value={c.checkout.subtitle} onChange={(event) => setSection('checkout', { subtitle: event.target.value })} />
                  </Field>
                  <Field label="Product list title">
                    <input className="a-field" value={c.checkout.productsTitle} onChange={(event) => setSection('checkout', { productsTitle: event.target.value })} />
                  </Field>
                  <Field label="Order button" hint="The total is added after it, e.g. “… — ৳1,250”">
                    <input className="a-field" value={c.checkout.buttonText} onChange={(event) => setSection('checkout', { buttonText: event.target.value })} />
                  </Field>
                  <Field label="Name label">
                    <input className="a-field" value={c.checkout.nameLabel} onChange={(event) => setSection('checkout', { nameLabel: event.target.value })} />
                  </Field>
                  <Field label="Mobile number label">
                    <input className="a-field" value={c.checkout.phoneLabel} onChange={(event) => setSection('checkout', { phoneLabel: event.target.value })} />
                  </Field>
                  <Field label="Address label">
                    <input className="a-field" value={c.checkout.addressLabel} onChange={(event) => setSection('checkout', { addressLabel: event.target.value })} />
                  </Field>
                  <Field label="Cash on Delivery text">
                    <input className="a-field" value={c.checkout.codText} onChange={(event) => setSection('checkout', { codText: event.target.value })} />
                  </Field>
                </div>
                <Toggle
                  checked={c.checkout.noteEnabled}
                  onChange={(value) => setSection('checkout', { noteEnabled: value })}
                  label="Show a note box"
                  description="An optional field for extra instructions"
                />
                {c.checkout.noteEnabled && (
                  <Field label="Note placeholder">
                    <input className="a-field" value={c.checkout.notePlaceholder} onChange={(event) => setSection('checkout', { notePlaceholder: event.target.value })} />
                  </Field>
                )}
                <p style={muted}>
                  Delivery areas come from System Configuration → Shipping; payment options from Payments (Cash on Delivery, bKash, Nagad, SSLCommerz).
                </p>
              </EditorSection>

              {/* ------------------------------------------------- Footer */}
              <EditorSection
                id="footer"
                title="Footer"
                description="Call and WhatsApp buttons"
                icon={Megaphone}
                accent={ACCENTS.teal}
                open={Boolean(open.footer)}
                onToggle={toggleOpen}
              >
                <Field label="Text">
                  <input className="a-field" value={c.footer.text} onChange={(event) => setSection('footer', { text: event.target.value })} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Phone" hint="Empty = the store phone">
                    <input className="a-field ds-num" inputMode="tel" value={c.footer.phone} onChange={(event) => setSection('footer', { phone: event.target.value })} placeholder={settings?.general?.phone || '01XXXXXXXXX'} />
                  </Field>
                  <Field label="WhatsApp" hint="Empty = the store WhatsApp">
                    <input className="a-field ds-num" inputMode="tel" value={c.footer.whatsapp} onChange={(event) => setSection('footer', { whatsapp: event.target.value })} placeholder={settings?.general?.whatsapp || '01XXXXXXXXX'} />
                  </Field>
                </div>
              </EditorSection>

              {/* -------------------------------------------------- Pixel */}
              <EditorSection
                id="pixel"
                title="Meta Pixel"
                description={c.pixel.metaPixelId ? `Extra pixel ${c.pixel.metaPixelId}` : 'Optional extra pixel for this page'}
                icon={MousePointerClick}
                accent={ACCENTS.info}
                open={Boolean(open.pixel)}
                onToggle={toggleOpen}
              >
                <Field
                  label="Extra Meta Pixel ID"
                  hint="Digits only. Leave empty if you only use the store pixel."
                  error={c.pixel.metaPixelId && !/^\d{8,20}$/.test(c.pixel.metaPixelId) ? 'Digits only (usually 15–16 digits)' : undefined}
                >
                  <input
                    className="a-field ds-num"
                    inputMode="numeric"
                    value={c.pixel.metaPixelId}
                    onChange={(event) => setSection('pixel', { metaPixelId: event.target.value.replace(/\s/g, '') })}
                    placeholder="e.g. 1234567890123456"
                  />
                </Field>
                <Note>
                  The store pixel from System Configuration → Pixel always fires on landing pages too. An extra pixel here gets the same events (PageView,
                  ViewContent, AddToCart, InitiateCheckout, Purchase) — useful for a separate ad account.
                </Note>
              </EditorSection>

              {/* ---------------------------------------------------- SEO */}
              <EditorSection
                id="seo"
                title="SEO & sharing"
                description="Browser tab title, description and share image"
                icon={Tag}
                accent={ACCENTS.violet}
                open={Boolean(open.seo)}
                onToggle={toggleOpen}
              >
                <Field label="Title" hint={`${c.seo.title.length}/70 — empty = the page title`}>
                  <input className="a-field" value={c.seo.title} maxLength={120} onChange={(event) => setSection('seo', { title: event.target.value })} placeholder={draft.title} />
                </Field>
                <Field label="Description" hint={`${c.seo.description.length}/160 — empty = the hero subtitle`}>
                  <textarea className="a-field" rows={2} value={c.seo.description} maxLength={300} onChange={(event) => setSection('seo', { description: event.target.value })} />
                </Field>
                <MediaPicker label="Share image" value={c.seo.image} onChange={(url) => setSection('seo', { image: url })} />
                <div className="overflow-hidden" style={{ maxWidth: 420, borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)' }}>
                  <div style={{ aspectRatio: '1.91 / 1', background: 'var(--a-surface-3)' }}>
                    {(c.seo.image || c.hero.image) && (
                      <img src={c.seo.image || c.hero.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="px-3 py-2" style={{ background: 'var(--a-surface-2)' }}>
                    <p className="uppercase truncate" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                      {window.location.host}
                    </p>
                    <p className="font-bold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                      {c.seo.title || draft.title}
                    </p>
                    <p className="truncate" style={muted}>
                      {c.seo.description || c.hero.subtitle}
                    </p>
                  </div>
                </div>
              </EditorSection>
            </div>

            {saveBar}
          </div>

          {/* ----------------------------------------------------- preview */}
          <aside className="hidden xl:flex xl:min-h-0 xl:flex-col a-card overflow-hidden" aria-label="Live preview">
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid var(--a-border)' }}>
              <span className="flex items-center gap-2 font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--ds-success)' }} /> Live preview
              </span>
              <DeviceSwitch device={device} onChange={setDevice} />
            </div>
            <div className="min-h-0 flex-1 p-3" style={{ background: 'var(--a-surface-2)' }}>
              {previewPage && <PreviewPane page={previewPage} products={previewProducts} settings={previewSettings} device={device} />}
            </div>
          </aside>
        </div>
      </div>

      {/* Phones / tablets: full-screen preview */}
      {previewOpen && previewPage && (
        <div className="fixed inset-0 flex flex-col ds-fade-in" style={{ zIndex: 'var(--ds-z-modal)' as any, background: 'var(--a-surface-2)' }}>
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5" style={{ background: 'var(--a-surface)', borderBottom: '1px solid var(--a-border)' }}>
            <span className="font-bold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
              Preview — {draft.title || 'Untitled page'}
            </span>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex">
                <DeviceSwitch device={device} onChange={setDevice} />
              </span>
              <IconButton icon={X} label="Close preview" onClick={() => setPreviewOpen(false)} />
            </div>
          </div>
          <div className="min-h-0 flex-1 sm:p-3">
            <PreviewPane page={previewPage} products={previewProducts} settings={previewSettings} device={device} />
          </div>
        </div>
      )}

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currency={currency}
        existingIds={draft.products.map((link) => link.productId)}
        room={Math.max(0, MAX_PRODUCTS - draft.products.length)}
        onAdd={addProducts}
      />

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        message="You have unsaved changes on this landing page. They will be lost if you go back now."
        confirmLabel="Discard changes"
        onConfirm={() => {
          setConfirmLeave(false);
          onBack();
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
};

/* ========================================================================== */
/* List                                                                        */
/* ========================================================================== */

export const AdminLandingPages: React.FC<Props> = ({ currency, shippingZones, onOpenOrders }) => {
  const money = currency || '৳';
  const toasts = useToasts();
  const [rows, setRows] = useState<LandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LandingRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/landing-pages');
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) throw new Error((data as any)?.error || 'Could not load landing pages.');
      setRows(
        data.map((row: any) => ({
          ...row,
          id: Number(row.id),
          template: row.template === 'organic' ? 'organic' : 'fashion',
          productCount: num(row.productCount),
          views: num(row.views),
          orders: num(row.orders),
          revenue: num(row.revenue),
        }))
      );
    } catch (err: any) {
      setError(err?.message || 'Could not load landing pages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEditor = (pageId: number) => {
    setEditingId(pageId);
    window.scrollTo({ top: 0 });
    (document.querySelector('.admin-shell main') as HTMLElement | null)?.scrollTo?.({ top: 0 });
  };

  const stats = useMemo(
    () => ({
      pages: rows.length,
      active: rows.filter((row) => row.status === 'active').length,
      orders: rows.reduce((sum, row) => sum + row.orders, 0),
      revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== 'all' && row.status !== filter) return false;
      if (term && !`${row.title} ${row.slug}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, search, filter]);

  const copyLink = async (row: LandingRow) => {
    const ok = await copyText(pageUrl(row.slug));
    toasts.push(ok ? 'Link copied.' : 'Could not copy — open the page and copy it from the address bar.', ok ? 'info' : 'error');
  };

  const setStatus = async (row: LandingRow, status: PageStatus) => {
    if (status === 'active' && row.productCount === 0) {
      toasts.push('Add at least one product before activating this page.', 'warning');
      openEditor(row.id);
      return;
    }
    setBusyId(row.id);
    setRows((list) => list.map((item) => (item.id === row.id ? { ...item, status } : item)));
    try {
      const res = await fetch(`/api/admin/landing-pages/${row.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not change the status.');
      toasts.push(status === 'active' ? 'Page is live.' : 'Page switched off.');
    } catch (err: any) {
      toasts.push(err?.message || 'Could not change the status.', 'error');
      void load(true);
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (row: LandingRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/landing-pages/${row.id}/duplicate`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not duplicate the page.');
      toasts.push('Copy created as a draft.');
      await load(true);
    } catch (err: any) {
      toasts.push(err?.message || 'Could not duplicate the page.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/landing-pages/${confirmDelete.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not delete the page.');
      setRows((list) => list.filter((row) => row.id !== confirmDelete.id));
      toasts.push('Landing page deleted.');
      setConfirmDelete(null);
    } catch (err: any) {
      toasts.push(err?.message || 'Could not delete the page.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (editingId) {
    return (
      <LandingEditor
        key={editingId}
        id={editingId}
        currency={money}
        shippingZones={shippingZones || []}
        onOpenOrders={onOpenOrders}
        onBack={() => {
          setEditingId(null);
          void load(true);
        }}
      />
    );
  }

  const conversion = (row: LandingRow) => (row.views > 0 && row.orders > 0 ? `${((row.orders / row.views) * 100).toFixed(1)}%` : '');

  const ordersCell = (row: LandingRow) =>
    onOpenOrders && row.orders > 0 ? (
      <button
        type="button"
        onClick={() => onOpenOrders(row.id)}
        className="ds-num font-bold cursor-pointer hover:underline"
        style={{ color: 'var(--primary-ink, var(--primary))' }}
        title="Show these orders"
      >
        {row.orders.toLocaleString('en-US')}
      </button>
    ) : (
      <span className="ds-num font-semibold">{row.orders.toLocaleString('en-US')}</span>
    );

  const actions = (row: LandingRow, compact = false) => {
    const live = row.status === 'active';
    const busy = busyId === row.id;
    return (
      <div className={`flex items-center gap-1.5 ${compact ? 'flex-wrap' : 'justify-end'}`}>
        {compact ? (
          <Button size="sm" variant="primary" icon={Pencil} onClick={() => openEditor(row.id)}>
            Edit
          </Button>
        ) : (
          <IconButton icon={Pencil} size="sm" tone="primary" label="Edit" onClick={() => openEditor(row.id)} />
        )}
        <IconButton icon={Eye} size="sm" label="Preview (new tab)" onClick={() => window.open(pageUrl(row.slug), '_blank')} />
        {live && <IconButton icon={ExternalLink} size="sm" tone="success" label="Open live link" onClick={() => window.open(pageUrl(row.slug), '_blank', 'noopener')} />}
        <IconButton
          icon={Power}
          size="sm"
          tone={live ? 'warning' : 'success'}
          label={live ? 'Deactivate' : 'Activate'}
          disabled={busy}
          onClick={() => setStatus(row, live ? 'inactive' : 'active')}
        />
        <IconButton icon={Copy} size="sm" label="Duplicate" disabled={busy} onClick={() => duplicate(row)} />
        <IconButton icon={Trash2} size="sm" tone="danger" label="Delete" disabled={busy} onClick={() => setConfirmDelete(row)} />
      </div>
    );
  };

  const slugLine = (row: LandingRow) => (
    <span className="flex min-w-0 items-center gap-1">
      <span className="ds-num truncate" style={muted} title={pagePath(row.slug)}>
        {pagePath(row.slug)}
      </span>
      <button
        type="button"
        onClick={() => copyLink(row)}
        aria-label="Copy link"
        title="Copy link"
        className="inline-flex shrink-0 items-center justify-center cursor-pointer"
        style={{ width: 22, height: 22, borderRadius: 6, color: 'var(--a-text-muted)' }}
      >
        <Link2 className="w-3.5 h-3.5" />
      </button>
    </span>
  );

  const emptyState = (
    <EmptyState
      icon={Rocket}
      title={rows.length === 0 ? 'Launch your first landing page' : 'No pages match your filters'}
      description={
        rows.length === 0
          ? 'A one-page offer with its own order form — made for Facebook ads. Pick a template and a product, and it is ready in one click.'
          : 'Try a different search or filter.'
      }
      action={
        rows.length === 0 ? (
          <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
            Create landing page
          </Button>
        ) : (
          <Button
            onClick={() => {
              setSearch('');
              setFilter('all');
            }}
          >
            Clear filters
          </Button>
        )
      }
    />
  );

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Landing Pages"
        subtitle="One-page offers with their own checkout — built for Facebook & Instagram ads"
        icon={LayoutTemplate}
        accent={ACCENTS.violet}
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => load()} loading={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
              Create landing page
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Pages" value={stats.pages} icon={FileText} color={ACCENTS.violet} loading={loading && rows.length === 0} />
        <StatCard label="Active" value={stats.active} icon={Rocket} color="var(--ds-success)" loading={loading && rows.length === 0} />
        <StatCard
          label="Total orders"
          value={stats.orders.toLocaleString('en-US')}
          icon={ShoppingCart}
          color={ACCENTS.info}
          loading={loading && rows.length === 0}
        />
        <StatCard
          label="Revenue"
          value={<Money value={stats.revenue} currency={money} />}
          icon={CircleDollarSign}
          color={ACCENTS.amber}
          loading={loading && rows.length === 0}
        />
      </div>

      {rows.length > 0 && (
        <Card className="mb-4" padded={false}>
          <div className="flex flex-col gap-2.5 p-3 lg:flex-row lg:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by title or link" className="min-w-0 flex-1" />
            <FilterPills
              pills={[
                { id: 'all', label: 'All', count: rows.length },
                { id: 'active', label: 'Active', count: stats.active, color: 'var(--ds-success)' },
                { id: 'draft', label: 'Draft', count: rows.filter((r) => r.status === 'draft').length, color: 'var(--ds-warning)' },
                { id: 'inactive', label: 'Inactive', count: rows.filter((r) => r.status === 'inactive').length, color: 'var(--ds-text-muted)' },
              ]}
              active={filter}
              onChange={setFilter}
            />
          </div>
        </Card>
      )}

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={() => load()} />
        </Card>
      ) : (
        <>
          {/* Wide screens: table (cards below, where six actions would not fit) */}
          <div className="hidden xl:block">
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th className="hidden 2xl:table-cell">ID</th>
                    <th style={{ minWidth: 240 }}>Page</th>
                    <th>Template</th>
                    <th style={{ textAlign: 'right' }}>Products</th>
                    <th style={{ textAlign: 'right' }}>Views</th>
                    <th style={{ textAlign: 'right' }}>Orders</th>
                    <th style={{ textAlign: 'right' }}>Revenue</th>
                    <th>Status</th>
                    <th className="hidden 2xl:table-cell">Created</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 ? (
                    <LoadingRows rows={4} cols={10} />
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-0">
                        {emptyState}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr key={row.id}>
                        <td className="ds-num hidden 2xl:table-cell" style={{ color: 'var(--a-text-muted)' }}>
                          #{row.id}
                        </td>
                        <td>
                          <div className="flex min-w-0 items-center gap-3">
                            <Thumb src={row.image} alt={row.title} size={44} />
                            <div className="min-w-0" style={{ maxWidth: 280 }}>
                              <button
                                type="button"
                                onClick={() => openEditor(row.id)}
                                className="block max-w-full truncate text-left font-semibold cursor-pointer hover:underline"
                                title={row.title}
                              >
                                {row.title}
                              </button>
                              {slugLine(row)}
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge tone={TEMPLATE_TONE[row.template]} dot>
                            {row.template === 'organic' ? 'Organic' : 'Fashion'}
                          </Badge>
                        </td>
                        <td className="ds-num" style={{ textAlign: 'right' }}>
                          {row.productCount}
                        </td>
                        <td className="ds-num" style={{ textAlign: 'right' }}>
                          {row.views.toLocaleString('en-US')}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {ordersCell(row)}
                          {conversion(row) && (
                            <span className="block ds-num" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }} title="Orders ÷ views">
                              {conversion(row)}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Money value={row.revenue} currency={money} bold />
                        </td>
                        <td>
                          <Badge status={row.status} dot />
                        </td>
                        <td className="ds-num whitespace-nowrap hidden 2xl:table-cell" style={{ color: 'var(--a-text-muted)' }}>
                          {formatDate(row.createdAt)}
                        </td>
                        <td>{actions(row)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableWrap>
          </div>

          {/* Phones: cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 xl:hidden">
            {loading && rows.length === 0 ? (
              [0, 1, 2].map((i) => <span key={i} className="ds-skeleton block h-40 rounded-[var(--ds-r-lg)]" />)
            ) : filtered.length === 0 ? (
              <Card padded={false}>{emptyState}</Card>
            ) : (
              filtered.map((row) => (
                <div key={row.id} className="a-card p-3.5">
                  <div className="flex items-start gap-3">
                    <Thumb src={row.image} alt={row.title} size={52} />
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => openEditor(row.id)} className="block max-w-full truncate text-left font-bold cursor-pointer" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {row.title}
                      </button>
                      {slugLine(row)}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge status={row.status} dot />
                        <Badge tone={TEMPLATE_TONE[row.template]}>{row.template === 'organic' ? 'Organic' : 'Fashion'}</Badge>
                        <span className="ds-num" style={muted}>
                          #{row.id} · {formatDate(row.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div
                    className="mt-3 grid grid-cols-4 overflow-hidden text-center"
                    style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', border: '1px solid var(--a-border-soft)' }}
                  >
                    {[
                      ['Products', <span className="ds-num font-semibold">{row.productCount}</span>],
                      ['Views', <span className="ds-num font-semibold">{row.views.toLocaleString('en-US')}</span>],
                      ['Orders', ordersCell(row)],
                      ['Revenue', <Money value={row.revenue} currency={money} bold />],
                    ].map(([label, value], index) => (
                      <div key={label as string} className="min-w-0 px-1 py-2" style={{ borderLeft: index ? '1px solid var(--a-border-soft)' : undefined }}>
                        <div className="truncate" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                          {label}
                        </div>
                        <div className="truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">{actions(row, true)}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <CreateLandingModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        currency={money}
        onCreated={(page) => {
          setCreateOpen(false);
          toasts.push('Landing page created — make it yours, then set it Active.');
          void load(true);
          if (page?.id) openEditor(Number(page.id));
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete landing page?"
        message={`"${confirmDelete?.title || ''}" will be deleted and its link will stop working. Orders placed from it are kept and still show the page name.`}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};

export default AdminLandingPages;
