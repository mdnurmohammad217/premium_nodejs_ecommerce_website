import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarRange,
  CreditCard,
  Download,
  Receipt,
  RefreshCw,
  ShoppingCart,
  Trophy,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  PageHeader,
  StatCard,
  Card,
  CardHeader,
  Button,
  Badge,
  FilterPills,
  TableWrap,
  EmptyState,
  ErrorState,
  LoadingRows,
  SectionLoader,
  Field,
  Money,
  ACCENTS,
  useToasts,
} from './ui.tsx';

interface Props {
  currency?: string;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDay(date);
};

const monthAgo = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return isoDay(date);
};

const startOfMonth = () => {
  const date = new Date();
  date.setDate(1);
  return isoDay(date);
};

/** Ready-made windows, so the common questions need no date picking */
const RANGE_PRESETS: Array<{ id: string; label: string; from: () => string; to: () => string }> = [
  { id: '7d', label: 'Last 7 Days', from: () => daysAgo(6), to: () => isoDay(new Date()) },
  { id: '30d', label: 'Last 30 Days', from: () => daysAgo(29), to: () => isoDay(new Date()) },
  { id: 'month', label: 'This Month', from: startOfMonth, to: () => isoDay(new Date()) },
  { id: '90d', label: 'Last 90 Days', from: () => daysAgo(89), to: () => isoDay(new Date()) },
];

const CHART_LABELS: Record<string, { label: string; money: boolean }> = {
  revenue: { label: 'Revenue', money: true },
  orders: { label: 'Orders', money: false },
  amount: { label: 'Amount', money: true },
  count: { label: 'Orders', money: false },
};

const PAYMENT_COLORS = [
  ACCENTS.primary,
  ACCENTS.indigo,
  ACCENTS.amber,
  ACCENTS.rose,
  ACCENTS.teal,
  ACCENTS.violet,
];

/**
 * Tooltip card for the recharts surfaces. Recharts' own `contentStyle` cannot
 * reach the design tokens, so the whole card is rendered here instead and reads
 * the same surface, radius and shadow as the dashboard's charts.
 */
