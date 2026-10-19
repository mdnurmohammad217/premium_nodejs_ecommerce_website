import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TrendingUp,
  Store,
  RefreshCw,
  Download,
  Printer,
  ShoppingBag,
  Package,
  Receipt,
  Wallet,
  Truck,
  BadgePercent,
  PiggyBank,
  Undo2,
  XCircle,
  Clock,
  Users,
  CreditCard,
  MapPin,
  Megaphone,
  Trophy,
  Layers,
  Search,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  PageHeader,
  StatCard,
  Card,
  CardHeader,
  Button,
  Badge,
  FilterPills,
  Select,
  Field,
  TableWrap,
  EmptyState,
  ErrorState,
  SectionLoader,
  Pagination,
  Money,
  useToasts,
} from './ui.tsx';
import { printElement } from '../../lib/printDocument.ts';

type Channel = 'online' | 'pos';

interface Props {
  channel: Channel;
  currency?: string;
  storeName?: string;
}

/* ------------------------------------------------------------------ dates */
const pad = (value: number) => String(value).padStart(2, '0');
const localDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const shift = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDay(date);
};

const PRESETS: Array<{ id: string; label: string; range: () => [string, string] }> = [
  { id: 'today', label: 'Today', range: () => [shift(0), shift(0)] },
  { id: 'yesterday', label: 'Yesterday', range: () => [shift(-1), shift(-1)] },
  { id: '7d', label: 'Last 7 days', range: () => [shift(-6), shift(0)] },
  { id: '30d', label: 'Last 30 days', range: () => [shift(-29), shift(0)] },
  {
    id: 'month',
    label: 'This month',
    range: () => {
      const now = new Date();
      return [localDay(new Date(now.getFullYear(), now.getMonth(), 1)), shift(0)];
    },
  },
  {
    id: 'last-month',
    label: 'Last month',
    range: () => {
      const now = new Date();
      return [localDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)), localDay(new Date(now.getFullYear(), now.getMonth(), 0))];
    },
  },
  {
    id: 'year',
    label: 'This year',
    range: () => [`${new Date().getFullYear()}-01-01`, shift(0)],
  },
  { id: 'custom', label: 'Custom', range: () => [shift(-29), shift(0)] },
];

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  on_hold: 'On Hold',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  partially_returned: 'Partly Returned',
  returned: 'Returned',
};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const periodLabel = (key: string, group: string) => {
  if (group === 'month') {
    const [year, month] = key.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }
  const date = new Date(`${key}T12:00:00`);
  const text = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return group === 'week' ? `Week of ${text}` : text;
};
const hourLabel = (hour: number) => `${((hour + 11) % 12) + 1}${hour < 12 ? 'am' : 'pm'}`;

/* ---------------------------------------------------------------- helpers */
const fmtMoney = (value: number, currency: string) =>
  `${currency}${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const compact = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 10_000 ? `${Math.round(value / 1000)}K` : value.toLocaleString('en-US');

const ChartTip: React.FC<any> = ({ active, payload, currency, group, hours }) => {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const row = payload[0].payload || {};
  const title = hours ? `${hourLabel(row.hour)} – ${hourLabel((row.hour + 1) % 24)}` : periodLabel(row.key, group);
  return (
    <div
      style={{
        minWidth: 170,
        padding: 'var(--ds-s-3)',
        background: 'var(--ds-surface)',
        border: '1px solid var(--ds-border)',
        borderRadius: 'var(--ds-r-md)',
        boxShadow: 'var(--ds-shadow-lg)',
        fontSize: 'var(--a-fs-md)',
      }}
    >
      <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)', marginBottom: 4 }}>{title}</div>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--a-text-soft)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--primary)' }} /> Sales
        </span>
        <strong className="ds-num">{fmtMoney(row.sales, currency)}</strong>
      </div>
      <div className="flex items-center justify-between gap-3" style={{ color: 'var(--a-text-soft)' }}>
        <span>{hours ? 'Sales count' : 'Orders'}</span>
        <span className="ds-num font-semibold" style={{ color: 'var(--a-text)' }}>
          {row.orders}
        </span>
      </div>
      {!hours && row.items != null && (
        <div className="flex items-center justify-between gap-3" style={{ color: 'var(--a-text-soft)' }}>
          <span>Items</span>
          <span className="ds-num font-semibold" style={{ color: 'var(--a-text)' }}>
            {row.items}
          </span>
        </div>
      )}
    </div>
  );
};

/** A ranked list with a thin share bar — payment methods, cashiers, zones… */
const ShareList: React.FC<{
  rows: Array<{ key: string; label?: string; count: number; amount: number }>;
  currency: string;
  countLabel: string;
  empty: string;
}> = ({ rows, currency, countLabel, empty }) => {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  if (rows.length === 0) return <p style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.slice(0, 8).map((row) => {
        const share = total > 0 ? (row.amount / total) * 100 : 0;
        return (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3" style={{ fontSize: 'var(--a-fs-md)' }}>
              <span className="font-semibold truncate min-w-0">{row.label || row.key}</span>
              <span className="ds-num font-bold shrink-0">{fmtMoney(row.amount, currency)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--a-surface-2)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, share)}%`, background: 'var(--primary)' }} />
              </div>
              <span className="ds-num shrink-0" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)', minWidth: 110, textAlign: 'right' }}>
                {row.count} {countLabel} · {share.toFixed(share < 10 ? 1 : 0)}%
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/**
 * Reports → Sales Report (website orders) and POS Sales Report (counter
 * sales): the chosen period's figures, the trend, how customers paid, what
 * sold, and every order behind the numbers — exportable and printable.
 */
