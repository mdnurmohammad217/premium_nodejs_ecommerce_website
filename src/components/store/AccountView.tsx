import React, { useState, useEffect, useCallback } from 'react';
import { paymentMethodLabel } from '../../lib/paymentLabels.ts';
import {
  User,
  Package,
  Phone,
  Mail,
  ChevronRight,
  LogOut,
  ShoppingBag,
  Save,
  Wallet,
  CheckCircle2,
  FileText,
  Info,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Order, SiteSettings } from '../../types/index.ts';
import { WholesaleAccountPanel } from './WholesaleAccountPanel.tsx';
import { WholesalePill } from './ProductCard.tsx';

interface AccountViewProps {
  onNavigate: (view: string, param?: any) => void;
  onOpenLogin: () => void;
  settings?: SiteSettings;
}

const money = (value: any, currency = '৳') =>
  `${currency}${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'ds-badge-warning' },
  confirmed: { label: 'Confirmed', tone: 'ds-badge-info' },
  processing: { label: 'Processing', tone: 'ds-badge-info' },
  packed: { label: 'Packed', tone: 'ds-badge-info' },
  shipped: { label: 'Shipped', tone: 'ds-badge-primary' },
  delivered: { label: 'Delivered', tone: 'ds-badge-success' },
  completed: { label: 'Completed', tone: 'ds-badge-success' },
  cancelled: { label: 'Cancelled', tone: 'ds-badge-danger' },
  refunded: { label: 'Refunded', tone: 'ds-badge-neutral' },
};

const STAFF_MESSAGE = "This is a staff or admin account, so there's no customer profile here. Please use the dashboard instead.";

/**
 * Customer account. It reads the signed-in customer's own profile and order
 * history from /api/account/me — the page used to call a GET /api/orders that
 * does not exist, so it always looked empty — and lets them edit their details
 * and open the invoice for any past order.
 */
export const AccountView: React.FC<AccountViewProps> = ({ onNavigate, onOpenLogin, settings }) => {
  const { user, signOut } = useAuth();
  const currency = settings?.general?.currency || '৳';

  const [profile, setProfile] = useState<any | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isStaff, setIsStaff] = useState(false);

  const [form, setForm] = useState({ name: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError('');
    setIsStaff(false);
    try {
      const res = await fetch('/api/account/me');
      if (!res.ok) throw new Error("We couldn't load your account.");
      const data = await res.json();
      // Admin / staff sessions have no shopper profile — say so plainly
      if (data.staffAccount) {
        setProfile(null);
        setOrders([]);
        setIsStaff(true);
        return;
      }
      setProfile(data.profile || null);
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setForm({
        name: data.profile?.name || '',
        email: data.profile?.email || '',
        address: data.profile?.address || '',
      });
    } catch (err: any) {
      setError(err.message || "We couldn't load your account.");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const saveProfile = async () => {
    setSaving(true);
    setSavedMsg('');
    setError('');
    try {
      const res = await fetch('/api/account/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "We couldn't save your changes.");
      setSavedMsg('Your details have been saved.');
      setTimeout(() => setSavedMsg(''), 2500);
      load();
    } catch (err: any) {
      setError(err.message || "We couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------- logged out */
  if (!user) {
    return (
      <div className="max-w-md mx-auto px-(--ds-s-4) py-(--ds-s-16) text-center ds-fade-in">
        <span className="mx-auto w-14 h-14 rounded-(--ds-r-xl) inline-flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-(--primary)">
          <User className="w-7 h-7" />
        </span>
        <h1 className="mt-(--ds-s-4) text-(length:--ds-fs-xl) font-(--ds-fw-bold) text-(--ds-text)">
          Sign In to Your Account
        </h1>
        <p className="mt-(--ds-s-2) text-(length:--ds-fs-base) text-(--ds-text-muted) leading-(--ds-lh-bn)">
          Sign in to see all your orders, invoices and delivery addresses in one place.
        </p>
        <div className="mt-(--ds-s-5) flex items-center justify-center gap-(--ds-s-2)">
          <button onClick={onOpenLogin} className="ds-btn ds-btn-primary">
            Sign In
          </button>
          <button onClick={() => onNavigate('signup')} className="ds-btn ds-btn-secondary">
            Create Account
          </button>
        </div>
      </div>
    );
  }

  const stats = {
    orders: orders.length,
    spent: orders
      .filter((order) => !['cancelled', 'refunded'].includes(order.orderStatus))
      .reduce((sum, order) => sum + Number(order.total || 0), 0),
    delivered: orders.filter((order) => ['delivered', 'completed'].includes(order.orderStatus)).length,
  };

  const displayName = profile?.name || user.name || '';
  const initial = (displayName || 'U').charAt(0).toUpperCase();

  return (
    <div className="max-w-5xl mx-auto px-(--ds-s-4) py-(--ds-s-8) sm:py-(--ds-s-12) space-y-(--ds-s-5)">
      {/* Header */}
      <div className="ds-card p-(--ds-card-pad-sm) sm:p-(--ds-card-pad-lg) flex flex-col sm:flex-row sm:items-center justify-between gap-(--ds-s-4)">
        <div className="flex items-center gap-(--ds-s-4) min-w-0">
          <span className="w-14 h-14 shrink-0 rounded-(--ds-r-full) inline-flex items-center justify-center bg-(--primary) text-(--primary-foreground) text-(length:--ds-fs-xl) font-(--ds-fw-bold)">
            {initial}
          </span>
          <div className="min-w-0">
            <h1 className="text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text) truncate">
              {displayName}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-(--ds-s-3) gap-y-0.5 text-(length:--ds-fs-sm) text-(--ds-text-muted)">
              {profile?.phone && (
                <span className="inline-flex items-center gap-(--ds-s-1) ds-num">
                  <Phone className="w-3.5 h-3.5" />
                  {profile.phone}
                </span>
              )}
              {profile?.email && (
                <span className="inline-flex items-center gap-(--ds-s-1) min-w-0 break-all">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  {profile.email}
                </span>
              )}
            </p>
          </div>
        </div>

        <button onClick={signOut} className="ds-btn ds-btn-secondary self-start sm:self-auto">
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>

      {isStaff ? (
        <div className="ds-card p-(--ds-card-pad) flex items-start gap-(--ds-s-3)">
          <span className="w-10 h-10 shrink-0 rounded-(--ds-r-full) bg-(--ds-info-soft) text-(--ds-info-text) inline-flex items-center justify-center">
            <Info className="w-5 h-5" />
          </span>
          <p className="text-(length:--ds-fs-md) text-(--ds-text-soft) leading-(--ds-lh-bn) pt-(--ds-s-2)">{STAFF_MESSAGE}</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-(--ds-s-3)">
            {[
              { label: 'Total Orders', value: stats.orders, icon: Package },
              { label: 'Delivered', value: stats.delivered, icon: CheckCircle2 },
              { label: 'Total Spent', value: money(stats.spent, currency), icon: Wallet, wide: true },
            ].map((item) => {
              const StatIcon = item.icon;
              return (
                <div
                  key={item.label}
                  className={`ds-card p-(--ds-s-4) flex items-center gap-(--ds-s-3) min-w-0 ${item.wide ? 'col-span-2 sm:col-span-1' : ''}`}
                >
                  <span className="w-10 h-10 shrink-0 rounded-(--ds-r-md) inline-flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-(--primary)">
                    <StatIcon className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-(length:--ds-fs-xs) text-(--ds-text-muted) truncate">{item.label}</span>
                    {isLoading ? (
                      <span className="block ds-skeleton h-5 w-14 mt-1" />
                    ) : (
                      <span className="block text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text) truncate ds-num">
                        {item.value}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start justify-between gap-(--ds-s-3) rounded-(--ds-r-md) bg-(--ds-danger-soft) text-(--ds-danger-text) px-(--ds-s-4) py-(--ds-s-3) text-(length:--ds-fs-base)"
            >
              <span className="flex items-start gap-(--ds-s-2)">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </span>
              <button onClick={load} className="inline-flex items-center gap-(--ds-s-1) font-(--ds-fw-semibold) hover:underline cursor-pointer shrink-0">
                <RefreshCw className="w-3.5 h-3.5" />
                Try Again
              </button>
            </div>
          )}

          {/* Wholesale: status, business, wholesale orders and products — or the application form */}
          {user?.role === 'customer' && <WholesaleAccountPanel currency={currency} onNavigate={onNavigate} />}

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-(--ds-s-5) items-start">
            {/* Profile form */}
            <section className="lg:col-span-2 ds-card p-(--ds-card-pad-sm) sm:p-(--ds-card-pad)">
              <h2 className="flex items-center gap-(--ds-s-2) text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text) pb-(--ds-s-4) mb-(--ds-s-4) border-b border-(--ds-border-soft)">
                <User className="w-4 h-4 text-(--primary)" />
                My Details
              </h2>

              <div className="space-y-(--ds-s-4)">
                <div>
                  <label htmlFor="acc-name" className="ds-label">Name</label>
                  <input
                    id="acc-name"
                    autoComplete="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="ds-input h-(--ds-h-lg)"
                  />
                </div>

                <div>
                  <label htmlFor="acc-email" className="ds-label">Email</label>
                  <input
                    id="acc-email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="ds-input h-(--ds-h-lg)"
                  />
                </div>

                <div>
                  <label htmlFor="acc-address" className="ds-label">Delivery Address</label>
                  <textarea
                    id="acc-address"
                    rows={3}
                    autoComplete="street-address"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="ds-textarea resize-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-(--ds-s-3)">
                  <button onClick={saveProfile} disabled={saving} className="ds-btn ds-btn-primary">
                    {saving ? (
                      <span
                        className="ds-spinner"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--primary-foreground) 40%, transparent)',
                          borderTopColor: 'var(--primary-foreground)',
                        }}
                      />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>Save Changes</span>
                  </button>
                  {savedMsg && (
                    <span className="inline-flex items-center gap-(--ds-s-1) text-(length:--ds-fs-base) font-(--ds-fw-semibold) text-(--ds-success-text) ds-fade-in">
                      <CheckCircle2 className="w-4 h-4" />
                      {savedMsg}
                    </span>
                  )}
                </div>

                <p className="flex items-start gap-(--ds-s-2) text-(length:--ds-fs-xs) text-(--ds-text-muted) leading-(--ds-lh-bn)">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Your mobile number is your login ID. To change it, please contact us.
                </p>
              </div>
            </section>

            {/* Orders */}
            <section className="lg:col-span-3 ds-card overflow-hidden">
              <div className="px-(--ds-card-pad-sm) sm:px-(--ds-card-pad) py-(--ds-s-4) border-b border-(--ds-border-soft) flex items-center justify-between gap-(--ds-s-3)">
                <h2 className="flex items-center gap-(--ds-s-2) text-(length:--ds-fs-lg) font-(--ds-fw-bold) text-(--ds-text)">
                  <Package className="w-4 h-4 text-(--primary)" />
                  My Orders
                </h2>
                <button onClick={() => onNavigate('track')} className="ds-btn ds-btn-ghost ds-btn-sm text-(--primary)">
                  <span>Track Order</span>
                  <ChevronRight className="rtl:rotate-180 w-3.5 h-3.5" />
                </button>
              </div>

              {isLoading ? (
                <ul className="divide-y divide-(--ds-border-soft)">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <li key={index} className="px-(--ds-card-pad-sm) sm:px-(--ds-card-pad) py-(--ds-s-4) space-y-(--ds-s-2)">
                      <div className="ds-skeleton h-4 w-2/5" />
                      <div className="ds-skeleton h-3 w-3/5" />
                    </li>
                  ))}
                </ul>
              ) : orders.length === 0 ? (
                <div className="text-center px-(--ds-s-6) py-(--ds-s-12)">
                  <span className="mx-auto w-14 h-14 rounded-(--ds-r-xl) inline-flex items-center justify-center bg-(--ds-surface-3) text-(--ds-text-faint)">
                    <ShoppingBag className="w-6 h-6" />
                  </span>
                  <p className="mt-(--ds-s-3) text-(length:--ds-fs-md) font-(--ds-fw-semibold) text-(--ds-text)">
                    You haven't placed any orders yet
                  </p>
                  <button onClick={() => onNavigate('shop')} className="ds-btn ds-btn-primary mt-(--ds-s-4)">
                    Start Shopping
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-(--ds-border-soft)">
                  {orders.map((order) => {
                    const status = STATUS[order.orderStatus];
                    return (
                      <li
                        key={order.id}
                        className="px-(--ds-card-pad-sm) sm:px-(--ds-card-pad) py-(--ds-s-4) flex flex-col sm:flex-row sm:items-center justify-between gap-(--ds-s-3) hover:bg-(--ds-surface-2) transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-(--ds-s-2) flex-wrap">
                            <span className="text-(length:--ds-fs-md) font-(--ds-fw-bold) text-(--ds-text) ds-num break-all">
                              {order.orderNumber}
                            </span>
                            <span className={`ds-badge ${status?.tone || 'ds-badge-neutral'}`}>
                              {status?.label || order.orderStatus}
                            </span>
                            {(order as Order & { isWholesale?: boolean }).isWholesale && <WholesalePill />}
                          </div>
                          <p className="mt-(--ds-s-1) text-(length:--ds-fs-sm) text-(--ds-text-muted) ds-num">
                            {new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB')} ·{' '}
                            <strong className="font-(--ds-fw-bold) text-(--ds-text)">{money(order.total, currency)}</strong>
                            {order.paymentMethod ? ` · ${paymentMethodLabel(order.paymentMethod, (settings as any)?.payment?.methods)}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center gap-(--ds-s-2) shrink-0">
                          <button
                            onClick={() =>
                              onNavigate('invoice', {
                                orderNumber: order.orderNumber,
                                phone: order.customerPhone,
                              })
                            }
                            className="ds-btn ds-btn-secondary ds-btn-sm"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Invoice</span>
                          </button>
                          <button
                            onClick={() => onNavigate('track', { orderNumber: order.orderNumber })}
                            className="ds-btn ds-btn-soft ds-btn-sm"
                          >
                            <span>Track</span>
                            <ChevronRight className="rtl:rotate-180 w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
};
