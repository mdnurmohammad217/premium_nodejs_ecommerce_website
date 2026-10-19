import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  PlayCircle,
  Ruler,
  Truck,
  X,
  Pill,
  Shapes,
  Star,
  Zap,
  Sparkles,
  Store,
} from 'lucide-react';
import { Field, Select, mix, useDebounced } from './ui.tsx';
import { videoEmbed } from '../../lib/landingTemplates.ts';
import { parseCharges } from '../../lib/shipping.ts';
import type { ShippingZoneConfig } from '../../types/index.ts';

/**
 * Building blocks for the Products page: the category tree used by the
 * filters, the product flags, the stock pill, the summary tiles and the three
 * newer form sections (product video, size guide, own delivery charges).
 */

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

/* -------------------------------------------------------------------------- */
/* Categories                                                                  */
/* -------------------------------------------------------------------------- */

export interface CategoryEntry {
  item: any;
  depth: number;
}

const byOrder = (a: any, b: any) =>
  (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || String(a.name).localeCompare(String(b.name));

/**
 * Categories in tree order — main → sub → sub-sub — each with its depth, so a
 * select can indent them. A category whose parent is missing is treated as a
 * main category, and a broken parent loop can never hang the walk.
 */
export function categoryTree(categories: any[]): CategoryEntry[] {
  const byId = new Map(categories.map((item) => [String(item.id), item]));
  const children = new Map<string, any[]>();
  const roots: any[] = [];
  for (const item of categories) {
    const parent = item.parentId && byId.has(String(item.parentId)) ? String(item.parentId) : null;
    if (parent === null || parent === String(item.id)) roots.push(item);
    else {
      const list = children.get(parent) || [];
      list.push(item);
      children.set(parent, list);
    }
  }
  const out: CategoryEntry[] = [];
  const seen = new Set<string>();
  const walk = (list: any[], depth: number) => {
    [...list].sort(byOrder).forEach((item) => {
      const id = String(item.id);
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ item, depth });
      walk(children.get(id) || [], depth + 1);
    });
  };
  walk(roots, 0);
  categories.forEach((item) => {
    if (!seen.has(String(item.id))) {
      seen.add(String(item.id));
      out.push({ item, depth: 0 });
    }
  });
  return out;
}

/** An <option> label indented by depth (option text collapses normal spaces) */
export const indentLabel = (name: string, depth: number) =>
  depth <= 0 ? name : `${'    '.repeat(depth)}└ ${name}`;

/** "Medicine › Tablets › Pain relief" for a category id */
export function categoryPath(byId: Map<string, any>, id: any): string[] {
  const path: string[] = [];
  let cursor = id ? byId.get(String(id)) : null;
  let guard = 0;
  while (cursor && guard < 6) {
    path.unshift(String(cursor.name));
    cursor = cursor.parentId ? byId.get(String(cursor.parentId)) : null;
    guard += 1;
  }
  return path;
}

