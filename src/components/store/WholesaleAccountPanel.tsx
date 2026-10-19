import React, { useCallback, useEffect, useState } from 'react';
import {
  Store,
  Clock,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Package,
  Save,
  User,
  AlertCircle,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Order, Product } from '../../types/index.ts';
import { BUSINESS_TYPES } from '../../lib/wholesale.ts';
import { StoreLink } from './Header.tsx';
import { WholesalePill } from './ProductCard.tsx';
import { IMAGE_PLACEHOLDER } from '../../lib/placeholder.ts';

interface WholesaleData {
  profile: { id: number; name: string; phone: string; email: string; address: string; createdAt?: string };
  wholesale: {
    customerType: 'regular' | 'wholesale';
    wholesaleStatus: 'pending' | 'approved' | 'rejected' | 'suspended' | null;
    businessName: string;
    businessAddress: string;
    businessType: string;
    wholesaleAppliedAt?: string | null;
    wholesaleReviewedAt?: string | null;
    wholesaleNote?: string;
  };
  orders: Order[];
  products: Product[];
}

const STATUS_META = {
  pending: {
    label: 'Pending approval',
    icon: Clock,
    tone: 'bg-(--ds-warning-soft) text-(--ds-warning-text)',
    text: 'We have your application and will review it shortly. Until it is approved you see regular prices.',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    tone: 'bg-(--ds-success-soft) text-(--ds-success-text)',
    text: 'You see wholesale prices on every wholesale product while signed in.',
  },
  rejected: {
    label: 'Not approved',
    icon: XCircle,
    tone: 'bg-(--ds-danger-soft) text-(--ds-danger-text)',
    text: 'Your application was not approved. You can update your details and apply again.',
  },
  suspended: {
    label: 'Suspended',
    icon: PauseCircle,
    tone: 'bg-(--ds-danger-soft) text-(--ds-danger-text)',
    text: 'Wholesale buying is paused on this account. Please contact the store.',
  },
} as const;

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/**
 * Wholesale section of My Account: status, business information, wholesale
 * orders, the wholesale catalogue and account details. A regular customer
 * sees an application form here instead.
 */
