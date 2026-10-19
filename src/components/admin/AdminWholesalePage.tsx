import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Store,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  Trash2,
  Eye,
  RefreshCw,
  Clock,
  Phone,
  Mail,
  MapPin,
  Briefcase,
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
  useToasts,
  useDebounced,
  ACCENTS,
} from './ui.tsx';

type Status = 'pending' | 'approved' | 'rejected' | 'suspended';

interface WholesaleCustomer {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  businessName?: string | null;
  businessAddress?: string | null;
  businessType?: string | null;
  wholesaleStatus: Status | null;
  wholesaleAppliedAt?: string | null;
  wholesaleReviewedAt?: string | null;
  wholesaleNote?: string | null;
  wholesaleOrders: number;
  wholesaleSpent: string;
  status?: string;
  createdAt?: string;
}

const STATUS_TONE: Record<Status, { bg: string; fg: string; label: string }> = {
  pending: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)', label: 'Pending' },
  approved: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', label: 'Approved' },
  rejected: { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)', label: 'Rejected' },
  suspended: { bg: 'var(--a-surface-3)', fg: 'var(--a-text-soft)', label: 'Suspended' },
};

const fmtDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

type Action = 'approve' | 'reject' | 'suspend' | 'reactivate';

/**
 * Dashboard → Customers → Wholesale Customers.
 * Review applications, approve / reject / suspend / reactivate / delete, and
 * switch Wholesale Auto Approval on or off.
 */
