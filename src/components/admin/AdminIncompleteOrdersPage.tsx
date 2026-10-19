import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShoppingCart,
  Phone,
  MessageCircle,
  Trash2,
  MapPin,
  Clock,
  Wallet,
  PackageX,
  RefreshCw,
  TrendingDown,
  Users,
  Eye,
  ShoppingBag,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import {
  Badge,
  BulkAction,
  BulkBar,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  DetailRow,
  Drawer,
  EmptyState,
  ErrorState,
  FilterPills,
  IconButton,
  LoadingRows,
  Money,
  PageHeader,
  SearchInput,
  StatCard,
  TableWrap,
  Thumb,
  Toolbar,
  useSelection,
  useToasts,
  Modal,
  Field,
  Select,
} from './ui.tsx';

/**
 * Incomplete Orders — abandoned checkouts.
 *
 * This page is deliberately NOT a filtered view of the order list. It shows
 * people who typed their details into checkout and then left without placing
 * the order: there is no order row for them anywhere, so until now that demand
 * was invisible. Each entry carries the cart they had, what it was worth and how
 * to reach them, so the shop can call or message and recover the sale.
 *
 * An entry disappears by itself the moment that visitor does place an order —
 * the order endpoint marks it recovered.
 */

interface IncompleteRow {
  id: number;
  sessionKey: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  shippingZone: string | null;
  paymentMethod: string | null;
  items: string | CartLine[] | null;
  itemCount: number | null;
  cartTotal: string | number | null;
  ipAddress: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
}

interface CartLine {
  productId?: number;
  name?: string;
  productName?: string;
  image?: string;
  quantity?: number;
  price?: number;
  unitPrice?: number;
  variationLabel?: string;
}

const relativeTime = (value?: string | null): string => {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
};

