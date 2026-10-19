import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sized } from '../../lib/img.ts';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  Loader2,
  Inbox,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Check,
  Minus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { keepTabInside } from '../../lib/focusTrap.ts';

/**
 * Shared dashboard building blocks.
 *
 * Every admin page composes these instead of hand-rolling its own markup, which
 * is what keeps the font family, type scale, radii, spacing and colour
 * behaviour identical from Orders to Settings. Sizes, colours and shadows all
 * come from the design tokens in src/index.css — nothing here hardcodes a hex
 * value except where a status colour is deliberately fixed — so changing the
 * brand colour in Theme & Styling re-skins the whole dashboard.
 *
 * Pages differ in LAYOUT, not in vocabulary: Orders is a table page, the
 * Dashboard is a KPI grid, Add Product is a tabbed form. They just share these
 * parts.
 */

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

/** primary colour at a given alpha — used for soft tints and focus rings */
export const tint = (alpha: number) =>
  `color-mix(in srgb, var(--primary) ${Math.round(alpha * 100)}%, transparent)`;

/** any colour at a given alpha, for the accent bubbles on KPI cards */
export const mix = (color: string, alpha: number) =>
  `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;

/** The accent palette pages pick from, so a colourful page still looks planned */
export const ACCENTS = {
  primary: 'var(--primary)',
  violet: 'var(--ds-violet)',
  teal: 'var(--ds-teal)',
  rose: 'var(--ds-rose)',
  amber: 'var(--ds-amber)',
  indigo: 'var(--ds-indigo)',
  info: 'var(--ds-info)',
  success: 'var(--ds-success)',
  danger: 'var(--ds-danger)',
} as const;

/* -------------------------------------------------------------------------- */
/* Page header                                                                 */
/* -------------------------------------------------------------------------- */

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /**
   * Accepted but no longer rendered. Breadcrumbs were removed from every page
   * on request — the sidebar already shows where you are, and the trail was
   * repeating the page title on the right-hand side of every screen.
   */
  breadcrumb?: string[];
  actions?: React.ReactNode;
  icon?: IconType;
  accent?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  icon: Icon,
  accent = 'var(--primary)',
}) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
    <div className="flex items-start gap-3 min-w-0">
      {Icon && (
        <span
          className="hidden sm:inline-flex items-center justify-center shrink-0"
          style={{
            width: 42,
            height: 42,
            borderRadius: 'var(--ds-r-lg)',
            background: mix(accent, 0.12),
            color: accent,
          }}
        >
          <Icon className="w-5 h-5" />
        </span>
      )}
      <div className="min-w-0">
        <h1 className="font-bold leading-tight" style={{ fontSize: 'var(--a-fs-title)' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>

    {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'soft';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: IconType;
  iconRight?: IconType;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  icon: Icon,
  iconRight: IconRight,
  loading,
  size = 'md',
  block,
  children,
  className = '',
  disabled,
  ...rest
}) => {
  const sizeClass = size === 'sm' ? 'ds-btn-sm' : size === 'lg' ? 'ds-btn-lg' : '';
  const variantClass = {
    primary: 'ds-btn-primary',
    secondary: 'ds-btn-secondary',
    ghost: 'ds-btn-ghost',
    danger: 'ds-btn-danger',
    success: 'ds-btn-primary',
    soft: 'ds-btn-soft',
  }[variant];

  const style: React.CSSProperties | undefined =
    variant === 'success'
      ? { background: 'var(--ds-success)', color: '#fff' }
      : undefined;

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      style={style}
      className={`ds-btn ${variantClass} ${sizeClass} ${block ? 'ds-btn-block' : ''} ${className}`}
    >
      {loading ? (
        <Loader2 className={`${iconSize} animate-spin`} />
      ) : Icon ? (
        <Icon className={iconSize} />
      ) : null}
      {children}
      {IconRight && !loading && <IconRight className={iconSize} />}
    </button>
  );
};

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconType;
  tone?: 'default' | 'primary' | 'danger' | 'warning' | 'success' | 'plain';
  label: string;
  size?: 'sm' | 'md';
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon: Icon,
  tone = 'default',
  label,
  size = 'md',
  className = '',
  ...rest
}) => {
  const tones: Record<string, React.CSSProperties> = {
    default: {
      color: 'var(--a-text-soft)',
      background: 'var(--a-surface)',
      border: '1px solid var(--a-border-strong)',
    },
    plain: { color: 'var(--a-text-soft)', background: 'transparent', border: '1px solid transparent' },
    primary: { color: 'var(--primary-ink, var(--primary))', background: tint(0.1), border: `1px solid ${tint(0.22)}` },
    danger: {
      color: 'var(--ds-danger-text)',
      background: 'var(--ds-danger-soft)',
      border: '1px solid color-mix(in srgb, var(--ds-danger) 22%, transparent)',
    },
    warning: {
      color: 'var(--ds-warning-text)',
      background: 'var(--ds-warning-soft)',
      border: '1px solid color-mix(in srgb, var(--ds-warning) 26%, transparent)',
    },
    success: {
      color: 'var(--ds-success-text)',
      background: 'var(--ds-success-soft)',
      border: '1px solid color-mix(in srgb, var(--ds-success) 24%, transparent)',
    },
  };
  const box = size === 'sm' ? 'var(--ds-h-sm)' : 'var(--ds-h-md)';
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      style={{ ...tones[tone], width: box, height: box }}
      className={`inline-flex items-center justify-center shrink-0 rounded-[var(--ds-r-md)] transition-all hover:brightness-[0.97] active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
    </button>
  );
};