const ChartTooltip: React.FC<any> = ({ active, payload, label, currency }) => {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  return (
    <div
      style={{
        minWidth: 150,
        padding: 'var(--ds-s-3)',
        background: 'var(--ds-surface)',
        border: '1px solid var(--ds-border)',
        borderRadius: 'var(--ds-r-md)',
        boxShadow: 'var(--ds-shadow-lg)',
      }}
    >
      <div
        style={{
          fontSize: 'var(--a-fs-sm)',
          color: 'var(--a-text-muted)',
          marginBottom: 'var(--ds-s-1)',
        }}
      >
        {label}
      </div>
      {payload.map((entry: any) => {
        const meta = CHART_LABELS[String(entry.dataKey)];
        return (
          <div
            key={String(entry.dataKey)}
            className="flex items-center justify-between gap-3"
            style={{ fontSize: 'var(--a-fs-md)' }}
          >
            <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--a-text-soft)' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 'var(--ds-r-full)',
                  background: entry.color || 'var(--primary)',
                }}
              />
              {meta?.label || entry.name}
            </span>
            <span className="font-bold">
              {meta?.money === false ? (
                <span className="ds-num">{entry.value}</span>
              ) : (
                <Money value={entry.value} currency={currency} />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * One cell of the secondary figure strip. The strip draws its dividers with a
 * 1px grid gap over a border-coloured background, so the hairlines stay exact at
 * every breakpoint without a border on each cell.
 */
const Figure: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div
    className="min-w-0"
    style={{ padding: 'var(--ds-s-3) var(--ds-s-4)', background: 'var(--a-surface)' }}
  >
    <div className="truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
      {label}
    </div>
    <div className="truncate font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
      {children}
    </div>
  </div>
);

/**
 * Reports — sales, expenses, purchases and salaries for a chosen date window,
 * read top to bottom: the window, the headline figures, the trend, then the
 * detail tables behind those figures.
 */
export const AdminReportsPage: React.FC<Props> = ({ currency = '৳' }) => {
  const toasts = useToasts();
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(isoDay(new Date()));
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?from=${from}&to=${to}`);
      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);
      setData(payload);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Could not load the report.');
      toasts.push(err.message || 'Could not load the report.', 'error');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = () => {
    if (!data) return;
    const lines = [
      'Metric,Value',
      `Range,${data.range.from} to ${data.range.to}`,
      `Orders,${data.summary.orders}`,
      `Completed orders,${data.summary.completedOrders}`,
      `Cancelled orders,${data.summary.cancelledOrders}`,
      `Revenue,${data.summary.revenue}`,
      `Discount,${data.summary.discount}`,
      `Shipping,${data.summary.shipping}`,
      `Expenses,${data.summary.expenses}`,
      `Purchases,${data.summary.purchases}`,
      `Salaries,${data.summary.salaries}`,
      `Net profit,${data.summary.netProfit}`,
      `Average order value,${data.summary.averageOrderValue}`,
      '',
      'Product,Quantity,Revenue',
      ...data.topProducts.map((row: any) => `"${row.name.replace(/"/g, '""')}",${row.qty},${row.revenue}`),
    ].join('\r\n');
    const blob = new Blob(['﻿' + lines], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `report-${data.range.from}_${data.range.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const summary = data?.summary;
  const daily: any[] = Array.isArray(data?.daily) ? data.daily : [];
  const payments: any[] = Array.isArray(data?.paymentBreakdown) ? data.paymentBreakdown : [];
  const topProducts: any[] = Array.isArray(data?.topProducts) ? data.topProducts : [];
  const expenseRows: any[] = Array.isArray(data?.expenseRows) ? data.expenseRows : [];

  const activePreset = useMemo(() => {
    const match = RANGE_PRESETS.find((preset) => preset.from() === from && preset.to() === to);
    return match?.id || 'custom';
  }, [from, to]);

  const applyPreset = (id: string) => {
    const preset = RANGE_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setFrom(preset.from());
    setTo(preset.to());
  };

  const bestDay = useMemo(
    () =>
      daily.reduce(
        (best: any, row: any) => (best && Number(best.revenue) >= Number(row.revenue) ? best : row),
        null as any
      ),
    [daily]
  );

  const topProductRevenue = topProducts.length > 0 ? Number(topProducts[0].revenue) : 0;

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Reports & Analytics"
        subtitle="Sales, expenses and profit for any date range"
        icon={BarChart3}
        actions={
          <>
            <Button icon={RefreshCw} onClick={load} loading={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon={Download} onClick={exportCsv} disabled={!data}>
              Export CSV
            </Button>
          </>
        }
      />

      {/* The window everything below is measured over */}
      <Card className="mb-5" accent={ACCENTS.indigo}>
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="min-w-0 flex-1">
            <span className="a-label">Date Range</span>
            <FilterPills pills={RANGE_PRESETS} active={activePreset} onChange={applyPreset} />
          </div>

          <div className="grid grid-cols-2 gap-2 lg:w-[300px] shrink-0">
            <Field label="From">
              <input
                type="date"
                className="a-field"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className="a-field"
                value={to}
                min={from}
                onChange={(event) => setTo(event.target.value)}
              />
            </Field>
          </div>

          <Button variant="primary" icon={CalendarRange} onClick={load} loading={loading} className="shrink-0">
            Apply
          </Button>
        </div>
      </Card>

      {/* Headline figures */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-3">
        <StatCard
          label="Revenue"
          value={<Money value={summary?.revenue} currency={currency} />}
          icon={Wallet}
          color={ACCENTS.primary}
          loading={loading && !data}
        />
        <StatCard
          label="Orders"
          value={summary?.completedOrders ?? 0}
          icon={ShoppingCart}
          color={ACCENTS.indigo}
          loading={loading && !data}
        />
        <StatCard
          label="Purchases"
          value={<Money value={summary?.purchases} currency={currency} />}
          icon={TrendingDown}
          color={ACCENTS.violet}
          loading={loading && !data}
        />
        <StatCard
          label="Expenses"
          value={<Money value={summary?.expenses} currency={currency} />}
          icon={Receipt}
          color={ACCENTS.amber}
          loading={loading && !data}
        />
        <StatCard
          label="Net Profit"
          value={<Money value={summary?.netProfit} currency={currency} />}
          icon={TrendingUp}
          color={Number(summary?.netProfit || 0) >= 0 ? 'var(--ds-success)' : 'var(--ds-danger)'}
          loading={loading && !data}
        />
      </div>

      {/* The figures behind the headline ones */}
      <Card className="mb-5" padded={false}>
        {loading && !data ? (
          <div style={{ padding: 'var(--ds-card-pad)' }}>
            <SectionLoader lines={2} />
          </div>
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 overflow-hidden"
            style={{ gap: 1, background: 'var(--a-border)', borderRadius: 'var(--a-radius)' }}
          >
            <Figure label="Total / Cancelled Orders">
              <span className="ds-num">{Number(summary?.orders || 0)}</span>
              <span style={{ color: 'var(--a-text-faint)' }}> / </span>
              <span className="ds-num" style={{ color: 'var(--ds-danger-text)' }}>
                {Number(summary?.cancelledOrders || 0)}
              </span>
            </Figure>
            <Figure label="Average Order Value">
              <Money value={summary?.averageOrderValue} currency={currency} />
            </Figure>
            <Figure label="Discount">
              <Money value={summary?.discount} currency={currency} />
            </Figure>
            <Figure label="Delivery Charges">
              <Money value={summary?.shipping} currency={currency} />
            </Figure>
            <Figure label="Salaries">
              <Money value={summary?.salaries} currency={currency} />
            </Figure>
            <Figure label="Best Day">
              {bestDay ? (
                <span className="ds-num">{bestDay.date}</span>
              ) : (
                <span style={{ color: 'var(--a-text-faint)' }}>—</span>
              )}
            </Figure>
          </div>
        )}
      </Card>

      {/* Trend and payment mix */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        <Card className="xl:col-span-2" accent={ACCENTS.primary}>
          <CardHeader
            title="Daily Revenue"
            subtitle={`${from} → ${to}`}
            icon={BarChart3}
            actions={
              daily.length > 0 ? (
                <Badge tone={{ bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)' }}>
                  <span className="ds-num">{daily.length}</span> days
                </Badge>
              ) : undefined
            }
          />
          {loading && !data ? (
            <SectionLoader height={240} />
          ) : daily.length === 0 ? (
            <EmptyState
              title="No sales in this period"
              description="Try a different date range."
              icon={BarChart3}
            />
          ) : (
            <div style={{ height: 250, fontSize: 'var(--a-fs-xs)' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="reportTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--ds-border-soft)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--a-text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--a-text-muted)' }} axisLine={false} tickLine={false} width={54} />
                  <Tooltip
                    cursor={{ stroke: 'var(--ds-border-strong)', strokeDasharray: '4 4' }}
                    content={<ChartTooltip currency={currency} />}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    fill="url(#reportTrendFill)"
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--ds-surface)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card accent={ACCENTS.indigo}>
          <CardHeader title="Payment Methods" subtitle="Amount collected by payment method" icon={CreditCard} accent={ACCENTS.indigo} />
          {loading && !data ? (
            <SectionLoader height={240} />
          ) : payments.length === 0 ? (
            <EmptyState title="No payments in this period" icon={CreditCard} />
          ) : (
            <>
              <div style={{ height: 180, fontSize: 'var(--a-fs-xs)' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={payments} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="var(--ds-border-soft)" vertical={false} />
                    <XAxis
                      dataKey="method"
                      tick={{ fill: 'var(--a-text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fill: 'var(--a-text-muted)' }} axisLine={false} tickLine={false} width={54} />
                    <Tooltip
                      cursor={{ fill: 'var(--ds-surface-3)' }}
                      content={<ChartTooltip currency={currency} />}
                    />
                    <Bar dataKey="amount" radius={[8, 8, 0, 0]} maxBarSize={44}>
                      {payments.map((_entry, index) => (
                        <Cell key={index} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 space-y-2">
                {payments.map((entry, index) => (
                  <div key={entry.method} className="flex items-center gap-2.5" style={{ fontSize: 'var(--a-fs-md)' }}>
                    <span
                      className="shrink-0"
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 'var(--ds-r-full)',
                        background: PAYMENT_COLORS[index % PAYMENT_COLORS.length],
                      }}
                    />
                    <span className="flex-1 min-w-0 truncate uppercase" style={{ color: 'var(--a-text-soft)' }}>
                      {entry.method}
                    </span>
                    <span className="ds-num shrink-0" style={{ color: 'var(--a-text-faint)' }}>
                      {entry.count}
                    </span>
                    <span className="shrink-0 font-semibold">
                      <Money value={entry.amount} currency={currency} />
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Detail behind the numbers */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TableWrap>
          <div style={{ padding: 'var(--ds-card-pad)', paddingBottom: 0 }}>
            <CardHeader
              title="Top-Selling Products"
              subtitle="Highest-earning products in this period"
              icon={Trophy}
              accent={ACCENTS.amber}
            />
          </div>
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Quantity</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <LoadingRows rows={6} cols={4} />
                ) : topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 0 }}>
                      <EmptyState title="No products sold in this period" icon={ShoppingCart} />
                    </td>
                  </tr>
                ) : (
                  topProducts.map((row, index) => {
                    const share =
                      topProductRevenue > 0 ? Math.round((Number(row.revenue) / topProductRevenue) * 100) : 0;
                    return (
                      <tr key={row.productId}>
                        <td className="ds-num" style={{ color: 'var(--a-text-muted)' }}>
                          {index + 1}
                        </td>
                        <td>
                          <div className="font-semibold ds-clamp-1">{row.name}</div>
                          <div
                            className="mt-1"
                            style={{
                              height: 4,
                              maxWidth: 180,
                              borderRadius: 'var(--ds-r-full)',
                              background: 'var(--a-surface-3)',
                            }}
                          >
                            <div
                              style={{
                                width: `${share}%`,
                                height: '100%',
                                borderRadius: 'var(--ds-r-full)',
                                background: 'var(--primary)',
                              }}
                            />
                          </div>
                        </td>
                        <td className="ds-num" style={{ textAlign: 'right' }}>
                          {row.qty}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Money value={row.revenue} currency={currency} bold />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </TableWrap>

        <TableWrap>
          <div style={{ padding: 'var(--ds-card-pad)', paddingBottom: 0 }}>
            <CardHeader
              title="Expenses"
              subtitle="Expenses recorded in this period"
              icon={Receipt}
              accent="var(--ds-danger)"
            />
          </div>
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Method</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <LoadingRows rows={6} cols={4} />
                ) : expenseRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 0 }}>
                      <EmptyState title="No expenses in this period" icon={Receipt} />
                    </td>
                  </tr>
                ) : (
                  expenseRows.map((row) => (
                    <tr key={row.id}>
                      <td className="ds-num whitespace-nowrap" style={{ color: 'var(--a-text-muted)' }}>
                        {row.expenseDate}
                      </td>
                      <td>
                        <div className="font-semibold">{row.category}</div>
                        {row.description && (
                          <div
                            className="ds-clamp-1"
                            style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                          >
                            {row.description}
                          </div>
                        )}
                      </td>
                      <td>
                        <Badge tone={{ bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)' }}>
                          {row.paymentMethod || '—'}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Money value={row.amount} currency={currency} bold />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </TableWrap>
      </div>
    </div>
  );
};