export const WholesaleAccountPanel: React.FC<{
  currency: string;
  onNavigate: (view: string, params?: any) => void;
}> = ({ currency, onNavigate }) => {
  const { refreshUser } = useAuth();
  const [data, setData] = useState<WholesaleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ businessName: '', businessAddress: '', businessType: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showApply, setShowApply] = useState(false);

  const money = (value: any) =>
    `${currency}${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/account/wholesale');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load your wholesale account.');
      setData(json);
      setForm({
        businessName: json.wholesale?.businessName || '',
        businessAddress: json.wholesale?.businessAddress || '',
        businessType: json.wholesale?.businessType || '',
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (kind: 'apply' | 'update') => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch(kind === 'apply' ? '/api/account/wholesale/apply' : '/api/account/wholesale', {
        method: kind === 'apply' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save.');
      setMessage(kind === 'apply' ? 'Application sent.' : 'Business details saved.');
      setShowApply(false);
      await refreshUser();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <section className="ds-card p-(--ds-card-pad) space-y-(--ds-s-3)">
        <div className="ds-skeleton h-5 w-48" />
        <div className="ds-skeleton h-4 w-2/3" />
      </section>
    );
  }
  if (!data) {
    return error ? (
      <p className="text-(length:--ds-fs-sm) text-(--ds-danger-text)">{error}</p>
    ) : null;
  }

  const ws = data.wholesale;
  const isWholesale = ws.customerType === 'wholesale';
  const status = isWholesale ? ws.wholesaleStatus || 'pending' : null;
  const meta = status ? STATUS_META[status] : null;
  const canApply = !isWholesale || status === 'rejected';

  const businessFields = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-(--ds-s-3)">
      <div>
        <label htmlFor="ws-name" className="ds-label">Business / Shop Name</label>
        <input
          id="ws-name"
          value={form.businessName}
          onChange={(e) => setForm({ ...form, businessName: e.target.value })}
          className="ds-input h-(--ds-h-lg)"
        />
      </div>
      <div>
        <label htmlFor="ws-type" className="ds-label">Business Type</label>
        <select
          id="ws-type"
          value={form.businessType}
          onChange={(e) => setForm({ ...form, businessType: e.target.value })}
          className="ds-select h-(--ds-h-lg)"
        >
          <option value="">Choose one</option>
          {Array.from(new Set([...BUSINESS_TYPES, form.businessType].filter(Boolean))).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="ws-address" className="ds-label">Business Address</label>
        <textarea
          id="ws-address"
          rows={2}
          value={form.businessAddress}
          onChange={(e) => setForm({ ...form, businessAddress: e.target.value })}
          className="ds-textarea resize-none"
        />
      </div>
    </div>
  );

  const alerts = (
    <>
      {error && (
        <p role="alert" className="flex items-start gap-(--ds-s-2) text-(length:--ds-fs-sm) text-(--ds-danger-text)">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="flex items-center gap-(--ds-s-2) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--ds-success-text)">
          <CheckCircle2 className="w-4 h-4" />
          {message}
        </p>
      )}
    </>
  );

  /* ---------------------------------------------- regular customer: apply */
  if (!isWholesale) {
    return (
      <section className="ds-card p-(--ds-card-pad-sm) sm:p-(--ds-card-pad) space-y-(--ds-s-4)">
        <div className="flex flex-wrap items-center justify-between gap-(--ds-s-3)">
          <div className="flex items-center gap-(--ds-s-3) min-w-0">
            <span className="w-10 h-10 shrink-0 rounded-(--ds-r-md) bg-(--ds-indigo-soft) text-(--ds-indigo) inline-flex items-center justify-center">
              <Store className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">Buying for a business?</h2>
              <p className="text-(length:--ds-fs-sm) text-(--ds-text-muted)">
                Apply for a wholesale account to buy at wholesale prices.
              </p>
            </div>
          </div>
          {!showApply && (
            <button type="button" onClick={() => setShowApply(true)} className="ds-btn ds-btn-soft">
              Register as Wholesale Customer
            </button>
          )}
        </div>
        {showApply && (
          <div className="space-y-(--ds-s-4) pt-(--ds-s-4) border-t border-(--ds-border-soft)">
            {businessFields}
            {alerts}
            <div className="flex gap-(--ds-s-2)">
              <button type="button" disabled={saving} onClick={() => submit('apply')} className="ds-btn ds-btn-primary">
                {saving ? 'Sending...' : 'Send application'}
              </button>
              <button type="button" onClick={() => setShowApply(false)} className="ds-btn ds-btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        )}
        {!showApply && alerts}
      </section>
    );
  }

  /* ------------------------------------------------- wholesale dashboard */
  const StatusIcon = meta!.icon;
  const totalSpent = data.orders
    .filter((order) => !['cancelled', 'refunded'].includes(order.orderStatus))
    .reduce((sum, order) => sum + Number(order.total || 0), 0);

  return (
    <section className="space-y-(--ds-s-4)" aria-label="Wholesale account">
      {/* Status */}
      <div className="ds-card p-(--ds-card-pad-sm) sm:p-(--ds-card-pad) flex flex-col sm:flex-row sm:items-center gap-(--ds-s-4)">
        <span className={`w-12 h-12 shrink-0 rounded-(--ds-r-lg) inline-flex items-center justify-center ${meta!.tone}`}>
          <StatusIcon className="w-6 h-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-(--ds-s-2)">
            <h2 className="text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">Wholesale account</h2>
            {status === 'approved' ? (
              <WholesalePill />
            ) : (
              <span className={`inline-flex items-center h-5 px-(--ds-s-2) rounded-(--ds-r-full) text-(length:--ds-fs-2xs) font-(--ds-fw-bold) ${meta!.tone}`}>
                {meta!.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-(length:--ds-fs-sm) text-(--ds-text-soft)">{meta!.text}</p>
          {ws.wholesaleNote && ['rejected', 'suspended'].includes(status!) && (
            <p className="mt-(--ds-s-1) text-(length:--ds-fs-sm) text-(--ds-text-muted)">Note from the store: {ws.wholesaleNote}</p>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-(--ds-s-6) gap-y-0.5 text-(length:--ds-fs-xs) shrink-0">
          <dt className="text-(--ds-text-muted)">Applied</dt>
          <dd className="ds-num text-(--ds-text) font-(--ds-fw-semibold)">{formatDate(ws.wholesaleAppliedAt)}</dd>
          <dt className="text-(--ds-text-muted)">Wholesale orders</dt>
          <dd className="ds-num text-(--ds-text) font-(--ds-fw-semibold)">{data.orders.length}</dd>
          <dt className="text-(--ds-text-muted)">Total spent</dt>
          <dd className="ds-num text-(--ds-text) font-(--ds-fw-semibold)">{money(totalSpent)}</dd>
        </dl>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-(--ds-s-4) items-start">
        {/* Business information */}
        <div className="ds-card p-(--ds-card-pad-sm) sm:p-(--ds-card-pad) space-y-(--ds-s-4)">
          <h3 className="flex items-center gap-(--ds-s-2) text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text)">
            <Store className="w-4 h-4 text-(--primary)" />
            Business Information
          </h3>
          {businessFields}
          {alerts}
          <div className="flex flex-wrap gap-(--ds-s-2)">
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(canApply ? 'apply' : 'update')}
              className="ds-btn ds-btn-primary"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : canApply ? 'Apply again' : 'Save details'}</span>
            </button>
          </div>
        </div>

        {/* Account information */}
        <div className="ds-card p-(--ds-card-pad-sm) sm:p-(--ds-card-pad) space-y-(--ds-s-3)">
          <h3 className="flex items-center gap-(--ds-s-2) text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text)">
            <User className="w-4 h-4 text-(--primary)" />
            Account Information
          </h3>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-(--ds-s-4) gap-y-(--ds-s-2) text-(length:--ds-fs-base)">
            <dt className="text-(--ds-text-muted)">Name</dt>
            <dd className="text-(--ds-text) font-(--ds-fw-medium) truncate">{data.profile.name}</dd>
            <dt className="text-(--ds-text-muted)">Mobile</dt>
            <dd className="text-(--ds-text) font-(--ds-fw-medium) ds-num">{data.profile.phone}</dd>
            <dt className="text-(--ds-text-muted)">Email</dt>
            <dd className="text-(--ds-text) font-(--ds-fw-medium) break-all">{data.profile.email || '—'}</dd>
            <dt className="text-(--ds-text-muted)">Member since</dt>
            <dd className="text-(--ds-text) font-(--ds-fw-medium) ds-num">{formatDate(data.profile.createdAt)}</dd>
          </dl>
          <p className="text-(length:--ds-fs-xs) text-(--ds-text-muted)">
            Your mobile number is your login ID. Edit your name, email and delivery address under My Details.
          </p>
        </div>
      </div>

      {/* Wholesale orders */}
      <div className="ds-card overflow-hidden">
        <div className="px-(--ds-card-pad-sm) sm:px-(--ds-card-pad) py-(--ds-s-4) border-b border-(--ds-border-soft)">
          <h3 className="flex items-center gap-(--ds-s-2) text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text)">
            <Package className="w-4 h-4 text-(--primary)" />
            Wholesale Orders
          </h3>
        </div>
        {data.orders.length === 0 ? (
          <p className="px-(--ds-card-pad) py-(--ds-s-8) text-center text-(length:--ds-fs-base) text-(--ds-text-muted)">
            No wholesale orders yet.
          </p>
        ) : (
          <ul className="divide-y divide-(--ds-border-soft)">
            {data.orders.map((order) => (
              <li
                key={order.id}
                className="px-(--ds-card-pad-sm) sm:px-(--ds-card-pad) py-(--ds-s-3) flex flex-wrap items-center justify-between gap-(--ds-s-3)"
              >
                <div className="min-w-0">
                  <p className="text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text) ds-num">{order.orderNumber}</p>
                  <p className="text-(length:--ds-fs-sm) text-(--ds-text-muted) ds-num">
                    {formatDate(order.createdAt)} · {money(order.total)} · {order.orderStatus}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('invoice', { orderNumber: order.orderNumber, phone: order.customerPhone })}
                  className="ds-btn ds-btn-secondary ds-btn-sm"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Invoice</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Wholesale products */}
      {status === 'approved' && (
        <div className="ds-card p-(--ds-card-pad-sm) sm:p-(--ds-card-pad)">
          <div className="flex items-center justify-between gap-(--ds-s-3) mb-(--ds-s-4)">
            <h3 className="text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text)">Wholesale Products</h3>
            <StoreLink
              to={{ view: 'shop', params: {} }}
              onNavigate={onNavigate}
              className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) hover:underline"
            >
              View all
              <ChevronRight className="rtl:rotate-180 w-4 h-4" />
            </StoreLink>
          </div>
          {data.products.length === 0 ? (
            <p className="text-(length:--ds-fs-base) text-(--ds-text-muted)">No wholesale products are listed yet.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-(--ds-s-3)">
              {data.products.map((product) => (
                <li key={product.id}>
                  <StoreLink
                    to={{ view: 'product', params: { slug: product.slug, id: product.id } }}
                    onNavigate={onNavigate}
                    className="flex items-center gap-(--ds-s-3) p-(--ds-s-2) rounded-(--ds-r-md) border border-(--ds-border-soft) hover:border-(--primary) transition-colors"
                  >
                    <img
                      src={product.image || IMAGE_PLACEHOLDER}
                      alt=""
                      loading="lazy"
                      className="w-14 h-14 rounded-(--ds-r-sm) object-cover bg-(--ds-surface-2) shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-text) truncate">
                        {product.name}
                      </span>
                      <span className="block text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--primary) ds-num">
                        {money(product.price)}
                      </span>
                      {Number(product.wholesaleMinQty) > 1 && (
                        <span className="block text-(length:--ds-fs-xs) text-(--ds-text-muted)">
                          Min. {product.wholesaleMinQty}
                        </span>
                      )}
                    </span>
                  </StoreLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