/* -------------------------------------------------------------------------- */
/* Cards                                                                       */
/* -------------------------------------------------------------------------- */

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  /** a thin coloured rule along the top, used to group related cards */
  accent?: string;
}> = ({ children, className = '', padded = true, accent }) => (
  <div
    className={`a-card ${padded ? 'p-5' : ''} ${className}`}
    style={accent ? { borderTop: `3px solid ${accent}` } : undefined}
  >
    {children}
  </div>
);

export const CardHeader: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  icon?: IconType;
  accent?: string;
}> = ({ title, subtitle, actions, icon: Icon, accent = 'var(--primary)' }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
    {/* basis-60: on a phone, wide action buttons drop under the title instead of squeezing the text */}
    <div className="flex items-start gap-3 min-w-0 flex-1 basis-60">
      {Icon && (
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--ds-r-md)',
            background: mix(accent, 0.12),
            color: accent,
          }}
        >
          <Icon className="w-4 h-4" />
        </span>
      )}
      <div className="min-w-0">
        <h3 className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
          {title}
        </h3>
        {subtitle && (
          <p className="mt-0.5" style={{ fontSize: 'var(--a-fs-base)', color: 'var(--a-text-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0 max-w-full">{actions}</div>}
  </div>
);

/** A titled block inside a long form — used by the Add/Edit Product tabs */
export const FormSection: React.FC<{
  title: string;
  description?: string;
  icon?: IconType;
  accent?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, accent, children, className = '' }) => (
  <Card className={className}>
    <CardHeader title={title} subtitle={description} icon={icon} accent={accent} />
    {children}
  </Card>
);

/* -------------------------------------------------------------------------- */
/* Stat cards                                                                  */
/* -------------------------------------------------------------------------- */

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: IconType;
  /** hex or css colour for the icon bubble; defaults to the brand colour */
  color?: string;
  delta?: string;
  deltaDirection?: 'up' | 'down';
  deltaNote?: string;
  onClick?: () => void;
  loading?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  color,
  delta,
  deltaDirection = 'up',
  deltaNote,
  onClick,
  loading,
}) => {
  const accent = color || 'var(--primary)';

  if (loading) {
    return (
      <div className="a-card p-4 flex items-center gap-3.5">
        <span className="ds-skeleton shrink-0" style={{ width: 46, height: 46, borderRadius: 999 }} />
        <div className="flex-1 space-y-2">
          <span className="ds-skeleton block h-3 w-2/3" />
          <span className="ds-skeleton block h-5 w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`a-card p-4 flex items-center gap-3.5 ${onClick ? 'ds-card-hover cursor-pointer' : ''}`}
    >
      <span
        className="flex items-center justify-center shrink-0"
        style={{ width: 46, height: 46, borderRadius: 999, background: mix(accent, 0.12), color: accent }}
      >
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <div style={{ fontSize: 'var(--a-fs-base)', color: 'var(--a-text-muted)' }} className="truncate">
          {label}
        </div>
        <div
          className="font-bold leading-tight truncate ds-num"
          style={{ fontSize: 'var(--ds-fs-2xl)' }}
        >
          {value}
        </div>
        {delta && (
          <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: 'var(--a-fs-xs)' }}>
            <span
              className="font-bold"
              style={{
                color: deltaDirection === 'up' ? 'var(--ds-success-text)' : 'var(--ds-danger-text)',
              }}
            >
              {deltaDirection === 'up' ? '↑' : '↓'} {delta}
            </span>
            {deltaNote && <span style={{ color: 'var(--a-text-muted)' }}>{deltaNote}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Filter pills / segmented tabs                                               */
/* -------------------------------------------------------------------------- */

export interface FilterPill {
  id: string;
  label: string;
  count?: number;
  color?: string;
}

export const FilterPills: React.FC<{
  pills: FilterPill[];
  active: string;
  onChange: (id: string) => void;
}> = ({ pills, active, onChange }) => (
  <div className="flex items-center gap-2 overflow-x-auto ds-scroll-hide pb-1 -mx-1 px-1">
    {pills.map((pill) => {
      const isActive = pill.id === active;
      const accent = pill.color || 'var(--primary)';
      return (
        <button
          key={pill.id}
          onClick={() => onChange(pill.id)}
          className="rounded-[var(--ds-r-md)] font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2"
          style={{
            height: 'var(--ds-h-md)',
            padding: '0 14px',
            fontSize: 'var(--a-fs-md)',
            background: isActive ? accent : mix(accent, 0.08),
            color: isActive ? '#fff' : accent,
            border: `1px solid ${isActive ? accent : mix(accent, 0.18)}`,
          }}
        >
          {pill.label}
          {pill.count !== undefined && (
            <span
              className="font-bold ds-num rounded-full px-1.5"
              style={{
                fontSize: 'var(--a-fs-xs)',
                background: isActive ? 'rgba(255,255,255,0.22)' : mix(accent, 0.14),
              }}
            >
              {pill.count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

/** Underline tabs — used for the sections of a long form (Add/Edit Product) */
export const SegmentedTabs: React.FC<{
  tabs: Array<{ id: string; label: string; icon?: IconType; badge?: number }>;
  active: string;
  onChange: (id: string) => void;
  className?: string;
}> = ({ tabs, active, onChange, className = '' }) => (
  <div
    className={`flex items-center gap-1 overflow-x-auto ds-scroll-hide border-b ${className}`}
    style={{ borderColor: 'var(--a-border)' }}
    role="tablist"
  >
    {tabs.map((tab) => {
      const isActive = tab.id === active;
      const TabIcon = tab.icon;
      return (
        <button
          key={tab.id}
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(tab.id)}
          className="relative flex items-center gap-2 px-3.5 py-2.5 font-semibold whitespace-nowrap cursor-pointer transition-colors"
          style={{
            fontSize: 'var(--a-fs-md)',
            color: isActive ? 'var(--primary-ink, var(--primary))' : 'var(--a-text-soft)',
          }}
        >
          {TabIcon && <TabIcon className="w-4 h-4" />}
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span
              className="ds-num rounded-full px-1.5 font-bold"
              style={{ fontSize: 'var(--a-fs-2xs)', background: tint(0.14), color: 'var(--primary-ink, var(--primary))' }}
            >
              {tab.badge}
            </span>
          )}
          {isActive && (
            <span
              className="absolute left-2 right-2 -bottom-px rounded-t-full"
              style={{ height: 2, background: 'var(--primary)' }}
            />
          )}
        </button>
      );
    })}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Status badge                                                                */
/* -------------------------------------------------------------------------- */

export const STATUS_TONES: Record<string, { bg: string; fg: string; label?: string }> = {
  pending: { bg: 'var(--ds-info-soft)', fg: 'var(--ds-info-text)', label: 'Pending' },
  processing: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', label: 'Processing' },
  confirmed: { bg: 'var(--ds-indigo-soft)', fg: 'var(--ds-indigo)', label: 'Confirmed' },
  shipped: { bg: 'var(--ds-violet-soft)', fg: 'var(--ds-violet)', label: 'Shipped' },
  on_hold: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', label: 'On Hold' },
  delivered: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', label: 'Delivered' },
  completed: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', label: 'Completed' },
  cancelled: { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)', label: 'Cancelled' },
  refunded: { bg: 'var(--ds-violet-soft)', fg: 'var(--ds-violet)', label: 'Refunded' },
  paid: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', label: 'Paid' },
  unpaid: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', label: 'Unpaid' },
  active: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', label: 'Active' },
  inactive: { bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)', label: 'Inactive' },
  archived: { bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)', label: 'Archived' },
  blocked: { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)', label: 'Blocked' },
  draft: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', label: 'Draft' },
  published: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', label: 'Published' },
  recovered: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', label: 'Recovered' },
  in_transit: { bg: 'var(--ds-violet-soft)', fg: 'var(--ds-violet)', label: 'In transit' },
  out_of_stock: { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)', label: 'Out of stock' },
  low_stock: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', label: 'Low stock' },
  in_stock: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', label: 'In stock' },
};

const NEUTRAL_TONE = { bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)' };

export const Badge: React.FC<{
  status?: string;
  children?: React.ReactNode;
  tone?: { bg: string; fg: string };
  className?: string;
  dot?: boolean;
}> = ({ status, children, tone, className = '', dot }) => {
  const key = String(status || '').toLowerCase();
  const resolved = tone || STATUS_TONES[key] || NEUTRAL_TONE;
  return (
    <span
      className={`ds-badge ${className}`}
      style={{ background: resolved.bg, color: resolved.fg, fontSize: 'var(--a-fs-sm)' }}
    >
      {dot && (
        <span
          style={{ width: 6, height: 6, borderRadius: 999, background: resolved.fg, opacity: 0.85 }}
        />
      )}
      {children ?? STATUS_TONES[key]?.label ?? status}
    </span>
  );
};

/** Inline status changer used in the Orders/Products tables */
export const StatusSelect: React.FC<{
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}> = ({ value, options, onChange, disabled }) => {
  const tone = STATUS_TONES[String(value).toLowerCase()] || NEUTRAL_TONE;
  return (
    <div className="relative inline-flex">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-7 py-1.5 rounded-full font-semibold cursor-pointer outline-none disabled:opacity-60"
        style={{ background: tone.bg, color: tone.fg, fontSize: 'var(--a-fs-sm)', border: 'none' }}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            style={{ color: 'var(--ds-text)', background: '#fff' }}
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: tone.fg }}
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Toolbar: search + selects + checkbox                                        */
/* -------------------------------------------------------------------------- */

export const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}> = ({ value, onChange, placeholder = 'Search...', className = '', autoFocus }) => (
  <div className={`relative ${className}`}>
    <Search
      className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
      style={{ color: 'var(--a-text-muted)' }}
    />
    <input
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`a-field pl-9 ${value ? 'pr-9' : ''}`}
    />
    {value && (
      <button
        onClick={() => onChange('')}
        aria-label="Clear search"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
        style={{ color: 'var(--a-text-muted)' }}
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

export const Select: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  disabled?: boolean;
}> = ({ value, onChange, options, className = '', disabled }) => (
  <div className={`relative ${className}`}>
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="a-field appearance-none pr-8 cursor-pointer"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <ChevronDown
      className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
      style={{ color: 'var(--a-text-muted)' }}
    />
  </div>
);

/** A row of filters that collapses into a scrollable strip on a phone */
export const Toolbar: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`flex flex-col lg:flex-row lg:items-center gap-2.5 ${className}`}>{children}</div>
);

/**
 * Tri-state checkbox used for row selection and the "select all" header cell.
 * `indeterminate` shows a dash for "some of these rows are selected".
 */
export const Checkbox: React.FC<{
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}> = ({ checked, indeterminate, onChange, label, disabled, className = '' }) => {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label || 'Select'}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className={`inline-flex items-center justify-center shrink-0 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        background: on ? 'var(--primary)' : 'var(--a-surface)',
        border: `1.5px solid ${on ? 'var(--primary)' : 'var(--a-border-strong)'}`,
        color: 'var(--primary-foreground)',
      }}
    >
      {indeterminate ? (
        <Minus className="w-3 h-3" strokeWidth={3} />
      ) : checked ? (
        <Check className="w-3 h-3" strokeWidth={3.5} />
      ) : null}
    </button>
  );
};

/**
 * The bar that slides in once rows are selected. It floats over the bottom of
 * the page so the selection stays reachable no matter how far down the table
 * has been scrolled.
 */
export const BulkBar: React.FC<{
  count: number;
  onClear: () => void;
  children: React.ReactNode;
  noun?: string;
}> = ({ count, onClear, children, noun = 'selected' }) => {
  if (count === 0) return null;
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 ds-slide-up"
      style={{ bottom: 20, zIndex: 'var(--ds-z-toast)' as any, maxWidth: 'calc(100vw - 24px)' }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-[var(--ds-r-xl)] overflow-x-auto ds-scroll-hide"
        style={{
          background: 'var(--ds-gray-900)',
          boxShadow: 'var(--ds-shadow-xl)',
        }}
      >
        <span
          className="flex items-center gap-2 pl-1 pr-2.5 font-semibold whitespace-nowrap shrink-0"
          style={{ color: '#fff', fontSize: 'var(--a-fs-md)' }}
        >
          <span
            className="ds-num inline-flex items-center justify-center font-bold"
            style={{
              minWidth: 24,
              height: 24,
              padding: '0 6px',
              borderRadius: 999,
              background: 'var(--primary)',
            }}
          >
            {count}
          </span>
          {noun}
        </span>

        <span style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.16)' }} className="shrink-0" />

        <div className="flex items-center gap-1.5 shrink-0">{children}</div>

        <button
          onClick={onClear}
          className="ml-1 shrink-0 inline-flex items-center justify-center rounded-lg cursor-pointer transition-colors hover:bg-white/10"
          style={{ width: 30, height: 30, color: 'rgba(255,255,255,0.75)' }}
          aria-label="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

/** A dark-on-dark action for inside the BulkBar */
export const BulkAction: React.FC<{
  icon?: IconType;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}> = ({ icon: Icon, onClick, children, tone = 'default', disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center gap-1.5 px-3 font-semibold whitespace-nowrap rounded-[var(--ds-r-sm)] cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    style={{
      height: 32,
      fontSize: 'var(--a-fs-md)',
      color: tone === 'danger' ? '#ffb4b0' : 'rgba(255,255,255,0.92)',
      background: tone === 'danger' ? 'rgba(224,70,63,0.18)' : 'rgba(255,255,255,0.1)',
    }}
  >
    {Icon && <Icon className="w-3.5 h-3.5" />}
    {children}
  </button>
);

/* -------------------------------------------------------------------------- */
/* Table wrapper, sortable header, empty / loading / error states               */
/* -------------------------------------------------------------------------- */

export const TableWrap: React.FC<{
  children: React.ReactNode;
  className?: string;
  sticky?: boolean;
}> = ({ children, className = '', sticky }) => (
  <div className={`a-card overflow-hidden ${className}`}>
    <div className={`overflow-x-auto ${sticky ? 'max-h-[70vh] overflow-y-auto' : ''}`}>
      <div className={sticky ? 'a-table-sticky' : ''}>{children}</div>
    </div>
  </div>
);

/** A clickable column header that cycles asc → desc */
export const SortableTh: React.FC<{
  label: string;
  field: string;
  sort: { field: string; dir: 'asc' | 'desc' };
  onSort: (field: string) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
}> = ({ label, field, sort, onSort, align = 'left', className = '' }) => {
  const isActive = sort.field === field;
  return (
    <th className={className} style={{ textAlign: align }}>
      <button
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 cursor-pointer uppercase font-bold transition-colors hover:text-[var(--a-text)]"
        style={{
          fontSize: 'inherit',
          letterSpacing: 'inherit',
          color: isActive ? 'var(--primary-ink, var(--primary))' : 'inherit',
        }}
      >
        {label}
        {isActive ? (
          sort.dir === 'asc' ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )
        ) : (
          <ChevronDown className="w-3 h-3 opacity-25" />
        )}
      </button>
    </th>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description?: string;
  icon?: IconType;
  action?: React.ReactNode;
}> = ({ title, description, icon: Icon = Inbox, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-14 px-6">
    <span
      className="flex items-center justify-center mb-3"
      style={{
        width: 56,
        height: 56,
        borderRadius: 'var(--ds-r-xl)',
        background: tint(0.1),
        color: 'var(--primary-ink, var(--primary))',
      }}
    >
      <Icon className="w-6 h-6" />
    </span>
    <h4 className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
      {title}
    </h4>
    {description && (
      <p className="mt-1 max-w-sm" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
        {description}
      </p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/** Shown when a fetch failed, with a way to try again */
export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  onRetry?: () => void;
}> = ({ title = 'Could not load', message, onRetry }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-6">
    <span
      className="flex items-center justify-center mb-3"
      style={{
        width: 56,
        height: 56,
        borderRadius: 'var(--ds-r-xl)',
        background: 'var(--ds-danger-soft)',
        color: 'var(--ds-danger)',
      }}
    >
      <AlertTriangle className="w-6 h-6" />
    </span>
    <h4 className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
      {title}
    </h4>
    {message && (
      <p className="mt-1 max-w-sm" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
        {message}
      </p>
    )}
    {onRetry && (
      <Button icon={RefreshCw} onClick={onRetry} className="mt-4">
        Try Again
      </Button>
    )}
  </div>
);

export const LoadingRows: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 6 }) => (
  <>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <tr key={rowIndex}>
        {Array.from({ length: cols }).map((__, colIndex) => (
          <td key={colIndex}>
            <span className="ds-skeleton block h-3.5 rounded-full" />
          </td>
        ))}
      </tr>
    ))}
  </>
);

/**
 * A per-section placeholder. Each part of a page shows its own while it loads,
 * so a slow connection fills in progressively instead of blocking the screen.
 */
export const SectionLoader: React.FC<{
  lines?: number;
  className?: string;
  height?: number;
}> = ({ lines = 3, className = '', height }) => (
  <div className={`space-y-2.5 ${className}`}>
    {height ? (
      <span className="ds-skeleton block w-full" style={{ height }} />
    ) : (
      Array.from({ length: lines }).map((_, index) => (
        <span
          key={index}
          className="ds-skeleton block h-3.5"
          style={{ width: index === lines - 1 ? '60%' : '100%' }}
        />
      ))
    )}
  </div>
);

/** A grid of card skeletons — the products/categories grids use this */
export const SkeletonGrid: React.FC<{ count?: number; height?: number; className?: string }> = ({
  count = 8,
  height = 190,
  className = '',
}) => (
  <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 ${className}`}>
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="a-card p-3 space-y-2">
        <span className="ds-skeleton block w-full rounded-[var(--ds-r-md)]" style={{ height }} />
        <span className="ds-skeleton block h-3.5 w-4/5" />
        <span className="ds-skeleton block h-3.5 w-2/5" />
      </div>
    ))}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Pagination                                                                  */
/* -------------------------------------------------------------------------- */

export const Pagination: React.FC<{
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}> = ({ page, pageSize, total, onPageChange, onPageSizeChange }) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pages = useMemo(() => {
    const list: Array<number | '…'> = [];
    const push = (n: number | '…') => list.push(n);
    if (pageCount <= 7) {
      for (let i = 1; i <= pageCount; i += 1) push(i);
    } else {
      push(1);
      if (page > 3) push('…');
      for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i += 1) push(i);
      if (page < pageCount - 2) push('…');
      push(pageCount);
    }
    return list;
  }, [page, pageCount]);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t"
      style={{ borderColor: 'var(--a-border)' }}
    >
      <div
        className="flex items-center gap-2 whitespace-nowrap"
        style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}
      >
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
          disabled={!onPageSizeChange}
          className="a-field w-auto cursor-pointer"
          style={{ padding: '4px 8px', minHeight: 'auto' }}
        >
          {[10, 20, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="ds-num">
          {from}–{to} / {total}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <IconButton
          icon={ChevronLeft}
          label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        />
        {pages.map((entry, index) =>
          entry === '…' ? (
            <span key={`gap-${index}`} className="px-2" style={{ color: 'var(--a-text-muted)' }}>
              …
            </span>
          ) : (
            <button
              key={entry}
              onClick={() => onPageChange(entry)}
              className="rounded-[var(--ds-r-md)] font-semibold transition-all cursor-pointer ds-num"
              style={
                entry === page
                  ? {
                      width: 'var(--ds-h-md)',
                      height: 'var(--ds-h-md)',
                      background: 'var(--primary)',
                      color: 'var(--primary-foreground)',
                      fontSize: 'var(--a-fs-md)',
                    }
                  : {
                      width: 'var(--ds-h-md)',
                      height: 'var(--ds-h-md)',
                      background: 'var(--a-surface)',
                      color: 'var(--a-text-soft)',
                      border: '1px solid var(--a-border)',
                      fontSize: 'var(--a-fs-md)',
                    }
              }
            >
              {entry}
            </button>
          )
        )}
        <IconButton
          icon={ChevronRight}
          label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Drawer (right slide-over) and Modal                                         */
/* -------------------------------------------------------------------------- */

/** Locks page scrolling while an overlay is open */
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onEscape]);
}

export const Drawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, width = 'max-w-xl', footer, children }) => {
  useEscape(open, onClose);
  useScrollLock(open);
  if (!open) return null;

  return (
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 'var(--ds-z-modal)' as any }}>
      <div
        className="absolute inset-0 ds-fade-in"
        style={{ background: 'var(--ds-overlay)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${width} h-full flex flex-col ds-slide-right`}
        style={{ background: 'var(--ds-surface)', boxShadow: 'var(--ds-shadow-xl)' }}
      >
        <div
          className="flex items-start justify-between gap-3 px-5 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--a-border)' }}
        >
          <div className="min-w-0">
            <h3 className="font-bold" style={{ fontSize: 'var(--ds-fs-xl)' }}>
              {title}
            </h3>
            {subtitle && (
              <p style={{ fontSize: 'var(--a-fs-base)', color: 'var(--a-text-muted)' }}>{subtitle}</p>
            )}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} tone="plain" />
        </div>

        <div className="flex-1 overflow-y-auto p-5">{children}</div>

        {footer && (
          <div
            className="px-5 py-4 border-t shrink-0 flex items-center justify-end gap-2"
            style={{ borderColor: 'var(--a-border)', background: 'var(--a-surface-2)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, width = 'max-w-lg', footer, children }) => {
  useEscape(open, onClose);
  useScrollLock(open);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 'var(--ds-z-modal)' as any }}
    >
      <div
        className="absolute inset-0 ds-fade-in"
        style={{ background: 'var(--ds-overlay)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${width} flex flex-col max-h-[90vh] ds-scale-in`}
        style={{
          background: 'var(--ds-surface)',
          borderRadius: 'var(--ds-r-xl)',
          boxShadow: 'var(--ds-shadow-xl)',
        }}
      >
        <div
          className="flex items-start justify-between gap-3 px-5 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--a-border)' }}
        >
          <div className="min-w-0">
            <h3 className="font-bold" style={{ fontSize: 'var(--ds-fs-lg)' }}>
              {title}
            </h3>
            {subtitle && (
              <p style={{ fontSize: 'var(--a-fs-base)', color: 'var(--a-text-muted)' }}>{subtitle}</p>
            )}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} tone="plain" />
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div
            className="px-5 py-4 border-t shrink-0 flex items-center justify-end gap-2"
            style={{ borderColor: 'var(--a-border)', background: 'var(--a-surface-2)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * v3.11 — the "are you sure?" window, redesigned: a centred card with a large
 * icon, the question in plain words, and two equal buttons. Every delete in
 * the dashboard goes through it. Escape or a click outside cancels; the
 * Cancel button has the focus, so an accidental Enter never deletes.
 */
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** Icon in the bubble (defaults: a bin for danger, a note for the rest) */
  icon?: IconType;
  /** Extra content under the message, e.g. a checkbox */
  children?: React.ReactNode;
  /** Keeps the confirm button off until a choice inside `children` is made */
  confirmDisabled?: boolean;
}> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
  busy,
  icon,
  children,
  confirmDisabled,
}) => {
  useEscape(open && !busy, onCancel);
  useScrollLock(open);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Focus goes to Cancel, Tab stays inside, and returns to the opener after
    const opener = document.activeElement as HTMLElement | null;
    const focus = window.setTimeout(() => cancelRef.current?.focus(), 30);
    const onKey = (event: KeyboardEvent) => keepTabInside(event, cardRef.current);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focus);
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [open]);
  if (!open) return null;

  const deleting = tone === 'danger' && /delete|remove|clear|permanent/i.test(`${title} ${confirmLabel}`);
  const Icon: IconType = icon || (tone === 'danger' ? (deleting ? Trash2 : AlertTriangle) : tone === 'warning' ? AlertTriangle : Info);
  const palette =
    tone === 'danger'
      ? { color: 'var(--ds-danger)', soft: 'var(--ds-danger-soft)', ring: 'color-mix(in srgb, var(--ds-danger) 14%, transparent)' }
      : tone === 'warning'
      ? { color: 'var(--ds-warning)', soft: 'var(--ds-warning-soft)', ring: 'color-mix(in srgb, var(--ds-warning) 16%, transparent)' }
      : { color: 'var(--primary-ink, var(--primary))', soft: tint(0.12), ring: tint(0.1) };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 'var(--ds-z-modal)' as any }}>
      <div
        className="absolute inset-0 ds-fade-in"
        style={{ background: 'var(--ds-overlay)', backdropFilter: 'blur(3px)' }}
        onClick={busy ? undefined : onCancel}
      />
      <div
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="confirm-dialog relative w-full max-w-[420px] text-center"
        style={{
          background: 'var(--ds-surface)',
          borderRadius: 'var(--ds-r-2xl, 20px)',
          boxShadow: '0 24px 60px -16px rgba(19, 25, 34, 0.35), 0 0 0 1px var(--a-border, var(--ds-border))',
          padding: 'var(--ds-s-6) var(--ds-s-6) var(--ds-s-5)',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Close"
          className="absolute top-3 right-3 inline-flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40"
          style={{ width: 32, height: 32, borderRadius: 999, color: 'var(--a-text-muted, var(--ds-text-muted))' }}
        >
          <X className="w-4 h-4" />
        </button>

        <span
          className="confirm-dialog-icon mx-auto flex items-center justify-center"
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            background: palette.soft,
            color: palette.color,
            boxShadow: `0 0 0 8px ${palette.ring}`,
          }}
        >
          <Icon className="w-7 h-7" />
        </span>

        <h3 id="confirm-dialog-title" className="font-bold mt-5" style={{ fontSize: 'var(--ds-fs-xl)', color: 'var(--a-text, var(--ds-text))', lineHeight: 1.3 }}>
          {title}
        </h3>
        <div
          id="confirm-dialog-message"
          className="mt-2 mx-auto max-w-[340px]"
          style={{ fontSize: 'var(--a-fs-md, var(--ds-fs-md))', color: 'var(--a-text-soft, var(--ds-text-soft))', lineHeight: 1.6 }}
        >
          {message}
        </div>
        {children && <div className="mt-4 text-left">{children}</div>}

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="confirm-dialog-btn inline-flex items-center justify-center font-semibold cursor-pointer transition-colors disabled:opacity-50"
            style={{
              height: 44,
              borderRadius: 'var(--ds-r-lg)',
              border: '1px solid var(--a-border-strong, var(--ds-border-strong))',
              background: 'var(--ds-surface)',
              color: 'var(--a-text, var(--ds-text))',
              fontSize: 'var(--a-fs-md, var(--ds-fs-md))',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className="confirm-dialog-btn confirm-dialog-go inline-flex items-center justify-center gap-2 font-semibold cursor-pointer transition-[filter,transform] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              height: 44,
              borderRadius: 'var(--ds-r-lg)',
              border: 0,
              background: palette.color,
              color: tone === 'warning' ? 'var(--ds-gray-900)' : '#fff',
              fontSize: 'var(--a-fs-md, var(--ds-fs-md))',
              boxShadow: `0 8px 18px -8px ${palette.color}`,
            }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : deleting ? <Trash2 className="w-4 h-4" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Toast                                                                       */
/* -------------------------------------------------------------------------- */

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  text: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counter = useRef(0);

  const push = (text: string, kind: ToastKind = 'success') => {
    counter.current += 1;
    const id = counter.current;
    setToasts((list) => [...list, { id, kind, text }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4000);
  };

  const node = (
    <div
      className="fixed bottom-5 right-5 space-y-2 pointer-events-none"
      style={{ zIndex: 'var(--ds-z-toast)' as any }}
    >
      {toasts.map((toast) => {
        const tones = {
          success: {
            bg: 'var(--ds-success-soft)',
            fg: 'var(--ds-success-text)',
            border: 'var(--ds-success)',
            Icon: CheckCircle2,
          },
          error: {
            bg: 'var(--ds-danger-soft)',
            fg: 'var(--ds-danger-text)',
            border: 'var(--ds-danger)',
            Icon: AlertCircle,
          },
          warning: {
            bg: 'var(--ds-warning-soft)',
            fg: 'var(--ds-warning-text)',
            border: 'var(--ds-warning)',
            Icon: AlertTriangle,
          },
          info: {
            bg: 'var(--ds-info-soft)',
            fg: 'var(--ds-info-text)',
            border: 'var(--ds-info)',
            Icon: Info,
          },
        }[toast.kind];
        const ToneIcon = tones.Icon;
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-2.5 px-4 py-3 max-w-sm ds-slide-up"
            style={{
              background: tones.bg,
              color: tones.fg,
              border: `1px solid ${mix(tones.border, 0.3)}`,
              borderRadius: 'var(--ds-r-lg)',
              boxShadow: 'var(--ds-shadow-lg)',
            }}
          >
            <ToneIcon className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
              {toast.text}
            </span>
          </div>
        );
      })}
    </div>
  );

  return { push, node };
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

export const Toggle: React.FC<{
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, description, disabled }) => (
  <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || 'Toggle'}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className="relative shrink-0 mt-0.5 cursor-pointer disabled:cursor-not-allowed"
      style={{
        width: 40,
        height: 24,
        borderRadius: 999,
        background: checked ? 'var(--primary)' : 'var(--ds-gray-300)',
        transition: `background-color var(--ds-dur) var(--ds-ease)`,
      }}
    >
      <span
        className="absolute bg-white"
        style={{
          top: 2,
          left: 2,
          width: 20,
          height: 20,
          borderRadius: 999,
          boxShadow: 'var(--ds-shadow-sm)',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          transition: `transform var(--ds-dur) var(--ds-ease)`,
        }}
      />
    </button>
    {(label || description) && (
      <span className="min-w-0">
        {label && (
          <span className="block font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
            {label}
          </span>
        )}
        {description && (
          <span className="block" style={{ fontSize: 'var(--a-fs-base)', color: 'var(--a-text-muted)' }}>
            {description}
          </span>
        )}
      </span>
    )}
  </label>
);

