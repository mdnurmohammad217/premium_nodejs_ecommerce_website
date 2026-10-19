import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  Ban,
  Wallet,
  Repeat,
  Download,
  Eye,
  ShieldOff,
  ShieldCheck,
  Mail,
  Phone,
  MapPin,
  RefreshCw,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import {
  PageHeader,
  StatCard,
  Card,
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
  Drawer,
  ConfirmDialog,
  DetailRow,
  Checkbox,
  BulkBar,
  BulkAction,
  useSelection,
  Money,
  ACCENTS,
  useToasts,
  tint,
  useDebounced,
} from './ui.tsx';
import { AdminCustomerPassword } from './AdminCustomerPassword.tsx';

interface Props {
  currency?: string;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : '—';

const SORTS: Record<string, (a: any, b: any) => number> = {
  spend_desc: (a, b) => Number(b.totalSpent || 0) - Number(a.totalSpent || 0),
  spend_asc: (a, b) => Number(a.totalSpent || 0) - Number(b.totalSpent || 0),
  orders_desc: (a, b) => Number(b.totalOrders || 0) - Number(a.totalOrders || 0),
  newest: (a, b) => Number(b.id || 0) - Number(a.id || 0),
  name_asc: (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
};

/** The initial circle in front of every name, in place of an avatar image */
const Initial: React.FC<{ name?: string | null; size?: number }> = ({ name, size = 34 }) => (
  <span
    className="inline-flex items-center justify-center shrink-0 font-bold"
    style={{
      width: size,
      height: size,
      borderRadius: 'var(--ds-r-full)',
      background: tint(0.12),
      color: 'var(--primary-ink, var(--primary))',
      fontSize: size > 40 ? 'var(--a-fs-lg)' : 'var(--a-fs-md)',
    }}
  >
    {String(name || '?').trim().charAt(0).toUpperCase() || '?'}
  </span>
);

/**
 * Customer directory — search, filter and sort the people who have ordered,
 * open one to read their order history, block or unblock them, and export the
 * whole list. Blocking also blacklists the last device IP the customer ordered
 * from, so the storefront rejects the next attempt.
 */
export const AdminCustomersPage: React.FC<Props> = ({ currency = '৳' }) => {
  const toasts = useToasts();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('spend_desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [detailFor, setDetailFor] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  /** One customer, or the selected ones, waiting for the delete confirmation */
  const [confirmDelete, setConfirmDelete] = useState<any[] | null>(null);

  /* v3.15 — one page at a time from the server (search, filters, sorting and
     the totals run in the database), so the page stays fast with any number
     of customers. */
  const debouncedSearch = useDebounced(search, 300);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, blocked: 0, repeat: 0, spend: 0 });
  const requestNo = React.useRef(0);
  const load = useCallback(async () => {
    const mine = ++requestNo.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), type: typeFilter, status: statusFilter, sort });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      const res = await fetch(`/api/admin/customers/list?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data || data.error || !Array.isArray(data.rows)) throw new Error(data?.error);
      if (mine !== requestNo.current) return;
      setRows(data.rows);
      setTotal(Number(data.total) || 0);
      if (data.stats) setStats(data.stats);
      if (Number(data.page) && Number(data.page) !== page) setPage(Number(data.page));
      setError('');
    } catch {
      if (mine !== requestNo.current) return;
      setError('Could not load customers.');
      toasts.push('Could not load customers.', 'error');
    } finally {
      if (mine === requestNo.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, typeFilter, statusFilter, sort, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = { length: total };
  const paged = rows;
  const selection = useSelection(paged);

  /** Deletes one or many customers; orders stay (only unlinked), ledger customers are kept */
  const removeCustomers = async () => {
    if (!confirmDelete || confirmDelete.length === 0) return;
    setSaving(true);
    let deleted = 0;
    let unlinked = 0;
    const kept: string[] = [];
    for (const customer of confirmDelete) {
      try {
        const res = await fetch(`/api/admin/customers/${customer.id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          kept.push(`${customer.name}: ${data.error || 'could not delete'}`);
          continue;
        }
        deleted += 1;
        unlinked += Number(data.detachedOrders || 0);
      } catch {
        kept.push(`${customer.name}: could not delete`);
      }
    }
    setSaving(false);
    setConfirmDelete(null);
    selection.clear();
    if (deleted > 0) {
      toasts.push(
        `${deleted} customer${deleted === 1 ? '' : 's'} deleted.${unlinked ? (unlinked === 1 ? ' 1 order stays in All Orders.' : ` ${unlinked} orders stay in All Orders.`) : ''}`
      );
    }
    if (kept.length > 0) toasts.push(kept.slice(0, 2).join(' · '), 'error');
    setDetailFor((current: any) => (current && confirmDelete.some((row) => row.id === current.id) && deleted ? null : current));
    load();
  };

  const openDetail = async (customer: any) => {
    setDetailFor(customer);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}/orders`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      toasts.push('Could not load order history.', 'error');
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleBlock = async () => {
    if (!confirmBlock) return;
    const next = confirmBlock.status === 'blocked' ? 'active' : 'blocked';
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/customers/${confirmBlock.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      toasts.push(next === 'blocked' ? 'Customer blocked.' : 'Customer unblocked.');
      setConfirmBlock(null);
      setDetailFor((current: any) =>
        current && current.id === confirmBlock.id ? { ...current, status: next } : current
      );
      load();
    } catch {
      toasts.push('Could not update the status.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = async () => {
    // Served by the API so the export always carries every column and a BOM.
    // Fetched (not opened as a link) so the request carries the sign-in.
    try {
      const res = await fetch('/api/admin/customers/export');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Could not export the customers.');
      }
      const disposition = res.headers.get('Content-Disposition') || '';
      const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] || 'customers.csv';
      const link = URL.createObjectURL(await res.blob());
      const anchor = document.createElement('a');
      anchor.href = link;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(link), 2000);
    } catch (error: any) {
      toasts.push(error?.message || 'Could not export the customers.', 'error');
    }
  };

  /** Totals of the open customer's own order history */
  const historyTotals = useMemo(
    () => ({
      count: history.length,
      value: history.reduce((sum, order) => sum + Number(order.total || 0), 0),
      last: history.length > 0 ? history[0].createdAt : null,
    }),
    [history]
  );

  const columnCount = 8;

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Customers"
        subtitle="Everyone who has ordered from your store, including guests"
        icon={Users}
        actions={
          <>
            <Button icon={RefreshCw} onClick={load} loading={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon={Download} onClick={exportCsv}>
              Export
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Total Customers"
          value={stats.total}
          icon={Users}
          color={ACCENTS.indigo}
          loading={loading}
        />
        <StatCard
          label="Blocked"
          value={stats.blocked}
          icon={Ban}
          color="var(--ds-danger)"
          loading={loading}
          onClick={() => {
            setStatusFilter('blocked');
            setPage(1);
          }}
        />
        <StatCard
          label="Repeat Customers"
          value={stats.repeat}
          icon={Repeat}
          color={ACCENTS.rose}
          loading={loading}
          deltaNote="Placed more than one order"
        />
        <StatCard
          label="Total Spent"
          value={<Money value={stats.spend} currency={currency} />}
          icon={Wallet}
          color={ACCENTS.teal}
          loading={loading}
        />
      </div>

      <Card className="mb-4" padded={false}>
        <Toolbar className="p-3">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search by name, email or phone"
            className="flex-1 min-w-0"
          />

          <FilterPills
            pills={[
              { id: 'all', label: 'All', count: stats.total },
              { id: 'active', label: 'Active', count: stats.active, color: 'var(--ds-success)' },
              { id: 'blocked', label: 'Blocked', count: stats.blocked, color: 'var(--ds-danger)' },
            ]}
            active={statusFilter}
            onChange={(id) => {
              setStatusFilter(id);
              setPage(1);
            }}
          />

          <div className="grid grid-cols-2 lg:flex gap-2 shrink-0">
            <Select
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value);
                setPage(1);
              }}
              className="lg:w-[150px]"
              options={[
                { value: 'all', label: 'All Types' },
                { value: 'registered', label: 'Registered' },
                { value: 'guest', label: 'Guest' },
              ]}
            />
            <Select
              value={sort}
              onChange={setSort}
              className="lg:w-[170px]"
              options={[
                { value: 'spend_desc', label: 'Highest spend first' },
                { value: 'spend_asc', label: 'Lowest spend first' },
                { value: 'orders_desc', label: 'Most orders first' },
                { value: 'newest', label: 'Newest first' },
                { value: 'name_asc', label: 'Name (A–Z)' },
              ]}
            />
          </div>
        </Toolbar>
      </Card>

      <TableWrap>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <Checkbox
                      checked={selection.allSelected}
                      indeterminate={selection.someSelected}
                      onChange={selection.toggleAll}
                      label="Select all customers on this page"
                    />
                  </th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Orders</th>
                  <th style={{ textAlign: 'right' }}>Total Spent</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRows rows={6} cols={columnCount} />
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={columnCount} style={{ padding: 0 }}>
                      <EmptyState
                        title="No customers found"
                        description="Try changing your filters."
                        icon={Users}
                      />
                    </td>
                  </tr>
                ) : (
                  paged.map((row) => {
                    const registered = Boolean(row.email || row.hasPassword || row.passwordHash);
                    const blocked = row.status === 'blocked';
                    return (
                      <tr key={row.id}>
                        <td>
                          <Checkbox checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.name}`} />
                        </td>
                        <td>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Initial name={row.name} />
                            <div className="min-w-0">
                              <div className="font-semibold truncate" style={{ maxWidth: 190 }}>
                                {row.name}
                              </div>
                              <div
                                className="flex items-center gap-2 truncate"
                                style={{
                                  maxWidth: 190,
                                  fontSize: 'var(--a-fs-sm)',
                                  color: 'var(--a-text-muted)',
                                }}
                              >
                                <a href={`tel:${row.phone}`} className="ds-num inline-flex items-center gap-1">
                                  <Phone className="w-3 h-3 shrink-0 opacity-70" />
                                  {row.phone}
                                </a>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge
                            tone={
                              registered
                                ? { bg: tint(0.12), fg: 'var(--primary)' }
                                : { bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)' }
                            }
                          >
                            {registered ? 'Registered' : 'Guest'}
                          </Badge>
                        </td>
                        <td className="ds-num font-semibold" style={{ textAlign: 'right' }}>
                          {Number(row.totalOrders || 0)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Money value={row.totalSpent} currency={currency} bold />
                        </td>
                        <td className="ds-num whitespace-nowrap" style={{ color: 'var(--a-text-muted)' }}>
                          {formatDate(row.createdAt)}
                        </td>
                        <td>
                          <Badge status={row.status || 'active'} dot />
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1.5">
                            <IconButton
                              icon={Eye}
                              size="sm"
                              label={`${row.name} — details`}
                              onClick={() => openDetail(row)}
                            />
                            <IconButton
                              icon={blocked ? ShieldCheck : ShieldOff}
                              size="sm"
                              tone={blocked ? 'success' : 'danger'}
                              label={blocked ? 'Unblock' : 'Block'}
                              onClick={() => setConfirmBlock(row)}
                            />
                            <IconButton
                              icon={Trash2}
                              size="sm"
                              tone="danger"
                              label={`Delete ${row.name}`}
                              onClick={() => setConfirmDelete([row])}
                            />
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
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </TableWrap>

      <Drawer
        open={Boolean(detailFor)}
        onClose={() => setDetailFor(null)}
        title={detailFor?.name || 'Customer'}
        subtitle={detailFor?.phone || ''}
        width="max-w-2xl"
        footer={
          <>
            <Button icon={Download} onClick={exportCsv}>
              Export List
            </Button>
            <Button
              variant={detailFor?.status === 'blocked' ? 'primary' : 'danger'}
              icon={detailFor?.status === 'blocked' ? ShieldCheck : ShieldOff}
              onClick={() => setConfirmBlock(detailFor)}
            >
              {detailFor?.status === 'blocked' ? 'Unblock' : 'Block'}
            </Button>
            <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete([detailFor])}>
              Delete
            </Button>
          </>
        }
      >
        {detailFor && (
          <>
            <div className="flex items-start gap-3 mb-4">
              <Initial name={detailFor.name} size={52} />
              <div className="min-w-0 flex-1">
                <div className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
                  {detailFor.name}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <Badge status={detailFor.status || 'active'} dot />
                  <Badge
                    tone={
                      detailFor.email || detailFor.hasPassword || detailFor.passwordHash
                        ? { bg: tint(0.12), fg: 'var(--primary)' }
                        : { bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)' }
                    }
                  >
                    {detailFor.email || detailFor.hasPassword || detailFor.passwordHash ? 'Registered' : 'Guest'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Lifetime figures as the list row carries them, beside the figures
                computed from the order history that was just fetched. */}
            <div className="grid grid-cols-3 mb-4" style={{ gap: 1, background: 'var(--a-border)' }}>
              {[
                {
                  label: 'Orders',
                  node: <span className="ds-num">{Number(detailFor.totalOrders || 0)}</span>,
                },
                {
                  label: 'Total Spent',
                  node: <Money value={detailFor.totalSpent} currency={currency} />,
                },
                {
                  label: 'Last Order',
                  node: historyLoading ? (
                    <span className="ds-skeleton block h-4 w-16" />
                  ) : (
                    <span className="ds-num">{formatDate(historyTotals.last)}</span>
                  ),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{ padding: 'var(--ds-s-3)', background: 'var(--a-surface)' }}
                >
                  <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{item.label}</div>
                  <div className="font-bold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                    {item.node}
                  </div>
                </div>
              ))}
            </div>

            <Card className="mb-4">
              <DetailRow label="Phone">
                <a href={`tel:${detailFor.phone}`} className="ds-num inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 opacity-60" />
                  {detailFor.phone}
                </a>
              </DetailRow>
              <DetailRow label="Email">
                {detailFor.email ? (
                  <a href={`mailto:${detailFor.email}`} className="inline-flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 opacity-60" />
                    {detailFor.email}
                  </a>
                ) : (
                  <span style={{ color: 'var(--a-text-faint)' }}>—</span>
                )}
              </DetailRow>
              <DetailRow label="Address">
                {detailFor.address ? (
                  <span className="inline-flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 opacity-60 shrink-0" />
                    {detailFor.address}
                  </span>
                ) : (
                  <span style={{ color: 'var(--a-text-faint)' }}>—</span>
                )}
              </DetailRow>
              <DetailRow label="Last Device IP">
                {detailFor.lastIp ? (
                  <span className="ds-num">{detailFor.lastIp}</span>
                ) : (
                  <span style={{ color: 'var(--a-text-faint)' }}>—</span>
                )}
              </DetailRow>
              <DetailRow label="Joined">
                <span className="ds-num">{formatDate(detailFor.createdAt)}</span>
              </DetailRow>
              {detailFor.note && <DetailRow label="Note">{detailFor.note}</DetailRow>}
            </Card>

            <AdminCustomerPassword
              key={detailFor.id}
              customer={detailFor}
              onChanged={() => {
                setDetailFor((current: any) => (current ? { ...current, hasPassword: true } : current));
                setRows((list) => list.map((row) => (row.id === detailFor.id ? { ...row, hasPassword: true } : row)));
              }}
            />

            <div className="flex items-center justify-between gap-3 mb-2">
              <h4 className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                Order History
              </h4>
              {!historyLoading && history.length > 0 && (
                <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                  <span className="ds-num">{historyTotals.count}</span> orders ·{' '}
                  <Money value={historyTotals.value} currency={currency} />
                </span>
              )}
            </div>

            {historyLoading ? (
              <SectionLoader lines={5} />
            ) : history.length === 0 ? (
              <Card>
                <EmptyState
                  title="No orders yet"
                  description="This customer has not placed any orders yet."
                  icon={ShoppingBag}
                />
              </Card>
            ) : (
              <Card padded={false} className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Date</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((order) => (
                        <tr key={order.id}>
                          <td className="font-bold ds-num whitespace-nowrap">{order.orderNumber}</td>
                          <td className="ds-num whitespace-nowrap" style={{ color: 'var(--a-text-muted)' }}>
                            {formatDate(order.createdAt)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Money value={order.total} currency={currency} bold />
                          </td>
                          <td>
                            <Badge status={order.orderStatus} dot />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirmBlock)}
        title={confirmBlock?.status === 'blocked' ? 'Unblock customer?' : 'Block customer?'}
        message={
          confirmBlock?.status === 'blocked'
            ? `${confirmBlock?.name || ''} will be able to order again, and their device IP will be removed from the block list.`
            : `${confirmBlock?.name || ''} will be stopped at checkout, and the device IP they last ordered from will also be blocked.`
        }
        confirmLabel={confirmBlock?.status === 'blocked' ? 'Unblock' : 'Block'}
        tone={confirmBlock?.status === 'blocked' ? 'primary' : 'danger'}
        busy={saving}
        onConfirm={toggleBlock}
        onCancel={() => setConfirmBlock(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={confirmDelete && confirmDelete.length > 1 ? `Delete ${confirmDelete.length} customers?` : 'Delete customer?'}
        message={`${
          confirmDelete && confirmDelete.length > 1 ? `${confirmDelete.length} customers` : `"${confirmDelete?.[0]?.name || ''}"`
        } will be deleted. Their orders are NOT deleted — they stay in All Orders with the name and phone they were placed with. A customer with dues in the customer ledger is kept.`}
        confirmLabel="Delete"
        tone="danger"
        busy={saving}
        onConfirm={removeCustomers}
        onCancel={() => setConfirmDelete(null)}
      />

      <BulkBar count={selection.count} onClear={selection.clear} noun="customers selected">
        <BulkAction
          icon={Trash2}
          tone="danger"
          onClick={() => setConfirmDelete(paged.filter((row) => selection.isSelected(row.id)))}
        >
          Delete
        </BulkAction>
      </BulkBar>
    </div>
  );
};
