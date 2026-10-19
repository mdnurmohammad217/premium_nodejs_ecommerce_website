import React, { useCallback, useEffect, useState } from 'react';
import { Phone, MapPin, RefreshCw, Package, Send, ClipboardCheck, Clock } from 'lucide-react';
import { Card, Button, FilterPills, StatusSelect, EmptyState, ErrorState, SectionLoader, mix } from '../admin/ui.tsx';

const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'returned', label: 'Returned' },
];

const when = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
};

/**
 * POS → My Orders. Website orders the owner assigned to this staff member:
 * call the customer, confirm, add a note, move the order along. Stock goes
 * back automatically when an order is cancelled or returned.
 */
export const MyOrdersPanel: React.FC<{ currency?: string }> = ({ currency = '৳' }) => {
  const [filter, setFilter] = useState('open');
  const [rows, setRows] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/pos/my-orders?status=${encodeURIComponent(filter)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load your orders.');
      setRows(Array.isArray(data.orders) ? data.orders : []);
      setCounts(data.counts || {});
    } catch (err: any) {
      setError(err.message || 'Could not load your orders.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (order: any, body: Record<string, any>) => {
    setBusy(order.id);
    setMessage('');
    try {
      const res = await fetch(`/api/pos/my-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update the order.');
      setRows((list) => list.map((row) => (row.id === order.id ? { ...row, ...data.order } : row)));
      if (body.note) setNotes((prev) => ({ ...prev, [order.id]: '' }));
      setMessage(`${order.orderNumber} updated.`);
    } catch (err: any) {
      setMessage(err.message || 'Could not update the order.');
    } finally {
      setBusy(null);
    }
  };

  const open = ['pending', 'processing', 'confirmed', 'on_hold', 'shipped'].reduce((sum, key) => sum + (counts[key] || 0), 0);
  const money = (value: any) => `${currency}${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <FilterPills
          active={filter}
          onChange={setFilter}
          pills={[
            { id: 'open', label: `Open (${open})`, color: 'var(--primary-ink, var(--primary))' },
            { id: 'delivered', label: `Delivered (${counts.delivered || 0})`, color: 'var(--ds-success)' },
            { id: 'cancelled', label: `Cancelled (${counts.cancelled || 0})`, color: 'var(--ds-danger)' },
            { id: 'all', label: 'All', color: 'var(--ds-gray-600)' },
          ]}
        />
        <Button icon={RefreshCw} onClick={load} loading={loading}>
          Refresh
        </Button>
      </div>

      {message && (
        <p className="p-3" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--ds-info-soft)', color: 'var(--ds-info-text)', fontSize: 'var(--ds-fs-sm)' }}>
          {message}
        </p>
      )}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading && rows.length === 0 ? (
        <Card>
          <SectionLoader lines={5} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title={filter === 'open' ? 'No open orders for you' : 'Nothing here'}
            description="Orders the owner assigns to you in Dashboard → Orders appear here."
            icon={ClipboardCheck}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map((order) => {
            const due = Math.max(0, Number(order.total || 0) - Number(order.advancePaid || 0));
            return (
              <article key={order.id} className="a-card p-4 space-y-3" style={{ borderLeft: '4px solid var(--primary)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold ds-num" style={{ fontSize: 'var(--ds-fs-lg)' }}>
                      {order.orderNumber}
                    </div>
                    <div className="flex items-center gap-1" style={{ fontSize: 'var(--ds-fs-xs)', color: 'var(--ds-text-muted)' }}>
                      <Clock className="w-3 h-3" /> {when(order.createdAt)}
                      {order.assignedName && <span> · {order.assignedName}</span>}
                    </div>
                  </div>
                  <StatusSelect
                    value={order.orderStatus}
                    options={STATUSES}
                    onChange={(next) => update(order, { orderStatus: next })}
                  />
                </div>

                <div className="p-3 space-y-1" style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--ds-surface-2)' }}>
                  <div className="font-semibold">{order.customerName}</div>
                  <a href={`tel:${order.customerPhone}`} className="inline-flex items-center gap-1.5 font-semibold ds-num" style={{ color: 'var(--primary-ink, var(--primary))' }}>
                    <Phone className="w-3.5 h-3.5" /> {order.customerPhone}
                  </a>
                  {order.customerAddress && (
                    <div className="flex items-start gap-1.5" style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-soft)' }}>
                      <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {order.customerAddress}
                    </div>
                  )}
                </div>

                <ul className="space-y-1" style={{ fontSize: 'var(--ds-fs-sm)' }}>
                  {(order.items || []).map((item: any, index: number) => (
                    <li key={index} className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--ds-text-faint)' }} />
                      <span className="min-w-0 flex-1 truncate">
                        {item.productName}
                        {item.variationLabel ? ` — ${item.variationLabel}` : ''}
                      </span>
                      <span className="ds-num font-semibold">× {item.quantity}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1" style={{ fontSize: 'var(--ds-fs-sm)' }}>
                  <span>
                    Total <strong className="ds-num">{money(order.total)}</strong>
                  </span>
                  {Number(order.advancePaid) > 0 && (
                    <span style={{ color: 'var(--ds-success-text)' }}>
                      Advance <strong className="ds-num">{money(order.advancePaid)}</strong>
                    </span>
                  )}
                  <span
                    className="font-bold"
                    style={{ padding: '2px 8px', borderRadius: 999, background: mix('var(--primary)', 0.1), color: 'var(--primary-ink, var(--primary))' }}
                  >
                    Collect {money(order.paymentStatus === 'paid' ? 0 : due)}
                  </span>
                </div>

                {order.notes && (
                  <pre
                    className="whitespace-pre-wrap p-2"
                    style={{ fontFamily: 'inherit', fontSize: 'var(--ds-fs-xs)', color: 'var(--ds-text-soft)', background: 'var(--ds-surface-2)', borderRadius: 'var(--ds-r-sm)' }}
                  >
                    {order.notes}
                  </pre>
                )}

                <div className="flex gap-2">
                  <input
                    className="a-field flex-1"
                    placeholder="Add a note (e.g. called, will receive tomorrow)"
                    value={notes[order.id] || ''}
                    onChange={(event) => setNotes((prev) => ({ ...prev, [order.id]: event.target.value }))}
                  />
                  <Button
                    icon={Send}
                    disabled={!String(notes[order.id] || '').trim()}
                    loading={busy === order.id}
                    onClick={() => update(order, { note: notes[order.id] })}
                  >
                    Save
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
