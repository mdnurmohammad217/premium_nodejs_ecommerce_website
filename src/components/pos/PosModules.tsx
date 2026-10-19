import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MODULE_INFO, hasModule, type PermissionModule } from '../../lib/permissions.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  X,
  Plus,
  Trash2,
  Truck,
  Users,
  PackagePlus,
  AlertTriangle,
  CalendarClock,
  ScrollText,
  SlidersHorizontal,
  Wallet,
  DoorOpen,
  BarChart3,
  RotateCcw,
  Search,
  BookUser,
  Receipt,
  ReceiptText,
  Undo2,
  Layers,
  ClipboardList,
  PackageMinus,
  BadgeDollarSign,
  FileBarChart,
  UserCog,
  ArrowLeft,
  LayoutGrid,
  ShoppingCart,
  TrendingUp,
  Coins,
  CheckCircle2,
  Info,
} from 'lucide-react';
import {
  Button,
  IconButton,
  Card,
  CardHeader,
  StatCard,
  FilterPills,
  TabStrip,
  StatusSelect,
  TableWrap,
  EmptyState,
  ErrorState,
  LoadingRows,
  SectionLoader,
  DetailRow,
  ConfirmDialog,
  mix,
} from '../admin/ui.tsx';
import { MyOrdersPanel } from './MyOrdersPanel.tsx';

interface PosModulesProps {
  onClose: () => void;
  onOpenReturn?: () => void;
  currency?: string;
}

type ModuleId =
  | 'menu'
  | 'my-orders'
  | 'suppliers'
  | 'purchase'
  | 'short'
  | 'expired'
  | 'log'
  | 'adjust'
  | 'expenses'
  | 'counter'
  | 'summary'
  | 'customer-ledger'
  | 'supplier-ledger'
  | 'purchase-return'
  | 'pre-orders'
  | 'issue'
  | 'salary'
  | 'master'
  | 'reports'
  | 'users';

type IconType = typeof Users;

interface ModuleDef {
  id: Exclude<ModuleId, 'menu'>;
  label: string;
  icon: IconType;
  hint: string;
}

const ALL_GROUPS: Array<{ title: string; accent: string; modules: ModuleDef[] }> = [
  {
    title: 'Sales & Cash',
    accent: 'var(--primary)',
    modules: [
      { id: 'my-orders', label: 'My Orders', icon: ClipboardList, hint: 'Website orders assigned to you' },
      { id: 'counter', label: 'Counter', icon: DoorOpen, hint: 'Cash drawer sessions' },
      { id: 'summary', label: 'Sales Summary', icon: BarChart3, hint: 'Daily totals and cash' },
      { id: 'expenses', label: 'Daily Expenses', icon: Wallet, hint: 'Record shop expenses' },
      { id: 'reports', label: 'Reports', icon: FileBarChart, hint: 'Profit and sales reports' },
    ],
  },
  {
    title: 'Stock',
    accent: 'var(--ds-teal)',
    modules: [
      { id: 'purchase', label: 'Purchase', icon: PackagePlus, hint: 'Receive stock from suppliers' },
      { id: 'purchase-return', label: 'Purchase Return', icon: Undo2, hint: 'Return products to suppliers' },
      { id: 'short', label: 'Low Stock', icon: AlertTriangle, hint: 'Products running low' },
      { id: 'expired', label: 'Expired', icon: CalendarClock, hint: 'Expired or expiring soon' },
      { id: 'log', label: 'Inventory Log', icon: ScrollText, hint: 'Every stock movement' },
      { id: 'adjust', label: 'Stock Adjustment', icon: SlidersHorizontal, hint: 'Correct stock counts' },
      { id: 'issue', label: 'Stock Issue', icon: PackageMinus, hint: 'Damage or samples' },
    ],
  },
  {
    title: 'Customers & Suppliers',
    accent: 'var(--ds-indigo)',
    modules: [
      { id: 'suppliers', label: 'Suppliers', icon: Truck, hint: 'Supplier directory' },
      { id: 'customer-ledger', label: 'Customer Ledger', icon: BookUser, hint: 'Dues and collections' },
      { id: 'supplier-ledger', label: 'Supplier Ledger', icon: Receipt, hint: 'Bills and payments' },
      { id: 'pre-orders', label: 'Pre-Orders', icon: ClipboardList, hint: 'Customer requests' },
    ],
  },
  {
    title: 'Administration',
    accent: 'var(--ds-violet)',
    modules: [
      { id: 'salary', label: 'Salaries', icon: BadgeDollarSign, hint: 'Staff salary records' },
      { id: 'master', label: 'Master Data', icon: Layers, hint: 'Generics, manufacturers and groups' },
      { id: 'users', label: 'Users', icon: UserCog, hint: 'Staff and access' },
    ],
  },
];

/**
 * The access each panel needs beyond the POS Terminal itself (Staff & Access).
 * A panel without an entry is part of the till and open to every cashier.
 * The server checks the same thing; hiding the panel just keeps the list honest.
 */
const PANEL_NEEDS: Partial<Record<Exclude<ModuleId, 'menu'>, PermissionModule[]>> = {
  expenses: ['expenses'],
  reports: ['reports'],
  purchase: ['purchases'],
  'purchase-return': ['purchases'],
  short: ['inventory', 'purchases'],
  expired: ['inventory', 'purchases'],
  log: ['inventory'],
  adjust: ['inventory'],
  issue: ['inventory'],
  suppliers: ['suppliers'],
  'customer-ledger': ['customers'],
  'supplier-ledger': ['suppliers'],
  'pre-orders': ['orders'],
  salary: ['salaries'],
  master: ['products'],
  users: ['users'],
};

const fs = (size: string): React.CSSProperties => ({ fontSize: `var(--ds-fs-${size})` });

/**
 * POS back-office modules. They open as a full-screen workspace layered over
 * the till — never a route change — so the cashier is one click from the sale
 * screen and the admin dashboard is never involved. Each panel talks to
 * /api/pos/* directly.
 */
