import { AdminProductPicker } from './AdminProductPicker.tsx';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Truck,
  Plus,
  Pencil,
  Trash2,
  Phone,
  Mail,
  Building2,
  Receipt,
  Wallet,
  PackagePlus,
  Minus,
  RefreshCw,
  BookOpen,
  MapPin,
} from 'lucide-react';
import {
  PageHeader,
  StatCard,
  Card,
  Button,
  IconButton,
  Badge,
  SearchInput,
  Select,
  Toolbar,
  SegmentedTabs,
  TableWrap,
  EmptyState,
  ErrorState,
  LoadingRows,
  Drawer,
  ConfirmDialog,
  Field,
  DetailRow,
  Money,
  useToasts,
  ACCENTS,
} from './ui.tsx';

interface Props {
  currency?: string;
  onRefresh?: () => void;
}

const emptySupplier = () => ({
  id: null as number | null,
  name: '',
  phone: '',
  email: '',
  company: '',
  address: '',
  balance: '0',
});

const emptyInward = () => ({
  supplierId: '',
  invoiceNumber: '',
  paid: '0',
  notes: '',
  items: [] as any[],
});

/** What one supplier owes across every bill on file */
interface Ledger {
  bills: number;
  billed: number;
  paid: number;
  due: number;
}

const dueOf = (row: any) => Math.max(0, Number(row.total || 0) - Number(row.paid || 0));

