import React, { useCallback, useEffect, useState } from 'react';
import {
  ShoppingCart,
  Clock3,
  Hourglass,
  BadgeCheck,
  PauseCircle,
  Truck,
  PackageCheck,
  CheckCircle2,
  XCircle,
  Undo2,
  RotateCcw,
  PackageX,
  Megaphone,
  Store,
  CreditCard,
  Smartphone,
  Banknote,
  Landmark,
  Wallet,
  RefreshCw,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { Money, Thumb, mix } from './ui.tsx';
import { GATEWAY_LOOK, isOnlineGateway } from '../../lib/onlinePayment.ts';

/**
 * Building blocks for the Orders page: status colours, payment and source
 * badges, the status board, item thumbnails and the online-payment panel of
 * the order detail.
 */

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

/* -------------------------------------------------------------------------- */
/* Order status                                                                */
/* -------------------------------------------------------------------------- */

export interface StatusMeta {
  label: string;
  /** strong colour: strips, icon chips, borders */
  color: string;
  /** readable text colour on a tint of `color` */
  text: string;
  icon: IconType;
}

export const ORDER_STATUS_META: Record<string, StatusMeta> = {
  all: { label: 'All Orders', color: 'var(--ds-indigo)', text: 'var(--ds-indigo)', icon: ShoppingCart },
  pending: { label: 'Pending', color: 'var(--ds-info)', text: 'var(--ds-info-text)', icon: Clock3 },
  processing: { label: 'Processing', color: 'var(--ds-warning)', text: 'var(--ds-warning-text)', icon: Hourglass },
  confirmed: { label: 'Confirmed', color: 'var(--ds-indigo)', text: 'var(--ds-indigo)', icon: BadgeCheck },
  on_hold: { label: 'On Hold', color: 'var(--ds-amber)', text: 'var(--ds-warning-text)', icon: PauseCircle },
  shipped: { label: 'Shipped', color: 'var(--ds-violet)', text: 'var(--ds-violet)', icon: Truck },
  delivered: { label: 'Delivered', color: 'var(--ds-success)', text: 'var(--ds-success-text)', icon: PackageCheck },
  completed: { label: 'Completed', color: 'var(--ds-teal)', text: 'var(--ds-teal)', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'var(--ds-danger)', text: 'var(--ds-danger-text)', icon: XCircle },
  refunded: { label: 'Refunded', color: 'var(--ds-rose)', text: 'var(--ds-rose)', icon: Undo2 },
  partially_returned: { label: 'Partly Returned', color: 'var(--ds-rose)', text: 'var(--ds-rose)', icon: RotateCcw },
  returned: { label: 'Returned', color: 'var(--ds-gray-500)', text: 'var(--ds-gray-700)', icon: PackageX },
};

export const statusMeta = (status?: string | null): StatusMeta =>
  ORDER_STATUS_META[String(status || '')] || {
    label: String(status || '—').replace(/_/g, ' '),
    color: 'var(--ds-gray-400)',
    text: 'var(--ds-neutral-text)',
    icon: ShoppingCart,
  };

/** The order the status tiles appear in */
export const STATUS_BOARD = [
  'all',
  'pending',
  'processing',
  'confirmed',
  'on_hold',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
  'partially_returned',
  'returned',
];

/**
 * Colourful status summary with counts. A strip that scrolls sideways on a
 * phone (inside itself — the page never scrolls sideways) and a grid from
 * tablet width up. Tapping a tile filters the list by that status.
 */
export const StatusBoard: React.FC<{
  counts: Record<string, number>;
  active: string;
  onChange: (status: string) => void;
  loading?: boolean;
}> = ({ counts, active, onChange, loading }) => (
  <div
    className="flex gap-2 overflow-x-auto ds-scroll-hide pb-1 -mx-1 px-1 md:mx-0 md:px-0 md:pb-0 md:grid md:grid-cols-4 lg:grid-cols-6 md:overflow-visible"
    role="tablist"
    aria-label="Order status"
  >
    {STATUS_BOARD.map((id) => {
      const meta = ORDER_STATUS_META[id];
      const Icon = meta.icon;
      const isActive = active === id;
      const count = Number(counts[id] || 0);
      const quiet = !isActive && count === 0 && id !== 'all';
      return (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(id)}
          className="shrink-0 w-[128px] md:w-auto min-w-0 text-left cursor-pointer transition-all flex items-center gap-2.5"
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--ds-r-lg)',
            background: isActive ? mix(meta.color, 0.13) : 'var(--a-surface)',
            border: `1px solid ${isActive ? meta.color : 'var(--a-border)'}`,
            boxShadow: isActive ? `0 0 0 3px ${mix(meta.color, 0.14)}` : 'var(--ds-shadow-xs)',
            opacity: quiet ? 0.72 : 1,
          }}
        >
          <span
            className="inline-flex items-center justify-center shrink-0"
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--ds-r-md)',
              background: isActive ? meta.color : mix(meta.color, 0.13),
              color: isActive ? '#fff' : meta.color,
            }}
          >
            <Icon className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            {loading ? (
              <span className="ds-skeleton block h-4 w-8 mb-1" />
            ) : (
              <span
                className="block font-bold ds-num leading-tight"
                style={{ fontSize: 'var(--ds-fs-lg)', color: isActive ? meta.text : 'var(--a-text)' }}
              >
                {count}
              </span>
            )}
            <span
              className="block truncate font-semibold"
              style={{ fontSize: 'var(--ds-fs-xs)', color: isActive ? meta.text : 'var(--a-text-muted)' }}
            >
              {meta.label}
            </span>
          </span>
        </button>
      );
    })}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Payment                                                                     */