/** The category and everything filed under it, as string ids */
export function descendantIds(categories: any[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let grew = true;
  let guard = 0;
  while (grew && guard < 6) {
    grew = false;
    guard += 1;
    for (const item of categories) {
      const id = String(item.id);
      if (!ids.has(id) && item.parentId && ids.has(String(item.parentId))) {
        ids.add(id);
        grew = true;
      }
    }
  }
  return ids;
}

/* -------------------------------------------------------------------------- */
/* Delivery charges                                                            */
/* -------------------------------------------------------------------------- */

/** API value (JSON text or object) → the editable map the form works with */
export const chargesToDraft = (raw: unknown): Record<string, string> => {
  const parsed = parseCharges(raw);
  if (!parsed) return {};
  return Object.fromEntries(Object.entries(parsed).map(([zone, charge]) => [zone, String(charge)]));
};

/** The form's map → the JSON text the products endpoint stores (null when all blank) */
export const chargesToPayload = (map: Record<string, string> | null | undefined): string | null => {
  const out: Record<string, number> = {};
  for (const [zone, raw] of Object.entries(map || {})) {
    const text = String(raw ?? '').trim();
    if (text === '') continue;
    const value = Number(text);
    if (Number.isFinite(value) && value >= 0) out[zone] = value;
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out) : null;
};

/** How many zones have their own charge set on a product row (for the list badges) */
export const ownChargeCount = (raw: unknown) => Object.keys(parseCharges(raw) || {}).length;

/* -------------------------------------------------------------------------- */
/* Small visual parts                                                          */
/* -------------------------------------------------------------------------- */

/** A compact tinted badge with an icon — the product flags use it */
export const MiniBadge: React.FC<{
  icon?: IconType;
  color: string;
  text?: string;
  children: React.ReactNode;
  title?: string;
}> = ({ icon: Icon, color, text, children, title }) => (
  <span
    title={title}
    className="inline-flex items-center gap-1 font-semibold whitespace-nowrap shrink-0"
    style={{
      height: 22,
      padding: '0 8px',
      borderRadius: 'var(--ds-r-full)',
      fontSize: 'var(--ds-fs-xs)',
      background: mix(color, 0.11),
      color: text || color,
      border: `1px solid ${mix(color, 0.2)}`,
    }}
  >
    {Icon && <Icon className="w-3 h-3" />}
    {children}
  </span>
);

/** Every flag worth seeing at a glance on a product row */
export const ProductFlags: React.FC<{ row: any; className?: string }> = ({ row, className = '' }) => {
  const flags: React.ReactNode[] = [];
  if (row.featured)
    flags.push(
      <MiniBadge key="featured" icon={Star} color="var(--ds-amber)" text="var(--ds-warning-text)">
        Featured
      </MiniBadge>
    );
  if (row.freeShipping)
    flags.push(
      <MiniBadge key="free" icon={Truck} color="var(--ds-teal)">
        Free delivery
      </MiniBadge>
    );
  else if (ownChargeCount(row.shippingCharges) > 0)
    flags.push(
      <MiniBadge key="charge" icon={Truck} color="var(--ds-info)" text="var(--ds-info-text)" title="Has its own delivery charge">
        Own delivery charge
      </MiniBadge>
    );
  if (row.videoUrl)
    flags.push(
      <MiniBadge key="video" icon={PlayCircle} color="var(--ds-rose)">
        Video
      </MiniBadge>
    );
  if (row.hasVariations)
    flags.push(
      <MiniBadge key="variations" icon={Shapes} color="var(--ds-violet)">
        Variations
      </MiniBadge>
    );
  if (row.requiresPrescription)
    flags.push(
      <MiniBadge key="rx" icon={Pill} color="var(--ds-danger)" text="var(--ds-danger-text)" title="Prescription required">
        Rx
      </MiniBadge>
    );
  if (row.isFlashSale)
    flags.push(
      <MiniBadge key="flash" icon={Zap} color="var(--ds-amber)" text="var(--ds-warning-text)">
        Flash
      </MiniBadge>
    );
  if (row.wholesaleEnabled && Number(row.wholesalePrice) > 0)
    flags.push(
      <MiniBadge key="wholesale" icon={Store} color="var(--ds-indigo)">
        Wholesale
      </MiniBadge>
    );
  if (row.isNewArrival)
    flags.push(
      <MiniBadge key="new" icon={Sparkles} color="var(--ds-info)" text="var(--ds-info-text)">
        New
      </MiniBadge>
    );
  if (row.sizeGuideId)
    flags.push(
      <MiniBadge key="size" icon={Ruler} color="var(--ds-gray-500)" text="var(--ds-neutral-text)">
        Size guide
      </MiniBadge>
    );
  if (flags.length === 0) return null;
  return <div className={`flex flex-wrap items-center gap-1 ${className}`}>{flags}</div>;
};

/** Stock as a coloured pill: in stock / low / out */
export const StockPill: React.FC<{
  stock: number;
  low: boolean;
  unit?: string | null;
  variations?: boolean;
}> = ({ stock, low, unit, variations }) => {
  const out = Number(stock) <= 0;
  const tone = out
    ? { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)', dot: 'var(--ds-danger)' }
    : low
    ? { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', dot: 'var(--ds-warning)' }
    : { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', dot: 'var(--ds-success)' };
  return (
    <span
      className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap"
      style={{
        height: 26,
        padding: '0 10px',
        borderRadius: 'var(--ds-r-full)',
        background: tone.bg,
        color: tone.fg,
        fontSize: 'var(--a-fs-sm)',
      }}
      title={variations ? 'Total across all variations' : undefined}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: tone.dot }} />
      {out ? (
        'Out of stock'
      ) : (
        <>
          <span className="ds-num font-bold">{stock}</span>
          {low ? 'left · Low' : variations ? 'in variations' : unit ? unit : 'in stock'}
        </>
      )}
    </span>
  );
};

/** A clickable summary tile: tinted icon chip, count and label */
export const SummaryTile: React.FC<{
  label: string;
  value: React.ReactNode;
  icon: IconType;
  color: string;
  /** readable text colour on the tint (amber needs a darker one) */
  text?: string;
  active?: boolean;
  loading?: boolean;
  onClick?: () => void;
  note?: string;
}> = ({ label, value, icon: Icon, color, text, active, loading, onClick, note }) => {
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? Boolean(active) : undefined}
      className={`text-left w-full min-w-0 flex items-center gap-2.5 sm:gap-3 px-3 py-2.5 sm:px-3.5 sm:py-3 transition-all ${
        onClick ? 'cursor-pointer hover:-translate-y-px' : ''
      }`}
      style={{
        borderRadius: 'var(--ds-r-lg)',
        background: active ? mix(color, 0.12) : 'var(--a-surface)',
        border: `1px solid ${active ? color : 'var(--a-border)'}`,
        boxShadow: active ? `0 0 0 3px ${mix(color, 0.14)}` : 'var(--ds-shadow-xs)',
      }}
    >
      <span
        className="inline-flex items-center justify-center shrink-0 w-8 h-8 sm:w-10 sm:h-10"
        style={{ borderRadius: 'var(--ds-r-md)', background: mix(color, 0.14), color }}
      >
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
          {label}
        </span>
        {loading ? (
          <span className="ds-skeleton block h-5 w-12 mt-1" />
        ) : (
          <span
            className="block font-bold ds-num leading-tight truncate"
            style={{ fontSize: 'clamp(15px, 4.2vw, var(--ds-fs-xl))', color: text || 'var(--a-text)' }}
          >
            {value}
          </span>
        )}
        {note && (
          <span className="block truncate" style={{ fontSize: 'var(--ds-fs-xs)', color: 'var(--a-text-faint)' }}>
            {note}
          </span>
        )}
      </span>
    </Tag>
  );
};

