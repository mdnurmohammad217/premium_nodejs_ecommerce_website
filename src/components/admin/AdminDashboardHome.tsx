import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Wallet,
  TrendingUp,
  Users,
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  Boxes,
  CreditCard,
  ArrowRight,
  Plus,
  ListOrdered,
  PackageX,
  DollarSign,
  PieChart as PieChartIcon,
  Coins,
  ClipboardList,
  AlertCircle,
  ShieldAlert,
  X,
} from 'lucide-react';
import { MetricCard } from './MetricCard.tsx';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  PageHeader,
  StatCard,
  Card,
  CardHeader,
  Badge,
  Button,
  FilterPills,
  EmptyState,
  SectionLoader,
  Thumb,
  Money,
  ACCENTS,
  mix,
} from './ui.tsx';

interface Props {
  stats: any;
  recentOrders: any[];
  lowStock: any[];
  onOpenOrders: () => void;
  onOpenOrder: (id: number) => void;
  onOpenInventory: () => void;
  /** Opens Account & Security (for the default-password warning) */
  onOpenAccount?: () => void;
  onOpenProducts: () => void;
  currency?: string;
}

/** Slices of the payment donut, in the order the accents should appear */
const DONUT_COLORS = [
  ACCENTS.primary,
  ACCENTS.indigo,
  ACCENTS.amber,
  ACCENTS.rose,
  ACCENTS.teal,
  ACCENTS.violet,
];

const METRICS: Record<string, { label: string; money: boolean }> = {
  sales: { label: 'Sales', money: true },
  orders: { label: 'Orders', money: false },
};

/**
 * Tooltip card for the recharts surfaces. Recharts' own `contentStyle` cannot
 * reach the design tokens, so the whole card is rendered here instead and reads
 * the same surface, radius and shadow as every other floating panel.
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
        const metric = METRICS[String(entry.dataKey)];
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
              {metric?.label || entry.name}
            </span>
            <span className="font-bold">
              {metric?.money === false ? (
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

/** One labelled bar in the order-status breakdown */
const StatusBar: React.FC<{ label: string; value: number; total: number; color: string }> = ({
  label,
  value,
  total,
  color,
}) => {
  const share = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5" style={{ fontSize: 'var(--a-fs-md)' }}>
        <span style={{ color: 'var(--a-text-soft)' }}>{label}</span>
        <span className="font-bold">
          <span className="ds-num">{value}</span>
          <span className="ds-num font-normal ml-1.5" style={{ color: 'var(--a-text-faint)' }}>
            {share}%
          </span>
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 'var(--ds-r-full)',
          background: 'var(--a-surface-3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${share}%`,
            height: '100%',
            borderRadius: 'var(--ds-r-full)',
            background: color,
            transition: `width var(--ds-dur-slow) var(--ds-ease)`,
          }}
        />
      </div>
    </div>
  );
};

/** A clickable quick-action row */
const QuickAction: React.FC<{
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  onClick: () => void;
}> = ({ label, icon: Icon, color, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 text-left cursor-pointer transition-colors"
    style={{
      padding: 'var(--ds-s-2) var(--ds-s-3)',
      borderRadius: 'var(--ds-r-md)',
      border: '1px solid var(--a-border)',
      background: 'var(--a-surface)',
      minHeight: 'var(--ds-h-lg)',
    }}
  >
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{ width: 30, height: 30, borderRadius: 'var(--ds-r-sm)', background: mix(color, 0.12), color }}
    >
      <Icon className="w-4 h-4" />
    </span>
    <span className="flex-1 min-w-0 font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
      {label}
    </span>
    <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--a-text-faint)' }} />
  </button>
);

/**
 * Dashboard overview — read-only summary laid out as a KPI grid: the headline
 * figures, the seven-day trend, how customers paid, where orders sit, and the
 * two lists an operator checks first thing in the morning.
 *
 * Every card fills in on its own as `stats` arrives, so a slow network shows
 * progressive skeletons rather than one blocking spinner.
 */
/**
 * v3.11 — while the owner still signs in with the well-known default password
 * ("password"), the dashboard says so and links to Account & Security.
 */