/* -------------------------------------------------------------------------- */

const PAYMENT_LOOK: Record<string, { label: string; short: string; color: string; soft: string; icon: IconType }> = {
  cod: { label: 'Cash on Delivery', short: 'COD', color: 'var(--ds-teal)', soft: 'var(--ds-teal-soft)', icon: Banknote },
  cash: { label: 'Cash', short: 'Cash', color: 'var(--ds-teal)', soft: 'var(--ds-teal-soft)', icon: Banknote },
  card: { label: 'Card', short: 'Card', color: 'var(--ds-indigo)', soft: 'var(--ds-indigo-soft)', icon: CreditCard },
  bank: { label: 'Bank Transfer', short: 'Bank', color: 'var(--ds-indigo)', soft: 'var(--ds-indigo-soft)', icon: Landmark },
  rocket: { label: 'Rocket', short: 'Rocket', color: '#8c3494', soft: '#f5e8f7', icon: Smartphone },
  upay: { label: 'Upay', short: 'Upay', color: '#0d6e9c', soft: '#e3f1f8', icon: Smartphone },
  manual: { label: 'Manual', short: 'Manual', color: 'var(--ds-gray-600)', soft: 'var(--ds-neutral-soft)', icon: Wallet },
  bkash: { label: 'bKash', short: 'bKash', color: GATEWAY_LOOK.bkash.color, soft: GATEWAY_LOOK.bkash.soft, icon: Smartphone },
  nagad: { label: 'Nagad', short: 'Nagad', color: GATEWAY_LOOK.nagad.color, soft: GATEWAY_LOOK.nagad.soft, icon: Smartphone },
  sslcommerz: {
    label: 'SSLCommerz',
    short: 'SSLCommerz',
    color: GATEWAY_LOOK.sslcommerz.color,
    soft: GATEWAY_LOOK.sslcommerz.soft,
    icon: CreditCard,
  },
};

/**
 * Names the shop gave its manual "send money" options (ids like gw-596726),
 * registered by the orders page from settings so badges, exports and the
 * edit form show "bKash Personal" instead of the raw id.
 */
const MANUAL_NAMES = new Map<string, string>();
export const registerPaymentNames = (methods?: Array<{ id?: string; name?: string }> | null) => {
  (methods || []).forEach((method) => {
    if (method?.id && method?.name) MANUAL_NAMES.set(String(method.id).toLowerCase(), String(method.name));
  });
};

export const paymentLabel = (method?: string | null) => {
  const key = String(method || '').toLowerCase();
  if (key === 'cod') return MANUAL_NAMES.get(key) || PAYMENT_LOOK[key]?.label || 'Cash on Delivery';
  return PAYMENT_LOOK[key]?.label || MANUAL_NAMES.get(key) || (/^gw-\d+$/.test(key) ? 'Manual payment' : method ? String(method) : '—');
};

