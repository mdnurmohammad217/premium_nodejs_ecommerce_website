import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RotateCcw,
  Plus,
  Minus,
  Search,
  RefreshCw,
  Wallet,
  PackageCheck,
  Clock,
  Undo2,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  IconButton,
  SearchInput,
  Toolbar,
  FilterPills,
  TableWrap,
  EmptyState,
  ErrorState,
  LoadingRows,
  Modal,
  ConfirmDialog,
  Field,
  Toggle,
  Badge,
  Money,
  Thumb,
  Select,
  StatCard,
  useToasts,
  useDebounced,
  ACCENTS,
} from './ui.tsx';

const REFUND_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'rocket', label: 'Rocket' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'store_credit', label: 'Store credit' },
  { value: 'none', label: 'No refund' },
];
const methodLabel = (value: string) => REFUND_METHODS.find((m) => m.value === value)?.label || value || '—';
const fmtDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

interface ReturnRow {
  id: number;
  returnNumber: string;
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  items: Array<{ productName: string; variationLabel?: string; quantity: number; unitPrice: number; amount: number }>;
  itemsAmount: string;
  refundAmount: string;
  refundMethod: string;
  reason?: string;
  note?: string;
  restocked: boolean;
  status: 'received' | 'refunded';
  createdBy?: string;
  createdAt?: string;
  refundedAt?: string;
}

/**
 * Sales → Returns. Every return is recorded against its order: what came
 * back, whether it went back into stock, and what was refunded — so the
 * shop's sales figures and stock stay correct after returns.
 */