export const Field: React.FC<{
  label: React.ReactNode;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, required, hint, error, children, className = '' }) => (
  <div className={className}>
    <label className="a-label">
      {label} {required && <span style={{ color: 'var(--ds-danger)' }}>*</span>}
    </label>
    {children}
    {error ? (
      <p className="ds-error-text">{error}</p>
    ) : hint ? (
      <p className="mt-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
        {hint}
      </p>
    ) : null}
  </div>
);

/** Small tab strip used inside settings pages */
export const TabStrip: React.FC<{
  tabs: Array<{ id: string; label: string; icon?: IconType }>;
  active: string;
  onChange: (id: string) => void;
}> = ({ tabs, active, onChange }) => {
  // On a phone the strip scrolls sideways: keep the chosen tab in view
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const strip = stripRef.current;
    const button = strip?.querySelector<HTMLElement>('[data-active="true"]');
    if (!strip || !button || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft = button.offsetLeft - (strip.clientWidth - button.offsetWidth) / 2;
  }, [active]);
  return (
  <div ref={stripRef} className="a-card p-1.5 flex items-center gap-1 overflow-x-auto ds-scroll-hide">
    {tabs.map((tab) => {
      const isActive = tab.id === active;
      const TabIcon = tab.icon;
      return (
        <button
          key={tab.id}
          data-active={isActive}
          onClick={() => onChange(tab.id)}
          className="rounded-[var(--ds-r-md)] font-semibold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer"
          style={{
            height: 'var(--ds-h-md)',
            padding: '0 14px',
            fontSize: 'var(--a-fs-md)',
            background: isActive ? 'var(--primary)' : 'transparent',
            color: isActive ? '#fff' : 'var(--a-text-soft)',
          }}
        >
          {TabIcon && <TabIcon className="w-4 h-4" />}
          {tab.label}
        </button>
      );
    })}
  </div>
);
};

