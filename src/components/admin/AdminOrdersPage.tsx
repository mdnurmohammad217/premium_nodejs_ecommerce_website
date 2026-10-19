import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShoppingCart,
  Truck,
  Eye,
  Edit2,
  Printer,
  Trash2,
  RotateCcw,
  RefreshCw,
  Copy,
  Send,
  Plus,
  Minus,
  Download,
  ExternalLink,
  ChevronDown,
  CreditCard,
  Package,
  SlidersHorizontal,
  MapPin,
  X,
  CalendarDays,
  Wallet,
  UserCheck,
} from 'lucide-react';
import { OrderFormDrawer } from './OrderFormDrawer.tsx';
import {
  PageHeader,
  Card,
  Button,
  IconButton,
  FilterPills,
  StatusSelect,
  SearchInput,
  Select,
  Checkbox,
  BulkBar,
  BulkAction,
  SortableTh,
  EmptyState,
  ErrorState,
  LoadingRows,
  Pagination,
  Drawer,
  Modal,
  ConfirmDialog,
  Field,
  Money,
  Thumb,
  DetailRow,
  useSelection,
  useToasts,
  mix,
} from './ui.tsx';
import { InvoiceView, InvoicePaper, InvoiceSize } from './InvoiceView.tsx';
import { printInvoices } from '../../lib/printDocument.ts';
import { isOnlineGateway, GATEWAY_LOOK } from '../../lib/onlinePayment.ts';
import { FraudPanel, FraudPill, useFraudSummary } from './AdminFraudPage.tsx';
import {
  StatusBoard,
  statusMeta,
  PaymentMethodBadge,
  registerPaymentNames,
  PaymentStatusPill,
  paymentLabel,
  paymentStatusLabel,
  OrderSourceBadges,
  ItemThumbs,
  OnlinePaymentPanel,
} from './OrdersParts.tsx';

interface AdminOrdersPageProps {
  /**
   * Accepted for compatibility with the shell, which still passes mode="all".
   * Abandoned checkouts are a separate dataset on their own page now, so this
   * list only ever renders placed orders.
   */
  mode?: 'all' | 'incomplete';
  onViewOrder?: (orderId: number) => void;
  currency?: string;
  invoiceConfig?: any;
  general?: any;
  /** Opens Sales → Returns with this order ready to return */
  onCreateReturn?: (orderNumber: string) => void;
  /** Open the list already filtered to the orders of one landing page */
  initialLandingPageId?: number;
  /** Full site settings (delivery zones, district & thana) for the Add / Edit Order form */
  settings?: any;
}

const ORDER_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'partially_returned', label: 'Partly Returned' },
  { value: 'returned', label: 'Returned' },
];

const PAYMENT_METHODS = [
  { value: 'cod', label: 'Cash on Delivery' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'sslcommerz', label: 'SSLCommerz (Card / MFS)' },
  { value: 'rocket', label: 'Rocket' },
  { value: 'upay', label: 'Upay' },
  { value: 'bank', label: 'Bank Transfer' },
];

/** Every payment status an order can carry (the edit form offers all of them) */
const PAYMENT_STATUSES = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partly paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

/** The ones the bulk endpoint accepts */
const BULK_PAYMENT_STATUSES = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'refunded', label: 'Refunded' },
];

const SOURCES = [
  { id: 'all', label: 'All Sources', color: 'var(--primary-ink, var(--primary))' },
  { id: 'web', label: 'Website', color: 'var(--ds-info)' },
  { id: 'pos', label: 'POS', color: 'var(--ds-gray-600)' },
  { id: 'landing', label: 'Landing Pages', color: 'var(--ds-violet)' },
];

const ZONES = [
  { value: 'Inside Dhaka', label: 'Inside Dhaka' },
  { value: 'Dhaka Sub Area', label: 'Dhaka Suburbs' },
  { value: 'Outside Dhaka', label: 'Outside Dhaka' },
];

/** Couriers the dispatch endpoints know how to build a consignment id for */
const COURIERS = [
  { value: 'steadfast', label: 'Steadfast' },
  { value: 'pathao', label: 'Pathao' },
  { value: 'redx', label: 'RedX' },
  { value: 'carrybee', label: 'Carrybee' },
  { value: 'paperfly', label: 'Paperfly' },
  { value: 'manual', label: 'In-House Delivery' },
];
/** v3.11 — couriers booked straight through their API (the server has the same list) */
const API_COURIER_KEYS = ['steadfast', 'pathao', 'redx', 'carrybee'];
const courierLabel = (key?: string | null) => COURIERS.find((item) => item.value === key)?.label || String(key || '');

/** Same mapping the server uses, so a dispatched row can link straight to tracking */
const trackingUrl = (courier?: string | null, consignment?: string | null, trackingCode?: string | null): string => {
  if (!courier || !consignment) return '';
  switch (courier) {
    case 'steadfast':
      // Steadfast's public tracking page is keyed by the tracking code
      return `https://steadfast.com.bd/t/${trackingCode || consignment}`;
    case 'pathao':
      return `https://merchant.pathao.com/tracking?consignment_id=${consignment}`;
    case 'redx':
      return `https://redx.com.bd/track-parcel/?trackingId=${trackingCode || consignment}`;
    case 'paperfly':
      return `https://paperfly.com.bd/track?ref=${consignment}`;
    default:
      return '';
  }
};

/** Order times are always shown in the shop's own time (Bangladesh), whatever the computer's clock says */
const SHOP_TIME_ZONE = 'Asia/Dhaka';
const formatDate = (value?: string | null) => {
  if (!value) return '—';
  // A bare YYYY-MM-DD (a date filter) is a calendar day, not a moment
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: SHOP_TIME_ZONE });
};

const formatTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: SHOP_TIME_ZONE });
};

/** A select's options, plus the current value when it is not one of them (so saving never changes it silently) */
const withCurrent = (options: Array<{ value: string; label: string }>, current?: string | null, label?: string) =>
  current && !options.some((option) => option.value === current)
    ? [...options, { value: current, label: label || current }]
    : options;

type SortField = 'orderNumber' | 'total' | 'createdAt';

/**
 * A select sized and tinted like BulkAction, for the choices that belong to a
 * bulk operation (which status, which courier) rather than to the page filters.
 * `placeholder` turns it into a fire-and-reset picker: choosing an entry runs
 * the action and the control falls back to its label.
 */
const BarSelect: React.FC<{
  value: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}> = ({ value, label, options, onChange, placeholder, disabled }) => (
  <span className="relative inline-flex shrink-0">
    <select
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="appearance-none font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        height: 32,
        padding: '0 26px 0 10px',
        border: 'none',
        borderRadius: 'var(--ds-r-sm)',
        background: 'color-mix(in srgb, var(--ds-text-invert) 12%, transparent)',
        color: 'var(--ds-text-invert)',
        fontSize: 'var(--a-fs-md)',
      }}
    >
      {placeholder !== undefined && (
        <option value="" style={{ color: 'var(--ds-text)', background: 'var(--ds-surface)' }}>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          style={{ color: 'var(--ds-text)', background: 'var(--ds-surface)' }}
        >
          {option.label}
        </option>
      ))}
    </select>
    <ChevronDown
      className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
      style={{ color: 'var(--ds-text-invert)' }}
    />
  </span>
);

/**
 * Orders — the shop's working queue: filter, inspect, edit, hand a whole
 * selection to a courier and print the invoice.
 *
 * Filtering and paging happen on the server (the list can run to thousands of
 * rows); sorting is applied to the page in hand so a click reorders instantly
 * without another round trip. Wide screens get a table; phones and tablets get
 * one card per order.
 */