export const AdminReturnsPage: React.FC<{ currency?: string; initialOrderNumber?: string; onConsumedInitial?: () => void }> = ({
  currency = '৳',
  initialOrderNumber,
  onConsumedInitial,
}) => {
  const toasts = useToasts();
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [stats, setStats] = useState<any>({});
  const [reasons, setReasons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'all' | 'received' | 'refunded'>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [viewing, setViewing] = useState<ReturnRow | null>(null);
  const [undoing, setUndoing] = useState<ReturnRow | null>(null);
  const [busy, setBusy] = useState(false);

  // New return
  const [creating, setCreating] = useState(false);
  const [lookup, setLookup] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [found, setFound] = useState<{ order: any; items: any[] } | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [form, setForm] = useState({ reason: '', restock: true, refundMethod: 'cash', refundNow: true, refundAmount: '', note: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ status });
      if (debounced.trim()) params.set('search', debounced.trim());
      const res = await fetch(`/api/admin/returns?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load returns.');
      setRows(data.returns || []);
      setStats(data.stats || {});
      setReasons(data.reasons || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  const findOrder = async (value = lookup) => {
    const key = value.trim();
    if (!key) return;
    setLookupError('');
    setFound(null);
    try {
      const res = await fetch(`/api/admin/returns/order?q=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Order not found.');
      setFound(data);
      if (Array.isArray(data.reasons) && data.reasons.length) setReasons(data.reasons);
      setQty({});
    } catch (err: any) {
      setLookupError(err.message);
    }
  };

  const openCreate = (orderNumber = '') => {
    setCreating(true);
    setLookup(orderNumber);
    setLookupError('');
    setFound(null);
    setQty({});
    setForm({ reason: '', restock: true, refundMethod: 'cash', refundNow: true, refundAmount: '', note: '' });
    if (orderNumber) void findOrder(orderNumber);
  };

  // Opened from an order's "Return items" button
  useEffect(() => {
    if (initialOrderNumber) {
      openCreate(initialOrderNumber);
      onConsumedInitial?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrderNumber]);

  const itemsTotal = useMemo(
    () =>
      (found?.items || []).reduce((sum, item) => sum + (qty[item.id] || 0) * Number(item.unitPrice || 0), 0),
    [found, qty]
  );
  const unitsChosen = Object.values(qty).reduce((sum: number, value) => sum + Number(value || 0), 0);

  const submit = async () => {
    if (!found) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: found.order.id,
          items: Object.entries(qty)
            .filter(([, value]) => Number(value) > 0)
            .map(([orderItemId, quantity]) => ({ orderItemId: Number(orderItemId), quantity: Number(quantity) })),
          reason: form.reason,
          restock: form.restock,
          refundMethod: form.refundMethod,
          refundNow: form.refundNow && form.refundMethod !== 'none',
          refundAmount: form.refundMethod === 'none' ? 0 : form.refundAmount === '' ? undefined : Number(form.refundAmount),
          note: form.note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save the return.');
      toasts.push(`${data.returnNumber} saved for ${data.orderNumber}.`);
      setCreating(false);
      load();
    } catch (err: any) {
      toasts.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const markRefunded = async (row: ReturnRow) => {
    const res = await fetch(`/api/admin/returns/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'refunded' }),
    });
    if (res.ok) {
      toasts.push(`${row.returnNumber} marked refunded.`);
      setViewing(null);
      load();
    } else toasts.push('Could not update the return.', 'error');
  };

  const undo = async () => {
    if (!undoing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/returns/${undoing.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not undo.');
      toasts.push(`${undoing.returnNumber} undone.`);
      setUndoing(null);
      setViewing(null);
      load();
    } catch (err: any) {
      toasts.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const pills = [
    { id: 'all', label: 'All', count: stats.total || 0 },
    { id: 'received', label: 'Awaiting refund', count: stats.pendingRefunds || 0, color: ACCENTS.amber },
    { id: 'refunded', label: 'Refunded', color: ACCENTS.success },
  ];

  return (
    <div className="space-y-4">
      {toasts.node}
      <PageHeader
        title="Returns"
        subtitle="Items customers sent back: restock them, record the refund, keep sales correct."
        icon={RotateCcw}
        accent={ACCENTS.rose}
        actions={
          <>
            <Button icon={RefreshCw} onClick={load} disabled={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => openCreate()}>
              New Return
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Returns this month" value={stats.countMonth ?? 0} icon={RotateCcw} color={ACCENTS.rose} loading={loading && !rows.length} />
        <StatCard
          label="Refunded this month"
          value={<Money value={stats.refundedMonth || 0} currency={currency} />}
          icon={Wallet}
          color={ACCENTS.indigo}
          loading={loading && !rows.length}
        />
        <StatCard
          label="Awaiting refund"
          value={stats.pendingRefunds ?? 0}
          icon={Clock}
          color={ACCENTS.amber}
          onClick={() => setStatus('received')}
          loading={loading && !rows.length}
        />
        <StatCard label="Units back in stock" value={stats.restockedUnits ?? 0} icon={PackageCheck} color={ACCENTS.success} loading={loading && !rows.length} />
      </div>

      <Card>
        <Toolbar>
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 w-full">
            <div className="flex-1 min-w-0">
              <FilterPills pills={pills} active={status} onChange={(id) => setStatus(id as any)} />
            </div>
            <SearchInput value={search} onChange={setSearch} placeholder="Return #, order #, name, phone" className="lg:w-72" />
          </div>
        </Toolbar>
      </Card>

      <TableWrap>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <table className="a-table">
            <thead>
              <tr>
                <th>Return</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Reason</th>
                <th style={{ textAlign: 'right' }}>Refund</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <LoadingRows rows={5} cols={7} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={RotateCcw}
                      title="No returns yet"
                      description="Record one with New Return, or from an order's details."
                      action={
                        <Button variant="primary" icon={Plus} onClick={() => openCreate()}>
                          New Return
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="font-semibold ds-num">{row.returnNumber}</div>
                      <div className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                        {row.orderNumber} · {fmtDate(row.createdAt)}
                      </div>
                    </td>
                    <td>
                      <div className="font-medium truncate" style={{ maxWidth: 180 }}>{row.customerName || '—'}</div>
                      <div className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{row.customerPhone}</div>
                    </td>
                    <td style={{ fontSize: 'var(--a-fs-sm)', maxWidth: 260 }}>
                      {row.items.map((line, index) => (
                        <div key={index} className="truncate">
                          {line.quantity} × {line.productName}
                          {line.variationLabel ? ` (${line.variationLabel})` : ''}
                        </div>
                      ))}
                      {!row.restocked && (
                        <span style={{ color: 'var(--a-text-muted)' }}>Not restocked</span>
                      )}
                    </td>
                    <td style={{ fontSize: 'var(--a-fs-sm)' }}>{row.reason || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Money value={row.refundAmount} currency={currency} bold />
                      <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{methodLabel(row.refundMethod)}</div>
                    </td>
                    <td>
                      {row.status === 'refunded' ? (
                        <Badge tone={{ bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)' }}>Refunded</Badge>
                      ) : (
                        <Badge tone={{ bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)' }}>Awaiting refund</Badge>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {row.status === 'received' && (
                          <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => markRefunded(row)}>
                            Refunded
                          </Button>
                        )}
                        <IconButton icon={Eye} label="View" onClick={() => setViewing(row)} />
                        <IconButton icon={Undo2} label="Undo return" tone="danger" onClick={() => setUndoing(row)} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </TableWrap>

      {/* ------------------------------------------------------------ new return */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New Return"
        subtitle="Find the order, choose what came back, then record the refund."
        width="max-w-2xl"
        footer={
          <div className="flex items-center justify-between gap-3 w-full">
            <span className="font-semibold ds-num" style={{ fontSize: 'var(--a-fs-md)' }}>
              {Number(unitsChosen) > 0 ? (
                <>
                  {unitsChosen} item(s) · <Money value={itemsTotal} currency={currency} />
                </>
              ) : (
                ''
              )}
            </span>
            <div className="flex gap-2">
              <Button onClick={() => setCreating(false)}>Cancel</Button>
              <Button variant="primary" icon={RotateCcw} loading={busy} disabled={!found || unitsChosen === 0} onClick={submit}>
                Save Return
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              className="a-field ds-num"
              placeholder="Order number, e.g. ORD-1024"
              value={lookup}
              autoFocus
              onChange={(e) => setLookup(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && findOrder()}
            />
            <Button icon={Search} onClick={() => findOrder()}>
              Find
            </Button>
          </div>
          {lookupError && (
            <p className="ds-error-text" role="alert">
              {lookupError}
            </p>
          )}

          {found && (
            <>
              <div
                className="flex flex-wrap items-center justify-between gap-2 p-3"
                style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', fontSize: 'var(--a-fs-sm)' }}
              >
                <span>
                  <strong className="ds-num">{found.order.orderNumber}</strong> · {found.order.customerName} ·{' '}
                  <span className="ds-num">{found.order.customerPhone}</span>
                </span>
                <span className="capitalize">{String(found.order.orderStatus || '').replace(/_/g, ' ')}</span>
              </div>

              <div className="space-y-2">
                {found.items.map((item) => {
                  const chosen = qty[item.id] || 0;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-2"
                      style={{
                        borderRadius: 'var(--ds-r-md)',
                        border: `1px solid ${chosen > 0 ? 'var(--primary)' : 'var(--a-border)'}`,
                        opacity: item.returnable > 0 ? 1 : 0.55,
                      }}
                    >
                      <Thumb src={item.image} alt={item.productName} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                          {item.productName}
                          {item.variationLabel ? ` (${item.variationLabel})` : ''}
                        </div>
                        <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          Bought {item.quantity} × <Money value={item.unitPrice} currency={currency} />
                          {item.returned > 0 ? ` · ${item.returned} already returned` : ''}
                        </div>
                      </div>
                      {item.returnable > 0 ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <IconButton
                            icon={Minus}
                            size="sm"
                            label="Less"
                            disabled={chosen === 0}
                            onClick={() => setQty({ ...qty, [item.id]: Math.max(0, chosen - 1) })}
                          />
                          <span className="ds-num font-bold w-8 text-center">{chosen}</span>
                          <IconButton
                            icon={Plus}
                            size="sm"
                            label="More"
                            disabled={chosen >= item.returnable}
                            onClick={() => setQty({ ...qty, [item.id]: Math.min(item.returnable, chosen + 1) })}
                          />
                          <button
                            type="button"
                            className="ml-1 cursor-pointer font-semibold"
                            style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--primary-ink, var(--primary))' }}
                            onClick={() => setQty({ ...qty, [item.id]: item.returnable })}
                          >
                            All
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Fully returned</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Reason">
                  <Select
                    value={form.reason}
                    onChange={(value) => setForm({ ...form, reason: value })}
                    options={[{ value: '', label: 'Choose a reason' }, ...reasons.map((r) => ({ value: r, label: r }))]}
                  />
                </Field>
                <Field label="Refund method">
                  <Select value={form.refundMethod} onChange={(value) => setForm({ ...form, refundMethod: value })} options={REFUND_METHODS} />
                </Field>
                {form.refundMethod !== 'none' && (
                  <Field label={`Refund amount (${currency})`} hint="Leave empty to refund the items' price.">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="a-field ds-num"
                      value={form.refundAmount}
                      placeholder={itemsTotal.toFixed(2)}
                      onChange={(e) => setForm({ ...form, refundAmount: e.target.value })}
                    />
                  </Field>
                )}
                <Field label="Note (optional)">
                  <input className="a-field" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Toggle
                  checked={form.restock}
                  onChange={(value) => setForm({ ...form, restock: value })}
                  label="Put items back in stock"
                  description="Turn off for damaged or expired items."
                />
                {form.refundMethod !== 'none' && (
                  <Toggle
                    checked={form.refundNow}
                    onChange={(value) => setForm({ ...form, refundNow: value })}
                    label="Refund paid now"
                    description="Off: the return waits under “Awaiting refund”."
                  />
                )}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ------------------------------------------------------------ view */}
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.returnNumber || ''}
        subtitle={viewing ? `Order ${viewing.orderNumber} · ${fmtDate(viewing.createdAt)}${viewing.createdBy ? ` · by ${viewing.createdBy}` : ''}` : ''}
        footer={
          viewing && (
            <div className="flex justify-between gap-2 w-full">
              <Button variant="danger" icon={Undo2} onClick={() => setUndoing(viewing)}>
                Undo Return
              </Button>
              {viewing.status === 'received' && (
                <Button variant="success" icon={CheckCircle2} onClick={() => markRefunded(viewing)}>
                  Mark Refunded
                </Button>
              )}
            </div>
          )
        }
      >
        {viewing && (
          <div className="space-y-3" style={{ fontSize: 'var(--a-fs-md)' }}>
            <div>
              {viewing.items.map((line, index) => (
                <div key={index} className="flex justify-between gap-3 py-1.5" style={{ borderBottom: '1px solid var(--a-border-soft)' }}>
                  <span>
                    {line.quantity} × {line.productName}
                    {line.variationLabel ? ` (${line.variationLabel})` : ''}
                  </span>
                  <Money value={line.amount} currency={currency} />
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <span>Refund ({methodLabel(viewing.refundMethod)})</span>
              <Money value={viewing.refundAmount} currency={currency} bold />
            </div>
            <div style={{ color: 'var(--a-text-muted)', fontSize: 'var(--a-fs-sm)' }}>
              {viewing.reason ? `Reason: ${viewing.reason}. ` : ''}
              {viewing.restocked ? 'Items were put back in stock.' : 'Items were not restocked.'}
              {viewing.note ? ` Note: ${viewing.note}` : ''}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(undoing)}
        title={`Undo ${undoing?.returnNumber || 'return'}?`}
        message={
          undoing?.restocked
            ? 'The returned items are taken back out of stock and the return is deleted.'
            : 'The return record is deleted.'
        }
        confirmLabel="Undo Return"
        tone="danger"
        busy={busy}
        onConfirm={undo}
        onCancel={() => setUndoing(null)}
      />
    </div>
  );
};
