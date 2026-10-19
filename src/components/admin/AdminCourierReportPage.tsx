import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, Package, Wallet, CheckCircle2, Undo2, Clock, RefreshCw, Download, Search, ExternalLink, XCircle, Percent } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PageHeader, StatCard, Card, CardHeader, Button, FilterPills, Select, Field, TableWrap, EmptyState, ErrorState, SectionLoader } from './ui.tsx';

/**
 * v3.11 — Courier report: how many parcels and products each courier carried,
 * and for how much money (delivered, returned, still on the way).
 */

interface Outcome {
  parcels: number;
  items?: number;
  amount: number;
}
interface CourierRow {
  courier: string;
  name: string;
  parcels: number;
  items: number;
  amount: number;
  codAmount: number;
  deliveryCharge: number;
  delivered: Outcome;
  returned: Outcome;
  cancelled: Outcome;
  inTransit: Outcome;
  deliveryRate: number | null;
}
interface Parcel {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  courier: string;
  consignmentId: string;
  courierStatus: string;
  orderStatus: string;
  items: number;
  amount: number;
  sentAt: string;
  outcome: 'delivered' | 'returned' | 'cancelled' | 'inTransit';
  trackingUrl: string;
}
interface Report {
  from: string;
  to: string;
  couriers: CourierRow[];
  total: CourierRow;
  series: Array<Record<string, any>>;
  parcels: Parcel[];
  truncated?: boolean;
}

const COLORS: Record<string, string> = {
  steadfast: '#0f9d58',
  pathao: '#e2136e',
  redx: '#e2202c',
  carrybee: '#f5a623',
  paperfly: '#3277e3',
  sundarban: '#7c5cf0',
  manual: '#55606f',
};
const colorOf = (key: string, index = 0) => COLORS[key] || ['#0fa3a3', '#7c5cf0', '#e8a33d', '#3277e3'][index % 4];

const pad = (value: number) => String(value).padStart(2, '0');
const localDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const shift = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDay(date);
};
const PRESETS: Array<{ id: string; label: string; range: () => [string, string] }> = [
  { id: 'today', label: 'Today', range: () => [shift(0), shift(0)] },
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
  { id: 'year', label: 'This year', range: () => [`${new Date().getFullYear()}-01-01`, shift(0)] },
  { id: 'custom', label: 'Custom', range: () => [shift(-29), shift(0)] },
];

const OUTCOME: Record<Parcel['outcome'], { label: string; bg: string; fg: string }> = {
  delivered: { label: 'Delivered', bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)' },
  returned: { label: 'Returned', bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)' },
  cancelled: { label: 'Cancelled', bg: 'var(--ds-neutral-soft)', fg: 'var(--ds-neutral-text)' },
  inTransit: { label: 'On the way', bg: 'var(--ds-info-soft)', fg: 'var(--ds-info-text)' },
};

