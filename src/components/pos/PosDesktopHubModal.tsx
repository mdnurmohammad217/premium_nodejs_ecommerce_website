import React, { useEffect, useState } from 'react';
import {
  X,
  ShoppingCart,
  RotateCcw,
  PackagePlus,
  Clock,
  CreditCard,
  Banknote,
  Building2,
  Sliders,
  ClipboardList,
  Coins,
  ReceiptText,
  BarChart3,
  AlertTriangle,
  TrendingUp,
  Search,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { IconButton, SearchInput, EmptyState, tint, mix } from '../admin/ui.tsx';

interface PosDesktopHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (actionKey: string, payload?: any) => void;
}

export const PosDesktopHubModal: React.FC<PosDesktopHubModalProps> = ({
  isOpen,
  onClose,
  onSelectAction,
}) => {
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modules = [
    {
      id: 'sales',
      title: 'Sales',
      banglaTitle: 'Counter Sale',
      shortcut: 'F8',
      desc: 'Barcode scanning, prescription dispensing & rapid billing',
      icon: ShoppingCart,
      accent: 'var(--ds-info)',
    },
    {
      id: 'return',
      title: 'Sales Return',
      banglaTitle: 'Customer Returns',
      shortcut: 'F9',
      desc: 'Customer item returns, inventory restock & refund processing',
      icon: RotateCcw,
      accent: 'var(--ds-amber)',
    },
    {
      id: 'purchase',
      title: 'Purchase',
      banglaTitle: 'Purchase Invoice',
      shortcut: 'Ctrl+P',
      desc: 'Supplier GRN entry, batch pricing, cost tracking & stock in',
      icon: PackagePlus,
      accent: 'var(--primary)',
    },
    {
      id: 'pre_order',
      title: 'Pre Order',
      banglaTitle: 'Advance Booking',
      shortcut: '',
      desc: 'Patient advance orders, imported specialized medicines booking',
      icon: Clock,
      accent: 'var(--ds-teal)',
    },
    {
      id: 'customer_payment',
      title: 'Customer Payment',
      banglaTitle: 'Due Collection',
      shortcut: '',
      desc: 'Collect due dues from regular patients, corporate accounts',
      icon: CreditCard,
      accent: 'var(--ds-indigo)',
    },
    {
      id: 'customer_refund',
      title: 'Customer Refund',
      banglaTitle: 'Refund to Customer',
      shortcut: '',
      desc: 'Issue cash or digital wallet refunds with receipt record',
      icon: Banknote,
      accent: 'var(--ds-rose)',
    },
    {
      id: 'supplier_payment',
      title: 'Supplier Payment',
      banglaTitle: 'Pay a Supplier',
      shortcut: '',
      desc: 'Supplier invoices, dues & ledger clearance',
      icon: Building2,
      accent: 'var(--ds-violet)',
    },
    {
      id: 'adjustment',
      title: 'Product Adjustment',
      banglaTitle: 'Stock Adjustment',
      shortcut: '',
      desc: 'Damaged strips, broken ampoules, wastage correction',
      icon: Sliders,
      accent: 'var(--ds-warning)',
    },
    {
      id: 'inventory_log',
      title: 'Product Inventory Log',
      banglaTitle: 'Inventory Audit Log',
      shortcut: '',
      desc: 'Complete ledger of all in/out/dispense movements per SKU',
      icon: ClipboardList,
      accent: 'var(--ds-teal)',
    },
    {
      id: 'cash_received',
      title: 'Daily Cash Received',
      banglaTitle: 'Daily Cash In',
      shortcut: '',
      desc: 'Morning float cash, drawer counting, handover balance',
      icon: Coins,
      accent: 'var(--ds-success)',
    },
    {
      id: 'expenses',
      title: 'Daily Expenses',
      banglaTitle: 'Shop Running Costs',
      shortcut: '',
      desc: 'Pharmacy electricity, staff snacks, municipal fees, transport',
      icon: ReceiptText,
      accent: 'var(--ds-amber)',
    },
    {
      id: 'reports',
      title: 'Reports & Z-Report',
      banglaTitle: 'Daily Accounts & Reports',
      shortcut: '',
      desc: 'Daily closing sales, payment modes split, register reconciliation',
      icon: BarChart3,
      accent: 'var(--ds-info)',
    },
    {
      id: 'expired_list',
      title: 'Expired & Near Expiry',
      banglaTitle: 'Expiry List',
      shortcut: '',
      desc: 'Medicines expiring in 30, 60, or 90 days for vendor return',
      icon: AlertTriangle,
      accent: 'var(--ds-danger)',
    },
    {
      id: 'analytics',
      title: 'Analytical Report',
      banglaTitle: 'Business Analytics',
      shortcut: '',
      desc: 'Top dispensing generics, peak counter hours, margin analysis',
      icon: TrendingUp,
      accent: 'var(--ds-violet)',
    },
  ];

  const filtered = modules.filter(
    (m) =>
      m.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.banglaTitle.includes(searchFilter) ||
      m.desc.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div
      className="admin-shell fixed inset-0 flex items-center justify-center p-3 md:p-6"
      style={{ zIndex: 'var(--ds-z-modal)' as any }}
    >
      <div
        className="absolute inset-0 ds-fade-in"
        style={{ background: 'var(--ds-overlay)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="POS Operations"
        className="relative w-full max-w-6xl flex flex-col overflow-hidden ds-scale-in"
        style={{
          maxHeight: '92dvh',
          background: 'var(--ds-surface)',
          borderRadius: 'var(--ds-r-xl)',
          boxShadow: 'var(--ds-shadow-xl)',
        }}
      >
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 md:px-6 py-4 select-none"
          style={{ borderBottom: '1px solid var(--ds-border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="flex items-center justify-center shrink-0"
              style={{ width: 40, height: 40, borderRadius: 'var(--ds-r-md)', background: tint(0.12), color: 'var(--primary-ink, var(--primary))' }}
            >
              <Layers className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-bold truncate" style={{ fontSize: 'var(--ds-fs-xl)' }}>
                POS Operations
              </h2>
              <p className="truncate" style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-muted)' }}>
                Vendor and counter operations, with keyboard shortcuts
              </p>
            </div>
            <IconButton icon={X} label="Close" tone="plain" onClick={onClose} className="sm:hidden ml-auto" />
          </div>

          <div className="flex items-center gap-2">
            <SearchInput
              value={searchFilter}
              onChange={setSearchFilter}
              placeholder="Search operations"
              className="w-full sm:w-64"
            />
            <IconButton icon={X} label="Close" tone="plain" onClick={onClose} className="hidden sm:inline-flex" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6" style={{ background: 'var(--ds-bg)' }}>
          {filtered.length === 0 ? (
            <EmptyState icon={Search} title="No operations found" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3">
              {filtered.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectAction(item.id);
                      onClose();
                    }}
                    className="a-card ds-card-hover group p-3.5 text-left cursor-pointer flex flex-col justify-between gap-3"
                    style={{ minHeight: 140 }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="flex items-center justify-center shrink-0"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 'var(--ds-r-md)',
                          background: mix(item.accent, 0.12),
                          color: item.accent,
                        }}
                      >
                        <Icon className="w-5 h-5" />
                      </span>
                      {item.shortcut && (
                        <kbd
                          className="font-semibold"
                          style={{
                            fontSize: 'var(--ds-fs-2xs)',
                            fontFamily: 'var(--font-mono)',
                            padding: '2px 6px',
                            borderRadius: 'var(--ds-r-xs)',
                            background: 'var(--ds-surface-3)',
                            border: '1px solid var(--ds-border)',
                            color: 'var(--ds-text-soft)',
                          }}
                        >
                          {item.shortcut}
                        </kbd>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h3 className="font-bold truncate" style={{ fontSize: 'var(--ds-fs-base)' }}>
                          {item.title}
                        </h3>
                        <ArrowRight
                          className="w-3.5 h-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
                          style={{ color: 'var(--ds-text-faint)' }}
                        />
                      </div>
                      <p className="font-semibold truncate" style={{ fontSize: 'var(--ds-fs-xs)', color: 'var(--ds-text-soft)' }}>
                        {item.banglaTitle}
                      </p>
                      <p
                        className="ds-clamp-2 mt-1 hidden sm:block"
                        style={{ fontSize: 'var(--ds-fs-2xs)', color: 'var(--ds-text-muted)', lineHeight: 1.45 }}
                      >
                        {item.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="hidden sm:flex items-center justify-between gap-3 px-6 py-3"
          style={{ borderTop: '1px solid var(--ds-border)', fontSize: 'var(--ds-fs-xs)', color: 'var(--ds-text-muted)' }}
        >
          <span>Press Esc to return to the sales screen</span>
          <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)' }}>
            <span className="ds-badge ds-badge-neutral">F8 Sales</span>
            <span className="ds-badge ds-badge-neutral">F9 Returns</span>
          </div>
        </div>
      </div>
    </div>
  );
};