/** Payment method as a badge — bKash, Nagad and SSLCommerz in their own brand colours */
export const PaymentMethodBadge: React.FC<{ method?: string | null; full?: boolean }> = ({ method, full }) => {
  const key = String(method || '').toLowerCase();
  const look = PAYMENT_LOOK[key];
  if (!method) return <span style={{ color: 'var(--a-text-faint)' }}>—</span>;
  const color = look?.color || 'var(--ds-gray-600)';
  const soft = look?.soft || 'var(--ds-neutral-soft)';
  const Icon = look?.icon || Wallet;
  const online = isOnlineGateway(key);
  return (
    <span
      className="inline-flex items-center gap-1.5 font-bold whitespace-nowrap shrink-0"
      title={online ? `${look?.label} · paid online` : paymentLabel(method)}
      style={{
        height: 24,
        padding: '0 8px 0 4px',
        borderRadius: 'var(--ds-r-full)',
        background: soft,
        color,
        border: `1px solid ${mix(color, 0.28)}`,
        fontSize: 'var(--a-fs-sm)',
      }}
    >
      <span
        className="inline-flex items-center justify-center"
        style={{ width: 17, height: 17, borderRadius: 999, background: color, color: '#fff' }}
      >
        <Icon className="w-2.5 h-2.5" />
      </span>
      {look ? (full ? look.label : look.short) : paymentLabel(method)}
    </span>
  );
};