export const AdminWholesalePage: React.FC<{ currency?: string; onChanged?: () => void }> = ({
  currency = '৳',
  onChanged,
}) => {
  const toasts = useToasts();
  const [rows, setRows] = useState<WholesaleCustomer[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [autoApprove, setAutoApprove] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'all' | Status>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);

  const [viewing, setViewing] = useState<WholesaleCustomer | null>(null);
  const [pending, setPending] = useState<{ customer: WholesaleCustomer; action: Action } | null>(null);
  const [note, setNote] = useState('');
  const [deleting, setDeleting] = useState<WholesaleCustomer | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ status });
      if (debounced.trim()) params.set('search', debounced.trim());
      const res = await fetch(`/api/admin/wholesale/customers?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load wholesale customers.');
      setRows(Array.isArray(data.customers) ? data.customers : []);
      setCounts(data.counts || {});
      setAutoApprove(Boolean(data.config?.autoApprove));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleAuto = async (value: boolean) => {
    setSavingAuto(true);
    try {
      const res = await fetch('/api/admin/wholesale/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoApprove: value }),
      });
      if (!res.ok) throw new Error();
      setAutoApprove(value);
      toasts.push(value ? 'New wholesale accounts will be approved automatically.' : 'New wholesale accounts will wait for your approval.');
    } catch {
      toasts.push('Could not save the setting.', 'error');
    } finally {
      setSavingAuto(false);
    }
  };

  const runAction = async (customer: WholesaleCustomer, action: Action, reason = '') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/wholesale/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update the account.');
      const labels: Record<Action, string> = {
        approve: 'approved',
        reject: 'rejected',
        suspend: 'suspended',
        reactivate: 'reactivated',
      };
      toasts.push(`${customer.businessName || customer.name} ${labels[action]}.`);
      setPending(null);
      setNote('');
      if (viewing?.id === customer.id) setViewing({ ...viewing, ...data.customer });
      load();
      onChanged?.();
    } catch (err: any) {
      toasts.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/wholesale/customers/${deleting.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete.');
      toasts.push(data.message || 'Deleted.');
      setDeleting(null);
      setViewing(null);
      load();
      onChanged?.();
    } catch (err: any) {
      toasts.push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const pills = useMemo(
    () => [
      { id: 'all', label: 'All', count: counts.all || 0 },
      { id: 'pending', label: 'Pending', count: counts.pending || 0, color: ACCENTS.amber },
      { id: 'approved', label: 'Approved', count: counts.approved || 0, color: ACCENTS.success },
      { id: 'rejected', label: 'Rejected', count: counts.rejected || 0, color: ACCENTS.danger },
      { id: 'suspended', label: 'Suspended', count: counts.suspended || 0 },
    ],
    [counts]
  );

  /** The buttons that make sense for an account in its current status */
  const actionsFor = (customer: WholesaleCustomer, compact = false) => {
    const s = customer.wholesaleStatus || 'pending';
    const size = compact ? 'sm' : 'md';
    return (
      <>
        {(s === 'pending' || s === 'rejected') && (
          <Button size={size} variant="success" icon={CheckCircle2} onClick={() => runAction(customer, 'approve')} disabled={busy}>
            Approve
          </Button>
        )}
        {s === 'pending' && (
          <Button size={size} variant="ghost" icon={XCircle} onClick={() => setPending({ customer, action: 'reject' })} disabled={busy}>
            Reject
          </Button>
        )}
        {s === 'approved' && (
          <Button size={size} variant="ghost" icon={PauseCircle} onClick={() => setPending({ customer, action: 'suspend' })} disabled={busy}>
            Suspend
          </Button>
        )}
        {s === 'suspended' && (
          <Button size={size} variant="soft" icon={PlayCircle} onClick={() => runAction(customer, 'reactivate')} disabled={busy}>
            Reactivate
          </Button>
        )}
      </>
    );
  };

  const statusBadge = (s: Status | null) => {
    const tone = STATUS_TONE[s || 'pending'];
    return <Badge tone={tone}>{tone.label}</Badge>;
  };

  return (
    <div className="space-y-4">
      {toasts.node}
      <PageHeader
        title="Wholesale Customers"
        subtitle="Approve business buyers. Only approved accounts see and pay wholesale prices."
        icon={Store}
        accent={ACCENTS.indigo}
        actions={
          <Button icon={RefreshCw} onClick={load} disabled={loading}>
            Refresh
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Toggle
            checked={autoApprove}
            onChange={toggleAuto}
            disabled={savingAuto}
            label={`Wholesale Auto Approval: ${autoApprove ? 'ON' : 'OFF'}`}
            description={
              autoApprove
                ? 'New wholesale registrations are approved instantly.'
                : 'New wholesale registrations stay Pending until you approve them.'
            }
          />
          {(counts.pending || 0) > 0 && (
            <button
              type="button"
              onClick={() => setStatus('pending')}
              className="inline-flex items-center gap-2 px-3 h-9 cursor-pointer font-semibold shrink-0"
              style={{
                borderRadius: 'var(--ds-r-full)',
                background: 'var(--ds-warning-soft)',
                color: 'var(--ds-warning-text)',
                fontSize: 'var(--a-fs-sm)',
              }}
            >
              <Clock className="w-4 h-4" />
              {counts.pending} waiting for approval
            </button>
          )}
        </div>
      </Card>

      <Card>
        <Toolbar>
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 w-full">
            <div className="flex-1 min-w-0">
              <FilterPills pills={pills} active={status} onChange={(id) => setStatus(id as any)} />
            </div>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search name, shop, phone"
              className="lg:w-72"
            />
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
                <th>Business</th>
                <th>Contact</th>
                <th>Type</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Orders</th>
                <th>Applied</th>
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
                      icon={Store}
                      title={status === 'all' ? 'No wholesale customers yet' : `No ${status} accounts`}
                      description="Customers apply from the website: Sign in → Register as Wholesale Customer."
                    />
                  </td>
                </tr>
              ) : (
                rows.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => setViewing(customer)}
                        className="text-left cursor-pointer min-w-0"
                      >
                        <div className="font-semibold truncate" style={{ maxWidth: 220 }}>
                          {customer.businessName || '—'}
                        </div>
                        <div className="truncate" style={{ maxWidth: 220, fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          {customer.name}
                        </div>
                      </button>
                    </td>
                    <td>
                      <div className="ds-num">{customer.phone}</div>
                      {customer.email && (
                        <div className="truncate" style={{ maxWidth: 180, fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          {customer.email}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 'var(--a-fs-sm)' }}>{customer.businessType || '—'}</td>
                    <td>{statusBadge(customer.wholesaleStatus)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="ds-num font-semibold">{customer.wholesaleOrders}</div>
                      <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                        <Money value={customer.wholesaleSpent} currency={currency} />
                      </div>
                    </td>
                    <td className="ds-num" style={{ fontSize: 'var(--a-fs-sm)' }}>
                      {fmtDate(customer.wholesaleAppliedAt)}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {actionsFor(customer, true)}
                        <IconButton icon={Eye} label="View" onClick={() => setViewing(customer)} />
                        <IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleting(customer)} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </TableWrap>

      {/* View */}
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.businessName || 'Wholesale customer'}
        subtitle={viewing ? `${viewing.name} · applied ${fmtDate(viewing.wholesaleAppliedAt)}` : ''}
        width="max-w-xl"
        footer={
          viewing && (
            <div className="flex flex-wrap items-center justify-between gap-2 w-full">
              <Button variant="danger" icon={Trash2} onClick={() => setDeleting(viewing)}>
                Delete
              </Button>
              <div className="flex flex-wrap gap-2">{actionsFor(viewing)}</div>
            </div>
          )
        }
      >
        {viewing && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">{statusBadge(viewing.wholesaleStatus)}</div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5" style={{ fontSize: 'var(--a-fs-md)' }}>
              <dt className="flex items-center gap-1.5" style={{ color: 'var(--a-text-muted)' }}>
                <Phone className="w-3.5 h-3.5" /> Phone
              </dt>
              <dd className="ds-num">
                <a href={`tel:${viewing.phone}`} className="hover:underline">
                  {viewing.phone}
                </a>
              </dd>
              <dt className="flex items-center gap-1.5" style={{ color: 'var(--a-text-muted)' }}>
                <Mail className="w-3.5 h-3.5" /> Email
              </dt>
              <dd className="break-all">{viewing.email || '—'}</dd>
              <dt className="flex items-center gap-1.5" style={{ color: 'var(--a-text-muted)' }}>
                <Briefcase className="w-3.5 h-3.5" /> Business type
              </dt>
              <dd>{viewing.businessType || '—'}</dd>
              <dt className="flex items-center gap-1.5" style={{ color: 'var(--a-text-muted)' }}>
                <MapPin className="w-3.5 h-3.5" /> Business address
              </dt>
              <dd className="whitespace-pre-line">{viewing.businessAddress || '—'}</dd>
              <dt style={{ color: 'var(--a-text-muted)' }}>Wholesale orders</dt>
              <dd className="ds-num">
                {viewing.wholesaleOrders} · <Money value={viewing.wholesaleSpent} currency={currency} />
              </dd>
              <dt style={{ color: 'var(--a-text-muted)' }}>Last reviewed</dt>
              <dd className="ds-num">{fmtDate(viewing.wholesaleReviewedAt)}</dd>
              {viewing.wholesaleNote && (
                <>
                  <dt style={{ color: 'var(--a-text-muted)' }}>Note</dt>
                  <dd>{viewing.wholesaleNote}</dd>
                </>
              )}
            </dl>
          </div>
        )}
      </Modal>

      {/* Reject / suspend: optional reason shown to the customer */}
      <Modal
        open={Boolean(pending)}
        onClose={() => {
          setPending(null);
          setNote('');
        }}
        title={pending?.action === 'reject' ? 'Reject application' : 'Suspend wholesale account'}
        subtitle={pending?.customer.businessName || pending?.customer.name || ''}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => pending && runAction(pending.customer, pending.action, note)}
            >
              {pending?.action === 'reject' ? 'Reject' : 'Suspend'}
            </Button>
          </div>
        }
      >
        <Field
          label="Reason (optional)"
          hint="Shown to the customer in their account. They keep regular-price access."
        >
          <textarea className="a-field" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete wholesale account?"
        message={
          deleting && deleting.wholesaleOrders > 0
            ? `${deleting.businessName || deleting.name} has order history, so the customer record and orders are kept — only the wholesale account is removed and they become a regular customer.`
            : `${deleting?.businessName || deleting?.name || 'This customer'} will be deleted permanently.`
        }
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
};
