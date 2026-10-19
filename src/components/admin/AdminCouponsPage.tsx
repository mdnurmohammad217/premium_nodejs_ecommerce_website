import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ticket,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Percent,
  BadgeDollarSign,
  CheckCircle2,
  CalendarClock,
  RefreshCw,
  Users,
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
  Drawer,
  ConfirmDialog,
  Field,
  Toggle,
  Money,
  useToasts,
  ACCENTS,
} from './ui.tsx';

interface Props {
  currency?: string;
}

const emptyCoupon = () => ({
  id: null as number | null,
  code: '',
  type: 'percentage',
  value: '',
  minOrder: '0',
  maxDiscount: '',
  usageLimit: 100,
  expiresAt: '',
  status: 'active',
});

const today = () => new Date().toISOString().slice(0, 10);

type Validity = { key: 'active' | 'expired' | 'scheduled'; label: string; tone: { bg: string; fg: string } };

/**
 * Where a coupon sits in its own calendar, independent of the on/off switch.
 * A start date is optional in the data, so a coupon only reads as "scheduled"
 * when one is present and still in the future.
 */
const validityOf = (row: any): Validity => {
  const now = today();
  const starts = row.startsAt || row.startDate || '';
  if (row.expiresAt && String(row.expiresAt) < now) {
    return { key: 'expired', label: 'Expired', tone: { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)' } };
  }
  if (starts && String(starts) > now) {
    return { key: 'scheduled', label: 'Scheduled', tone: { bg: 'var(--ds-info-soft)', fg: 'var(--ds-info-text)' } };
  }
  return { key: 'active', label: 'Active', tone: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)' } };
};

/** What the customer actually saves on a given basket, with the cap applied */
const discountFor = (type: string, value: number, order: number, maxDiscount: number | null) => {
  if (order <= 0 || value <= 0) return 0;
  if (type === 'percentage') {
    const raw = (order * value) / 100;
    return maxDiscount && maxDiscount > 0 ? Math.min(raw, maxDiscount) : raw;
  }
  return Math.min(value, order);
};

/** A thin bar showing how much of the usage limit is gone */
const UsageBar: React.FC<{ used: number; limit: number }> = ({ used, limit }) => {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const colour =
    ratio >= 1 ? 'var(--ds-danger)' : ratio >= 0.75 ? 'var(--ds-warning)' : 'var(--primary)';
  return (
    <span
      className="block w-full overflow-hidden"
      style={{ height: 4, borderRadius: 'var(--ds-r-full)', background: 'var(--a-surface-3)' }}
    >
      <span
        className="block h-full"
        style={{
          width: `${Math.round(ratio * 100)}%`,
          background: colour,
          borderRadius: 'inherit',
          transition: `width var(--ds-dur) var(--ds-ease)`,
        }}
      />
    </span>
  );
};

/**
 * Coupons — one row per promo code with its discount, how much of the usage
 * limit is gone and where it sits in its validity window. The form previews the
 * actual saving before the code is ever handed to a customer.
 */
export const AdminCouponsPage: React.FC<Props> = ({ currency = '৳' }) => {
  const toasts = useToasts();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState(emptyCoupon());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/coupons');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load coupons.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const now = today();
    return {
      total: rows.length,
      active: rows.filter((row) => row.status === 'active' && !(row.expiresAt && row.expiresAt < now))
        .length,
      expired: rows.filter((row) => row.expiresAt && row.expiresAt < now).length,
      used: rows.reduce((sum, row) => sum + Number(row.usedCount || 0), 0),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (typeFilter !== 'all' && row.type !== typeFilter) return false;
      if (statusFilter === 'expired' && validityOf(row).key !== 'expired') return false;
      if (statusFilter === 'active' && !(row.status === 'active' && validityOf(row).key === 'active')) {
        return false;
      }
      if (statusFilter === 'inactive' && row.status !== 'inactive') return false;
      if (term && !String(row.code || '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, search, statusFilter, typeFilter]);

  const openAdd = () => {
    setDraft(emptyCoupon());
    setDrawerOpen(true);
  };

  const save = async () => {
    const code = draft.code.trim().toUpperCase();
    if (!code) return toasts.push('Enter a coupon code.', 'error');
    if (!(Number(draft.value) > 0)) return toasts.push('Enter a discount amount.', 'error');
    if (draft.type === 'percentage' && Number(draft.value) > 100) {
      return toasts.push('Percentage cannot be more than 100.', 'error');
    }

    setSaving(true);
    try {
      const payload = {
        code,
        type: draft.type,
        value: Number(draft.value),
        minOrder: Number(draft.minOrder || 0),
        maxDiscount: draft.maxDiscount ? Number(draft.maxDiscount) : null,
        usageLimit: Number(draft.usageLimit || 0),
        expiresAt: draft.expiresAt || null,
        status: draft.status,
      };
      const res = await fetch(draft.id ? `/api/admin/coupons/${draft.id}` : '/api/admin/coupons', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'failed');
      toasts.push(draft.id ? 'Coupon updated.' : 'Coupon created.');
      setDrawerOpen(false);
      load();
    } catch (err: any) {
      toasts.push(err.message || 'Could not save the coupon.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/coupons/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toasts.push('Coupon deleted.');
      setConfirmDelete(null);
      load();
    } catch {
      toasts.push('Could not delete the coupon.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (coupon: any) => {
    const next = coupon.status === 'active' ? 'inactive' : 'active';
    setRows((list) => list.map((row) => (row.id === coupon.id ? { ...row, status: next } : row)));
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...coupon, status: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toasts.push('Could not update the status.', 'error');
      load();
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    toasts.push('Code copied.', 'info');
  };

  /* --------------------------------------------------------- form preview */
  const sampleOrder = Number(draft.minOrder) > 0 ? Number(draft.minOrder) : 1000;
  const previewDiscount = discountFor(
    draft.type,
    Number(draft.value || 0),
    sampleOrder,
    draft.maxDiscount ? Number(draft.maxDiscount) : null
  );

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Coupons & Promo Codes"
        subtitle="Create discount codes and control their expiry and usage limits"
        icon={Ticket}
        accent={ACCENTS.rose}
        actions={
          <>
            <Button icon={RefreshCw} onClick={load} loading={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={openAdd}>
              Add Coupon
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Coupons" value={stats.total} icon={Ticket} color={ACCENTS.rose} loading={loading} />
        <StatCard
          label="Active"
          value={stats.active}
          icon={CheckCircle2}
          color="var(--ds-success)"
          loading={loading}
        />
        <StatCard
          label="Expired"
          value={stats.expired}
          icon={CalendarClock}
          color="var(--ds-warning)"
          loading={loading}
        />
        <StatCard
          label="Total Uses"
          value={stats.used}
          icon={Users}
          color={ACCENTS.indigo}
          loading={loading}
          deltaNote="Across all coupons"
        />
      </div>

      <Card className="mb-4" padded={false}>
        <Toolbar className="p-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search coupon codes"
            className="flex-1 min-w-0"
          />

          <FilterPills
            pills={[
              { id: 'all', label: 'All', count: stats.total },
              { id: 'active', label: 'Active', count: stats.active, color: 'var(--ds-success)' },
              { id: 'expired', label: 'Expired', count: stats.expired, color: 'var(--ds-warning)' },
              {
                id: 'inactive',
                label: 'Inactive',
                count: rows.filter((row) => row.status === 'inactive').length,
                color: 'var(--ds-text-muted)',
              },
            ]}
            active={statusFilter}
            onChange={setStatusFilter}
          />

          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            className="lg:w-[170px] shrink-0"
            options={[
              { value: 'all', label: 'All Types' },
              { value: 'percentage', label: 'Percentage (%)' },
              { value: 'fixed', label: `Fixed (${currency})` },
            ]}
          />
        </Toolbar>
      </Card>

      <TableWrap>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Discount</th>
                <th style={{ textAlign: 'right' }}>Min. Order</th>
                <th style={{ textAlign: 'right' }}>Max. Discount</th>
                <th style={{ minWidth: 130 }}>Usage</th>
                <th>Expiry</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRows rows={5} cols={9} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-0">
                    <EmptyState
                      title={rows.length === 0 ? 'No coupons yet' : 'No coupons match your filters'}
                      description={
                        rows.length === 0
                          ? 'Create your first promo code — customers enter it at checkout to get a discount.'
                          : 'Try changing your filters.'
                      }
                      icon={Ticket}
                      action={
                        rows.length === 0 ? (
                          <Button variant="primary" icon={Plus} onClick={openAdd}>
                            Add Coupon
                          </Button>
                        ) : (
                          <Button
                            onClick={() => {
                              setSearch('');
                              setStatusFilter('all');
                              setTypeFilter('all');
                            }}
                          >
                            Clear Filters
                          </Button>
                        )
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const validity = validityOf(row);
                  const used = Number(row.usedCount || 0);
                  const limit = Number(row.usageLimit || 0);
                  const isPercent = row.type === 'percentage';

                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="ds-num font-bold px-2 py-1 whitespace-nowrap"
                            style={{
                              borderRadius: 'var(--ds-r-sm)',
                              background: 'var(--a-surface-3)',
                              letterSpacing: 'var(--ds-tracking-wide)',
                              fontSize: 'var(--a-fs-md)',
                            }}
                          >
                            {row.code}
                          </span>
                          <IconButton
                            icon={Copy}
                            size="sm"
                            tone="plain"
                            label={`Copy ${row.code}`}
                            onClick={() => copyCode(row.code)}
                          />
                        </div>
                      </td>

                      <td>
                        <Badge
                          tone={
                            isPercent
                              ? { bg: 'var(--ds-violet-soft)', fg: 'var(--ds-violet)' }
                              : { bg: 'var(--ds-teal-soft)', fg: 'var(--ds-teal)' }
                          }
                        >
                          {isPercent ? 'Percentage' : 'Fixed'}
                        </Badge>
                      </td>

                      <td className="font-bold" style={{ textAlign: 'right' }}>
                        {isPercent ? (
                          <span className="ds-num">{Number(row.value)}%</span>
                        ) : (
                          <Money value={row.value} currency={currency} bold />
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        {Number(row.minOrder) > 0 ? (
                          <Money value={row.minOrder} currency={currency} />
                        ) : (
                          <span style={{ color: 'var(--a-text-faint)' }}>—</span>
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        {row.maxDiscount ? (
                          <Money value={row.maxDiscount} currency={currency} />
                        ) : (
                          <span style={{ color: 'var(--a-text-faint)' }}>—</span>
                        )}
                      </td>

                      <td>
                        <div
                          className="flex items-center justify-between gap-2 mb-1.5"
                          style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                        >
                          <span className="ds-num font-bold" style={{ color: 'var(--a-text)' }}>
                            {used}
                          </span>
                          <span className="ds-num">{limit > 0 ? limit : '∞'}</span>
                        </div>
                        <UsageBar used={used} limit={limit} />
                      </td>

                      <td>
                        <div className="flex flex-col gap-1">
                          <Badge tone={validity.tone} dot>
                            {validity.label}
                          </Badge>
                          <span className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                            {row.expiresAt || 'No expiry'}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span role="group" aria-label={`${row.code} status`}>
                          <Toggle
                            checked={row.status === 'active'}
                            onChange={() => toggleStatus(row)}
                          />
                        </span>
                      </td>

                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <IconButton
                            icon={Pencil}
                            size="sm"
                            tone="primary"
                            label="Edit Coupon"
                            onClick={() => {
                              setDraft({
                                ...emptyCoupon(),
                                ...row,
                                value: String(row.value ?? ''),
                                minOrder: String(row.minOrder ?? '0'),
                                maxDiscount: row.maxDiscount ? String(row.maxDiscount) : '',
                                expiresAt: row.expiresAt || '',
                              });
                              setDrawerOpen(true);
                            }}
                          />
                          <IconButton
                            icon={Trash2}
                            size="sm"
                            tone="danger"
                            label="Delete Coupon"
                            onClick={() => setConfirmDelete(row)}
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

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={draft.id ? 'Edit Coupon' : 'New Coupon'}
        subtitle="Customers enter this code in the coupon field at checkout"
        footer={
          <>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {draft.id ? 'Save Changes' : 'Create Coupon'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Coupon code" required>
            <input
              className="a-field ds-num uppercase"
              value={draft.code}
              onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}
              placeholder="WELCOME10"
              style={{ letterSpacing: 'var(--ds-tracking-wide)', fontWeight: 'var(--ds-fw-bold)' }}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Discount type">
              <Select
                value={draft.type}
                onChange={(value) => setDraft({ ...draft, type: value })}
                options={[
                  { value: 'percentage', label: 'Percentage (%)' },
                  { value: 'fixed', label: `Fixed amount (${currency})` },
                ]}
              />
            </Field>
            <Field
              label={draft.type === 'percentage' ? 'Discount (%)' : `Discount (${currency})`}
              required
            >
              <input
                type="number"
                min={0}
                className="a-field ds-num"
                value={draft.value}
                onChange={(event) => setDraft({ ...draft, value: event.target.value })}
                placeholder="0"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={`Minimum order (${currency})`}>
              <input
                type="number"
                min={0}
                className="a-field ds-num"
                value={draft.minOrder}
                onChange={(event) => setDraft({ ...draft, minOrder: event.target.value })}
                placeholder="0"
              />
            </Field>
            <Field label={`Maximum discount (${currency})`}>
              <input
                type="number"
                min={0}
                className="a-field ds-num"
                value={draft.maxDiscount}
                onChange={(event) => setDraft({ ...draft, maxDiscount: event.target.value })}
                disabled={draft.type !== 'percentage'}
                placeholder="0"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Usage limit" hint="How many orders may use this code in total. 0 = no limit.">
              <input
                type="number"
                min={0}
                className="a-field ds-num"
                value={draft.usageLimit}
                onChange={(event) => setDraft({ ...draft, usageLimit: Number(event.target.value) })}
                placeholder="0"
              />
            </Field>
            <Field label="Expiry date">
              <input
                type="date"
                className="a-field ds-num"
                value={draft.expiresAt}
                onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })}
              />
            </Field>
          </div>

          {/* Live reading of what this coupon does to a real basket */}
          <div
            className="p-4"
            style={{
              borderRadius: 'var(--ds-r-lg)',
              background: 'var(--a-surface-2)',
              border: '1px solid var(--a-border)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="inline-flex items-center justify-center shrink-0"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--ds-r-md)',
                  background: 'var(--ds-success-soft)',
                  color: 'var(--ds-success-text)',
                }}
              >
                {draft.type === 'percentage' ? (
                  <Percent className="w-4 h-4" />
                ) : (
                  <BadgeDollarSign className="w-4 h-4" />
                )}
              </span>
              <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                Discount Preview
              </span>
            </div>

            <p style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-soft)' }}>
              On a <Money value={sampleOrder} currency={currency} bold /> order,{' '}
              <span className="font-bold" style={{ color: 'var(--ds-success-text)' }}>
                <Money value={previewDiscount} currency={currency} bold />
              </span>{' '}
              off — the customer pays{' '}
              <Money value={Math.max(0, sampleOrder - previewDiscount)} currency={currency} bold />.
            </p>

            {draft.type === 'percentage' && draft.maxDiscount && (
              <p className="mt-1" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                Discount is capped at <Money value={draft.maxDiscount} currency={currency} />.
              </p>
            )}
          </div>

          <Toggle
            checked={draft.status === 'active'}
            onChange={(value) => setDraft({ ...draft, status: value ? 'active' : 'inactive' })}
            label="Coupon is active"
            description="When inactive, this code is not accepted at checkout"
          />
        </div>
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete coupon?"
        message={`"${confirmDelete?.code || ''}" will stop working immediately.`}
        confirmLabel="Delete"
        busy={saving}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