export const AdminCourierReportPage: React.FC<{ currency?: string }> = ({ currency = '৳' }) => {
  const [preset, setPreset] = useState('30d');
  const [[from, to], setRange] = useState<[string, string]>(() => PRESETS[2].range());
  const [courier, setCourier] = useState('');
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState('all');

  const money = (value: number) => `${currency}${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from, to });
      if (courier) params.set('courier', courier);
      const res = await fetch(`/api/admin/reports/couriers?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Could not load the report.');
      setData(body);
    } catch (err: any) {
      setError(err?.message || 'Could not load the report.');
    } finally {
      setLoading(false);
    }
  }, [from, to, courier]);
  useEffect(() => {
    void load();
  }, [load]);

  const choosePreset = (id: string) => {
    setPreset(id);
    const item = PRESETS.find((entry) => entry.id === id);
    if (item && id !== 'custom') setRange(item.range());
  };

  const couriers = data?.couriers || [];
  const total = data?.total;
  const keys = couriers.map((row) => row.courier);

  const parcels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.parcels || []).filter(
      (row) =>
        (outcome === 'all' || row.outcome === outcome) &&
        (!q || `${row.orderNumber} ${row.customerName} ${row.customerPhone} ${row.consignmentId}`.toLowerCase().includes(q))
    );
  }, [data?.parcels, query, outcome]);

  const exportCsv = () => {
    if (!data) return;
    const head = ['Courier', 'Parcels', 'Products', 'Amount', 'To collect (COD)', 'Delivered', 'Delivered amount', 'Returned', 'Returned amount', 'On the way', 'On the way amount', 'Cancelled', 'Delivery rate %'];
    const lines = [head, ...[...couriers, ...(total ? [total] : [])].map((row) => [
      row.name,
      row.parcels,
      row.items,
      row.amount,
      row.codAmount,
      row.delivered.parcels,
      row.delivered.amount,
      row.returned.parcels,
      row.returned.amount,
      row.inTransit.parcels,
      row.inTransit.amount,
      row.cancelled.parcels,
      row.deliveryRate ?? '',
    ])];
    const csv = lines.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `courier-report-${from}-to-${to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  };

  const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

  return (
    <div>
      <PageHeader
        title="Courier Report"
        subtitle="Parcels, products and money per courier — delivered, returned and still on the way."
        icon={Truck}
        actions={
          <>
            <Button icon={RefreshCw} onClick={load} aria-label="Refresh">
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="primary" icon={Download} onClick={exportCsv} disabled={!data || couriers.length === 0}>
              Export CSV
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <FilterPills pills={PRESETS.map((item) => ({ id: item.id, label: item.label }))} active={preset} onChange={choosePreset} />
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3 items-end">
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
          <Field label="Courier" className="col-span-2 lg:col-span-1">
            <Select
              value={courier}
              onChange={setCourier}
              options={[
                { value: '', label: 'All couriers' },
                { value: 'steadfast', label: 'Steadfast' },
                { value: 'pathao', label: 'Pathao' },
                { value: 'redx', label: 'RedX' },
                { value: 'carrybee', label: 'Carrybee' },
                { value: 'paperfly', label: 'Paperfly' },
                { value: 'manual', label: 'In-house delivery' },
              ]}
            />
          </Field>
        </div>
      </Card>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading && !data ? (
        <SectionLoader lines={6} />
      ) : !total || total.parcels === 0 ? (
        <EmptyState icon={Truck} title="No parcels in this period" description="Orders sent to a courier between these dates appear here." />
      ) : (
        <div className="space-y-4" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          {/* Headline numbers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard label="Parcels sent" value={total.parcels.toLocaleString('en-US')} icon={Truck} color="var(--ds-info)" />
            <StatCard label="Products sent" value={total.items.toLocaleString('en-US')} icon={Package} color="var(--ds-violet)" />
            <StatCard label="Parcel value" value={money(total.amount)} icon={Wallet} color="var(--primary)" />
            <StatCard
              label="Delivery rate"
              value={total.deliveryRate === null ? '—' : `${total.deliveryRate}%`}
              icon={Percent}
              color={total.deliveryRate !== null && total.deliveryRate < 70 ? 'var(--ds-danger)' : 'var(--ds-success)'}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label={`Delivered (${total.delivered.parcels})`} value={money(total.delivered.amount)} icon={CheckCircle2} color="var(--ds-success)" />
            <StatCard label={`Returned (${total.returned.parcels})`} value={money(total.returned.amount)} icon={Undo2} color="var(--ds-danger)" />
            <StatCard label={`On the way (${total.inTransit.parcels})`} value={money(total.inTransit.amount)} icon={Clock} color="var(--ds-warning)" />
          </div>

          {/* One card per courier */}
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
            {couriers.map((row, index) => {
              const color = colorOf(row.courier, index);
              const done = row.delivered.parcels;
              return (
                <div key={row.courier} className="a-card p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="inline-flex items-center justify-center shrink-0 font-black text-white"
                        style={{ width: 38, height: 38, borderRadius: 12, background: color, fontSize: 'var(--a-fs-md)' }}
                      >
                        {row.name.charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold truncate" style={{ fontSize: 'var(--a-fs-lg)' }}>
                          {row.name}
                        </p>
                        <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          <span className="ds-num">{row.parcels}</span> {row.parcels === 1 ? 'parcel' : 'parcels'} · <span className="ds-num">{row.items}</span>{' '}
                          {row.items === 1 ? 'product' : 'products'}
                        </p>
                      </div>
                    </div>
                    <span className="font-bold ds-num shrink-0" style={{ fontSize: 'var(--ds-fs-xl)' }}>
                      {money(row.amount)}
                    </span>
                  </div>
                  {/* delivered / on the way / returned / cancelled */}
                  <div className="flex h-2.5 rounded-full overflow-hidden mb-3" style={{ background: 'var(--a-border)' }}>
                    {[
                      { part: row.delivered.parcels, color: 'var(--ds-success)' },
                      { part: row.inTransit.parcels, color: 'var(--ds-warning)' },
                      { part: row.returned.parcels, color: 'var(--ds-danger)' },
                      { part: row.cancelled.parcels, color: 'var(--ds-gray-400)' },
                    ].map((seg, i) => (
                      <span key={i} style={{ width: `${share(seg.part, row.parcels)}%`, background: seg.color }} />
                    ))}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5" style={{ fontSize: 'var(--a-fs-sm)' }}>
                    {[
                      ['Delivered', row.delivered, 'var(--ds-success-text)'],
                      ['On the way', row.inTransit, 'var(--ds-warning-text)'],
                      ['Returned', row.returned, 'var(--ds-danger-text)'],
                      ['Cancelled', row.cancelled, 'var(--a-text-muted)'],
                    ].map(([label, value, tone]: any) => (
                      <div key={label} className="flex items-center justify-between gap-2">
                        <dt style={{ color: tone }} className="font-semibold">
                          {label} <span className="ds-num">({value.parcels})</span>
                        </dt>
                        <dd className="ds-num font-semibold">{money(value.amount)}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-3 pt-3 flex items-center justify-between border-t" style={{ borderColor: 'var(--a-border-soft)', fontSize: 'var(--a-fs-sm)' }}>
                    <span style={{ color: 'var(--a-text-muted)' }}>
                      To collect (COD): <strong className="ds-num" style={{ color: 'var(--a-text)' }}>{money(row.codAmount)}</strong>
                    </span>
                    <span className="font-bold ds-num" style={{ color: row.deliveryRate !== null && row.deliveryRate < 70 ? 'var(--ds-danger-text)' : 'var(--ds-success-text)' }}>
                      {row.deliveryRate === null ? '—' : `${row.deliveryRate}%`} {done > 0 ? 'delivered' : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Parcels per day */}
          {data && data.series.length > 1 && (
            <Card>
              <CardHeader title="Parcels per day" subtitle="Stacked by courier" icon={Truck} />
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={data.series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--a-border)" />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      tick={{ fontSize: 11 }}
                      minTickGap={16}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      labelFormatter={(day: any) => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      formatter={(value: any, name: any) => [value, couriers.find((row) => row.courier === name)?.name || name]}
                    />
                    <Legend formatter={(name: any) => couriers.find((row) => row.courier === name)?.name || name} />
                    {keys.map((key, index) => (
                      <Bar key={key} dataKey={key} stackId="parcels" fill={colorOf(key, index)} radius={index === keys.length - 1 ? [4, 4, 0, 0] : 0} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Table */}
          <TableWrap>
            <table style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th>Courier</th>
                  <th className="text-right">Parcels</th>
                  <th className="text-right">Products</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Delivered</th>
                  <th className="text-right">Returned</th>
                  <th className="text-right">On the way</th>
                  <th className="text-right">COD to collect</th>
                  <th className="text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {[...couriers, ...(total ? [total] : [])].map((row, index) => (
                  <tr key={row.courier} style={row.courier === 'all' ? { fontWeight: 700, background: 'var(--a-surface-2)' } : undefined}>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        {row.courier !== 'all' && <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf(row.courier, index) }} />}
                        {row.name}
                      </span>
                    </td>
                    <td className="text-right ds-num">{row.parcels}</td>
                    <td className="text-right ds-num">{row.items}</td>
                    <td className="text-right ds-num">{money(row.amount)}</td>
                    <td className="text-right ds-num">
                      {row.delivered.parcels} · {money(row.delivered.amount)}
                    </td>
                    <td className="text-right ds-num">
                      {row.returned.parcels} · {money(row.returned.amount)}
                    </td>
                    <td className="text-right ds-num">
                      {row.inTransit.parcels} · {money(row.inTransit.amount)}
                    </td>
                    <td className="text-right ds-num">{money(row.codAmount)}</td>
                    <td className="text-right ds-num">{row.deliveryRate === null ? '—' : `${row.deliveryRate}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          {/* Parcels */}
          <Card>
            <CardHeader title="Parcels" subtitle={data?.parcels.length === 500 ? 'Latest 500 in this period' : 'Every parcel in this period'} icon={Package} />
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px] gap-3 mb-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--a-text-faint)' }} />
                <input className="a-field pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Order, customer, phone or consignment…" />
              </div>
              <Select
                value={outcome}
                onChange={setOutcome}
                options={[
                  { value: 'all', label: 'All parcels' },
                  { value: 'delivered', label: 'Delivered' },
                  { value: 'inTransit', label: 'On the way' },
                  { value: 'returned', label: 'Returned' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
            </div>
            {parcels.length === 0 ? (
              <p className="py-6 text-center" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                <XCircle className="w-4 h-4 inline mr-1" /> No parcels match.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table style={{ minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Courier</th>
                      <th>Consignment</th>
                      <th className="text-right">Products</th>
                      <th className="text-right">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcels.slice(0, 300).map((row) => (
                      <tr key={row.id}>
                        <td className="ds-num font-semibold">
                          {row.orderNumber}
                          <span className="block font-normal" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                            {new Date(row.sentAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' })}
                          </span>
                        </td>
                        <td>
                          {row.customerName}
                          <span className="block ds-num" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                            {row.customerPhone}
                          </span>
                        </td>
                        <td>{couriers.find((c) => c.courier === row.courier)?.name || row.courier}</td>
                        <td className="ds-num">
                          {row.trackingUrl ? (
                            <a href={row.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--primary-ink, var(--primary))' }}>
                              {row.consignmentId} <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            row.consignmentId || '—'
                          )}
                        </td>
                        <td className="text-right ds-num">{row.items}</td>
                        <td className="text-right ds-num">{money(row.amount)}</td>
                        <td>
                          <span
                            className="inline-flex items-center h-6 px-2 rounded-full font-semibold"
                            style={{ fontSize: 'var(--a-fs-xs)', background: OUTCOME[row.outcome].bg, color: OUTCOME[row.outcome].fg }}
                          >
                            {OUTCOME[row.outcome].label}
                          </span>
                          {row.courierStatus && (
                            <span className="block mt-0.5" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                              {String(row.courierStatus).replace(/_/g, ' ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