const DefaultPasswordWarning: React.FC<{ onOpenAccount?: () => void }> = ({ onOpenAccount }) => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('/api/auth/owner-profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data?.isOwner !== false && data?.usingDefaultPassword) setShow(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (!show) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl px-4 py-3 ds-fade-in"
      style={{
        background: 'var(--ds-warning-soft)',
        border: '1px solid color-mix(in srgb, var(--ds-warning) 35%, transparent)',
      }}
    >
      <span
        className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full"
        style={{ background: 'color-mix(in srgb, var(--ds-warning) 22%, transparent)', color: 'var(--ds-warning-text, var(--ds-warning))' }}
      >
        <ShieldAlert className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text)' }}>
          You are still using the default password
        </div>
        <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
          Anyone who knows it can open this dashboard. Set your own email and password now.
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onOpenAccount && (
          <Button variant="primary" size="sm" onClick={onOpenAccount}>
            Change Password
          </Button>
        )}
        <button
          type="button"
          aria-label="Hide"
          onClick={() => setShow(false)}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full cursor-pointer"
          style={{ color: 'var(--a-text-muted)' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const AdminDashboardHome: React.FC<Props> = ({
  stats,
  recentOrders,
  lowStock,
  onOpenOrders,
  onOpenOrder,
  onOpenInventory,
  onOpenProducts,
  onOpenAccount,
  currency = '৳',
}) => {
  const loading = !stats;
  const [metric, setMetric] = useState<'sales' | 'orders'>('sales');

  const chartData = useMemo(
    () => (Array.isArray(stats?.last7DaysData) ? stats.last7DaysData : []),
    [stats]
  );

  const trend = useMemo(() => {
    if (chartData.length === 0) return { total: 0, best: 0, average: 0 };
    const values = chartData.map((row: any) => Number(row[metric] || 0));
    const total = values.reduce((sum: number, value: number) => sum + value, 0);
    return {
      total,
      best: Math.max(...values),
      average: total / values.length,
    };
  }, [chartData, metric]);

  const paymentData = useMemo(() => {
    const list = Array.isArray(stats?.paymentChart) ? stats.paymentChart : [];
    return list.filter((entry: any) => Number(entry.value) > 0);
  }, [stats]);

  const paymentTotal = useMemo(
    () => paymentData.reduce((sum: number, entry: any) => sum + Number(entry.value || 0), 0),
    [paymentData]
  );

  const statusRows = useMemo(() => {
    const total = Number(stats?.totalOrdersCount || 0);
    const pending = Number(stats?.pendingOrders || 0);
    const completed = Number(stats?.completedOrders || 0);
    return {
      total,
      rows: [
        { label: 'Pending', value: pending, color: 'var(--ds-warning)' },
        { label: 'Completed', value: completed, color: 'var(--ds-success)' },
        { label: 'Other', value: Math.max(0, total - pending - completed), color: 'var(--ds-info)' },
      ],
    };
  }, [stats]);

  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Dhaka',
  });

  const metricIsMoney = METRICS[metric].money;
  const figure = (value: number) =>
    metricIsMoney ? <Money value={value} currency={currency} bold /> : <span className="ds-num font-bold">{value}</span>;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Today's summary and what needs your attention · ${today}${stats ? ` · Today's sales ${currency}${Number(stats.todaySales || 0).toLocaleString('en-US')} (${stats.todayOrdersCount || 0} orders)` : ''}`}
        icon={LayoutDashboard}
        actions={
          <Button variant="primary" icon={ListOrdered} onClick={onOpenOrders}>
            View Orders
          </Button>
        }
      />

      <DefaultPasswordWarning onOpenAccount={onOpenAccount} />

      {/* Headline figures — the last 30 days, then the stock and the counts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <MetricCard
          label="Total Profit (Last 30 Days)"
          value={<Money value={stats?.last30?.profit} currency={`${currency} `} />}
          note={stats?.last30?.range}
          icon={DollarSign}
          color="var(--ds-success)"
          loading={loading}
        />
        <MetricCard
          label="Total Revenue (Last 30 Days)"
          value={<Money value={stats?.last30?.revenue} currency={`${currency} `} />}
          note={stats?.last30?.range}
          icon={PieChartIcon}
          color="var(--ds-teal)"
          loading={loading}
          onClick={onOpenOrders}
        />
        <MetricCard
          label="Total Sales (Last 30 Days)"
          value={<Money value={stats?.last30?.sales} currency={`${currency} `} />}
          note={stats?.last30?.range}
          icon={ShoppingCart}
          color="var(--ds-info)"
          loading={loading}
          onClick={onOpenOrders}
        />
        <MetricCard
          label="Purchase Cost (All Time)"
          value={<Money value={stats?.stockValue} currency={`${currency} `} />}
          note="Total base value of current stock"
          icon={Coins}
          color="var(--ds-gray-500, #64748b)"
          loading={loading}
          onClick={onOpenInventory}
        />
        <MetricCard
          label="Sold COGS (All Time)"
          value={<Money value={stats?.soldCogs} currency={`${currency} `} />}
          note="Historical cost of goods sold"
          icon={ClipboardList}
          color="var(--ds-amber)"
          loading={loading}
        />
        <MetricCard
          label="Courier Expense (All Time)"
          value={<Money value={stats?.courierSpend} currency={`${currency} `} />}
          note="Spent on successful deliveries"
          icon={Truck}
          color="var(--ds-danger)"
          loading={loading}
        />
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <MetricCard label="Customers" value={stats?.customersCount ?? 0} note="Total Users" icon={Users} color="var(--ds-teal)" loading={loading} />
        <MetricCard label="Products" value={stats?.productsCount ?? 0} note="Total Catalog" icon={Package} color="var(--ds-amber)" loading={loading} onClick={onOpenProducts} />
        <MetricCard label="Orders" value={stats?.totalOrdersCount ?? 0} note="All Time" icon={Truck} color="var(--ds-success)" loading={loading} onClick={onOpenOrders} />
        <MetricCard label="Pending" value={stats?.pendingOrders ?? 0} note="Action Needed" icon={AlertCircle} color="var(--ds-danger)" loading={loading} onClick={onOpenOrders} />
      </div>

      {/* Trend + payment split */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        <Card className="xl:col-span-2" accent={ACCENTS.primary}>
          <CardHeader
            title="7-Day Trend"
            subtitle="Daily sales and order count"
            icon={TrendingUp}
            actions={
              chartData.length > 0 ? (
                <FilterPills
                  pills={[
                    { id: 'sales', label: METRICS.sales.label },
                    { id: 'orders', label: METRICS.orders.label },
                  ]}
                  active={metric}
                  onChange={(id) => setMetric(id as 'sales' | 'orders')}
                />
              ) : undefined
            }
          />

          {loading ? (
            <SectionLoader height={240} />
          ) : chartData.length === 0 ? (
            <EmptyState
              title="No sales yet"
              description="Once orders start coming in, the daily trend will appear here."
              icon={TrendingUp}
            />
          ) : (
            <>
              <div style={{ height: 250, fontSize: 'var(--a-fs-xs)' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashboardTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="var(--ds-border-soft)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'var(--a-text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fill: 'var(--a-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={56} tickFormatter={(value) => (Number(value) >= 1000 ? `${Math.round(Number(value) / 100) / 10}k` : String(value))} />
                    <Tooltip
                      cursor={{ stroke: 'var(--ds-border-strong)', strokeDasharray: '4 4' }}
                      content={<ChartTooltip currency={currency} />}
                    />
                    <Area
                      type="monotone"
                      dataKey={metric}
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      fill="url(#dashboardTrendFill)"
                      activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--ds-surface)' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div
                className="grid grid-cols-3 mt-4 pt-4"
                style={{ borderTop: '1px solid var(--a-border)' }}
              >
                {[
                  { label: '7-Day Total', value: trend.total },
                  { label: 'Best Day', value: trend.best },
                  { label: 'Daily Average', value: Math.round(trend.average) },
                ].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <div className="truncate" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                      {item.label}
                    </div>
                    <div className="truncate" style={{ fontSize: 'var(--a-fs-lg)' }}>
                      {figure(item.value)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card accent={ACCENTS.indigo}>
          <CardHeader title="Payment Methods" subtitle="How customers paid" icon={CreditCard} accent={ACCENTS.indigo} />

          {loading ? (
            <SectionLoader height={240} />
          ) : paymentData.length === 0 ? (
            <EmptyState title="No payments yet" icon={CreditCard} />
          ) : (
            <>
              <div style={{ height: 190 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={56}
                      outerRadius={84}
                      paddingAngle={3}
                      stroke="var(--ds-surface)"
                      strokeWidth={2}
                    >
                      {paymentData.map((_entry: any, index: number) => (
                        <Cell key={index} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip currency={currency} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 space-y-2">
                {paymentData.map((entry: any, index: number) => {
                  const share = paymentTotal > 0 ? Math.round((Number(entry.value) / paymentTotal) * 100) : 0;
                  return (
                    <div key={entry.name} className="flex items-center gap-2.5" style={{ fontSize: 'var(--a-fs-md)' }}>
                      <span
                        className="shrink-0"
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 'var(--ds-r-full)',
                          background: DONUT_COLORS[index % DONUT_COLORS.length],
                        }}
                      />
                      <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--a-text-soft)' }}>
                        {entry.name}
                      </span>
                      <span className="ds-num shrink-0" style={{ color: 'var(--a-text-faint)' }}>
                        {share}%
                      </span>
                      <span className="shrink-0 font-semibold">
                        <Money value={entry.value} currency={currency} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Recent orders + where the orders sit */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        <Card className="xl:col-span-2" padded={false}>
          <div className="p-5 pb-0">
            <CardHeader
              title="Recent Orders"
              subtitle="Your newest orders"
              icon={ShoppingCart}
              actions={
                <Button size="sm" iconRight={ArrowRight} onClick={onOpenOrders}>
                  View All
                </Button>
              }
            />
          </div>

          {loading ? (
            <div className="px-5 pb-5">
              <SectionLoader lines={6} />
            </div>
          ) : recentOrders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              description="New orders will appear here as soon as they come in."
              icon={ShoppingCart}
            />
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.slice(0, 8).map((order: any) => (
                    <tr
                      key={order.id}
                      className="cursor-pointer"
                      onClick={() => onOpenOrder(order.id)}
                      style={{ '--ds-td-y': 'var(--ds-td-y-compact)' } as React.CSSProperties}
                    >
                      <td className="font-bold ds-num whitespace-nowrap">
                        #{order.orderNumber?.split('-').pop() || order.id}
                      </td>
                      <td>
                        <div className="font-semibold truncate" style={{ maxWidth: 160 }}>
                          {order.customerName}
                        </div>
                        <div
                          className="ds-num truncate"
                          style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)', maxWidth: 160 }}
                        >
                          {order.customerPhone}
                        </div>
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
          )}
        </Card>

        <Card accent={ACCENTS.amber}>
          <CardHeader
            title="Order Status"
            subtitle="Where all your orders stand"
            icon={Truck}
            accent={ACCENTS.amber}
          />

          {loading ? (
            <SectionLoader lines={4} />
          ) : statusRows.total === 0 ? (
            <EmptyState title="No orders to report yet" icon={Truck} />
          ) : (
            <>
              <div className="flex items-end gap-2 mb-4">
                <span className="font-black ds-num leading-none" style={{ fontSize: 'var(--ds-fs-3xl)' }}>
                  {statusRows.total}
                </span>
                <span className="pb-1" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
                  total orders
                </span>
              </div>

              <div className="space-y-3.5">
                {statusRows.rows.map((row) => (
                  <StatusBar
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    total={statusRows.total}
                    color={row.color}
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--a-border)' }}>
                <div>
                  <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Orders Today</div>
                  <div className="font-bold ds-num" style={{ fontSize: 'var(--a-fs-lg)' }}>
                    {Number(stats?.todayOrdersCount || 0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Est. Profit</div>
                  <div style={{ fontSize: 'var(--a-fs-lg)' }}>
                    <Money value={stats?.estimatedProfit} currency={currency} bold />
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Stock alerts + quick actions */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" padded={false} accent="var(--ds-danger)">
          <div className="p-5 pb-0">
            <CardHeader
              title="Stock Alerts"
              subtitle="Products at or below their low-stock threshold"
              icon={AlertTriangle}
              accent="var(--ds-danger)"
              actions={
                <Button size="sm" iconRight={ArrowRight} onClick={onOpenInventory}>
                  Stock Management
                </Button>
              }
            />
          </div>

          {loading ? (
            <div className="px-5 pb-5">
              <SectionLoader lines={5} />
            </div>
          ) : lowStock.length === 0 ? (
            <EmptyState
              title="Stock levels look good"
              description="No products have dropped below their threshold."
              icon={CheckCircle2}
            />
          ) : (
            <ul style={{ borderTop: '1px solid var(--a-border-soft)' }}>
              {lowStock.slice(0, 6).map((product: any) => {
                const out = Number(product.stock) <= 0;
                return (
                  <li key={product.id} style={{ borderBottom: '1px solid var(--a-border-soft)' }}>
                    <button
                      onClick={onOpenInventory}
                      className="w-full flex items-center gap-3 text-left cursor-pointer transition-colors hover:bg-[var(--a-surface-2)]"
                      style={{ padding: 'var(--ds-s-3) var(--ds-card-pad)' }}
                    >
                      <Thumb src={product.image} alt={product.name} size={38} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                          {product.name}
                        </span>
                        <span
                          className="block truncate"
                          style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                        >
                          SKU <span className="ds-num">{product.sku}</span>
                          {' · threshold '}
                          <span className="ds-num">{product.lowStockThreshold ?? 10}</span>
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        <span
                          className="block font-black ds-num leading-tight"
                          style={{
                            fontSize: 'var(--a-fs-xl)',
                            color: out ? 'var(--ds-danger)' : 'var(--ds-warning-text)',
                          }}
                        >
                          {product.stock}
                        </span>
                        <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          {product.unit || ''}
                        </span>
                      </span>
                      <Badge status={out ? 'out_of_stock' : 'low_stock'} className="shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
            style={{ padding: 'var(--ds-card-pad)', borderTop: '1px solid var(--a-border)' }}
          >
            {[
              { label: 'Low Stock', value: stats?.lowStockCount, color: ACCENTS.amber, icon: AlertTriangle },
              { label: 'Out of Stock', value: stats?.outOfStockCount, color: 'var(--ds-danger)', icon: PackageX },
              { label: 'Expires ≤ 90 days', value: stats?.expiringSoonCount, color: ACCENTS.violet, icon: CalendarClock },
              { label: 'Expired', value: stats?.expiredCount, color: 'var(--ds-danger)', icon: CalendarClock },
            ].map((item) => {
              const ItemIcon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={onOpenInventory}
                  className="flex items-center gap-2 text-left cursor-pointer transition-colors"
                  style={{
                    padding: 'var(--ds-s-2)',
                    borderRadius: 'var(--ds-r-md)',
                    background: mix(item.color, 0.08),
                    minHeight: 'var(--ds-h-sm)',
                  }}
                >
                  <ItemIcon className="w-3.5 h-3.5 shrink-0" style={{ color: item.color }} />
                  <span className="min-w-0">
                    <span
                      className="block truncate"
                      style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                    >
                      {item.label}
                    </span>
                    {loading ? (
                      <span className="ds-skeleton block h-3 w-8" />
                    ) : (
                      <span className="block font-bold ds-num" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {Number(item.value || 0)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card accent={ACCENTS.violet}>
          <CardHeader title="Quick Actions" subtitle="Everyday tasks in one click" icon={Boxes} accent={ACCENTS.violet} />
          <div className="space-y-2">
            <QuickAction label="Add Product" icon={Plus} color={ACCENTS.primary} onClick={onOpenProducts} />
            <QuickAction label="View Orders" icon={ShoppingCart} color={ACCENTS.indigo} onClick={onOpenOrders} />
            <QuickAction label="Stock Management" icon={Boxes} color={ACCENTS.amber} onClick={onOpenInventory} />
            <QuickAction label="Product Catalog" icon={Package} color={ACCENTS.teal} onClick={onOpenProducts} />
          </div>
        </Card>
      </div>
    </div>
  );
};