/** A tinted panel used to group a form section */
export const FormPanel: React.FC<{
  icon: IconType;
  color: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  highlighted?: boolean;
  children?: React.ReactNode;
}> = ({ icon: Icon, color, title, description, action, highlighted, children }) => (
  <section
    className="space-y-3"
    style={{
      padding: 'var(--ds-s-4)',
      borderRadius: 'var(--ds-r-lg)',
      border: `1px solid ${highlighted ? mix(color, 0.45) : 'var(--a-border)'}`,
      background: highlighted ? mix(color, 0.06) : 'var(--a-surface)',
    }}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <span
          className="inline-flex items-center justify-center shrink-0"
          style={{ width: 34, height: 34, borderRadius: 'var(--ds-r-md)', background: mix(color, 0.14), color }}
        >
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <div className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
            {title}
          </div>
          {description && (
            <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{description}</div>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    {children}
  </section>
);

/** Info / warning note inside a form */
export const Note: React.FC<{ tone?: 'info' | 'warning' | 'danger'; children: React.ReactNode }> = ({
  tone = 'info',
  children,
}) => {
  const tones = {
    info: { bg: 'var(--ds-info-soft)', fg: 'var(--ds-info-text)', Icon: Info },
    warning: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', Icon: AlertTriangle },
    danger: { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)', Icon: AlertTriangle },
  }[tone];
  const ToneIcon = tones.Icon;
  return (
    <div
      className="flex items-start gap-2.5 p-3"
      style={{ borderRadius: 'var(--ds-r-md)', background: tones.bg, color: tones.fg, fontSize: 'var(--a-fs-md)' }}
    >
      <ToneIcon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Product video                                                               */
/* -------------------------------------------------------------------------- */

/**
 * YouTube / Shorts / Facebook video or reel / mp4 link with a live preview.
 * The preview follows the link after a short pause, so typing does not reload
 * the player on every keystroke.
 */
export const ProductVideoField: React.FC<{ value: string; onChange: (value: string) => void }> = ({
  value,
  onChange,
}) => {
  const typed = String(value || '').trim();
  const settled = useDebounced(typed, 350);
  const embed = settled ? videoEmbed(settled) : null;
  const recognisedNow = typed ? Boolean(videoEmbed(typed)) : false;
  const kind = embed
    ? embed.kind === 'youtube'
      ? embed.vertical
        ? 'YouTube Shorts'
        : 'YouTube video'
      : embed.kind === 'facebook'
      ? embed.vertical
        ? 'Facebook reel'
        : 'Facebook video'
      : 'Video file'
    : '';

  return (
    <FormPanel
      icon={PlayCircle}
      color="var(--ds-rose)"
      title="Product video"
      description="Shown after the photos on the product page. Paste a YouTube, YouTube Shorts, Facebook video/reel or .mp4 link."
      highlighted={Boolean(typed)}
      action={
        typed ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1 font-semibold cursor-pointer"
            style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-danger-text)', minHeight: 36 }}
          >
            <X className="w-3.5 h-3.5" />
            Remove
          </button>
        ) : undefined
      }
    >
      <input
        type="url"
        inputMode="url"
        className="a-field"
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://youtu.be/…  ·  https://www.facebook.com/…/videos/…  ·  …/video.mp4"
        aria-label="Product video link"
      />

      <div className="flex flex-wrap gap-1">
        {['YouTube', 'Shorts', 'Facebook video', 'Facebook reel', 'MP4'].map((label) => (
          <span
            key={label}
            className="font-semibold"
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--ds-r-full)',
              background: 'var(--a-surface-3)',
              color: 'var(--a-text-muted)',
              fontSize: 'var(--ds-fs-xs)',
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {typed && !recognisedNow && typed === settled && (
        <Note tone="warning">
          <strong>Link not recognised.</strong> Use a YouTube, YouTube Shorts, Facebook video/reel or a direct .mp4
          link — the product cannot be saved with this link.
        </Note>
      )}

      {embed && recognisedNow && (
        <div className="space-y-2">
          <div
            className="inline-flex items-center gap-1.5 font-semibold"
            style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-success-text)' }}
          >
            <CheckCircle2 className="w-4 h-4" />
            {kind} recognised — preview
          </div>
          <div
            className="overflow-hidden"
            style={{
              width: '100%',
              maxWidth: embed.vertical ? 260 : 560,
              aspectRatio: embed.vertical ? '9 / 16' : '16 / 9',
              borderRadius: 'var(--ds-r-md)',
              background: '#000',
              border: '1px solid var(--a-border)',
            }}
          >
            {embed.kind === 'file' ? (
              <video src={embed.src} controls playsInline preload="metadata" className="w-full h-full object-contain" />
            ) : (
              <iframe
                key={embed.src}
                src={embed.src}
                title="Product video preview"
                className="w-full h-full"
                style={{ border: 0 }}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            )}
          </div>
        </div>
      )}
    </FormPanel>
  );
};

/* -------------------------------------------------------------------------- */
/* Size guide                                                                  */
/* -------------------------------------------------------------------------- */

export interface SizeGuideSummary {
  id: number;
  name: string;
  columns: string[];
  rows: string[][];
  productCount?: number;
  status?: string;
}

export const SizeGuidePicker: React.FC<{
  value: number | null;
  onChange: (id: number | null) => void;
  guides: SizeGuideSummary[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onManage?: () => void;
}> = ({ value, onChange, guides, loading, error, onRetry, onManage }) => {
  const chosen = value ? guides.find((guide) => Number(guide.id) === Number(value)) : undefined;
  const missing = Boolean(value) && !loading && !chosen;
  const options = [
    { value: '', label: loading ? 'Loading size guides…' : 'No size guide' },
    ...guides.map((guide) => ({
      value: String(guide.id),
      label: `${guide.name}${guide.status === 'inactive' ? ' (inactive)' : ''}`,
    })),
    ...(missing ? [{ value: String(value), label: `Size guide #${value} (not found)` }] : []),
  ];

  return (
    <div className="space-y-2">
      <Field label="Size guide" hint={error ? undefined : 'Size chart shown on the product page'}>
        <Select
          value={value ? String(value) : ''}
          onChange={(next) => onChange(next ? Number(next) : null)}
          options={options}
          disabled={loading && guides.length === 0}
        />
      </Field>
      {error && (
        <p className="ds-error-text">
          {error}{' '}
          {onRetry && (
            <button type="button" onClick={onRetry} className="underline font-semibold cursor-pointer">
              Try again
            </button>
          )}
        </p>
      )}
      {onManage && (
        <button
          type="button"
          onClick={onManage}
          className="inline-flex items-center gap-1 font-semibold cursor-pointer"
          style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--primary-ink, var(--primary))', minHeight: 28 }}
        >
          <Ruler className="w-3.5 h-3.5" />
          Manage size guides
          <ExternalLink className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

/** The chosen guide's header row (and first line) so the owner can check it is the right chart */
export const SizeGuidePreview: React.FC<{ guide?: SizeGuideSummary }> = ({ guide }) => {
  if (!guide) return null;
  const columns = Array.isArray(guide.columns) ? guide.columns : [];
  const firstRow = Array.isArray(guide.rows) && Array.isArray(guide.rows[0]) ? guide.rows[0] : [];
  return (
    <div
      className="p-3 space-y-2"
      style={{
        borderRadius: 'var(--ds-r-md)',
        border: '1px solid var(--a-border)',
        background: 'var(--a-surface-2)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
          <Ruler className="w-4 h-4" style={{ color: 'var(--ds-indigo)' }} />
          {guide.name}
        </span>
        <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }} className="ds-num">
          {(guide.rows || []).length} rows · used by {Number(guide.productCount || 0)} product(s)
        </span>
      </div>
      {guide.status === 'inactive' && (
        <Note tone="warning">This size guide is switched off, so the product page will not show it.</Note>
      )}
      {columns.length > 0 && (
        <div className="overflow-x-auto" style={{ borderRadius: 'var(--ds-r-sm)', border: '1px solid var(--a-border)' }}>
          <table style={{ minWidth: 'max-content' }}>
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <th key={index} style={{ padding: '6px 10px', background: 'var(--ds-indigo-soft)', color: 'var(--ds-indigo)' }}>
                    {column || '—'}
                  </th>
                ))}
              </tr>
            </thead>
            {firstRow.length > 0 && (
              <tbody>
                <tr>
                  {columns.map((_, index) => (
                    <td key={index} className="ds-num" style={{ padding: '6px 10px', fontSize: 'var(--a-fs-sm)' }}>
                      {firstRow[index] || '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Own delivery charge per zone                                                */
/* -------------------------------------------------------------------------- */

export const DeliveryChargesEditor: React.FC<{
  /** enabled zones; null while they are still loading */
  zones: ShippingZoneConfig[] | null;
  charges: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  disabled?: boolean;
  currency: string;
}> = ({ zones, charges, onChange, disabled, currency }) => {
  if (zones === null) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1].map((index) => (
          <span key={index} className="ds-skeleton block" style={{ height: 64, borderRadius: 'var(--ds-r-md)' }} />
        ))}
      </div>
    );
  }

  if (zones.length === 0) {
    return (
      <Note tone="warning">
        No delivery zones are switched on yet. Add them in System Configuration → Shipping, then set this product's own
        charge here.
      </Note>
    );
  }

  const known = new Set(zones.map((zone) => zone.id));
  const orphaned = Object.entries(charges || {}).filter(
    ([zone, value]) => !known.has(zone) && String(value ?? '').trim() !== ''
  );

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {zones.map((zone) => {
          const raw = charges?.[zone.id] ?? '';
          const own = String(raw).trim() !== '';
          const differs = own && Number(raw) !== Number(zone.charge);
          return (
            <label
              key={zone.id}
              className="block p-3"
              style={{
                borderRadius: 'var(--ds-r-md)',
                border: `1px solid ${own && !disabled ? 'var(--ds-teal)' : 'var(--a-border)'}`,
                background: own && !disabled ? 'var(--ds-teal-soft)' : 'var(--a-surface)',
                opacity: disabled ? 0.6 : 1,
              }}
            >
              <span className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                  {zone.name}
                </span>
                <span className="shrink-0 ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                  Normal {currency}
                  {Number(zone.charge || 0).toLocaleString('en-US')}
                </span>
              </span>
              <span className="relative block">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none font-semibold"
                  style={{ color: 'var(--a-text-muted)', fontSize: 'var(--a-fs-md)' }}
                >
                  {currency}
                </span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  inputMode="decimal"
                  disabled={disabled}
                  className="a-field ds-num"
                  style={{ paddingLeft: 30 }}
                  value={raw}
                  placeholder={String(Number(zone.charge || 0))}
                  onChange={(event) => onChange({ ...(charges || {}), [zone.id]: event.target.value })}
                  aria-label={`Own delivery charge for ${zone.name}`}
                />
              </span>
              <span className="block mt-1" style={{ fontSize: 'var(--ds-fs-xs)', color: 'var(--a-text-muted)' }}>
                {own ? (differs ? 'Own charge for this product' : 'Same as the zone charge') : 'Blank = the zone charge'}
                {zone.eta ? ` · ${zone.eta}` : ''}
              </span>
            </label>
          );
        })}
      </div>

      {orphaned.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2"
          style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
        >
          <span>Saved for zones that are switched off:</span>
          {orphaned.map(([zone, value]) => (
            <span
              key={zone}
              className="inline-flex items-center gap-1 ds-num"
              style={{
                padding: '2px 4px 2px 8px',
                borderRadius: 'var(--ds-r-full)',
                background: 'var(--a-surface-3)',
              }}
            >
              {zone}: {currency}
              {value}
              <button
                type="button"
                aria-label={`Remove the charge for ${zone}`}
                disabled={disabled}
                onClick={() => {
                  const next = { ...(charges || {}) };
                  delete next[zone];
                  onChange(next);
                }}
                className="inline-flex items-center justify-center cursor-pointer"
                style={{ width: 22, height: 22, borderRadius: 999 }}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
