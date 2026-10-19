import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  LayoutGrid,
  CalendarCheck,
  CalendarClock,
  Plus,
  Edit2,
  Trash2,
  RotateCcw,
  Tags,
  BarChart3,
  Download,
  Printer,
  Receipt,
  Target,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  IconButton,
  Field,
  Select,
  SearchInput,
  Modal,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingRows,
  Pagination,
  Money,
  useToasts,
  mix,
} from './ui.tsx';
import { MetricCard } from './MetricCard.tsx';

export type ExpensesView = 'list' | 'categories' | 'report';

interface Category {
  id: number;
  name: string;
  color: string;
  description?: string | null;
  monthlyBudget?: string | number | null;
  expenseCount: number;
  totalAmount: number;
  thisMonth: number;
}

const PAY_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'bank', label: 'Bank' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

const COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#0891b2', '#22c55e', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#64748b', '#78350f'];

const todayDhaka = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const showDate = (day: string) => {
  const date = new Date(`${String(day).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

const CategoryPill: React.FC<{ name: string; color?: string | null }> = ({ name, color }) => {
  const tone = color || '#64748b';
  return (
    <span
      className="inline-flex items-center font-semibold whitespace-nowrap max-w-full"
      style={{ padding: '4px 10px', borderRadius: 'var(--ds-r-sm)', background: mix(tone, 0.13), color: tone, fontSize: 'var(--a-fs-sm)' }}
    >
      <span className="truncate">{name}</span>
    </span>
  );
};

/**
 * Dashboard → Expenses: the list (with totals for all time, the current
 * filter, this month and last month), the categories (colour + optional
 * monthly budget), and the monthly report. The POS "Daily Expenses" module
 * writes to the same list.
 */
export const AdminExpensesPage: React.FC<{ view: ExpensesView; currency?: string; onOpenView?: (view: ExpensesView) => void }> = ({
  view,
  currency = '৳',
  onOpenView,
}) => {
  const toasts = useToasts();
  const [categories, setCategories] = useState<Category[]>([]);
  const loadCategories = useCallback(() => {
    fetch('/api/admin/expense-categories')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setCategories(Array.isArray(rows) ? rows : []))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const titles: Record<ExpensesView, string> = { list: 'All Expenses', categories: 'Categories', report: 'Monthly Report' };

  return (
    <div>
      {toasts.node}
      <PageHeader
        title={`Expenses / ${titles[view]}`}
        subtitle="Every shop expense in one place — rent, salaries, ads, delivery and more."
        icon={Wallet}
        actions={
          <div className="flex flex-wrap gap-2">
            {(['list', 'categories', 'report'] as ExpensesView[]).map((id) => (
              <Button key={id} variant={view === id ? 'primary' : 'secondary'} size="sm" onClick={() => onOpenView?.(id)}>
                {id === 'list' ? 'Expense List' : id === 'categories' ? 'Categories' : 'Monthly Report'}
              </Button>
            ))}
          </div>
        }
      />
      {view === 'list' && <ExpenseList categories={categories} currency={currency} notify={toasts.push} onChanged={loadCategories} />}
      {view === 'categories' && <CategoryManager categories={categories} currency={currency} notify={toasts.push} onChanged={loadCategories} />}
      {view === 'report' && <MonthlyReport currency={currency} />}
    </div>
  );
};

/* ========================================================================== */
/* Expense list                                                                */
/* ========================================================================== */

const ExpenseList: React.FC<{
  categories: Category[];
  currency: string;
  notify: (message: string, kind?: any) => void;
  onChanged: () => void;
}> = ({ categories, currency, notify, onChanged }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirm, setConfirm] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ category, page: String(page), pageSize: String(pageSize) });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/admin/expenses?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load expenses.');
      setRows(data.rows || []);
      setTotal(Number(data.total) || 0);
      setStats(data.stats || null);
    } catch (err: any) {
      setError(err.message || 'Could not load expenses.');
    } finally {
      setLoading(false);
    }
  }, [category, from, to, search, page, pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const colorOf = (name: string) => categories.find((c) => c.name === name)?.color;
  const filtered = category !== 'all' || from || to || search;

  const openNew = () => {
    setFormError('');
    setEditing({ category: categories[0]?.name || '', amount: '', description: '', expenseDate: todayDhaka(), paymentMethod: 'cash' });
  };

  const save = async () => {
    if (!editing) return;
    setFormError('');
    if (!editing.category) return setFormError('Choose a category.');
    if (!(Number(editing.amount) > 0)) return setFormError('Enter the amount.');
    setSaving(true);
    try {
      const res = await fetch(editing.id ? `/api/admin/expenses/${editing.id}` : '/api/admin/expenses', {
        method: editing.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      notify(editing.id ? 'Expense updated.' : 'Expense added.');
      setEditing(null);
      load();
      onChanged();
    } catch (err: any) {
      setFormError(err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm) return;
    try {
      const res = await fetch(`/api/admin/expenses/${confirm.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      notify('Expense deleted.');
      setConfirm(null);
      load();
      onChanged();
    } catch {
      notify('Could not delete the expense.', 'error');
    }
  };

  const exportCsv = async () => {
    const params = new URLSearchParams({ category, page: '1', pageSize: '200' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (search.trim()) params.set('search', search.trim());
    const res = await fetch(`/api/admin/expenses?${params.toString()}`);
    const data = await res.json().catch(() => ({ rows: [] }));
    const esc = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['Date', 'Category', 'Description', 'Amount', 'Paid by', 'Recorded by'].join(','),
      ...(data.rows || []).map((row: any) => [row.expenseDate, row.category, row.description, row.amount, row.paymentMethod, row.recordedBy].map(esc).join(',')),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `expenses-${todayDhaka()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard iconSide="left" icon={Wallet} color="var(--ds-teal)" label="All Expenses" note="All categories, all time" value={<Money value={stats?.allTime} currency={`${currency} `} />} loading={!stats} />
        <MetricCard iconSide="left" icon={LayoutGrid} color="var(--ds-amber)" label="Visible Results Total" note="Current filter result total" value={<Money value={stats?.visible} currency={`${currency} `} />} loading={!stats} />
        <MetricCard iconSide="left" icon={CalendarCheck} color="var(--ds-success)" label="This Month Expenses" note={stats?.thisMonthLabel} value={<Money value={stats?.thisMonth} currency={`${currency} `} />} loading={!stats} />
        <MetricCard iconSide="left" icon={CalendarClock} color="var(--ds-info)" label="Last Month Expenses" note={stats?.lastMonthLabel} value={<Money value={stats?.lastMonth} currency={`${currency} `} />} loading={!stats} />
      </div>

      <Card>
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold mb-3" style={{ fontSize: 'var(--a-fs-lg)' }}>
              Filter Expenses
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <Select
                value={category}
                onChange={(value) => {
                  setCategory(value);
                  setPage(1);
                }}
                options={[{ value: 'all', label: 'All Categories' }, ...categories.map((c) => ({ value: c.name, label: c.name }))]}
              />
              <input
                type="date"
                className="a-field ds-num"
                value={from}
                aria-label="From date"
                title="From date"
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
              />
              <input
                type="date"
                className="a-field ds-num"
                value={to}
                aria-label="To date"
                title="To date"
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
              />
              <SearchInput
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                placeholder="Search description"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {filtered && (
              <Button
                variant="ghost"
                icon={RotateCcw}
                onClick={() => {
                  setCategory('all');
                  setFrom('');
                  setTo('');
                  setSearch('');
                  setPage(1);
                }}
              >
                Reset
              </Button>
            )}
            <Button icon={Download} onClick={exportCsv}>
              CSV
            </Button>
            <Button variant="primary" icon={Plus} onClick={openNew}>
              Add Expense
            </Button>
          </div>
        </div>
      </Card>

      <div className="a-card overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <LoadingRows rows={6} cols={5} />
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <EmptyState
                          title={filtered ? 'No expenses match these filters' : 'No expenses yet'}
                          description={filtered ? 'Try another category or date.' : 'Add your first expense — rent, salary, ads…'}
                          icon={Receipt}
                          action={
                            <Button variant="primary" icon={Plus} onClick={openNew}>
                              Add Expense
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id}>
                        <td className="ds-num whitespace-nowrap" style={{ color: 'var(--a-text-muted)' }}>
                          {showDate(row.expenseDate)}
                        </td>
                        <td>
                          <CategoryPill name={row.category} color={row.color || colorOf(row.category)} />
                        </td>
                        <td style={{ maxWidth: 380 }}>
                          <div className="truncate" title={row.description || ''}>
                            {row.description || <span style={{ color: 'var(--a-text-faint)' }}>—</span>}
                          </div>
                          <div style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-faint)' }}>
                            {PAY_METHODS.find((m) => m.value === row.paymentMethod)?.label || row.paymentMethod}
                            {row.recordedBy ? ` · ${row.recordedBy === 'pos' ? 'POS' : row.recordedBy}` : ''}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }} className="whitespace-nowrap">
                          <Money value={row.amount} currency={`${currency} `} bold />
                        </td>
                        <td>
                          <div className="flex justify-end gap-1.5">
                            <IconButton icon={Edit2} label="Edit" onClick={() => setEditing({ ...row, amount: String(row.amount) })} />
                            <IconButton icon={Trash2} tone="danger" label="Delete" onClick={() => setConfirm(row)} />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Phones */}
            <div className="md:hidden p-3 space-y-2.5" style={{ background: 'var(--a-surface-2)' }}>
              {loading ? (
                <span className="ds-skeleton block h-24" />
              ) : rows.length === 0 ? (
                <EmptyState title="No expenses" icon={Receipt} />
              ) : (
                rows.map((row) => (
                  <div key={row.id} className="a-card p-3.5 flex items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <CategoryPill name={row.category} color={row.color || colorOf(row.category)} />
                        <Money value={row.amount} currency={`${currency} `} bold />
                      </div>
                      <div className="truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {row.description || '—'}
                      </div>
                      <div className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                        {showDate(row.expenseDate)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <IconButton icon={Edit2} label="Edit" onClick={() => setEditing({ ...row, amount: String(row.amount) })} />
                      <IconButton icon={Trash2} tone="danger" label="Delete" onClick={() => setConfirm(row)} />
                    </div>
                  </div>
                ))
              )}
            </div>
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
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Expense' : 'Add Expense'}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {editing?.id ? 'Save Changes' : 'Add Expense'}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Category" required>
                <Select
                  value={editing.category}
                  onChange={(value) => setEditing({ ...editing, category: value })}
                  options={[
                    { value: '', label: 'Choose…' },
                    ...categories.map((c) => ({ value: c.name, label: c.name })),
                    ...(editing.category && !categories.some((c) => c.name === editing.category) ? [{ value: editing.category, label: editing.category }] : []),
                  ]}
                />
              </Field>
              <Field label={`Amount (${currency})`} required>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="a-field ds-num"
                  value={editing.amount}
                  onChange={(event) => setEditing({ ...editing, amount: event.target.value })}
                  autoFocus
                />
              </Field>
              <Field label="Date">
                <input type="date" className="a-field ds-num" value={editing.expenseDate} onChange={(event) => setEditing({ ...editing, expenseDate: event.target.value })} />
              </Field>
              <Field label="Paid by">
                <Select value={editing.paymentMethod || 'cash'} onChange={(value) => setEditing({ ...editing, paymentMethod: value })} options={PAY_METHODS} />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                className="a-field"
                rows={3}
                value={editing.description || ''}
                onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                placeholder="e.g. Instagram influencer payment"
              />
            </Field>
            {formError && <p className="ds-error-text">{formError}</p>}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete this expense?"
        message={confirm ? `${confirm.category} — ${currency}${Number(confirm.amount).toLocaleString()} on ${showDate(confirm.expenseDate)} will be deleted.` : ''}
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

/* ========================================================================== */
/* Categories                                                                  */
/* ========================================================================== */

const CategoryManager: React.FC<{
  categories: Category[];
  currency: string;
  notify: (message: string, kind?: any) => void;
  onChanged: () => void;
}> = ({ categories, currency, notify, onChanged }) => {
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<Category | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [moveTo, setMoveTo] = useState('');

  const save = async () => {
    if (!editing) return;
    setError('');
    if (!String(editing.name || '').trim()) return setError('Enter a name.');
    setSaving(true);
    try {
      const res = await fetch(editing.id ? `/api/admin/expense-categories/${editing.id}` : '/api/admin/expense-categories', {
        method: editing.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      notify(editing.id ? 'Category updated.' : 'Category added.');
      setEditing(null);
      onChanged();
    } catch (err: any) {
      setError(err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!removing || removeBusy) return;
    setRemoveBusy(true);
    try {
      const res = await fetch(`/api/admin/expense-categories/${removing.id}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete.');
      notify('Category deleted.');
      setRemoving(null);
      setMoveTo('');
      onChanged();
    } catch (err: any) {
      notify(err.message || 'Could not delete.', 'error');
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Expense Categories"
          subtitle="Colours make the list easy to scan. A monthly budget shows how much of it is used on the Monthly Report."
          icon={Tags}
          actions={
            <Button variant="primary" icon={Plus} onClick={() => setEditing({ name: '', color: COLORS[categories.length % COLORS.length], monthlyBudget: '', description: '' })}>
              Add Category
            </Button>
          }
        />
        {categories.length === 0 ? (
          <EmptyState title="No categories yet" icon={Tags} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {categories.map((cat) => {
              const budget = Number(cat.monthlyBudget) || 0;
              const used = budget > 0 ? Math.min(100, Math.round((cat.thisMonth / budget) * 100)) : 0;
              return (
                <div key={cat.id} className="p-4 space-y-3" style={{ borderRadius: 'var(--ds-r-lg)', border: '1px solid var(--a-border)', borderLeft: `4px solid ${cat.color}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CategoryPill name={cat.name} color={cat.color} />
                      {cat.description && (
                        <p className="mt-1.5" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          {cat.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <IconButton icon={Edit2} size="sm" label="Edit" onClick={() => setEditing({ ...cat, monthlyBudget: cat.monthlyBudget ?? '' })} />
                      <IconButton icon={Trash2} size="sm" tone="danger" label="Delete" onClick={() => setRemoving(cat)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2" style={{ fontSize: 'var(--a-fs-sm)' }}>
                    <div>
                      <div style={{ color: 'var(--a-text-muted)' }}>Entries</div>
                      <div className="ds-num font-bold">{cat.expenseCount}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--a-text-muted)' }}>This month</div>
                      <div className="font-bold">
                        <Money value={cat.thisMonth} currency={currency} />
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--a-text-muted)' }}>All time</div>
                      <div className="font-bold">
                        <Money value={cat.totalAmount} currency={currency} />
                      </div>
                    </div>
                  </div>
                  {budget > 0 && (
                    <div>
                      <div className="flex justify-between mb-1" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                        <span>Budget {currency}{budget.toLocaleString()}</span>
                        <span className="ds-num">{used}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: 'var(--a-surface-3)' }}>
                        <div style={{ width: `${used}%`, height: '100%', borderRadius: 999, background: used >= 100 ? 'var(--ds-danger)' : cat.color }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Category' : 'Add Category'}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <Field label="Name" required>
              <input className="a-field" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} autoFocus />
            </Field>
            <Field label="Colour">
              <div className="flex flex-wrap items-center gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Colour ${color}`}
                    onClick={() => setEditing({ ...editing, color })}
                    className="cursor-pointer"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background: color,
                      boxShadow: editing.color === color ? `0 0 0 3px var(--a-surface), 0 0 0 5px ${color}` : 'none',
                    }}
                  />
                ))}
                <input type="color" value={editing.color || '#64748b'} onChange={(event) => setEditing({ ...editing, color: event.target.value })} aria-label="Custom colour" />
              </div>
            </Field>
            <Field label={`Monthly budget (${currency})`} hint="Optional — leave empty for no budget.">
              <input type="number" min={0} className="a-field ds-num" value={editing.monthlyBudget ?? ''} onChange={(event) => setEditing({ ...editing, monthlyBudget: event.target.value })} />
            </Field>
            <Field label="Description">
              <input className="a-field" value={editing.description || ''} onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
            </Field>
            {editing.id && <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Renaming also renames it on every expense.</p>}
            {error && <p className="ds-error-text">{error}</p>}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Delete “${removing?.name || ''}”?`}
        message={
          removing && removing.expenseCount > 0
            ? `${removing.expenseCount} expense${removing.expenseCount === 1 ? ' uses' : 's use'} this category. Choose where to move ${removing.expenseCount === 1 ? 'it' : 'them'}.`
            : 'This category has no expenses. It will be removed.'
        }
        confirmLabel="Delete"
        confirmDisabled={Boolean(removing?.expenseCount) && !moveTo}
        busy={removeBusy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      >
        {removing && removing.expenseCount > 0 && (
          <Select
            value={moveTo}
            onChange={setMoveTo}
            options={[{ value: '', label: 'Choose a category…' }, ...categories.filter((c) => c.id !== removing.id).map((c) => ({ value: c.name, label: c.name }))]}
          />
        )}
      </ConfirmDialog>
    </div>
  );
};

/* ========================================================================== */
/* Monthly report                                                              */
/* ========================================================================== */

const MonthlyReport: React.FC<{ currency: string }> = ({ currency }) => {
  const [year, setYear] = useState(Number(todayDhaka().slice(0, 4)));
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    setData(null);
    fetch(`/api/admin/expenses/monthly?year=${year}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not build the report.'));
  }, [year]);
  useEffect(load, [load]);

  const months: any[] = data?.months || [];
  const byCategory: any[] = useMemo(() => (data?.byCategory || []).filter((c: any) => c.total > 0).sort((a: any, b: any) => b.total - a.total), [data]);
  const activeCategories: any[] = useMemo(() => (data?.byCategory || []).filter((c: any) => c.total > 0), [data]);
  const current = months.find((m) => m.month === data?.currentMonth);
  const withSpend = months.filter((m) => m.total > 0);
  const average = withSpend.length ? data.total / withSpend.length : 0;
  const peak = months.reduce((best, m) => (m.total > (best?.total || 0) ? m : best), null as any);

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5 print-area">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="a-label" style={{ marginBottom: 0 }}>
              Year
            </span>
            <Select value={String(year)} onChange={(value) => setYear(Number(value))} options={(data?.years || [year]).map((y: number) => ({ value: String(y), label: String(y) }))} className="w-32" />
          </div>
          <Button icon={Printer} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={Wallet} color="var(--ds-teal)" label={`Total ${year}`} value={<Money value={data?.total} currency={currency} />} note={`${withSpend.length} month(s) with expenses`} loading={!data} />
        <MetricCard icon={CalendarCheck} color="var(--ds-success)" label="This month" value={<Money value={current?.total || 0} currency={currency} />} note={current ? `${current.count} entries` : '—'} loading={!data} />
        <MetricCard icon={BarChart3} color="var(--ds-amber)" label="Monthly average" value={<Money value={average} currency={currency} />} note="Months with expenses" loading={!data} />
        <MetricCard icon={Target} color="var(--ds-rose)" label="Highest month" value={<Money value={peak?.total || 0} currency={currency} />} note={peak?.total ? peak.label : '—'} loading={!data} />
      </div>

      <Card>
        <CardHeader title="Expenses by month" subtitle={`Every month of ${year}, split by category`} icon={BarChart3} />
        <div style={{ height: 300 }}>
          {data && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months.map((m) => ({ label: m.label, ...m.byCategory }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--a-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--a-text-muted)' }} axisLine={{ stroke: 'var(--a-border)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--a-text-muted)' }} axisLine={false} tickLine={false} width={56} tickFormatter={(value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(value))} />
                <Tooltip
                  cursor={{ fill: 'var(--a-surface-2)' }}
                  formatter={(value: any, name: any) => [`${currency}${Number(value).toLocaleString()}`, name]}
                  contentStyle={{ borderRadius: 8, border: '1px solid var(--a-border)', fontSize: 12 }}
                />
                {activeCategories.map((cat: any, index: number) => (
                  <Bar key={cat.name} dataKey={cat.name} stackId="a" fill={cat.color || COLORS[index % COLORS.length]} maxBarSize={36} radius={index === activeCategories.length - 1 ? [4, 4, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        {activeCategories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5" style={{ fontSize: 'var(--a-fs-sm)' }}>
            {activeCategories.map((cat: any) => (
              <span key={cat.name} className="inline-flex items-center gap-1.5">
                <span style={{ width: 10, height: 10, borderRadius: 3, background: cat.color }} />
                {cat.name}
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card padded={false}>
          <div className="p-4 border-b font-bold" style={{ borderColor: 'var(--a-border)' }}>
            Month by month
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th style={{ textAlign: 'right' }}>Entries</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>vs previous</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m, index) => {
                  const prev = months[index - 1]?.total || 0;
                  const change = prev > 0 ? Math.round(((m.total - prev) / prev) * 100) : null;
                  return (
                    <tr key={m.month} style={m.month === data?.currentMonth ? { background: mix('var(--primary)', 0.05) } : undefined}>
                      <td className="font-semibold">
                        {m.label} {year}
                      </td>
                      <td className="ds-num" style={{ textAlign: 'right' }}>
                        {m.count}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Money value={m.total} currency={currency} bold={m.total > 0} />
                      </td>
                      <td className="ds-num" style={{ textAlign: 'right', color: change === null ? 'var(--a-text-faint)' : change > 0 ? 'var(--ds-danger-text)' : 'var(--ds-success-text)' }}>
                        {change === null ? '—' : `${change > 0 ? '+' : ''}${change}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="By category" subtitle={`Share of ${year}'s expenses`} icon={Tags} />
          {byCategory.length === 0 ? (
            <EmptyState title="No expenses this year" icon={Receipt} />
          ) : (
            <div className="space-y-3">
              {byCategory.map((cat: any) => {
                const share = data.total > 0 ? Math.round((cat.total / data.total) * 100) : 0;
                const budget = Number(cat.monthlyBudget) || 0;
                const monthsWith = Math.max(1, withSpend.length);
                return (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between gap-2 mb-1" style={{ fontSize: 'var(--a-fs-md)' }}>
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: cat.color, flexShrink: 0 }} />
                        <span className="truncate font-semibold">{cat.name}</span>
                      </span>
                      <span className="shrink-0">
                        <Money value={cat.total} currency={currency} bold /> <span className="ds-num" style={{ color: 'var(--a-text-muted)' }}>· {share}%</span>
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: 'var(--a-surface-3)' }}>
                      <div style={{ width: `${share}%`, height: '100%', borderRadius: 999, background: cat.color }} />
                    </div>
                    {budget > 0 && (
                      <div className="mt-1" style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}>
                        Budget {currency}
                        {budget.toLocaleString()}/month · average {currency}
                        {Math.round(cat.total / monthsWith).toLocaleString()}/month
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
