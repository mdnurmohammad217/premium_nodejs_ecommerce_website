import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  AlertTriangle,
  PackageX,
  Wallet,
  SlidersHorizontal,
  ScrollText,
  RefreshCw,
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  PageHeader,
  StatCard,
  Card,
  CardHeader,
  Button,
  IconButton,
  Badge,
  FilterPills,
  SearchInput,
  Select,
  Toolbar,
  TableWrap,
  EmptyState,
  ErrorState,
  LoadingRows,
  SectionLoader,
  Pagination,
  Modal,
  Field,
  Thumb,
  Money,
  ACCENTS,
  useToasts,
  useDebounced,
} from './ui.tsx';
import { AdminProductPicker } from './AdminProductPicker.tsx';

interface Props {
  onRefresh?: () => void;
}

const daysUntil = (value?: string | null) => {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
};

/** Stock level of one row, which drives both its colour and its badge */
type Level = 'out' | 'low' | 'in';

const levelOf = (row: any): Level => {
  const threshold = row.lowStockThreshold ?? 10;
  if (Number(row.stock) <= 0) return 'out';
  if (Number(row.stock) <= threshold) return 'low';
  return 'in';
};

const LEVEL_COLOR: Record<Level, string> = {
  out: 'var(--ds-danger)',
  low: 'var(--ds-warning-text)',
  in: 'var(--ds-success-text)',
};

const LEVEL_STATUS: Record<Level, string> = {
  out: 'out_of_stock',
  low: 'low_stock',
  in: 'in_stock',
};

const formatTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Stock Management — an operations screen: the counts that decide what to do
 * next, the stock table with an inline adjustment on every row, and the movement
 * log as a timeline so a correction can be traced back to who made it.
 *
 * Every adjustment goes through /api/admin/inventory/adjust, which writes the
 * inventory transaction that the timeline below reads.
 */