const PAY_STATUS: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  paid: { label: 'Paid', bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', dot: 'var(--ds-success)' },
  pending: { label: 'Pending', bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', dot: 'var(--ds-warning)' },
  initiated: { label: 'Initiated', bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', dot: 'var(--ds-warning)' },
  failed: { label: 'Failed', bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)', dot: 'var(--ds-danger)' },
  unpaid: { label: 'Unpaid', bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)', dot: 'var(--ds-gray-400)' },
  partial: { label: 'Advance paid', bg: 'var(--ds-info-soft)', fg: 'var(--ds-info-text)', dot: 'var(--ds-info)' },
  cancelled: { label: 'Cancelled', bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)', dot: 'var(--ds-gray-400)' },
  refunded: { label: 'Refunded', bg: 'var(--ds-violet-soft)', fg: 'var(--ds-violet)', dot: 'var(--ds-violet)' },
};

export const paymentStatusLabel = (value?: string | null) =>
  PAY_STATUS[String(value || '')]?.label || (value ? String(value) : '—');

/** Payment status pill: pending amber, paid green, failed red, unpaid grey */
export const PaymentStatusPill: React.FC<{ status?: string | null }> = ({ status }) => {
  const key = String(status || 'unpaid');
  const tone = PAY_STATUS[key] || PAY_STATUS.unpaid;
  return (
    <span
      className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap shrink-0"
      style={{
        height: 24,
        padding: '0 9px',
        borderRadius: 'var(--ds-r-full)',
        background: tone.bg,
        color: tone.fg,
        fontSize: 'var(--a-fs-sm)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: tone.dot }} />
      {PAY_STATUS[key]?.label || key.replace(/_/g, ' ')}
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* Source badges                                                               */
/* -------------------------------------------------------------------------- */

const pillStyle = (color: string, soft: string): React.CSSProperties => ({
  height: 22,
  padding: '0 8px',
  borderRadius: 'var(--ds-r-full)',
  background: soft,
  color,
  border: `1px solid ${mix(color, 0.22)}`,
  fontSize: 'var(--ds-fs-xs)',
});

/** "Landing: Eid Offer" in violet */
export const LandingBadge: React.FC<{ name?: string | null; id?: number | null; maxWidth?: number }> = ({
  name,
  id,
  maxWidth = 190,
}) => (
  <span
    className="inline-flex items-center gap-1 font-bold min-w-0"
    title={`Came from the landing page ${name || `#${id}`}`}
    style={{ ...pillStyle('var(--ds-violet)', 'var(--ds-violet-soft)'), maxWidth }}
  >
    <Megaphone className="w-3 h-3 shrink-0" />
    <span className="truncate">Landing: {name || `#${id}`}</span>
  </span>
);

export const PosBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 font-bold shrink-0" style={pillStyle('var(--ds-gray-600)', 'var(--ds-neutral-soft)')}>
    <Store className="w-3 h-3" />
    POS
  </span>
);

export const WholesaleBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 font-bold shrink-0" style={pillStyle('var(--ds-indigo)', 'var(--ds-indigo-soft)')}>
    WHOLESALE
  </span>
);

/** Every source badge an order earns, or null */
export const OrderSourceBadges: React.FC<{ order: any; className?: string }> = ({ order, className = '' }) => {
  const landing = Boolean(order?.landingPageId || order?.landingPageName);
  const manual = Boolean(order?.createdBy) && order?.source !== 'pos';
  if (!landing && order?.source !== 'pos' && !order?.isWholesale && !manual) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 min-w-0 ${className}`}>
      {manual && (
        <span
          className="inline-flex items-center gap-1 font-bold shrink-0"
          title={`Added from the dashboard by ${order.createdBy}`}
          style={pillStyle('var(--ds-teal)', 'var(--ds-teal-soft, color-mix(in srgb, var(--ds-teal) 12%, transparent))')}
        >
          MANUAL
        </span>
      )}
      {landing && <LandingBadge name={order.landingPageName} id={order.landingPageId} />}
      {order.source === 'pos' && <PosBadge />}
      {order.isWholesale && <WholesaleBadge />}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Items                                                                       */
/* -------------------------------------------------------------------------- */

/** Up to three overlapping product thumbnails with the item count */
export const ItemThumbs: React.FC<{ thumbs?: Array<{ image?: string | null; name?: string }>; count?: number; size?: number }> = ({
  thumbs,
  count,
  size = 32,
}) => {
  const list = Array.isArray(thumbs) ? thumbs.slice(0, 3) : [];
  return (
    <span className="inline-flex items-center gap-2 shrink-0">
      {list.length > 0 && (
        <span className="inline-flex items-center">
          {list.map((thumb, index) => (
            <span
              key={index}
              className="inline-flex rounded-[var(--ds-r-md)]"
              style={{
                marginLeft: index === 0 ? 0 : -10,
                boxShadow: '0 0 0 2px var(--a-surface)',
                zIndex: 3 - index,
                position: 'relative',
              }}
              title={thumb.name}
            >
              <Thumb src={thumb.image} alt={thumb.name || 'Item'} size={size} />
            </span>
          ))}
        </span>
      )}
      <span className="whitespace-nowrap" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
        <span className="ds-num font-bold" style={{ color: 'var(--a-text)' }}>
          {Number(count || 0)}
        </span>{' '}
        item{Number(count || 0) === 1 ? '' : 's'}
      </span>
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* Online payment panel                                                        */
/* -------------------------------------------------------------------------- */

interface PaymentTransaction {
  id: number;
  gateway: string;
  amount: string | number;
  status: 'initiated' | 'paid' | 'failed' | 'cancelled' | string;
  reference?: string | null;
  gatewayRef?: string | null;
  gatewayTxnId?: string | null;
  message?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const stamp = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/**
 * Every attempt the customer made to pay this order online, newest first. An
 * attempt that is not paid can be re-checked with the gateway — for when the
 * customer paid but closed the tab before coming back to the shop.
 */
export const OnlinePaymentPanel: React.FC<{
  orderId: number;
  gateway: string;
  currency: string;
  notify: (text: string, kind?: 'success' | 'error' | 'info' | 'warning') => void;
  /** Called after a re-check so the order (payment status) can be reloaded */
  onVerified: () => void;
}> = ({ orderId, gateway, currency, notify, onVerified }) => {
  const [list, setList] = useState<PaymentTransaction[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const look = isOnlineGateway(gateway) ? GATEWAY_LOOK[gateway] : GATEWAY_LOOK.sslcommerz;

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/admin/payment-transactions?orderId=${orderId}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) throw new Error(data?.error || 'Could not load the payment attempts.');
      setList(data);
    } catch (err: any) {
      setError(err?.message || 'Could not load the payment attempts.');
      setList([]);
    }
  }, [orderId]);

  useEffect(() => {
    setList(null);
    load();
  }, [load]);

  const verify = async (tx: PaymentTransaction) => {
    setBusyId(tx.id);
    try {
      const res = await fetch(`/api/admin/payment-transactions/${tx.id}/verify`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) throw new Error(data?.error || 'The gateway did not answer.');
      const status = String(data?.status || '');
      if (status === 'paid') notify('The gateway confirmed the payment — the order is marked paid.', 'success');
      else
        notify(
          `Checked with the gateway: ${paymentStatusLabel(status) || 'no change'}${data?.message ? ` — ${data.message}` : ''}.`,
          status === 'failed' ? 'warning' : 'info'
        );
      await load();
      onVerified();
    } catch (err: any) {
      notify(err?.message || 'Could not reach the gateway.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="a-card overflow-hidden" style={{ borderTop: `3px solid ${look.color}` }}>
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid var(--a-border)', background: look.soft }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="inline-flex items-center justify-center shrink-0"
            style={{ width: 32, height: 32, borderRadius: 'var(--ds-r-md)', background: look.color, color: '#fff' }}
          >
            <ShieldCheck className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="font-bold" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text)' }}>
              Online payment
            </div>
            <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
              {list === null ? 'Loading attempts…' : `${list.length} attempt${list.length === 1 ? '' : 's'} with the gateway`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PaymentMethodBadge method={gateway} />
          <button
            type="button"
            onClick={() => {
              setList(null);
              load();
            }}
            aria-label="Reload payment attempts"
            title="Reload"
            className="inline-flex items-center justify-center cursor-pointer"
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--ds-r-md)',
              background: 'var(--a-surface)',
              border: '1px solid var(--a-border-strong)',
              color: 'var(--a-text-soft)',
            }}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {list === null ? (
        <div className="p-4 space-y-2.5">
          <span className="ds-skeleton block h-4" />
          <span className="ds-skeleton block h-4 w-2/3" />
        </div>
      ) : error ? (
        <p className="p-4 ds-error-text">{error}</p>
      ) : list.length === 0 ? (
        <p className="p-4" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
          No payment attempt yet — the customer has not reached the gateway.
        </p>
      ) : (
        <ul>
          {list.map((tx, index) => (
            <li
              key={tx.id}
              className="px-4 py-3 space-y-2"
              style={{ borderBottom: index === list.length - 1 ? 'none' : '1px solid var(--a-border-soft)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <PaymentStatusPill status={tx.status} />
                  <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                    <Money value={tx.amount} currency={currency} />
                  </span>
                </div>
                <span className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                  {stamp(tx.createdAt)}
                  {tx.updatedAt && tx.updatedAt !== tx.createdAt ? ` · updated ${stamp(tx.updatedAt)}` : ''}
                </span>
              </div>

              <dl
                className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1"
                style={{ fontSize: 'var(--a-fs-sm)' }}
              >
                {tx.reference && (
                  <div className="min-w-0">
                    <dt className="inline" style={{ color: 'var(--a-text-muted)' }}>
                      Reference:{' '}
                    </dt>
                    <dd className="inline ds-num font-semibold break-all">{tx.reference}</dd>
                  </div>
                )}
                {tx.gatewayTxnId && (
                  <div className="min-w-0">
                    <dt className="inline" style={{ color: 'var(--a-text-muted)' }}>
                      Transaction ID:{' '}
                    </dt>
                    <dd className="inline ds-num font-semibold break-all">{tx.gatewayTxnId}</dd>
                  </div>
                )}
                {tx.gatewayRef && (
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="inline" style={{ color: 'var(--a-text-muted)' }}>
                      Gateway ref:{' '}
                    </dt>
                    <dd className="inline ds-num break-all">{tx.gatewayRef}</dd>
                  </div>
                )}
              </dl>

              {tx.message && (
                <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>{tx.message}</p>
              )}

              {tx.status !== 'paid' && (
                <button
                  type="button"
                  onClick={() => verify(tx)}
                  disabled={busyId !== null}
                  className="inline-flex items-center gap-1.5 font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    height: 36,
                    padding: '0 12px',
                    borderRadius: 'var(--ds-r-md)',
                    background: mix(look.color, 0.1),
                    color: look.color,
                    border: `1px solid ${mix(look.color, 0.3)}`,
                    fontSize: 'var(--a-fs-sm)',
                  }}
                >
                  {busyId === tx.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Re-check with gateway
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