const billStatus = (row: any): { label: string; tone: { bg: string; fg: string } } => {
  const due = dueOf(row);
  if (due <= 0) return { label: 'Paid', tone: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)' } };
  if (Number(row.paid || 0) > 0)
    return { label: 'Partial', tone: { bg: 'var(--ds-warning-soft)', fg: 'var(--ds-warning-text)' } };
  return { label: 'Due', tone: { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)' } };
};

/**
 * Suppliers & Inward — the supplier master doubles as a payables ledger, and the
 * inward form turns a purchase bill into real stock. The two sections sit behind
 * one tab strip because they are read together: what a supplier is owed is only
 * meaningful next to the bills that created it.
 */
export const AdminSuppliersPage: React.FC<Props> = ({ currency = '৳', onRefresh }) => {
  const toasts = useToasts();
  const [tab, setTab] = useState<'suppliers' | 'purchases'>('suppliers');

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('due_desc');
  const [billSupplier, setBillSupplier] = useState('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState(emptySupplier());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [ledgerOf, setLedgerOf] = useState<any | null>(null);

  const [inwardOpen, setInwardOpen] = useState(false);
  const [inward, setInward] = useState(emptyInward());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // v3.15 — products are searched as you type in the purchase form (AdminProductPicker)
      const [supplierRes, purchaseRes] = await Promise.all([
        fetch('/api/admin/suppliers').then((res) => res.json()),
        fetch('/api/admin/purchases').then((res) => res.json()),
      ]);
      setSuppliers(Array.isArray(supplierRes) ? supplierRes : []);
      setPurchases(Array.isArray(purchaseRes) ? purchaseRes : []);
    } catch {
      setError('Could not load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Bills grouped per supplier id, so a row can show its own ledger */
  const ledgers = useMemo(() => {
    const map = new Map<number, Ledger>();
    for (const bill of purchases) {
      const id = Number(bill.supplierId || 0);
      if (!id) continue;
      const current = map.get(id) || { bills: 0, billed: 0, paid: 0, due: 0 };
      current.bills += 1;
      current.billed += Number(bill.total || 0);
      current.paid += Number(bill.paid || 0);
      current.due += dueOf(bill);
      map.set(id, current);
    }
    return map;
  }, [purchases]);

  const ledgerFor = (id: number): Ledger => ledgers.get(id) || { bills: 0, billed: 0, paid: 0, due: 0 };

  const stats = useMemo(
    () => ({
      suppliers: suppliers.length,
      bills: purchases.length,
      billed: purchases.reduce((sum, row) => sum + Number(row.total || 0), 0),
      due: purchases.reduce((sum, row) => sum + dueOf(row), 0),
      opening: suppliers.reduce((sum, row) => sum + Number(row.balance || 0), 0),
    }),
    [suppliers, purchases]
  );

  const filteredSuppliers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? suppliers.filter((row) =>
          `${row.name} ${row.company || ''} ${row.phone || ''} ${row.email || ''}`
            .toLowerCase()
            .includes(term)
        )
      : [...suppliers];

    return list.sort((a, b) => {
      if (sort === 'name_asc') return String(a.name || '').localeCompare(String(b.name || ''));
      if (sort === 'billed_desc') return ledgerFor(b.id).billed - ledgerFor(a.id).billed;
      if (sort === 'bills_desc') return ledgerFor(b.id).bills - ledgerFor(a.id).bills;
      return ledgerFor(b.id).due - ledgerFor(a.id).due;
    });
  }, [suppliers, search, sort, ledgers]);

  const filteredPurchases = useMemo(() => {
    const term = search.trim().toLowerCase();
    return purchases.filter((row) => {
      if (billSupplier !== 'all' && String(row.supplierId || '') !== billSupplier) return false;
      if (term && !`${row.invoiceNumber || ''} ${row.supplierName || ''}`.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [purchases, search, billSupplier]);

  const supplierBills = useMemo(
    () =>
      ledgerOf
        ? purchases.filter((row) => Number(row.supplierId || 0) === Number(ledgerOf.id))
        : [],
    [purchases, ledgerOf]
  );

  /* ---------------------------------------------------------------- actions */

  const saveSupplier = async () => {
    if (!draft.name.trim()) return toasts.push('Enter the supplier name.', 'error');
    if (!draft.phone.trim()) return toasts.push('Enter a mobile number.', 'error');

    setSaving(true);
    try {
      const res = await fetch(draft.id ? `/api/admin/suppliers/${draft.id}` : '/api/admin/suppliers', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'failed');
      toasts.push(draft.id ? 'Supplier updated.' : 'Supplier added.');
      setDrawerOpen(false);
      load();
      onRefresh?.();
    } catch (err: any) {
      toasts.push(err.message || 'Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeSupplier = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/suppliers/${confirmDelete.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'failed');
      toasts.push('Supplier deleted.');
      setConfirmDelete(null);
      load();
    } catch (err: any) {
      toasts.push(err.message || 'Could not delete.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inwardTotal = inward.items.reduce(
    (sum, item) => sum + Number(item.unitCost || 0) * Number(item.quantity || 0),
    0
  );

  const patchItem = (index: number, patch: Record<string, any>) =>
    setInward((current) => ({
      ...current,
      items: current.items.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    }));

  const submitInward = async () => {
    if (!inward.supplierId) return toasts.push('Select a supplier.', 'error');
    if (inward.items.length === 0) return toasts.push('Add at least one product.', 'error');

    setSaving(true);
    try {
      const supplier = suppliers.find((row) => String(row.id) === inward.supplierId);
      const res = await fetch('/api/admin/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: Number(inward.supplierId),
          supplierName: supplier?.name || '',
          invoiceNumber: inward.invoiceNumber || undefined,
          paid: Number(inward.paid || 0),
          notes: inward.notes,
          items: inward.items.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            unitCost: Number(item.unitCost),
            batchNumber: item.batchNumber || null,
            expiryDate: item.expiryDate || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'failed');
      toasts.push('Stock received and updated.');
      setInwardOpen(false);
      setInward(emptyInward());
      setTab('purchases');
      load();
      onRefresh?.();
    } catch (err: any) {
      toasts.push(err.message || 'Could not save the stock receipt.', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ----------------------------------------------------------------- render */

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Suppliers & Purchases"
        subtitle="Supplier accounts, purchase bills and incoming goods — receiving stock updates inventory automatically"
        icon={Truck}
        accent={ACCENTS.teal}
        actions={
          <>
            <Button icon={RefreshCw} onClick={load} loading={loading}>
              Refresh
            </Button>
            <Button
              icon={Plus}
              onClick={() => {
                setDraft(emptySupplier());
                setDrawerOpen(true);
              }}
            >
              Add Supplier
            </Button>
            <Button variant="primary" icon={PackagePlus} onClick={() => setInwardOpen(true)}>
              Receive Stock
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="Suppliers"
          value={stats.suppliers}
          icon={Building2}
          color={ACCENTS.teal}
          loading={loading}
        />
        <StatCard
          label="Purchase Bills"
          value={stats.bills}
          icon={Receipt}
          color={ACCENTS.indigo}
          loading={loading}
        />
        <StatCard
          label="Total Purchases"
          value={<Money value={stats.billed} currency={currency} />}
          icon={Wallet}
          color="var(--primary)"
          loading={loading}
        />
        <StatCard
          label="Outstanding Payable"
          value={<Money value={stats.due} currency={currency} />}
          icon={Truck}
          color="var(--ds-danger)"
          loading={loading}
          deltaNote={`Opening balance ${currency}${stats.opening.toLocaleString('en-US')}`}
        />
      </div>

      <div className="mb-4">
        <SegmentedTabs
          active={tab}
          onChange={(id) => setTab(id as 'suppliers' | 'purchases')}
          tabs={[
            { id: 'suppliers', label: 'Suppliers', icon: Building2, badge: suppliers.length },
            { id: 'purchases', label: 'Purchase Bills', icon: Receipt, badge: purchases.length },
          ]}
        />
      </div>

      <Card className="mb-4" padded={false}>
        <Toolbar className="p-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={
              tab === 'suppliers' ? 'Search by name, company, phone or email' : 'Search by invoice number or supplier'
            }
            className="flex-1 min-w-0"
          />
          {tab === 'suppliers' ? (
            <Select
              value={sort}
              onChange={setSort}
              className="lg:w-[200px] shrink-0"
              options={[
                { value: 'due_desc', label: 'Highest due first' },
                { value: 'billed_desc', label: 'Highest purchases first' },
                { value: 'bills_desc', label: 'Most bills first' },
                { value: 'name_asc', label: 'Name (A–Z)' },
              ]}
            />
          ) : (
            <Select
              value={billSupplier}
              onChange={setBillSupplier}
              className="lg:w-[220px] shrink-0"
              options={[
                { value: 'all', label: 'All Suppliers' },
                ...suppliers.map((row) => ({ value: String(row.id), label: row.name })),
              ]}
            />
          )}
        </Toolbar>
      </Card>

      {tab === 'suppliers' && (
        <TableWrap>
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Contact</th>
                  <th style={{ textAlign: 'right' }}>Bills</th>
                  <th style={{ textAlign: 'right' }}>Total Purchases</th>
                  <th style={{ textAlign: 'right' }}>Paid</th>
                  <th style={{ textAlign: 'right' }}>Due</th>
                  <th style={{ textAlign: 'right' }}>Opening</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRows rows={5} cols={8} />
                ) : filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <EmptyState
                        title={search ? 'No suppliers match your search' : 'No suppliers yet'}
                        description={
                          search
                            ? 'Try searching with a different name or number.'
                            : 'Keep a list of the suppliers you buy products from here.'
                        }
                        icon={Building2}
                        action={
                          search ? (
                            <Button onClick={() => setSearch('')}>Clear Search</Button>
                          ) : (
                            <Button
                              variant="primary"
                              icon={Plus}
                              onClick={() => {
                                setDraft(emptySupplier());
                                setDrawerOpen(true);
                              }}
                            >
                              Add Supplier
                            </Button>
                          )
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((row) => {
                    const ledger = ledgerFor(row.id);
                    return (
                      <tr key={row.id}>
                        <td>
                          <div className="font-semibold">{row.name}</div>
                          {row.company && (
                            <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                              {row.company}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="flex flex-col gap-0.5">
                            {row.phone && (
                              <a
                                href={`tel:${row.phone}`}
                                className="inline-flex items-center gap-1.5 ds-num"
                                style={{ color: 'var(--a-text)' }}
                              >
                                <Phone className="w-3.5 h-3.5" style={{ color: 'var(--a-text-faint)' }} />
                                {row.phone}
                              </a>
                            )}
                            {row.email && (
                              <span
                                className="inline-flex items-center gap-1.5 truncate"
                                style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                              >
                                <Mail className="w-3.5 h-3.5" />
                                {row.email}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="ds-num" style={{ textAlign: 'right' }}>
                          {ledger.bills}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Money value={ledger.billed} currency={currency} />
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--ds-success-text)' }}>
                          <Money value={ledger.paid} currency={currency} />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {ledger.due > 0 ? (
                            <span className="font-bold" style={{ color: 'var(--ds-danger-text)' }}>
                              <Money value={ledger.due} currency={currency} bold />
                            </span>
                          ) : (
                            <span style={{ color: 'var(--a-text-faint)' }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Money value={row.balance} currency={currency} />
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1.5">
                            <IconButton
                              icon={BookOpen}
                              size="sm"
                              label="View Ledger"
                              onClick={() => setLedgerOf(row)}
                            />
                            <IconButton
                              icon={Pencil}
                              size="sm"
                              tone="primary"
                              label="Edit Supplier"
                              onClick={() => {
                                setDraft({
                                  ...emptySupplier(),
                                  ...row,
                                  email: row.email || '',
                                  company: row.company || '',
                                  address: row.address || '',
                                  balance: String(row.balance ?? '0'),
                                });
                                setDrawerOpen(true);
                              }}
                            />
                            <IconButton
                              icon={Trash2}
                              size="sm"
                              tone="danger"
                              label="Delete Supplier"
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
      )}

      {tab === 'purchases' && (
        <TableWrap>
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Paid</th>
                  <th style={{ textAlign: 'right' }}>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRows rows={5} cols={7} />
                ) : filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-0">
                      <EmptyState
                        title={purchases.length === 0 ? 'No purchase bills yet' : 'No bills match your filters'}
                        description={
                          purchases.length === 0
                            ? 'Receiving stock creates a purchase bill and increases stock automatically.'
                            : 'Try changing your filters.'
                        }
                        icon={Receipt}
                        action={
                          purchases.length === 0 ? (
                            <Button variant="primary" icon={PackagePlus} onClick={() => setInwardOpen(true)}>
                              Receive Stock
                            </Button>
                          ) : (
                            <Button
                              onClick={() => {
                                setSearch('');
                                setBillSupplier('all');
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
                  filteredPurchases.map((row) => {
                    const status = billStatus(row);
                    return (
                      <tr key={row.id}>
                        <td className="font-bold ds-num">{row.invoiceNumber}</td>
                        <td>{row.supplierName}</td>
                        <td className="ds-num" style={{ color: 'var(--a-text-muted)' }}>
                          {row.purchaseDate || '—'}
                        </td>
                        <td className="font-bold" style={{ textAlign: 'right' }}>
                          <Money value={row.total} currency={currency} bold />
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--ds-success-text)' }}>
                          <Money value={row.paid} currency={currency} />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {dueOf(row) > 0 ? (
                            <span className="font-bold" style={{ color: 'var(--ds-danger-text)' }}>
                              <Money value={dueOf(row)} currency={currency} bold />
                            </span>
                          ) : (
                            <span style={{ color: 'var(--a-text-faint)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <Badge tone={status.tone} dot>
                            {status.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </TableWrap>
      )}

      {/* ------------------------------------------------------ supplier form */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={draft.id ? 'Edit Supplier' : 'Add Supplier'}
        footer={
          <>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveSupplier} loading={saving}>
              {draft.id ? 'Save Changes' : 'Add Supplier'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Supplier name" required>
            <input
              className="a-field"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Enter supplier name"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Mobile" required>
              <input
                className="a-field ds-num"
                value={draft.phone}
                onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                placeholder="Mobile number"
              />
            </Field>
            <Field label="Email">
              <input
                className="a-field"
                value={draft.email || ''}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                placeholder="Email address"
              />
            </Field>
          </div>
          <Field label="Company">
            <input
              className="a-field"
              value={draft.company || ''}
              onChange={(event) => setDraft({ ...draft, company: event.target.value })}
              placeholder="Company name"
            />
          </Field>
          <Field label="Address">
            <textarea
              className="a-field"
              rows={2}
              value={draft.address || ''}
              onChange={(event) => setDraft({ ...draft, address: event.target.value })}
              placeholder="Address"
            />
          </Field>
          <Field label={`Opening balance (${currency})`}>
            <input
              type="number"
              className="a-field ds-num"
              value={draft.balance}
              onChange={(event) => setDraft({ ...draft, balance: event.target.value })}
              placeholder="0"
            />
          </Field>
        </div>
      </Drawer>

      {/* ---------------------------------------------------- supplier ledger */}
      <Drawer
        open={Boolean(ledgerOf)}
        onClose={() => setLedgerOf(null)}
        title={ledgerOf?.name || ''}
        subtitle="Supplier ledger"
        width="max-w-2xl"
        footer={
          <Button
            variant="primary"
            icon={PackagePlus}
            onClick={() => {
              setInward({ ...emptyInward(), supplierId: String(ledgerOf?.id || '') });
              setLedgerOf(null);
              setInwardOpen(true);
            }}
          >
            Receive Stock
          </Button>
        }
      >
        {ledgerOf && (
          <div className="space-y-4">
            <Card>
              <DetailRow label="Mobile">
                <span className="ds-num">{ledgerOf.phone || '—'}</span>
              </DetailRow>
              <DetailRow label="Email">{ledgerOf.email || '—'}</DetailRow>
              <DetailRow label="Company">{ledgerOf.company || '—'}</DetailRow>
              {ledgerOf.address && (
                <DetailRow label="Address">
                  <span className="inline-flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--a-text-faint)' }} />
                    {ledgerOf.address}
                  </span>
                </DetailRow>
              )}
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <div className="a-card p-3">
                <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Total Purchases</div>
                <div className="font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
                  <Money value={ledgerFor(ledgerOf.id).billed} currency={currency} bold />
                </div>
              </div>
              <div className="a-card p-3">
                <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Due</div>
                <div className="font-bold" style={{ fontSize: 'var(--a-fs-lg)', color: 'var(--ds-danger-text)' }}>
                  <Money value={ledgerFor(ledgerOf.id).due} currency={currency} bold />
                </div>
              </div>
            </div>

            <Card padded={false}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--a-border)' }}>
                <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                  Purchase Bills
                </span>
              </div>
              {supplierBills.length === 0 ? (
                <EmptyState
                  title="No bills yet"
                  description="Nothing has been received from this supplier yet."
                  icon={Receipt}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Date</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'right' }}>Due</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierBills.map((bill) => {
                        const status = billStatus(bill);
                        return (
                          <tr key={bill.id}>
                            <td className="font-semibold ds-num">{bill.invoiceNumber}</td>
                            <td className="ds-num" style={{ color: 'var(--a-text-muted)' }}>
                              {bill.purchaseDate || '—'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Money value={bill.total} currency={currency} />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Money value={dueOf(bill)} currency={currency} />
                            </td>
                            <td>
                              <Badge tone={status.tone}>{status.label}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </Drawer>

      {/* -------------------------------------------------- inward receiving */}
      <Drawer
        open={inwardOpen}
        onClose={() => setInwardOpen(false)}
        title="Receive Stock"
        subtitle="A purchase bill will be created and stock increased for each line"
        width="max-w-3xl"
        footer={
          <>
            <Button onClick={() => setInwardOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={submitInward} loading={saving}>
              Receive & Update Stock
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Supplier" required>
              <Select
                value={inward.supplierId}
                onChange={(value) => setInward({ ...inward, supplierId: value })}
                options={[
                  { value: '', label: 'Select a supplier' },
                  ...suppliers.map((row) => ({ value: String(row.id), label: row.name })),
                ]}
              />
            </Field>
            <Field label="Invoice number">
              <input
                className="a-field ds-num"
                value={inward.invoiceNumber}
                onChange={(event) => setInward({ ...inward, invoiceNumber: event.target.value })}
                placeholder="Leave blank to auto-generate"
              />
            </Field>
          </div>

          <Card padded={false}>
            <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b" style={{ borderColor: 'var(--a-border)' }}>
              <span className="font-bold" style={{ fontSize: 'var(--a-fs-md)' }}>
                Products
              </span>
              {/* v3.15 — searches the server (the old dropdown listed every product) */}
              <AdminProductPicker
                className="sm:w-80"
                onPick={(product) =>
                  setInward((current) => ({
                    ...current,
                    items: [
                      ...current.items,
                      {
                        productId: product.id,
                        productName: product.name,
                        quantity: 1,
                        unitCost: Number(product.costPrice || product.price || 0),
                        batchNumber: '',
                        expiryDate: '',
                      },
                    ],
                  }))
                }
              />
            </div>

            {inward.items.length === 0 ? (
              <EmptyState
                title="No products added"
                description="Pick the products in this shipment from the list above."
                icon={PackagePlus}
              />
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Quantity</th>
                      <th style={{ textAlign: 'right' }}>Unit Cost</th>
                      <th>Batch</th>
                      <th>Expiry</th>
                      <th style={{ textAlign: 'right' }}>Subtotal</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {inward.items.map((item, index) => (
                      <tr key={`${item.productId}-${index}`}>
                        <td className="font-semibold" style={{ minWidth: 150 }}>
                          {item.productName}
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <IconButton
                              icon={Minus}
                              size="sm"
                              label="Decrease"
                              onClick={() =>
                                patchItem(index, { quantity: Math.max(1, Number(item.quantity) - 1) })
                              }
                            />
                            <span className="ds-num w-8 text-center font-bold">{item.quantity}</span>
                            <IconButton
                              icon={Plus}
                              size="sm"
                              label="Increase"
                              onClick={() => patchItem(index, { quantity: Number(item.quantity) + 1 })}
                            />
                          </div>
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="a-field ds-num w-24"
                            value={item.unitCost}
                            onChange={(event) => patchItem(index, { unitCost: event.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="a-field w-24"
                            value={item.batchNumber}
                            onChange={(event) => patchItem(index, { batchNumber: event.target.value })}
                            placeholder="Batch"
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="a-field ds-num w-36"
                            value={item.expiryDate}
                            onChange={(event) => patchItem(index, { expiryDate: event.target.value })}
                          />
                        </td>
                        <td className="font-bold whitespace-nowrap" style={{ textAlign: 'right' }}>
                          <Money
                            value={Number(item.unitCost || 0) * Number(item.quantity || 0)}
                            currency={currency}
                            bold
                          />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <IconButton
                            icon={Trash2}
                            size="sm"
                            tone="danger"
                            label="Remove"
                            onClick={() =>
                              setInward((current) => ({
                                ...current,
                                items: current.items.filter((_, position) => position !== index),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={`Paid now (${currency})`}>
              <input
                type="number"
                min={0}
                className="a-field ds-num"
                value={inward.paid}
                onChange={(event) => setInward({ ...inward, paid: event.target.value })}
                placeholder="0"
              />
            </Field>
            <Field label="Notes">
              <input
                className="a-field"
                value={inward.notes}
                onChange={(event) => setInward({ ...inward, notes: event.target.value })}
                placeholder="Optional notes"
              />
            </Field>
          </div>

          <Card accent="var(--primary)">
            <div
              className="flex items-center justify-between font-bold"
              style={{ fontSize: 'var(--a-fs-lg)' }}
            >
              <span>Bill Total</span>
              <span style={{ color: 'var(--primary-ink, var(--primary))' }}>
                <Money value={inwardTotal} currency={currency} bold />
              </span>
            </div>
            <div
              className="flex items-center justify-between mt-1"
              style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}
            >
              <span>Due after payment</span>
              <Money
                value={Math.max(0, inwardTotal - Number(inward.paid || 0))}
                currency={currency}
              />
            </div>
          </Card>
        </div>
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete supplier?"
        message={`"${confirmDelete?.name || ''}" will be deleted. Suppliers with purchase bills cannot be deleted.`}
        confirmLabel="Delete"
        busy={saving}
        onConfirm={removeSupplier}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