export const AdminInventoryPage: React.FC<Props> = ({ onRefresh }) => {
  const toasts = useToasts();
  const [data, setData] = useState<{ stockList: any[]; recentTransactions: any[] }>({
    stockList: [],
    recentTransactions: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [adjustFor, setAdjustFor] = useState<any | null>(null);
  const [adjustType, setAdjustType] = useState('increase');
  const [adjustQty, setAdjustQty] = useState(10);
  const [adjustReason, setAdjustReason] = useState('');
  const [saving, setSaving] = useState(false);

  /* v3.15 — one page at a time from the server (filter, search and the
     counts run in the database), so it stays fast with 50 000 products */
  const debouncedSearch = useDebounced(search, 300);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, inStock: 0, low: 0, out: 0, expiring: 0, expired: 0, value: 0 });
  const requestNo = React.useRef(0);
  const load = useCallback(async () => {
    const mine = ++requestNo.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter, page: String(page), pageSize: String(pageSize) });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      const res = await fetch(`/api/admin/inventory?${params.toString()}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error);
      if (mine !== requestNo.current) return;
      setData({
        stockList: Array.isArray(body.stockList) ? body.stockList : [],
        recentTransactions: Array.isArray(body.recentTransactions) ? body.recentTransactions : [],
      });
      setTotal(Number(body.total) || 0);
      if (body.stats) setStats(body.stats);
      if (Number(body.page) && Number(body.page) !== page) setPage(Number(body.page));
      setError('');
    } catch {
      if (mine !== requestNo.current) return;
      setError('Could not load inventory.');
      toasts.push('Could not load inventory.', 'error');
    } finally {
      if (mine === requestNo.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page, pageSize, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = { length: total };
  const paged = data.stockList;

  const openAdjust = (row: any, type: string) => {
    setAdjustType(type);
    setAdjustQty(10);
    setAdjustFor(row);
  };

  const refreshAll = () => {
    load();
    onRefresh?.();
  };

  const submitAdjustment = async () => {
    if (!adjustFor) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: adjustFor.id,
          adjustmentType: adjustType,
          quantity: adjustQty,
          reason: adjustReason,
        }),
      });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error || 'failed');
      toasts.push('Stock updated.');
      setAdjustFor(null);
      setAdjustReason('');
      load();
      onRefresh?.();
    } catch (err: any) {
      toasts.push(err.message || 'Could not update stock.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const columnCount = 7;

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Stock Management"
        subtitle="Current stock, low-stock thresholds, expiry dates and adjustment history"
        icon={Boxes}
        actions={
          <>
            <Button icon={RefreshCw} onClick={refreshAll} loading={loading}>
              Refresh
            </Button>
            <Button
              variant="primary"
              icon={SlidersHorizontal}
              onClick={() => openAdjust(data.stockList[0] || null, 'increase')}
              disabled={data.stockList.length === 0}
            >
              Record Adjustment
            </Button>
          </>
        }
      />

      {/* What needs doing today */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Total SKUs"
          value={stats.total}
          icon={Boxes}
          color={ACCENTS.indigo}
          loading={loading}
        />
        <StatCard
          label="Out of Stock"
          value={stats.out}
          icon={PackageX}
          color="var(--ds-danger)"
          loading={loading}
          onClick={() => {
            setFilter('out');
            setPage(1);
          }}
        />
        <StatCard
          label="Low Stock"
          value={stats.low}
          icon={AlertTriangle}
          color={ACCENTS.amber}
          loading={loading}
          onClick={() => {
            setFilter('low');
            setPage(1);
          }}
        />
        <StatCard
          label="Stock Value"
          value={<Money value={stats.value} />}
          icon={Wallet}
          color={ACCENTS.teal}
          loading={loading}
          deltaNote="At cost price"
        />
      </div>

      {/* Filters */}
      <Card className="mb-4" padded={false}>
        <Toolbar className="p-3">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search by product name, SKU or batch number"
            className="flex-1 min-w-0"
          />
          <FilterPills
            pills={[
              { id: 'all', label: 'All', count: stats.total },
              { id: 'in', label: 'In Stock', count: stats.inStock, color: 'var(--ds-success)' },
              { id: 'low', label: 'Low Stock', count: stats.low, color: ACCENTS.amber },
              { id: 'out', label: 'Out of Stock', count: stats.out, color: 'var(--ds-danger)' },
              { id: 'expiring', label: 'Expires ≤ 90 days', count: stats.expiring, color: ACCENTS.violet },
              { id: 'expired', label: 'Expired', count: stats.expired, color: 'var(--ds-danger)' },
            ]}
            active={filter}
            onChange={(id) => {
              setFilter(id);
              setPage(1);
            }}
          />
        </Toolbar>
      </Card>

      {/* Stock table */}
      <TableWrap className="mb-5">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th>Status</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th style={{ textAlign: 'right' }}>Adjust</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRows rows={8} cols={columnCount} />
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={columnCount} style={{ padding: 0 }}>
                      <EmptyState
                        title={
                          filter !== 'all' || search
                            ? 'No products match this filter'
                            : 'No products yet'
                        }
                        description={
                          filter !== 'all' || search ? 'Try changing your filters.' : undefined
                        }
                        icon={Boxes}
                      />
                    </td>
                  </tr>
                ) : (
                  paged.map((row) => {
                    const level = levelOf(row);
                    const threshold = row.lowStockThreshold ?? 10;
                    const days = daysUntil(row.expiryDate);
                    return (
                      <tr key={row.id}>
                        <td>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Thumb src={row.image} alt={row.name} size={38} />
                            <div className="min-w-0">
                              <div className="font-semibold truncate" style={{ maxWidth: 220 }}>
                                {row.name}
                              </div>
                              <div
                                className="ds-num truncate"
                                style={{
                                  maxWidth: 220,
                                  fontSize: 'var(--a-fs-sm)',
                                  color: 'var(--a-text-muted)',
                                }}
                              >
                                {row.sku}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ color: 'var(--a-text-soft)' }}>{row.categoryName || '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div
                            className="font-black ds-num leading-tight"
                            style={{ fontSize: 'var(--a-fs-xl)', color: LEVEL_COLOR[level] }}
                          >
                            {row.stock}
                          </div>
                          <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                            {row.unit || ''} · threshold <span className="ds-num">{threshold}</span>
                          </div>
                        </td>
                        <td>
                          <Badge status={LEVEL_STATUS[level]} dot />
                        </td>
                        <td className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
                          {row.batchNumber || '—'}
                        </td>
                        <td>
                          <span
                            className="ds-num whitespace-nowrap"
                            style={{
                              color:
                                days !== null && days < 0 ? 'var(--ds-danger-text)' : 'var(--a-text-soft)',
                            }}
                          >
                            {row.expiryDate || '—'}
                          </span>
                          {days !== null && days >= 0 && days <= 90 && (
                            <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-warning-text)' }}>
                              <span className="ds-num">{days}</span> days left
                            </div>
                          )}
                          {days !== null && days < 0 && (
                            <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--ds-danger-text)' }}>
                              Expired
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1.5">
                            <IconButton
                              icon={Plus}
                              size="sm"
                              tone="success"
                              label={`${row.name} — increase stock`}
                              onClick={() => openAdjust(row, 'increase')}
                            />
                            <IconButton
                              icon={Minus}
                              size="sm"
                              tone="danger"
                              label={`${row.name} — decrease stock`}
                              onClick={() => openAdjust(row, 'decrease')}
                              disabled={Number(row.stock) <= 0}
                            />
                            <Button size="sm" onClick={() => openAdjust(row, 'increase')}>
                              Adjust
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <Pagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </TableWrap>

      {/* Movement log */}
      <Card padded={false}>
        <div style={{ padding: 'var(--ds-card-pad)', paddingBottom: 0 }}>
          <CardHeader
            title="Recent Stock Movements"
            subtitle="The latest sales, purchases and adjustments"
            icon={ScrollText}
            accent={ACCENTS.violet}
          />
        </div>

        {loading ? (
          <div style={{ padding: 'var(--ds-card-pad)', paddingTop: 0 }}>
            <SectionLoader lines={6} />
          </div>
        ) : data.recentTransactions.length === 0 ? (
          <EmptyState
            title="No stock movements yet"
            description="Every stock increase or decrease will be logged here."
            icon={ScrollText}
          />
        ) : (
          <ol style={{ padding: 'var(--ds-s-2) var(--ds-card-pad) var(--ds-card-pad)' }}>
            {data.recentTransactions.map((row, index) => {
              const up = Number(row.quantity) >= 0;
              const last = index === data.recentTransactions.length - 1;
              return (
                <li key={row.id} className="flex gap-3">
                  {/* Rail: the marker plus the line that joins it to the next entry */}
                  <div className="flex flex-col items-center shrink-0">
                    <span
                      className="inline-flex items-center justify-center"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--ds-r-full)',
                        background: up ? 'var(--ds-success-soft)' : 'var(--ds-danger-soft)',
                        color: up ? 'var(--ds-success-text)' : 'var(--ds-danger-text)',
                      }}
                    >
                      {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    </span>
                    {!last && <span className="flex-1 w-px my-1" style={{ background: 'var(--a-border)' }} />}
                  </div>

                  <div className={`min-w-0 flex-1 ${last ? '' : 'pb-4'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                          {row.productName || `SKU ${row.sku || row.productId}`}
                        </div>
                        <div
                          className="flex items-center gap-2 flex-wrap mt-0.5"
                          style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                        >
                          <Badge tone={{ bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)' }}>
                            {row.type}
                          </Badge>
                          <span className="ds-num">
                            {row.previousStock} → {row.newStock}
                          </span>
                          {row.reference && <span className="truncate">{row.reference}</span>}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className="font-black ds-num leading-tight"
                          style={{
                            fontSize: 'var(--a-fs-lg)',
                            color: up ? 'var(--ds-success-text)' : 'var(--ds-danger-text)',
                          }}
                        >
                          {up ? `+${row.quantity}` : row.quantity}
                        </div>
                        <div
                          className="ds-num whitespace-nowrap"
                          style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-faint)' }}
                        >
                          {formatTime(row.createdAt)}
                        </div>
                      </div>
                    </div>

                    {row.performedBy && (
                      <div className="mt-0.5" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-faint)' }}>
                        {row.performedBy}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Modal
        open={Boolean(adjustFor)}
        onClose={() => setAdjustFor(null)}
        title="Stock Adjustment"
        subtitle={adjustFor?.name}
        footer={
          <>
            <Button onClick={() => setAdjustFor(null)}>Cancel</Button>
            <Button variant="primary" onClick={submitAdjustment} loading={saving} disabled={!adjustFor}>
              Apply Adjustment
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Product">
            {/* v3.15 — search any product (the old list held only what was loaded) */}
            <AdminProductPicker
              placeholder={adjustFor ? `${adjustFor.name} (stock ${adjustFor.stock}) — type to change` : 'Type a product name, SKU or barcode'}
              onPick={(product) => setAdjustFor(product)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select
                value={adjustType}
                onChange={setAdjustType}
                options={[
                  { value: 'increase', label: 'Increase (+)' },
                  { value: 'decrease', label: 'Decrease (−)' },
                  { value: 'damage', label: 'Damaged (−)' },
                  { value: 'expired', label: 'Expired (−)' },
                ]}
              />
            </Field>
            <Field label="Quantity">
              <input
                type="number"
                min={1}
                className="a-field ds-num"
                value={adjustQty}
                onChange={(event) => setAdjustQty(Number(event.target.value))}
              />
            </Field>
          </div>

          {adjustFor && (
            <div
              className="flex items-center justify-between gap-3"
              style={{
                padding: 'var(--ds-s-3)',
                borderRadius: 'var(--ds-r-md)',
                background: 'var(--a-surface-2)',
                border: '1px solid var(--a-border)',
              }}
            >
              <span style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
                Stock after adjustment
              </span>
              <span className="font-bold ds-num" style={{ fontSize: 'var(--a-fs-lg)' }}>
                {Number(adjustFor.stock || 0)}
                {' → '}
                {Math.max(
                  0,
                  Number(adjustFor.stock || 0) +
                    (adjustType === 'increase' ? Math.abs(adjustQty) : -Math.abs(adjustQty))
                )}
              </span>
            </div>
          )}

          <Field label="Reason" hint="Saved to the movement log for the audit trail">
            <input
              className="a-field"
              value={adjustReason}
              onChange={(event) => setAdjustReason(event.target.value)}
              placeholder="e.g. Stock count correction"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
};