export const PosModules: React.FC<PosModulesProps> = ({ onClose, onOpenReturn, currency = '৳' }) => {
  const [active, setActive] = useState<ModuleId>('menu');
  const { user } = useAuth();
  const GROUPS = useMemo(
    () =>
      ALL_GROUPS.map((group) => ({
        ...group,
        modules: group.modules.filter((m) => !PANEL_NEEDS[m.id] || hasModule(user, ...(PANEL_NEEDS[m.id] as PermissionModule[]))),
      })).filter((group) => group.modules.length > 0),
    [user]
  );
  const MODULES = useMemo(() => GROUPS.flatMap((group) => group.modules.map((m) => ({ ...m, accent: group.accent }))), [GROUPS]);
  const current = MODULES.find((m) => m.id === active);

  const navItem = (id: ModuleId, label: string, Icon: IconType) => (
    <button
      key={id}
      type="button"
      onClick={() => setActive(id)}
      className="a-nav-item"
      data-active={active === id}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div
      className="admin-shell fixed inset-0 flex flex-col ds-fade-in"
      style={{ zIndex: 'var(--ds-z-overlay)' as any, background: 'var(--ds-bg)' }}
      role="dialog"
      aria-modal="true"
      aria-label="POS Modules"
    >
      {/* Header */}
      <header
        className="shrink-0 flex items-center gap-3 px-3 sm:px-4"
        style={{
          height: 60,
          background: 'var(--ds-surface)',
          borderBottom: '1px solid var(--ds-border)',
          boxShadow: 'var(--ds-shadow-xs)',
        }}
      >
        <Button variant="secondary" icon={ArrowLeft} onClick={onClose} className="shrink-0">
          <span className="hidden sm:inline">Back to Sales</span>
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold truncate" style={fs('lg')}>
            {current ? current.label : 'POS Modules'}
          </h2>
          <p className="truncate" style={{ ...fs('xs'), color: 'var(--ds-text-muted)' }}>
            {current ? current.hint : 'Stock, accounts and store tasks without leaving the sales screen'}
          </p>
        </div>
        <IconButton icon={X} label="Close (F9)" tone="plain" onClick={onClose} />
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* Side navigation (tablet and up) */}
        <nav
          className="hidden md:flex flex-col shrink-0 overflow-y-auto p-3 gap-4"
          style={{ width: 248, background: 'var(--ds-surface)', borderRight: '1px solid var(--ds-border)' }}
        >
          <div>{navItem('menu', 'All Modules', LayoutGrid)}</div>
          {GROUPS.map((group) => (
            <div key={group.title} className="space-y-0.5">
              <p
                className="px-2.5 pb-1 font-bold uppercase"
                style={{ ...fs('2xs'), letterSpacing: 'var(--ds-tracking-wide)', color: 'var(--ds-text-faint)' }}
              >
                {group.title}
              </p>
              {group.modules.map((m) => navItem(m.id, m.label, m.icon))}
              {group.title === 'Sales & Cash' && onOpenReturn && (
                <button type="button" onClick={onOpenReturn} className="a-nav-item">
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  <span className="truncate">Sales Return</span>
                </button>
              )}
            </div>
          ))}
        </nav>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Module strip (phones) */}
          <div
            className="md:hidden shrink-0 flex gap-2 overflow-x-auto ds-scroll-hide px-3 py-2.5"
            style={{ background: 'var(--ds-surface)', borderBottom: '1px solid var(--ds-border)' }}
          >
            {[{ id: 'menu' as ModuleId, label: 'All Modules' }, ...MODULES].map((m) => {
              const on = active === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActive(m.id)}
                  className="shrink-0 whitespace-nowrap font-semibold cursor-pointer"
                  style={{
                    height: 'var(--ds-h-sm)',
                    padding: '0 12px',
                    borderRadius: 'var(--ds-r-full)',
                    ...fs('sm'),
                    background: on ? 'var(--primary)' : 'var(--ds-surface-2)',
                    color: on ? 'var(--primary-foreground)' : 'var(--ds-text-soft)',
                    border: `1px solid ${on ? 'var(--primary)' : 'var(--ds-border)'}`,
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto p-4 md:p-6 ds-fade-in" key={active}>
              {active === 'menu' && (
                <div className="space-y-6">
                  {GROUPS.map((group) => (
                    <section key={group.title}>
                      <h3 className="font-bold mb-2.5" style={{ ...fs('sm'), color: 'var(--ds-text-soft)' }}>
                        {group.title}
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {group.modules.map(({ id, label, icon: Icon, hint }) => (
                          <ModuleTile
                            key={id}
                            label={label}
                            hint={hint}
                            icon={Icon}
                            accent={group.accent}
                            onClick={() => setActive(id)}
                          />
                        ))}
                        {group.title === 'Sales & Cash' && onOpenReturn && (
                          <ModuleTile
                            label="Sales Return"
                            hint="Refund sold products"
                            icon={RotateCcw}
                            accent={group.accent}
                            onClick={onOpenReturn}
                          />
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {active === 'my-orders' && <MyOrdersPanel currency={currency} />}
              {active === 'suppliers' && <SuppliersPanel />}
              {active === 'purchase' && <PurchasePanel currency={currency} />}
              {active === 'short' && <ListPanel url="/api/pos/short-list" kind="short" currency={currency} />}
              {active === 'expired' && <ExpiredPanel currency={currency} />}
              {active === 'log' && <InventoryLogPanel />}
              {active === 'adjust' && <AdjustPanel />}
              {active === 'expenses' && <ExpensesPanel currency={currency} />}
              {active === 'counter' && <CounterPanel currency={currency} />}
              {active === 'summary' && <SummaryPanel currency={currency} />}
              {active === 'customer-ledger' && <CustomerLedgerPanel currency={currency} />}
              {active === 'supplier-ledger' && <SupplierLedgerPanel currency={currency} />}
              {active === 'purchase-return' && <PurchaseReturnPanel currency={currency} />}
              {active === 'pre-orders' && <PreOrderPanel currency={currency} />}
              {active === 'issue' && <ProductIssuePanel />}
              {active === 'salary' && <SalaryPanel currency={currency} />}
              {active === 'master' && <MasterDataPanel />}
              {active === 'reports' && <ReportsPanel currency={currency} />}
              {active === 'users' && <UsersPanel />}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

const ModuleTile: React.FC<{
  label: string;
  hint: string;
  icon: IconType;
  accent: string;
  onClick: () => void;
}> = ({ label, hint, icon: Icon, accent, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="a-card ds-card-hover p-4 text-left cursor-pointer flex flex-col gap-3"
  >
    <span
      className="flex items-center justify-center"
      style={{ width: 40, height: 40, borderRadius: 'var(--ds-r-md)', background: mix(accent, 0.12), color: accent }}
    >
      <Icon className="w-5 h-5" />
    </span>
    <span className="min-w-0">
      <span className="block font-bold" style={fs('md')}>
        {label}
      </span>
      <span className="block ds-clamp-2" style={{ ...fs('xs'), color: 'var(--ds-text-muted)' }}>
        {hint}
      </span>
    </span>
  </button>
);

/* ---------------- shared bits ---------------- */

const useApi = <T,>(url: string) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(url);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't load data.");
      setData(body);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
};

const money = (value: any, currency = '৳') =>
  `${currency}${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

const today = () => new Date().toISOString().slice(0, 10);

/** An inline result line under a form — green when it worked, red when not */
const Notice: React.FC<{ tone?: 'success' | 'danger' | 'info'; children: React.ReactNode }> = ({
  tone = 'info',
  children,
}) => {
  const tones = {
    success: { bg: 'var(--ds-success-soft)', fg: 'var(--ds-success-text)', Icon: CheckCircle2 },
    danger: { bg: 'var(--ds-danger-soft)', fg: 'var(--ds-danger-text)', Icon: AlertTriangle },
    info: { bg: 'var(--ds-info-soft)', fg: 'var(--ds-info-text)', Icon: Info },
  }[tone];
  const ToneIcon = tones.Icon;
  return (
    <div
      className="flex items-start gap-2 px-3 py-2.5 ds-fade-in"
      style={{ background: tones.bg, color: tones.fg, borderRadius: 'var(--ds-r-md)', ...fs('base') }}
    >
      <ToneIcon className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="font-medium">{children}</span>
    </div>
  );
};

type Column = string | { label: string; align?: 'left' | 'right' | 'center' };

/**
 * One table shell for every module: skeleton rows while loading, a retry on
 * failure and a friendly empty state, so each panel only supplies its rows.
 */
const DataTable: React.FC<{
  columns: Column[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  isEmpty: boolean;
  empty: { title: string; description?: string; icon?: IconType };
  title?: string;
  children: React.ReactNode;
}> = ({ columns, loading, error, onRetry, isEmpty, empty, title, children }) => (
  <div className="space-y-2">
    {title && (
      <h3 className="font-bold" style={{ ...fs('md'), color: 'var(--ds-text)' }}>
        {title}
      </h3>
    )}
    <TableWrap>
      {!loading && error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : !loading && isEmpty ? (
        <EmptyState title={empty.title} description={empty.description} icon={empty.icon} />
      ) : (
        <table>
          <thead>
            <tr>
              {columns.map((column, index) => {
                const label = typeof column === 'string' ? column : column.label;
                const align = typeof column === 'string' ? 'left' : column.align || 'left';
                return (
                  <th key={index} style={{ textAlign: align }}>
                    {label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>{loading ? <LoadingRows rows={4} cols={columns.length} /> : children}</tbody>
        </table>
      )}
    </TableWrap>
  </div>
);

const Num: React.FC<{ children: React.ReactNode; bold?: boolean; color?: string }> = ({ children, bold, color }) => (
  <span className={`ds-num ${bold ? 'font-bold' : ''}`} style={color ? { color } : undefined}>
    {children}
  </span>
);

const Muted: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="block" style={{ ...fs('xs'), color: 'var(--ds-text-muted)' }}>
    {children}
  </span>
);

const dueColor = (value: any) => (Number(value) > 0 ? 'var(--ds-danger-text)' : 'var(--ds-success-text)');

/** Product search box with a dropdown of matches, shared by purchase and adjustment */
const ProductSearch: React.FC<{
  query: string;
  onSearch: (value: string) => void;
  results: any[];
  onPick: (product: any) => void;
  placeholder: string;
}> = ({ query, onSearch, results, onPick, placeholder }) => (
  <div className="relative">
    <Search
      className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
      style={{ color: 'var(--ds-text-muted)' }}
    />
    <input
      value={query}
      onChange={(e) => onSearch(e.target.value)}
      placeholder={placeholder}
      className="ds-input"
      style={{ paddingLeft: 36 }}
    />
    {results.length > 0 && (
      <div
        className="absolute left-0 right-0 mt-1 overflow-hidden ds-scale-in"
        style={{
          zIndex: 'var(--ds-z-dropdown)' as any,
          background: 'var(--ds-surface)',
          border: '1px solid var(--ds-border)',
          borderRadius: 'var(--ds-r-md)',
          boxShadow: 'var(--ds-shadow-lg)',
        }}
      >
        {results.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className="w-full px-3 py-2.5 text-left flex items-center justify-between gap-3 cursor-pointer transition-colors hover:bg-[var(--ds-surface-2)]"
            style={fs('base')}
          >
            <span className="truncate font-medium">{p.name}</span>
            <span className="ds-num shrink-0" style={{ ...fs('xs'), color: 'var(--ds-text-muted)' }}>
              Stock {p.stock}
            </span>
          </button>
        ))}
      </div>
    )}
  </div>
);

/* ---------------- panels ---------------- */

const SuppliersPanel: React.FC = () => {
  const { data, loading, error, reload } = useApi<any[]>('/api/pos/suppliers');
  const [form, setForm] = useState({ name: '', phone: '', company: '', address: '' });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    setSaving(true);
    await fetch('/api/pos/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ name: '', phone: '', company: '', address: '' });
    setSaving(false);
    reload();
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="New Supplier" icon={Truck} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Supplier name" className="ds-input" />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="ds-input" />
          <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company" className="ds-input" />
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" className="ds-input" />
          <Button variant="primary" icon={Plus} onClick={add} loading={saving} disabled={!form.name || !form.phone}>
            Add Supplier
          </Button>
        </div>
      </Card>

      <DataTable
        columns={['Supplier', 'Company', 'Phone', 'Address']}
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={(data || []).length === 0}
        empty={{ title: 'No suppliers yet', description: 'Add your first supplier using the form above.', icon: Truck }}
      >
        {(data || []).map((s: any) => (
          <tr key={s.id}>
            <td className="font-semibold">{s.name}</td>
            <td>{s.company || '—'}</td>
            <td>
              <Num>{s.phone}</Num>
            </td>
            <td>{s.address || '—'}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
};

const PurchasePanel: React.FC<{ currency: string }> = ({ currency }) => {
  const { data: suppliers } = useApi<any[]>('/api/pos/suppliers');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [paid, setPaid] = useState('');
  const [message, setMessage] = useState('');
  const [messageOk, setMessageOk] = useState(true);
  const [saving, setSaving] = useState(false);

  const search = async (value: string) => {
    setQuery(value);
    if (value.length < 2) return setResults([]);
    const res = await fetch(`/api/pos/products?search=${encodeURIComponent(value)}`);
    const body = await res.json();
    setResults(Array.isArray(body) ? body.slice(0, 6) : []);
  };

  const total = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitCost || 0), 0);

  const submit = async () => {
    setSaving(true);
    setMessage('');
    const supplier = (suppliers || []).find((s: any) => String(s.id) === supplierId);
    const res = await fetch('/api/pos/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId: supplierId || null,
        supplierName: supplier?.name || 'Walk-in supplier',
        paid: paid || 0,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost || 0),
          batchNumber: l.batchNumber || null,
          expiryDate: l.expiryDate || null,
        })),
      }),
    });
    const body = await res.json();
    setSaving(false);
    setMessageOk(res.ok);
    setMessage(res.ok ? `Purchase saved: ${body.purchase.invoiceNumber}. Stock updated.` : body.error);
    if (res.ok) {
      setLines([]);
      setPaid('');
    }
  };

  const patchLine = (index: number, patch: Record<string, any>) =>
    setLines((p) => p.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-5">
      {message && <Notice tone={messageOk ? 'success' : 'danger'}>{message}</Notice>}

      <Card>
        <CardHeader title="Purchase Invoice" subtitle="Choose a supplier, then search for products to add" icon={PackagePlus} accent="var(--ds-teal)" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="ds-select">
            <option value="">Walk-in supplier</option>
            {(suppliers || []).map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <div className="sm:col-span-2">
            <ProductSearch
              query={query}
              onSearch={search}
              results={results}
              placeholder="Search products to add"
              onPick={(p) => {
                setLines((prev) => [
                  ...prev,
                  { productId: p.id, name: p.name, quantity: 1, unitCost: p.costPrice || p.price, batchNumber: '', expiryDate: '' },
                ]);
                setResults([]);
                setQuery('');
              }}
            />
          </div>
        </div>
      </Card>

      <DataTable
        columns={['Product', 'Qty', 'Unit Cost', 'Batch', 'Expiry', { label: 'Total', align: 'right' }, '']}
        isEmpty={lines.length === 0}
        empty={{ title: 'No products added', description: 'Products you pick from the search above will appear here.', icon: PackagePlus }}
      >
        {lines.map((line, index) => (
          <tr key={index}>
            <td className="font-semibold" style={{ minWidth: 160 }}>{line.name}</td>
            <td>
              <input type="number" min="1" value={line.quantity} onChange={(e) => patchLine(index, { quantity: e.target.value })} className="ds-input ds-num" style={{ width: 84, height: 'var(--ds-h-sm)' }} placeholder="Qty" />
            </td>
            <td>
              <input type="number" min="0" value={line.unitCost} onChange={(e) => patchLine(index, { unitCost: e.target.value })} className="ds-input ds-num" style={{ width: 100, height: 'var(--ds-h-sm)' }} placeholder="Cost" />
            </td>
            <td>
              <input value={line.batchNumber} onChange={(e) => patchLine(index, { batchNumber: e.target.value })} className="ds-input" style={{ width: 110, height: 'var(--ds-h-sm)' }} placeholder="Batch" />
            </td>
            <td>
              <input type="date" value={line.expiryDate} onChange={(e) => patchLine(index, { expiryDate: e.target.value })} className="ds-input" style={{ width: 150, height: 'var(--ds-h-sm)' }} />
            </td>
            <td style={{ textAlign: 'right' }}>
              <Num bold>{money(Number(line.quantity) * Number(line.unitCost || 0), currency)}</Num>
            </td>
            <td style={{ textAlign: 'right' }}>
              <IconButton icon={Trash2} label="Remove" tone="danger" size="sm" onClick={() => setLines((p) => p.filter((_, i) => i !== index))} />
            </td>
          </tr>
        ))}
      </DataTable>

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span style={{ ...fs('sm'), color: 'var(--ds-text-muted)' }}>Purchase Total</span>
            <div className="ds-num font-bold" style={fs('2xl')}>
              {currency}{total.toLocaleString()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="Amount paid" className="ds-input ds-num" style={{ maxWidth: 180 }} />
            <Button variant="primary" onClick={submit} loading={saving} disabled={lines.length === 0}>
              Save Purchase
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

const ListPanel: React.FC<{ url: string; kind: 'short' | 'expired'; currency: string }> = ({ url, kind }) => {
  const { data, loading, error, reload } = useApi<any[]>(url);
  const rows = data || [];
  return (
    <DataTable
      columns={
        kind === 'short'
          ? ['Product', { label: 'Stock', align: 'right' }, { label: 'Alert Level', align: 'right' }]
          : ['Product', 'Batch', { label: 'Expiry', align: 'right' }]
      }
      loading={loading}
      error={error}
      onRetry={reload}
      isEmpty={rows.length === 0}
      empty={{
        title: kind === 'short' ? 'No products below their alert level' : 'No expired products',
        icon: kind === 'short' ? AlertTriangle : CalendarClock,
      }}
    >
      {rows.map((p: any) =>
        kind === 'short' ? (
          <tr key={p.id}>
            <td className="font-semibold">{p.name}</td>
            <td style={{ textAlign: 'right' }}>
              <span className={`ds-badge ds-num ${Number(p.stock) <= 0 ? 'ds-badge-danger' : 'ds-badge-warning'}`}>{p.stock}</span>
            </td>
            <td style={{ textAlign: 'right' }}>
              <Num>{p.lowStockThreshold}</Num>
            </td>
          </tr>
        ) : (
          <tr key={p.id}>
            <td className="font-semibold">{p.name}</td>
            <td>{p.batchNumber || '—'}</td>
            <td style={{ textAlign: 'right' }}>
              <span className="ds-badge ds-badge-danger ds-num">{p.expiryDate}</span>
            </td>
          </tr>
        )
      )}
    </DataTable>
  );
};

const ExpiredPanel: React.FC<{ currency: string }> = ({ currency }) => {
  const [days, setDays] = useState(0);
  return (
    <div className="space-y-4">
      <FilterPills
        pills={[0, 30, 90].map((d) => ({
          id: String(d),
          label: d === 0 ? 'Expired' : `Next ${d} Days`,
          color: d === 0 ? 'var(--ds-danger)' : 'var(--ds-warning)',
        }))}
        active={String(days)}
        onChange={(id) => setDays(Number(id))}
      />
      <ListPanel url={`/api/pos/expired-list?days=${days}`} kind="expired" currency={currency} />
    </div>
  );
};

const InventoryLogPanel: React.FC = () => {
  const { data, loading, error, reload } = useApi<any[]>('/api/pos/inventory-log');
  const rows = data || [];
  return (
    <DataTable
      columns={['Product', 'Type', 'Reference', 'Time', { label: 'Change', align: 'right' }, { label: 'New Stock', align: 'right' }]}
      loading={loading}
      error={error}
      onRetry={reload}
      isEmpty={rows.length === 0}
      empty={{ title: 'No stock movements yet', icon: ScrollText }}
    >
      {rows.map((row: any) => (
        <tr key={row.id}>
          <td className="font-semibold">{row.productName || `#${row.productId}`}</td>
          <td>
            <span className="ds-badge ds-badge-neutral">{row.type}</span>
          </td>
          <td>{row.reference || '—'}</td>
          <td className="whitespace-nowrap">
            <Num>{row.createdAt ? new Date(row.createdAt).toLocaleString('en-GB') : ''}</Num>
          </td>
          <td style={{ textAlign: 'right' }}>
            <Num bold color={row.quantity > 0 ? 'var(--ds-success-text)' : 'var(--ds-danger-text)'}>
              {row.quantity > 0 ? '+' : ''}
              {row.quantity}
            </Num>
          </td>
          <td style={{ textAlign: 'right' }}>
            <Num>{row.newStock}</Num>
          </td>
        </tr>
      ))}
    </DataTable>
  );
};

const AdjustPanel: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [picked, setPicked] = useState<any | null>(null);
  const [newStock, setNewStock] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [messageOk, setMessageOk] = useState(true);

  const search = async (value: string) => {
    setQuery(value);
    if (value.length < 2) return setResults([]);
    const res = await fetch(`/api/pos/products?search=${encodeURIComponent(value)}`);
    const body = await res.json();
    setResults(Array.isArray(body) ? body.slice(0, 6) : []);
  };

  const submit = async () => {
    const res = await fetch('/api/pos/adjust-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: picked.id, newStock, reason }),
    });
    const body = await res.json();
    setMessageOk(res.ok);
    setMessage(res.ok ? `Stock updated from ${body.previousStock} to ${body.newStock}.` : body.error);
  };

  return (
    <div className="max-w-xl space-y-4">
      {message && <Notice tone={messageOk ? 'success' : 'danger'}>{message}</Notice>}

      <Card>
        <CardHeader title="Stock Adjustment" subtitle="Match the system count to your physical count" icon={SlidersHorizontal} accent="var(--ds-teal)" />
        <ProductSearch
          query={query}
          onSearch={search}
          results={results}
          placeholder="Search products"
          onPick={(p) => {
            setPicked(p);
            setNewStock(String(p.stock));
            setResults([]);
            setQuery(p.name);
          }}
        />

        {picked ? (
          <div className="mt-4 pt-4 space-y-3" style={{ borderTop: '1px solid var(--ds-border-soft)' }}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold" style={fs('md')}>{picked.name}</span>
              <span className="ds-badge ds-badge-neutral ds-num">Current Stock: {picked.stock}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="a-label">Counted Stock</span>
                <input type="number" value={newStock} onChange={(e) => setNewStock(e.target.value)} placeholder="0" className="ds-input ds-num" />
              </label>
              <label className="block">
                <span className="a-label">Reason</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damage, recount..." className="ds-input" />
              </label>
            </div>
            <Button variant="primary" onClick={submit}>Adjust Stock</Button>
          </div>
        ) : (
          <p className="mt-3" style={{ ...fs('sm'), color: 'var(--ds-text-muted)' }}>
            Pick a product to adjust its stock.
          </p>
        )}
      </Card>
    </div>
  );
};

const ExpensesPanel: React.FC<{ currency: string }> = ({ currency }) => {
  const date = new Date().toISOString().slice(0, 10);
  const { data, loading, error, reload } = useApi<any>(`/api/pos/expenses?date=${date}`);
  const [form, setForm] = useState({ category: '', amount: '', description: '' });
  const [removing, setRemoving] = useState<any | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');

  const removeExpense = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError('');
    try {
      const res = await fetch(`/api/pos/expenses/${removing.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRemoveError(data?.error || 'Could not delete this expense.');
        return;
      }
      setRemoving(null);
      reload();
    } finally {
      setRemoveBusy(false);
    }
  };

  const add = async () => {
    await fetch('/api/pos/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, expenseDate: date }),
    });
    setForm({ category: '', amount: '', description: '' });
    reload();
  };

  const expenses = data?.expenses || [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard label="Today's Expenses" value={money(data?.total, currency)} icon={Wallet} color="var(--ds-rose)" loading={loading && !data} />
        <StatCard label="Today's Entries" value={expenses.length} icon={ReceiptText} color="var(--ds-indigo)" loading={loading && !data} />
      </div>

      <Card>
        <CardHeader title="Add Expense" icon={Plus} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category (rent, bills...)" className="ds-input" />
          <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" className="ds-input ds-num" />
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Note" className="ds-input" />
          <Button variant="primary" icon={Plus} onClick={add} disabled={!form.category || !form.amount}>
            Add Expense
          </Button>
        </div>
      </Card>

      <DataTable
        columns={['Category', 'Note', { label: 'Amount', align: 'right' }, '']}
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={expenses.length === 0}
        empty={{ title: 'No expenses recorded today', icon: Wallet }}
      >
        {expenses.map((e: any) => (
          <tr key={e.id}>
            <td className="font-semibold">{e.category}</td>
            <td>{e.description || '—'}</td>
            <td style={{ textAlign: 'right' }}>
              <Num bold>
                {currency}
                {Number(e.amount).toLocaleString()}
              </Num>
            </td>
            <td style={{ textAlign: 'right', width: 56 }}>
              <IconButton
                icon={Trash2}
                label="Delete"
                tone="danger"
                size="sm"
                onClick={() => setRemoving(e)}
              />
            </td>
          </tr>
        ))}
      </DataTable>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Delete this expense?"
        message={removing ? `${removing.category} — ${money(removing.amount, currency)} will be removed from today's expenses.` : ''}
        confirmLabel="Delete"
        busy={removeBusy}
        onConfirm={removeExpense}
        onCancel={() => {
          setRemoving(null);
          setRemoveError('');
        }}
      >
        {removeError && <Notice tone="danger">{removeError}</Notice>}
      </ConfirmDialog>
    </div>
  );
};

const CounterPanel: React.FC<{ currency: string }> = ({ currency }) => {
  const { data, loading, error, reload } = useApi<any>('/api/pos/counter');
  const [cash, setCash] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const session = data?.session;

  const open = async () => {
    await fetch('/api/pos/counter/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openingCash: cash || 0 }),
    });
    setCash('');
    reload();
  };

  const close = async () => {
    const res = await fetch('/api/pos/counter/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closingCash: cash || 0 }),
    });
    setResult(await res.json());
    setCash('');
    reload();
  };

  return (
    <div className="max-w-xl space-y-4">
      <Card>
        {loading && !data ? (
          <SectionLoader lines={3} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <>
            <div className="flex items-start gap-3 mb-4">
              <span
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 'var(--ds-r-full)',
                  background: session ? 'var(--ds-success-soft)' : 'var(--ds-surface-3)',
                  color: session ? 'var(--ds-success-text)' : 'var(--ds-text-muted)',
                }}
              >
                <DoorOpen className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <p className="font-bold" style={fs('lg')}>
                  {session ? 'Counter is open' : 'No counter is open'}
                </p>
                {session && (
                  <p style={{ ...fs('sm'), color: 'var(--ds-text-muted)' }}>
                    {session.openedBy} · Float <Num>{currency}{Number(session.openingCash).toLocaleString()}</Num> ·{' '}
                    <Num>{session.openedAt ? new Date(session.openedAt).toLocaleString('en-GB') : ''}</Num>
                  </p>
                )}
              </div>
            </div>

            <label className="block mb-3">
              <span className="a-label">{session ? 'Cash Counted in Drawer' : 'Opening Float'}</span>
              <input type="number" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" className="ds-input ds-num" />
            </label>

            <Button variant={session ? 'danger' : 'primary'} onClick={session ? close : open}>
              {session ? 'Close Counter' : 'Open Counter'}
            </Button>
          </>
        )}
      </Card>

      {result && (
        <Card>
          <CardHeader title="Counter Closing" icon={Coins} />
          <div className="divide-y" style={{ borderColor: 'var(--ds-border-soft)' }}>
            <DetailRow label="Opening Float"><Num>{currency}{result.openingCash?.toLocaleString()}</Num></DetailRow>
            <DetailRow label="Cash Sales"><Num>{currency}{result.cashSales?.toLocaleString()}</Num></DetailRow>
            <DetailRow label="Expenses"><Num>−{currency}{result.expenses?.toLocaleString()}</Num></DetailRow>
            <DetailRow label="Expected"><Num bold>{currency}{result.expected?.toLocaleString()}</Num></DetailRow>
            <DetailRow label="Counted"><Num>{currency}{result.counted?.toLocaleString()}</Num></DetailRow>
            <DetailRow label="Difference">
              <Num bold color={result.difference === 0 ? 'var(--ds-success-text)' : 'var(--ds-warning-text)'}>
                {currency}{result.difference?.toLocaleString()}
              </Num>
            </DetailRow>
          </div>
        </Card>
      )}
    </div>
  );
};

const SummaryPanel: React.FC<{ currency: string }> = ({ currency }) => {
  const [date, setDate] = useState(today());
  const { data, loading, error, reload } = useApi<any>(`/api/pos/summary?date=${date}`);

  const cards: Array<{ label: string; value: React.ReactNode; icon: IconType; color: string }> = [
    { label: 'Orders', value: data?.orderCount ?? 0, icon: ShoppingCart, color: 'var(--ds-indigo)' },
    { label: 'POS Sales', value: money(data?.posTotal, currency), icon: Receipt, color: 'var(--primary-ink, var(--primary))' },
    { label: 'Website Sales', value: money(data?.webTotal, currency), icon: TrendingUp, color: 'var(--ds-teal)' },
    { label: 'Total Sales', value: money(data?.grossTotal, currency), icon: BarChart3, color: 'var(--ds-violet)' },
    { label: 'Cash Received', value: money(data?.cashReceived, currency), icon: Coins, color: 'var(--ds-success)' },
    { label: 'Expenses', value: money(data?.expenseTotal, currency), icon: Wallet, color: 'var(--ds-rose)' },
    { label: 'Net Cash', value: money(data?.netCash, currency), icon: BadgeDollarSign, color: 'var(--ds-amber)' },
  ];

  const methods = data?.byMethod ? Object.entries(data.byMethod) : [];

  return (
    <div className="space-y-5">
      <label className="block max-w-xs">
        <span className="a-label">Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ds-input" />
      </label>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((card) => (
            <StatCard key={card.label} {...card} loading={loading} />
          ))}
        </div>
      )}

      {!error && (
        <DataTable
          title="By Payment Method"
          columns={['Method', { label: 'Amount', align: 'right' }]}
          loading={loading}
          isEmpty={methods.length === 0}
          empty={{ title: 'No payments on this day', icon: Coins }}
        >
          {methods.map(([method, amount]) => (
            <tr key={method}>
              <td className="uppercase font-semibold">{method}</td>
              <td style={{ textAlign: 'right' }}>
                <Num bold>{money(amount, currency)}</Num>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
};

/* =========================================================================
   Ledgers, procurement returns, HR and master data
   Every panel here talks to /api/pos/*, which is gated by the module
   permissions granted to the signed-in staff account.
   ========================================================================= */

const CustomerLedgerPanel: React.FC<{ currency: string }> = ({ currency }) => {
  const { data, loading, error, reload } = useApi<any>('/api/pos/customer-ledger');
  const [form, setForm] = useState({ customerId: '', customerName: '', amount: '', method: 'cash', note: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    if (!form.customerName || !(Number(form.amount) > 0)) {
      setMsg('Select a customer and enter an amount.');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/pos/customer-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, paymentDate: today() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setForm({ customerId: '', customerName: '', amount: '', method: 'cash', note: '' });
      reload();
    } catch (err: any) {
      setMsg(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const customers = data?.customers || [];
  const totalDue = customers.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.due) || 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard label="Total Due" value={money(totalDue, currency)} icon={BookUser} color="var(--ds-danger)" loading={loading && !data} />
        <StatCard label="Customers" value={customers.length} icon={Users} color="var(--ds-indigo)" loading={loading && !data} />
      </div>

      <Card>
        <CardHeader title="Collect Due" icon={Coins} accent="var(--ds-indigo)" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={form.customerId}
            onChange={(e) => {
              const customer = customers.find((row: any) => String(row.id) === e.target.value);
              setForm({ ...form, customerId: e.target.value, customerName: customer?.name || '' });
            }}
            className="ds-select"
          >
            <option value="">Select a customer</option>
            {customers.map((row: any) => (
              <option key={row.id} value={row.id}>
                {row.name} — Due {money(row.due, currency)}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            placeholder="Amount"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="ds-input ds-num"
          />
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="ds-select">
            <option value="cash">Cash</option>
            <option value="bkash">bKash</option>
            <option value="nagad">Nagad</option>
            <option value="bank">Bank</option>
          </select>
          <Button variant="primary" onClick={save} loading={saving}>
            Collect Payment
          </Button>
        </div>
        {msg && <div className="mt-3"><Notice tone="danger">{msg}</Notice></div>}
      </Card>

      <DataTable
        columns={['Customer', 'Phone', { label: 'Total Spent', align: 'right' }, { label: 'Collected', align: 'right' }, { label: 'Due', align: 'right' }]}
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={customers.length === 0}
        empty={{ title: 'No customers yet', icon: BookUser }}
      >
        {customers.map((row: any) => (
          <tr key={row.id}>
            <td className="font-semibold">{row.name}</td>
            <td><Num>{row.phone}</Num></td>
            <td style={{ textAlign: 'right' }}><Num>{money(row.totalSpent, currency)}</Num></td>
            <td style={{ textAlign: 'right' }}><Num>{money(row.collected, currency)}</Num></td>
            <td style={{ textAlign: 'right' }}>
              <Num bold color={dueColor(row.due)}>{money(row.due, currency)}</Num>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
};

const SupplierLedgerPanel: React.FC<{ currency: string }> = ({ currency }) => {
  const { data, loading, error, reload } = useApi<any>('/api/pos/supplier-ledger');
  const [form, setForm] = useState({ supplierId: '', supplierName: '', amount: '', method: 'cash' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.supplierName || !(Number(form.amount) > 0)) return;
    setSaving(true);
    await fetch('/api/pos/supplier-payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, paymentDate: today() }),
    });
    setForm({ supplierId: '', supplierName: '', amount: '', method: 'cash' });
    setSaving(false);
    reload();
  };

  const suppliers = data?.suppliers || [];
  const totalDue = suppliers.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.due) || 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard label="Owed to Suppliers" value={money(totalDue, currency)} icon={Receipt} color="var(--ds-danger)" loading={loading && !data} />
        <StatCard label="Suppliers" value={suppliers.length} icon={Truck} color="var(--ds-indigo)" loading={loading && !data} />
      </div>

      <Card>
        <CardHeader title="Pay Supplier" icon={Coins} accent="var(--ds-indigo)" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={form.supplierId}
            onChange={(e) => {
              const supplier = suppliers.find((row: any) => String(row.id) === e.target.value);
              setForm({ ...form, supplierId: e.target.value, supplierName: supplier?.name || '' });
            }}
            className="ds-select"
          >
            <option value="">Select a supplier</option>
            {suppliers.map((row: any) => (
              <option key={row.id} value={row.id}>
                {row.name} — Due {money(row.due, currency)}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            placeholder="Amount"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="ds-input ds-num"
          />
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="ds-select">
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="cheque">Cheque</option>
          </select>
          <Button variant="primary" onClick={save} loading={saving}>
            Record Payment
          </Button>
        </div>
      </Card>

      <DataTable
        columns={['Supplier', { label: 'Billed', align: 'right' }, { label: 'Paid', align: 'right' }, { label: 'Due', align: 'right' }]}
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={suppliers.length === 0}
        empty={{ title: 'No suppliers yet', icon: Truck }}
      >
        {suppliers.map((row: any) => (
          <tr key={row.id}>
            <td className="font-semibold">{row.name}</td>
            <td style={{ textAlign: 'right' }}><Num>{money(row.billed, currency)}</Num></td>
            <td style={{ textAlign: 'right' }}><Num>{money(row.paid, currency)}</Num></td>
            <td style={{ textAlign: 'right' }}>
              <Num bold color={dueColor(row.due)}>{money(row.due, currency)}</Num>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
};

const PurchaseReturnPanel: React.FC<{ currency: string }> = ({ currency }) => {
  const { data, loading, error, reload } = useApi<any[]>('/api/pos/purchase-returns');
  const { data: suppliers } = useApi<any[]>('/api/pos/suppliers');
  const { data: products } = useApi<any[]>('/api/pos/products?limit=500');
  const [supplierId, setSupplierId] = useState('');
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const total = items.reduce((sum, item) => sum + Number(item.unitCost) * Number(item.quantity), 0);

  const submit = async () => {
    const supplier = (suppliers || []).find((row: any) => String(row.id) === supplierId);
    if (!supplier || items.length === 0) {
      setMsg('Select a supplier and at least one product.');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/pos/purchase-returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: supplier.id, supplierName: supplier.name, reason, items }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setItems([]);
      setReason('');
      reload();
    } catch (err: any) {
      setMsg(err.message || "Couldn't save the return.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="New Purchase Return" icon={Undo2} accent="var(--ds-teal)" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="ds-select">
            <option value="">Select a supplier</option>
            {(suppliers || []).map((row: any) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>

          <select
            value=""
            onChange={(e) => {
              const product = (products || []).find((row: any) => String(row.id) === e.target.value);
              if (!product) return;
              setItems((list) => [
                ...list,
                {
                  productId: product.id,
                  productName: product.name,
                  quantity: 1,
                  unitCost: Number(product.costPrice || product.price || 0),
                },
              ]);
            }}
            className="ds-select"
          >
            <option value="">+ Add a product</option>
            {(products || []).map((row: any) => (
              <option key={row.id} value={row.id}>
                {row.name} ({row.stock})
              </option>
            ))}
          </select>

          <input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="ds-input" />
        </div>

        {items.length > 0 && (
          <div className="mt-4 space-y-2">
            {items.map((item, index) => (
              <div
                key={index}
                className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2"
                style={{ background: 'var(--ds-surface-2)', borderRadius: 'var(--ds-r-md)' }}
              >
                <span className="flex-1 min-w-[140px] font-semibold truncate" style={fs('base')}>
                  {item.productName}
                </span>
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => {
                    const next = [...items];
                    next[index] = { ...item, quantity: Number(e.target.value) };
                    setItems(next);
                  }}
                  className="ds-input ds-num"
                  style={{ width: 80, height: 'var(--ds-h-sm)' }}
                  aria-label="Quantity"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unitCost}
                  onChange={(e) => {
                    const next = [...items];
                    next[index] = { ...item, unitCost: e.target.value };
                    setItems(next);
                  }}
                  className="ds-input ds-num"
                  style={{ width: 100, height: 'var(--ds-h-sm)' }}
                  aria-label="Unit Cost"
                />
                <IconButton icon={Trash2} label="Remove" tone="danger" size="sm" onClick={() => setItems(items.filter((_, i) => i !== index))} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <span className="font-bold" style={fs('lg')}>
            Total: <Num>{money(total, currency)}</Num>
          </span>
          <Button variant="primary" onClick={submit} loading={saving}>
            Return to Supplier
          </Button>
        </div>
        {msg && <div className="mt-3"><Notice tone="danger">{msg}</Notice></div>}
      </Card>

      <DataTable
        title="Past Returns"
        columns={['Return #', 'Supplier', 'Date', { label: 'Total', align: 'right' }]}
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={(data || []).length === 0}
        empty={{ title: 'No purchase returns yet', icon: Undo2 }}
      >
        {(data || []).map((row: any) => (
          <tr key={row.id}>
            <td style={{ fontFamily: 'var(--font-mono)' }}>{row.returnNumber}</td>
            <td>{row.supplierName}</td>
            <td><Num>{row.returnDate}</Num></td>
            <td style={{ textAlign: 'right' }}><Num bold>{money(row.total, currency)}</Num></td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
};

const PRE_ORDER_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'arrived', label: 'Arrived' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PreOrderPanel: React.FC<{ currency: string }> = ({ currency }) => {
  const { data, loading, error, reload } = useApi<any[]>('/api/pos/pre-orders');
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    productName: '',
    quantity: 1,
    advance: '',
    expectedDate: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/pos/pre-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setForm({ customerName: '', customerPhone: '', productName: '', quantity: 1, advance: '', expectedDate: '' });
      reload();
    } catch (err: any) {
      setMsg(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: number, status: string) => {
    await fetch(`/api/pos/pre-orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    reload();
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="New Pre-Order" icon={ClipboardList} accent="var(--ds-indigo)" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="block">
            <span className="a-label">Customer Name</span>
            <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="ds-input" />
          </label>
          <label className="block">
            <span className="a-label">Phone</span>
            <input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} className="ds-input ds-num" />
          </label>
          <label className="block">
            <span className="a-label">Product</span>
            <input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} className="ds-input" />
          </label>
          <label className="block">
            <span className="a-label">Quantity</span>
            <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className="ds-input ds-num" />
          </label>
          <label className="block">
            <span className="a-label">Advance</span>
            <input type="number" min={0} placeholder="0" value={form.advance} onChange={(e) => setForm({ ...form, advance: e.target.value })} className="ds-input ds-num" />
          </label>
          <label className="block">
            <span className="a-label">Expected Date</span>
            <input type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} className="ds-input" />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <Button variant="primary" icon={Plus} onClick={save} loading={saving}>
            Add Pre-Order
          </Button>
        </div>
        {msg && <div className="mt-3"><Notice tone="danger">{msg}</Notice></div>}
      </Card>

      <DataTable
        columns={['Customer', 'Product', { label: 'Qty', align: 'right' }, { label: 'Advance', align: 'right' }, 'Expected', 'Status']}
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={(data || []).length === 0}
        empty={{ title: 'No pre-orders yet', icon: ClipboardList }}
      >
        {(data || []).map((row: any) => (
          <tr key={row.id}>
            <td>
              <span className="block font-semibold">{row.customerName}</span>
              <Muted>{row.customerPhone}</Muted>
            </td>
            <td>{row.productName}</td>
            <td style={{ textAlign: 'right' }}><Num>{row.quantity}</Num></td>
            <td style={{ textAlign: 'right' }}><Num>{money(row.advance, currency)}</Num></td>
            <td><Num>{row.expectedDate || '—'}</Num></td>
            <td>
              <StatusSelect
                value={row.status}
                options={
                  PRE_ORDER_STATUSES.some((s) => s.value === row.status)
                    ? PRE_ORDER_STATUSES
                    : [...PRE_ORDER_STATUSES, { value: row.status, label: row.status }]
                }
                onChange={(status) => setStatus(row.id, status)}
              />
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
};

const ProductIssuePanel: React.FC = () => {
  const { data, loading, error, reload } = useApi<any[]>('/api/pos/product-issues');
  const { data: products } = useApi<any[]>('/api/pos/products?limit=500');
  const [form, setForm] = useState({ productId: '', quantity: 1, issueType: 'damage', issuedTo: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/pos/product-issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, issueDate: today() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setForm({ productId: '', quantity: 1, issueType: 'damage', issuedTo: '', note: '' });
      reload();
    } catch (err: any) {
      setMsg(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Stock Issue" subtitle="Remove stock for damage, samples or internal use" icon={PackageMinus} accent="var(--ds-teal)" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block">
            <span className="a-label">Product</span>
            <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className="ds-select">
              <option value="">Select a product</option>
              {(products || []).map((row: any) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.stock})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="a-label">Quantity</span>
            <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className="ds-input ds-num" />
          </label>
          <label className="block">
            <span className="a-label">Type</span>
            <select value={form.issueType} onChange={(e) => setForm({ ...form, issueType: e.target.value })} className="ds-select">
              <option value="damage">Damage</option>
              <option value="sample">Sample</option>
              <option value="internal">Internal use</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <label className="block">
            <span className="a-label">Issued To</span>
            <input value={form.issuedTo} onChange={(e) => setForm({ ...form, issuedTo: e.target.value })} className="ds-input" />
          </label>
        </div>
        <div className="mt-4">
          <Button variant="primary" onClick={save} loading={saving}>
            Issue Stock
          </Button>
        </div>
        {msg && <div className="mt-3"><Notice tone="danger">{msg}</Notice></div>}
      </Card>

      <DataTable
        columns={['Product', { label: 'Qty', align: 'right' }, 'Type', 'Issued To', 'Date']}
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={(data || []).length === 0}
        empty={{ title: 'No stock issued yet', icon: PackageMinus }}
      >
        {(data || []).map((row: any) => (
          <tr key={row.id}>
            <td className="font-semibold">{row.productName}</td>
            <td style={{ textAlign: 'right' }}><Num>{row.quantity}</Num></td>
            <td><span className="ds-badge ds-badge-neutral">{row.issueType}</span></td>
            <td>{row.issuedTo || '—'}</td>
            <td><Num>{row.issueDate}</Num></td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
};

const SalaryPanel: React.FC<{ currency: string }> = ({ currency }) => {
  const { data, loading, error, reload } = useApi<any[]>('/api/pos/salaries');
  const [form, setForm] = useState({
    employeeName: '',
    designation: '',
    month: new Date().toISOString().slice(0, 7),
    basic: '',
    bonus: '',
    deduction: '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.employeeName) return;
    setSaving(true);
    await fetch('/api/pos/salaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ ...form, employeeName: '', designation: '', basic: '', bonus: '', deduction: '' });
    setSaving(false);
    reload();
  };

  const net = Number(form.basic || 0) + Number(form.bonus || 0) - Number(form.deduction || 0);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Salary Record" icon={BadgeDollarSign} accent="var(--ds-violet)" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="block">
            <span className="a-label">Employee Name</span>
            <input value={form.employeeName} onChange={(e) => setForm({ ...form, employeeName: e.target.value })} className="ds-input" />
          </label>
          <label className="block">
            <span className="a-label">Job Title</span>
            <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="ds-input" />
          </label>
          <label className="block">
            <span className="a-label">Month</span>
            <input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} className="ds-input" />
          </label>
          <label className="block">
            <span className="a-label">Basic Salary</span>
            <input type="number" placeholder="0" value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} className="ds-input ds-num" />
          </label>
          <label className="block">
            <span className="a-label">Bonus</span>
            <input type="number" placeholder="0" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} className="ds-input ds-num" />
          </label>
          <label className="block">
            <span className="a-label">Deduction</span>
            <input type="number" placeholder="0" value={form.deduction} onChange={(e) => setForm({ ...form, deduction: e.target.value })} className="ds-input ds-num" />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <span style={{ ...fs('base'), color: 'var(--ds-text-soft)' }}>
            Net Pay: <Num bold>{money(net, currency)}</Num>
          </span>
          <Button variant="primary" onClick={save} loading={saving} disabled={!form.employeeName}>
            Record Salary
          </Button>
        </div>
      </Card>

      <DataTable
        columns={['Employee', 'Month', { label: 'Basic', align: 'right' }, { label: 'Bonus', align: 'right' }, { label: 'Deduction', align: 'right' }, { label: 'Net Pay', align: 'right' }]}
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={(data || []).length === 0}
        empty={{ title: 'No salary records yet', icon: BadgeDollarSign }}
      >
        {(data || []).map((row: any) => (
          <tr key={row.id}>
            <td>
              <span className="block font-semibold">{row.employeeName}</span>
              <Muted>{row.designation || '—'}</Muted>
            </td>
            <td><Num>{row.month}</Num></td>
            <td style={{ textAlign: 'right' }}><Num>{money(row.basic, currency)}</Num></td>
            <td style={{ textAlign: 'right' }}><Num>{money(row.bonus, currency)}</Num></td>
            <td style={{ textAlign: 'right' }}><Num>{money(row.deduction, currency)}</Num></td>
            <td style={{ textAlign: 'right' }}><Num bold>{money(row.netPay, currency)}</Num></td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
};

const MASTER_TYPES = [
  { id: 'generics', label: 'Generic' },
  { id: 'manufacturers', label: 'Manufacturer' },
  { id: 'product-groups', label: 'Product Group' },
];

const MasterDataPanel: React.FC = () => {
  const [type, setType] = useState('generics');
  const { data, loading, error, reload } = useApi<any[]>(`/api/pos/master/${type}`);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`/api/pos/master/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setName('');
      reload();
    } catch (err: any) {
      setMsg(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const [removing, setRemoving] = useState<any | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const remove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      const res = await fetch(`/api/pos/master/${type}/${removing.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg(data?.error || "Couldn't delete.");
      }
      setRemoving(null);
      reload();
    } finally {
      setRemoveBusy(false);
    }
  };

  const typeLabel = MASTER_TYPES.find((item) => item.id === type)?.label || '';

  return (
    <div className="space-y-5 max-w-3xl">
      <TabStrip tabs={MASTER_TYPES} active={type} onChange={setType} />

      <Card>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <input placeholder={`New ${typeLabel}`} value={name} onChange={(e) => setName(e.target.value)} className="ds-input" />
          <Button type="submit" variant="primary" icon={Plus} loading={saving} className="shrink-0">
            Add
          </Button>
        </form>
        {msg && <div className="mt-3"><Notice tone="danger">{msg}</Notice></div>}
      </Card>

      <DataTable
        columns={[typeLabel, '']}
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={(data || []).length === 0}
        empty={{ title: 'Nothing added yet', icon: Layers }}
      >
        {(data || []).map((row: any) => (
          <tr key={row.id}>
            <td className="font-medium">{row.name}</td>
            <td style={{ textAlign: 'right', width: 56 }}>
              <IconButton icon={Trash2} label="Delete" tone="danger" size="sm" onClick={() => setRemoving(row)} />
            </td>
          </tr>
        ))}
      </DataTable>

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Delete "${removing?.name || ''}"?`}
        message={`It is removed from the ${typeLabel.toLowerCase()} list.`}
        confirmLabel="Delete"
        busy={removeBusy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
};

const ReportsPanel: React.FC<{ currency: string }> = ({ currency }) => {
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(today());
  const { data, loading, error, reload } = useApi<any>(`/api/admin/reports?from=${from}&to=${to}`);

  const cards: Array<{ label: string; value: any; icon: IconType; color: string }> = [
    { label: 'Revenue', value: data?.summary?.revenue, icon: TrendingUp, color: 'var(--primary-ink, var(--primary))' },
    { label: 'Purchases', value: data?.summary?.purchases, icon: PackagePlus, color: 'var(--ds-teal)' },
    { label: 'Expenses', value: data?.summary?.expenses, icon: Wallet, color: 'var(--ds-rose)' },
    { label: 'Net Profit', value: data?.summary?.netProfit, icon: BadgeDollarSign, color: 'var(--ds-violet)' },
  ];
  const top = data?.topProducts || [];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="block">
            <span className="a-label">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ds-input" style={{ width: 170 }} />
          </label>
          <label className="block">
            <span className="a-label">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ds-input" style={{ width: 170 }} />
          </label>
          <Button variant="primary" onClick={reload}>
            View
          </Button>
        </div>
      </Card>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((card) => (
              <StatCard key={card.label} label={card.label} value={money(card.value, currency)} icon={card.icon} color={card.color} loading={loading} />
            ))}
          </div>

          <DataTable
            title="Top-Selling Products"
            columns={['Product', { label: 'Qty', align: 'right' }, { label: 'Revenue', align: 'right' }]}
            loading={loading}
            isEmpty={top.length === 0}
            empty={{ title: 'No sales in this period', icon: FileBarChart }}
          >
            {top.map((row: any) => (
              <tr key={row.productId}>
                <td className="font-semibold">{row.name}</td>
                <td style={{ textAlign: 'right' }}><Num>{row.qty}</Num></td>
                <td style={{ textAlign: 'right' }}><Num bold>{money(row.revenue, currency)}</Num></td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </div>
  );
};

const UsersPanel: React.FC = () => {
  const { data, loading, error, reload } = useApi<any[]>('/api/admin/users');
  const { data: modules } = useApi<string[]>('/api/admin/permission-modules');
  const [form, setForm] = useState<any>({
    name: '',
    email: '',
    password: '',
    jobRole: '',
    role: 'staff',
    permissions: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setForm({ name: '', email: '', password: '', jobRole: '', role: 'staff', permissions: [] });
      reload();
    } catch (err: any) {
      setMsg(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row: any) => {
    await fetch(`/api/admin/users/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: row.status === 'active' ? 'inactive' : 'active' }),
    });
    reload();
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Add Staff Account" icon={UserCog} accent="var(--ds-violet)" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block">
            <span className="a-label">Name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="ds-input" />
          </label>
          <label className="block">
            <span className="a-label">Email</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="ds-input" />
          </label>
          <label className="block">
            <span className="a-label">Password</span>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="ds-input" />
          </label>
          <label className="block">
            <span className="a-label">Job Title</span>
            <input value={form.jobRole} onChange={(e) => setForm({ ...form, jobRole: e.target.value })} className="ds-input" />
          </label>
        </div>

        {(modules || []).length > 0 && (
          <div className="mt-4">
            <span className="a-label">Module Permissions</span>
            <div className="flex flex-wrap gap-1.5">
              {(modules || []).map((key) => {
                const on = form.permissions.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setForm({
                        ...form,
                        permissions: on
                          ? form.permissions.filter((item: string) => item !== key)
                          : [...form.permissions, key],
                      })
                    }
                    className="font-semibold cursor-pointer transition-all"
                    style={{
                      height: 'var(--ds-h-sm)',
                      padding: '0 12px',
                      borderRadius: 'var(--ds-r-full)',
                      ...fs('sm'),
                      background: on ? 'var(--primary)' : 'var(--ds-surface)',
                      color: on ? 'var(--primary-foreground)' : 'var(--ds-text-soft)',
                      border: `1px solid ${on ? 'var(--primary)' : 'var(--ds-border-strong)'}`,
                    }}
                  >
                    {(MODULE_INFO as any)[key]?.label || key}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4">
          <Button variant="primary" icon={Plus} onClick={save} loading={saving}>
            Create Account
          </Button>
        </div>
        {msg && <div className="mt-3"><Notice tone="danger">{msg}</Notice></div>}
      </Card>

      <DataTable
        columns={['Name', 'Email', 'Role', { label: 'Modules', align: 'right' }, 'Status']}
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={(data || []).length === 0}
        empty={{ title: 'No staff accounts yet', icon: Users }}
      >
        {(data || []).map((row: any) => (
          <tr key={row.id}>
            <td className="font-semibold">{row.name}</td>
            <td>{row.email}</td>
            <td>{row.jobRole || row.role}</td>
            <td style={{ textAlign: 'right' }}>
              <Num>{row.role === 'admin' ? 'All' : (row.permissions || []).length}</Num>
            </td>
            <td>
              <button
                type="button"
                onClick={() => toggleStatus(row)}
                title="Change status"
                className={`ds-badge cursor-pointer ${row.status === 'active' ? 'ds-badge-success' : 'ds-badge-danger'}`}
              >
                {row.status === 'active' ? 'Active' : 'Inactive'}
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
};