export const AdminSalesReportPage: React.FC<Props> = ({ channel, currency = '৳', storeName = '' }) => {
  const toasts = useToasts();
  const pos = channel === 'pos';
  const [preset, setPreset] = useState('30d');
  const [[from, to], setRange] = useState<[string, string]>(() => PRESETS[3].range());
  const [group, setGroup] = useState('day');
  const [status, setStatus] = useState('sales');
  const [method, setMethod] = useState('');
  const [cashier, setCashier] = useState('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ channel, from, to, group, status });
      if (method) params.set('method', method);
      if (cashier) params.set('cashier', cashier);
      const res = await fetch(`/api/admin/reports/sales?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Could not load the report.');
      setData(body);
      setPage(1);
    } catch (err: any) {
      setError(err?.message || 'Could not load the report.');
    } finally {
      setLoading(false);
    }
  }, [channel, from, to, group, status, method, cashier]);

  useEffect(() => {
    load();
  }, [load]);

  // A long period reads better by week or month
  useEffect(() => {
    const days = Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000) + 1;
    if (days > 120 && group === 'day') setGroup('month');
    else if (days <= 31 && group === 'month') setGroup('day');
  }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const choosePreset = (id: string) => {
    setPreset(id);
    if (id !== 'custom') setRange(PRESETS.find((item) => item.id === id)!.range());
  };

  const summary = data?.summary || {};
  const prev = data?.previous || {};
  const delta = (current: number, before: number) => {
    if (!before) return undefined;
    const change = ((current - before) / before) * 100;
    return { text: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`, up: change >= 0 };
  };
  const salesDelta = delta(Number(summary.netSales || 0), Number(prev.netSales || 0));
  const ordersDelta = delta(Number(summary.orders || 0), Number(prev.orders || 0));

  const orders: any[] = data?.orders || [];
  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((row) => `${row.orderNumber} ${row.customerName} ${row.customerPhone} ${row.cashier}`.toLowerCase().includes(term));
  }, [orders, search]);
  const pagedOrders = filteredOrders.slice((page - 1) * pageSize, page * pageSize);

  const bestPeriod = useMemo(() => {
    const series: any[] = data?.series || [];
    return series.reduce((best, row) => (!best || row.sales > best.sales ? row : best), null as any);
  }, [data]);
  const busiestHour = useMemo(() => {
    const hours: any[] = data?.hours || [];
    return hours.reduce((best, row) => (!best || row.orders > best.orders ? row : best), null as any);
  }, [data]);

  /* ----------------------------------------------------------- exporting */
  const downloadCsv = (name: string, header: string[], rows: any[][]) => {
    const esc = (value: any) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = '﻿' + [header, ...rows].map((row) => row.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportOrders = () => {
    if (!data) return;
    downloadCsv(
      `${pos ? 'pos-sales' : 'sales'}-report-${from}-to-${to}.csv`,
      ['Order', 'Date', 'Time', 'Customer', 'Phone', 'Items', 'Payment', 'Payment status', 'Order status', 'Subtotal', 'Discount', pos ? 'VAT' : 'Delivery', 'Total', pos ? 'Cashier' : 'Delivery area', pos ? '' : 'Landing page'],
      orders.map((row) => {
        const date = new Date(row.createdAt);
        return [
          row.orderNumber,
          row.day,
          date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          row.customerName,
          row.customerPhone,
          row.items,
          row.paymentLabel,
          row.paymentStatus,
          STATUS_LABEL[row.orderStatus] || row.orderStatus,
          row.subtotal,
          row.discount,
          pos ? row.tax : row.delivery,
          row.total,
          pos ? row.cashier : row.zone,
          pos ? '' : row.landing,
        ];
      })
    );
    if (data.truncated) toasts.push('The first 3,000 orders were exported. Choose a shorter period for the rest.', 'warning');
  };

  const exportProducts = () => {
    if (!data) return;
    downloadCsv(
      `${pos ? 'pos-' : ''}product-sales-${from}-to-${to}.csv`,
      ['Product', 'Option', 'Quantity', 'Revenue', 'Cost (est.)', 'Profit (est.)'],
      (data.products || []).map((row: any) => [row.name, row.variation, row.qty, row.revenue, row.cost, row.profit ?? ''])
    );
  };

  const print = async () => {
    if (!printRef.current) return;
    await printElement(printRef.current, `${pos ? 'POS Sales Report' : 'Sales Report'} ${from} – ${to}`);
  };

  /* ---------------------------------------------------------------- view */
  const title = pos ? 'POS Sales Report' : 'Sales Report';
  const subtitle = pos
    ? 'Counter sales from the POS — totals, cash vs bKash/card, cashiers, busiest hours and best sellers.'
    : 'Website and landing-page orders — totals, order status, payment methods, delivery areas and best sellers.';
  const rangeText = `${new Date(`${from}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(
    `${to}T12:00:00`
  ).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  return (
    <div>
      {toasts.node}
      <PageHeader
        title={title}
        subtitle={subtitle}
        icon={pos ? Store : TrendingUp}
        actions={
          <>
            <Button icon={RefreshCw} onClick={load} aria-label="Refresh">
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button icon={Printer} onClick={print} disabled={!data}>
              <span className="hidden sm:inline">Print</span>
            </Button>
            <Button variant="primary" icon={Download} onClick={exportOrders} disabled={!data || orders.length === 0}>
              Export CSV
            </Button>
          </>
        }
      />

      {/* Filters */}
      <Card className="mb-4">
        <FilterPills pills={PRESETS.map((item) => ({ id: item.id, label: item.label }))} active={preset} onChange={choosePreset} />
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <Field label="From">
            <input
              type="date"
              className="a-field ds-num"
              value={from}
              max={to}
              onChange={(event) => {
                setPreset('custom');
                setRange([event.target.value || from, to]);
              }}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              className="a-field ds-num"
              value={to}
              min={from}
              onChange={(event) => {
                setPreset('custom');
                setRange([from, event.target.value || to]);
              }}
            />
          </Field>
          <Field label="Show by">
            <Select
              value={group}
              onChange={setGroup}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
            />
          </Field>
          {!pos && (
            <Field label="Orders">
              <Select
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'sales', label: 'All but cancelled' },
                  { value: 'delivered', label: 'Delivered' },
                  { value: 'pending', label: 'In progress' },
                  { value: 'cancelled', label: 'Cancelled / failed' },
                  { value: 'all', label: 'Every order' },
                ]}
              />
            </Field>
          )}
          <Field label="Payment">
            <Select value={method} onChange={setMethod} options={[{ value: '', label: 'All methods' }, ...(data?.methodOptions || [])]} />
          </Field>
          {pos && (
            <Field label="Cashier">
              <Select
                value={cashier}
                onChange={setCashier}
                options={[{ value: '', label: 'All cashiers' }, ...((data?.cashierNames || []) as string[]).map((name) => ({ value: name, label: name }))]}
              />
            </Field>
          )}
        </div>
      </Card>

      {error ? (
        <Card padded={false}>
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : loading && !data ? (
        <Card>
          <SectionLoader lines={8} />
        </Card>
      ) : data ? (
        <div ref={printRef} className="space-y-4" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          {/* Title block for the printout */}
          <div className="print-only" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>
              {storeName ? `${storeName} — ` : ''}
              {title}
            </div>
            <div style={{ color: '#6b7280' }}>
              {rangeText} · printed {new Date().toLocaleString('en-GB')}
            </div>
          </div>

          {/* Headline figures */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Total sales"
              value={fmtMoney(summary.netSales, currency)}
              icon={Wallet}
              color="var(--primary)"
              delta={salesDelta?.text}
              deltaDirection={salesDelta?.up ? 'up' : 'down'}
              deltaNote={salesDelta ? 'vs previous period' : undefined}
            />
            <StatCard
              label={pos ? 'Sales' : 'Orders'}
              value={Number(summary.orders || 0).toLocaleString('en-US')}
              icon={pos ? Receipt : ShoppingBag}
              color="var(--ds-indigo)"
              delta={ordersDelta?.text}
              deltaDirection={ordersDelta?.up ? 'up' : 'down'}
              deltaNote={ordersDelta ? 'vs previous period' : undefined}
            />
            <StatCard label="Items sold" value={Number(summary.itemsSold || 0).toLocaleString('en-US')} icon={Package} color="var(--ds-amber)" />
            <StatCard label={pos ? 'Avg. sale' : 'Avg. order'} value={fmtMoney(summary.averageOrder, currency)} icon={Receipt} color="var(--ds-teal)" />
          </div>

          {/* Secondary figures */}
          <Card padded={false}>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6" style={{ gap: 1, background: 'var(--a-border)', borderRadius: 'var(--a-radius)', overflow: 'hidden' }}>
              {[
                { label: 'Product sales', value: fmtMoney(summary.grossSales, currency), note: 'before discounts', icon: TrendingUp },
                { label: 'Discounts', value: fmtMoney(summary.discount, currency), icon: BadgePercent },
                pos
                  ? { label: 'VAT', value: fmtMoney(summary.tax, currency), icon: Receipt }
                  : { label: 'Delivery charges', value: fmtMoney(summary.delivery, currency), icon: Truck },
                {
                  label: summary.costCoverage < 100 ? 'Gross profit (est.)' : 'Gross profit',
                  value: `${fmtMoney(summary.grossProfit, currency)}`,
                  note: summary.costCoverage > 0 ? `${summary.margin}% margin` : 'add cost prices',
                  icon: PiggyBank,
                },
                {
                  label: 'Returns',
                  value: fmtMoney(summary.returnsAmount, currency),
                  note: summary.returnsCount ? `After returns ${fmtMoney(summary.netAfterReturns, currency)}` : 'no returns',
                  icon: Undo2,
                },
                pos
                  ? { label: 'Customers (named)', value: String(summary.customers || 0), icon: Users }
                  : { label: 'Cancelled / failed', value: String(summary.cancelledOrders || 0), note: fmtMoney(summary.cancelledAmount, currency), icon: XCircle },
              ].map((cell) => (
                <div key={cell.label} className="min-w-0" style={{ padding: 'var(--ds-s-3) var(--ds-s-4)', background: 'var(--a-surface)' }}>
                  <div className="flex items-center gap-1.5 truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                    <cell.icon className="w-3.5 h-3.5 shrink-0" /> {cell.label}
                  </div>
                  <div className="ds-num font-bold truncate" style={{ fontSize: 'var(--a-fs-lg)' }}>
                    {cell.value}
                  </div>
                  {cell.note && (
                    <div className="truncate" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                      {cell.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Trend */}
          <Card>
            <CardHeader
              title={`Sales by ${group}`}
              subtitle={
                bestPeriod && bestPeriod.sales > 0
                  ? `Best ${group}: ${periodLabel(bestPeriod.key, group)} — ${fmtMoney(bestPeriod.sales, currency)} from ${bestPeriod.orders} ${pos ? 'sales' : 'orders'}`
                  : rangeText
              }
              icon={TrendingUp}
            />
            {Number(summary.orders || 0) === 0 ? (
              <EmptyState title="No sales in this period" description="Choose another period or filter." icon={TrendingUp} />
            ) : (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
                    <CartesianGrid vertical={false} stroke="var(--a-border)" />
                    <XAxis
                      dataKey="key"
                      tickFormatter={(value) => periodLabel(value, group).replace('Week of ', '')}
                      tick={{ fontSize: 11, fill: 'var(--a-text-muted)' }}
                      axisLine={{ stroke: 'var(--a-border)' }}
                      tickLine={false}
                      minTickGap={16}
                    />
                    <YAxis
                      tickFormatter={(value) => compact(Number(value))}
                      tick={{ fontSize: 11, fill: 'var(--a-text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip cursor={{ fill: 'var(--a-surface-2)' }} content={<ChartTip currency={currency} group={group} />} />
                    <Bar dataKey="sales" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="How customers paid" subtitle={`Share of ${pos ? 'POS' : 'order'} value by payment method`} icon={CreditCard} />
              <ShareList rows={data.payments || []} currency={currency} countLabel={pos ? 'sales' : 'orders'} empty="No payments in this period." />
            </Card>
            {pos ? (
              <Card>
                <CardHeader title="Cashiers" subtitle="Who took the sales" icon={Users} />
                <ShareList rows={data.cashiers || []} currency={currency} countLabel="sales" empty="No sales in this period." />
              </Card>
            ) : (
              <Card>
                <CardHeader title="Order status" subtitle="Where the period's orders stand now" icon={Layers} />
                {(data.statuses || []).length === 0 ? (
                  <p style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>No orders in this period.</p>
                ) : (
                  <ul className="divide-y" style={{ borderColor: 'var(--a-border)' }}>
                    {(data.statuses || []).map((row: any) => (
                      <li key={row.key} className="flex items-center justify-between gap-3 py-2" style={{ fontSize: 'var(--a-fs-md)' }}>
                        <Badge status={row.key} dot>
                          {STATUS_LABEL[row.key] || row.key}
                        </Badge>
                        <span className="flex items-baseline gap-3">
                          <span className="ds-num" style={{ color: 'var(--a-text-muted)' }}>
                            {row.count} orders
                          </span>
                          <strong className="ds-num">{fmtMoney(row.amount, currency)}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>

          {pos ? (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
              <Card>
                <CardHeader
                  title="Busiest hours"
                  subtitle={
                    busiestHour && busiestHour.orders > 0
                      ? `Most sales ${hourLabel(busiestHour.hour)} – ${hourLabel((busiestHour.hour + 1) % 24)} (${busiestHour.orders} sales)`
                      : 'Sales by hour of the day'
                  }
                  icon={Clock}
                />
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.hours} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
                      <CartesianGrid vertical={false} stroke="var(--a-border)" />
                      <XAxis
                        dataKey="hour"
                        tickFormatter={(value) => hourLabel(Number(value))}
                        tick={{ fontSize: 11, fill: 'var(--a-text-muted)' }}
                        axisLine={{ stroke: 'var(--a-border)' }}
                        tickLine={false}
                        interval={2}
                      />
                      <YAxis tickFormatter={(value) => compact(Number(value))} tick={{ fontSize: 11, fill: 'var(--a-text-muted)' }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip cursor={{ fill: 'var(--a-surface-2)' }} content={<ChartTip currency={currency} hours />} />
                      <Bar dataKey="sales" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <CardHeader title="Days of the week" subtitle="Total sales per weekday" icon={Clock} />
                <ShareList
                  rows={(data.weekdays || [])
                    .map((row: any) => ({ key: WEEKDAYS[row.weekday], count: row.orders, amount: row.sales }))
                    .filter((row: any) => row.count > 0)
                    .sort((a: any, b: any) => b.amount - a.amount)}
                  currency={currency}
                  countLabel="sales"
                  empty="No sales in this period."
                />
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader title="Delivery areas" subtitle="Order value by delivery area" icon={MapPin} />
                <ShareList rows={data.zones || []} currency={currency} countLabel="orders" empty="No orders in this period." />
              </Card>
              <Card>
                <CardHeader title="Where orders came from" subtitle="Website vs landing pages" icon={Megaphone} />
                <ShareList rows={data.sources || []} currency={currency} countLabel="orders" empty="No orders in this period." />
              </Card>
            </div>
          )}

          {/* What sold */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
            <Card padded={false}>
              <div className="p-5 pb-3">
                <CardHeader
                  title="Best-selling products"
                  subtitle={
                    summary.costCoverage < 100
                      ? `Profit uses each product's cost price — ${summary.costCoverage}% of sales have one. Add cost prices for exact profit.`
                      : 'Revenue and profit by product and option'
                  }
                  icon={Trophy}
                  actions={
                    <Button size="sm" icon={Download} onClick={exportProducts} className="no-print" disabled={(data.products || []).length === 0}>
                      CSV
                    </Button>
                  }
                />
              </div>
              {(data.products || []).length === 0 ? (
                <EmptyState title="Nothing sold in this period" icon={Package} />
              ) : (
                <TableWrap>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Product</th>
                        <th style={{ textAlign: 'right' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Revenue</th>
                        <th style={{ textAlign: 'right' }}>Profit (est.)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.products || []).slice(0, 20).map((row: any, index: number) => (
                        <tr key={`${row.productId}-${row.variation}`}>
                          <td className="ds-num" style={{ color: 'var(--a-text-muted)' }}>
                            {index + 1}
                          </td>
                          <td>
                            <div className="font-semibold">{row.name}</div>
                            {row.variation && (
                              <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>{row.variation}</div>
                            )}
                          </td>
                          <td className="ds-num" style={{ textAlign: 'right' }}>
                            {row.qty}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Money value={row.revenue} currency={currency} bold />
                          </td>
                          <td className="ds-num" style={{ textAlign: 'right', color: row.profit == null ? 'var(--a-text-faint)' : row.profit < 0 ? 'var(--ds-danger-text)' : 'var(--a-text)' }}>
                            {row.profit == null ? '—' : fmtMoney(row.profit, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Card>
            <Card>
              <CardHeader title="Categories" subtitle="Revenue by category" icon={Layers} />
              <ShareList
                rows={(data.categories || []).map((row: any) => ({ key: row.name, count: row.qty, amount: row.revenue }))}
                currency={currency}
                countLabel="items"
                empty="Nothing sold in this period."
              />
            </Card>
          </div>

          {/* Every order behind the numbers */}
          <Card padded={false} className="no-print">
            <div className="p-5 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <CardHeader title={pos ? 'POS sales' : 'Orders'} subtitle={`${filteredOrders.length.toLocaleString('en-US')} in this report`} icon={Receipt} />
              <div className="relative md:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--a-text-muted)' }} />
                <input
                  className="a-field w-full"
                  style={{ paddingLeft: 34 }}
                  placeholder={pos ? 'Search receipt, customer, cashier' : 'Search order, customer, phone'}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            {filteredOrders.length === 0 ? (
              <EmptyState title="No orders" description="Nothing matches this period and filter." icon={Receipt} />
            ) : (
              <>
                <TableWrap>
                  <table style={{ minWidth: 760 }}>
                    <thead>
                      <tr>
                        <th>{pos ? 'Receipt' : 'Order'}</th>
                        <th>Date</th>
                        <th>Customer</th>
                        <th style={{ textAlign: 'right' }}>Items</th>
                        <th>Payment</th>
                        {!pos && <th>Status</th>}
                        <th>{pos ? 'Cashier' : 'Area'}</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedOrders.map((row) => (
                        <tr key={row.id}>
                          <td className="ds-num font-semibold whitespace-nowrap">{row.orderNumber}</td>
                          <td className="ds-num whitespace-nowrap" style={{ color: 'var(--a-text-muted)' }}>
                            {new Date(row.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            <div className="font-semibold truncate" style={{ maxWidth: 180 }} title={row.customerName}>
                              {row.customerName}
                            </div>
                            {row.customerPhone && row.customerPhone !== '01900000000' && (
                              <div className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                                {row.customerPhone}
                              </div>
                            )}
                          </td>
                          <td className="ds-num" style={{ textAlign: 'right' }}>
                            {row.items}
                          </td>
                          <td>
                            <div className="truncate" style={{ maxWidth: 170 }} title={row.paymentLabel}>
                              {row.paymentLabel}
                            </div>
                            <div className="capitalize" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                              {String(row.paymentStatus || '').replace(/_/g, ' ')}
                            </div>
                          </td>
                          {!pos && (
                            <td>
                              <Badge status={row.orderStatus} dot>
                                {STATUS_LABEL[row.orderStatus] || row.orderStatus}
                              </Badge>
                            </td>
                          )}
                          <td>
                            <div className="truncate" style={{ maxWidth: 150 }}>
                              {pos ? row.cashier || '—' : row.landing ? `${row.zone || '—'} · ${row.landing}` : row.zone || '—'}
                            </div>
                          </td>
                          <td className="whitespace-nowrap" style={{ textAlign: 'right' }}>
                            <Money value={row.total} currency={currency} bold />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
                <div className="p-4">
                  <Pagination
                    page={page}
                    pageSize={pageSize}
                    total={filteredOrders.length}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(1);
                    }}
                  />
                </div>
              </>
            )}
          </Card>

          <p className="flex items-center gap-1.5" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
            <Clock className="w-3.5 h-3.5" /> Days are counted in {data.timezone} time. {pos ? '' : 'Failed online payments are not counted as sales.'}
          </p>
        </div>
      ) : null}
    </div>
  );
};