/** The API sends the cart as a list (with product photos filled in); older rows may be JSON text */
const parseItems = (raw?: string | CartLine[] | null): CartLine[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const AdminIncompleteOrdersPage: React.FC<{ currency?: string }> = ({ currency = '৳' }) => {
  const [rows, setRows] = useState<IncompleteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState('all');
  const [detail, setDetail] = useState<IncompleteRow | null>(null);
  const [confirm, setConfirm] = useState<{ ids: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const toasts = useToasts();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/incomplete-orders');
      if (!res.ok) throw new Error('Could not load.');
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load incomplete orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const cutoff =
      range === '24h'
        ? Date.now() - 86_400_000
        : range === '7d'
        ? Date.now() - 7 * 86_400_000
        : range === '30d'
        ? Date.now() - 30 * 86_400_000
        : 0;

    return rows.filter((row) => {
      if (cutoff) {
        const at = new Date(row.updatedAt || row.createdAt || 0).getTime();
        if (!at || at < cutoff) return false;
      }
      if (!term) return true;
      return [row.customerName, row.customerPhone, row.customerAddress, row.ipAddress]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [rows, search, range]);

  const selection = useSelection(filtered);

  const totals = useMemo(() => {
    const value = rows.reduce((sum, row) => sum + Number(row.cartTotal || 0), 0);
    const withPhone = rows.filter((row) => (row.customerPhone || '').trim().length > 0).length;
    const last24 = rows.filter((row) => {
      const at = new Date(row.updatedAt || row.createdAt || 0).getTime();
      return at && Date.now() - at < 86_400_000;
    }).length;
    return { count: rows.length, value, withPhone, last24 };
  }, [rows]);

  const remove = async (ids: number[]) => {
    setBusy(true);
    let removed = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/admin/incomplete-orders/${id}`, {
          method: 'DELETE',
        });
        if (res.ok) removed += 1;
      } catch {
        /* counted as not removed */
      }
    }
    setRows((current) => current.filter((row) => !ids.includes(row.id)));
    selection.clear();
    setConfirm(null);
    setBusy(false);
    setDetail(null);
    toasts.push(
      removed === ids.length
        ? `${removed} ${removed === 1 ? 'entry' : 'entries'} deleted.`
        : `Only ${removed} of ${ids.length} entries were deleted.`,
      removed === ids.length ? 'success' : 'error'
    );
  };

  /* ------------------------------------------------ convert to a real order */
  const [converting, setConverting] = useState<IncompleteRow | null>(null);
  const [convertDraft, setConvertDraft] = useState<{
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    note: string;
    items: Array<CartLine & { variationId?: number; choice?: string }>;
  } | null>(null);
  const [needChoice, setNeedChoice] = useState<Record<number, Array<{ id: number; label: string; stock: number }>>>({});
  const [convertError, setConvertError] = useState('');

  const openConvert = (row: IncompleteRow) => {
    setConverting(row);
    setNeedChoice({});
    setConvertError('');
    setConvertDraft({
      customerName: row.customerName || '',
      customerPhone: row.customerPhone || '',
      customerAddress: row.customerAddress || '',
      note: '',
      items: parseItems(row.items).map((line: any) => ({ ...line })),
    });
  };

  const submitConvert = async () => {
    if (!converting || !convertDraft) return;
    setBusy(true);
    setConvertError('');
    try {
      const res = await fetch(`/api/admin/incomplete-orders/${converting.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: convertDraft.customerName,
          customerPhone: convertDraft.customerPhone,
          customerAddress: convertDraft.customerAddress,
          note: convertDraft.note,
          items: convertDraft.items
            .filter((line) => Number(line.quantity) > 0)
            .map((line: any) => ({
              productId: line.productId,
              variationId: Number(line.choice || line.variationId) || undefined,
              variationLabel: line.variationLabel,
              quantity: Number(line.quantity),
            })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 422 && Array.isArray(data.needChoice)) {
        const map: Record<number, any[]> = {};
        data.needChoice.forEach((entry: any) => (map[entry.index] = entry.options));
        setNeedChoice(map);
        setConvertError(data.error);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Could not create the order.');
      toasts.push(`Order ${data.order.orderNumber} created from this checkout.`);
      setConverting(null);
      setConvertDraft(null);
      setDetail(null);
      load();
    } catch (error: any) {
      setConvertError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const callLink = (phone?: string | null) => (phone ? `tel:${phone}` : undefined);
  const waLink = (row: IncompleteRow) => {
    const digits = String(row.customerPhone || '').replace(/\D/g, '');
    if (!digits) return undefined;
    const text = encodeURIComponent(
      `Hi${row.customerName ? ` ${row.customerName}` : ''}, you left a few items in your cart. Need a hand completing your order? We're happy to help.`
    );
    return `https://wa.me/${digits.length > 11 ? digits : `88${digits}`}?text=${text}`;
  };

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Incomplete Orders"
        subtitle="Customers who entered their details at checkout but did not place the order — call them to win back the sale"
        icon={PackageX}
        accent="var(--ds-amber)"
        actions={
          <Button icon={RefreshCw} onClick={load} loading={loading}>
            Refresh
          </Button>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Incomplete Checkouts"
          value={totals.count}
          icon={ShoppingCart}
          color="var(--ds-amber)"
          loading={loading}
        />
        <StatCard
          label="Potential Lost Sales"
          value={<Money value={totals.value} currency={currency} />}
          icon={TrendingDown}
          color="var(--ds-rose)"
          loading={loading}
        />
        <StatCard
          label="With Phone Number"
          value={totals.withPhone}
          icon={Users}
          color="var(--ds-teal)"
          loading={loading}
        />
        <StatCard
          label="Last 24 Hours"
          value={totals.last24}
          icon={Clock}
          color="var(--ds-indigo)"
          loading={loading}
        />
      </div>

      {/* Filters */}
      <Toolbar className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, phone, address or IP"
          className="lg:w-80"
        />
        <FilterPills
          pills={[
            { id: 'all', label: 'All', count: rows.length },
            { id: '24h', label: '24 Hours' },
            { id: '7d', label: '7 Days' },
            { id: '30d', label: '30 Days' },
          ]}
          active={range}
          onChange={setRange}
        />
      </Toolbar>

      {/* Table */}
      <TableWrap>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 44 }}>
                  <Checkbox
                    checked={selection.allSelected}
                    indeterminate={selection.someSelected}
                    onChange={selection.toggleAll}
                    label="Select all"
                  />
                </th>
                <th>Customer</th>
                <th>Cart</th>
                <th style={{ textAlign: 'right' }}>Value</th>
                <th>Address</th>
                <th>Time</th>
                <th style={{ width: 150, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRows rows={6} cols={7} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 0 }}>
                    <EmptyState
                      title={rows.length === 0 ? 'No incomplete orders' : 'Nothing matches this filter'}
                      description={
                        rows.length === 0
                          ? 'When someone enters their details at checkout and leaves, they will appear here.'
                          : 'Try a different time range or name.'
                      }
                      icon={PackageX}
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const lines = parseItems(row.items);
                  const picked = selection.isSelected(row.id);
                  return (
                    <tr key={row.id} data-selected={picked || undefined}>
                      <td>
                        <Checkbox
                          checked={picked}
                          onChange={() => selection.toggle(row.id)}
                          label={`Select ${row.customerName || row.id}`}
                        />
                      </td>

                      <td>
                        <button
                          onClick={() => setDetail(row)}
                          className="text-left cursor-pointer"
                          style={{ color: 'inherit' }}
                        >
                          <span className="block font-semibold truncate" style={{ maxWidth: 200 }}>
                            {row.customerName || 'No name given'}
                          </span>
                          <span
                            className="block ds-num"
                            style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                          >
                            {row.customerPhone || '—'}
                          </span>
                        </button>
                      </td>

                      <td>
                        <div className="flex items-center gap-1.5">
                          {lines.slice(0, 3).map((line, index) => (
                            <Thumb
                              key={index}
                              src={line.image}
                              alt={line.name || line.productName || 'Item'}
                              size={30}
                            />
                          ))}
                          <span
                            className="ds-num"
                            style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                          >
                            {row.itemCount || lines.length} items
                            {lines.length > 3 ? ` (+${lines.length - 3})` : ''}
                          </span>
                        </div>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <Money value={row.cartTotal} currency={currency} bold />
                      </td>

                      <td>
                        <span
                          className="block truncate"
                          style={{ maxWidth: 190, fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}
                        >
                          {row.customerAddress || '—'}
                        </span>
                        {row.shippingZone && (
                          <Badge tone={{ bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)' }}>
                            {row.shippingZone}
                          </Badge>
                        )}
                      </td>

                      <td style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                        {relativeTime(row.updatedAt || row.createdAt)}
                      </td>

                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          {callLink(row.customerPhone) && (
                            <a href={callLink(row.customerPhone)} title="Call">
                              <IconButton icon={Phone} tone="primary" label="Call" size="sm" />
                            </a>
                          )}
                          {waLink(row) && (
                            <a href={waLink(row)} target="_blank" rel="noreferrer" title="WhatsApp">
                              <IconButton icon={MessageCircle} tone="success" label="WhatsApp" size="sm" />
                            </a>
                          )}
                          <IconButton icon={Eye} size="sm" label="View products" onClick={() => setDetail(row)} />
                          <IconButton
                            icon={ShoppingBag}
                            tone="primary"
                            size="sm"
                            label="Convert to order"
                            onClick={() => openConvert(row)}
                          />
                          <IconButton
                            icon={Trash2}
                            tone="danger"
                            size="sm"
                            label="Delete"
                            onClick={() => setConfirm({ ids: [row.id] })}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </TableWrap>

      {/* Bulk */}
      <BulkBar count={selection.count} onClear={selection.clear}>
        <BulkAction
          icon={Trash2}
          tone="danger"
          onClick={() => setConfirm({ ids: selection.selected })}
        >
          Delete
        </BulkAction>
      </BulkBar>

      {/* Detail */}
      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.customerName || 'Incomplete Checkout'}
        subtitle={detail ? relativeTime(detail.updatedAt || detail.createdAt) : undefined}
        footer={
          detail ? (
            <>
              {waLink(detail) && (
                <a href={waLink(detail)} target="_blank" rel="noreferrer">
                  <Button icon={MessageCircle} variant="success">
                    WhatsApp
                  </Button>
                </a>
              )}
              {callLink(detail.customerPhone) && (
                <a href={callLink(detail.customerPhone)}>
                  <Button icon={Phone} variant="primary">
                    Call
                  </Button>
                </a>
              )}
            </>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-4">
            <Card>
              <DetailRow label="Phone">{detail.customerPhone || '—'}</DetailRow>
              <DetailRow label="Address">{detail.customerAddress || '—'}</DetailRow>
              <DetailRow label="Delivery Zone">{detail.shippingZone || '—'}</DetailRow>
              <DetailRow label="Payment Method">
                {detail.paymentMethod ? detail.paymentMethod.toUpperCase() : '—'}
              </DetailRow>
              <DetailRow label="IP">
                <span className="ds-num">{detail.ipAddress || '—'}</span>
              </DetailRow>
            </Card>

            <Card padded={false}>
              <div
                className="px-4 py-3 font-bold flex items-center gap-2"
                style={{ borderBottom: '1px solid var(--a-border)', fontSize: 'var(--a-fs-md)' }}
              >
                <ShoppingCart className="w-4 h-4" style={{ color: 'var(--primary-ink, var(--primary))' }} />
                Cart Items
              </div>

              {parseItems(detail.items).length === 0 ? (
                <p className="p-4" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
                  The cart contents were not saved.
                </p>
              ) : (
                <div>
                  {parseItems(detail.items).map((line, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ borderBottom: '1px solid var(--a-border-soft)' }}
                    >
                      <Thumb src={line.image} alt={line.name || line.productName || 'Item'} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                          {line.name || line.productName || 'Product'}
                        </div>
                        <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          <Money value={line.price ?? line.unitPrice} currency={currency} /> ×{' '}
                          {line.quantity || 1}
                          {line.variationLabel ? ` · ${line.variationLabel}` : ''}
                        </div>
                      </div>
                      <Money
                        value={Number(line.price ?? line.unitPrice ?? 0) * Number(line.quantity || 1)}
                        currency={currency}
                        bold
                      />
                    </div>
                  ))}
                </div>
              )}

              <div
                className="flex items-center justify-between px-4 py-3 font-bold"
                style={{ background: 'var(--a-surface-2)', fontSize: 'var(--a-fs-lg)' }}
              >
                <span className="flex items-center gap-2">
                  <Wallet className="w-4 h-4" style={{ color: 'var(--a-text-muted)' }} />
                  Cart Value
                </span>
                <Money value={detail.cartTotal} currency={currency} bold />
              </div>
            </Card>

            <Button icon={ShoppingBag} variant="primary" block onClick={() => openConvert(detail)}>
              Convert to Order
            </Button>
            <Button
              icon={Trash2}
              variant="danger"
              block
              onClick={() => setConfirm({ ids: [detail.id] })}
            >
              Delete This Entry
            </Button>
          </div>
        )}
      </Drawer>

      {/* Convert an incomplete checkout into a real order */}
      <Modal
        open={Boolean(converting && convertDraft)}
        onClose={() => {
          setConverting(null);
          setConvertDraft(null);
        }}
        title="Convert to Order"
        subtitle="Check the details with the customer, then place the order. Stock, prices and delivery charge are applied like a website order."
        width="max-w-2xl"
        footer={
          <div className="flex items-center justify-between gap-3 w-full">
            <span className="ds-num font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
              {convertDraft
                ? `${convertDraft.items.reduce((sum, line) => sum + Number(line.quantity || 0), 0)} item(s)`
                : ''}
            </span>
            <div className="flex gap-2">
              <Button onClick={() => setConverting(null)}>Cancel</Button>
              <Button variant="primary" icon={ShoppingBag} loading={busy} onClick={submitConvert}>
                Place Order
              </Button>
            </div>
          </div>
        }
      >
        {convertDraft && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Customer Name" required>
                <input
                  className="a-field"
                  value={convertDraft.customerName}
                  onChange={(e) => setConvertDraft({ ...convertDraft, customerName: e.target.value })}
                />
              </Field>
              <Field label="Phone" required>
                <input
                  className="a-field ds-num"
                  inputMode="tel"
                  value={convertDraft.customerPhone}
                  onChange={(e) => setConvertDraft({ ...convertDraft, customerPhone: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Delivery Address" required>
              <textarea
                className="a-field"
                rows={2}
                value={convertDraft.customerAddress}
                onChange={(e) => setConvertDraft({ ...convertDraft, customerAddress: e.target.value })}
              />
            </Field>

            <div className="space-y-2">
              <p className="font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                Products
              </p>
              {convertDraft.items.map((line: any, index) => {
                const options = needChoice[index];
                return (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-2"
                    style={{
                      borderRadius: 'var(--ds-r-md)',
                      border: `1px solid ${options ? 'var(--ds-warning)' : 'var(--a-border)'}`,
                      background: options ? 'var(--ds-warning-soft)' : 'var(--a-surface)',
                      opacity: Number(line.quantity) > 0 ? 1 : 0.5,
                    }}
                  >
                    <Thumb src={line.image} alt={line.name || 'Item'} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {line.name || line.productName}
                      </div>
                      {options ? (
                        <Select
                          value={String(line.choice || '')}
                          onChange={(value) => {
                            const items = [...convertDraft.items];
                            items[index] = { ...items[index], choice: value };
                            setConvertDraft({ ...convertDraft, items });
                          }}
                          options={[
                            { value: '', label: 'Choose option…' },
                            ...options.map((option) => ({
                              value: String(option.id),
                              label: `${option.label} (${option.stock} in stock)`,
                            })),
                          ]}
                        />
                      ) : (
                        <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          {line.variationLabel ? `${line.variationLabel} · ` : ''}
                          <Money value={line.price} currency={currency} /> each
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <IconButton
                        icon={Minus}
                        size="sm"
                        label="Less"
                        onClick={() => {
                          const items = [...convertDraft.items];
                          items[index] = { ...items[index], quantity: Math.max(0, Number(items[index].quantity) - 1) };
                          setConvertDraft({ ...convertDraft, items });
                        }}
                      />
                      <span className="ds-num font-bold w-8 text-center">{line.quantity}</span>
                      <IconButton
                        icon={Plus}
                        size="sm"
                        label="More"
                        onClick={() => {
                          const items = [...convertDraft.items];
                          items[index] = { ...items[index], quantity: Number(items[index].quantity) + 1 };
                          setConvertDraft({ ...convertDraft, items });
                        }}
                      />
                      <IconButton
                        icon={X}
                        size="sm"
                        tone="danger"
                        label="Remove"
                        onClick={() => {
                          const items = [...convertDraft.items];
                          items[index] = { ...items[index], quantity: 0 };
                          setConvertDraft({ ...convertDraft, items });
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <Field label="Note on the order (optional)">
              <input
                className="a-field"
                value={convertDraft.note}
                placeholder="e.g. Confirmed on the phone, deliver after 5pm"
                onChange={(e) => setConvertDraft({ ...convertDraft, note: e.target.value })}
              />
            </Field>

            {convertError && (
              <p
                role="alert"
                className="p-3"
                style={{
                  borderRadius: 'var(--ds-r-md)',
                  background: 'var(--ds-danger-soft)',
                  color: 'var(--ds-danger-text)',
                  fontSize: 'var(--a-fs-sm)',
                }}
              >
                {convertError}
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Confirm deletion"
        message={
          confirm && confirm.ids.length > 1
            ? `${confirm.ids.length} incomplete checkouts will be deleted. This cannot be undone.`
            : 'This incomplete checkout will be deleted. This cannot be undone.'
        }
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => confirm && remove(confirm.ids)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};