/** Thumbnail with a graceful fallback — used everywhere a product image shows */
export const Thumb: React.FC<{ src?: string | null; alt: string; size?: number; className?: string }> = ({
  src,
  alt,
  size = 40,
  className = '',
}) => (
  <span
    className={`inline-flex items-center justify-center overflow-hidden shrink-0 ${className}`}
    style={{
      width: size,
      height: size,
      borderRadius: 'var(--ds-r-md)',
      background: 'var(--ds-surface-3)',
      border: '1px solid var(--a-border)',
    }}
  >
    {src ? (
      <img
        src={sized(src, size * 2)}
        alt={alt}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={(event) => {
          const img = event.currentTarget;
          img.onerror = null;
          img.style.display = 'none';
        }}
      />
    ) : (
      <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
        {alt.slice(0, 2).toUpperCase()}
      </span>
    )}
  </span>
);

/** Money, rendered with the store currency and column-aligned figures */
export const Money: React.FC<{
  value: any;
  currency?: string;
  className?: string;
  bold?: boolean;
}> = ({ value, currency = '৳', className = '', bold }) => (
  <span className={`ds-num ${bold ? 'font-bold' : ''} ${className}`}>
    {currency}
    {Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
  </span>
);

/** A labelled key/value line, used by detail panels */
export const DetailRow: React.FC<{
  label: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, children, className = '' }) => (
  <div className={`flex items-start justify-between gap-3 py-2 ${className}`}>
    <span className="shrink-0" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
      {label}
    </span>
    <span className="text-right font-semibold min-w-0" style={{ fontSize: 'var(--a-fs-md)' }}>
      {children}
    </span>
  </div>
);

/** Debounces a fast-changing value — search boxes use this to avoid a fetch per keystroke */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Row-selection state shared by every table that offers bulk actions */
export function useSelection<T extends { id: number }>(rows: T[]) {
  const [selected, setSelected] = useState<number[]>([]);

  // Rows that scrolled out of the current filter drop out of the selection, so
  // a bulk action can never touch something the operator can no longer see.
  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  useEffect(() => {
    setSelected((list) => list.filter((id) => visibleIds.includes(id)));
  }, [visibleIds.join(',')]);

  const allSelected = rows.length > 0 && selected.length === rows.length;
  const someSelected = selected.length > 0 && !allSelected;

  return {
    selected,
    count: selected.length,
    isSelected: (id: number) => selected.includes(id),
    toggle: (id: number) =>
      setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])),
    toggleAll: () => setSelected(allSelected ? [] : visibleIds),
    clear: () => setSelected([]),
    allSelected,
    someSelected,
  };
}