export const AdminOrdersPage: React.FC<AdminOrdersPageProps> = ({
  currency = '৳',
  invoiceConfig,
  general,
  onCreateReturn,
  initialLandingPageId,
  settings,
}) => {
  const toasts = useToasts();
  /** undefined = closed, null = Add Order, a number = Edit that order */
  const [formOrderId, setFormOrderId] = useState<number | null | undefined>(undefined);
  const [staff, setStaff] = useState<Array<{ id: number; name: string; jobRole?: string | null; openOrders?: number }>>([]);
  const [assignedFilter, setAssignedFilter] = useState('all');
  const initialLanding = Number(initialLandingPageId) > 0 ? Number(initialLandingPageId) : null;

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [payment, setPayment] = useState('all');
  /** 'all' | '1' wholesale orders only | '0' regular orders only */
  const [wholesaleFilter, setWholesaleFilter] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState('all');
  const [shipping, setShipping] = useState('all');
  /** 'all' | 'web' | 'pos' | 'landing' (any landing page) */
  const [source, setSource] = useState(initialLanding ? 'landing' : 'all');
  /** One landing page's orders only */
  const [landingId, setLandingId] = useState<number | null>(initialLanding);
  const [landingPages, setLandingPages] = useState<Array<{ id: number; title: string }> | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  // 20 rows per page (the owner's preference); 10/50/100 remain in the picker
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<{ field: SortField; dir: 'asc' | 'desc' }>({
    field: 'createdAt',
    dir: 'desc',
  });

  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [courierFor, setCourierFor] = useState<any | null>(null);
  const [courierDraft, setCourierDraft] = useState({
    courier: 'steadfast',
    consignmentId: '',
    note: '',
    codAmount: '',
    /** Pathao only; all optional — Pathao reads the location from the address */
    cityId: '',
    zoneId: '',
    areaId: '',
    /** v3.11 — RedX delivery area */
    redxAreaId: '',
    weight: '0.5',
    resend: false,
  });
  const [courierError, setCourierError] = useState('');
  // v3.11 — RedX areas and Carrybee locations for the dispatch window
  const [redxAreas, setRedxAreas] = useState<Array<{ id: number; name: string; district?: string }>>([]);
  const [redxAreaQuery, setRedxAreaQuery] = useState('');
  const [carrybeeLists, setCarrybeeLists] = useState<{ cities: any[]; zones: any[]; areas: any[] }>({ cities: [], zones: [], areas: [] });
  const [pathaoLists, setPathaoLists] = useState<{ cities: any[]; zones: any[]; areas: any[] }>({
    cities: [],
    zones: [],
    areas: [],
  });
  const [syncingCourier, setSyncingCourier] = useState(false);
  const [bulkCourier, setBulkCourier] = useState('steadfast');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState<any | null>(null);
  const [invoiceSize, setInvoiceSize] = useState<InvoiceSize>((invoiceConfig?.defaultSize as InvoiceSize) || 'a4');
  // Manual "send money" options print their own name, never the gw-… id
  registerPaymentNames(general?.paymentMethods);
  const paymentChoices = useMemo(
    () => [
      ...PAYMENT_METHODS,
      ...((general?.paymentMethods || []) as Array<{ id: string; name: string }>)
        .filter((method) => method?.id && method.id !== 'cod' && !PAYMENT_METHODS.some((item) => item.value === method.id))
        .map((method) => ({ value: method.id, label: method.name || 'Manual payment' })),
      { value: 'cash', label: 'Cash (POS)' },
    ],
    [general]
  );
  // Delivery-record pills for the visible rows (cached data only)
  const fraudSummaries = useFraudSummary(rows.map((row) => row.customerPhone));
  /** Bulk invoice printing: the selected orders, drawn off-screen then printed one per page */
  const [bulkInvoices, setBulkInvoices] = useState<Array<{ order: any; items: any[] }> | null>(null);
  const bulkPaperRefs = useRef<Array<HTMLDivElement | null>>([]);

  // The shell can ask for one landing page's orders after the page is open
  useEffect(() => {
    if (!initialLanding) return;
    setLandingId(initialLanding);
    setSource('landing');
    setPage(1);
  }, [initialLanding]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        envelope: '1',
        status,
        search,
        payment,
        shipping,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (wholesaleFilter !== 'all') params.set('wholesale', wholesaleFilter);
      if (paymentStatus !== 'all') params.set('paymentStatus', paymentStatus);
      if (assignedFilter !== 'all') params.set('assigned', assignedFilter);
      if (landingId) params.set('landing', String(landingId));
      else if (source === 'landing') params.set('landing', 'any');
      else if (source === 'web' || source === 'pos') params.set('source', source);
      const res = await fetch(`/api/admin/orders?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(Array.isArray(data.orders) ? data.orders : []);
      setTotal(Number(data.total) || 0);
      setStatusCounts(data.statusCounts || {});
    } catch {
      setError('Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, [status, search, payment, shipping, from, to, page, pageSize, wholesaleFilter, paymentStatus, landingId, source, assignedFilter]);

  const loadStaff = useCallback(() => {
    fetch('/api/admin/orders-staff')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setStaff(Array.isArray(rows) ? rows : []))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const assignOne = async (orderId: number, staffId: string) => {
    setRows((list) =>
      list.map((row) =>
        row.id === orderId
          ? { ...row, assignedTo: staffId ? Number(staffId) : null, assignedName: staff.find((s) => String(s.id) === staffId)?.name || null }
          : row
      )
    );
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: staffId ? Number(staffId) : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not assign the order.');
      toasts.push(staffId ? `Assigned to ${data.name || 'staff'}.` : 'Assignment removed.');
      setDetail((prev: any) => (prev && prev.order?.id === orderId ? { ...prev, order: data.order } : prev));
      loadStaff();
    } catch (error: any) {
      toasts.push(error.message || 'Could not assign the order.', 'error');
      load();
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 320 : 0);
    return () => window.clearTimeout(timer);
  }, [load]);


  // Landing page names for the picker and the filter chip — only once landing orders are asked for
  useEffect(() => {
    if (landingPages !== null || !(landingId || source === 'landing')) return;
    fetch('/api/admin/landing-pages')
      .then((res) => (res.ok ? res.json() : []))
      .then((list) =>
        setLandingPages(
          (Array.isArray(list) ? list : []).map((item: any) => ({
            id: Number(item.id),
            title: String(item.title || `#${item.id}`),
          }))
        )
      )
      .catch(() => setLandingPages([]));
  }, [landingId, source, landingPages]);

  const landingName = landingId
    ? landingPages?.find((item) => item.id === landingId)?.title ||
      rows.find((row) => Number(row.landingPageId) === landingId)?.landingPageName ||
      `#${landingId}`
    : '';

  // Sorting is applied to the page in hand
  const sorted = useMemo(() => {
    const list = [...rows];
    const direction = sort.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sort.field === 'total') return (Number(a.total) - Number(b.total)) * direction;
      if (sort.field === 'createdAt') {
        return (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()) * direction;
      }
      return String(a.orderNumber || '').localeCompare(String(b.orderNumber || '')) * direction;
    });
    return list;
  }, [rows, sort]);

  const selection = useSelection(sorted);

  const pageValue = useMemo(
    () =>
      rows.reduce(
        (sum, row) =>
          ['cancelled', 'refunded'].includes(row.orderStatus) ? sum : sum + Number(row.total || 0),
        0
      ),
    [rows]
  );

  const toggleSort = (field: string) =>
    setSort((current) =>
      current.field === field
        ? { field: current.field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { field: field as SortField, dir: 'asc' }
    );

  const resetFilters = () => {
    setSearch('');
    setPayment('all');
    setWholesaleFilter('all');
    setPaymentStatus('all');
    setShipping('all');
    setStatus('all');
    setSource('all');
    setLandingId(null);
    setFrom('');
    setTo('');
    setAssignedFilter('all');
    setPage(1);
  };

  const activeSource = landingId ? 'landing' : source;

  /** Removable chips for every active filter, so a collapsed filter panel still says what is applied */
  const chips: Array<{ key: string; label: string; color: string; onRemove: () => void }> = [];
  if (status !== 'all')
    chips.push({
      key: 'status',
      label: statusMeta(status).label,
      color: statusMeta(status).color,
      onRemove: () => {
        setStatus('all');
        setPage(1);
      },
    });
  if (landingId)
    chips.push({
      key: 'landing',
      label: `Landing page: ${landingName}`,
      color: 'var(--ds-violet)',
      onRemove: () => {
        setLandingId(null);
        setPage(1);
      },
    });
  else if (source !== 'all')
    chips.push({
      key: 'source',
      label: SOURCES.find((item) => item.id === source)?.label || source,
      color: SOURCES.find((item) => item.id === source)?.color || 'var(--primary)',
      onRemove: () => {
        setSource('all');
        setPage(1);
      },
    });
  if (paymentStatus !== 'all')
    chips.push({
      key: 'paymentStatus',
      label: `Payment: ${paymentStatusLabel(paymentStatus)}`,
      color: 'var(--ds-success)',
      onRemove: () => {
        setPaymentStatus('all');
        setPage(1);
      },
    });
  if (payment !== 'all')
    chips.push({
      key: 'payment',
      label: paymentLabel(payment),
      color: isOnlineGateway(payment) ? GATEWAY_LOOK[payment].color : 'var(--ds-teal)',
      onRemove: () => {
        setPayment('all');
        setPage(1);
      },
    });
  if (wholesaleFilter !== 'all')
    chips.push({
      key: 'wholesale',
      label: wholesaleFilter === '1' ? 'Wholesale only' : 'Regular only',
      color: 'var(--ds-indigo)',
      onRemove: () => {
        setWholesaleFilter('all');
        setPage(1);
      },
    });
  if (shipping !== 'all')
    chips.push({
      key: 'zone',
      label: ZONES.find((zone) => zone.value === shipping)?.label || shipping,
      color: 'var(--ds-amber)',
      onRemove: () => {
        setShipping('all');
        setPage(1);
      },
    });
  if (assignedFilter !== 'all')
    chips.push({
      key: 'assigned',
      label:
        assignedFilter === 'none'
          ? 'Not assigned'
          : assignedFilter === 'any'
          ? 'Assigned to anyone'
          : `Assigned: ${staff.find((s) => String(s.id) === assignedFilter)?.name || 'staff'}`,
      color: 'var(--ds-teal)',
      onRemove: () => {
        setAssignedFilter('all');
        setPage(1);
      },
    });
  if (from)
    chips.push({
      key: 'from',
      label: `From ${formatDate(from)}`,
      color: 'var(--ds-info)',
      onRemove: () => {
        setFrom('');
        setPage(1);
      },
    });
  if (to)
    chips.push({
      key: 'to',
      label: `To ${formatDate(to)}`,
      color: 'var(--ds-info)',
      onRemove: () => {
        setTo('');
        setPage(1);
      },
    });

  const panelFilterCount =
    Number(Boolean(from)) +
    Number(Boolean(to)) +
    Number(wholesaleFilter !== 'all') +
    Number(payment !== 'all') +
    Number(paymentStatus !== 'all') +
    Number(shipping !== 'all') +
    Number(assignedFilter !== 'all') +
    Number(activeSource !== 'all');

  const filtersActive = Boolean(search) || status !== 'all' || panelFilterCount > 0;

  /* ---------------------------------------------------------------------- */
  /* Single order operations                                                 */
  /* ---------------------------------------------------------------------- */

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setDetail({ order: { id }, items: [] });
    try {
      const res = await fetch(`/api/admin/orders/${id}`);
      if (!res.ok) throw new Error();
      setDetail(await res.json());
    } catch {
      toasts.push('Could not load order details.', 'error');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  /** Reload the open order quietly (after a payment re-check) and the list behind it */
  const refreshDetail = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/orders/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDetail((prev: any) => (prev && prev.order?.id === id ? data : prev));
      }
    } catch {
      /* keep what is on screen */
    }
    load();
  };

  const openEdit = (id: number) => setFormOrderId(id);

  const changeStatus = async (id: number, next: string) => {
    setRows((list) => list.map((row) => (row.id === id ? { ...row, orderStatus: next } : row)));
    try {
      const res = await fetch(`/api/admin/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatus: next }),
      });
      if (!res.ok) throw new Error();
      toasts.push('Status updated.');
    } catch {
      toasts.push('Could not update the status.', 'error');
      load();
    }
  };

  const defaultCod = (order: any) =>
    order?.paymentStatus === 'paid'
      ? '0'
      : String(Math.max(0, Math.round((Number(order?.total || 0) - Number(order?.advancePaid || 0)) * 100) / 100));

  const openCourier = (order: any) => {
    const booked = Boolean(order?.consignmentId);
    setCourierDraft({
      courier: order?.courierService && order.courierService !== 'manual' ? order.courierService : 'steadfast',
      // An existing API booking is not re-typed; a manual one is shown for editing
      consignmentId: booked && !API_COURIER_KEYS.includes(order?.courierService) ? order.consignmentId : '',
      note: '',
      codAmount: defaultCod(order),
      cityId: '',
      zoneId: '',
      areaId: '',
      redxAreaId: '',
      weight: '0.5',
      resend: false,
    });
    setRedxAreaQuery(String(order?.thana || ''));
    setCourierError('');
    setCourierFor(order);
  };

  // v3.11 — RedX areas (loaded once, when RedX is chosen)
  useEffect(() => {
    if (!courierFor || courierDraft.courier !== 'redx' || redxAreas.length > 0) return;
    fetch('/api/admin/courier/redx/areas')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setRedxAreas(Array.isArray(rows) ? rows : []))
      .catch(() => undefined);
  }, [courierFor, courierDraft.courier, redxAreas.length]);
  const redxAreaOptions = useMemo(() => {
    const q = redxAreaQuery.trim().toLowerCase();
    const list = q ? redxAreas.filter((area) => `${area.name} ${area.district || ''}`.toLowerCase().includes(q)) : redxAreas;
    const picked = redxAreas.find((area) => String(area.id) === courierDraft.redxAreaId);
    const shown = list.slice(0, 300);
    return picked && !shown.includes(picked) ? [picked, ...shown] : shown;
  }, [redxAreas, redxAreaQuery, courierDraft.redxAreaId]);

  // v3.11 — Carrybee city → zone → area
  useEffect(() => {
    if (!courierFor || courierDraft.courier !== 'carrybee' || carrybeeLists.cities.length > 0) return;
    fetch('/api/admin/courier/carrybee/cities')
      .then((res) => (res.ok ? res.json() : []))
      .then((cities) => setCarrybeeLists((prev) => ({ ...prev, cities: Array.isArray(cities) ? cities : [] })))
      .catch(() => undefined);
  }, [courierFor, courierDraft.courier, carrybeeLists.cities.length]);
  useEffect(() => {
    if (courierDraft.courier !== 'carrybee') return;
    if (!courierDraft.cityId) return setCarrybeeLists((prev) => ({ ...prev, zones: [], areas: [] }));
    fetch(`/api/admin/courier/carrybee/zones/${courierDraft.cityId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((zones) => setCarrybeeLists((prev) => ({ ...prev, zones: Array.isArray(zones) ? zones : [], areas: [] })))
      .catch(() => undefined);
  }, [courierDraft.courier, courierDraft.cityId]);
  useEffect(() => {
    if (courierDraft.courier !== 'carrybee') return;
    if (!courierDraft.cityId || !courierDraft.zoneId) return setCarrybeeLists((prev) => ({ ...prev, areas: [] }));
    fetch(`/api/admin/courier/carrybee/areas/${courierDraft.cityId}/${courierDraft.zoneId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((areas) => setCarrybeeLists((prev) => ({ ...prev, areas: Array.isArray(areas) ? areas : [] })))
      .catch(() => undefined);
  }, [courierDraft.courier, courierDraft.cityId, courierDraft.zoneId]);

  // Pathao location lists, loaded only when Pathao is chosen
  useEffect(() => {
    if (!courierFor || courierDraft.courier !== 'pathao' || pathaoLists.cities.length > 0) return;
    fetch('/api/admin/courier/pathao/cities')
      .then((res) => (res.ok ? res.json() : []))
      .then((cities) => setPathaoLists((prev) => ({ ...prev, cities: Array.isArray(cities) ? cities : [] })))
      .catch(() => undefined);
  }, [courierFor, courierDraft.courier, pathaoLists.cities.length]);
  useEffect(() => {
    if (courierDraft.courier !== 'pathao') return;
    if (!courierDraft.cityId) return setPathaoLists((prev) => ({ ...prev, zones: [], areas: [] }));
    fetch(`/api/admin/courier/pathao/zones/${courierDraft.cityId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((zones) => setPathaoLists((prev) => ({ ...prev, zones: Array.isArray(zones) ? zones : [], areas: [] })))
      .catch(() => undefined);
  }, [courierDraft.courier, courierDraft.cityId]);
  useEffect(() => {
    if (courierDraft.courier !== 'pathao') return;
    if (!courierDraft.zoneId) return setPathaoLists((prev) => ({ ...prev, areas: [] }));
    fetch(`/api/admin/courier/pathao/areas/${courierDraft.zoneId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((areas) => setPathaoLists((prev) => ({ ...prev, areas: Array.isArray(areas) ? areas : [] })))
      .catch(() => undefined);
  }, [courierDraft.courier, courierDraft.zoneId]);

  const sendToCourier = async () => {
    if (!courierFor?.id) return;
    setSaving(true);
    setCourierError('');
    try {
      const d = courierDraft;
      const res = await fetch(`/api/admin/orders/${courierFor.id}/courier-ship`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courier: d.courier,
          consignmentId: d.consignmentId.trim() || undefined,
          note: d.note,
          codAmount: d.codAmount === '' ? undefined : Number(d.codAmount),
          resend: d.resend,
          pathao:
            d.courier === 'pathao'
              ? { cityId: d.cityId, zoneId: d.zoneId, areaId: d.areaId, weight: d.weight }
              : undefined,
          redx: d.courier === 'redx' ? { areaId: d.redxAreaId, weight: d.weight } : undefined,
          carrybee: d.courier === 'carrybee' ? { cityId: d.cityId, zoneId: d.zoneId, areaId: d.areaId, weight: d.weight } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Keep the dialog open with the courier's own message, so it can be fixed and retried
        setCourierError(data.error || 'Could not send to courier.');
        if (data.alreadySent) setCourierDraft((prev) => ({ ...prev, resend: false }));
        return;
      }
      toasts.push(data.message || 'Sent to courier.');
      setCourierFor(null);
      setDetail((prev: any) =>
        prev && prev.order?.id === courierFor.id ? { ...prev, order: data.order } : prev
      );
      load();
    } catch (error: any) {
      setCourierError(error.message || 'Could not send to courier.');
    } finally {
      setSaving(false);
    }
  };

  /** Ask Steadfast / Pathao for the latest parcel status of every open booking */
  const refreshCourierStatuses = async () => {
    setSyncingCourier(true);
    try {
      const res = await fetch('/api/admin/courier/sync-all', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not refresh.');
      const failed = Array.isArray(data.failed) ? data.failed.length : 0;
      toasts.push(
        data.checked === 0
          ? 'No open courier parcels to check.'
          : `Checked ${data.checked} parcel(s): ${data.updated} updated${failed ? `, ${failed} could not be checked` : ''}.`,
        failed ? 'warning' : 'success'
      );
      load();
    } catch (error: any) {
      toasts.push(error.message, 'error');
    } finally {
      setSyncingCourier(false);
    }
  };

  const syncOneCourier = async (orderId: number) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/courier-sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not refresh.');
      toasts.push(`Courier status: ${String(data.courierStatus || '').replace(/_/g, ' ')}`);
      setDetail((prev: any) => (prev && prev.order?.id === orderId ? { ...prev, order: data.order } : prev));
      load();
    } catch (error: any) {
      toasts.push(error.message, 'error');
    }
  };

  const removeOrder = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toasts.push('Order deleted.');
      setConfirmDelete(null);
      load();
    } catch {
      toasts.push('Could not delete the order.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openInvoice = async (orderId: number) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`);
      if (!res.ok) throw new Error();
      setInvoiceOrder(await res.json());
      setInvoiceSize((invoiceConfig?.defaultSize as InvoiceSize) || 'a4');
    } catch {
      toasts.push('Could not load the invoice.', 'error');
    }
  };

  const copyNumber = (orderNumber: any) => {
    navigator.clipboard?.writeText(String(orderNumber || ''));
    toasts.push('Order number copied.', 'info');
  };

  /* ---------------------------------------------------------------------- */
  /* Bulk operations                                                         */
  /* ---------------------------------------------------------------------- */

  const runBulk = async (body: Record<string, any>, describe: (data: any) => string) => {
    if (selection.count === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selection.selected, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      toasts.push(describe(data));
      selection.clear();
      load();
    } catch (error: any) {
      toasts.push(error.message || 'Could not complete the bulk action.', 'error');
    } finally {
      setBulkBusy(false);
      setConfirmBulkDelete(false);
    }
  };

  const printSelectedInvoices = async () => {
    if (selection.count === 0) return;
    setBulkBusy(true);
    try {
      // Print in the order the rows appear on screen
      const ordered = sorted.map((row) => row.id).filter((id) => selection.selected.includes(id));
      const res = await fetch(`/api/admin/orders/invoices?ids=${ordered.join(',')}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data?.error || 'Could not load the invoices.');
      bulkPaperRefs.current = [];
      setBulkInvoices(data);
    } catch (error: any) {
      toasts.push(error.message || 'Could not print the invoices.', 'error');
      setBulkBusy(false);
    }
  };

  // Once the papers are on the page, print them together — one invoice per page
  useEffect(() => {
    if (!bulkInvoices) return;
    const timer = window.setTimeout(async () => {
      const nodes = bulkPaperRefs.current.filter(Boolean) as HTMLDivElement[];
      try {
        await printInvoices(nodes, invoiceSize, `Invoices (${nodes.length})`);
        toasts.push(`${nodes.length} invoice${nodes.length === 1 ? '' : 's'} sent to the printer.`);
      } finally {
        setBulkInvoices(null);
        setBulkBusy(false);
      }
    }, 60);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkInvoices]);

  const exportCsv = () => {
    const header = [
      'Order',
      'Customer',
      'Phone',
      'Items',
      'Total',
      'Payment',
      'Courier',
      'Status',
      'Date',
      'Payment Status',
      'Landing Page',
    ];
    const esc = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [
      header.join(','),
      ...sorted.map((row) =>
        [
          row.orderNumber,
          row.customerName,
          row.customerPhone,
          row.itemCount,
          row.total,
          paymentLabel(row.paymentMethod),
          row.courierService,
          row.orderStatus,
          formatDate(row.createdAt),
          row.paymentStatus,
          row.landingPageName || '',
        ]
          .map(esc)
          .join(',')
      ),
    ].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  /* ---------------------------------------------------------------------- */
  /* Parts shared by the table rows and the phone cards                     */
  /* ---------------------------------------------------------------------- */

  const orderNumberButton = (row: any, large = false) => (
    <button
      type="button"
      onClick={() => copyNumber(row.orderNumber)}
      className="ds-num font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
      style={{ fontSize: large ? 'var(--a-fs-lg)' : 'var(--a-fs-md)', minHeight: large ? 32 : undefined }}
      title="Copy order number"
    >
      <span className="whitespace-nowrap">{row.orderNumber || row.id}</span>
      <Copy className="w-3 h-3 opacity-40 shrink-0" />
    </button>
  );

  const courierLine = (row: any) => {
    if (!row.courierService) {
      return (
        <div className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-faint)' }}>
          <Truck className="w-3.5 h-3.5" />
          Not sent to courier
        </div>
      );
    }
    const track = trackingUrl(row.courierService, row.consignmentId, row.trackingCode);
    return (
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0" style={{ fontSize: 'var(--a-fs-sm)' }}>
        <Truck className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--ds-violet)' }} />
        <span className="font-semibold capitalize">
          {row.courierService === 'manual' ? 'In-house' : row.courierService}
        </span>
        {row.consignmentId &&
          (track ? (
            <a
              href={track}
              target="_blank"
              rel="noreferrer"
              className="ds-num inline-flex items-center gap-1 whitespace-nowrap"
              style={{ color: 'var(--primary-ink, var(--primary))' }}
            >
              {row.consignmentId}
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <span className="ds-num whitespace-nowrap" style={{ color: 'var(--a-text-muted)' }}>
              {row.consignmentId}
            </span>
          ))}
        {row.courierStatus && API_COURIER_KEYS.includes(row.courierService) && (
          <span
            className="capitalize font-semibold whitespace-nowrap"
            style={{
              padding: '0 6px',
              borderRadius: 'var(--ds-r-full)',
              background: 'var(--ds-violet-soft)',
              color: 'var(--ds-violet)',
              fontSize: 'var(--ds-fs-xs)',
            }}
          >
            {String(row.courierStatus).replace(/_/g, ' ')}
          </span>
        )}
      </div>
    );
  };

  /** Who handles the order — a compact picker under the customer */
  const assignPicker = (row: any) => (
    <label
      className="mt-1 inline-flex items-center gap-1 max-w-full cursor-pointer"
      title={row.assignedName ? `Handled by ${row.assignedName}` : 'Assign to a staff member'}
      style={{
        height: 24,
        padding: '0 4px 0 7px',
        borderRadius: 'var(--ds-r-full)',
        background: row.assignedTo ? mix('var(--ds-teal)', 0.12) : 'var(--a-surface-2)',
        color: row.assignedTo ? 'var(--ds-teal)' : 'var(--a-text-muted)',
        border: `1px solid ${row.assignedTo ? mix('var(--ds-teal)', 0.3) : 'var(--a-border)'}`,
        fontSize: 'var(--a-fs-xs)',
      }}
    >
      <UserCheck className="w-3 h-3 shrink-0" />
      <select
        aria-label="Assign to staff"
        value={row.assignedTo ? String(row.assignedTo) : ''}
        onChange={(event) => assignOne(row.id, event.target.value)}
        className="appearance-none bg-transparent font-semibold cursor-pointer truncate outline-none"
        style={{ maxWidth: 130, color: 'inherit' }}
      >
        <option value="">Assign…</option>
        {row.assignedTo && !staff.some((s) => s.id === row.assignedTo) && (
          <option value={String(row.assignedTo)}>{row.assignedName || 'Staff'}</option>
        )}
        {staff.map((s) => (
          <option key={s.id} value={String(s.id)}>
            {s.name}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 shrink-0 opacity-70" />
    </label>
  );

  const statusSelectFor = (row: any) => (
    <StatusSelect value={row.orderStatus} options={ORDER_STATUSES} onChange={(next) => changeStatus(row.id, next)} />
  );

  const emptyNode = (
    <EmptyState
      title={filtersActive ? 'No orders match these filters' : 'No orders yet'}
      description={
        filtersActive ? 'Try a different status, date range or search.' : 'New orders will appear here as they come in.'
      }
      icon={ShoppingCart}
      action={
        filtersActive ? (
          <Button icon={RotateCcw} onClick={resetFilters}>
            Reset Filters
          </Button>
        ) : undefined
      }
    />
  );

  const columnCount = 8;
  const detailOrder = detail?.order;
  const detailOnline = isOnlineGateway(detailOrder?.paymentMethod);

  return (
    <div>
      {toasts.node}

      <PageHeader
        title="Orders"
        subtitle="Every order in one place — filter, update status, hand over to couriers and print invoices"
        icon={ShoppingCart}
        actions={
          <>
            <Button variant="primary" icon={Plus} onClick={() => setFormOrderId(null)}>
              Add Order
            </Button>
            <Button icon={Truck} onClick={refreshCourierStatuses} loading={syncingCourier}>
              <span className="hidden sm:inline">Refresh Courier Status</span>
              <span className="sm:hidden">Courier</span>
            </Button>
            <Button icon={Download} onClick={exportCsv}>
              Export
            </Button>
            <Button icon={RefreshCw} onClick={load} loading={loading}>
              Refresh
            </Button>
          </>
        }
      />

      {/* Status summary — tap a tile to filter */}
      <div className="mb-3">
        <StatusBoard
          counts={statusCounts}
          active={status}
          loading={loading && Object.keys(statusCounts).length === 0}
          onChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
        />
      </div>

      {/* Filters — collapsible on phones */}
      <Card className="mb-3" padded={false}>
        <div className="p-3 flex flex-col sm:flex-row gap-2.5">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search by order no., name, phone or consignment"
            className="flex-1 min-w-0"
          />
          <div className="flex items-center gap-2">
            <Button
              icon={SlidersHorizontal}
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              className="lg:hidden flex-1 sm:flex-none"
            >
              Filters
              {panelFilterCount > 0 && (
                <span
                  className="ds-num inline-flex items-center justify-center font-bold"
                  style={{
                    minWidth: 20,
                    height: 20,
                    padding: '0 5px',
                    borderRadius: 999,
                    background: 'var(--primary)',
                    color: '#fff',
                    fontSize: 'var(--ds-fs-xs)',
                  }}
                >
                  {panelFilterCount}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              icon={RotateCcw}
              onClick={resetFilters}
              disabled={!filtersActive}
              className="flex-1 sm:flex-none"
            >
              Reset
            </Button>
          </div>
        </div>

        <div
          className={`${filtersOpen ? 'block' : 'hidden'} lg:block px-3 pb-3 pt-3 border-t space-y-3`}
          style={{ borderColor: 'var(--a-border-soft)' }}
        >
          <div className="flex flex-col md:flex-row md:items-center gap-2 min-w-0">
            <span className="a-label shrink-0" style={{ marginBottom: 0 }}>
              Source
            </span>
            <div className="min-w-0 flex-1">
              <FilterPills
                active={activeSource}
                onChange={(next) => {
                  setLandingId(null);
                  setSource(next);
                  setPage(1);
                }}
                pills={SOURCES.map((item) => ({ id: item.id, label: item.label, color: item.color }))}
              />
            </div>
            {activeSource === 'landing' && (
              <Select
                value={landingId ? String(landingId) : 'any'}
                onChange={(value) => {
                  if (value === 'any') {
                    setLandingId(null);
                    setSource('landing');
                  } else setLandingId(Number(value));
                  setPage(1);
                }}
                className="md:w-64 shrink-0"
                options={withCurrent(
                  [
                    { value: 'any', label: 'All landing pages' },
                    ...(landingPages || []).map((item) => ({ value: String(item.id), label: item.title })),
                  ],
                  landingId ? String(landingId) : null,
                  landingName
                )}
              />
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
            <Field label="Start Date">
              <input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
                className="a-field ds-num"
              />
            </Field>
            <Field label="End Date">
              <input
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
                className="a-field ds-num"
              />
            </Field>
            <Field label="Payment Status">
              <Select
                value={paymentStatus}
                onChange={(value) => {
                  setPaymentStatus(value);
                  setPage(1);
                }}
                options={[{ value: 'all', label: 'All' }, ...PAYMENT_STATUSES]}
              />
            </Field>
            <Field label="Payment Method">
              <Select
                value={payment}
                onChange={(value) => {
                  setPayment(value);
                  setPage(1);
                }}
                options={[{ value: 'all', label: 'All Methods' }, ...paymentChoices]}
              />
            </Field>
            <Field label="Customer Type">
              <Select
                value={wholesaleFilter}
                onChange={(value) => {
                  setWholesaleFilter(value);
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Orders' },
                  { value: '1', label: 'Wholesale Only' },
                  { value: '0', label: 'Regular Only' },
                ]}
              />
            </Field>
            <Field label="Assigned To">
              <Select
                value={assignedFilter}
                onChange={(value) => {
                  setAssignedFilter(value);
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'Everyone' },
                  { value: 'none', label: 'Not assigned' },
                  { value: 'any', label: 'Assigned (anyone)' },
                  ...staff.map((s) => ({ value: String(s.id), label: s.name })),
                ]}
              />
            </Field>
            <Field label="Delivery Zone">
              <Select
                value={shipping}
                onChange={(value) => {
                  setShipping(value);
                  setPage(1);
                }}
                options={[{ value: 'all', label: 'All Zones' }, ...ZONES]}
              />
            </Field>
          </div>
        </div>

        {chips.length > 0 && (
          <div
            className="px-3 py-2.5 border-t flex flex-wrap items-center gap-1.5"
            style={{ borderColor: 'var(--a-border-soft)' }}
          >
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove filter: ${chip.label}`}
                className="inline-flex items-center gap-1.5 font-semibold cursor-pointer min-w-0 max-w-full"
                style={{
                  height: 32,
                  padding: '0 6px 0 12px',
                  borderRadius: 'var(--ds-r-full)',
                  background: mix(chip.color, 0.1),
                  color: chip.color,
                  border: `1px solid ${mix(chip.color, 0.25)}`,
                  fontSize: 'var(--a-fs-sm)',
                }}
              >
                <span className="truncate">{chip.label}</span>
                <span
                  className="inline-flex items-center justify-center shrink-0"
                  style={{ width: 20, height: 20, borderRadius: 999, background: mix(chip.color, 0.16) }}
                >
                  <X className="w-3 h-3" />
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* List — a table whenever the list itself has room for one, cards on
          phones. v3.10: decided by the width of the list (container query), not
          the browser window, so zooming to 110–125% or opening the side menu
          keeps the table instead of switching to two cards per row. */}
      <div className="a-card overflow-hidden @container">
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b"
          style={{ borderColor: 'var(--a-border)', background: 'var(--a-surface-2)' }}
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
            <span className="@3xl:hidden inline-flex items-center justify-center" style={{ minWidth: 36, minHeight: 36 }}>
              <Checkbox
                checked={selection.allSelected}
                indeterminate={selection.someSelected}
                onChange={selection.toggleAll}
                label="Select all on this page"
              />
            </span>
            <span className="font-semibold whitespace-nowrap" style={{ fontSize: 'var(--a-fs-md)' }}>
              {selection.count > 0 ? (
                <>
                  <span className="ds-num">{selection.count}</span> selected
                </>
              ) : (
                <>
                  <span className="ds-num">{total}</span> order{total === 1 ? '' : 's'}
                </>
              )}
            </span>
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap"
              style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
              title="Value of the orders on this page, without cancelled or refunded ones"
            >
              <Wallet className="w-3.5 h-3.5" />
              This page <Money value={pageValue} currency={currency} bold />
            </span>
          </div>
          <Select
            value={`${sort.field}:${sort.dir}`}
            onChange={(value) => {
              const [field, dir] = value.split(':');
              setSort({ field: field as SortField, dir: dir as 'asc' | 'desc' });
            }}
            className="@3xl:hidden w-44"
            options={[
              { value: 'createdAt:desc', label: 'Newest first' },
              { value: 'createdAt:asc', label: 'Oldest first' },
              { value: 'total:desc', label: 'Total: high–low' },
              { value: 'total:asc', label: 'Total: low–high' },
              { value: 'orderNumber:asc', label: 'Order no. A–Z' },
              { value: 'orderNumber:desc', label: 'Order no. Z–A' },
            ]}
          />
        </div>

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            {/* Table */}
            <div className="hidden @3xl:block overflow-x-auto">
              <table className="orders-table" style={{ '--ds-td-x': '9px', '--ds-td-y': '9px' } as React.CSSProperties}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <Checkbox
                        checked={selection.allSelected}
                        indeterminate={selection.someSelected}
                        onChange={selection.toggleAll}
                        label="Select all"
                      />
                    </th>
                    <SortableTh label="Order" field="orderNumber" sort={sort} onSort={toggleSort} />
                    <th>Customer</th>
                    <th className="hidden @7xl:table-cell">Items</th>
                    <SortableTh label="Total" field="total" sort={sort} onSort={toggleSort} align="right" />
                    <th className="hidden @5xl:table-cell">Payment</th>
                    <th>Status &amp; Courier</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <LoadingRows rows={Math.min(pageSize, 10)} cols={columnCount - 2} />
                  ) : sorted.length === 0 ? (
                    <tr>
                      <td colSpan={columnCount} style={{ padding: 0 }}>
                        {emptyNode}
                      </td>
                    </tr>
                  ) : (
                    sorted.map((row) => {
                      const picked = selection.isSelected(row.id);
                      const meta = statusMeta(row.orderStatus);
                      return (
                        <tr key={row.id} data-selected={picked || undefined}>
                          <td style={{ boxShadow: `inset 3px 0 0 ${meta.color}`, width: 36 }}>
                            <Checkbox
                              checked={picked}
                              onChange={() => selection.toggle(row.id)}
                              label={`Select ${row.orderNumber || row.id}`}
                            />
                          </td>

                          {/* Only as wide as its own text */}
                          <td style={{ width: '1%', whiteSpace: 'nowrap' }}>
                            {orderNumberButton(row)}
                            <div
                              className="ds-num flex items-center gap-1 whitespace-nowrap"
                              style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                            >
                              <CalendarDays className="w-3 h-3" />
                              {formatDate(row.createdAt)} · {formatTime(row.createdAt)}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {assignPicker(row)}
                              <OrderSourceBadges order={row} className="mt-1" />
                            </div>
                          </td>

                          {/* Takes whatever room is left, and shortens its text when there is little */}
                          <td style={{ width: '100%', minWidth: 170, maxWidth: 0 }}>
                            <button
                              type="button"
                              onClick={() => openDetail(row.id)}
                              className="text-left cursor-pointer block w-full min-w-0"
                              style={{ color: 'inherit' }}
                            >
                              <span className="block font-semibold truncate">{row.customerName}</span>
                              <span
                                className="flex items-center gap-1.5 ds-num"
                                style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                              >
                                <span className="whitespace-nowrap">{row.customerPhone}</span>
                                <FraudPill phone={row.customerPhone} summaries={fraudSummaries} />
                              </span>
                              {row.shippingZone && (
                                <span
                                  className="flex items-center gap-1 min-w-0"
                                  style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}
                                  title={`${row.district ? `${row.thana ? `${row.thana}, ` : ''}${row.district} · ` : ''}${row.shippingZone}`}
                                >
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  <span className="truncate">
                                    {row.district ? `${row.thana ? `${row.thana}, ` : ''}${row.district} · ` : ''}
                                    {row.shippingZone}
                                  </span>
                                </span>
                              )}
                            </button>
                          </td>

                          <td className="hidden @7xl:table-cell" style={{ width: '1%' }}>
                            <ItemThumbs thumbs={row.itemThumbs} count={row.itemCount} size={30} />
                          </td>

                          <td style={{ textAlign: 'right', width: '1%', whiteSpace: 'nowrap' }}>
                            <div className="whitespace-nowrap" style={{ fontSize: 'var(--a-fs-md)' }}>
                              <Money value={row.total} currency={currency} bold />
                            </div>
                            <div
                              className="@7xl:hidden whitespace-nowrap"
                              style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                            >
                              <span className="ds-num">{row.itemCount || 0}</span> {Number(row.itemCount) === 1 ? 'item' : 'items'}
                            </div>
                            {/* Narrow list: the payment sits under the total instead of in its own column */}
                            <div className="@5xl:hidden mt-1 flex flex-col items-end gap-1">
                              <PaymentMethodBadge method={row.paymentMethod} />
                              <PaymentStatusPill status={row.paymentStatus} />
                            </div>
                          </td>

                          <td className="hidden @5xl:table-cell" style={{ width: '1%', whiteSpace: 'nowrap' }}>
                            <div className="flex flex-col items-start gap-1">
                              <PaymentMethodBadge method={row.paymentMethod} />
                              <PaymentStatusPill status={row.paymentStatus} />
                            </div>
                          </td>

                          <td style={{ width: '1%' }}>
                            <div className="space-y-1" style={{ width: 168 }}>
                              {statusSelectFor(row)}
                              {courierLine(row)}
                            </div>
                          </td>

                          <td style={{ width: '1%' }}>
                            <div className="grid grid-cols-3 gap-1.5 w-max ml-auto @min-[1060px]:flex @min-[1060px]:items-center">
                              <IconButton icon={Eye} tone="primary" label="View Details" onClick={() => openDetail(row.id)} />
                              <IconButton icon={Printer} label="Print Invoice" onClick={() => openInvoice(row.id)} />
                              <IconButton icon={Send} tone="success" label="Send to Courier" onClick={() => openCourier(row)} />
                              <IconButton icon={Edit2} label="Edit" onClick={() => openEdit(row.id)} />
                              <IconButton icon={Trash2} tone="danger" label="Delete Order" onClick={() => setConfirmDelete(row)} />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Phone / tablet cards */}
            <div
              className="@3xl:hidden grid grid-cols-1 @xl:grid-cols-2 gap-2 p-2"
              style={{ background: 'var(--a-surface-2)' }}
            >
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="a-card p-3.5 space-y-3">
                    <div className="flex justify-between gap-3">
                      <span className="ds-skeleton block h-5 w-40" />
                      <span className="ds-skeleton block h-5 w-16" />
                    </div>
                    <span className="ds-skeleton block h-12 w-full" />
                    <span className="ds-skeleton block h-8 w-full" />
                  </div>
                ))
              ) : sorted.length === 0 ? (
                <div className="col-span-full a-card">{emptyNode}</div>
              ) : (
                sorted.map((row) => {
                  const picked = selection.isSelected(row.id);
                  const meta = statusMeta(row.orderStatus);
                  return (
                    <article
                      key={row.id}
                      className="a-card flex flex-col min-w-0 overflow-hidden"
                      style={{
                        borderLeft: `4px solid ${meta.color}`,
                        ...(picked ? { borderColor: 'var(--primary)', background: mix('var(--primary)', 0.05) } : {}),
                      }}
                    >
                      <div className="p-3 pb-2.5 flex items-start gap-2">
                        <span className="inline-flex items-center justify-center shrink-0" style={{ width: 32, height: 32 }}>
                          <Checkbox
                            checked={picked}
                            onChange={() => selection.toggle(row.id)}
                            label={`Select ${row.orderNumber || row.id}`}
                          />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <div className="min-w-0">
                              {orderNumberButton(row, true)}
                              <div
                                className="ds-num whitespace-nowrap"
                                style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                              >
                                {formatDate(row.createdAt)} · {formatTime(row.createdAt)}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div style={{ fontSize: 'var(--a-fs-lg)' }}>
                                <Money value={row.total} currency={currency} bold />
                              </div>
                            </div>
                          </div>
                          <OrderSourceBadges order={row} className="mt-1.5" />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openDetail(row.id)}
                        className="mx-3 p-2.5 flex items-center gap-3 text-left cursor-pointer min-w-0"
                        style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface-2)', color: 'inherit' }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold truncate" style={{ fontSize: 'var(--a-fs-md)' }}>
                            {row.customerName}
                          </span>
                          <span
                            className="flex flex-wrap items-center gap-1.5 ds-num"
                            style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}
                          >
                            <span className="whitespace-nowrap">{row.customerPhone}</span>
                            <FraudPill phone={row.customerPhone} summaries={fraudSummaries} />
                          </span>
                          {row.shippingZone && (
                            <span
                              className="flex items-center gap-1 truncate"
                              style={{ fontSize: 'var(--a-fs-xs)', color: 'var(--a-text-muted)' }}
                            >
                              <MapPin className="w-3 h-3 shrink-0" />
                              {row.shippingZone}
                            </span>
                          )}
                        </span>
                        <ItemThumbs thumbs={row.itemThumbs} count={row.itemCount} size={30} />
                      </button>

                      <div className="px-3 pt-2">{assignPicker(row)}</div>

                      <div className="px-3 pt-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <PaymentMethodBadge method={row.paymentMethod} />
                          <PaymentStatusPill status={row.paymentStatus} />
                        </div>
                        {statusSelectFor(row)}
                      </div>

                      <div className="px-3 pt-2 pb-2.5">{courierLine(row)}</div>

                      <div
                        className="mt-auto px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 border-t"
                        style={{ borderColor: 'var(--a-border-soft)' }}
                      >
                        <Button variant="soft" icon={Eye} onClick={() => openDetail(row.id)}>
                          View
                        </Button>
                        <div className="flex items-center gap-1.5">
                          <IconButton icon={Edit2} label="Edit" onClick={() => openEdit(row.id)} />
                          <IconButton icon={Printer} label="Print Invoice" onClick={() => openInvoice(row.id)} />
                          <IconButton icon={Send} tone="success" label="Send to Courier" onClick={() => openCourier(row)} />
                          <IconButton icon={Trash2} tone="danger" label="Delete Order" onClick={() => setConfirmDelete(row)} />
                        </div>
                      </div>
                    </article>
                  );
                })
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

      {/* Bulk actions */}
      <BulkBar count={selection.count} onClear={selection.clear}>
        <BarSelect
          value=""
          label="Change Status"
          placeholder="Status"
          disabled={bulkBusy}
          options={ORDER_STATUSES}
          onChange={(next) => {
            if (!next) return;
            runBulk(
              { action: 'status', status: next },
              (data) => `Status updated for ${data.affected || 0} order(s).`
            );
          }}
        />

        <BarSelect
          value=""
          label="Change Payment Status"
          placeholder="Payment"
          disabled={bulkBusy}
          options={BULK_PAYMENT_STATUSES}
          onChange={(next) => {
            if (!next) return;
            runBulk(
              { action: 'payment', paymentStatus: next },
              (data) => `Payment status updated for ${data.affected || 0} order(s).`
            );
          }}
        />

        <BarSelect
          value=""
          label="Assign to staff"
          placeholder="Assign"
          disabled={bulkBusy}
          options={[{ value: 'none', label: 'Remove assignment' }, ...staff.map((s) => ({ value: String(s.id), label: s.name }))]}
          onChange={(next) => {
            if (!next) return;
            runBulk(
              { action: 'assign', staffId: next === 'none' ? null : Number(next) },
              (data) => (next === 'none' ? `Assignment removed from ${data.affected || 0} order(s).` : `${data.affected || 0} order(s) assigned to ${data.name || 'staff'}.`)
            );
            loadStaff();
          }}
        />

        <BarSelect
          value={bulkCourier}
          label="Select Courier"
          disabled={bulkBusy}
          options={COURIERS}
          onChange={setBulkCourier}
        />

        <BulkAction
          icon={Truck}
          disabled={bulkBusy}
          onClick={() =>
            runBulk({ action: 'courier', courier: bulkCourier }, (data) => {
              const sent = Number(data.affected || 0);
              const skipped = Number(data.skipped || 0);
              const failed: Array<{ orderNumber: string; error: string }> = Array.isArray(data.failed) ? data.failed : [];
              const parts = [`${sent} order(s) booked with ${courierLabel(bulkCourier)}`];
              if (skipped > 0) parts.push(`${skipped} skipped (already sent or cancelled)`);
              if (failed.length > 0) {
                parts.push(
                  `${failed.length} failed — ${failed
                    .slice(0, 3)
                    .map((item) => `${item.orderNumber}: ${item.error}`)
                    .join('; ')}${failed.length > 3 ? '…' : ''}`
                );
              }
              return `${parts.join(', ')}.`;
            })
          }
        >
          Send to Courier
        </BulkAction>

        <BulkAction icon={Printer} disabled={bulkBusy} onClick={printSelectedInvoices}>
          Print Invoices
        </BulkAction>

        <BulkAction
          icon={Trash2}
          tone="danger"
          disabled={bulkBusy}
          onClick={() => setConfirmBulkDelete(true)}
        >
          Delete
        </BulkAction>
      </BulkBar>

      {/* ------------------------------------------------------------------ */}
      {/* Order detail                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detailOrder?.orderNumber ? `Order ${detailOrder.orderNumber}` : 'Order'}
        subtitle={detailOrder?.customerName}
        width="max-w-2xl"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button icon={Printer} onClick={() => detailOrder?.id && openInvoice(detailOrder.id)}>
              Invoice
            </Button>
            <Button icon={Send} onClick={() => detailOrder && openCourier(detailOrder)}>
              Send to Courier
            </Button>
            {onCreateReturn && detailOrder?.orderStatus !== 'returned' && (
              <Button
                icon={RotateCcw}
                onClick={() => {
                  if (!detailOrder) return;
                  onCreateReturn(detailOrder.orderNumber);
                  setDetail(null);
                }}
              >
                Return Items
              </Button>
            )}
            <Button variant="primary" icon={Edit2} onClick={() => detailOrder?.id && openEdit(detailOrder.id)}>
              Edit
            </Button>
          </div>
        }
      >
        {detailLoading || !detailOrder?.orderNumber ? (
          <div className="space-y-2.5">
            {Array.from({ length: 7 }).map((_, index) => (
              <span key={index} className="ds-skeleton block h-4" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* At a glance */}
            <div
              className="p-4 flex flex-wrap items-center justify-between gap-3"
              style={{
                borderRadius: 'var(--ds-r-lg)',
                background: mix(statusMeta(detailOrder.orderStatus).color, 0.08),
                border: `1px solid ${mix(statusMeta(detailOrder.orderStatus).color, 0.25)}`,
              }}
            >
              <div className="min-w-0">
                <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Grand Total</div>
                <div className="font-bold leading-tight" style={{ fontSize: 'var(--ds-fs-2xl)' }}>
                  <Money value={detailOrder.total} currency={currency} bold />
                </div>
                <div className="ds-num" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                  {formatDate(detailOrder.createdAt)} · {formatTime(detailOrder.createdAt)}
                </div>
              </div>
              <div className="flex flex-col items-start sm:items-end gap-1.5">
                <StatusSelect
                  value={detailOrder.orderStatus}
                  options={ORDER_STATUSES}
                  onChange={(next) => {
                    changeStatus(detailOrder.id, next);
                    setDetail((prev: any) => (prev ? { ...prev, order: { ...prev.order, orderStatus: next } } : prev));
                  }}
                />
                <OrderSourceBadges order={detailOrder} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card
                className="!p-3.5"
                accent={detailOnline ? GATEWAY_LOOK[detailOrder.paymentMethod as 'bkash'].color : 'var(--ds-indigo)'}
              >
                <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Payment</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <PaymentMethodBadge method={detailOrder.paymentMethod} full />
                  <PaymentStatusPill status={detailOrder.paymentStatus} />
                </div>
                {(detailOrder.transactionId || detailOrder.senderNumber) && (
                  <div className="mt-2 space-y-0.5" style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-soft)' }}>
                    {detailOrder.transactionId && (
                      <div className="break-all">
                        Txn ID: <span className="ds-num font-semibold">{detailOrder.transactionId}</span>
                      </div>
                    )}
                    {detailOrder.senderNumber && (
                      <div>
                        Sender: <span className="ds-num font-semibold">{detailOrder.senderNumber}</span>
                      </div>
                    )}
                  </div>
                )}
              </Card>
              <Card className="!p-3.5" accent="var(--ds-violet)">
                <div className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>Courier</span>
                  {API_COURIER_KEYS.includes(detailOrder.courierService) && detailOrder.consignmentId && (
                    <button
                      type="button"
                      onClick={() => syncOneCourier(detailOrder.id)}
                      className="inline-flex items-center gap-1 cursor-pointer font-semibold"
                      style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--primary-ink, var(--primary))', minHeight: 28 }}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Check status
                    </button>
                  )}
                </div>
                <div className="mt-1.5">{courierLine(detailOrder)}</div>
              </Card>
            </div>

            {/* Online payment attempts — SSLCommerz / bKash / Nagad only */}
            {detailOnline && (
              <OnlinePaymentPanel
                orderId={detailOrder.id}
                gateway={detailOrder.paymentMethod}
                currency={currency}
                notify={toasts.push}
                onVerified={() => refreshDetail(detailOrder.id)}
              />
            )}

            {/* Delivery record of this number — checked automatically */}
            {detailOrder.customerPhone && (
              <FraudPanel phone={detailOrder.customerPhone} orderTotal={Number(detailOrder.total) || 0} />
            )}

            <Card>
              <div className="font-bold mb-1 flex items-center gap-2" style={{ fontSize: 'var(--a-fs-md)' }}>
                <CreditCard className="w-4 h-4" style={{ color: 'var(--primary-ink, var(--primary))' }} />
                Customer & Delivery
              </div>
              <DetailRow label="Name">{detailOrder.customerName || '—'}</DetailRow>
              <DetailRow label="Phone">
                <span className="ds-num">{detailOrder.customerPhone || '—'}</span>
              </DetailRow>
              <DetailRow label="Address">{detailOrder.customerAddress || '—'}</DetailRow>
              {(detailOrder.district || detailOrder.thana) && (
                <DetailRow label="District / Thana">{[detailOrder.thana, detailOrder.district].filter(Boolean).join(', ')}</DetailRow>
              )}
              <DetailRow label="Delivery Zone">{detailOrder.shippingZone || '—'}</DetailRow>
              <DetailRow label="Handled by">{assignPicker(detailOrder)}</DetailRow>
              {detailOrder.createdBy && <DetailRow label="Added by">{detailOrder.createdBy} (manual order)</DetailRow>}
              <DetailRow label="Device IP">
                <span className="ds-num">{detailOrder.ipAddress || '—'}</span>
              </DetailRow>
              {(detailOrder.landingPageId || detailOrder.landingPageName) && (
                <DetailRow label="Landing Page">
                  <span style={{ color: 'var(--ds-violet)' }}>
                    {detailOrder.landingPageName || `#${detailOrder.landingPageId}`}
                  </span>
                </DetailRow>
              )}
              {detailOrder.isWholesale && (
                <DetailRow label="Order Type">
                  <span style={{ color: 'var(--ds-indigo)' }}>Wholesale</span>
                </DetailRow>
              )}
              {detailOrder.consignmentId && (
                <DetailRow label="Consignment">
                  {trackingUrl(detailOrder.courierService, detailOrder.consignmentId, detailOrder.trackingCode) ? (
                    <a
                      href={trackingUrl(detailOrder.courierService, detailOrder.consignmentId, detailOrder.trackingCode)}
                      target="_blank"
                      rel="noreferrer"
                      className="ds-num inline-flex items-center gap-1"
                      style={{ color: 'var(--primary-ink, var(--primary))' }}
                    >
                      {detailOrder.consignmentId}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="ds-num">{detailOrder.consignmentId}</span>
                  )}
                </DetailRow>
              )}
            </Card>

            <Card padded={false}>
              <div
                className="px-4 py-3 font-bold flex items-center gap-2"
                style={{ borderBottom: '1px solid var(--a-border)', fontSize: 'var(--a-fs-md)' }}
              >
                <Package className="w-4 h-4" style={{ color: 'var(--primary-ink, var(--primary))' }} />
                Products
                <span
                  className="ds-num rounded-full px-1.5 font-bold"
                  style={{ fontSize: 'var(--ds-fs-2xs)', background: mix('var(--primary)', 0.12), color: 'var(--primary-ink, var(--primary))' }}
                >
                  {(detail.items || []).length}
                </span>
              </div>

              {(detail.items || []).length === 0 ? (
                <p className="p-4" style={{ fontSize: 'var(--a-fs-md)', color: 'var(--a-text-muted)' }}>
                  This order has no products.
                </p>
              ) : (
                (detail.items || []).map((item: any) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 px-4 py-3"
                    style={{ borderBottom: '1px solid var(--a-border-soft)' }}
                  >
                    {/* What the customer bought, as a picture — opens the product on the site */}
                    <a
                      href={item.productSlug ? `/product/${item.productSlug}` : undefined}
                      target="_blank"
                      rel="noreferrer"
                      title="Open product on the website"
                      className="shrink-0"
                    >
                      <Thumb src={item.image} alt={item.productName} size={56} />
                    </a>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold" style={{ fontSize: 'var(--a-fs-md)' }}>
                        {item.productName}
                      </div>
                      {item.variationLabel && (
                        <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                          {item.variationLabel}
                        </div>
                      )}
                      <div style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)' }}>
                        <Money value={item.unitPrice} currency={currency} />
                        {' × '}
                        <span className="ds-num">{item.quantity}</span>
                      </div>
                    </div>
                    <span className="shrink-0">
                      <Money value={item.subtotal} currency={currency} bold />
                    </span>
                  </div>
                ))
              )}

              <div className="p-4 space-y-1.5" style={{ fontSize: 'var(--a-fs-md)' }}>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--a-text-muted)' }}>Subtotal</span>
                  <Money value={detailOrder.subtotal} currency={currency} />
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--a-text-muted)' }}>Discount</span>
                  <span>
                    −<Money value={detailOrder.discount} currency={currency} />
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--a-text-muted)' }}>Delivery Charge</span>
                  <Money value={detailOrder.shippingCharge} currency={currency} />
                </div>
                <div
                  className="flex justify-between pt-2 border-t font-bold"
                  style={{ borderColor: 'var(--a-border)', fontSize: 'var(--a-fs-lg)' }}
                >
                  <span>Grand Total</span>
                  <span style={{ color: 'var(--primary-ink, var(--primary))' }}>
                    <Money value={detailOrder.total} currency={currency} bold />
                  </span>
                </div>
                {Number(detailOrder.advancePaid) > 0 && (
                  <>
                    <div className="flex justify-between" style={{ color: 'var(--ds-success-text)' }}>
                      <span>Advance paid</span>
                      <span>
                        −<Money value={detailOrder.advancePaid} currency={currency} />
                      </span>
                    </div>
                    <div className="flex justify-between font-bold" style={{ fontSize: 'var(--a-fs-lg)' }}>
                      <span>Due (collect)</span>
                      <Money
                        value={Math.max(0, Number(detailOrder.total || 0) - Number(detailOrder.advancePaid || 0))}
                        currency={currency}
                        bold
                      />
                    </div>
                  </>
                )}
              </div>
            </Card>

            {detailOrder.notes && (
              <Card>
                <h4 className="font-bold mb-1" style={{ fontSize: 'var(--a-fs-md)' }}>
                  Notes
                </h4>
                <p
                  style={{
                    fontSize: 'var(--a-fs-md)',
                    color: 'var(--a-text-soft)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {detailOrder.notes}
                </p>
              </Card>
            )}
          </div>
        )}
      </Drawer>

      {/* ------------------------------------------------------------------ */}
      {/* Add / Edit order                                                    */}
      {/* ------------------------------------------------------------------ */}
      <OrderFormDrawer
        open={formOrderId !== undefined}
        orderId={formOrderId ?? null}
        onClose={() => setFormOrderId(undefined)}
        onSaved={(order) => {
          setFormOrderId(undefined);
          setDetail((prev: any) => (prev && order && prev.order?.id === order.id ? null : prev));
          load();
          loadStaff();
        }}
        currency={currency}
        settings={settings}
        paymentChoices={paymentChoices}
        staff={staff}
        notify={toasts.push}
      />

      {/* Courier dispatch for a single order */}
      <Modal
        open={Boolean(courierFor)}
        onClose={() => setCourierFor(null)}
        title="Send to Courier"
        subtitle={courierFor?.orderNumber ? `Order ${courierFor.orderNumber}` : undefined}
        footer={
          <>
            <Button onClick={() => setCourierFor(null)}>Cancel</Button>
            <Button variant="primary" icon={Send} onClick={sendToCourier} loading={saving}>
              {API_COURIER_KEYS.includes(courierDraft.courier) && !courierDraft.consignmentId.trim()
                ? `Book with ${courierLabel(courierDraft.courier)}`
                : 'Save Dispatch'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Courier">
            <Select
              value={courierDraft.courier}
              onChange={(value) => {
                // Location picks belong to one courier; switching starts them fresh
                setCourierDraft({ ...courierDraft, courier: value, cityId: '', zoneId: '', areaId: '', redxAreaId: '' });
                setCourierError('');
              }}
              options={COURIERS}
            />
          </Field>

          {courierFor?.consignmentId && API_COURIER_KEYS.includes(courierFor?.courierService) && (
            <div
              className="p-3 space-y-2"
              style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--ds-info-soft)', color: 'var(--ds-info-text)', fontSize: 'var(--a-fs-sm)' }}
            >
              <p>
                Already booked with <strong>{courierLabel(courierFor.courierService)}</strong>: consignment{' '}
                <strong className="ds-num">{courierFor.consignmentId}</strong>
                {courierFor.courierStatus ? ` (${String(courierFor.courierStatus).replace(/_/g, ' ')})` : ''}.
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={courierDraft.resend}
                  onChange={(event) => setCourierDraft({ ...courierDraft, resend: event.target.checked })}
                />
                Send again (only if that parcel was cancelled)
              </label>
            </div>
          )}

          {API_COURIER_KEYS.includes(courierDraft.courier) ? (
            <>
              <Field
                label={`Amount to Collect (${currency})`}
                hint={courierFor?.paymentStatus === 'paid' ? 'Order is paid, so nothing is collected.' : 'Cash the rider collects on delivery.'}
              >
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="a-field ds-num"
                  value={courierDraft.codAmount}
                  onChange={(event) => setCourierDraft({ ...courierDraft, codAmount: event.target.value })}
                />
              </Field>
              {courierDraft.courier === 'pathao' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="City" hint="Optional — Pathao can read it from the address.">
                    <Select
                      value={courierDraft.cityId}
                      onChange={(value) => setCourierDraft({ ...courierDraft, cityId: value, zoneId: '', areaId: '' })}
                      options={[
                        { value: '', label: 'Detect from address' },
                        ...pathaoLists.cities.map((item) => ({ value: String(item.id), label: item.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Zone">
                    <Select
                      value={courierDraft.zoneId}
                      onChange={(value) => setCourierDraft({ ...courierDraft, zoneId: value, areaId: '' })}
                      options={[
                        { value: '', label: courierDraft.cityId ? 'Choose zone' : '—' },
                        ...pathaoLists.zones.map((item) => ({ value: String(item.id), label: item.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Area">
                    <Select
                      value={courierDraft.areaId}
                      onChange={(value) => setCourierDraft({ ...courierDraft, areaId: value })}
                      options={[
                        { value: '', label: courierDraft.zoneId ? 'Choose area (optional)' : '—' },
                        ...pathaoLists.areas.map((item) => ({ value: String(item.id), label: item.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Parcel Weight (kg)">
                    <input
                      type="number"
                      min={0.5}
                      max={10}
                      step={0.5}
                      className="a-field ds-num"
                      value={courierDraft.weight}
                      onChange={(event) => setCourierDraft({ ...courierDraft, weight: event.target.value })}
                    />
                  </Field>
                </div>
              )}
              {/* v3.11 — RedX delivery area */}
              {courierDraft.courier === 'redx' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="RedX Delivery Area" hint="Empty = worked out from the thana / address." className="sm:col-span-2">
                    <input
                      className="a-field mb-2"
                      value={redxAreaQuery}
                      onChange={(event) => setRedxAreaQuery(event.target.value)}
                      placeholder={redxAreas.length ? `Search ${redxAreas.length} areas…` : 'Loading areas…'}
                    />
                    <Select
                      value={courierDraft.redxAreaId}
                      onChange={(value) => setCourierDraft({ ...courierDraft, redxAreaId: value })}
                      options={[
                        { value: '', label: 'Detect from address' },
                        ...redxAreaOptions.map((item) => ({ value: String(item.id), label: item.district ? `${item.name} — ${item.district}` : item.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Parcel Weight (kg)">
                    <input
                      type="number"
                      min={0.1}
                      max={30}
                      step={0.1}
                      className="a-field ds-num"
                      value={courierDraft.weight}
                      onChange={(event) => setCourierDraft({ ...courierDraft, weight: event.target.value })}
                    />
                  </Field>
                </div>
              )}

              {/* v3.11 — Carrybee city / zone / area */}
              {courierDraft.courier === 'carrybee' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="City" hint="Empty = Carrybee reads it from the address.">
                    <Select
                      value={courierDraft.cityId}
                      onChange={(value) => setCourierDraft({ ...courierDraft, cityId: value, zoneId: '', areaId: '' })}
                      options={[
                        { value: '', label: 'Detect from address' },
                        ...carrybeeLists.cities.map((item) => ({ value: String(item.id), label: item.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Zone">
                    <Select
                      value={courierDraft.zoneId}
                      onChange={(value) => setCourierDraft({ ...courierDraft, zoneId: value, areaId: '' })}
                      options={[
                        { value: '', label: courierDraft.cityId ? 'Choose zone' : '—' },
                        ...carrybeeLists.zones.map((item) => ({ value: String(item.id), label: item.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Area">
                    <Select
                      value={courierDraft.areaId}
                      onChange={(value) => setCourierDraft({ ...courierDraft, areaId: value })}
                      options={[
                        { value: '', label: courierDraft.zoneId ? 'Choose area (optional)' : '—' },
                        ...carrybeeLists.areas.map((item) => ({ value: String(item.id), label: item.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Parcel Weight (kg)">
                    <input
                      type="number"
                      min={0.1}
                      max={30}
                      step={0.1}
                      className="a-field ds-num"
                      value={courierDraft.weight}
                      onChange={(event) => setCourierDraft({ ...courierDraft, weight: event.target.value })}
                    />
                  </Field>
                </div>
              )}
              <Field
                label="Consignment ID (optional)"
                hint={`Leave empty to book the parcel with ${courierLabel(courierDraft.courier)} now. Type an ID only if you already booked it in their panel.`}
              >
                <input
                  className="a-field ds-num"
                  value={courierDraft.consignmentId}
                  onChange={(event) => setCourierDraft({ ...courierDraft, consignmentId: event.target.value })}
                  placeholder="Book automatically"
                />
              </Field>
            </>
          ) : (
            <Field
              label="Consignment ID"
              hint={
                courierDraft.courier === 'manual'
                  ? 'Optional for in-house delivery.'
                  : 'Required: book the parcel in the courier’s own panel, then paste its ID here.'
              }
            >
              <input
                className="a-field ds-num"
                value={courierDraft.consignmentId}
                onChange={(event) => setCourierDraft({ ...courierDraft, consignmentId: event.target.value })}
                placeholder="ID from the courier"
              />
            </Field>
          )}

          <Field label="Note for the Courier (Optional)">
            <textarea
              className="a-field"
              rows={2}
              value={courierDraft.note}
              onChange={(event) => setCourierDraft({ ...courierDraft, note: event.target.value })}
              placeholder="e.g. Call before delivery"
            />
          </Field>

          {courierError && (
            <p
              role="alert"
              className="p-3"
              style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--ds-danger-soft)', color: 'var(--ds-danger-text)', fontSize: 'var(--a-fs-sm)' }}
            >
              {courierError}
            </p>
          )}
        </div>
      </Modal>

      {/* Bulk invoice papers (off-screen; printed from an isolated frame) */}
      {bulkInvoices && (
        <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
          {bulkInvoices.map((entry, index) => (
            <InvoicePaper
              key={entry.order.id}
              ref={(node) => {
                bulkPaperRefs.current[index] = node;
              }}
              order={entry.order}
              items={entry.items}
              config={invoiceConfig}
              general={general}
              size={invoiceSize}
              currency={currency}
            />
          ))}
        </div>
      )}

      {/* Invoice — A4 / 80mm / 58mm */}
      {invoiceOrder && (
        <InvoiceView
          order={invoiceOrder.order}
          items={invoiceOrder.items || []}
          config={invoiceConfig}
          general={general}
          size={invoiceSize}
          onSizeChange={setInvoiceSize}
          onClose={() => setInvoiceOrder(null)}
          currency={currency}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this order?"
        message={`${
          confirmDelete?.orderNumber || 'This order'
        } will be deleted and its reserved stock returned to inventory. This can't be undone.`}
        confirmLabel="Delete"
        busy={saving}
        onConfirm={removeOrder}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete selected orders?"
        message={`${selection.count} order(s) will be deleted and their reserved stock returned to inventory. This can't be undone.`}
        confirmLabel="Delete"
        busy={bulkBusy}
        onConfirm={() =>
          runBulk({ action: 'delete' }, (data) => `${data.affected || 0} order(s) deleted.`)
        }
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );
};
