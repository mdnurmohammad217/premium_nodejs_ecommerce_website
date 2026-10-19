import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle2,
  Clock,
  Package,
  Truck,
  MapPin,
  FileCheck,
  AlertCircle,
  Phone,
  XCircle,
  PackageSearch,
} from 'lucide-react';
import { Order, OrderItem, SiteSettings } from '../../types/index.ts';
import { paymentMethodLabel, paymentStatusLabel } from '../../lib/paymentLabels.ts';

interface OrderTrackingViewProps {
  initialOrderNumber?: string;
  settings?: SiteSettings;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  returned: 'Returned',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'ds-badge-warning',
  confirmed: 'ds-badge-info',
  processing: 'ds-badge-info',
  packed: 'ds-badge-info',
  shipped: 'ds-badge-primary',
  delivered: 'ds-badge-success',
  completed: 'ds-badge-success',
  cancelled: 'ds-badge-danger',
  refunded: 'ds-badge-neutral',
  returned: 'ds-badge-neutral',
};

// Pipeline steps
const steps = [
  { key: 'pending', label: 'Order Placed', icon: Clock },
  { key: 'confirmed', label: 'Confirmed', icon: FileCheck },
  { key: 'processing', label: 'Packing', icon: Package },
  { key: 'shipped', label: 'On the Way', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
];

const getStepIndex = (status: string) => {
  switch (status) {
    case 'pending': return 0;
    case 'confirmed': return 1;
    case 'processing': return 2;
    case 'packed': return 2;
    case 'shipped': return 3;
    case 'delivered':
    case 'completed': return 4;
    default: return 0;
  }
};

export const OrderTrackingView: React.FC<OrderTrackingViewProps> = ({ initialOrderNumber, settings }) => {
  const [searchKey, setSearchKey] = useState(initialOrderNumber || '');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = async (key: string) => {
    if (!key.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const isPhone = key.replace(/\D/g, '').length >= 10;
      const param = isPhone ? `phone=${encodeURIComponent(key)}` : `orderNumber=${encodeURIComponent(key)}`;
      const res = await fetch(`/api/orders/track?${param}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Order not found.');
      }
      setOrder(data.order);
      setItems(data.items || []);
    } catch (err: any) {
      setError(err.message || "We couldn't find an order with that order number or mobile number.");
      setOrder(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialOrderNumber) {
      fetchOrder(initialOrderNumber);
    }
  }, [initialOrderNumber]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrder(searchKey);
  };

  const activeIndex = order ? getStepIndex(order.orderStatus) : 0;
  const isStopped = order ? ['cancelled', 'refunded', 'returned'].includes(order.orderStatus) : false;

  return (
    <div className="max-w-4xl mx-auto px-(--ds-s-4) py-(--ds-s-8) sm:py-(--ds-s-12) space-y-(--ds-s-6)">
      <div className="text-center">
        <span className="mx-auto w-12 h-12 rounded-(--ds-r-lg) inline-flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-(--primary)">
          <PackageSearch className="w-6 h-6" />
        </span>
        <h1 className="mt-(--ds-s-3) text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)">Track Your Order</h1>
        <p className="mt-(--ds-s-1) text-(length:--ds-fs-base) text-(--ds-text-muted) leading-(--ds-lh-bn)">
          Enter your order number or the mobile number you used when ordering.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="max-w-xl mx-auto flex gap-(--ds-s-2)">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-(--ds-text-faint) absolute left-(--ds-s-3) top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Order number or 01XXXXXXXXX"
            aria-label="Order number or mobile number"
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            className="ds-input h-(--ds-h-lg) pl-9"
          />
        </div>
        <button type="submit" disabled={loading || !searchKey.trim()} className="ds-btn ds-btn-primary ds-btn-lg shrink-0">
          {loading ? (
            <span
              className="ds-spinner"
              style={{
                borderColor: 'color-mix(in srgb, var(--primary-foreground) 40%, transparent)',
                borderTopColor: 'var(--primary-foreground)',
              }}
            />
          ) : (
            'Track'
          )}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="max-w-xl mx-auto flex items-start gap-(--ds-s-2) rounded-(--ds-r-md) bg-(--ds-danger-soft) text-(--ds-danger-text) px-(--ds-s-4) py-(--ds-s-3) text-(length:--ds-fs-base)"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && !order && (
        <div className="ds-card p-(--ds-card-pad) space-y-(--ds-s-4)">
          <div className="ds-skeleton h-5 w-1/3" />
          <div className="ds-skeleton h-10 w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-(--ds-s-4)">
            <div className="ds-skeleton h-24" />
            <div className="ds-skeleton h-24" />
          </div>
        </div>
      )}

      {order && (
        <div className="ds-card ds-fade-in p-(--ds-card-pad-sm) sm:p-(--ds-card-pad-lg) space-y-(--ds-s-6)">
          {/* Order header */}
          <div className="flex flex-wrap items-start justify-between gap-(--ds-s-3) pb-(--ds-s-4) border-b border-(--ds-border-soft)">
            <div className="min-w-0">
              <span className="text-(length:--ds-fs-xs) font-(--ds-fw-semibold) text-(--ds-text-muted)">Order Number</span>
              <h2 className="text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text) ds-num break-all">
                {order.orderNumber}
              </h2>
              <span className="text-(length:--ds-fs-sm) text-(--ds-text-muted)">
                {new Date(order.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
              </span>
            </div>
            <span className={`ds-badge ${STATUS_BADGE[order.orderStatus] || 'ds-badge-neutral'}`}>
              {STATUS_LABEL[order.orderStatus] || order.orderStatus}
            </span>
          </div>

          {/* Timeline */}
          {isStopped ? (
            <div className="flex items-center gap-(--ds-s-3) rounded-(--ds-r-md) bg-(--ds-surface-2) px-(--ds-s-4) py-(--ds-s-3) text-(length:--ds-fs-base) text-(--ds-text-soft)">
              <XCircle className="w-5 h-5 shrink-0 text-(--ds-text-muted)" />
              <span>This order has been {(STATUS_LABEL[order.orderStatus] || order.orderStatus).toLowerCase()}.</span>
            </div>
          ) : (
            <ol className="relative flex items-start justify-between">
              <span aria-hidden className="absolute left-5 right-5 top-5 h-0.5 bg-(--ds-border) rounded-(--ds-r-full)">
                <span
                  className="block h-full bg-(--primary) rounded-(--ds-r-full) transition-all duration-(--ds-dur-slow)"
                  style={{ width: `${(activeIndex / (steps.length - 1)) * 100}%` }}
                />
              </span>

              {steps.map((step, idx) => {
                const Icon = step.icon;
                const isPassed = idx <= activeIndex;
                const isCurrent = idx === activeIndex;
                return (
                  <li
                    key={step.key}
                    aria-current={isCurrent ? 'step' : undefined}
                    className="relative flex flex-col items-center text-center min-w-0 flex-1"
                  >
                    <span
                      className={`w-10 h-10 rounded-(--ds-r-full) inline-flex items-center justify-center transition-colors ${
                        isPassed
                          ? 'bg-(--primary) text-(--primary-foreground)'
                          : 'bg-(--ds-surface) text-(--ds-text-faint) border border-(--ds-border-strong)'
                      } ${isCurrent ? 'shadow-(--ds-ring)' : ''}`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span
                      className={`mt-(--ds-s-2) text-(length:--ds-fs-2xs) sm:text-(length:--ds-fs-sm) font-(--ds-fw-semibold) leading-(--ds-lh-snug) ${
                        isPassed ? 'text-(--ds-text)' : 'text-(--ds-text-faint)'
                      }`}
                    >
                      {step.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {/* Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-(--ds-s-4)">
            <div className="rounded-(--ds-r-md) bg-(--ds-surface-2) p-(--ds-s-4) space-y-(--ds-s-1) min-w-0">
              <div className="flex items-center gap-(--ds-s-1) text-(length:--ds-fs-xs) font-(--ds-fw-semibold) text-(--ds-text-muted)">
                <MapPin className="w-3.5 h-3.5" />
                <span>Delivery Address</span>
              </div>
              <p className="text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text)">{order.customerName}</p>
              {order.customerAddress && (
                <p className="text-(length:--ds-fs-base) text-(--ds-text-soft) leading-(--ds-lh-bn) break-words">
                  {order.customerAddress}
                </p>
              )}
              <p className="text-(length:--ds-fs-base) text-(--ds-text-muted) flex items-center gap-(--ds-s-1) ds-num">
                <Phone className="w-3.5 h-3.5" /> {order.customerPhone}
              </p>
            </div>

            <dl className="rounded-(--ds-r-md) bg-(--ds-surface-2) p-(--ds-s-4) space-y-(--ds-s-2) text-(length:--ds-fs-base)">
              <div className="flex justify-between gap-(--ds-s-3)">
                <dt className="text-(--ds-text-muted)">Payment Method</dt>
                <dd className="font-(--ds-fw-semibold) text-(--ds-text)">{paymentMethodLabel(order.paymentMethod, (settings as any)?.payment?.methods)}</dd>
              </div>
              <div className="flex justify-between gap-(--ds-s-3)">
                <dt className="text-(--ds-text-muted)">Payment Status</dt>
                <dd className="font-(--ds-fw-semibold) text-(--ds-text)">{paymentStatusLabel(order.paymentStatus)}</dd>
              </div>
              {order.shippingZone && (
                <div className="flex justify-between gap-(--ds-s-3)">
                  <dt className="text-(--ds-text-muted)">Delivery Area</dt>
                  <dd className="font-(--ds-fw-semibold) text-(--ds-text) text-right">{order.shippingZone}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-(--ds-s-3) pt-(--ds-s-2) border-t border-(--ds-border)">
                <dt className="font-(--ds-fw-bold) text-(--ds-text)">Total</dt>
                <dd className="text-(length:--ds-fs-lg) font-(--ds-fw-black) text-(--primary) ds-num">
                  ৳{Number(order.total || 0).toLocaleString('en-BD')}
                </dd>
              </div>
            </dl>
          </div>

          {/* Items */}
          {items.length > 0 && (
            <div>
              <h3 className="text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-text-muted) mb-(--ds-s-2)">
                Products in This Order (<span className="ds-num">{items.length}</span>)
              </h3>
              <ul className="rounded-(--ds-r-md) border border-(--ds-border) divide-y divide-(--ds-border-soft) overflow-hidden">
                {items.map((it: any) => (
                  <li key={it.id} className="px-(--ds-s-4) py-(--ds-s-3) flex justify-between items-center gap-(--ds-s-3)">
                    <div className="min-w-0">
                      <span className="block text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text) ds-clamp-2">
                        {it.productName}
                      </span>
                      <span className="block text-(length:--ds-fs-xs) text-(--ds-text-muted) ds-num">
                        {it.variationLabel ? `${it.variationLabel} · ` : ''}Qty: {it.quantity}
                        {it.batchNumber ? ` · Batch: ${it.batchNumber}` : ''}
                      </span>
                    </div>
                    <span className="text-(length:--ds-fs-base) font-(--ds-fw-bold) text-(--ds-text) ds-num shrink-0">
                      ৳{Number(it.subtotal || 0).toLocaleString('en-BD')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
